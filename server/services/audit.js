import { db } from '../db.js';

export function audit(action, { user, actor, entity, entityId, details, level = 'info', retryable = false } = {}) {
  db.insert('audit_log', {
    level, user_id: user?.id ?? null, actor: actor || user?.name || 'system', action, entity: entity ?? null,
    entity_id: entityId ?? null, details: details == null ? null : typeof details === 'string' ? details : JSON.stringify(details),
    retryable: retryable ? 1 : 0,
  });
}
export const logError = (action, err, extra = {}) => {
  if (process.env.NODE_ENV !== 'test') console.error(`[${action}]`, err?.message || err);
  audit(action, { ...extra, level: 'error', details: { error: String(err?.message || err), ...(extra.details || {}) } });
};
