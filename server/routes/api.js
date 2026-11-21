import { Router, send } from '../http.js';
import { db, now } from '../db.js';
import { config, waLive, aiLive } from '../config.js';
import { login, logout, sessionCookie } from '../auth.js';
import { hashPassword, hmac } from '../crypto.js';
import { WILAYAS, wilayaByCode, findWilaya } from '../data/wilayas.js';
import { ORDER_STATUS, listOrders, getOrder, orderItems, createOrder, recalcOrder, setOrderStatus, validateOrder } from '../services/orders.js';
import { dispatchOrder, refreshTracking, simulateCarrierStatus } from '../services/shipping.js';
import { SHIP_STATUS } from '../connectors/carriers/base.js';
import { RETURN_STATUS, REASONS, listReturns, decideReturn, receiveReturn } from '../services/returns.js';
import { listAccounts, connectorCatalog, createAccount, updateAccount, removeAccount, testAccount, setDefaultCarrier, loadAccount, httpErr } from '../services/accounts.js';
import { allSettings, setSetting, getSetting, DEFAULTS } from '../services/settings.js';
import { getConversation, listMessages, setMode, saveState, conversationByPhone } from '../services/conversations.js';
import { sendText } from '../services/whatsapp.js';
import { processWhatsAppWebhook } from '../services/inbound.js';
import { ingestStoreWebhook, sendOrderConfirmation } from '../services/stores.js';
import { audit } from '../services/audit.js';
import { draftView } from '../ai/tools.js';
import { engineName } from '../ai/agent.js';
import { listProducts } from '../services/catalog.js';
import { normPhone } from '../services/customers.js';

export const api = new Router();
const admin = (req) => { if (req.user?.role !== 'admin') throw httpErr(403, 'هاذي الصفحة للمشرف برك'); };
const int = (v) => (v === '' || v == null ? null : Number(v));

// ───── الدخول ─────
api.post('/api/login', (req, res) => {
  const r = login(req.body.email, req.body.password);
  if (!r) return send(res, 401, { error: 'الإيميل ولا كلمة السر غالطين' });
  audit('auth.login', { user: r.user });
  send(res, 200, { user: r.user }, { 'Set-Cookie': sessionCookie(r.token, config.publicUrl.startsWith('https')) });
}, { public: true });
api.post('/api/logout', (req, res) => { logout(req.user.token); send(res, 200, { ok: true }, { 'Set-Cookie': 'zsid=; Path=/; Max-Age=0' }); });
api.get('/api/me', (req, res) => send(res, 200, { user: req.user }));

api.get('/api/meta', (req, res) => send(res, 200, {
  orderStatus: ORDER_STATUS, shipStatus: Object.fromEntries(Object.entries(SHIP_STATUS).map(([k, v]) => [k, v.ar])),
  returnStatus: RETURN_STATUS, reasons: REASONS, wilayas: WILAYAS.map((w) => ({ code: w.code, ar: w.ar, fr: w.fr })),
  carriers: connectorCatalog('carrier'), stores: connectorCatalog('store'),
  carrierAccounts: listAccounts('carrier', { includeDeleted: true }).map((a) => ({ id: a.id, label: a.label, code: a.code, enabled: a.enabled, removed: !!a.deleted_at })),
  storeAccounts: listAccounts('store', { includeDeleted: true }).map((a) => ({ id: a.id, label: a.label, code: a.code })),
  engine: { whatsapp: waLive() ? 'live' : 'simulation', ai: engineName(), aiKey: aiLive(), model: config.ai.model },
  publicUrl: config.publicUrl,
}));

