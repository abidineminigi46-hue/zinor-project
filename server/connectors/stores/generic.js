// موصّل عام بـ Webhook JSON موقّع — يُستعمل للمنصّات اللي توثيقها ماشي عمومي (Ayor, Justsell)
// أو كأساس لمنصّة جديدة. الصيغة الافتراضية (Zinor JSON):
// { id, number, customer:{name,phone}, wilaya, commune, address, delivery_method:'home'|'desk',
//   items:[{sku,name,qty,price}], shipping_fee, total, note }
// التوقيع: رأس X-Zinor-Signature = hex(HMAC-SHA256(body, webhook_secret))
// إذا المنصّة تبعث صيغة أخرى، حدّد "خريطة الحقول" (field_map) في إعدادات الحساب.
import { verifyHmac, guessMethod, num, pick } from './base.js';

const DEFAULT_MAP = {
  externalId: 'id', externalNumber: 'number', customerName: 'customer.name', phone: 'customer.phone',
  wilayaText: 'wilaya', commune: 'commune', address: 'address', method: 'delivery_method',
  items: 'items', itemSku: 'sku', itemName: 'name', itemQty: 'qty', itemPrice: 'price',
  deliveryFee: 'shipping_fee', total: 'total', note: 'note',
};

export function genericParse(body, map = {}) {
  const m = { ...DEFAULT_MAP, ...map };
  const items = pick(body, m.items) || [];
  return {
    externalId: String(pick(body, m.externalId) ?? ''), externalNumber: String(pick(body, m.externalNumber) ?? pick(body, m.externalId) ?? ''),
    customerName: pick(body, m.customerName) || '', phone: String(pick(body, m.phone) || ''),
    wilayaText: String(pick(body, m.wilayaText) || ''), commune: pick(body, m.commune) || '', address: pick(body, m.address) || '',
    method: ['home', 'desk'].includes(pick(body, m.method)) ? pick(body, m.method) : guessMethod(pick(body, m.method)),
    items: items.map((it) => ({ sku: pick(it, m.itemSku), name: pick(it, m.itemName) || pick(it, m.itemSku), qty: Number(pick(it, m.itemQty)) || 1, unitPrice: num(pick(it, m.itemPrice)) })),
    deliveryFee: num(pick(body, m.deliveryFee)), total: num(pick(body, m.total)), note: pick(body, m.note) || '',
  };
}

export function makeGeneric({ platform, name, docsUrl, docsStatus = 'not_public', docsNote, signatureHeader = 'x-zinor-signature', signatureEnc = 'hex', parse, extraCredentials = [], webhookHelp }) {
  return {
    platform, name, docsUrl, docsStatus, docsNote,
    capabilities: { webhookOrders: true, statusSync: false, trackingSync: false },
    credentialFields: [{ key: 'webhook_secret', label: 'Webhook secret', secret: true }, ...extraCredentials],
    settingsFields: [{ key: 'field_map', label: 'خريطة الحقول (JSON اختياري)', type: 'json' }],
    webhookHelp: webhookHelp || `ابعث الطلبات بـ POST JSON للرابط هذا، موقّعة في الرأس ${signatureHeader}.`,
    verifyWebhook(account, req) { return verifyHmac(req, account.credentials?.webhook_secret, signatureHeader, signatureEnc); },
    eventKey(req, body) { return `order:${body?.id ?? body?.data?.id ?? body?.order?.id}`; },
    isOrderEvent(req, body) { return Boolean(body?.id ?? body?.data?.id ?? body?.order?.id); },
    parseOrder(body, account) { return parse ? parse(body, account) : genericParse(body, account?.settings?.field_map || {}); },
    async testConnection(account) {
      if (account.mode === 'simulation') return { ok: true, message: 'وضع تجريبي' };
      if (!account.credentials?.webhook_secret) return { ok: false, message: 'السر (webhook secret) ناقص' };
      return { ok: true, message: 'الإعدادات كاملة — ابعث طلب تجريبي من المنصّة باش نتأكدو' };
    },
    async pushUpdate(account, order, ev) {
      if (account.mode === 'simulation') return { ok: true, message: `محاكاة: ${ev.type} ${ev.tracking || ''}` };
      return { ok: false, message: `${name}: مزامنة الحالة/التتبع غير متاحة (ما كانش توثيق API عمومي)` };
    },
  };
}
