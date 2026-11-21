// عميل WhatsApp Business Cloud API (graph.facebook.com) — وإلا محاكاة معلّمة
import { config, waLive } from '../config.js';
import { db } from '../db.js';
import { addMessage, inWindow } from './conversations.js';
import { getSetting, render } from './settings.js';
import { logError } from './audit.js';

async function graph(payload) {
  const url = `https://graph.facebook.com/${config.wa.graphVersion}/${config.wa.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST', headers: { Authorization: `Bearer ${config.wa.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }), signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `WhatsApp ${res.status}`);
  return data?.messages?.[0]?.id;
}

// يرجّع معرّف الرسالة مباشرة؛ الإرسال الحقيقي يمشي في طابور لكل محادثة (باش يحافظ على الترتيب)
const queues = new Map();
function deliver(conv, record, payload) {
  if (!waLive()) return addMessage(conv, { ...record, direction: 'out', status: 'simulated' });
  const id = addMessage(conv, { ...record, direction: 'out', status: 'pending' });
  const prev = queues.get(conv.id) || Promise.resolve();
  const next = prev.then(async () => {
    try {
      const waId = await graph({ to: conv.wa_phone, ...payload });
      db.run('UPDATE messages SET status=?, wa_message_id=? WHERE id=?', 'sent', waId, id);
    } catch (e) {
      db.run('UPDATE messages SET status=?, error=? WHERE id=?', 'failed', e.message, id);
      logError('whatsapp.send', e, { entity: 'conversation', entityId: conv.id, retryable: true });
    }
  });
  queues.set(conv.id, next);
  next.finally(() => { if (queues.get(conv.id) === next) queues.delete(conv.id); });
  return id;
}

const btnTitle = (t) => String(t).slice(0, 20);

// رسالة حرّة (داخل نافذة 24 ساعة)
export function sendText(conv, body, { author = 'ai', agentUserId } = {}) {
  return deliver(conv, { author, agentUserId, body }, { type: 'text', text: { body, preview_url: false } });
}

export function sendButtons(conv, body, buttons, { author = 'ai' } = {}) {
  const b = buttons.slice(0, 3);
  return deliver(conv, { author, body, type: 'interactive', buttons: b }, {
    type: 'interactive',
    interactive: { type: 'button', body: { text: body.slice(0, 1024) }, action: { buttons: b.map((x) => ({ type: 'reply', reply: { id: x.id, title: btnTitle(x.title) } })) } },
  });
}

// ترتيب المتغيّرات في القالب = ترتيب ظهور {..} في النص (لازم يطابق القالب المعتمد في Meta)
export const templateParams = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

/**
 * إشعار: داخل النافذة → رسالة عادية (أو بأزرار)؛ خارج النافذة → قالب معتمد (template) إجباري حسب قواعد واتساب.
 */
export function sendNotification(conv, key, vars, buttons = null, { author = 'system' } = {}) {
  const tpl = getSetting('templates')[key];
  if (!tpl) throw new Error(`قالب غير معروف: ${key}`);
  const body = render(tpl.text, vars);
  if (inWindow(conv)) return buttons ? sendButtons(conv, body, buttons, { author }) : sendText(conv, body, { author });
  const components = [{ type: 'body', parameters: templateParams(tpl.text).map((k) => ({ type: 'text', text: String(vars[k] ?? '-') || '-' })) }];
  (buttons || []).forEach((b, i) => components.push({ type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload: b.id }] }));
  return deliver(conv, { author, body, type: 'template', templateName: tpl.wa_template, buttons }, {
    type: 'template', template: { name: tpl.wa_template, language: { code: config.wa.templateLang }, components },
  });
}

export function updateMessageStatus(waMessageId, status, error) {
  db.run('UPDATE messages SET status=?, error=COALESCE(?, error) WHERE wa_message_id=?', status, error ?? null, waMessageId);
}
