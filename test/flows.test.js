// تجربة المسارات الستة المطلوبة — كل شي يخدم بالمحاكاة (بلا مفاتيح)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zinor-test-'));
process.env.ZINOR_SKIP_ENV_FILE = '1';
process.env.NODE_ENV = 'test';
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.APP_SECRET_KEY = 'a'.repeat(64);
process.env.POLL_INTERVAL_MIN = '0';
for (const k of ['WA_ACCESS_TOKEN', 'WA_PHONE_NUMBER_ID', 'WA_APP_SECRET', 'ANTHROPIC_API_KEY']) delete process.env[k];

const { start } = await import('../server/index.js');
const dbm = await import('../server/db.js');
let srv, base, cookie, db;

before(async () => {
  srv = await start({ port: 0, quiet: true });
  db = dbm.db;
  base = `http://127.0.0.1:${srv.server.address().port}`;
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@zinor.local', password: 'admin12345' }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(async () => { await srv.close(); fs.rmSync(dir, { recursive: true, force: true }); });

async function call(method, url, body) {
  const r = await fetch(base + url, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json();
  if (r.status >= 400 && !data.ok && r.status !== 422) throw new Error(`${method} ${url} → ${r.status} ${data.error}`);
  return data;
}
const say = (from, text) => call('POST', '/api/sim/whatsapp', { from, text });
const press = (from, button_id) => call('POST', '/api/sim/whatsapp', { from, button_id });
const outSince = (msgs, n) => msgs.slice(n).filter((m) => m.direction === 'out');
const shipmentsOf = (orderId) => db.all("SELECT * FROM shipments WHERE order_id=? AND kind='outbound'", orderId);
const convOf = (phone) => db.get('SELECT * FROM conversations WHERE wa_phone=?', phone);
const lastOrderFor = (wa) => db.get('SELECT * FROM orders WHERE wa_phone=? ORDER BY id DESC LIMIT 1', wa);

test('1) سؤال بالدارجة → جواب من البيانات → موافقة → المعلومات الناقصة → الكوموند تروح للتوصيل بلا تأكيد مكرّر', async () => {
  const wa = '213550000001';
  let r = await say(wa, 'salam ch7al livraison l Blida');
  let replies = outSince(r.messages, 0).map((m) => m.body).join('\n');
  assert.match(replies, /600/, 'سعر التوصيل للدار من قاعدة البيانات');
  assert.match(replies, /400/, 'سعر المكتب');
  assert.match(replies, /livraison|l dar/i, 'يجاوب بالحروف اللاتينية كيما هدر الزبون');

  let n = r.messages.length;
  r = await say(wa, 'nheb parfum oud, l dar. commune Boufarik, cité 200 logements bloc 3');
  const summary = outSince(r.messages, n).map((m) => m.body).join('\n');
  assert.match(summary, /3800/, 'الملخّص فيه المجموع مع التوصيل (3200 + 600)');
  assert.equal(db.get('SELECT COUNT(*) n FROM orders WHERE wa_phone=?', wa).n, 0, 'ما تتخلقش كوموند قبل الموافقة');

  n = r.messages.length;
  r = await say(wa, 'ih dirli had la commande');
  const ask = outSince(r.messages, n).map((m) => m.body).join('\n');
  assert.match(ask, /smitek|nom/i, 'يسقسي غير على الناقص: الاسم');
  assert.match(ask, /numero/i, 'والرقم');
  assert.doesNotMatch(ask, /commune|adresse/i, 'ما يعاودش يسقسي على البلدية والعنوان');
  assert.equal(db.get('SELECT COUNT(*) n FROM orders WHERE wa_phone=?', wa).n, 0);

  n = r.messages.length;
  r = await say(wa, 'Yacine Benali 0550123456');
  const order = lastOrderFor(wa);
  assert.ok(order, 'الكوموند تسجّلت');
  assert.equal(order.status, 'shipped');
  assert.equal(order.confirmed_via, 'whatsapp_chat');
  assert.equal(order.customer_name, 'Yacine Benali');
  assert.equal(order.phone, '0550123456');
  assert.equal(order.total, 3800);
  assert.ok(order.tracking, 'رقم التتبع تخزّن');
  assert.equal(shipmentsOf(order.id).length, 1, 'شحنة وحدة');
  const after = outSince(r.messages, n).map((m) => m.body).join('\n');
  assert.match(after, new RegExp(order.tracking), 'الزبون وصلو التأكيد مع رقم التتبع');
  assert.doesNotMatch(after, /confirm|نأكد|تأكد/i, 'ما كانش طلب تأكيد ثاني');

  // رسالة زايدة ما تخلقش طرد ثاني
  await say(wa, 'merci');
  assert.equal(db.get('SELECT COUNT(*) n FROM orders WHERE wa_phone=?', wa).n, 1);
});

test('1b) نفس المسار بالدارجة بالحروف العربية + التوصيل للمكتب', async () => {
  const wa = '213660000011';
  let r = await say(wa, 'السلام، شحال التوصيل لوهران للمكتب؟');
  assert.match(outSince(r.messages, 0).map((m) => m.body).join('\n'), /450/);
  await say(wa, 'نحب ساعة كلاسيك للمكتب');
  r = await say(wa, 'ايه ديرلي هاذ الكوموند');
  const ask = r.messages.at(-1).body;
  assert.match(ask, /المكتب|البلدية/);
  await say(wa, 'مكتب بير الجير');
  r = await say(wa, 'اسمي أمين بن علي، نفس الرقم');
  const order = lastOrderFor(wa);
  assert.ok(order, 'الكوموند تسجّلت');
  assert.equal(order.status, 'shipped');
  assert.equal(order.delivery_method, 'desk');
  assert.equal(order.phone, '0660000011', 'رقم واتساب ولّى رقم التوصيل لأنو الزبون اختارو');
  assert.equal(order.carrier_code, 'yalidine', 'قاعدة: وهران → Yalidine');
});

test('2) زبون يعطي الاسم والرقم وهو غير يستفسر → ما تتخلق حتى شحنة', async () => {
  const wa = '213550000002';
  await say(wa, 'salam, ch7al l montre classic?');
  await say(wa, 'w livraison l Sétif ch7al?');
  const r = await say(wa, 'ismi Karim Haddad w numero 0661223344');
  assert.equal(db.get('SELECT COUNT(*) n FROM orders WHERE wa_phone=?', wa).n, 0, 'ما كانش كوموند');
  assert.equal(db.get('SELECT COUNT(*) n FROM shipments s JOIN orders o ON o.id=s.order_id WHERE o.wa_phone=?', wa).n, 0);
  assert.match(r.messages.at(-1).body, /commande/i, 'يكمّل المحادثة ويسقسي واش حاب');
});

test('3) كوموند من متجر → تأكيد بالأزرار في واتساب → رقم التتبع يبان في اللوحة', async () => {
  const shopify = db.get("SELECT id FROM store_accounts WHERE platform='shopify'").id;
  const res = await call('POST', '/api/sim/store-order', { account_id: shopify, product_id: 4, qty: 2, wilaya_code: 16, commune: 'Bab Ezzouar', address: 'Cité 5 juillet bt 12', phone: '0770123456', customer_name: 'Lina Saidi', external_id: '900001' });
  const order = res.order;
  assert.equal(order.source, 'store');
  assert.equal(order.status, 'awaiting_confirmation');
  assert.equal(order.external_id, '900001');
  assert.equal(order.total, 2 * 2800 + 500);
  const wa = '213770123456';
  const msgs = db.all("SELECT * FROM messages WHERE conversation_id=(SELECT id FROM conversations WHERE wa_phone=?) AND direction='out'", wa);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].type, 'template', 'خارج نافذة 24 ساعة → قالب معتمد');
  assert.deepEqual(JSON.parse(msgs[0].buttons).map((b) => b.title), ['نأكد الطلب', 'نبدّل المعلومات', 'نلغي الطلب']);

  // نفس الـwebhook مرّة ثانية → ما يتكرّرش
  const dup = await call('POST', '/api/sim/store-order', { account_id: shopify, product_id: 4, qty: 2, wilaya_code: 16, phone: '0770123456', external_id: '900001' });
  assert.ok(dup.duplicate);

  await press(wa, `oc:confirm:${order.id}`);
  const detail = await call('GET', `/api/orders/${order.id}`);
  assert.equal(detail.order.status, 'shipped');
  assert.ok(detail.order.tracking, 'رقم التتبع ظاهر في صفحة الطلب');
  assert.equal(detail.shipments.length, 1);
  const list = await call('GET', `/api/orders?q=${detail.order.tracking}`);
  assert.equal(list.orders[0].id, order.id, 'البحث برقم التتبع يلقاه');

  // زر "نبدّل المعلومات": التعديل اللي يبدّل المجموع يعاود يبعث ملخّص بأزرار قبل الشحن
  const r2 = await call('POST', '/api/sim/store-order', { account_id: shopify, product_id: 1, wilaya_code: 16, commune: 'Cheraga', address: 'Rue 3', phone: '0770123456', customer_name: 'Lina Saidi', external_id: '900002' });
  await press(wa, `oc:edit:${r2.order.id}`);
  const ed = await say(wa, 'bdel l wilaya l Blida, commune Boufarik');
  const o2 = db.get('SELECT * FROM orders WHERE id=?', r2.order.id);
  assert.equal(o2.wilaya_code, 9);
  assert.equal(o2.status, 'awaiting_confirmation', 'ما يتبعثش قبل ما يأكد الملخّص الجديد');
  assert.equal(o2.total, 3200 + 600);
  assert.ok(ed.messages.some((m) => m.buttons && /3800/.test(m.body)), 'ملخّص جديد بالأزرار');
});

test('4) الطرد يخرج مع الليفرور → تذكير واحد رغم تكرار إشعار الشركة', async () => {
  const order = lastOrderFor('213550000001');
  const ship = shipmentsOf(order.id)[0];
  await call('POST', `/api/shipments/${ship.id}/simulate`, { status: 'in_transit' });
  await call('POST', `/api/shipments/${ship.id}/simulate`, { status: 'out_for_delivery', event_id: 'evt-ofd-1' });
  await call('POST', `/api/shipments/${ship.id}/simulate`, { status: 'out_for_delivery', event_id: 'evt-ofd-1' }); // نفس الحدث بالضبط
  await call('POST', `/api/shipments/${ship.id}/simulate`, { status: 'out_for_delivery' }); // إشعار مكرّر بمعرّف جديد
  const conv = convOf('213550000001');
  const reminders = db.all("SELECT * FROM messages WHERE conversation_id=? AND body LIKE '%خرجت مع الليفرور%'", conv.id);
  assert.equal(reminders.length, 1, 'تذكير واحد');
  assert.match(reminders[0].body, /Yacine/);
  assert.match(reminders[0].body, new RegExp(order.number));
  assert.match(reminders[0].body, /3800/);
  assert.equal(db.get('SELECT status FROM orders WHERE id=?', order.id).status, 'out_for_delivery');

  // تحديث قديم ما يرجّعش الحالة للور
  const { applyCarrierEvent } = await import('../server/services/shipping.js');
  const s = db.get('SELECT * FROM shipments WHERE id=?', ship.id);
  const old = applyCarrierEvent(s, { externalStatus: 'Expédié', eventId: 'old-1', occurredAt: '2020-01-01T00:00:00Z' });
  assert.equal(old.applied, false);
  assert.equal(db.get('SELECT status FROM orders WHERE id=?', order.id).status, 'out_for_delivery');

  // محاولة ثانية بعد فشل → تذكير ثاني (مرة لكل محاولة)
  await call('POST', `/api/shipments/${ship.id}/simulate`, { status: 'delivery_failed', note: 'الزبون ما ردّش' });
  await call('POST', `/api/shipments/${ship.id}/simulate`, { status: 'out_for_delivery' });
  assert.equal(db.all("SELECT id FROM messages WHERE conversation_id=? AND body LIKE '%خرجت مع الليفرور%'", conv.id).length, 2);
  await call('POST', `/api/shipments/${ship.id}/simulate`, { status: 'delivered' });
  assert.equal(db.get('SELECT status FROM orders WHERE id=?', order.id).status, 'delivered');
});

test('5a) طرد ما تسلّمش ورجع (RTO) → السبب يتسجّل ويتتبع حتى يرجع للمخزن', async () => {
  const order = db.get("SELECT * FROM orders WHERE wa_phone='213660000011' ORDER BY id DESC LIMIT 1");
  const ship = shipmentsOf(order.id)[0];
  const stockBefore = db.get('SELECT stock FROM products WHERE id=2').stock;
  await call('POST', `/api/shipments/${ship.id}/simulate`, { status: 'delivery_failed', note: 'رفض الاستلام' });
  await call('POST', `/api/shipments/${ship.id}/simulate`, { status: 'returning', note: 'رفض الاستلام' });
  let ret = db.get("SELECT * FROM returns WHERE order_id=? AND type='rto'", order.id);
  assert.equal(ret.status, 'in_transit', 'راه في الطريق');
  assert.match(ret.reason, /رفض/);
  // حالة توصيل قديمة بعد ما بدا الرجوع → متجاهَلة
  await call('POST', `/api/shipments/${ship.id}/simulate`, { status: 'out_for_delivery' });
  assert.equal(db.get('SELECT status FROM orders WHERE id=?', order.id).status, 'returning');
  await call('POST', `/api/shipments/${ship.id}/simulate`, { status: 'returned' });
  ret = db.get('SELECT * FROM returns WHERE id=?', ret.id);
  assert.equal(ret.status, 'returned_to_stock');
  assert.equal(db.get('SELECT status FROM orders WHERE id=?', order.id).status, 'returned');
  assert.equal(db.get('SELECT stock FROM products WHERE id=2').stock, stockBefore + 1, 'المخزون رجع');
});

test('5b) طلب روتور بعد الاستلام عبر واتساب → السبب مربوط بالكوموند → قبول → جمع الطرد', async () => {
  const wa = '213550000001';
  const order = lastOrderFor(wa);
  assert.equal(order.status, 'delivered');
  let r = await say(wa, 'salam, nheb nrajja3 l parfum');
  assert.match(r.messages.at(-1).body, /mochkil|probl/i, 'يسقسي على السبب');
  r = await say(wa, 'jani l flacon mksour');
  const ret = db.get("SELECT * FROM returns WHERE order_id=? AND type='customer'", order.id);
  assert.ok(ret, 'الروتور مربوط بالكوموند الأصلية');
  assert.equal(ret.reason_code, 'defective');
  assert.equal(ret.status, 'in_transit', 'قبول تلقائي حسب السياسة + طلب جمع من الشركة (محاكاة)');
  assert.ok(ret.pickup_tracking);
  assert.match(r.messages.at(-1).body, /قبول الروتور/);

  // سبب يحتاج قرار → يتحوّل للموظف
  const wa2 = '213770123456';
  const o2 = db.get("SELECT * FROM orders WHERE wa_phone=? AND status='shipped'", wa2);
  const s2 = shipmentsOf(o2.id)[0];
  await call('POST', `/api/shipments/${s2.id}/simulate`, { status: 'delivered' });
  await say(wa2, 'nheb nrajja3 l kitman, ma3jbatnich l couleur w khlas');
  const ret2 = db.get("SELECT * FROM returns WHERE order_id=? AND type='customer'", o2.id);
  assert.equal(ret2.status, 'needs_review');
  assert.equal(convOf(wa2).mode, 'human', 'المحادثة تحوّلت للموظف');
  await call('POST', `/api/returns/${ret2.id}/decide`, { accept: true });
  assert.equal(db.get('SELECT status FROM returns WHERE id=?', ret2.id).status, 'in_transit');
});

test('6a) تفعيل/تعطيل متجر وشركة توصيل من اللوحة', async () => {
  const woo = db.get("SELECT id FROM store_accounts WHERE platform='woocommerce'").id;
  await call('POST', `/api/integrations/store/${woo}/disable`);
  const blocked = await fetch(base + '/api/sim/store-order', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ account_id: woo, external_id: '777' }) });
  assert.equal(blocked.status, 409, 'المتجر المعطّل ما يدخّلش طلبات');
  await call('POST', `/api/integrations/store/${woo}/enable`);
  const ok = await call('POST', '/api/sim/store-order', { account_id: woo, external_id: '778', wilaya_code: 19, commune: 'Sétif', phone: '0555443322' });
  assert.equal(ok.order.store_platform, 'woocommerce');
  assert.equal(ok.order.wilaya_code, 19, 'DZ-19 تتحوّل لسطيف');

  // تعطيل Yalidine → قاعدة وهران ما تخدمش → ZR الافتراضية
  await call('POST', '/api/integrations/carrier/2/disable');
  const wa = '213550000031';
  await say(wa, 'nheb kitman bluetooth l Oran l dar, commune Es Senia, cité 400 lgts');
  await say(wa, 'ih confirmi');
  await say(wa, 'smiti Sofiane Amrani w numero 0556677889');
  assert.equal(lastOrderFor(wa).carrier_code, 'zr_express');
  await call('POST', '/api/integrations/carrier/2/enable');

  // إضافة حساب جديد ثم نزع الربط → السجل القديم يبقى
  const acc = (await call('POST', '/api/integrations/carrier', { code: 'yalidine', label: 'Yalidine 2', mode: 'live', credentials: { api_id: 'x', api_token: 'secret-token-123' } })).account;
  assert.equal(acc.status, 'connected');
  assert.equal(acc.credentials.api_token, '••••-123', 'المفتاح مقنّع وما يرجعش للواجهة');
  await call('DELETE', `/api/integrations/carrier/${acc.id}`);
  const all = await call('GET', '/api/integrations/carrier?all=1');
  assert.ok(all.accounts.find((a) => a.id === acc.id).deleted_at);
  const shipped = db.get("SELECT COUNT(*) n FROM shipments WHERE carrier_code='yalidine'").n;
  assert.ok(shipped >= 1, 'شحنات Yalidine القديمة باقية');
});

