import { makeGeneric } from './generic.js';
import { guessMethod, num } from './base.js';

// Lightfunnels: GraphQL API + webhooks (order/confirmed) — https://developers.lightfunnels.com
export default makeGeneric({
  platform: 'lightfunnels', name: 'Lightfunnels', docsUrl: 'https://developers.lightfunnels.com/',
  docsStatus: 'needs_verification',
  docsNote: 'Lightfunnels عندها GraphQL API و webhooks للطلبات. الاستقبال مبني على حقول الطلب الموثّقة؛ اسم رأس التوقيع وmutation تحديث التتبع يلزم يتأكدو من تطبيقك. لين نتأكدو: المزامنة معطّلة.',
  signatureHeader: 'lightfunnels-hmac', signatureEnc: 'base64',
  webhookHelp: 'من Lightfunnels Developers أنشئ تطبيق واشترك في order/confirmed بالرابط هذا.',
  parse(o) {
    const d = o.node || o.order || o;
    const a = d.shipping_address || d.billing_address || {};
    return {
      externalId: String(d.id), externalNumber: String(d.name || d.id),
      customerName: d.customer?.full_name || [a.first_name, a.last_name].filter(Boolean).join(' '),
      phone: a.phone || d.phone || d.customer?.phone || '', wilayaText: a.state || a.city || '', commune: a.city || '',
      address: [a.line1, a.line2].filter(Boolean).join(' '), method: guessMethod(d.shipping_method?.name),
      items: (d.items || []).map((i) => ({ sku: i.sku, name: i.title, qty: Number(i.quantity) || 1, unitPrice: num(i.price) })),
      deliveryFee: num(d.shipping), total: num(d.total), note: d.notes || '',
    };
  },
});
