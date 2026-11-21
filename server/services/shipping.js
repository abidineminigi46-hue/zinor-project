// الإرسال لشركات التوصيل + تتبع الحالات + إعادة المحاولة الآمنة
import { db, now } from '../db.js';
import { loadAccount } from './accounts.js';
import { SHIP_STATUS, ConnectorError, mapStatus } from '../connectors/carriers/base.js';
import { getOrder, orderItems, setOrderStatus, validateOrder, adjustStock } from './orders.js';
import { notifyOnce } from './notifications.js';
import { audit, logError } from './audit.js';
import { wilayaByCode } from '../data/wilayas.js';
import { getSetting } from './settings.js';
import { onShipmentReturnPhase } from './returns.js';
import { syncStore } from './stores.js';
import { httpErr } from './accounts.js';

const ORDER_FROM_SHIP = {
  created: 'shipped', picked_up: 'shipped', in_transit: 'shipped', at_hub: 'shipped', out_for_delivery: 'out_for_delivery',
  delivery_failed: 'delivery_failed', delivered: 'delivered', returning: 'returning', returned: 'returned', cancelled: 'cancelled',
};
const RANK = { created: 1, picked_up: 2, in_transit: 3, at_hub: 4, out_for_delivery: 5, delivery_failed: 5, returning: 7, delivered: 9, returned: 9, cancelled: 9 };
const DISPATCHABLE = ['confirmed', 'dispatch_failed', 'dispatch_unknown', 'needs_review'];

/** اختيار شركة التوصيل: يدوي ← قواعد (ولاية/طريقة) ← الافتراضية */
export function chooseCarrierAccount(order) {
  const active = (id) => db.get('SELECT id FROM carrier_accounts WHERE id=? AND enabled=1 AND deleted_at IS NULL', id);
  if (order.carrier_account_id && active(order.carrier_account_id)) return order.carrier_account_id;
  const rules = db.all(`SELECT r.* FROM carrier_rules r JOIN carrier_accounts a ON a.id=r.carrier_account_id
    WHERE a.enabled=1 AND a.deleted_at IS NULL ORDER BY r.priority, r.id`);
  for (const r of rules) {
    if ((r.wilaya_code == null || r.wilaya_code === order.wilaya_code) && (!r.delivery_method || r.delivery_method === order.delivery_method)) return r.carrier_account_id;
  }
  return db.get('SELECT id FROM carrier_accounts WHERE enabled=1 AND deleted_at IS NULL ORDER BY is_default DESC, id LIMIT 1')?.id ?? null;
}

function shipmentInput(order, account, reference) {
  const w = wilayaByCode(order.wilaya_code);
  const [firstName, ...rest] = String(order.customer_name || '').trim().split(/\s+/);
  const desk = order.stopdesk_id ? db.get('SELECT * FROM stopdesks WHERE id=?', order.stopdesk_id) : null;
  const items = orderItems(order.id);
  return {
    reference, customerName: order.customer_name, firstName, lastName: rest.join(' '), phone: order.phone,
    wilayaCode: order.wilaya_code, wilayaName: w?.fr, communeName: order.commune, address: order.address,
    method: order.delivery_method, stopdesk: desk, products: items.map((i) => `${i.name} x${i.qty}`).join(', '),
    codAmount: order.total, declaredValue: order.items_total,
    weightKg: items.reduce((s, i) => s + (db.get('SELECT weight_kg FROM products WHERE id=?', i.product_id)?.weight_kg || 0.5) * i.qty, 0),
    originWilayaCode: getSetting('store').origin_wilaya, note: order.notes || '',
  };
}

const latestShipment = (orderId) => db.get("SELECT * FROM shipments WHERE order_id=? AND kind='outbound' ORDER BY id DESC LIMIT 1", orderId);

/**
 * يبعث الطلب لشركة التوصيل. آمن ضد التكرار:
 *  - إذا كاين شحنة مخلوقة → يرجّعها بلا ما يخلق وحدة أخرى
 *  - إذا آخر محاولة "غير واضحة" → يتحقق عند الشركة بنفس المرجع قبل أي إرسال جديد
 */
