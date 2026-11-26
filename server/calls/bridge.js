// المكوّن المستقل بين Zinor و n8n / خدمة الهاتف (Twilio).
// Zinor ما يشدّش مفاتيح Twilio: n8n هو اللي يتصل بـ Twilio، و Zinor يسيّر الجدولة والحوار والنتائج.
//   Zinor ──(call.start موقّع)──▶ n8n ──▶ Twilio Create Call
//   Twilio ──(كلام الزبون)──▶ n8n ──(turn موقّع)──▶ Zinor ──(TwiML)──▶ n8n ──▶ Twilio
//   Twilio ──(حالة المكالمة)──▶ n8n ──(event موقّع)──▶ Zinor
import { config, callsBridgeReady } from '../config.js';
import { hmac, safeEqual } from '../crypto.js';
import { getMedia, signedUrl } from './media.js';
import { voiceInfo, synthesize } from './voices.js';
import { toSpeech } from './speech.js';

export const toE164 = (local) => { const d = String(local || '').replace(/\D/g, ''); return d.startsWith('213') ? `+${d}` : d.startsWith('0') ? `+213${d.slice(1)}` : `+${d}`; };

export function sign(body, ts = Math.floor(Date.now() / 1000)) {
  return { ts: String(ts), sig: hmac('sha256', config.calls.webhookSecret, `${ts}.${body}`) };
}
// تحقق من توقيع n8n: X-Zinor-Timestamp + X-Zinor-Signature = HMAC-SHA256(secret, "ts.body") — صالح 5 دقائق
export function verifyBridge(req) {
  if (!config.calls.webhookSecret) return false;
  const ts = Number(req.headers['x-zinor-timestamp']);
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  return safeEqual(req.headers['x-zinor-signature'], hmac('sha256', config.calls.webhookSecret, `${ts}.${req.rawBody?.toString('utf8') || ''}`));
}

export const simulationProvider = {
  name: 'simulation',
  async dial() { return { providerCallId: null, status: 'ringing' }; },
};

export const n8nProvider = {
  name: 'twilio-via-n8n',
  async dial(call) {
    if (!callsBridgeReady()) throw new Error('ربط n8n ناقص: N8N_CALL_START_URL / N8N_CALL_TURN_URL / CALLS_WEBHOOK_SECRET');
    const body = JSON.stringify({ event: 'call.start', call_id: call.id, to: toE164(call.phone), turn_url: `${config.calls.n8nTurnUrl}?call_id=${call.id}`, machine_detection: true });
    const { ts, sig } = sign(body);
    let res;
    try {
      res = await fetch(config.calls.n8nStartUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zinor-Timestamp': ts, 'X-Zinor-Signature': sig }, body, signal: AbortSignal.timeout(20000) });
    } catch (e) { throw new Error(`n8n ما جاوبش: ${e.message}`); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`n8n/Twilio رفض (${res.status}): ${data.error || data.message || ''}`);
    return { providerCallId: data.provider_call_id || data.sid || null, status: 'queued' };
  },
};

const xml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

/** يحوّل ردّ الحوار لـ TwiML (يتعمل فيه barge-in باش الزبون يقدر يقاطع) */
export async function toTwiml(call, reply, voiceId) {
  const v = voiceInfo(voiceId);
  const parts = [];
  for (const a of reply.actions) {
    if (a.type === 'play') { const m = getMedia(a.media_id); if (m) parts.push(`<Play>${xml(signedUrl(m.file))}</Play>`); }
    else if (a.type === 'say') {
      const speech = a.speech || toSpeech(a.text); // النص المخصّص للصوت (زينور، باب الزوار، ثلاثة آلاف...)
      if (v.provider === 'elevenlabs') {
        try { parts.push(`<Play>${xml(signedUrl(await synthesize(voiceId, speech)))}</Play>`); continue; } catch { /* نرجعو لـ Say */ }
      }
      const s = v.say || { voice: 'Google.ar-XA-Standard-A', language: 'ar-XA' };
      parts.push(`<Say voice="${s.voice}" language="${s.language}">${xml(speech)}</Say>`);
    }
  }
  let body;
  if (reply.end) body = `${parts.join('')}<Hangup/>`;
  else {
    const action = xml(`${config.calls.n8nTurnUrl}?call_id=${call.id}`);
    body = `<Gather input="speech" language="${config.calls.speechLanguage}" speechTimeout="auto" bargeIn="true" action="${action}" method="POST">${parts.join('')}</Gather>` +
      `<Redirect method="POST">${action}&amp;silence=1</Redirect>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}
