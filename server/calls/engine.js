// المكالمات: اختيار طريقة التأكيد لكل مصدر، الجدولة على الفترات، الاتصال، النتائج، والمراجعة
import { db, now as dbNow } from '../db.js';
import { getSetting } from '../services/settings.js';
import { getOrder, orderItems, orderByNumber, setOrderStatus, validateOrder, recalcOrder } from '../services/orders.js';
import { deliveryFee } from '../services/catalog.js';
import { isValidDzMobile, normPhone, localPhone } from '../services/customers.js';
import { audit, logError } from '../services/audit.js';
import { nextSlot, windowAt, localParts, fmtLocal, sortedWindows } from './time.js';
import * as dialog from './dialog.js';
import { clockNow } from './clock.js';
import { withSpeech } from './speech.js';
import { simulationProvider, n8nProvider } from './bridge.js';
import { callsBridgeReady } from '../config.js';
import { confirmAndShip, cancelOrderFull } from '../services/confirm.js';
import { sendOrderConfirmation } from '../services/stores.js';
import { httpErr } from '../services/accounts.js';

export const MODES = { whatsapp: 'رسائل واتساب فقط', call: 'مكالمة هاتفية فقط', whatsapp_call: 'واتساب + مكالمة', manual: 'تأكيد يدوي' };
export const CHANNELS = { woocommerce: 'WooCommerce', store: 'المتاجر المربوطة الأخرى', whatsapp_chat: 'محادثات واتساب', whatsapp_campaign: 'حملات واتساب (إعلانات Meta)', manual: 'طلبات يدوية', default: 'مصدر غير معروف (افتراضي)' };
export const hasCall = (m) => m === 'call' || m === 'whatsapp_call';
export const hasWa = (m) => m === 'whatsapp' || m === 'whatsapp_call';
const WAITING = ['new', 'awaiting_confirmation'];

// ───── المصدر وطريقة التأكيد ─────
export function channelFor(order) {
  if (order.source_channel) return order.source_channel;
  if (order.source === 'store') return order.store_platform === 'woocommerce' ? 'woocommerce' : 'store';
  if (order.source === 'whatsapp') return order.campaign_id ? 'whatsapp_campaign' : 'whatsapp_chat';
  if (order.source === 'manual') return 'manual';
  return 'default';
}
export function modeFor(order, s = getSetting('calls')) {
  const channel = channelFor(order);
  if (channel === 'whatsapp_campaign' && order.campaign_id) {
    const o = (s.campaign_overrides || []).find((c) => String(c.source_id) === String(order.campaign_id));
    if (o?.mode) return { channel, mode: o.mode, campaign: o.label || o.source_id };
  }
  return { channel, mode: s.modes[channel] || s.modes.default || 'whatsapp' };
}

/** بداية التأكيد لطلب يستنى (متجر، يدوي، أو واتساب في وضع مكالمة) */
export function startConfirmation(orderId, { skipWhatsapp = false } = {}) {
  const order = getOrder(orderId);
  const s = getSetting('calls');
  const { channel, mode } = modeFor(order, s);
  db.update('orders', orderId, { source_channel: channel, confirm_mode: mode });
  const out = { channel, mode, whatsapp: false, task: null };
  if (hasWa(mode) && order.wa_phone && !skipWhatsapp) { sendOrderConfirmation(getOrder(orderId)); out.whatsapp = true; }
  if (hasCall(mode)) {
    const why = blockReason(getOrder(orderId), s, { kind: 'auto' });
    if (why) audit('call.not_scheduled', { entity: 'orders', entityId: orderId, details: { reason: why } });
    else {
      const delayed = mode === 'whatsapp_call' && s.combined_strategy === 'delayed' && out.whatsapp;
      const from = delayed ? new Date(clockNow().getTime() + Number(s.delay_minutes || 60) * 60000) : clockNow();
      out.task = scheduleTask(orderId, from, { kind: 'auto', reason: delayed ? `مكالمة بعد ${s.delay_minutes} دقيقة إذا ما أكّدش في واتساب` : 'اتصال تلقائي' });
    }
  }
  audit('confirmation.start', { entity: 'orders', entityId: orderId, details: out });
  return out;
}

