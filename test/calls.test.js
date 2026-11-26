// تجارب واتساب والمكالمات — كل شي بالمحاكاة (بلا مكالمات حقيقية وبلا خلاص)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zinor-calls-'));
const SECRET = 'test-calls-secret';
// n8n وهمي: يستقبل call.start ويتحقق من التوقيع
const n8nHits = [];
const fakeN8n = http.createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c;
  const ok = req.headers['x-zinor-signature'] === crypto.createHmac('sha256', SECRET).update(`${req.headers['x-zinor-timestamp']}.${b}`).digest('hex');
  n8nHits.push({ ok, body: JSON.parse(b) });
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ provider_call_id: 'CA' + n8nHits.length }));
}).listen(0);
await new Promise((r) => fakeN8n.once('listening', r));

Object.assign(process.env, {
  ZINOR_SKIP_ENV_FILE: '1', NODE_ENV: 'test', DB_PATH: path.join(dir, 'test.db'), APP_SECRET_KEY: 'b'.repeat(64), POLL_INTERVAL_MIN: '0',
  CALLS_SCHEDULER_SECONDS: '0', CALLS_WEBHOOK_SECRET: SECRET, N8N_CALL_START_URL: `http://127.0.0.1:${fakeN8n.address().port}/start`,
  N8N_CALL_TURN_URL: 'https://n8n.example/webhook/zinor-turn', PUBLIC_URL: 'https://zinor.example',
});
for (const k of ['WA_ACCESS_TOKEN', 'WA_PHONE_NUMBER_ID', 'WA_APP_SECRET', 'ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY']) delete process.env[k];

const { start } = await import('../server/index.js');
const dbm = await import('../server/db.js');
const { setClock } = await import('../server/calls/clock.js');
let srv, base, cookie, agentCookie, db;
// 10:30 بتوقيت الجزائر (UTC+1) — داخل الفترة الأولى
const T = (hhmm, day = '2026-11-26') => new Date(`${day}T${hhmm}:00+01:00`);

before(async () => {
  srv = await start({ port: 0, quiet: true });
  db = dbm.db;
  base = `http://127.0.0.1:${srv.server.address().port}`;
  const login = async (email, password) => (await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })).headers.get('set-cookie').split(';')[0];
  cookie = await login('admin@zinor.local', 'admin12345');
  agentCookie = await login('agent@zinor.local', 'agent12345');
});
after(async () => { setClock(null); await srv.close(); fakeN8n.close(); fs.rmSync(dir, { recursive: true, force: true }); });

