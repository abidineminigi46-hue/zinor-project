// الروتور: (1) طرد ما تسلّمش ورجع (RTO)  (2) طلب روتور من الزبون بعد الاستلام
import { db, now } from '../db.js';
import { getOrder, adjustStock, setOrderStatus } from './orders.js';
import { getSetting } from './settings.js';
import { loadAccount, httpErr } from './accounts.js';
import { audit, logError } from './audit.js';
import { notifyOnce, conversationForOrder } from './notifications.js';
import { sendText } from './whatsapp.js';
import { ConnectorError } from '../connectors/carriers/base.js';

export const RETURN_STATUS = {
  requested: 'مطلوب', needs_review: 'يحتاج قرار', accepted: 'مقبول', rejected: 'مرفوض',
  in_transit: 'راه في الطريق', returned_to_stock: 'رجع للمخزن',
};
export const REASONS = {
  defective: 'المنتج فيه عيب / مكسور', wrong_item: 'وصلو منتج غالط', size: 'المقاس/اللون ما صلحش',
  changed_mind: 'بدّل رأيو', other: 'سبب آخر',
};

export function classifyReason(text) {
  const t = String(text || '').toLowerCase();
  if (/mksour|mksoura|meksour|kass|cass|abim|défect|defect|عيب|مكسور|خاسر|ما يخدمش|ma ykhdemch|ma tekhdemch|panne|ماشي يخدم/.test(t)) return 'defective';
  if (/ghalet|ghalta|غالط|غلط|machi hada|ماشي هذا|ماشي هاذ|pas le bon|erreur|wrong/.test(t)) return 'wrong_item';
  if (/taille|size|ma9as|مقاس|couleur|لون|kbir|sghir|صغير|كبير/.test(t)) return 'size';
  if (/ma3jbatnich|ma3jebnich|ماعجبنيش|ما عجبنيش|bdelt|بدلت رايي|plus besoin|ma7abitouch/.test(t)) return 'changed_mind';
  return 'other';
}

const deliveredAt = (orderId) => db.get("SELECT created_at FROM order_events WHERE order_id=? AND status='delivered' ORDER BY id DESC LIMIT 1", orderId)?.created_at;

/** طلب روتور من الزبون (عبر واتساب) — مربوط بالكوموند الأصلية */
export async function createCustomerReturn(order, reasonText, { conversationId, actor = 'whatsapp' } = {}) {
  if (order.status !== 'delivered') return { ok: false, code: 'not_delivered', message: 'الكوموند مازال ما تسلّمتش — هاذي ماشي حالة روتور بعد الاستلام' };
  const open = db.get("SELECT * FROM returns WHERE order_id=? AND type='customer' AND status NOT IN ('rejected')", order.id);
  if (open) return { ok: true, ret: open, existing: true };
  const policy = getSetting('returns');
  const code = classifyReason(reasonText);
  const at = deliveredAt(order.id);
  const days = at ? (Date.now() - new Date(at.replace(' ', 'T') + 'Z').getTime()) / 86400000 : 0;
  const inWindow = days <= policy.window_days;
  const auto = inWindow && policy.auto_accept_reasons.includes(code);
  const id = db.insert('returns', {
    order_id: order.id, type: 'customer', status: auto ? 'accepted' : 'needs_review', reason: reasonText, reason_code: code,
    conversation_id: conversationId ?? null, decision_note: auto ? 'قبول تلقائي حسب السياسة' : !inWindow ? `خارج المدة (${Math.floor(days)} يوم)` : 'يحتاج قرار موظف',
  });
  audit('return.request', { actor, entity: 'orders', entityId: order.id, details: { code, auto, inWindow } });
  if (auto) await startPickup(id, { actor: 'policy' });
  return { ok: true, ret: db.get('SELECT * FROM returns WHERE id=?', id), auto, inWindow };
}

export async function decideReturn(id, accept, { user, note } = {}) {
  const r = db.get('SELECT * FROM returns WHERE id=?', id);
  if (!r) throw httpErr(404, 'الروتور غير موجود');
  if (!['needs_review', 'requested'].includes(r.status)) throw httpErr(409, 'تقرّر من قبل');
  db.update('returns', id, { status: accept ? 'accepted' : 'rejected', decided_by: user?.id ?? null, decision_note: note ?? null, updated_at: now() });
  audit(accept ? 'return.accept' : 'return.reject', { user, entity: 'returns', entityId: id, details: { note } });
  const order = getOrder(r.order_id);
  const conv = conversationForOrder(order);
  if (accept) return startPickup(id, { user });
  if (conv) sendText(conv, `بخصوص طلب الروتور تاع الكوموند ${order.number}: ما قدرناش نقبلوه${note ? ' — ' + note : ''}. إذا عندك سؤال ردّ على هاذ المساج.`, { author: 'system' });
  return { ok: true };
}

