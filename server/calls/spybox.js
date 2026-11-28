// SpyBox Crea — Gemini TTS (https://spybox-crea.vercel.app/api/v1)
//   التسعير:  POST /generations { model, prompt, params:{voice}, dry_run:true } → 200 { estimated_credits }
//   التوليد:  POST /generations + Idempotency-Key → 202 { id } → GET /generations/{id}?wait=30 حتى completed → outputs[0].url
//   الرصيد:   GET /balance
// المفتاح SPYBOX_API_KEY يبقى في .env على الخادم وما يروحش للمتصفح.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../db.js';
import { sha } from '../crypto.js';
import { MEDIA_DIR, sniffAudio } from './media.js';
import { httpErr } from '../services/accounts.js';
import { logError } from '../services/audit.js';

export const GEMINI_VOICES = {
  Puck: 'male', Charon: 'male', Fenrir: 'male', Orus: 'male', Enceladus: 'male', Iapetus: 'male', Umbriel: 'male', Algieba: 'male',
  Algenib: 'male', Rasalgethi: 'male', Alnilam: 'male', Schedar: 'male', Achird: 'male', Zubenelgenubi: 'male', Sadachbia: 'male', Sadaltager: 'male',
  Kore: 'female', Zephyr: 'female', Leda: 'female', Aoede: 'female', Callirrhoe: 'female', Autonoe: 'female', Despina: 'female', Erinome: 'female',
  Laomedeia: 'female', Achernar: 'female', Gacrux: 'female', Pulcherrima: 'female', Vindemiatrix: 'female', Sulafat: 'female',
};
export const configured = () => Boolean(config.spybox.apiKey);
const voiceName = (id) => String(id).replace(/^sb:/, '');

