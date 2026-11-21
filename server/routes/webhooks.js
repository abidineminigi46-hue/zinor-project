import { Router, send } from '../http.js';
import { config } from '../config.js';
import { hmac, safeEqual } from '../crypto.js';
import { db } from '../db.js';
import { processWhatsAppWebhook } from '../services/inbound.js';
import { ingestStoreWebhook } from '../services/stores.js';
import { loadAccount } from '../services/accounts.js';
import { applyCarrierEvent, findShipmentByTracking } from '../services/shipping.js';
import { audit, logError } from '../services/audit.js';

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
