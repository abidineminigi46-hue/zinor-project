// إشعارات واتساب التلقائية — كل إشعار يتبعث مرة وحدة (dedupe_key)
import { db } from '../db.js';
import { getSetting } from './settings.js';
import { getOrCreateConversation } from './conversations.js';
import { sendNotification } from './whatsapp.js';
import { normPhone } from './customers.js';
import { wilayaByCode } from '../data/wilayas.js';
import { orderSummaryLines } from './orders.js';

export function orderVars(order, extra = {}) {
  const w = wilayaByCode(order.wilaya_code);
  const store = getSetting('store');
  return {
    name: (order.customer_name || '').split(' ')[0] || '', order: order.number, total: order.total, tracking: order.tracking ? `\u2068${order.tracking}\u2069` : '',
    carrier: order.carrier_code ? ({ yalidine: 'Yalidine', zr_express: 'ZR Express' }[order.carrier_code] || order.carrier_code) : '',
    wilaya: w?.ar || '', commune: order.commune || '', store: store.name,
    delivery: order.delivery_method === 'desk' ? 'للمكتب (Stop desk)' : 'للدار', items: orderSummaryLines(order), eta: '', reason: '',
    ...extra,
  };
}

export function conversationForOrder(order) {
  const phone = order.wa_phone || normPhone(order.phone);
  return phone ? getOrCreateConversation(phone) : null;
}

/** يرجّع true إذا تبعث، false إذا مكرّر/معطّل */
export function notifyOnce(order, kind, dedupeKey, extraVars = {}) {
  const enabled = getSetting('notifications');
  if (kind in enabled && !enabled[kind]) return false;
  const conv = conversationForOrder(order);
  if (!conv) return false;
  const r = db.run('INSERT OR IGNORE INTO notifications(dedupe_key, order_id, kind) VALUES(?,?,?)', dedupeKey, order.id, kind);
  if (!r.changes) return false;
  const msgId = sendNotification(conv, kind, orderVars(order, extraVars));
  db.run('UPDATE notifications SET message_id=? WHERE dedupe_key=?', msgId, dedupeKey);
  return true;
}