// ───── الجدولة ─────
const attemptsOn = (orderId, day) => db.get("SELECT COUNT(*) n FROM call_tasks WHERE order_id=? AND day=? AND kind='auto' AND status='done'", orderId, day).n;
const pendingTask = (orderId) => db.get("SELECT * FROM call_tasks WHERE order_id=? AND status IN ('scheduled','dialing') ORDER BY scheduled_for LIMIT 1", orderId);

export function scheduleTask(orderId, from, { kind = 'auto', reason, afterIndex = -1, day = null, allowNextDay = true } = {}) {
  const ex = pendingTask(orderId);
  if (ex) return ex;
  const s = getSetting('calls');
  const slot = nextSlot(from, { windows: s.windows, tz: s.timezone, afterIndex, day, allowNextDay });
  if (!slot) return null;
  const id = db.insert('call_tasks', {
    order_id: orderId, kind, scheduled_for: slot.at.toISOString(), day: slot.day, window_index: slot.windowIndex,
    attempt_no: attemptsOn(orderId, slot.day) + 1, reason: reason ?? null,
  });
  return db.get('SELECT * FROM call_tasks WHERE id=?', id);
}

export function cancelPendingCalls(orderId, reason) {
  const r = db.run("UPDATE call_tasks SET status='cancelled', reason=?, updated_at=? WHERE order_id=? AND status='scheduled'", reason, dbNow(), orderId);
  if (r.changes) audit('call.cancelled', { entity: 'orders', entityId: orderId, details: { reason, count: r.changes } });
  return r.changes;
}

/** بعد تبديل الإعدادات: نلغيو المحاولات اللي مازال ما بداتش للمصادر اللي تطفات فيها المكالمات */
export function reconcileTasks() {
  const s = getSetting('calls');
  let n = 0;
  for (const t of db.all("SELECT t.id, t.order_id FROM call_tasks t WHERE t.status='scheduled'")) {
    const o = getOrder(t.order_id);
    const why = !s.outbound_enabled ? 'المكالمات الصادرة تطفات' : !hasCall(modeFor(o, s).mode) ? `المكالمات تطفات لمصدر ${CHANNELS[channelFor(o)]}` : null;
    if (why) { db.run("UPDATE call_tasks SET status='cancelled', reason=?, updated_at=? WHERE id=?", why, dbNow(), t.id); n++; }
  }
  if (n) audit('call.reconcile', { details: { cancelled: n } });
  return n;
}

function blockReason(order, s, task) {
  if (!order) return 'الطلب غير موجود';
  const allowed = task.kind === 'manual' ? [...WAITING, 'needs_review'] : WAITING;
  if (!allowed.includes(order.status)) return 'الطلب ما بقاش يستنى التأكيد';
  if (order.do_not_call) return 'الزبون طلب ما نعاودوش نعيطولو';
  if (order.assigned_user_id && task.kind !== 'manual') return 'موظف تكفّل بالطلب';
  if (!s.outbound_enabled) return 'المكالمات الصادرة مطفية';
  if (task.kind === 'auto' && !hasCall(modeFor(order, s).mode)) return 'المكالمات مطفية لهاذ المصدر';
  if (!isValidDzMobile(order.phone)) return 'رقم الهاتف غير صالح';
  if (s.only_cod && order.payment_method === 'prepaid') return 'الطلب مخلّص مسبقاً (ماشي الدفع عند الاستلام)';
  return null;
}

export function isReal(phone, s = getSetting('calls')) {
  if (!s.real_calls_enabled || !callsBridgeReady()) return false;
  if (s.test_only_owner) return Boolean(s.owner_phone) && normPhone(phone) === normPhone(s.owner_phone);
  return true;
}

// ───── الاتصال ─────
export async function runDue(now = clockNow()) {
  const due = db.all("SELECT * FROM call_tasks WHERE status='scheduled' AND scheduled_for<=? ORDER BY scheduled_for", now.toISOString());
  for (const t of due) await dialTask(t, now);
  return due.length;
}

