import { verifyHmac, guessMethod, num, httpJson, ConnectorError, paymentKind } from './base.js';

const STATUS = { shipped: 'processing', delivered: 'completed', returned: 'refunded', cancelled: 'cancelled' };

export default {
  platform: 'woocommerce', name: 'WordPress + WooCommerce', docsUrl: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
  docsStatus: 'documented',
  docsNote: 'Webhook "Order created" موقّع بـ X-WC-Webhook-Signature (base64 HMAC-SHA256). التحديث عبر REST API v3 (PUT /orders/{id} + ملاحظة بالتتبع).',
  capabilities: { webhookOrders: true, statusSync: true, trackingSync: true },
  credentialFields: [
    { key: 'site_url', label: 'رابط الموقع (https://...)', secret: false },
    { key: 'consumer_key', label: 'Consumer key', secret: true },
    { key: 'consumer_secret', label: 'Consumer secret', secret: true },
    { key: 'webhook_secret', label: 'Webhook secret', secret: true },
  ],
  settingsFields: [{ key: 'sync_status', label: 'بدّل حالة الطلب في WooCommerce', type: 'checkbox' }],
  webhookHelp: 'WooCommerce → Settings → Advanced → Webhooks → Add: Topic = Order created، Delivery URL = الرابط هذا، Secret = نفس السر.',

  verifyWebhook(account, req) { return verifyHmac(req, account.credentials?.webhook_secret, 'x-wc-webhook-signature', 'base64'); },
  eventKey(req, body) { return req.headers['x-wc-webhook-delivery-id'] ? `d:${req.headers['x-wc-webhook-delivery-id']}` : `order:${body?.id}`; },
  isOrderEvent(req, body) {
    const t = req.headers['x-wc-webhook-topic'];
    return Boolean(body?.id) && (!t || t === 'order.created');
  },

  parseOrder(o) {
    const s = o.shipping?.address_1 ? o.shipping : o.billing || {};
    const ship = o.shipping_lines?.[0];
    return {
      externalId: String(o.id), externalNumber: String(o.number || o.id),
      customerName: [s.first_name, s.last_name].filter(Boolean).join(' '),
      phone: o.billing?.phone || s.phone || '',
      wilayaText: String(s.state || '').replace(/^DZ-/, '') || s.city || '', commune: s.city || '',
      address: [s.address_1, s.address_2].filter(Boolean).join(' '),
      method: guessMethod(ship?.method_title, ship?.method_id),
      items: (o.line_items || []).map((li) => ({ sku: li.sku, name: li.name, qty: Number(li.quantity) || 1, unitPrice: num(li.price) })),
      deliveryFee: num(ship?.total), total: num(o.total), note: o.customer_note || '',
      paymentMethod: paymentKind(o.payment_method, o.payment_method_title),
    };
  },

  auth(account) {
    const c = account.credentials || {};
    if (!c.site_url || !c.consumer_key || !c.consumer_secret) throw new ConnectorError('auth', 'الرابط والمفاتيح ناقصين');
    return { base: `${c.site_url.replace(/\/$/, '')}/wp-json/wc/v3`, headers: { Authorization: 'Basic ' + Buffer.from(`${c.consumer_key}:${c.consumer_secret}`).toString('base64') } };
  },

  async testConnection(account) {
    if (account.mode === 'simulation') return { ok: true, message: 'وضع تجريبي' };
    const { base, headers } = this.auth(account);
    await httpJson(`${base}/system_status`, { headers });
    return { ok: true, message: 'الاتصال ناجح' };
  },

  async pushUpdate(account, order, ev) {
    if (account.mode === 'simulation') return { ok: true, message: `محاكاة: ${ev.type} ${ev.tracking || ''}` };
    const { base, headers } = this.auth(account);
    const body = { meta_data: [{ key: '_zinor_tracking', value: ev.tracking || '' }, { key: '_zinor_carrier', value: ev.carrierName || '' }] };
    if (account.settings?.sync_status !== false && STATUS[ev.type]) body.status = STATUS[ev.type];
    await httpJson(`${base}/orders/${order.external_id}`, { method: 'PUT', headers, body });
    if (ev.tracking) await httpJson(`${base}/orders/${order.external_id}/notes`, { method: 'POST', headers, body: { note: `Zinor: ${ev.type} — ${ev.carrierName || ''} ${ev.tracking}` } });
    return { ok: true, message: 'تم تحديث الطلب في WooCommerce' };
  },
};
