import { verifyHmac, guessMethod, num, httpJson, ConnectorError, paymentKind } from './base.js';

const API_VERSION = '2025-01';

export default {
  platform: 'shopify', name: 'Shopify', docsUrl: 'https://shopify.dev/docs/apps/build/webhooks',
  docsStatus: 'documented',
  docsNote: 'Webhook orders/create موقّع بـ X-Shopify-Hmac-Sha256 (base64). رقم التتبع يتزامن عبر Admin GraphQL fulfillmentCreate (يحتاج صلاحيات write_merchant_managed_fulfillment_orders أو write_fulfillments).',
  capabilities: { webhookOrders: true, statusSync: true, trackingSync: true },
  credentialFields: [
    { key: 'shop_domain', label: 'دومين المتجر (xxx.myshopify.com)', secret: false },
    { key: 'admin_token', label: 'Admin API access token', secret: true },
    { key: 'webhook_secret', label: 'Webhook signing secret (API secret key)', secret: true },
  ],
  settingsFields: [],
  webhookHelp: 'Settings → Notifications → Webhooks → Order creation (JSON) — حط الرابط هذا، أو أنشئه من تطبيق مخصّص.',

  verifyWebhook(account, req) { return verifyHmac(req, account.credentials?.webhook_secret, 'x-shopify-hmac-sha256', 'base64'); },
  eventKey(req, body) { return req.headers['x-shopify-webhook-id'] || `order:${body?.id}`; },
  isOrderEvent(req) { const t = req.headers['x-shopify-topic']; return !t || t === 'orders/create'; },

  parseOrder(o) {
    const a = o.shipping_address || o.billing_address || {};
    const ship = o.shipping_lines?.[0];
    return {
      externalId: String(o.id), externalNumber: o.name || String(o.order_number || o.id),
      customerName: [a.first_name, a.last_name].filter(Boolean).join(' ') || o.customer?.first_name || '',
      phone: a.phone || o.phone || o.customer?.phone || '',
      wilayaText: a.province || a.city || '', commune: a.city || '', address: [a.address1, a.address2].filter(Boolean).join(' '),
      method: guessMethod(ship?.title, ship?.code),
      items: (o.line_items || []).map((li) => ({ sku: li.sku, name: li.title || li.name, qty: Number(li.quantity) || 1, unitPrice: num(li.price) })),
      deliveryFee: num(ship?.price), total: num(o.total_price), note: o.note || '',
      paymentMethod: paymentKind(o.payment_gateway_names, o.gateway),
    };
  },

  async testConnection(account) {
    if (account.mode === 'simulation') return { ok: true, message: 'وضع تجريبي' };
    const c = account.credentials || {};
    if (!c.shop_domain || !c.admin_token) throw new ConnectorError('auth', 'الدومين والتوكن ناقصين');
    const r = await this.gql(account, '{ shop { name } }');
    return { ok: true, message: `متصل بـ ${r?.data?.shop?.name}` };
  },

  async gql(account, query, variables) {
    const c = account.credentials;
    return httpJson(`https://${c.shop_domain}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST', headers: { 'X-Shopify-Access-Token': c.admin_token }, body: { query, variables },
    });
  },

  async pushUpdate(account, order, ev) {
    if (account.mode === 'simulation') return { ok: true, message: `محاكاة: ${ev.type} ${ev.tracking || ''}` };
    if (ev.type !== 'shipped') return { ok: true, message: 'Shopify: التسليم يتحدّث من جهة الشحن، ما يلزمش تحديث' };
    const gid = `gid://shopify/Order/${order.external_id}`;
    const fo = await this.gql(account, `query($id:ID!){ order(id:$id){ fulfillmentOrders(first:5){ nodes{ id status } } } }`, { id: gid });
    const nodes = (fo?.data?.order?.fulfillmentOrders?.nodes || []).filter((n) => n.status === 'OPEN' || n.status === 'IN_PROGRESS');
    if (!nodes.length) return { ok: false, message: 'ما كانش fulfillment order مفتوح' };
    const r = await this.gql(account,
      `mutation($f: FulfillmentInput!){ fulfillmentCreate(fulfillment:$f){ fulfillment{ id } userErrors{ field message } } }`,
      { f: { lineItemsByFulfillmentOrder: nodes.map((n) => ({ fulfillmentOrderId: n.id })), trackingInfo: { company: ev.carrierName, number: ev.tracking }, notifyCustomer: false } });
    const errs = r?.data?.fulfillmentCreate?.userErrors || [];
    if (errs.length) throw new ConnectorError('remote', errs.map((e) => e.message).join('، '));
    return { ok: true, message: 'تم تحديث رقم التتبع في Shopify' };
  },
};