// ───── الرئيسية ─────
api.get('/api/dashboard', (req, res) => {
  const { from, to } = req.query;
  const w = [], p = [];
  if (from) { w.push('date(created_at)>=date(?)'); p.push(from); }
  if (to) { w.push('date(created_at)<=date(?)'); p.push(to); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const by = Object.fromEntries(db.all(`SELECT status, COUNT(*) n FROM orders ${where} GROUP BY status`, ...p).map((r) => [r.status, r.n]));
  const sum = (...k) => k.reduce((s, x) => s + (by[x] || 0), 0);
  const retour = db.all(`SELECT wilaya_code, SUM(status IN ('returning','returned')) r, SUM(status IN ('delivered','returning','returned')) t
    FROM orders ${where} ${where ? 'AND' : 'WHERE'} wilaya_code IS NOT NULL GROUP BY wilaya_code HAVING t>0 ORDER BY t DESC LIMIT 8`, ...p)
    .map((x) => ({ wilaya: wilayaByCode(x.wilaya_code)?.ar, rate: Math.round((x.r / x.t) * 100), returned: x.r, total: x.t }));
  send(res, 200, {
    kpis: {
      new: sum('new', 'awaiting_confirmation', 'needs_review'), confirmed: sum('confirmed', 'dispatching', 'dispatch_failed', 'dispatch_unknown'),
      shipped: sum('shipped', 'out_for_delivery', 'delivery_failed'), delivered: sum('delivered'), returned: sum('returning', 'returned'), cancelled: sum('cancelled'),
    },
    bySource: db.all(`SELECT source, COUNT(*) n FROM orders ${where} GROUP BY source`, ...p),
    revenue: db.get(`SELECT COALESCE(SUM(total),0) t FROM orders ${where} ${where ? 'AND' : 'WHERE'} status='delivered'`, ...p).t,
    retour,
    attention: {
      dispatch: db.get("SELECT COUNT(*) n FROM orders WHERE status IN ('dispatch_failed','dispatch_unknown','needs_review')").n,
      human: db.get('SELECT COUNT(*) n FROM conversations WHERE mode=\'human\'').n,
      returns: db.get("SELECT COUNT(*) n FROM returns WHERE status='needs_review'").n,
      failed: db.get("SELECT COUNT(*) n FROM orders WHERE status='delivery_failed'").n,
    },
    recent: listOrders({ limit: 8 }),
  });
});

// ───── الطلبات ─────
api.get('/api/orders', (req, res) => send(res, 200, { orders: listOrders(req.query) }));
api.get('/api/orders/:id', (req, res) => {
  const o = getOrder(req.params.id);
  if (!o) throw httpErr(404, 'الطلب غير موجود');
  const shipments = db.all('SELECT s.*, a.label carrier_label FROM shipments s LEFT JOIN carrier_accounts a ON a.id=s.carrier_account_id WHERE order_id=? ORDER BY s.id', o.id)
    .map((s) => ({ ...s, events: db.all('SELECT * FROM shipment_events WHERE shipment_id=? ORDER BY id', s.id) }));
  const conv = o.conversation_id ? getConversation(o.conversation_id) : (o.wa_phone ? conversationByPhone(o.wa_phone) : null);
  send(res, 200, {
    order: { ...o, wilaya: wilayaByCode(o.wilaya_code), stopdesk: o.stopdesk_id ? db.get('SELECT * FROM stopdesks WHERE id=?', o.stopdesk_id) : null },
    items: orderItems(o.id), events: db.all('SELECT * FROM order_events WHERE order_id=? ORDER BY id', o.id), shipments,
    returns: db.all('SELECT * FROM returns WHERE order_id=? ORDER BY id', o.id), validation: validateOrder(o),
    conversation: conv ? { id: conv.id, mode: conv.mode, messages: listMessages(conv.id, 60) } : null,
  });
});
api.post('/api/orders', (req, res) => {
  const b = req.body;
  const o = createOrder({
    source: 'manual', customerName: b.customer_name, phone: b.phone, waPhone: normPhone(b.wa_phone || b.phone), wilayaCode: int(b.wilaya_code),
    commune: b.commune, address: b.address, deliveryMethod: b.delivery_method, stopdeskId: int(b.stopdesk_id),
    items: (b.items || []).map((i) => ({ productId: Number(i.product_id), qty: Number(i.qty) })), status: b.confirmed ? 'confirmed' : 'new',
    confirmedVia: b.confirmed ? 'staff' : null, carrierAccountId: int(b.carrier_account_id), notes: b.notes,
  }, { user: req.user, actor: req.user.name });
  send(res, 201, { order: o });
});
api.put('/api/orders/:id', (req, res) => {
  const o = getOrder(req.params.id);
  if (!o) throw httpErr(404, 'الطلب غير موجود');
  if (['shipped', 'out_for_delivery', 'delivered', 'returning', 'returned'].includes(o.status) && !('notes' in req.body && Object.keys(req.body).length === 1)) throw httpErr(409, 'الطلب تبعث — ما نقدروش نبدّلو البيانات');
  const allowed = ['customer_name', 'phone', 'wilaya_code', 'commune', 'address', 'delivery_method', 'stopdesk_id', 'carrier_account_id', 'notes'];
  const upd = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)).map(([k, v]) => [k, ['wilaya_code', 'stopdesk_id', 'carrier_account_id'].includes(k) ? int(v) : v]));
  db.update('orders', o.id, { ...upd, updated_at: now() });
  const n = recalcOrder(o.id);
  db.insert('order_events', { order_id: o.id, status: n.status, note: `تعديل: ${Object.keys(upd).join(', ')}`, actor: req.user.name });
  audit('order.update', { user: req.user, entity: 'orders', entityId: o.id, details: upd });
  send(res, 200, { order: n });
});
api.post('/api/orders/:id/confirm', (req, res) => {
  const o = getOrder(req.params.id);
  if (!['new', 'awaiting_confirmation', 'needs_review'].includes(o?.status)) throw httpErr(409, 'ما نقدروش نأكدو هاذ الطلب');
  setOrderStatus(o.id, 'confirmed', { note: 'تأكيد يدوي من الموظف', actor: req.user.name, extra: { confirmed_at: now(), confirmed_via: 'staff' } });
  audit('order.confirm.staff', { user: req.user, entity: 'orders', entityId: o.id });
  send(res, 200, { order: getOrder(o.id) });
});
const dispatchHandler = async (req, res) => {
  const r = await dispatchOrder(Number(req.params.id), { user: req.user, actor: req.user.name, carrierAccountId: int(req.body.carrier_account_id), force: !!req.body.force && req.user.role === 'admin' });
  send(res, r.ok ? 200 : 422, { ...r, order: getOrder(req.params.id) });
};
api.post('/api/orders/:id/dispatch', dispatchHandler);
api.post('/api/orders/:id/retry', dispatchHandler);
api.post('/api/orders/:id/cancel', (req, res) => {
  const o = getOrder(req.params.id);
  if (!o || ['shipped', 'out_for_delivery', 'delivered', 'returning', 'returned'].includes(o.status)) throw httpErr(409, 'ما نقدروش نلغيو طلب تبعث — لازم روتور');
  setOrderStatus(o.id, 'cancelled', { note: req.body.reason || 'إلغاء من الموظف', actor: req.user.name });
  audit('order.cancel', { user: req.user, entity: 'orders', entityId: o.id });
  send(res, 200, { order: getOrder(o.id) });
});
api.post('/api/orders/:id/send-confirmation', (req, res) => {
  const o = getOrder(req.params.id);
  if (!o?.wa_phone) throw httpErr(400, 'ما كانش رقم واتساب');
  if (o.status !== 'awaiting_confirmation') setOrderStatus(o.id, 'awaiting_confirmation', { actor: req.user.name, note: 'إعادة إرسال طلب التأكيد' });
  sendOrderConfirmation(getOrder(o.id));
  send(res, 200, { ok: true });
});

