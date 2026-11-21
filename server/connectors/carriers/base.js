// ─────────────────────────────────────────────────────────────────────────────
// الواجهة الداخلية الموحّدة لكل شركة توصيل (Carrier Connector)
// منطق الكوموندات ما يعرفش تفاصيل أي شركة؛ يتعامل غير مع هاذ الدوال.
// لإضافة شركة جديدة: شوف docs/CONNECTORS.md
// ─────────────────────────────────────────────────────────────────────────────
import { db } from '../../db.js';
import { randomToken } from '../../crypto.js';

// الحالات الموحّدة + ترتيبها (للمراحل)
export const SHIP_STATUS = {
  created: { ar: 'مسجّلة عند الشركة', phase: 'forward' },
  picked_up: { ar: 'استلمها الناقل', phase: 'forward' },
  in_transit: { ar: 'في الطريق', phase: 'forward' },
  at_hub: { ar: 'وصلت للولاية / المكتب', phase: 'forward' },
  out_for_delivery: { ar: 'خرجت مع الليفرور', phase: 'forward' },
  delivery_failed: { ar: 'محاولة توصيل فاشلة', phase: 'forward' },
  delivered: { ar: 'تسلّمت', phase: 'terminal' },
  returning: { ar: 'راجعة للمخزن', phase: 'return' },
  returned: { ar: 'رجعت للمخزن', phase: 'return_terminal' },
  cancelled: { ar: 'ملغاة', phase: 'terminal' },
};

export class ConnectorError extends Error {
  // kind: 'auth' | 'validation' | 'network' | 'unknown_result' | 'not_supported' | 'remote'
  constructor(kind, message, extra = {}) { super(message); this.kind = kind; Object.assign(this, extra); }
}

/**
 * شكل الموصّل (كل شركة تصدّر object بهاذ الشكل):
 * {
 *   code, name, logo, website, docsUrl,
 *   docsStatus: 'documented' | 'needs_verification' | 'not_public',
 *   docsNote,                                  // واش ناقص بالضبط
 *   capabilities: { createShipment, tracking, webhook, polling, returnPickup, stopDesks, outForDeliveryStatus, eta },
 *   credentialFields: [{ key, label, secret }],
 *   settingsFields:   [{ key, label, type, options? }],
 *   statusMap: { 'حالة الشركة': 'حالة موحّدة' },
 *   testConnection(account)                    → { ok, message }
 *   createShipment(account, shipmentInput)     → { tracking, externalId, labelUrl }
 *   findShipment(account, reference)           → { tracking, externalId } | null   (تحقق قبل إعادة المحاولة)
 *   getTracking(account, tracking)             → [{ externalStatus, occurredAt, note, eta? }]
 *   verifyWebhook(account, req)                → boolean
 *   parseWebhook(account, body)                → [{ eventId, tracking, externalStatus, occurredAt, note, eta? }]
 *   requestReturnPickup(account, input)        → { tracking }   (أو ConnectorError('not_supported'))
 * }
 */

export function mapStatus(connector, account, externalStatus) {
  const overrides = account?.settings?.status_map_overrides || {};
  const key = String(externalStatus || '').trim();
  const lower = key.toLowerCase();
  const find = (m) => m[key] ?? Object.entries(m).find(([k]) => k.toLowerCase() === lower)?.[1];
  return find(overrides) || find(connector.statusMap) || null;
}

// ───── محاكاة API شركة توصيل (تخدم بلا مفاتيح، معلّمة "تجريبي") ─────
export const simulator = {
  async create(code, prefix, account, input) {
    const s = account.settings || {};
    if (s.sim_fail_next === 'error') {
      clearSimFlag(account.id);
      throw new ConnectorError('remote', 'محاكاة: الشركة رفضت الطلب (خطأ تجريبي)');
    }
    const existing = db.get('SELECT * FROM sim_parcels WHERE carrier_code=? AND account_id=? AND reference=?', code, account.id, input.reference);
    if (existing) return { tracking: existing.tracking, externalId: existing.tracking, duplicate: true };
    const tracking = `${prefix}-${randomToken(4).toUpperCase().slice(0, 7)}`;
    db.insert('sim_parcels', { carrier_code: code, account_id: account.id, reference: input.reference, tracking, payload: input });
    if (s.sim_fail_next === 'timeout_after_create') {
      clearSimFlag(account.id);
      // الطرد تخلق عند الشركة لكن الجواب ضاع → نتيجة غير واضحة
      throw new ConnectorError('unknown_result', 'محاكاة: انقطع الاتصال بعد الإرسال — النتيجة غير واضحة');
    }
    return { tracking, externalId: tracking, labelUrl: null };
  },
  async find(code, account, reference) {
    const p = db.get('SELECT * FROM sim_parcels WHERE carrier_code=? AND account_id=? AND reference=?', code, account.id, reference);
    return p ? { tracking: p.tracking, externalId: p.tracking } : null;
  },
  async pickup(prefix) { return { tracking: `${prefix}-R${randomToken(3).toUpperCase().slice(0, 6)}` }; },
};
function clearSimFlag(id) {
  const a = db.get('SELECT settings FROM carrier_accounts WHERE id=?', id);
  const s = JSON.parse(a.settings || '{}'); delete s.sim_fail_next;
  db.run('UPDATE carrier_accounts SET settings=? WHERE id=?', JSON.stringify(s), id);
}

export async function httpJson(url, { method = 'GET', headers = {}, body, timeoutMs = 20000 } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: body == null ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // انقطاع بعد الإرسال (POST) → ما نعرفوش واش تخلق ولا لا
    throw new ConnectorError(method === 'GET' ? 'network' : 'unknown_result', `تعذّر الاتصال: ${e.message}`);
  }
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (res.status === 401 || res.status === 403) throw new ConnectorError('auth', `مفاتيح غير صالحة (${res.status})`, { data });
  if (res.status >= 500) throw new ConnectorError(method === 'GET' ? 'network' : 'unknown_result', `خطأ عند الشركة (${res.status})`, { data });
  if (!res.ok) throw new ConnectorError('remote', `رفض (${res.status}): ${typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 300)}`, { data });
  return data;
}