const ERR = {
  401: 'مفتاح SpyBox غير صالح ولا منتهي (SPYBOX_API_KEY)', 402: 'الرصيد ما يكفيش في SpyBox (ولا الحد الشهري للمفتاح وصل)',
  403: 'المفتاح ما عندوش صلاحية التوليد', 429: 'SpyBox: طلبات بزاف — عاود بعد شوية', 503: 'SpyBox: النموذج مشغول حالياً',
};
async function sb(pathname, { method = 'GET', body, headers = {}, timeoutMs = 35000 } = {}) {
  if (!configured()) throw httpErr(400, 'SPYBOX_API_KEY ناقص في ملف .env');
  let res;
  try {
    res = await fetch(`${config.spybox.baseUrl}${pathname}`, {
      method, signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${config.spybox.apiKey}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) { throw httpErr(502, `ما قدرناش نوصلو لـ SpyBox: ${e.message}`); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data?.error?.code, msg = data?.error?.message;
    const e = httpErr(res.status >= 500 ? 502 : res.status === 402 ? 402 : 400, `${ERR[res.status] || `SpyBox (${res.status})`}${code ? ` [${code}]` : ''}${msg && !ERR[res.status] ? `: ${msg}` : ''}`);
    e.retryAfter = Number(res.headers.get('retry-after')) || null; e.spyboxStatus = res.status; e.code = code;
    throw e;
  }
  return { status: res.status, data };
}

const request = (voice, text) => ({ model: config.spybox.model, prompt: text, params: { voice: voiceName(voice) } });
const hashOf = (voice, text) => sha(`${config.spybox.model}|${voiceName(voice)}|${text}`);

export async function balance() { return (await sb('/balance')).data; }

/** تقدير التكلفة بلا توليد ولا خلاص */
export async function quote(voice, text) {
  const cached = cachedJob(voice, text);
  if (cached) return { estimated_credits: 0, cached: true, chars: text.length };
  const t0 = Date.now();
  const { data } = await sb('/generations', { method: 'POST', body: { ...request(voice, text), dry_run: true } });
  return { estimated_credits: data.estimated_credits, cached: false, chars: text.length, ms: Date.now() - t0 };
}

export function cachedJob(voice, text) {
  const j = db.get("SELECT * FROM tts_jobs WHERE provider='spybox' AND voice=? AND text_hash=? AND status='completed' ORDER BY id DESC LIMIT 1", voiceName(voice), hashOf(voice, text));
  return j && j.file && fs.existsSync(path.join(MEDIA_DIR(), j.file)) ? j : null;
}

/**
 * يولّد الصوت (ولا يرجّعو من الذاكرة) ويقيس التأخير:
 *   ms_create = POST /generations · ms_wait = حتى completed · ms_download = تحميل الملف · ms_total = الكل
 */
export async function generate(voice, text, { source = 'dashboard' } = {}) {
  const hit = cachedJob(voice, text);
  if (hit) return { ...hit, cached: true, ms_total_now: 0 };
  const h = hashOf(voice, text);
  const jobId = db.insert('tts_jobs', { provider: 'spybox', voice: voiceName(voice), text_hash: h, text, source });
  const t0 = Date.now();
  const fail = (e) => { db.update('tts_jobs', jobId, { status: 'failed', error: e.message, ms_total: Date.now() - t0 }); logError('tts.spybox', e, { details: { voice, chars: text.length } }); throw e; };
  try {
    // نفس Idempotency-Key لنفس الصوت والنص → إعادة المحاولة ترجّع نفس التوليد بلا ما نخلّصو مرة أخرى
    const idem = `zinor-tts-${h.slice(0, 40)}`;
    let created;
    for (let attempt = 0; ; attempt++) {
      try { created = (await sb('/generations', { method: 'POST', body: request(voice, text), headers: { 'Idempotency-Key': idem } })).data; break; }
      catch (e) {
        if (attempt < 3 && (e.spyboxStatus === 429 || e.code === 'idempotency_key_in_progress')) { await new Promise((r) => setTimeout(r, Math.min(5, e.retryAfter || 1) * 1000)); continue; }
        throw e;
      }
    }
    const tCreated = Date.now();
    db.update('tts_jobs', jobId, { generation_id: created.id, credits_estimated: created.estimated_credits ?? created.credits?.estimated ?? null, ms_create: tCreated - t0 });
    // 200 = إعادة لنفس الـkey (Generation كاملة) · 202 = جديدة (queued)
    let gen = created.status && created.outputs ? created : null;
    let polls = 0;
    while (!gen || !['completed', 'failed'].includes(gen.status)) {
      if (Date.now() - t0 > config.spybox.timeoutSec * 1000) throw httpErr(504, `SpyBox ما كمّلش في ${config.spybox.timeoutSec} ثانية`);
      polls++;
      gen = (await sb(`/generations/${created.id}?wait=30`, { timeoutMs: 40000 })).data;
      if (gen.status === 'completed' && gen.output_pending && !gen.outputs?.length) { gen = null; await new Promise((r) => setTimeout(r, 400)); }
    }
    const tDone = Date.now();
    if (gen.status === 'failed') throw httpErr(502, `SpyBox فشل: ${gen.error?.message || gen.error?.code || 'generation_failed'}`);
    const out = (gen.outputs || []).find((o) => o.type === 'audio') || gen.outputs?.[0];
    if (!out?.url) throw httpErr(502, 'SpyBox ما رجّعش ملف صوت');
    let r = await fetch(out.url, { signal: AbortSignal.timeout(30000) });
    if (r.status === 401 || r.status === 403) r = await fetch(out.url, { headers: { Authorization: `Bearer ${config.spybox.apiKey}` }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw httpErr(502, `تحميل الصوت من SpyBox فشل (${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    const kind = sniffAudio(buf) || (/ogg/.test(r.headers.get('content-type') || '') ? { ext: 'ogg', mime: 'audio/ogg' } : null);
    if (!kind) throw httpErr(502, `صيغة الصوت من SpyBox غير معروفة (${r.headers.get('content-type') || '?'})`);
    const rel = `tts/sb-${h.slice(0, 32)}.${kind.ext}`;
    fs.mkdirSync(path.join(MEDIA_DIR(), 'tts'), { recursive: true });
    fs.writeFileSync(path.join(MEDIA_DIR(), rel), buf);
    const tEnd = Date.now();
    db.update('tts_jobs', jobId, {
      status: 'completed', file: rel, credits_charged: gen.credits?.charged ?? null, credits_estimated: gen.credits?.estimated ?? created.estimated_credits ?? null,
      ms_wait: tDone - tCreated, ms_download: tEnd - tDone, ms_total: tEnd - t0, polls,
    });
    return { ...db.get('SELECT * FROM tts_jobs WHERE id=?', jobId), cached: false };
  } catch (e) { return fail(e); }
}

export function stats() {
  const rows = db.all("SELECT ms_total, ms_create, ms_wait, ms_download, credits_charged, credits_estimated, length(text) chars FROM tts_jobs WHERE provider='spybox' AND status='completed' ORDER BY id DESC LIMIT 30");
  const avg = (k) => (rows.length ? Math.round(rows.reduce((s, r) => s + (r[k] || 0), 0) / rows.length) : null);
  const sorted = rows.map((r) => r.ms_total).sort((a, b) => a - b);
  return {
    count: rows.length, avg_ms: avg('ms_total'), p90_ms: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] : null,
    avg_wait_ms: avg('ms_wait'), avg_download_ms: avg('ms_download'),
    credits_total: db.get("SELECT COALESCE(SUM(COALESCE(credits_charged, credits_estimated)),0) n FROM tts_jobs WHERE provider='spybox' AND status='completed'").n,
    failed: db.get("SELECT COUNT(*) n FROM tts_jobs WHERE provider='spybox' AND status='failed'").n,
  };
}