// ───── الشحن والروتور ─────
api.get('/api/shipments', (req, res) => {
  const f = req.query.filter || 'all';
  const cond = { attention: "(o.status IN ('dispatch_failed','dispatch_unknown','needs_review','delivery_failed') OR s.state IN ('failed','unknown'))", active: "s.state='created' AND (s.status IS NULL OR s.status NOT IN ('delivered','returned'))", all: '1=1' }[f] || '1=1';
  const rows = db.all(`SELECT s.*, o.number, o.customer_name, o.phone, o.wilaya_code, o.total, o.status order_status, a.label carrier_label, a.mode carrier_mode,
    (SELECT note FROM shipment_events e WHERE e.shipment_id=s.id AND e.note IS NOT NULL ORDER BY e.id DESC LIMIT 1) last_note
    FROM shipments s JOIN orders o ON o.id=s.order_id LEFT JOIN carrier_accounts a ON a.id=s.carrier_account_id WHERE ${cond} ORDER BY s.id DESC LIMIT 300`);
  const pending = f === 'attention' ? db.all("SELECT o.*, NULL tracking FROM orders o WHERE status IN ('needs_review','dispatch_failed') AND NOT EXISTS(SELECT 1 FROM shipments s WHERE s.order_id=o.id) ORDER BY id DESC") : [];
  send(res, 200, { shipments: rows, pending });
});
api.post('/api/shipments/:id/refresh', async (req, res) => send(res, 200, await refreshTracking(Number(req.params.id))));
api.post('/api/shipments/:id/simulate', (req, res) => {
  const s = db.get('SELECT s.*, a.mode FROM shipments s JOIN carrier_accounts a ON a.id=s.carrier_account_id WHERE s.id=?', req.params.id);
  if (!s) throw httpErr(404, 'الشحنة غير موجودة');
  if (s.mode !== 'simulation') throw httpErr(400, 'المحاكاة متاحة غير لحسابات "تجريبي"');
  const r = simulateCarrierStatus(s.id, req.body.status, { note: req.body.note, eventId: req.body.event_id, eta: req.body.eta });
  audit('shipment.simulate', { user: req.user, entity: 'orders', entityId: s.order_id, details: { ...req.body, result: r } });
  send(res, 200, r);
});
api.get('/api/returns', (req, res) => send(res, 200, { returns: listReturns() }));
api.post('/api/returns/:id/decide', async (req, res) => send(res, 200, await decideReturn(Number(req.params.id), !!req.body.accept, { user: req.user, note: req.body.note })));
api.post('/api/returns/:id/received', (req, res) => send(res, 200, receiveReturn(Number(req.params.id), { user: req.user })));