async function dialTask(task, now = clockNow(), { force = false } = {}) {
  const order = getOrder(task.order_id);
  const s = getSetting('calls');
  // نعاودو نتحققو من الطلب والإعدادات مباشرة قبل الاتصال
  const why = blockReason(order, s, task);
  if (why) { db.run("UPDATE call_tasks SET status='cancelled', reason=?, updated_at=? WHERE id=?", why, dbNow(), task.id); return { skipped: why }; }
  if (!force && !windowAt(now, { windows: s.windows, tz: s.timezone })) {
    const slot = nextSlot(now, { windows: s.windows, tz: s.timezone });
    db.run('UPDATE call_tasks SET scheduled_for=?, day=?, window_index=?, updated_at=? WHERE id=?', slot.at.toISOString(), slot.day, slot.windowIndex, dbNow(), task.id);
    return { rescheduled: slot.at };
  }
  const lock = db.run("UPDATE call_tasks SET status='dialing', updated_at=? WHERE id=? AND status='scheduled'", dbNow(), task.id);
  if (!lock.changes) return { skipped: 'already' };
  return placeCall({ direction: 'out', orderId: order.id, taskId: task.id, phone: order.phone });
}

async function placeCall({ direction, orderId = null, taskId = null, phone, test = false }) {
  const real = isReal(phone);
  const provider = real ? n8nProvider : simulationProvider;
  const id = db.insert('calls', { direction, order_id: orderId, task_id: taskId, phone: localPhone(phone), provider: provider.name, real: real ? 1 : 0, status: 'queued', state: JSON.stringify(test ? { test: true } : {}) });
  if (taskId) db.run('UPDATE call_tasks SET call_id=? WHERE id=?', id, taskId);
  const call = getCall(id);
  try {
    const r = await provider.dial(call);
    db.run('UPDATE calls SET provider_call_id=?, status=? WHERE id=?', r.providerCallId, r.status, id);
    audit('call.dial', { entity: 'orders', entityId: orderId, details: { call: id, real, provider: provider.name } });
  } catch (e) {
    logError('call.dial', e, { entity: 'orders', entityId: orderId, retryable: true, details: { call: id } });
    await callEvent(id, 'failed', { error: e.message });
  }
  return getCall(id);
}

export async function callNow(orderId, user) {
  const o = getOrder(orderId);
  if (!o) throw httpErr(404, 'الطلب غير موجود');
  if (pendingTask(orderId)?.status === 'dialing') throw httpErr(409, 'كاين مكالمة جارية');
  cancelPendingCalls(orderId, 'استبدلناها بـ«اتصل دُرك»');
  const id = db.insert('call_tasks', { order_id: orderId, kind: 'manual', scheduled_for: clockNow().toISOString(), day: localParts(clockNow(), getSetting('calls').timezone).day, reason: `اتصل دُرك — ${user?.name || ''}` });
  const r = await dialTask(db.get('SELECT * FROM call_tasks WHERE id=?', id), clockNow(), { force: true });
  audit('call.now', { user, entity: 'orders', entityId: orderId });
  if (r.skipped) throw httpErr(409, r.skipped);
  return r;
}
export function stopAttempts(orderId, user) {
  const n = cancelPendingCalls(orderId, `أوقف المحاولات — ${user?.name || ''}`);
  audit('call.stop', { user, entity: 'orders', entityId: orderId, details: { cancelled: n } });
  return n;
}
export function handoffOrder(orderId, user, reason = 'الموظف تكفّل بالطلب') {
  db.update('orders', orderId, { assigned_user_id: user?.id ?? null, review_reason: reason, updated_at: dbNow() });
  cancelPendingCalls(orderId, reason);
  db.insert('order_events', { order_id: orderId, status: getOrder(orderId).status, note: reason, actor: user?.name || 'system' });
  audit('call.handoff', { user, entity: 'orders', entityId: orderId });
}
export const testCall = (phone) => placeCall({ direction: 'out', phone, test: true });

