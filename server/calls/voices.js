// كتالوج الأصوات + توليد الصوت (TTS) + استنساخ الصوت
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { sha } from '../crypto.js';
import { MEDIA_DIR } from './media.js';
import { httpErr } from '../services/accounts.js';

// أصوات Twilio <Say> بالعربية هي عربية فصحى (ماشي دارجة). ElevenLabs يقدر يقرا الدارجة المكتوبة بالحروف العربية بنتيجة أقرب.
const BASE = [
  { id: 'sim-female', label: 'أمينة — امرأة (محاكاة)', gender: 'female', provider: 'simulation', note: 'للتجربة فقط — العيّنة من صوت المتصفح' },
  { id: 'sim-male', label: 'كريم — رجل (محاكاة)', gender: 'male', provider: 'simulation', note: 'للتجربة فقط — العيّنة من صوت المتصفح' },
  { id: 'twilio:Google.ar-XA-Standard-A', label: 'امرأة — Google عربي (Twilio)', gender: 'female', provider: 'twilio', say: { voice: 'Google.ar-XA-Standard-A', language: 'ar-XA' }, note: 'نطق عربي فصيح' },
  { id: 'twilio:Google.ar-XA-Standard-B', label: 'رجل — Google عربي (Twilio)', gender: 'male', provider: 'twilio', say: { voice: 'Google.ar-XA-Standard-B', language: 'ar-XA' }, note: 'نطق عربي فصيح' },
  { id: 'twilio:Polly.Zeina', label: 'زينة — امرأة Amazon Polly (Twilio)', gender: 'female', provider: 'twilio', say: { voice: 'Polly.Zeina', language: 'arb' }, note: 'نطق عربي فصيح' },
];

let elCache = { at: 0, voices: [], error: null };
async function elevenVoices() {
  if (!config.elevenlabs.apiKey) return [];
  if (Date.now() - elCache.at < 10 * 60000) return elCache.voices;
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': config.elevenlabs.apiKey }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
    const d = await r.json();
    elCache = { at: Date.now(), error: null, voices: (d.voices || []).map((v) => ({
      id: `el:${v.voice_id}`, label: `${v.name} (ElevenLabs)`, gender: v.labels?.gender || 'unknown', provider: 'elevenlabs',
      cloned: v.category === 'cloned', note: v.category === 'cloned' ? 'صوت مستنسخ' : 'متعدد اللغات',
    })) };
  } catch (e) { elCache = { at: Date.now(), voices: [], error: e.message }; }
  return elCache.voices;
}

export async function listVoices() {
  return { voices: [...BASE, ...(await elevenVoices())], elevenlabs: Boolean(config.elevenlabs.apiKey), elevenlabsError: elCache.error, cloningSupported: Boolean(config.elevenlabs.apiKey) };
}
export const voiceInfo = (id) => BASE.find((v) => v.id === id) || (String(id).startsWith('el:') ? { id, provider: 'elevenlabs' } : BASE[0]);

// يولّد MP3 بـ ElevenLabs (مع cache حسب الصوت والنص)
export async function synthesize(voiceId, text) {
  if (!String(voiceId).startsWith('el:')) throw httpErr(400, 'التوليد على الخادم غير لأصوات ElevenLabs');
  if (!config.elevenlabs.apiKey) throw httpErr(400, 'ELEVENLABS_API_KEY ناقص');
  const rel = `tts/${sha(`${voiceId}|${config.elevenlabs.model}|${text}`).slice(0, 32)}.mp3`;
  const file = path.join(MEDIA_DIR(), rel);
  if (fs.existsSync(file)) return rel;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId.slice(3))}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': config.elevenlabs.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: config.elevenlabs.model }), signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw httpErr(502, `ElevenLabs TTS ${r.status}: ${(await r.text()).slice(0, 200)}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return rel;
}

// استنساخ الصوت (Instant Voice Cloning) من تسجيلات عندك موافقة صاحبها
export async function cloneVoice({ name, files }) {
  if (!config.elevenlabs.apiKey) throw httpErr(400, 'الاستنساخ يحتاج ELEVENLABS_API_KEY');
  const fd = new FormData();
  fd.append('name', name);
  for (const f of files) fd.append('files', new Blob([fs.readFileSync(f.path)], { type: f.mime }), path.basename(f.path));
  const r = await fetch('https://api.elevenlabs.io/v1/voices/add', { method: 'POST', headers: { 'xi-api-key': config.elevenlabs.apiKey }, body: fd, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw httpErr(502, `ElevenLabs clone ${r.status}: ${(await r.text()).slice(0, 200)}`);
  elCache.at = 0;
  return `el:${(await r.json()).voice_id}`;
}

export const SAMPLE_TEXT = 'سلام، معاك متجر Zinor. عيّطنالك على الكوموند اللي درتها. عندك دقيقة باش نأكدوها؟';