export async function dispatchOrder(orderId, { actor = 'system', user, carrierAccountId, force = false } = {}) {
  // 1) حجز (داخل transaction) باش طلبين في نفس الوقت ما يخلقوش جوج طرود
  const prep = db.tx(() => {
    let order = getOrder(orderId);
    if (!order) throw httpErr(404, 'الطلب غير موجود');
    const existing = db.get("SELECT * FROM shipments WHERE order_id=? AND kind='outbound' AND state IN ('created','creating') ORDER BY id DESC LIMIT 1", orderId);
    if (existing) return { done: existing };
    if (!DISPATCHABLE.includes(order.status)) throw httpErr(409, `ما نقدروش نبعثو طلب حالتو: ${order.status}`);
    if (carrierAccountId) db.update('orders', orderId, { carrier_account_id: carrierAccountId });
    order = getOrder(orderId);

    const last = latestShipment(orderId);
    if (last?.state === 'unknown') return { verify: last };

    const v = validateOrder(order);
    if (!v.ok && !force) {
      setOrderStatus(orderId, 'needs_review', { note: v.errors.join(' | '), actor, extra: { last_error: v.errors.join(' | ') } });
      audit('order.validate', { user, actor, entity: 'orders', entityId: orderId, level: 'error', details: v, retryable: true });
      return { invalid: v };
    }
    const accId = chooseCarrierAccount(order);
    if (!accId) {
      setOrderStatus(orderId, 'dispatch_failed', { note: 'ما كانش شركة توصيل مفعّلة', actor, extra: { last_error: 'ما كانش شركة توصيل مفعّلة' } });
      return { invalid: { errors: ['ما كانش شركة توصيل مفعّلة'] } };
    }
    const account = loadAccount('carrier', accId);
    const n = db.get("SELECT COUNT(*) AS n FROM shipments WHERE order_id=? AND kind='outbound'", orderId).n;
    const ref = n ? `${order.number}-${n + 1}` : order.number;
    const shipId = db.insert('shipments', { order_id: orderId, carrier_account_id: accId, carrier_code: account.code, dispatch_ref: ref, state: 'creating' });
    setOrderStatus(orderId, 'dispatching', { actor, extra: { carrier_account_id: accId, carrier_code: account.code, last_error: null } });
    return { shipId, account, order: getOrder(orderId), warnings: v.warnings };
  });

  if (prep.done) return { ok: true, shipment: prep.done, duplicate: true };
  if (prep.invalid) return { ok: false, errors: prep.invalid.errors };
  if (prep.verify) return verifyUnknown(prep.verify, { actor, user, recreate: true });

  const { shipId, account, order } = prep;
  const ship = db.get('SELECT * FROM shipments WHERE id=?', shipId);
  try {
    const r = await account.connector.createShipment(account, shipmentInput(order, account, ship.dispatch_ref));
    return onCreated(ship, r, { actor, user });
  } catch (e) {
    return onDispatchError(ship, e, { actor, user });
  }
}

function onCreated(ship, r, { actor, user }) {
  db.tx(() => {
    db.update('shipments', ship.id, { state: 'created', tracking: r.tracking, external_id: r.externalId ?? null, label_url: r.labelUrl ?? null, status: 'created', updated_at: now(), last_error: null });
    adjustStock(ship.order_id, -1);
    setOrderStatus(ship.order_id, 'shipped', { note: `تبعثت — تتبع ${r.tracking}`, actor, extra: { tracking: r.tracking, last_error: null } });
  });
  audit('shipment.created', { user, actor, entity: 'orders', entityId: ship.order_id, details: { tracking: r.tracking, carrier: ship.carrier_code } });
  const order = getOrder(ship.order_id);
  notifyOnce(order, 'shipped', `shipped:${ship.id}`);
  syncStore(order, { type: 'shipped', tracking: r.tracking, carrierName: loadAccount('carrier', ship.carrier_account_id, { includeDeleted: true })?.connector?.name });
  return { ok: true, shipment: db.get('SELECT * FROM shipments WHERE id=?', ship.id) };
}

function onDispatchError(ship, e, { actor, user }) {
  const unknown = e instanceof ConnectorError && e.kind === 'unknown_result';
  db.update('shipments', ship.id, { state: unknown ? 'unknown' : 'failed', last_error: e.message, updated_at: now() });
  setOrderStatus(ship.order_id, unknown ? 'dispatch_unknown' : 'dispatch_failed', { note: e.message, actor, extra: { last_error: e.message } });
  logError('shipment.dispatch', e, { user, entity: 'orders', entityId: ship.order_id, retryable: true, details: { ref: ship.dispatch_ref, kind: e.kind } });
  return { ok: false, unknown, error: e.message };
}