// ───── صندوق واتساب ─────
api.get('/api/conversations', (req, res) => {
  const f = req.query.filter;
  const cond = f === 'human' ? "c.mode='human'" : f === 'unread' ? 'c.unread>0' : '1=1';
  const q = req.query.q ? `%${req.query.q}%` : null;
  send(res, 200, { conversations: db.all(`SELECT c.id, c.wa_phone, c.mode, c.needs_human, c.handoff_reason, c.unread, c.updated_at, cu.name customer_name, u.name assigned_name,
    (SELECT body FROM messages m WHERE m.conversation_id=c.id ORDER BY id DESC LIMIT 1) last_body,
    (SELECT author FROM messages m WHERE m.conversation_id=c.id ORDER BY id DESC LIMIT 1) last_author
    FROM conversations c JOIN customers cu ON cu.id=c.customer_id LEFT JOIN users u ON u.id=c.assigned_user_id
    WHERE ${cond} ${q ? 'AND (c.wa_phone LIKE ? OR cu.name LIKE ?)' : ''} ORDER BY c.updated_at DESC, c.id DESC LIMIT 200`, ...(q ? [q, q] : [])) });
});
api.get('/api/conversations/:id', (req, res) => {
  const c = getConversation(req.params.id);
  if (!c) throw httpErr(404, 'المحادثة غير موجودة');
  db.run('UPDATE conversations SET unread=0 WHERE id=?', c.id);
  const v = draftView(c);
  send(res, 200, {
    conversation: { id: c.id, wa_phone: c.wa_phone, mode: c.mode, handoff_reason: c.handoff_reason, assigned_user_id: c.assigned_user_id, lang: c.state.lang },
    customer: db.get('SELECT * FROM customers WHERE id=?', c.customer_id), messages: listMessages(c.id),
    draft: { ...v, wilaya: v.wilaya?.ar, consent: !!c.state.consent, summary: !!c.state.summary },
    orders: db.all('SELECT id, number, status, total, tracking, created_at FROM orders WHERE wa_phone=? OR conversation_id=? ORDER BY id DESC LIMIT 10', c.wa_phone, c.id),
  });
});
api.post('/api/conversations/:id/reply', (req, res) => {
  const c = getConversation(req.params.id);
  const text = String(req.body.text || '').trim();
  if (!c || !text) throw httpErr(400, 'الرسالة فارغة');
  // الموظف يرد → نوقفو الذكاء الاصطناعي على المحادثة هاذي تلقائياً
  if (c.mode !== 'human') setMode(c, 'human', { user: req.user, reason: 'ردّ الموظف' });
  else if (!c.assigned_user_id) db.update('conversations', c.id, { assigned_user_id: req.user.id, needs_human: 0 });
  sendText(c, text, { author: 'agent', agentUserId: req.user.id });
  audit('conversation.reply', { user: req.user, entity: 'conversations', entityId: c.id });
  send(res, 200, { ok: true });
});
api.post('/api/conversations/:id/takeover', (req, res) => {
  const c = getConversation(req.params.id);
  setMode(c, 'human', { user: req.user, reason: req.body.reason || 'استلمها الموظف' });
  audit('conversation.takeover', { user: req.user, entity: 'conversations', entityId: c.id });
  send(res, 200, { ok: true });
});
api.post('/api/conversations/:id/release', (req, res) => {
  const c = getConversation(req.params.id);
  setMode(c, 'ai', { user: req.user });
  audit('conversation.release', { user: req.user, entity: 'conversations', entityId: c.id });
  send(res, 200, { ok: true });
});

