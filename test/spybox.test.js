// SpyBox Gemini TTS — مجرّب على خادم SpyBox وهمي يتبع openapi.json (بلا مفتاح حقيقي وبلا خلاص)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';

// ───── SpyBox وهمي ─────
const VOICES = ['Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Aoede', 'Autonoe', 'Callirrhoe', 'Charon', 'Despina', 'Enceladus', 'Erinome', 'Fenrir', 'Gacrux', 'Iapetus', 'Kore', 'Laomedeia', 'Leda', 'Orus', 'Puck', 'Pulcherrima', 'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Schedar', 'Sulafat', 'Umbriel', 'Vindemiatrix', 'Zephyr', 'Zubenelgenubi'];
const log = { posts: [], gets: 0, dry: 0, files: 0 };
const gens = new Map(), byKey = new Map();
const wav = (() => { const pcm = Buffer.alloc(2400); return Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24 + (pcm.length & 255), pcm.length >> 8, 0, 0]), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0, 0xc0, 0x5d, 0, 0, 0x80, 0xbb, 0, 0, 2, 0, 16, 0]), Buffer.from('data'), Buffer.from([pcm.length & 255, pcm.length >> 8, 0, 0]), pcm]); })();
const sbx = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const send = (s, b, h = {}) => { res.writeHead(s, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(b)); };
  const err = (s, code, message) => send(s, { error: { code, message } });
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/files/')) { log.files++; await new Promise((r) => setTimeout(r, 40)); res.writeHead(200, { 'content-type': 'audio/wav' }); return res.end(wav); }
  if (req.headers.authorization !== 'Bearer sbx_live_test') return err(401, 'unauthorized', 'bad key');
  if (url.pathname === '/api/v1/balance') return send(200, { balance: 1000, reserved: 0, available: 1000, state: 'ok', key: null });
  if (req.method === 'POST' && url.pathname === '/api/v1/generations') {
    const b = JSON.parse(raw);
    const extra = Object.keys(b).filter((k) => !['model', 'prompt', 'params', 'dry_run', 'consent', 'image_urls', 'video_urls', 'audio_urls', 'preset_id'].includes(k));
    if (extra.length || b.model !== 'gemini-tts' || !b.prompt || !VOICES.includes(b.params?.voice) || Object.keys(b.params).some((k) => !['voice', 'voice2'].includes(k))) return err(422, 'invalid_input', 'bad body');
    const estimated = Math.max(1, Math.ceil(b.prompt.length / 100));
    if (b.dry_run) { log.dry++; return send(200, { model: 'gemini-tts', type: 'audio', estimated_credits: estimated, effective_params: b.params }); }
    const key = req.headers['idempotency-key'];
    if (!key) return err(400, 'idempotency_key_required', 'Idempotency-Key required');
    log.posts.push({ key, prompt: b.prompt, voice: b.params.voice });
    if (/بلارصيد/.test(b.prompt)) return err(402, 'insufficient_credits', 'no credits');
    if (byKey.has(key)) return send(200, gens.get(byKey.get(key)));
    const id = crypto.randomUUID();
    const g = { id, status: 'queued', model: 'gemini-tts', type: 'audio', prompt: b.prompt, params: b.params, outputs: [], output_pending: false, output_expired_at: null, credits: { estimated, charged: null }, error: null, notice: null, origin: { channel: 'api', api_key_id: null }, created_at: new Date().toISOString(), started_at: null, completed_at: null, _polls: 0 };
    gens.set(id, g); byKey.set(key, id);
    return send(202, { id, status: 'queued', model: 'gemini-tts', type: 'audio', estimated_credits: estimated, effective_params: b.params, created_at: g.created_at });
  }
  const m = url.pathname.match(/^\/api\/v1\/generations\/([0-9a-f-]+)$/);
  if (req.method === 'GET' && m) {
    log.gets++;
    const g = gens.get(m[1]);
    if (!g) return err(404, 'generation_not_found', 'nope');
    g._polls++;
    await new Promise((r) => setTimeout(r, /بطيء/.test(g.prompt) ? 3000 : 120));
    if (g._polls === 1 && !/بطيء/.test(g.prompt)) { g.status = 'running'; } // أول متابعة: مازال يخدم
    else if (/فشلتوليد/.test(g.prompt)) { g.status = 'failed'; g.error = { code: 'generation_failed', message: 'boom' }; }
    else { g.status = 'completed'; g.outputs = [{ url: `http://127.0.0.1:${sbx.address().port}/files/${g.id}.wav`, type: 'audio' }]; g.credits.charged = g.credits.estimated; g.completed_at = new Date().toISOString(); }
    const { _polls, ...pub } = g;
    return send(200, pub);
  }
  err(404, 'not_found', req.url);
}).listen(0);
await new Promise((r) => sbx.once('listening', r));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zinor-sbx-'));
const SECRET = 'sbx-calls-secret';
Object.assign(process.env, {
  ZINOR_SKIP_ENV_FILE: '1', NODE_ENV: 'test', DB_PATH: path.join(dir, 't.db'), APP_SECRET_KEY: 'c'.repeat(64), POLL_INTERVAL_MIN: '0', CALLS_SCHEDULER_SECONDS: '0',
  SPYBOX_API_KEY: 'sbx_live_test', SPYBOX_BASE_URL: `http://127.0.0.1:${sbx.address().port}/api/v1`, SPYBOX_CALL_BUDGET_MS: '1500',
  CALLS_WEBHOOK_SECRET: SECRET, N8N_CALL_TURN_URL: 'https://n8n.example/webhook/zinor-turn', PUBLIC_URL: 'https://zinor.example',
});
for (const k of ['WA_ACCESS_TOKEN', 'WA_PHONE_NUMBER_ID', 'ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'N8N_CALL_START_URL']) delete process.env[k];
const { start } = await import('../server/index.js');
const { setClock } = await import('../server/calls/clock.js');
let srv, base, cookie;
before(async () => {
  srv = await start({ port: 0, quiet: true });
  base = `http://127.0.0.1:${srv.server.address().port}`;
  cookie = (await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@zinor.local', password: 'admin12345' }) })).headers.get('set-cookie').split(';')[0];
});
after(async () => { setClock(null); await srv.close(); sbx.close(); fs.rmSync(dir, { recursive: true, force: true }); });
async function call(method, url, body) {
  const r = await fetch(base + url, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  if (r.status >= 400) { const e = new Error(`${r.status} ${data.error}`); e.status = r.status; throw e; }
  return data;
}
async function turn(payload) {
  const body = JSON.stringify(payload), ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex');
  return (await fetch(base + '/webhooks/calls/turn', { method: 'POST', headers: { 'content-type': 'application/json', 'x-zinor-timestamp': String(ts), 'x-zinor-signature': sig }, body })).json();
}
async function setCalls(patch) {
  const s = (await call('GET', '/api/calls/config')).settings;
  return call('PUT', '/api/settings/calls', { ...s, ...patch, modes: { ...s.modes, ...(patch.modes || {}) }, voice: { ...s.voice, ...(patch.voice || {}) }, scripts: { ...s.scripts, ...(patch.scripts || {}) }, intros: { ...s.intros, ...(patch.intros || {}) } });
}

test('Puck في قائمة الأصوات + الرصيد', async () => {
  const v = await call('GET', '/api/voices');
  const sb = v.voices.filter((x) => x.provider === 'spybox');
  assert.equal(sb.length, 30);
  assert.equal(sb[0].id, 'sb:Puck');
  assert.equal(sb[0].disabled, false);
  const st = await call('GET', '/api/voices/spybox');
  assert.equal(st.configured, true);
  assert.equal(st.balance.available, 1000);
});

test('تكلفة العيّنة قبل التوليد (dry_run) — ما يتخلّصش', async () => {
  const q = await call('POST', '/api/voices/quote', { voice: 'sb:Puck' });
  assert.ok(q.estimated_credits > 0);
  assert.match(q.speech, /زينور.*باب الزوار.*ثلاثة آلاف وسبعمية دينار/, 'العيّنة بالنص المخصّص للصوت');
  assert.equal(log.dry, 1);
  assert.equal(log.posts.length, 0, 'ما تبدا حتى عملية مدفوعة');
});

test('التوليد: Idempotency-Key، متابعة حتى completed، التحميل، وقياس التأخير', async () => {
  const r = await call('POST', '/api/voices/generate', { voice: 'sb:Puck', source: 'test' });
  const j = r.job;
  assert.equal(log.posts.length, 1);
  assert.equal(log.posts[0].voice, 'Puck');
  assert.match(log.posts[0].key, /^zinor-tts-/);
  assert.ok(j.polls >= 2, 'تابع GET /generations/{id} حتى completed');
  assert.ok(j.ms_total >= 200 && j.ms_create >= 0 && j.ms_wait > 0 && j.ms_download > 0, `التأخير مقاس: ${JSON.stringify(j)}`);
  assert.equal(j.credits_charged, j.credits_estimated);
  const audio = await call('GET', j.audio_url);
  assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
  // نفس الجملة → من الذاكرة: بلا طلب جديد وبلا خلاص
  const again = (await call('POST', '/api/voices/generate', { voice: 'sb:Puck' })).job;
  assert.equal(again.cached, true);
  assert.equal(again.credits_charged, 0);
  assert.equal(log.posts.length, 1);
  assert.equal((await call('POST', '/api/voices/quote', { voice: 'sb:Puck' })).estimated_credits, 0, 'التقدير يقول 0 كي تكون في الذاكرة');
  const st = await call('GET', '/api/voices/spybox');
  assert.equal(st.stats.count, 1);
  assert.ok(st.stats.avg_ms > 0);
});

test('أخطاء SpyBox بالعربية (رصيد ناقص)', async () => {
  await assert.rejects(call('POST', '/api/voices/generate', { voice: 'sb:Puck', text: 'بلارصيد تجربة' }), (e) => e.status === 402 && /الرصيد ما يكفيش/.test(e.message));
  await assert.rejects(call('POST', '/api/voices/quote', { voice: 'sb:Unknown' }), /400/);
});

test('المكالمة بصوت Puck: «بلا مقدّمة مسجّلة» → Puck يقرا الافتتاحية وكل الردود، والتسجيل يبقى خيار', async () => {
  setClock(new Date('2026-11-26T11:00:00+01:00'));
  await setCalls({ voice: { outbound: 'sb:Puck', inbound: 'sb:Puck' }, intros: { outbound_media_id: null, inbound_media_id: null }, modes: { woocommerce: 'call' } });
  const o = (await call('POST', '/api/sim/store-order', { account_id: 2, product_id: 1, wilaya_code: 16, commune: 'Bab Ezzouar', address: 'Cité 5 juillet', customer_name: 'Lina S', phone: '0661300001', external_id: '881001' })).order;
  await call('POST', '/api/sim/calls/run-due', { now: '2026-11-26T11:00:00+01:00' });
  const c1 = (await call('GET', '/api/calls')).recent.find((c) => c.order_id === o.id);
  let tw = await turn({ call_id: c1.id, answered_by: 'human' });
  assert.match(tw.twiml, /<Play>https:\/\/zinor\.example\/media\/tts\/sb-[0-9a-f]+\.wav\?exp=/, 'الافتتاحية بصوت Puck');
  assert.doesNotMatch(tw.twiml, /<Say/);
  tw = await turn({ call_id: c1.id, speech: 'ايه' });
  assert.match(tw.twiml, /<Play>[^<]*tts\/sb-/, 'الملخّص بصوت Puck');
  assert.doesNotMatch(tw.twiml, /<Say/);
  const prompts = log.posts.map((p) => p.prompt).join(' | ');
  assert.match(prompts, /زينور/);
  assert.match(prompts, /ثلاثة آلاف وسبعمية دينار/);
  assert.doesNotMatch(prompts, /[A-Za-z]{3,}/, 'SpyBox يستقبل النص المخصّص للصوت');

  // مع تسجيلي: التسجيل أولاً ثم Puck
  const pcm = Buffer.alloc(400);
  const wavFile = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24 + 144, 1, 0, 0]), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0, 0x40, 0x1f, 0, 0, 0x80, 0x3e, 0, 0, 2, 0, 16, 0]), Buffer.from('data'), Buffer.from([144, 1, 0, 0]), pcm]);
  const m = (await call('POST', '/api/media', { name: 'مقدّمتي', data: wavFile.toString('base64') })).media;
  await setCalls({ intros: { outbound_media_id: m.id } });
  const o2 = (await call('POST', '/api/sim/store-order', { account_id: 2, product_id: 1, wilaya_code: 16, commune: 'Bab Ezzouar', address: 'Cité 5 juillet', customer_name: 'Lina S', phone: '0661300002', external_id: '881002' })).order;
  await call('POST', '/api/sim/calls/run-due', { now: '2026-11-26T11:00:00+01:00' });
  const c2 = (await call('GET', '/api/calls')).recent.find((c) => c.order_id === o2.id);
  tw = await turn({ call_id: c2.id, answered_by: 'human' });
  const plays = [...tw.twiml.matchAll(/<Play>([^<]+)<\/Play>/g)].map((x) => x[1]);
  assert.equal(plays.length, 2);
  assert.match(plays[0], /media\/intros\//, 'تسجيلي أولاً');
  assert.match(plays[1], /media\/tts\/sb-/, 'ومن بعد Puck');
});

