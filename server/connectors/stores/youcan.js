import { makeGeneric } from './generic.js';
import { guessMethod, num } from './base.js';

// YouCan Open API: webhooks REST hooks (order.create) — https://developer.youcan.shop
export default makeGeneric({
  platform: 'youcan', name: 'YouCan', docsUrl: 'https://developer.youcan.shop/',
  docsStatus: 'needs_verification',
  docsNote: 'YouCan عندها Open API (OAuth) و REST hooks لحدث order.create. الاستقبال مبني على صيغة الطلب في التوثيق؛ رأس التوقيع (x-youcan-signature) وتحديث الحالة عبر الـAPI يلزم يتأكدو مع تطبيقك في YouCan Partners.',
  signatureHeader: 'x-youcan-signature',
  webhookHelp: 'أنشئ تطبيق في YouCan Partners واشترك في حدث order.create بالرابط هذا.',
  parse(o) {
    const d = o.data || o;
    const addr = d.shipping?.address || d.customer?.address || {};
    return {
      externalId: String(d.id), externalNumber: String(d.ref || d.id),
      customerName: d.customer?.full_name || [d.customer?.first_name, d.customer?.last_name].filter(Boolean).join(' '),
      phone: d.customer?.phone || addr.phone || '', wilayaText: addr.region || addr.state || addr.city || '',
      commune: addr.city || '', address: addr.first_line || addr.address || '', method: guessMethod(d.shipping?.name),
      items: (d.variants || d.items || []).map((v) => ({ sku: v.variant?.sku || v.sku, name: v.product?.name || v.name, qty: Number(v.quantity) || 1, unitPrice: num(v.price) })),
      deliveryFee: num(d.shipping?.price), total: num(d.total), note: d.notes || '',
    };
  },
});