// ───── المنتجات وأسعار التوصيل ─────
api.get('/api/products', (req, res) => send(res, 200, { products: listProducts(true) }));
api.post('/api/products', (req, res) => {
  admin(req);
  const b = req.body;
  const id = db.insert('products', { sku: b.sku, name: b.name, name_fr: b.name_fr, keywords: b.keywords || '', description: b.description || '', price: Number(b.price), stock: Number(b.stock) || 0, active: b.active === false ? 0 : 1 });
  audit('product.create', { user: req.user, entity: 'products', entityId: id });
  send(res, 201, { product: db.get('SELECT * FROM products WHERE id=?', id) });
});
api.put('/api/products/:id', (req, res) => {
  admin(req);
  const allowed = ['sku', 'name', 'name_fr', 'keywords', 'description', 'price', 'stock', 'active'];
  const upd = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  db.update('products', Number(req.params.id), upd);
  audit('product.update', { user: req.user, entity: 'products', entityId: Number(req.params.id), details: upd });
  send(res, 200, { product: db.get('SELECT * FROM products WHERE id=?', req.params.id) });
});
api.get('/api/rates', (req, res) => send(res, 200, {
  rates: db.all('SELECT * FROM delivery_rates ORDER BY wilaya_code').map((r) => ({ ...r, wilaya: wilayaByCode(r.wilaya_code) })),
  stopdesks: db.all('SELECT * FROM stopdesks ORDER BY wilaya_code, id'),
}));
api.put('/api/rates/:code', (req, res) => {
  admin(req);
  const b = req.body;
  db.run(`INSERT INTO delivery_rates(wilaya_code, home_price, desk_price, home_days, desk_days, active) VALUES(?,?,?,?,?,?)
    ON CONFLICT(wilaya_code) DO UPDATE SET home_price=excluded.home_price, desk_price=excluded.desk_price, home_days=excluded.home_days, desk_days=excluded.desk_days, active=excluded.active`,
  Number(req.params.code), int(b.home_price), int(b.desk_price), b.home_days || '24-48', b.desk_days || '24-72', b.active === false ? 0 : 1);
  audit('rates.update', { user: req.user, entity: 'delivery_rates', entityId: Number(req.params.code), details: b });
  send(res, 200, { ok: true });
});
api.post('/api/stopdesks', (req, res) => {
  admin(req);
  const b = req.body;
  const id = db.insert('stopdesks', { carrier_code: b.carrier_code, wilaya_code: Number(b.wilaya_code), name: b.name, commune: b.commune, address: b.address, external_id: b.external_id });
  send(res, 201, { id });
});
api.del('/api/stopdesks/:id', (req, res) => { admin(req); db.run('DELETE FROM stopdesks WHERE id=?', req.params.id); send(res, 200, { ok: true }); });

