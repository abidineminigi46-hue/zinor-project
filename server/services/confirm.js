// تأكيد الطلب من أي قناة (زر واتساب، محادثة، مكالمة، موظف) — تأكيد واحد وشحنة واحدة حتى لو جاو في نفس الوقت
import { db, now } from '../db.js';
import { getOrder, setOrderStatus } from './orders.js';
import { dispatchOrder } from './shipping.js';
import { cancelPendingCalls } from '../calls/engine.js';
import { audit } from './audit.js';

const CONFIRMABLE = "('new','awaiting_confirmation','needs_review')";
const ALREADY_OK = ['confirmed', 'dispatching', 'shipped', 'out_for_delivery', 'delivered'];
const VIA_LABEL = { whatsapp_button: 'زر واتساب', whatsapp_chat: 'محادثة واتساب', phone: 'مكالمة هاتفية', staff: 'الموظف' };

export async function confirmAndShip(orderId, { via, words = null, actor = 'system', user = null, consentMessageId = null } = {}) {
  // الانتقال الذرّي: غير طلب واحد ينجح فيه — الباقي يلقى الحالة تبدّلت
  const r = db.run(`UPDATE orders SET status='confirmed', confirmed_at=?, confirmed_via=?, consent_text=COALESCE(?, consent_text),
      consent_message_id=COALESCE(?, consent_message_id), review_reason=NULL, last_error=NULL, updated_at=? WHERE id=? AND status IN ${CONFIRMABLE}`,
  now(), via, words, consentMessageId, now(), orderId);
  if (!r.changes) {
    const o = getOrder(orderId);
    return { ok: ALREADY_OK.includes(o?.status), already: true, order: o, error: o ? null : 'الطلب غير موجود' };
  }
  db.insert('order_events', { order_id: orderId, status: 'confirmed', note: `تأكيد عبر ${VIA_LABEL[via] || via}${words ? ` — «${String(words).slice(0, 120)}»` : ''}`, actor });
  cancelPendingCalls(orderId, `تأكد عبر ${VIA_LABEL[via] || via}`);
  audit('order.confirm', { user, actor, entity: 'orders', entityId: orderId, details: { via } });
  const d = await dispatchOrder(orderId, { actor: 'auto' });
  return { ok: true, order: getOrder(orderId), dispatched: d.ok, tracking: d.shipment?.tracking, error: d.ok ? null : (d.errors || [d.error]).join(' | ') };
}

export function cancelOrderFull(orderId, { note, actor = 'system', user = null } = {}) {
  const o = getOrder(orderId);
  if (!o) return { ok: false, error: 'الطلب غير موجود' };
  if (['shipped', 'out_for_delivery', 'delivered', 'returning', 'returned', 'dispatching'].includes(o.status)) return { ok: false, shipped: true, error: 'الطلب تبعث' };
  if (o.status !== 'cancelled') setOrderStatus(orderId, 'cancelled', { note, actor });
  cancelPendingCalls(orderId, 'الطلب تلغى');
  audit('order.cancel', { user, actor, entity: 'orders', entityId: orderId, details: { note } });
  return { ok: true };
}