// ───── أحداث المكالمة ─────
export function getCall(id) {
  const c = db.get('SELECT * FROM calls WHERE id=?', id);
  if (!c) return null;
  c.state = JSON.parse(c.state || '{}'); c.transcript = JSON.parse(c.transcript || '[]');
  return c;
}
export const callByProviderId = (pid) => { const r = db.get('SELECT id FROM calls WHERE provider_call_id=?', pid); return r ? getCall(r.id) : null; };
function save(call) { db.run('UPDATE calls SET state=?, transcript=? WHERE id=?', JSON.stringify(call.state), JSON.stringify(call.transcript), call.id); }
function log(call, who, text, extra = {}) { call.transcript.push({ who, text, at: clockNow().toISOString(), ...extra }); }
function logReply(call, rep) {
  for (const a of rep.actions) log(call, 'bot', a.type === 'say' ? a.text : `▶ تسجيل: ${db.get('SELECT name FROM media WHERE id=?', a.media_id)?.name || a.media_id}`, a.type === 'play' ? { play: true, media_id: a.media_id } : { speech: a.speech });
}

/** answered | no_answer | busy | voicemail | failed | completed */
export async function callEvent(callId, type, data = {}) {
  const call = getCall(callId);
  if (!call) throw httpErr(404, 'المكالمة غير موجودة');
  const fresh = db.run('INSERT OR IGNORE INTO webhook_events(source, event_key) VALUES(?,?)', 'call', `${callId}:${type}`);
  if (!fresh.changes) return { duplicate: true };
  if (type === 'answered') {
    if (call.status === 'in_progress') return { duplicate: true };
    db.run("UPDATE calls SET status='in_progress', started_at=? WHERE id=?", dbNow(), callId);
    call.status = 'in_progress';
    let rep = call.state.test
      ? { actions: [{ type: 'say', text: 'سلام، هاذي مكالمة تجريبية من Zinor. إذا تسمعني، قول أي حاجة.' }], end: false }
      : dialog.start(call, ops);
    rep = withSpeech(rep);
    logReply(call, rep); save(call);
    return rep;
  }
  if (['no_answer', 'busy', 'voicemail', 'failed'].includes(type)) return endCall(call, type, data.error);
  if (type === 'completed') {
    if (call.status === 'completed') return { ended: true };            // الحوار كمل من قبل
    return endCall(call, call.status === 'in_progress' ? 'hangup' : 'no_answer');
  }
  throw httpErr(400, 'حدث غير معروف');
}

export async function callTurn(callId, text) {
  const call = getCall(callId);
  if (!call || ['completed', 'no_answer', 'busy', 'voicemail', 'failed'].includes(call.status)) throw httpErr(409, 'المكالمة ماشي جارية');
  log(call, 'customer', text || '…');
  let rep;
  if (call.state.test) rep = { actions: [{ type: 'say', text: 'مليح، كلش يخدم: نسمعك وتسمعني. بالسلامة.' }], end: true, outcome: 'test_ok' };
  else rep = await dialog.turn(call, text, ops, clockNow());
  rep = withSpeech(rep);
  logReply(call, rep); save(call);
  if (rep.end) await finalize(call, rep.outcome);
  return rep;
}

export function inboundCall(fromPhone, providerCallId = null) {
  const s = getSetting('calls');
  const real = Boolean(providerCallId);
  const id = db.insert('calls', { direction: 'in', phone: localPhone(fromPhone) || String(fromPhone), provider: real ? n8nProvider.name : 'simulation', provider_call_id: providerCallId, real: real ? 1 : 0, status: 'in_progress', started_at: dbNow() });
  const call = getCall(id);
  let rep;
  if (!s.inbound_enabled) rep = { actions: [{ type: 'say', text: 'سلام، معاك متجر Zinor. حالياً ما نجاوبوش على المكالمات، ابعثلنا في واتساب ونجاوبوك. بالسلامة.' }], end: true, outcome: 'inbound_off' };
  else rep = dialog.start(call, ops);
  rep = withSpeech(rep);
  if (call.state.order_id) db.run('UPDATE calls SET order_id=? WHERE id=?', call.state.order_id, id);
  logReply(call, rep); save(call);
  if (rep.end) finalize(call, rep.outcome);
  return { call: getCall(id), reply: rep };
}