async function call(method, url, body, ck = cookie) {
  const r = await fetch(base + url, { method, headers: { cookie: ck, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = r.headers.get('content-type')?.includes('json') ? await r.json() : await r.arrayBuffer();
  if (r.status >= 400 && r.status !== 422) { const e = new Error(`${method} ${url} → ${r.status} ${data.error}`); e.status = r.status; throw e; }
  return data;
}
const settings = async () => (await call('GET', '/api/calls/config')).settings;
async function setCalls(patch) {
  const s = await settings();
  const merged = { ...s, ...patch, modes: { ...s.modes, ...(patch.modes || {}) }, scripts: { ...s.scripts, ...(patch.scripts || {}) }, voice: { ...s.voice, ...(patch.voice || {}) }, intros: { ...s.intros, ...(patch.intros || {}) } };
  return call('PUT', '/api/settings/calls', merged);
}
const say = (from, text, extra = {}) => call('POST', '/api/sim/whatsapp', { from, text, ...extra });
const press = (from, button_id) => call('POST', '/api/sim/whatsapp', { from, button_id });
let ext = 5000;
const wooOrder = (phone, extra = {}) => call('POST', '/api/sim/store-order', { account_id: 2, product_id: 1, wilaya_code: 16, commune: 'Kouba', address: 'Cité 300 lgts', customer_name: 'Sofiane Amrani', phone, external_id: String(++ext), ...extra });
const tasksOf = (id) => db.all('SELECT * FROM call_tasks WHERE order_id=? ORDER BY id', id);
const callsOf = (id) => db.all("SELECT * FROM calls WHERE order_id=? AND direction='out' ORDER BY id", id);
const order = (id) => db.get('SELECT * FROM orders WHERE id=?', id);
const runDue = (now) => call('POST', '/api/sim/calls/run-due', { now: now.toISOString() });
const ev = (id, type) => call('POST', `/api/sim/calls/${id}/event`, { type });
const speak = (id, text) => call('POST', `/api/sim/calls/${id}/say`, { text });
const local = (iso) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Africa/Algiers' }).slice(0, 16);
const lastSaid = (r) => r.reply.actions.filter((a) => a.type === 'say').map((a) => a.text).join(' ');

test('1) حملة واتساب على «رسائل فقط» → الكوموند تتأكد في المحادثة وما تتبرمج حتى مكالمة', async () => {
  setClock(T('10:30'));
  await setCalls({ modes: { whatsapp_campaign: 'whatsapp' } });
  const wa = '213550100001';
  await say(wa, 'nheb parfum oud l Alger l dar, commune Kouba, cité 300 lgts', { referral: { source_id: 'AD-777', headline: 'Promo Oud' } });
  await say(wa, 'ih dirli had la commande');
  await say(wa, 'smiti Amine Kaci w numero 0550100001');
  const o = db.get('SELECT * FROM orders WHERE wa_phone=?', wa);
  assert.equal(o.source_channel, 'whatsapp_campaign');
  assert.equal(o.campaign_id, 'AD-777', 'معرّف إعلان Meta تسجّل');
  assert.equal(o.confirm_mode, 'whatsapp');
  assert.equal(o.status, 'shipped');
  assert.equal(tasksOf(o.id).length, 0, 'ما كانش مكالمة');
  await runDue(T('19:00'));
  assert.equal(callsOf(o.id).length, 0);

  // حملة معيّنة نقدر نخصّصلها إعداد آخر (حسب referral.source_id)
  await setCalls({ campaign_overrides: [{ source_id: 'AD-CALL', label: 'حملة الساعات', mode: 'call' }] });
  const wa2 = '213550100002';
  await say(wa2, 'nheb montre classic l Alger l dar, commune Kouba, cité 300 lgts', { referral: { source_id: 'AD-CALL' } });
  await say(wa2, 'ih dirli had la commande');
  const r = await say(wa2, 'smiti Rami Saadi w numero 0550100002');
  const o2 = db.get('SELECT * FROM orders WHERE wa_phone=?', wa2);
  assert.equal(o2.confirm_mode, 'call');
  assert.equal(o2.status, 'awaiting_confirmation');
  assert.equal(tasksOf(o2.id).length, 1, 'تبرمجت مكالمة للحملة هاذي');
  assert.match(r.messages.at(-1).body, /n3aytoulek|نعيطولك/);
  await setCalls({ campaign_overrides: [] });
});

test('2) كوموند WooCommerce تبرمج الاتصال حسب الوضع المختار', async () => {
  // مكالمة فقط — مباشرة داخل الفترة، بلا رسالة واتساب
  setClock(T('10:30'));
  await setCalls({ modes: { woocommerce: 'call' } });
  let o = (await wooOrder('0661200001')).order;
  let t = tasksOf(o.id);
  assert.equal(order(o.id).confirm_mode, 'call');
  assert.equal(t.length, 1);
  assert.equal(local(t[0].scheduled_for), '2026-11-26 10:30', 'داخل الفترة → دُرك');
  assert.equal(db.get("SELECT COUNT(*) n FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.wa_phone='213661200001'").n, 0, 'ما تبعثتش رسالة واتساب');

  // خارج الفترات → أول وقت مسموح
  setClock(T('07:15'));
  o = (await wooOrder('0661200002')).order;
  assert.equal(local(tasksOf(o.id)[0].scheduled_for), '2026-11-26 10:00');
  setClock(T('21:00'));
  o = (await wooOrder('0661200003')).order;
  assert.equal(local(tasksOf(o.id)[0].scheduled_for), '2026-11-27 10:00', 'بعد آخر فترة → غدوة الصباح');

  // واتساب + مكالمة بعد 45 دقيقة إذا ما أكّدش
  setClock(T('10:30'));
  await setCalls({ modes: { woocommerce: 'whatsapp_call' }, combined_strategy: 'delayed', delay_minutes: 45 });
  o = (await wooOrder('0661200004')).order;
  assert.equal(local(tasksOf(o.id)[0].scheduled_for), '2026-11-26 11:15');
  assert.ok(db.get("SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.wa_phone='213661200004' AND m.type='template'"), 'رسالة واتساب بالأزرار');

  // واتساب + مكالمة مباشرة
  await setCalls({ combined_strategy: 'immediate' });
  o = (await wooOrder('0661200005')).order;
  assert.equal(local(tasksOf(o.id)[0].scheduled_for), '2026-11-26 10:30');

  // مخلّصة مسبقاً → ما نعيطوش
  o = (await wooOrder('0661200006', { payment_method: 'bacs' })).order;
  assert.equal(order(o.id).payment_method, 'prepaid');
  assert.equal(tasksOf(o.id).length, 0);

  // نطفيو المكالمات لـ WooCommerce → المحاولات اللي ما بداتش تتلغى
  const pending = db.get("SELECT COUNT(*) n FROM call_tasks t JOIN orders o ON o.id=t.order_id WHERE o.source_channel='woocommerce' AND t.status='scheduled'").n;
  assert.ok(pending >= 3);
  await setCalls({ modes: { woocommerce: 'whatsapp' } });
  assert.equal(db.get("SELECT COUNT(*) n FROM call_tasks t JOIN orders o ON o.id=t.order_id WHERE o.source_channel='woocommerce' AND t.status='scheduled'").n, 0);
  assert.match(db.get("SELECT reason FROM call_tasks WHERE status='cancelled' ORDER BY id DESC LIMIT 1").reason, /WooCommerce/);
});

test('3) زبون ما يردّش: المحاولات تتوزّع على الفترات وحد أقصى 3 في اليوم', async () => {
  await setCalls({ modes: { woocommerce: 'call' } });
  setClock(T('10:20'));
  const o = (await wooOrder('0771300001')).order;
  await runDue(T('10:20'));
  let c = callsOf(o.id);
  assert.equal(c.length, 1);
  assert.equal(c[0].real, 0, 'محاكاة — ماشي مكالمة حقيقية');
  setClock(T('10:21'));
  await ev(c[0].id, 'no_answer');
  let t = tasksOf(o.id);
  assert.equal(local(t.at(-1).scheduled_for), '2026-11-26 14:00', 'المحاولة الجاية في الفترة الثانية، ماشي مباشرة');
  await runDue(T('11:30'));
  assert.equal(callsOf(o.id).length, 1, 'ما كانش مكالمات متتابعة');
  setClock(T('14:05'));
  await runDue(T('14:05'));
  c = callsOf(o.id);
  await ev(c[1].id, 'voicemail');
  assert.equal(local(tasksOf(o.id).at(-1).scheduled_for), '2026-11-26 18:00');
  setClock(T('18:02'));
  await runDue(T('18:02'));
  c = callsOf(o.id);
  assert.equal(c.length, 3);
  await ev(c[2].id, 'no_answer');
  await ev(c[2].id, 'no_answer'); // حدث مكرّر
  assert.equal(tasksOf(o.id).filter((x) => x.status === 'scheduled').length, 0, 'ما كانش محاولة رابعة');
  assert.equal(order(o.id).status, 'needs_review', 'في قائمة المراجعة');
  assert.match(order(o.id).review_reason, /3 محاولات/);
  await runDue(T('19:00'));
  assert.equal(callsOf(o.id).length, 3);

  // كوموند دخلت متأخّرة: نستعملو الفترات الباقية برك (2 محاولات) بلا تعويض
  setClock(T('15:00'));
  const late = (await wooOrder('0771300002')).order;
  await runDue(T('15:00'));
  await ev(callsOf(late.id)[0].id, 'no_answer');
  assert.equal(local(tasksOf(late.id).at(-1).scheduled_for), '2026-11-26 18:00');
  setClock(T('18:30'));
  await runDue(T('18:30'));
  await ev(callsOf(late.id)[1].id, 'busy');
  assert.equal(callsOf(late.id).length, 2);
  assert.equal(order(late.id).status, 'needs_review');
});

test('4) تأكيد واتساب قبل الاتصال، وتأكيد واتساب + هاتف في نفس اللحظة → تأكيد واحد وشحنة واحدة', async () => {
  setClock(T('10:30'));
  await setCalls({ modes: { woocommerce: 'whatsapp_call' }, combined_strategy: 'delayed', delay_minutes: 30 });
  const a = (await wooOrder('0552400001')).order;
  assert.equal(tasksOf(a.id)[0].status, 'scheduled');
  await press('213552400001', `oc:confirm:${a.id}`);
  assert.equal(order(a.id).status, 'shipped');
  assert.equal(tasksOf(a.id)[0].status, 'cancelled', 'المكالمة تلغات');
  await runDue(T('11:30'));
  assert.equal(callsOf(a.id).length, 0, 'ما عيّطناش');

  // في نفس اللحظة
  await setCalls({ combined_strategy: 'immediate' });
  const b = (await wooOrder('0552400002')).order;
  await runDue(T('10:30'));
  const c = callsOf(b.id)[0];
  await ev(c.id, 'answered');
  await speak(c.id, 'ايه عندي دقيقة');
  const [w, p] = await Promise.all([press('213552400002', `oc:confirm:${b.id}`), speak(c.id, 'ايه نأكدها')]);
  assert.ok(w && p);
  assert.equal(order(b.id).status, 'shipped');
  assert.equal(db.get("SELECT COUNT(*) n FROM shipments WHERE order_id=? AND kind='outbound'", b.id).n, 1, 'شحنة وحدة');
  assert.equal(db.get('SELECT COUNT(*) n FROM sim_parcels WHERE reference LIKE ?', order(b.id).number + '%').n, 1, 'طرد واحد عند شركة التوصيل');
  assert.equal(db.get("SELECT COUNT(*) n FROM order_events WHERE order_id=? AND status='confirmed'", b.id).n, 1, 'تأكيد واحد');
  // webhook مكرّر
  await call('POST', '/api/sim/calls/' + c.id + '/event', { type: 'completed' });
  await call('POST', '/api/sim/calls/' + c.id + '/event', { type: 'completed' });
  assert.equal(order(b.id).status, 'shipped');
});

test('4b) الحوار الصادر: صراحة، «عيّطلي من بعد»، «خلّيني نخمّم»، وتبديل العنوان بمجموع جديد', async () => {
  setClock(T('10:30'));
  await setCalls({ modes: { woocommerce: 'call' } });
  const o = (await wooOrder('0663500001')).order;
  await runDue(T('10:30'));
  const c = callsOf(o.id)[0];
  let r = await ev(c.id, 'answered');
  assert.match(lastSaid(r), /عيّطنالك على الكوموند/);
  r = await speak(c.id, 'واش نتا روبو؟');
  assert.match(lastSaid(r), /مساعد آلي/);
  r = await speak(c.id, 'لا راني خدام، عيطلي على الخمسة العشية');
  assert.equal(r.reply.outcome, 'callback');
  const cb = tasksOf(o.id).find((t) => t.kind === 'callback');
  assert.equal(local(cb.scheduled_for), '2026-11-26 18:00', '17:00 خارج الفترات → أول وقت مسموح بعدها');

  setClock(T('18:05'));
  await runDue(T('18:05'));
  const c2 = callsOf(o.id)[1];
  await ev(c2.id, 'answered');
  await speak(c2.id, 'ايه');
  r = await speak(c2.id, 'لا، نحب نبدل العنوان');
  assert.match(lastSaid(r), /البلدية والولاية/);
  r = await speak(c2.id, 'بوفاريك ولاية البليدة');
  assert.match(lastSaid(r), /بوفاريك/);
  r = await speak(c2.id, 'حي 200 مسكن عمارة 3');
  assert.match(lastSaid(r), /المجموع الجديد 3800 دينار/, 'يقول المجموع الجديد (3200 + 600)');
  assert.equal(order(o.id).status, 'awaiting_confirmation', 'ما يشحنش قبل الموافقة');
  r = await speak(c2.id, 'ايه نأكدو');
  assert.equal(r.reply.outcome, 'confirmed');
  const done = order(o.id);
  assert.equal(done.status, 'shipped');
  assert.equal(done.wilaya_code, 9);
  assert.equal(done.total, 3800);
  assert.equal(done.confirmed_via, 'phone');

  // «خلّيني نخمّم» → مراجعة
  setClock(T('10:40'));
  const o2 = (await wooOrder('0663500002')).order;
  await runDue(T('10:40'));
  const c3 = callsOf(o2.id)[0];
  await ev(c3.id, 'answered');
  await speak(c3.id, 'ايه');
  r = await speak(c3.id, 'خليني نخمم ونعيطلك');
  assert.equal(order(o2.id).status, 'needs_review');
  // انقطاع قبل التأكيد → مراجعة
  const o3 = (await wooOrder('0663500003')).order;
  await runDue(T('10:40'));
  const c4 = callsOf(o3.id)[0];
  await ev(c4.id, 'answered');
  await ev(c4.id, 'completed');
  assert.equal(order(o3.id).status, 'needs_review');
  assert.match(order(o3.id).review_reason, /انقطعت/);
});

test('5) الزبون يرجع يعيّط: يأكّد، يلغي، يبدّل العنوان، يطلب موظف، والتحقق برقم الكوموند', async () => {
  setClock(T('10:50'));
  await setCalls({ modes: { woocommerce: 'whatsapp' } });
  const inbound = (from) => call('POST', '/api/sim/calls/inbound', { from });
  // يأكّد
  const a = (await wooOrder('0554600001')).order;
  let r = await inbound('0554600001');
  assert.match(lastSaid(r), /كيفاش نقدر نعاونك/);
  const id = r.call.id;
  r = await speak(id, 'شفت appel manqué، نحب نأكد الكوموند');
  assert.match(lastSaid(r), /المجموع/, 'يقرا المنتوج والمجموع قبل التأكيد');
  r = await speak(id, 'ايه');
  assert.equal(r.reply.outcome, 'confirmed');
  assert.equal(order(a.id).status, 'shipped');
  // يلغي
  const b = (await wooOrder('0554600002')).order;
  r = await inbound('0554600002');
  r = await speak(r.call.id, 'نحب نلغي الكوموند');
  assert.match(lastSaid(r), /تحب نلغيو/);
  r = await speak(r.call.id, 'ايه');
  assert.equal(order(b.id).status, 'cancelled');
  // يبدّل العنوان
  const c = (await wooOrder('0554600003')).order;
  r = await inbound('0554600003');
  const cid = r.call.id;
  await speak(cid, 'نحب نبدل العنوان');
  await speak(cid, 'وهران بير الجير');
  r = await speak(cid, 'حي السلام رقم 12');
  assert.match(lastSaid(r), /المجموع الجديد/);
  r = await speak(cid, 'ايه');
  assert.equal(order(c.id).wilaya_code, 31);
  assert.equal(order(c.id).status, 'shipped');
  // يطلب موظف
  const d = (await wooOrder('0554600004')).order;
  r = await inbound('0554600004');
  r = await speak(r.call.id, 'نحب نهدر مع موظف');
  assert.equal(r.reply.outcome, 'human');
  assert.equal(order(d.id).status, 'needs_review');
  // رقم مختلف → رقم الكوموند + آخر 4 أرقام قبل ما نكشفو التفاصيل
  const e = (await wooOrder('0554600005')).order;
  r = await inbound('0699999999');
  const eid = r.call.id;
  r = await speak(eid, 'نحب نسقسي على كوموند');
  assert.match(lastSaid(r), /رقم الكوموند/);
  r = await speak(eid, `الكوموند ${order(e.id).number}`);
  assert.match(lastSaid(r), /آخر أربعة أرقام/);
  assert.doesNotMatch(lastSaid(r), /دينار/, 'ما يكشفش التفاصيل قبل التحقق');
  r = await speak(eid, '1111');
  assert.match(lastSaid(r), /ماشي هاذي/);
  r = await speak(eid, '0005');
  assert.match(lastSaid(r), /تأكدت/);
  r = await speak(eid, 'وين راهي الكوموند؟');
  assert.match(lastSaid(r), /مازال تستنى التأكيد/);
  // كوموند مبعوثة: الإلغاء يروح للموظف
  r = await inbound('0554600001');
  r = await speak(r.call.id, 'نحب نلغيها');
  assert.equal(r.reply.outcome, 'cancel_requested');
  assert.equal(order(a.id).status, 'shipped');
  assert.ok(order(a.id).review_reason);
});

test('6) رفع مقدّمة من الهاتف، سماعها، واختيار صوت رجل/امرأة للمكالمات', async () => {
  // WAV صغير
  const pcm = Buffer.alloc(800);
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24 + pcm.length, 3, 0, 0]), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0, 0x40, 0x1f, 0, 0, 0x80, 0x3e, 0, 0, 2, 0, 16, 0]), Buffer.from('data'), Buffer.from([pcm.length & 255, pcm.length >> 8, 0, 0]), pcm]);
  const up = await call('POST', '/api/media', { name: 'مقدّمة سارة', data: 'data:audio/wav;base64,' + wav.toString('base64') });
  assert.equal(up.media.mime, 'audio/wav');
  const audio = Buffer.from(await call('GET', `/api/media/${up.media.id}/audio`));
  assert.equal(audio.length, wav.length, 'نسمعو التسجيل من اللوحة');
  await assert.rejects(call('POST', '/api/media', { name: 'x', data: Buffer.from('hello not audio').toString('base64') }), /415/);
  await assert.rejects(call('POST', '/api/media', { name: 'x', data: wav.toString('base64') }, agentCookie), /403/, 'الموظف ما يقدرش يرفع');
  await assert.rejects(call('GET', `/api/media/${up.media.id}/audio`, null, agentCookie), /403/);

  const voices = await call('GET', '/api/voices');
  assert.ok(voices.voices.some((v) => v.gender === 'male') && voices.voices.some((v) => v.gender === 'female'));
  const sample = await call('GET', '/api/voices/sample?voice=twilio:Google.ar-XA-Standard-B');
  assert.equal(sample.gender, 'male');
  assert.match(sample.text, /Zinor/);
  await setCalls({ intros: { outbound_media_id: up.media.id }, voice: { outbound: 'twilio:Google.ar-XA-Standard-B', inbound: 'twilio:Google.ar-XA-Standard-A' }, modes: { woocommerce: 'call' } });

  setClock(T('11:00'));
  const o = (await wooOrder('0775700001')).order;
  await runDue(T('11:00'));
  const c = callsOf(o.id)[0];
  const r = await ev(c.id, 'answered');
  assert.deepEqual(r.reply.actions[0], { type: 'play', media_id: up.media.id }, 'المقدّمة المسجّلة أولاً');
  const r2 = await speak(c.id, 'ايه');
  assert.ok(!r2.reply.actions.some((a) => a.type === 'play'), 'تتشغّل مرة وحدة');

  // TwiML عبر webhook n8n الموقّع: صوت رجل + المقدّمة برابط موقّع + التعرّف على الدارجة + المقاطعة
  const turn = async (payload, sigOk = true, ts = Math.floor(Date.now() / 1000)) => {
    const body = JSON.stringify(payload);
    const sig = crypto.createHmac('sha256', sigOk ? SECRET : 'wrong').update(`${ts}.${body}`).digest('hex');
    return fetch(base + '/webhooks/calls/turn', { method: 'POST', headers: { 'content-type': 'application/json', 'x-zinor-timestamp': String(ts), 'x-zinor-signature': sig }, body });
  };
  const o2 = (await wooOrder('0775700002')).order;
  await runDue(T('11:00'));
  const c2 = callsOf(o2.id)[0];
  const tw = await (await turn({ call_id: c2.id, provider_call_id: 'CA-x', answered_by: 'human' })).json();
  assert.match(tw.twiml, /<Play>https:\/\/zinor\.example\/media\/intros\/[^<]+sig=/);
  assert.match(tw.twiml, /voice="Google\.ar-XA-Standard-B"/);
  assert.match(tw.twiml, /<Gather input="speech" language="ar-DZ"[^>]*bargeIn="true"/);
  assert.equal((await turn({ call_id: c2.id, speech: 'ايه' }, false)).status, 401, 'توقيع غالط');
  assert.equal((await turn({ call_id: c2.id, speech: 'ايه' }, true, Math.floor(Date.now() / 1000) - 3600)).status, 401, 'طلب قديم (replay)');
  // الرابط الموقّع يخدم، وبلا توقيع لا
  const playUrl = tw.twiml.match(/<Play>([^<]+)<\/Play>/)[1].replace(/&amp;/g, '&').replace('https://zinor.example', base);
  assert.equal((await fetch(playUrl)).status, 200);
  assert.equal((await fetch(playUrl.replace(/sig=[^&]+/, 'sig=bad'))).status, 403);
  await call('PUT', '/api/settings/calls', { ...(await settings()), intros: { outbound_media_id: null, inbound_media_id: null } });
});