test('وسط المكالمة: إذا SpyBox فشل ولا تعطّل فوق الحد، المكالمة تكمّل بـ <Say>', async () => {
  const s = (await call('GET', '/api/calls')).recent[0];
  const inb = await turn({ direction: 'inbound', from: '+213661300002', provider_call_id: 'CA-sb-in' });
  assert.ok(inb.twiml);
  // فشل التوليد
  await setCalls({ scripts: { outbound_opening: 'فشلتوليد سلام', inbound_opening: 'بطيء سلام، معاك متجر Zinor' } });
  const t0 = Date.now();
  const slow = await turn({ direction: 'inbound', from: '+213661300009', provider_call_id: 'CA-sb-slow' });
  assert.ok(Date.now() - t0 < 2900, 'ما استناش أكثر من الحد');
  assert.match(slow.twiml, /<Say[^>]*>[^<]*زينور/, 'رجع لـ <Say> بنفس النص المخصّص للصوت');
  assert.ok(s);
  // التوليد البطيء يكمّل في الخلفية ويتخزّن للمكالمة الجاية
  await new Promise((r) => setTimeout(r, 3600));
  const again = await turn({ direction: 'inbound', from: '+213661300010', provider_call_id: 'CA-sb-slow2' });
  assert.match(again.twiml, /<Play>[^<]*tts\/sb-/, 'المرة الجاية: من الذاكرة بصوت Puck');
});