async function finalize(call, outcome) {
  db.run("UPDATE calls SET status='completed', outcome=?, ended_at=?, order_id=COALESCE(order_id, ?) WHERE id=?", outcome ?? null, dbNow(), call.state.order_id ?? null, call.id);
  if (call.task_id) db.run("UPDATE call_tasks SET status='done', result=?, updated_at=? WHERE id=?", outcome || 'answered', dbNow(), call.task_id);
  audit('call.finished', { entity: 'orders', entityId: call.order_id || call.state.order_id, details: { call: call.id, outcome } });
}

async function endCall(call, result, error) {
  if (['completed', 'no_answer', 'busy', 'voicemail', 'failed'].includes(call.status) && call.outcome) return { ended: true };
  if (result === 'hangup') {
    db.run("UPDATE calls SET status='completed', outcome=COALESCE(outcome,'hangup'), ended_at=? WHERE id=?", dbNow(), call.id);
    if (call.task_id) db.run("UPDATE call_tasks SET status='done', result=COALESCE(result,'hangup'), updated_at=? WHERE id=?", dbNow(), call.task_id);
    const o = call.order_id ? getOrder(call.order_id) : null;
    if (o && !getCall(call.id).outcome?.match(/confirmed|cancelled|callback|do_not_call|human/) && WAITING.concat('needs_review').includes(o.status)) markReview(o, 'انقطعت المكالمة قبل التأكيد');
    return { ended: true };
  }
  db.run('UPDATE calls SET status=?, outcome=?, error=?, ended_at=? WHERE id=?', result, result, error ?? null, dbNow(), call.id);
  if (!call.task_id) return { ended: true };
  const task = db.get('SELECT * FROM call_tasks WHERE id=?', call.task_id);
  db.run("UPDATE call_tasks SET status='done', result=?, error=?, updated_at=? WHERE id=?", result, error ?? null, dbNow(), task.id);
  const order = getOrder(call.order_id);
  if (!order || !WAITING.includes(order.status)) return { ended: true };
  const s = getSetting('calls');
  const label = { no_answer: 'ما ردّش', busy: 'مشغول', voicemail: 'البريد الصوتي', failed: 'فشل الاتصال' }[result];
  {
    const done = attemptsOn(order.id, task.day);
    // محاولة في كل فترة باقية من نفس اليوم — بلا مكالمات متتابعة، وحد أقصى max_attempts_per_day
    const next = done < s.max_attempts_per_day
      ? scheduleTask(order.id, clockNow(), { kind: 'auto', reason: `محاولة بعد: ${label}`, afterIndex: task.window_index ?? -1, day: task.day, allowNextDay: false })
      : null;
    if (!next) markReview(order, `${label} بعد ${done} محاولات`);
  }
  return { ended: true };
}

function markReview(order, reason) {
  db.update('orders', order.id, { review_reason: reason, updated_at: dbNow() });
  if (WAITING.includes(order.status)) setOrderStatus(order.id, 'needs_review', { note: reason, actor: 'calls' });
  cancelPendingCalls(order.id, reason);
}

