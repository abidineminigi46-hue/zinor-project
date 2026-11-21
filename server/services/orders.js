import { db, now } from '../db.js';
import { getProduct, productBySku, deliveryFee } from './catalog.js';
import { wilayaByCode } from '../data/wilayas.js';
import { localPhone, isValidDzMobile } from './customers.js';
import { audit } from './audit.js';
import { httpErr } from './accounts.js';

export const ORDER_STATUS = {
  new: 'جديدة', awaiting_confirmation: 'تستنى التأكيد', needs_review: 'تحتاج مراجعة', confirmed: 'مؤكدة',
  dispatching: 'قيد الإرسال', dispatch_failed: 'فشل الإرسال', dispatch_unknown: 'نتيجة غير واضحة', shipped: 'مرسلة',
  out_for_delivery: 'مع الليفرور', delivery_failed: 'فشل التوصيل', delivered: 'مسلّمة', returning: 'راجعة',
  returned: 'رجعت للمخزن', cancelled: 'ملغاة',
};

export const getOrder = (id) => db.get('SELECT * FROM orders WHERE id=?', id);
export const orderByNumber = (n) => db.get('SELECT * FROM orders WHERE number=?', String(n).toUpperCase());
export const orderItems = (id) => db.all('SELECT * FROM order_items WHERE order_id=?', id);

export function setOrderStatus(orderId, status, { note, actor = 'system', extra = {} } = {}) {
  const o = getOrder(orderId);
  if (!o) return;
  db.update('orders', orderId, { status, updated_at: now(), ...extra });
  if (o.status !== status || note) db.insert('order_events', { order_id: orderId, status, note: note ?? null, actor });
}

/**
 * إنشاء طلب — الخادم يحسب الأسعار من الكتالوج (ما يثقش في أسعار جاية من برّا) ويتحقق من المنتجات.
 * items: [{ productId | sku, qty, name?, unitPrice? }]
 */
export function createOrder(input, { actor = 'system', user } = {}) {
  return db.tx(() => {
    const items = (input.items || []).map((it) => {
      const p = it.productId ? getProduct(it.productId) : it.sku ? productBySku(it.sku) : null;
      return {
        product_id: p?.id ?? null, sku: p?.sku ?? it.sku ?? null, name: p?.name ?? it.name ?? 'منتج غير معروف',
        qty: Math.max(1, Number(it.qty) || 1),
        unit_price: input.source === 'store' ? (Number(it.unitPrice) || p?.price || 0) : (p?.price ?? Number(it.unitPrice) ?? 0),
        catalog_price: p?.price ?? null,
      };
    });
    if (!items.length) throw httpErr(400, 'الطلب ما فيه حتى منتج');
    const itemsTotal = items.reduce((s, i) => s + i.unit_price * i.qty, 0);
    const fee = input.deliveryFee ?? (input.wilayaCode && input.deliveryMethod ? deliveryFee(input.wilayaCode, input.deliveryMethod) : 0) ?? 0;
    const max = db.get('SELECT COALESCE(MAX(id),0) AS m FROM orders').m;
    const id = db.insert('orders', {
      number: `ZN${1001 + max}`, source: input.source, store_account_id: input.storeAccountId ?? null, store_platform: input.storePlatform ?? null,
      external_id: input.externalId ?? null, customer_id: input.customerId ?? null, conversation_id: input.conversationId ?? null,
      customer_name: input.customerName ?? null, phone: localPhone(input.phone) ?? null, wa_phone: input.waPhone ?? null,
      wilaya_code: input.wilayaCode ?? null, commune: input.commune ?? null, address: input.address ?? null,
      delivery_method: input.deliveryMethod ?? null, stopdesk_id: input.stopdeskId ?? null,
      items_total: itemsTotal, delivery_fee: fee || 0, total: itemsTotal + (fee || 0), status: input.status || 'new',
      carrier_account_id: input.carrierAccountId ?? null, consent_message_id: input.consentMessageId ?? null, consent_text: input.consentText ?? null,
      confirmed_at: input.status === 'confirmed' ? now() : null, confirmed_via: input.confirmedVia ?? null, notes: input.notes ?? null,
      created_by: user?.id ?? null,
    });
    for (const it of items) db.insert('order_items', { order_id: id, product_id: it.product_id, sku: it.sku, name: it.name, qty: it.qty, unit_price: it.unit_price });
    db.insert('order_events', { order_id: id, status: input.status || 'new', note: `مصدر: ${input.source}${input.externalNumber ? ' #' + String(input.externalNumber).replace(/^#/, '') : ''}`, actor });
    audit('order.create', { user, actor, entity: 'orders', entityId: id, details: { source: input.source, total: itemsTotal + (fee || 0) } });
    return getOrder(id);
  });
}