test('6b) تحويل محادثة من الذكاء الاصطناعي لموظف والعكس', async () => {
  const wa = '213550000041';
  let r = await say(wa, 'wach nta robot?');
  assert.match(r.messages.at(-1).body, /bot|automatique/i, 'يجاوب بصراحة بلي آلي');
  const conv = convOf(wa);
  await call('POST', `/api/conversations/${conv.id}/takeover`);
  const n = (await call('GET', `/api/conversations/${conv.id}`)).messages.length;
  r = await say(wa, 'ch7al livraison l Annaba?');
  assert.equal(outSince(r.messages, n).length, 0, 'الذكاء الاصطناعي متوقف على هاذ المحادثة');
  await call('POST', `/api/conversations/${conv.id}/reply`, { text: 'مرحبا، التوصيل لعنابة 800 دج للدار' });
  const d = await call('GET', `/api/conversations/${conv.id}`);
  const agentMsg = d.messages.at(-1);
  assert.equal(agentMsg.author, 'agent');
  assert.equal(agentMsg.agent_name, 'المشرف', 'السجلّ يبيّن شكون ردّ');
  await call('POST', `/api/conversations/${conv.id}/release`);
  r = await say(wa, 'w l bureau?');
  assert.ok(outSince(r.messages, d.messages.length + 1).some((m) => m.author === 'ai'), 'المساعد رجع يجاوب');

  // الزبون يطلب موظف
  const wa2 = '213550000042';
  await say(wa2, 'نحب نهدر مع واحد من الخدامين');
  assert.equal(convOf(wa2).mode, 'human');
});

