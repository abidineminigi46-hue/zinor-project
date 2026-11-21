# إضافة شركة توصيل أو منصّة متجر جديدة

منطق الكوموندات (`services/orders.js`، `shipping.js`، `stores.js`) ما يعرفش تفاصيل حتى شركة. كل شركة/منصّة عندها **موصّل مستقل** يطبّق نفس الواجهة الداخلية. كي تزيد موصّل وتسجّلو، يبان أوتوماتيكياً في اللوحة وتقدر تزيد حساب، تفعّلو، تعطّلو أو تنحّي الربط.

## شركة توصيل جديدة

1. أنشئ `server/connectors/carriers/<code>.js` (انسخ `yalidine.js` كمثال) وصدّر object بهاذ الشكل:

```js
export default {
  code: 'my_carrier', name: 'My Carrier', docsUrl: 'https://...',
  docsStatus: 'documented' | 'needs_verification' | 'not_public',
  docsNote: 'واش مربوط وواش ناقص بالضبط',
  capabilities: { createShipment, tracking, webhook, polling, returnPickup, stopDesks, outForDeliveryStatus, eta },
  credentialFields: [{ key: 'api_key', label: 'API key', secret: true }],
  settingsFields: [],
  // خريطة الحالات: حالة الشركة ← حالة موحّدة
  statusMap: { 'Out for delivery': 'out_for_delivery', 'Delivered': 'delivered', /* ... */ },
  async testConnection(account) {},                 // → { ok, message }
  async createShipment(account, input) {},          // → { tracking, externalId, labelUrl }
  async findShipment(account, reference) {},        // → { tracking } | null — ضروري لإعادة المحاولة بلا تكرار
  async getTracking(account, tracking) {},          // → [{ externalStatus, occurredAt, note, eta?, eventId? }]
  verifyWebhook(account, req) {},                   // req.rawBody + req.headers
  parseWebhook(account, body) {},                   // → [{ eventId, tracking, externalStatus, occurredAt, note }]
  async requestReturnPickup(account, input) {},     // أو throw new ConnectorError('not_supported', '...')
};
```

2. سجّلو في `server/connectors/carriers/index.js`.
3. في كل دالة، إذا `account.mode === 'simulation'` استعمل `simulator` من `base.js` باش يبقى قابل للتجربة بلا مفاتيح.

**الحالات الموحّدة:** `created`, `picked_up`, `in_transit`, `at_hub`, `out_for_delivery`, `delivery_failed`, `delivered`, `returning`, `returned`, `cancelled`.
التذكير قبل التوصيل يتبعث كي الشحنة تدخل `out_for_delivery`. إذا الشركة ما عندهاش هاذ الحالة، حط `outForDeliveryStatus: false` — اللوحة تبيّن بلي التذكير ما يخدمش معاها.

**أخطاء:** استعمل `ConnectorError(kind, message)` — `kind: 'unknown_result'` كي الطلب تبعث بصح الجواب ضاع (الخادم يتحقق بـ`findShipment` قبل أي إعادة)، `'validation'`/`'remote'` كي الشركة رفضت، `'auth'` للمفاتيح.

**خريطة الحالات بلا كود:** في إعدادات الحساب تقدر تحط `status_map_overrides` (JSON) باش تزيد/تبدّل حالات بلا ما تمسّ الموصّل.

## منصّة متجر جديدة

1. الأسهل: `makeGeneric({...})` من `server/connectors/stores/generic.js` مع دالة `parse(body)` ترجّع الطلب الموحّد:

```js
{ externalId, externalNumber, customerName, phone, wilayaText, commune, address,
  method: 'home' | 'desk' | null, items: [{ sku, name, qty, unitPrice }], deliveryFee, total, note }
```

2. أو موصّل كامل (شوف `shopify.js`) مع `verifyWebhook`, `eventKey`, `isOrderEvent`, `parseOrder`, `testConnection`, `pushUpdate(account, order, { type: 'shipped'|'delivered'|'returned', tracking, carrierName })`.
3. سجّلو في `server/connectors/stores/index.js`.

**بلا كود:** منصّة تقدر تبعث JSON موقّع تخدم دابا عبر حساب Ayor/Justsell (Webhook عام) مع «خريطة الحقول» في الإعدادات، مثلاً:
`{"phone":"billing.phone","customerName":"billing.name","wilayaText":"shipping.state","items":"line_items","itemQty":"quantity"}`

الطلبات والشحنات القديمة تبقى في النظام بعد تعطيل الحساب أو نزع الربط (المفاتيح برك اللي تتمسح).