/** تحقق من شحنة "غير واضحة" عند الشركة بالمرجع، وإذا ما كانتش نعاود نبعثو بنفس المرجع */
async function verifyUnknown(ship, { actor, user, recreate }) {
  const account = loadAccount('carrier', ship.carrier_account_id, { includeDeleted: true });
  try {
    const found = await account.connector.findShipment(account, ship.dispatch_ref);
    if (found) {
      audit('shipment.verify.found', { user, actor, entity: 'orders', entityId: ship.order_id, details: { ref: ship.dispatch_ref, tracking: found.tracking } });
      return onCreated(ship, found, { actor, user });
    }
    if (!recreate) return { ok: false, error: 'ما لقيناش الطرد عند الشركة' };
    db.update('shipments', ship.id, { state: 'creating', updated_at: now() });
    setOrderStatus(ship.order_id, 'dispatching', { actor, note: 'تحقق: الطرد ما تخلقش — نعاودو بنفس المرجع' });
    const r = await account.connector.createShipment(account, shipmentInput(getOrder(ship.order_id), account, ship.dispatch_ref));
    return onCreated(ship, r, { actor, user });
  } catch (e) {
    return onDispatchError(ship, e, { actor, user });
  }
}

// ───────────── أحداث الحالة (webhook / تحقق دوري / محاكاة) ─────────────
const ts = (x) => (x ? new Date(String(x).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(x)) ? '' : 'Z')).getTime() : null);

export function applyCarrierEvent(shipment, ev, { source = 'webhook' } = {}) {
  const account = loadAccount('carrier', shipment.carrier_account_id, { includeDeleted: true });
  const status = mapStatus(account.connector, account, ev.externalStatus);
  const key = `${shipment.carrier_code}:${shipment.tracking}:${ev.eventId || `${ev.externalStatus}:${ev.occurredAt || ''}`}`;
  const ins = db.run('INSERT OR IGNORE INTO shipment_events(shipment_id, event_key, external_status, status, occurred_at, note) VALUES(?,?,?,?,?,?)',
    shipment.id, key, ev.externalStatus ?? null, status, ev.occurredAt ?? null, ev.note ?? null);
  if (!ins.changes) return { applied: false, reason: 'duplicate' };
  const evId = Number(ins.lastInsertRowid);
  if (!status) {
    audit('shipment.status.unknown', { level: 'error', entity: 'orders', entityId: shipment.order_id, details: { externalStatus: ev.externalStatus, carrier: shipment.carrier_code } });
    return { applied: false, reason: 'unmapped' };
  }
  const cur = db.get('SELECT * FROM shipments WHERE id=?', shipment.id);
  const why = rejectReason(cur, status, ev.occurredAt);
  if (why) {
    db.run(`UPDATE shipment_events SET note=COALESCE(note,'') || ? WHERE id=?`, ` [متجاهَل: ${why}]`, evId);
    return { applied: false, reason: why };
  }
  const enteringOfd = status === 'out_for_delivery' && cur.status !== 'out_for_delivery';
  const attempt = cur.attempt_no + (enteringOfd ? 1 : 0);
  db.tx(() => {
    db.run('UPDATE shipment_events SET applied=1 WHERE id=?', evId);
    db.update('shipments', cur.id, {
      status, external_status: ev.externalStatus, last_event_at: ev.occurredAt ?? cur.last_event_at ?? now(), attempt_no: attempt,
      failure_reason: ['delivery_failed', 'returning'].includes(status) && ev.note ? ev.note : cur.failure_reason, updated_at: now(),
    });
    if (cur.kind === 'outbound') {
      setOrderStatus(cur.order_id, ORDER_FROM_SHIP[status], { note: `${SHIP_STATUS[status].ar} (${ev.externalStatus})${ev.note ? ' — ' + ev.note : ''}`, actor: `carrier:${cur.carrier_code}/${source}` });
    }
  });
  const order = getOrder(cur.order_id);
  if (cur.kind === 'outbound') {
    if (enteringOfd) notifyOnce(order, 'out_for_delivery', `ofd:${cur.id}:${attempt}`, { eta: ev.eta ? ` الوقت المقدّر للوصول: ${ev.eta}.` : '' });
    if (status === 'delivery_failed') notifyOnce(order, 'delivery_failed', `fail:${cur.id}:${attempt}`, { reason: ev.note ? ` (${ev.note})` : '' });
    if (status === 'delivered') { notifyOnce(order, 'delivered', `delivered:${cur.id}`); syncStore(order, { type: 'delivered', tracking: cur.tracking }); }
    if (status === 'returning' || status === 'returned') onShipmentReturnPhase(order, cur, status, ev.note || cur.failure_reason);
    if (status === 'returned') { notifyOnce(order, 'returned', `returned:${cur.id}`); syncStore(order, { type: 'returned', tracking: cur.tracking }); }
  } else if (cur.kind === 'return_pickup') {
    onShipmentReturnPhase(order, cur, status, ev.note);
  }
  return { applied: true, status };
}