// ───── الربط: المتاجر وشركات التوصيل ─────
const kindOf = (k) => { if (!['carrier', 'store'].includes(k)) throw httpErr(404, 'نوع غير معروف'); return k; };
api.get('/api/integrations/:kind', (req, res) => {
  const k = kindOf(req.params.kind);
  send(res, 200, { catalog: connectorCatalog(k), accounts: listAccounts(k, { includeDeleted: req.query.all === '1' }), rules: k === 'carrier' ? db.all('SELECT * FROM carrier_rules ORDER BY priority, id') : undefined });
});
api.post('/api/integrations/:kind', (req, res) => { admin(req); send(res, 201, { account: createAccount(kindOf(req.params.kind), req.body, req.user) }); });
api.put('/api/integrations/:kind/:id', (req, res) => { admin(req); send(res, 200, { account: updateAccount(kindOf(req.params.kind), Number(req.params.id), req.body, req.user) }); });
api.post('/api/integrations/:kind/:id/test', async (req, res) => { admin(req); send(res, 200, await testAccount(kindOf(req.params.kind), Number(req.params.id), req.user)); });
api.post('/api/integrations/:kind/:id/enable', (req, res) => { admin(req); send(res, 200, { account: updateAccount(kindOf(req.params.kind), Number(req.params.id), { enabled: true }, req.user) }); });
api.post('/api/integrations/:kind/:id/disable', (req, res) => { admin(req); send(res, 200, { account: updateAccount(kindOf(req.params.kind), Number(req.params.id), { enabled: false }, req.user) }); });
api.post('/api/integrations/carrier/:id/default', (req, res) => { admin(req); setDefaultCarrier(Number(req.params.id), req.user); send(res, 200, { ok: true }); });
api.del('/api/integrations/:kind/:id', (req, res) => { admin(req); removeAccount(kindOf(req.params.kind), Number(req.params.id), req.user); send(res, 200, { ok: true }); });
api.post('/api/carrier-rules', (req, res) => {
  admin(req);
  const b = req.body;
  const id = db.insert('carrier_rules', { priority: Number(b.priority) || 100, wilaya_code: int(b.wilaya_code), delivery_method: b.delivery_method || null, carrier_account_id: Number(b.carrier_account_id) });
  audit('carrier.rule.create', { user: req.user, entity: 'carrier_rules', entityId: id, details: b });
  send(res, 201, { id });
});
api.del('/api/carrier-rules/:id', (req, res) => { admin(req); db.run('DELETE FROM carrier_rules WHERE id=?', req.params.id); send(res, 200, { ok: true }); });

// ───── الإعدادات والمستخدمين والسجل ─────
api.get('/api/settings', (req, res) => send(res, 200, { settings: allSettings(), defaults: DEFAULTS }));
api.put('/api/settings/:key', (req, res) => {
  admin(req);
  if (!(req.params.key in DEFAULTS)) throw httpErr(404, 'إعداد غير معروف');
  setSetting(req.params.key, req.body);
  audit('settings.update', { user: req.user, entity: 'settings', details: { key: req.params.key } });
  send(res, 200, { value: getSetting(req.params.key) });
});
api.get('/api/users', (req, res) => { admin(req); send(res, 200, { users: db.all('SELECT id, email, name, role, active, created_at FROM users ORDER BY id') }); });
api.post('/api/users', (req, res) => {
  admin(req);
  const b = req.body;
  if (!b.email || !b.password || String(b.password).length < 8) throw httpErr(400, 'الإيميل وكلمة سر (8 حروف على الأقل)');
  const id = db.insert('users', { email: b.email.toLowerCase().trim(), name: b.name || b.email, role: b.role === 'admin' ? 'admin' : 'agent', password_hash: hashPassword(b.password) });
  audit('user.create', { user: req.user, entity: 'users', entityId: id });
  send(res, 201, { id });
});
api.put('/api/users/:id', (req, res) => {
  admin(req);
  const b = req.body, upd = {};
  if (b.name) upd.name = b.name;
  if (b.role) upd.role = b.role === 'admin' ? 'admin' : 'agent';
  if (b.active != null) upd.active = b.active ? 1 : 0;
  if (b.password) { if (String(b.password).length < 8) throw httpErr(400, 'كلمة السر قصيرة'); upd.password_hash = hashPassword(b.password); }
  db.update('users', Number(req.params.id), upd);
  if (upd.active === 0 || upd.password_hash) db.run('DELETE FROM sessions WHERE user_id=?', req.params.id);
  audit('user.update', { user: req.user, entity: 'users', entityId: Number(req.params.id), details: Object.keys(upd) });
  send(res, 200, { ok: true });
});
api.get('/api/audit', (req, res) => {
  admin(req);
  const lv = req.query.level;
  send(res, 200, { entries: db.all(`SELECT * FROM audit_log ${lv ? 'WHERE level=?' : ''} ORDER BY id DESC LIMIT 500`, ...(lv ? [lv] : [])) });
});