/** بعد القبول: طلب جمع الطرد من الشركة إذا تدعم الخدمة */
async function startPickup(id, { user, actor } = {}) {
  const r = db.get('SELECT * FROM returns WHERE id=?', id);
  const order = getOrder(r.order_id);
  const conv = conversationForOrder(order);
  const ship = db.get("SELECT * FROM shipments WHERE order_id=? AND kind='outbound' AND state='created' ORDER BY id DESC LIMIT 1", order.id);
  const account = ship ? loadAccount('carrier', ship.carrier_account_id, { includeDeleted: true }) : null;
  let msg;
  try {
    if (!account || account.deleted_at || !account.enabled) throw new ConnectorError('not_supported', 'حساب شركة التوصيل غير مفعّل');
    const p = await account.connector.requestReturnPickup(account, { order, shipment: ship, reason: r.reason });
    const sid = db.insert('shipments', {
      order_id: order.id, carrier_account_id: account.id, carrier_code: account.code, dispatch_ref: `${order.number}-R${id}`,
      state: 'created', tracking: p.tracking, status: 'created', kind: 'return_pickup',
    });
    db.update('returns', id, { status: 'in_transit', pickup_shipment_id: sid, pickup_tracking: p.tracking, updated_at: now() });
    msg = `تم قبول الروتور تاع الكوموند ${order.number} ✅ طلبنا من ${account.connector.name} يجي يدّي الطرد. رقم التتبع: ${p.tracking}.`;
  } catch (e) {
    if (!(e instanceof ConnectorError && e.kind === 'not_supported')) logError('return.pickup', e, { entity: 'returns', entityId: id, retryable: true });
    db.update('returns', id, { decision_note: `${r.decision_note || ''} — جمع يدوي: ${e.message}`.trim(), updated_at: now() });
    msg = `تم قبول الروتور تاع الكوموند ${order.number} ✅ واحد من الفريق راح يتصل بيك باش ننظّمو استرجاع الطرد.`;
  }
  if (conv) sendText(conv, msg, { author: 'system' });
  audit('return.pickup', { user, actor, entity: 'returns', entityId: id });
  return { ok: true, ret: db.get('SELECT * FROM returns WHERE id=?', id) };
}

/** مربوط بأحداث الشحن: RTO (طرد راجع) أو جمع روتور الزبون */
export function onShipmentReturnPhase(order, shipment, status, reason) {
  if (shipment.kind === 'return_pickup') {
    const r = db.get('SELECT * FROM returns WHERE pickup_shipment_id=?', shipment.id);
    if (r && status === 'delivered') receiveReturn(r.id, { actor: 'carrier' }); // "تسلّم" عند المخزن
    return;
  }
  let r = db.get("SELECT * FROM returns WHERE order_id=? AND type='rto'", order.id);
  if (!r) {
    const id = db.insert('returns', { order_id: order.id, type: 'rto', status: 'in_transit', reason: reason || 'تعذّر التوصيل / رفض الاستلام', reason_code: 'rto' });
    r = db.get('SELECT * FROM returns WHERE id=?', id);
  } else if (reason && !r.reason) db.update('returns', r.id, { reason });
  if (status === 'returned' && r.status !== 'returned_to_stock') receiveReturn(r.id, { actor: 'carrier' });
}

export function receiveReturn(id, { user, actor } = {}) {
  const r = db.get('SELECT * FROM returns WHERE id=?', id);
  if (!r || r.status === 'returned_to_stock') return { ok: true };
  db.tx(() => {
    db.update('returns', id, { status: 'returned_to_stock', updated_at: now() });
    adjustStock(r.order_id, +1);
    if (r.type === 'customer') setOrderStatus(r.order_id, 'returned', { note: 'روتور الزبون رجع للمخزن', actor: actor || user?.name || 'system' });
  });
  audit('return.received', { user, actor, entity: 'returns', entityId: id });
  return { ok: true };
}

export function listReturns() {
  return db.all(`SELECT r.*, o.number, o.customer_name, o.phone, o.wilaya_code, o.total, o.carrier_code, o.tracking
    FROM returns r JOIN orders o ON o.id=r.order_id ORDER BY r.id DESC LIMIT 300`);
}