// ───── العمليات اللي يستعملها محرّك الحوار ─────
const ACTIVE = ['new', 'awaiting_confirmation', 'needs_review', 'confirmed', 'dispatching', 'shipped', 'out_for_delivery', 'delivery_failed'];
const ops = {
  getOrder, items: orderItems, orderByNumber,
  samePhone: (o, phone) => [o.phone, o.wa_phone].some((p) => p && normPhone(p) === normPhone(phone)),
  findOrdersByPhone: (phone) => db.all(`SELECT * FROM orders WHERE (phone=? OR wa_phone=?) AND status IN (${ACTIVE.map(() => '?').join(',')}) AND created_at>=datetime('now','-60 days') ORDER BY id DESC`,
    localPhone(phone), normPhone(phone), ...ACTIVE),
  missing(order) {
    const e = validateOrder(order).errors.join(' ');
    return [/البلدية/.test(e) && 'commune', /العنوان/.test(e) && 'address', /اسم/.test(e) && 'customer_name'].filter(Boolean);
  },
  async confirm(order, call, words) {
    const r = await confirmAndShip(order.id, { via: 'phone', words, actor: `call#${call.id}` });
    return r;
  },
  cancel(order, call) { return cancelOrderFull(order.id, { note: 'ألغاها الزبون في المكالمة', actor: `call#${call.id}` }); },
  previewAddress(order, p) {
    const fee = deliveryFee(p.wilaya_code, order.delivery_method);
    if (fee == null) return { ok: false, error: 'التوصيل غير متوفر للولاية الجديدة' };
    return { ok: true, fee, total: order.items_total + fee };
  },
  applyAddress(order, p) {
    db.update('orders', order.id, { wilaya_code: p.wilaya_code, commune: p.commune, address: p.address, stopdesk_id: order.wilaya_code === p.wilaya_code ? order.stopdesk_id : null, updated_at: dbNow() });
    recalcOrder(order.id);
    db.insert('order_events', { order_id: order.id, status: order.status, note: `العنوان تبدّل في المكالمة: ${p.commune}، ${p.address}`, actor: 'call' });
  },
  setName(order, name) { db.update('orders', order.id, { customer_name: name }); },
  scheduleCallback(order, call, when) {
    const s = getSetting('calls');
    const from = when && when > clockNow() ? when : new Date(clockNow().getTime() + 60 * 60000);
    db.run("UPDATE call_tasks SET status='cancelled', reason='الزبون طلب يعيطولو في وقت آخر', updated_at=? WHERE order_id=? AND status='scheduled'", dbNow(), order.id);
    if (call.task_id) db.run("UPDATE call_tasks SET status='done', result='callback', updated_at=? WHERE id=?", dbNow(), call.task_id);
    const t = scheduleTask(order.id, from, { kind: 'callback', reason: when ? `الزبون طلب: ${fmtLocal(when, s.timezone)}` : 'الزبون قال عيّطلي من بعد' });
    db.insert('order_events', { order_id: order.id, status: order.status, note: `طلب يعيطولو من بعد — مبرمجة ${fmtLocal(new Date(t.scheduled_for), s.timezone)}`, actor: `call#${call.id}` });
    const p = localParts(new Date(t.scheduled_for), s.timezone);
    const today = localParts(clockNow(), s.timezone).day;
    return { task: t, label: `${p.day === today ? 'اليوم' : 'غدوة'} مع ${p.h}:${String(p.mi).padStart(2, '0')}` };
  },
  doNotCall(order, call) {
    db.update('orders', order.id, { do_not_call: 1 });
    markReview(order, 'الزبون طلب ما نعاودوش نعيطولو');
  },
  review(order, call, reason) { markReview(order, reason); },
  handoff(order, call, reason) {
    if (order) {
      db.update('orders', order.id, { review_reason: reason, updated_at: dbNow() });
      if (WAITING.includes(order.status)) setOrderStatus(order.id, 'needs_review', { note: reason, actor: `call#${call.id}` });
      cancelPendingCalls(order.id, reason);
    }
    audit('call.handoff_requested', { level: 'error', entity: order ? 'orders' : 'calls', entityId: order?.id ?? call.id, details: { reason, phone: call.phone } });
  },
};

// ───── للّوحة ─────
export function orderCallInfo(orderId) {
  const o = getOrder(orderId);
  const s = getSetting('calls');
  const tasks = db.all('SELECT * FROM call_tasks WHERE order_id=? ORDER BY id DESC LIMIT 20', orderId);
  const calls = db.all('SELECT id, direction, status, outcome, error, real, created_at, ended_at, transcript FROM calls WHERE order_id=? ORDER BY id DESC LIMIT 10', orderId)
    .map((c) => ({ ...c, transcript: JSON.parse(c.transcript || '[]') }));
  const next = tasks.find((t) => t.status === 'scheduled');
  const last = calls[0];
  return {
    ...modeFor(o, s), mode_label: MODES[modeFor(o, s).mode], do_not_call: !!o.do_not_call, assigned_user_id: o.assigned_user_id, review_reason: o.review_reason,
    next: next ? { at: next.scheduled_for, local: fmtLocal(new Date(next.scheduled_for), s.timezone), kind: next.kind, reason: next.reason } : null,
    last: last ? { status: last.status, outcome: last.outcome, error: last.error, at: last.ended_at || last.created_at, real: !!last.real } : null,
    tasks, calls, windows: sortedWindows(s.windows),
  };
}