// ───── المحاكاة (للتجربة بلا مفاتيح) ─────
api.post('/api/sim/whatsapp', async (req, res) => {
  const b = req.body;
  const from = normPhone(b.from);
  if (!from) throw httpErr(400, 'رقم الزبون ناقص');
  const id = `sim.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const msg = b.button_id
    ? { from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: b.button_id, title: b.title || b.button_id } } }
    : { from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: String(b.text || '') } };
  const results = await processWhatsAppWebhook({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { contacts: [{ wa_id: from, profile: { name: b.name || 'زبون تجريبي' } }], messages: [msg] } }] }] });
  const conv = conversationByPhone(from);
  send(res, 200, { result: results[0] || null, messages: conv ? listMessages(conv.id, 80) : [] });
});
api.get('/api/sim/whatsapp', (req, res) => {
  const conv = conversationByPhone(req.query.phone);
  send(res, 200, { messages: conv ? listMessages(conv.id, 80) : [], mode: conv?.mode });
});
api.post('/api/sim/store-order', async (req, res) => {
  const b = req.body;
  const account = loadAccount('store', Number(b.account_id));
  if (!account) throw httpErr(404, 'ربط المتجر غير موجود');
  const payload = samplePayload(account.code, b);
  const raw = Buffer.from(JSON.stringify(payload));
  const headers = { 'content-type': 'application/json' };
  const secret = account.credentials.webhook_secret;
  const sig = { shopify: ['x-shopify-hmac-sha256', 'base64'], woocommerce: ['x-wc-webhook-signature', 'base64'], youcan: ['x-youcan-signature', 'hex'], lightfunnels: ['lightfunnels-hmac', 'base64'] }[account.code] || ['x-zinor-signature', 'hex'];
  if (secret) headers[sig[0]] = hmac('sha256', secret, raw, sig[1]);
  const r = await ingestStoreWebhook(account.id, { headers, rawBody: raw, body: payload });
  send(res, 200, r);
});

function samplePayload(platform, b) {
  const products = listProducts();
  const p = products.find((x) => x.id === Number(b.product_id)) || products[0];
  const qty = Number(b.qty) || 1;
  const w = wilayaByCode(b.wilaya_code) || findWilaya('Oran');
  const ext = String(b.external_id || Date.now());
  const name = b.customer_name || 'أمين بن علي', phone = b.phone || '0661234567', commune = b.commune || 'Bir El Djir', address = b.address || 'حي السلام عمارة 12';
  const method = b.delivery_method || 'home';
  if (platform === 'shopify') return { id: Number(ext), name: `#${ext.slice(-4)}`, total_price: String(p.price * qty), shipping_address: { first_name: name.split(' ')[0], last_name: name.split(' ').slice(1).join(' '), phone, address1: address, city: commune, province: w.fr }, line_items: [{ sku: p.sku, title: p.name, quantity: qty, price: String(p.price) }], shipping_lines: [{ title: method === 'desk' ? 'Stop desk' : 'Livraison à domicile', price: '0' }] };
  if (platform === 'woocommerce') return { id: Number(ext), number: ext.slice(-5), total: String(p.price * qty), billing: { first_name: name.split(' ')[0], last_name: name.split(' ').slice(1).join(' '), phone, address_1: address, city: commune, state: `DZ-${String(w.code).padStart(2, '0')}` }, shipping: {}, line_items: [{ sku: p.sku, name: p.name, quantity: qty, price: p.price }], shipping_lines: [{ method_title: method === 'desk' ? 'Stop desk' : 'Domicile', total: '0' }] };
  return { id: ext, number: ext.slice(-5), customer: { name, phone }, wilaya: w.fr, commune, address, delivery_method: method, items: [{ sku: p.sku, name: p.name, qty, price: p.price }], shipping_fee: 0, total: p.price * qty };
}