// إعادة حساب المجموع بعد التعديل
export function recalcOrder(orderId) {
  const o = getOrder(orderId);
  const items = orderItems(orderId);
  const itemsTotal = items.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const fee = o.wilaya_code && o.delivery_method ? deliveryFee(o.wilaya_code, o.delivery_method) ?? o.delivery_fee : o.delivery_fee;
  db.update('orders', orderId, { items_total: itemsTotal, delivery_fee: fee, total: itemsTotal + fee, updated_at: now() });
  return getOrder(orderId);
}

/** التحقق قبل الإرسال لشركة التوصيل: المنتج، الثمن، المخزون، البيانات */
export function validateOrder(order) {
  const errors = [], warnings = [];
  const items = orderItems(order.id);
  if (!items.length) errors.push('ما كانش منتجات');
  for (const it of items) {
    const p = it.product_id ? getProduct(it.product_id) : null;
    if (!p) { errors.push(`منتج غير معروف في الكتالوج: ${it.name}${it.sku ? ' (' + it.sku + ')' : ''}`); continue; }
    if (!p.active) errors.push(`المنتج موقّف: ${p.name}`);
    if (p.stock < it.qty) errors.push(`المخزون ما يكفيش: ${p.name} (متوفر ${p.stock})`);
    if (it.unit_price !== p.price) warnings.push(`سعر ${p.name} في الطلب ${it.unit_price} ≠ الكتالوج ${p.price}`);
  }
  if (!order.customer_name || order.customer_name.trim().length < 2) errors.push('اسم الزبون ناقص');
  if (!order.phone || !isValidDzMobile(order.phone)) errors.push('رقم الهاتف ناقص أو غير صالح');
  if (!wilayaByCode(order.wilaya_code)) errors.push('الولاية ناقصة');
  if (!order.commune) errors.push('البلدية ناقصة');
  if (!['home', 'desk'].includes(order.delivery_method)) errors.push('طريقة التوصيل ناقصة');
  if (order.delivery_method === 'home' && !order.address) errors.push('العنوان ناقص (توصيل للدار)');
  if (order.delivery_method === 'desk') {
    const desks = db.get('SELECT COUNT(*) AS n FROM stopdesks WHERE wilaya_code=?', order.wilaya_code).n;
    if (desks && !order.stopdesk_id) errors.push('مكتب الاستلام ناقص');
  }
  const fee = order.wilaya_code && order.delivery_method ? deliveryFee(order.wilaya_code, order.delivery_method) : null;
  if (order.delivery_method && order.wilaya_code && fee == null) errors.push('التوصيل غير متوفر لهاذ الولاية/الطريقة');
  const calc = items.reduce((s, i) => s + i.unit_price * i.qty, 0) + (order.delivery_fee || 0);
  if (calc !== order.total) errors.push(`المجموع ما يطابقش (${order.total} ≠ ${calc})`);
  return { ok: errors.length === 0, errors, warnings };
}

export function orderSummaryLines(order) {
  const items = orderItems(order.id);
  return items.map((i) => `• ${i.name} ×${i.qty} — ${i.unit_price * i.qty} دج`).join('\n');
}

export function adjustStock(orderId, sign) {
  for (const it of orderItems(orderId)) if (it.product_id) db.run('UPDATE products SET stock=stock+? WHERE id=?', sign * it.qty, it.product_id);
}

export function listOrders(f = {}) {
  const where = [], p = [];
  if (f.q) {
    const q = String(f.q).trim();
    const digits = q.replace(/\D/g, '');
    where.push('(o.number LIKE ? OR o.tracking LIKE ? OR o.phone LIKE ? OR o.customer_name LIKE ?' + (digits.length >= 6 ? ' OR o.phone LIKE ? OR o.wa_phone LIKE ?' : '') + ')');
    p.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    if (digits.length >= 6) p.push(`%${digits.slice(-8)}%`, `%${digits.slice(-8)}%`);
  }
  if (f.source) { where.push('o.source=?'); p.push(f.source); }
  if (f.status) { where.push('o.status=?'); p.push(f.status); }
  if (f.wilaya) { where.push('o.wilaya_code=?'); p.push(Number(f.wilaya)); }
  if (f.carrier) { where.push('o.carrier_account_id=?'); p.push(Number(f.carrier)); }
  if (f.from) { where.push('date(o.created_at)>=date(?)'); p.push(f.from); }
  if (f.to) { where.push('date(o.created_at)<=date(?)'); p.push(f.to); }
  const sql = `SELECT o.*, ca.label AS carrier_label FROM orders o LEFT JOIN carrier_accounts ca ON ca.id=o.carrier_account_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC LIMIT ${Math.min(Number(f.limit) || 200, 500)}`;
  return db.all(sql, ...p);
}
