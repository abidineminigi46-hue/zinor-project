import { db, now } from '../db.js';
import { normPhone, upsertCustomerByWa } from './customers.js';

export function getOrCreateConversation(waPhone, profileName) {
  const wa = normPhone(waPhone);
  let conv = db.get('SELECT * FROM conversations WHERE wa_phone=?', wa);
  if (!conv) {
    const customer = upsertCustomerByWa(wa);
    const id = db.insert('conversations', { customer_id: customer.id, wa_phone: wa, state: JSON.stringify({ profile_name: profileName || null }) });
    conv = db.get('SELECT * FROM conversations WHERE id=?', id);
  }
  return hydrate(conv);
}
export const getConversation = (id) => hydrate(db.get('SELECT * FROM conversations WHERE id=?', id));
export const conversationByPhone = (p) => hydrate(db.get('SELECT * FROM conversations WHERE wa_phone=?', normPhone(p)));

function hydrate(c) { if (!c) return null; c.state = JSON.parse(c.state || '{}'); return c; }

export function saveState(conv) {
  db.run('UPDATE conversations SET state=?, updated_at=? WHERE id=?', JSON.stringify(conv.state), now(), conv.id);
}

export function addMessage(conv, m) {
  const id = db.insert('messages', {
    conversation_id: conv.id, direction: m.direction, author: m.author, agent_user_id: m.agentUserId ?? null,
    type: m.type || 'text', body: m.body, buttons: m.buttons ? JSON.stringify(m.buttons) : null, template_name: m.templateName ?? null,
    wa_message_id: m.waMessageId ?? null, status: m.status ?? null, error: m.error ?? null,
  });
  const upd = { updated_at: now() };
  if (m.direction === 'in') { upd.last_inbound_at = now(); }
  db.update('conversations', conv.id, upd);
  if (m.direction === 'in') db.run('UPDATE conversations SET unread=unread+1 WHERE id=?', conv.id);
  return id;
}

export function setMode(conv, mode, { user, reason } = {}) {
  db.update('conversations', conv.id, {
    mode, assigned_user_id: mode === 'human' ? user?.id ?? null : null,
    needs_human: mode === 'human' && !user ? 1 : 0, handoff_reason: mode === 'human' ? reason ?? null : null, updated_at: now(),
  });
  conv.mode = mode;
}

export const inWindow = (conv) => {
  const c = db.get('SELECT last_inbound_at FROM conversations WHERE id=?', conv.id);
  if (!c?.last_inbound_at) return false;
  return Date.now() - new Date(c.last_inbound_at.replace(' ', 'T') + 'Z').getTime() < 24 * 3600 * 1000;
};

export const listMessages = (convId, limit = 200) =>
  db.all('SELECT m.*, u.name AS agent_name FROM messages m LEFT JOIN users u ON u.id=m.agent_user_id WHERE conversation_id=? ORDER BY m.id DESC LIMIT ?', convId, limit).reverse()
    .map((m) => ({ ...m, buttons: m.buttons ? JSON.parse(m.buttons) : null }));