// تحديث قديم ما يرجّعش الحالة للور
function rejectReason(cur, next, occurredAt) {
  if (!cur.status) return null;
  const phase = SHIP_STATUS[cur.status]?.phase, nphase = SHIP_STATUS[next]?.phase;
  if (phase === 'terminal' || phase === 'return_terminal') return 'الشحنة في حالة نهائية';
  if (phase === 'return' && nphase === 'forward') return 'الشحنة راجعة — حالة توصيل قديمة';
  const a = ts(occurredAt), b = ts(cur.last_event_at);
  if (a && b && a < b) return 'حدث أقدم من آخر حالة';
  if ((!a || !b) && RANK[next] < RANK[cur.status] && !(cur.status === 'delivery_failed' && next === 'at_hub')) return 'حالة أقدم في الترتيب';
  return null;
}

export async function refreshTracking(shipmentId) {
  const s = db.get('SELECT * FROM shipments WHERE id=?', shipmentId);
  if (!s?.tracking) return { ok: false, error: 'ما كانش رقم تتبع' };
  const account = loadAccount('carrier', s.carrier_account_id, { includeDeleted: true });
  if (!account?.connector.capabilities.tracking) return { ok: false, error: 'الشركة ما تدعمش التتبع' };
  try {
    const evs = await account.connector.getTracking(account, s.tracking);
    evs.sort((x, y) => (ts(x.occurredAt) || 0) - (ts(y.occurredAt) || 0));
    const results = evs.map((e) => applyCarrierEvent(db.get('SELECT * FROM shipments WHERE id=?', s.id), e, { source: 'poll' }));
    return { ok: true, events: evs.length, applied: results.filter((r) => r.applied).length };
  } catch (e) {
    logError('shipment.poll', e, { entity: 'orders', entityId: s.order_id, retryable: true });
    return { ok: false, error: e.message };
  }
}

// تحقق دوري للشحنات الحيّة (الشركات بلا webhook أو كاحتياط)
export async function pollActiveShipments() {
  const rows = db.all(`SELECT s.id FROM shipments s JOIN carrier_accounts a ON a.id=s.carrier_account_id
    WHERE s.state='created' AND a.mode='live' AND (s.status IS NULL OR s.status NOT IN ('delivered','returned','cancelled'))`);
  for (const r of rows) await refreshTracking(r.id);
  return rows.length;
}

export function findShipmentByTracking(carrierCode, tracking) {
  return db.get('SELECT * FROM shipments WHERE carrier_code=? AND tracking=?', carrierCode, tracking);
}

/** محاكاة حدث من شركة التوصيل (للتجربة) — يمرّ بنفس المسار تاع webhook */
export function simulateCarrierStatus(shipmentId, status, { note, eventId, eta } = {}) {
  const s = db.get('SELECT * FROM shipments WHERE id=?', shipmentId);
  if (!s) throw httpErr(404, 'الشحنة غير موجودة');
  const account = loadAccount('carrier', s.carrier_account_id, { includeDeleted: true });
  const external = Object.entries(account.connector.statusMap).find(([, v]) => v === status)?.[0];
  if (!external) throw httpErr(400, 'حالة غير معروفة لهاذ الشركة');
  return applyCarrierEvent(s, { externalStatus: external, eventId: eventId || `sim-${Date.now()}-${Math.random()}`, occurredAt: new Date().toISOString(), note, eta }, { source: 'simulation' });
}
