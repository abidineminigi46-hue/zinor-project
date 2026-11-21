// حسابات الربط (شركات التوصيل + المتاجر): إضافة، تعديل، تفعيل، تعطيل، نزع الربط
import { db, now } from '../db.js';
import { encrypt, decrypt, maskSecrets, randomToken } from '../crypto.js';
import { CARRIERS, getCarrier } from '../connectors/carriers/index.js';
import { STORES, getStoreConnector } from '../connectors/stores/index.js';
import { audit } from './audit.js';
import { config } from '../config.js';

const KINDS = {
  carrier: { table: 'carrier_accounts', codeCol: 'carrier_code', get: getCarrier, all: CARRIERS },
  store: { table: 'store_accounts', codeCol: 'platform', get: getStoreConnector, all: STORES },
};

export function loadAccount(kind, id, { includeDeleted = false } = {}) {
  const K = KINDS[kind];
  const a = db.get(`SELECT * FROM ${K.table} WHERE id=? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`, id);
  if (!a) return null;
  a.credentials = decrypt(a.credentials);
  a.settings = JSON.parse(a.settings || '{}');
  a.code = a[K.codeCol];
  a.connector = K.get(a.code);
  return a;
}

export function computeStatus(a) {
  if (a.deleted_at) return 'removed';
  if (!a.enabled) return 'disabled';
  if (a.mode === 'simulation') return 'simulation';
  const fields = (a.connector?.credentialFields || []).filter((f) => !f.optional);
  if (fields.some((f) => !a.credentials?.[f.key])) return 'needs_config';
  if (a.last_error) return 'error';
  return 'connected';
}

export function publicAccount(kind, a) {
  const c = a.connector;
  const out = {
    id: a.id, kind, code: a.code, label: a.label, mode: a.mode, enabled: !!a.enabled, is_default: !!a.is_default,
    status: computeStatus(a), last_error: a.last_error, last_test_at: a.last_test_at, last_event_at: a.last_event_at,
    settings: Object.fromEntries(Object.entries(a.settings).filter(([k]) => !k.startsWith('sim_'))),
    credentials: maskSecrets(a.credentials, c?.credentialFields || []), created_at: a.created_at, deleted_at: a.deleted_at,
  };
  if (kind === 'store') out.webhook_url = `${config.publicUrl}/webhooks/stores/${a.id}`;
  if (kind === 'carrier' && c?.capabilities.webhook) out.webhook_url = `${config.publicUrl}/webhooks/carriers/${a.id}`;
  return out;
}

export function listAccounts(kind, { includeDeleted = false } = {}) {
  const K = KINDS[kind];
  return db.all(`SELECT id FROM ${K.table} ${includeDeleted ? '' : 'WHERE deleted_at IS NULL'} ORDER BY id`)
    .map((r) => publicAccount(kind, loadAccount(kind, r.id, { includeDeleted: true })));
}

export function connectorCatalog(kind) {
  return Object.values(KINDS[kind].all).map((c) => ({
    code: c.code || c.platform, name: c.name, docsUrl: c.docsUrl, docsStatus: c.docsStatus, docsNote: c.docsNote,
    capabilities: c.capabilities, credentialFields: c.credentialFields, settingsFields: c.settingsFields, webhookHelp: c.webhookHelp,
  }));
}

export function createAccount(kind, { code, label, mode = 'simulation', credentials = {}, settings = {} }, user) {
  const K = KINDS[kind];
  const conn = K.get(code);
  if (!conn) throw httpErr(400, 'منصّة/شركة غير مدعومة — لازم يتزاد موصّل (شوف docs/CONNECTORS.md)');
  const id = db.insert(K.table, {
    [K.codeCol]: code, label: label || conn.name, mode, credentials: encrypt(clean(credentials)), settings: JSON.stringify(settings), enabled: 1,
  });
  if (kind === 'carrier' && !db.get('SELECT id FROM carrier_accounts WHERE is_default=1 AND deleted_at IS NULL AND id<>?', id)) {
    db.run('UPDATE carrier_accounts SET is_default=1 WHERE id=?', id);
  }
  refreshStatus(kind, id);
  audit(`${kind}.account.create`, { user, entity: K.table, entityId: id, details: { code, mode } });
  return publicAccount(kind, loadAccount(kind, id));
}

export function updateAccount(kind, id, patch, user) {
  const K = KINDS[kind];
  const a = loadAccount(kind, id);
  if (!a) throw httpErr(404, 'الحساب غير موجود');
  const upd = {};
  if (patch.label != null) upd.label = patch.label;
  if (patch.mode) upd.mode = patch.mode;
  if (patch.credentials) {
    // الحقول الفارغة أو المقنّعة (••••) ما تبدّلش القيمة القديمة
    const merged = { ...a.credentials };
    for (const [k, v] of Object.entries(patch.credentials)) if (v !== '' && v != null && !String(v).startsWith('••••')) merged[k] = v;
    upd.credentials = encrypt(merged);
  }
  if (patch.settings) upd.settings = JSON.stringify({ ...a.settings, ...patch.settings });
  if (patch.enabled != null) upd.enabled = patch.enabled ? 1 : 0;
  upd.last_error = null;
  db.update(K.table, id, upd);
  refreshStatus(kind, id);
  audit(`${kind}.account.update`, { user, entity: K.table, entityId: id, details: { fields: Object.keys(patch) } });
  return publicAccount(kind, loadAccount(kind, id));
}

export function setDefaultCarrier(id, user) {
  db.tx(() => { db.run('UPDATE carrier_accounts SET is_default=0'); db.run('UPDATE carrier_accounts SET is_default=1 WHERE id=?', id); });
  audit('carrier.account.default', { user, entity: 'carrier_accounts', entityId: id });
}

// نزع الربط: نمسحو المفاتيح ونعطّلو، والسجلّ (طلبات/شحنات) يبقى
export function removeAccount(kind, id, user) {
  const K = KINDS[kind];
  db.run(`UPDATE ${K.table} SET deleted_at=?, enabled=0, credentials=NULL ${kind === 'carrier' ? ', is_default=0' : ''} WHERE id=?`, now(), id);
  if (kind === 'carrier') db.run('DELETE FROM carrier_rules WHERE carrier_account_id=?', id);
  audit(`${kind}.account.remove`, { user, entity: K.table, entityId: id });
}

export async function testAccount(kind, id, user) {
  const K = KINDS[kind];
  const a = loadAccount(kind, id);
  if (!a) throw httpErr(404, 'الحساب غير موجود');
  let result;
  try { result = await a.connector.testConnection(a); }
  catch (e) { result = { ok: false, message: e.message }; }
  db.update(K.table, id, { last_error: result.ok ? null : result.message, ...(kind === 'carrier' ? { last_test_at: now() } : {}) });
  refreshStatus(kind, id);
  audit(`${kind}.account.test`, { user, entity: K.table, entityId: id, level: result.ok ? 'info' : 'error', details: result });
  return result;
}

export function refreshStatus(kind, id) {
  const a = loadAccount(kind, id, { includeDeleted: true });
  db.run(`UPDATE ${KINDS[kind].table} SET status=? WHERE id=?`, computeStatus(a), id);
}

const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== '' && v != null));
export function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }
export const newWebhookSecret = () => randomToken(20);
