import { Router, send } from '../http.js';
import { config } from '../config.js';
import { hmac, safeEqual } from '../crypto.js';
import { db } from '../db.js';
import { processWhatsAppWebhook } from '../services/inbound.js';
import { ingestStoreWebhook } from '../services/stores.js';
import { loadAccount } from '../services/accounts.js';
import { applyCarrierEvent, findShipmentByTracking } from '../services/shipping.js';
import { audit, logError } from '../services/audit.js';
import { verifyBridge, toTwiml } from '../calls/bridge.js';
import * as calls from '../calls/engine.js';
import { getSetting } from '../services/settings.js';

export const hooks = new Router();

// WhatsApp: تحقق الاشتراك (GET) + الأحداث (POST) موقّعة بـ X-Hub-Signature-256
hooks.get('/webhooks/whatsapp', (req, res) => {
  const q = req.query;
  if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === config.wa.verifyToken) return send(res, 200, String(q['hub.challenge'] || ''));
  send(res, 403, 'forbidden');
});
hooks.post('/webhooks/whatsapp', async (req, res) => {
  if (config.wa.appSecret) {
    const sig = String(req.headers['x-hub-signature-256'] || '').replace('sha256=', '');
    if (!safeEqual(sig, hmac('sha256', config.wa.appSecret, req.rawBody))) {
      audit('whatsapp.webhook.bad_signature', { level: 'error' });
      return send(res, 401, { error: 'bad signature' });
    }
  }
  try { await processWhatsAppWebhook(req.body); } catch (e) { logError('whatsapp.webhook', e, { retryable: true }); }
  send(res, 200, { ok: true }); // واتساب يعاود الإرسال إذا ما جاوبناش 200
});

hooks.post('/webhooks/stores/:id', async (req, res) => {
  const r = await ingestStoreWebhook(Number(req.params.id), req);
  send(res, 200, { ok: true, order: r.order?.number, duplicate: !!r.duplicate, ignored: !!r.ignored });
});

// شركات التوصيل (Yalidine تبعث GET للتحقق ب crc_token)
hooks.get('/webhooks/carriers/:id', (req, res) => {
  const a = loadAccount('carrier', Number(req.params.id));
  const token = a?.connector.webhookChallenge?.(req.query);
  if (!token) return send(res, 404, 'not found');
  send(res, 200, token);
});
hooks.post('/webhooks/carriers/:id', async (req, res) => {
  const a = loadAccount('carrier', Number(req.params.id), { includeDeleted: true });
  if (!a || !a.connector.capabilities.webhook) return send(res, 404, { error: 'not found' });
  if (!a.connector.verifyWebhook(a, req)) { audit('carrier.webhook.bad_signature', { level: 'error', entity: 'carrier_accounts', entityId: a.id }); return send(res, 401, { error: 'bad signature' }); }
  const events = a.connector.parseWebhook(a, req.body);
  let applied = 0;
  for (const ev of events) {
    const s = findShipmentByTracking(a.code, ev.tracking);
    if (!s) { audit('carrier.webhook.unknown_tracking', { level: 'error', details: ev }); continue; }
    if (applyCarrierEvent(s, ev).applied) applied++;
  }
  db.run('UPDATE carrier_accounts SET last_error=NULL WHERE id=?', a.id);
  send(res, 200, { ok: true, received: events.length, applied });
});

// ───── المكالمات (من n8n، موقّعة بـ CALLS_WEBHOOK_SECRET) ─────
const TWILIO_STATUS = { completed: 'completed', busy: 'busy', 'no-answer': 'no_answer', failed: 'failed', canceled: 'no_answer' };

// كلام الزبون (أو بداية المكالمة) ← ردّ Zinor كـ TwiML
hooks.post('/webhooks/calls/turn', async (req, res) => {
  if (!verifyBridge(req)) { audit('calls.webhook.bad_signature', { level: 'error' }); return send(res, 401, { error: 'bad signature' }); }
  const b = req.body || {};
  try {
    let call = b.call_id ? calls.getCall(Number(b.call_id)) : (b.provider_call_id ? calls.callByProviderId(b.provider_call_id) : null);
    let reply;
    if (!call && b.direction === 'inbound') {
      const r = calls.inboundCall(b.from, b.provider_call_id || null);
      call = r.call; reply = r.reply;
    } else if (!call) return send(res, 404, { error: 'call not found' });
    else if (call.status !== 'in_progress') {
      if (/^(machine|fax)/.test(String(b.answered_by || ''))) {
        await calls.callEvent(call.id, 'voicemail');
        reply = { actions: [], end: true };
      } else reply = await calls.callEvent(call.id, 'answered');
    } else reply = await calls.callTurn(call.id, b.silence ? '' : String(b.speech || ''));
    const voice = getSetting('calls').voice;
    const voiceId = voice.same_voice && voice.clone_voice_id ? voice.clone_voice_id : call.direction === 'in' ? voice.inbound : voice.outbound;
    send(res, 200, { call_id: call.id, end: !!reply.end, outcome: reply.outcome || null, twiml: await toTwiml(call, reply, voiceId) });
  } catch (e) {
    logError('calls.turn', e, { details: { call_id: b.call_id } });
    send(res, 200, { end: true, twiml: '<?xml version="1.0" encoding="UTF-8"?><Response><Say language="ar-XA">سمحلنا، كاين مشكل تقني. راح نعاودو نتصلو بيك.</Say><Hangup/></Response>' });
  }
});

// حالة المكالمة من Twilio (completed / busy / no-answer / failed)
hooks.post('/webhooks/calls/events', async (req, res) => {
  if (!verifyBridge(req)) { audit('calls.webhook.bad_signature', { level: 'error' }); return send(res, 401, { error: 'bad signature' }); }
  const b = req.body || {};
  const call = b.call_id ? calls.getCall(Number(b.call_id)) : calls.callByProviderId(b.provider_call_id);
  if (!call) return send(res, 404, { error: 'call not found' });
  if (b.provider_call_id && !call.provider_call_id) db.run('UPDATE calls SET provider_call_id=? WHERE id=?', b.provider_call_id, call.id);
  let type = TWILIO_STATUS[b.status] || b.status;
  if (type === 'completed' && /^(machine|fax)/.test(String(b.answered_by || '')) && call.status !== 'in_progress') type = 'voicemail';
  if (!['completed', 'busy', 'no_answer', 'failed', 'voicemail', 'answered'].includes(type)) return send(res, 200, { ignored: true });
  const r = await calls.callEvent(call.id, type, { error: b.error || (b.error_code ? `Twilio ${b.error_code}` : null) });
  send(res, 200, { ok: true, duplicate: !!r?.duplicate });
});