test('أمان: فشل الإرسال + إعادة المحاولة مع التحقق ما تخلقش طرد ثاني', async () => {
  // نتيجة غير واضحة: الطرد تخلق عند الشركة بصح الجواب ضاع
  db.run(`UPDATE carrier_accounts SET settings='{"sim_fail_next":"timeout_after_create"}' WHERE id=1`);
  const wa = '213550000051';
  await say(wa, 'nheb montre classic l Alger l dar, commune Kouba, cité 300 lgts');
  await say(wa, 'ih dirli had la commande');
  await say(wa, 'smiti Walid Ziani, numero 0550998877');
  let o = lastOrderFor(wa);
  assert.equal(o.status, 'dispatch_unknown');
  assert.equal(db.get("SELECT COUNT(*) n FROM sim_parcels WHERE reference=?", o.number).n, 1);
  const r = await call('POST', `/api/orders/${o.id}/retry`);
  assert.ok(r.ok);
  o = lastOrderFor(wa);
  assert.equal(o.status, 'shipped');
  assert.equal(db.get('SELECT COUNT(*) n FROM sim_parcels WHERE reference LIKE ?', o.number + '%').n, 1, 'طرد واحد برك عند الشركة');

  // ملكية البيانات: زبون آخر ما يقدرش يشوف كوموند ماشي تاعو
  const other = await say('213550000052', `win rahi la commande ${o.number}`);
  assert.doesNotMatch(other.messages.at(-1).body, new RegExp(o.tracking));
  // صلاحيات: الموظف ما يقدرش يبدّل الربط
  const lr = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'agent@zinor.local', password: 'agent12345' }) });
  const agentCookie = lr.headers.get('set-cookie').split(';')[0];
  const forbidden = await fetch(base + '/api/integrations/carrier/1/disable', { method: 'POST', headers: { cookie: agentCookie, 'content-type': 'application/json' } });
  assert.equal(forbidden.status, 403);
});