test('6b) المكالمات الحقيقية مطفية افتراضياً، وأول اتصال حقيقي غير لرقم صاحب المتجر', async () => {
  const s = await settings();
  assert.equal(s.real_calls_enabled, false);
  await setCalls({ real_calls_enabled: true, test_only_owner: true, owner_phone: '0550999000', modes: { woocommerce: 'call' } });
  setClock(T('11:10'));
  const o = (await wooOrder('0661800001')).order;
  await runDue(T('11:10'));
  assert.equal(callsOf(o.id)[0].real, 0, 'زبون عادي → محاكاة في وضع أول تجربة');
  assert.equal(n8nHits.length, 0);
  const t = await call('POST', '/api/calls/test');
  assert.equal(t.call.real, 1);
  assert.equal(n8nHits.length, 1);
  assert.ok(n8nHits[0].ok, 'n8n استقبل طلب موقّع');
  assert.equal(n8nHits[0].body.to, '+213550999000');
  assert.match(n8nHits[0].body.turn_url, /zinor-turn\?call_id=/);
  await setCalls({ real_calls_enabled: false });
});

test('7) واتساب والشحن والروتور يبقاو يخدمو + أزرار الكوموند (اتصل دُرك / أوقف / حوّل لموظف)', async () => {
  setClock(T('11:20'));
  await setCalls({ modes: { woocommerce: 'call' } });
  const o = (await wooOrder('0772900001')).order;
  let d = await call('GET', `/api/orders/${o.id}`);
  assert.equal(d.calls.mode, 'call');
  assert.ok(d.calls.next, 'وقت المحاولة الجاية ظاهر');
  await call('POST', `/api/orders/${o.id}/stop-calls`);
  d = await call('GET', `/api/orders/${o.id}`);
  assert.equal(d.calls.next, null);
  const now = await call('POST', `/api/orders/${o.id}/call-now`);
  assert.equal(now.call.status, 'ringing');
  await call('POST', `/api/sim/calls/${now.call.id}/event`, { type: 'no_answer' });
  await call('POST', `/api/orders/${o.id}/handoff`);
  d = await call('GET', `/api/orders/${o.id}`);
  assert.equal(d.calls.next, null, 'الموظف تكفّل → ما كانش محاولات');
  assert.ok(d.calls.last);
  // واتساب + الشحن مازالو يخدمو
  const wa = '213550100099';
  await say(wa, 'salam ch7al livraison l Blida');
  const r = await say(wa, 'nheb parfum oud, l dar. commune Boufarik, cité 200 logements bloc 3');
  assert.match(r.messages.map((m) => m.body).join(' '), /3800/);
  const shipped = db.get("SELECT s.id FROM shipments s JOIN orders o ON o.id=s.order_id WHERE o.status='shipped' AND s.kind='outbound' LIMIT 1");
  const sim = await call('POST', `/api/shipments/${shipped.id}/simulate`, { status: 'out_for_delivery' });
  assert.ok(sim.applied);
});

