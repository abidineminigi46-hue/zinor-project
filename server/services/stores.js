// استقبال طلبات المتاجر المربوطة + التأكيد عبر واتساب + مزامنة الحالة/التتبع
import { db, now } from '../db.js';
import { loadAccount, httpErr } from './accounts.js';
import { createOrder, getOrder, recalcOrder, setOrderStatus } from './orders.js';
import { findWilaya, wilayaByCode } from '../data/wilayas.js';
import { productBySku, searchProducts } from './catalog.js';
import { normPhone, upsertCustomerByWa } from './customers.js';
import { getOrCreateConversation, saveState } from './conversations.js';
import { sendNotification } from './whatsapp.js';
import { orderVars } from './notifications.js';
import { audit, logError } from './audit.js';
import { startConfirmation } from '../calls/engine.js';

export async function ingestStoreWebhook(accountId, req) {
  const account = loadAccount('store', accountId, { includeDeleted: true });
  if (!account || account.deleted_at) throw httpErr(404, 'ربط غير موجود');
  if (!account.enabled) { audit('store.webhook.disabled', { level: 'error', entity: 'store_accounts', entityId: accountId }); throw httpErr(409, 'الربط معطّل'); }
  const c = account.connector;
  const signed = c.verifyWebhook(account, req);
  if (!signed && account.mode === 'live') {
    db.update('store_accounts', accountId, { last_error: 'توقيع webhook غير صالح', status: 'error' });
    audit('store.webhook.bad_signature', { level: 'error', entity: 'store_accounts', entityId: accountId });
    throw httpErr(401, 'توقيع غير صالح');
  }
  const body = req.body;
  if (!c.isOrderEvent(req, body)) return { ignored: true };
  const key = `${accountId}:${c.eventKey(req, body)}`;
  const fresh = db.run('INSERT OR IGNORE INTO webhook_events(source, event_key) VALUES(?,?)', 'store', key);
  if (!fresh.changes) return { duplicate: true };
  const n = c.parseOrder(body, account);
  const existing = db.get('SELECT * FROM orders WHERE store_account_id=? AND external_id=?', accountId, n.externalId);
  if (existing) return { duplicate: true, order: existing };
  db.update('store_accounts', accountId, { last_event_at: now(), last_error: null });
  return { order: await importOrder(account, n) };
}

export async function importOrder(account, n) {
  const w = /^\d{1,2}$/.test(String(n.wilayaText).trim()) ? wilayaByCode(n.wilayaText) : findWilaya(n.wilayaText) || findWilaya(n.commune);
  const wa = normPhone(n.phone);
  const customer = wa ? upsertCustomerByWa(wa, { name: n.customerName, phone: n.phone, wilaya_code: w?.code, commune: n.commune, address: n.address }) : null;
  const items = n.items.map((it) => {
    const p = (it.sku && productBySku(it.sku)) || searchProducts(it.name || '')[0];
    return p ? { productId: p.id, qty: it.qty, unitPrice: it.unitPrice } : { sku: it.sku, name: it.name, qty: it.qty, unitPrice: it.unitPrice };
  });
  const order = createOrder({
    source: 'store', storeAccountId: account.id, storePlatform: account.code, externalId: n.externalId, externalNumber: n.externalNumber,
    customerId: customer?.id, customerName: n.customerName, phone: n.phone, waPhone: wa, wilayaCode: w?.code ?? null,
    commune: n.commune || null, address: n.address || null, deliveryMethod: n.method, items, status: 'awaiting_confirmation',
    notes: n.note || null, paymentMethod: n.paymentMethod ?? null,
  }, { actor: `store:${account.code}` });
  if (order.wilaya_code && order.delivery_method) recalcOrder(order.id);
  startConfirmation(order.id); // واتساب / مكالمة / الاثنين / يدوي — حسب إعداد المصدر
  return getOrder(order.id);
}

export function confirmationButtons(orderId) {
  return [{ id: `oc:confirm:${orderId}`, title: 'نأكد الطلب' }, { id: `oc:edit:${orderId}`, title: 'نبدّل المعلومات' }, { id: `oc:cancel:${orderId}`, title: 'نلغي الطلب' }];
}

export function sendOrderConfirmation(order) {
  const conv = getOrCreateConversation(order.wa_phone);
  if (!order.conversation_id) db.update('orders', order.id, { conversation_id: conv.id });
  conv.state.pending_order_id = order.id;
  saveState(conv);
  return sendNotification(conv, 'order_confirmation', orderVars(order), confirmationButtons(order.id));
}

// مزامنة الحالة/التتبع مع المنصّة (إذا تدعم)
export async function syncStore(order, ev) {
  if (!order.store_account_id) return;
  const account = loadAccount('store', order.store_account_id, { includeDeleted: true });
  if (!account || account.deleted_at || !account.enabled) return;
  try {
    const r = await account.connector.pushUpdate(account, order, ev);
    audit('store.sync', { entity: 'orders', entityId: order.id, level: r.ok ? 'info' : 'error', details: { ...r, event: ev.type } });
  } catch (e) {
    logError('store.sync', e, { entity: 'orders', entityId: order.id, retryable: true, details: { event: ev.type } });
  }
}