test('8) النص المخصّص للصوت: الجملة كاملة بالدارجة (زينور، باب الزوار، ثلاثة آلاف وسبعمية دينار)', async () => {
  const sp = await import('../server/calls/speech.js');
  assert.equal(sp.numberToDarija(3700), 'ثلاثة آلاف وسبعمية');
  assert.equal(sp.numberToDarija(500), 'خمسمية');
  assert.equal(sp.numberToDarija(1250), 'ألف وميتين وخمسين');
  assert.equal(sp.toSpeech('متجر Zinor في Bab Ezzouar بـ 3700 دينار'), 'متجر زينور في باب الزوار بـ ثلاثة آلاف وسبعمية دينار');

  setClock(T('11:30'));
  await setCalls({ modes: { woocommerce: 'call' }, intros: { outbound_media_id: null } });
  const o = (await wooOrder('0556800001', { commune: 'Bab Ezzouar' })).order;
  await runDue(T('11:30'));
  const c = callsOf(o.id)[0];
  const r1 = await ev(c.id, 'answered');
  const open = r1.reply.actions.find((a) => a.type === 'say');
  assert.match(open.text, /Zinor/, 'النص المعروض يبقى كيما هو');
  assert.match(open.speech, /زينور/);
  const r2 = await speak(c.id, 'ايه');
  const sum = r2.reply.actions.find((a) => a.type === 'say').speech;
  assert.match(sum, /باب الزوار/);
  assert.match(sum, /ثلاثة آلاف وسبعمية دينار/, '3200 + 500');
  assert.doesNotMatch(sum, /[A-Za-z0-9]/, 'ما يبقاش حتى حرف لاتيني ولا رقم يتفوّت في القراءة');
  // نفس النص يروح لـ Twilio
  const tw = await (async () => {
    const body = JSON.stringify({ call_id: c.id, speech: 'لا' });
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex');
    return (await fetch(base + '/webhooks/calls/turn', { method: 'POST', headers: { 'content-type': 'application/json', 'x-zinor-timestamp': String(ts), 'x-zinor-signature': sig }, body })).json();
  })();
  assert.doesNotMatch(tw.twiml.replace(/<[^>]+>/g, ' ').replace(/https?:\S+/g, ''), /[A-Za-z]{3,}/, 'TwiML <Say> بلا كلمات لاتينية');
  // العيّنة
  const s = await call('GET', '/api/voices/sample?format=text&voice=sim-female');
  assert.match(s.speech, /زينور.*باب الزوار.*ثلاثة آلاف وسبعمية دينار/);
});
