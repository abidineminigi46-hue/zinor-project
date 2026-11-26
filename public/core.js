// أدوات مشتركة للواجهة
export const state = { user: null, meta: null };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const dzd = (n) => n == null ? '—' : `${Number(n).toLocaleString('fr-FR').replace(/ /g, ' ')} دج`;
export const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') || String(s).includes('+') ? '' : 'Z'));
  return d.toLocaleString('ar-DZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', numberingSystem: 'latn' });
};

export async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body !== undefined || method !== 'GET' ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : method !== 'GET' ? '{}' : undefined, credentials: 'same-origin' });
  let data = {};
  try { data = await r.json(); } catch {}
  if (r.status === 401 && url !== '/api/login') { state.user = null; location.hash = '#/login'; throw new Error(data.error || 'لازم تدخل'); }
  if (!r.ok && r.status !== 422) throw new Error(data.error || `خطأ ${r.status}`);
  return data;
}

export function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type === 'err' ? 'err' : ''}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

export async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.message, 'err'); throw e; }
}

export function modal(title, bodyHtml, { onSubmit, submitLabel = 'حفظ', wide = false } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<form class="modal" style="${wide ? 'width:min(860px,100%)' : ''}"><div class="mh"><h2>${esc(title)}</h2><button type="button" class="btn ghost sm" data-x>✕</button></div>
    <div class="mb">${bodyHtml}</div>${onSubmit ? `<div class="mf"><button type="button" class="btn" data-x>إلغاء</button><button class="btn primary">${esc(submitLabel)}</button></div>` : ''}</form>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-x]')) close(); });
  bg.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('.mf .primary'); if (btn) btn.disabled = true;
    try { if ((await onSubmit(fd, bg)) !== false) close(); } catch (err) { toast(err.message, 'err'); } finally { if (btn) btn.disabled = false; }
  });
  return { el: bg, close };
}

// ألوان الحالات
const ORDER_TONE = {
  new: 'blue', awaiting_confirmation: 'amber', needs_review: 'red', confirmed: 'violet', dispatching: 'violet', dispatch_failed: 'red',
  dispatch_unknown: 'red', shipped: 'blue', out_for_delivery: 'gold', delivery_failed: 'red', delivered: 'green', returning: 'amber', returned: 'gray', cancelled: 'gray',
};
export const orderBadge = (s) => `<span class="badge b-${ORDER_TONE[s] || 'gray'}">${esc(state.meta?.orderStatus[s] || s)}</span>`;
const SHIP_TONE = { created: 'blue', picked_up: 'blue', in_transit: 'blue', at_hub: 'violet', out_for_delivery: 'gold', delivery_failed: 'red', delivered: 'green', returning: 'amber', returned: 'gray', cancelled: 'gray' };
export const shipBadge = (s) => s ? `<span class="badge b-${SHIP_TONE[s] || 'gray'}">${esc(state.meta?.shipStatus[s] || s)}</span>` : '<span class="muted">—</span>';
const RET_TONE = { requested: 'amber', needs_review: 'red', accepted: 'violet', rejected: 'gray', in_transit: 'blue', returned_to_stock: 'green' };
export const retBadge = (s) => `<span class="badge b-${RET_TONE[s] || 'gray'}">${esc(state.meta?.returnStatus[s] || s)}</span>`;
const CONN = { connected: ['green', 'متصل'], needs_config: ['amber', 'يستنى الإعدادات'], simulation: ['violet', 'تجريبي'], error: ['red', 'خطأ'], disabled: ['gray', 'معطّل'], removed: ['gray', 'منزوع'] };
export const connBadge = (s) => `<span class="badge b-${CONN[s]?.[0] || 'gray'}">${CONN[s]?.[1] || s}</span>`;
const DOCS = { documented: ['green', 'موثّق علنياً'], needs_verification: ['amber', 'يلزم التحقق من التوثيق'], not_public: ['red', 'توثيق غير عمومي — webhook عام'] };
export const docsBadge = (s) => `<span class="badge plain b-${DOCS[s]?.[0]}">${DOCS[s]?.[1] || s}</span>`;
export const SOURCE = { whatsapp: ['green', 'واتساب'], store: ['blue', 'متجر'], manual: ['gray', 'يدوي'] };
export const sourceBadge = (s, platform) => `<span class="badge plain b-${SOURCE[s]?.[0]}">${SOURCE[s]?.[1] || s}${platform ? ' · ' + esc(platformName(platform)) : ''}</span>`;
export const platformName = (p) => state.meta?.stores.find((x) => x.code === p)?.name || p;
export const carrierName = (c) => state.meta?.carriers.find((x) => x.code === c)?.name || c || '—';
export const wilayaName = (code) => state.meta?.wilayas.find((w) => w.code === Number(code))?.ar || '—';
export const wilayaOptions = (sel) => `<option value="">—</option>` + (state.meta?.wilayas || []).map((w) => `<option value="${w.code}" ${Number(sel) === w.code ? 'selected' : ''}>${w.code} — ${esc(w.ar)}</option>`).join('');
export const options = (obj, sel, empty = 'الكل') => `<option value="">${empty}</option>` + Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}" ${String(sel) === String(k) ? 'selected' : ''}>${esc(v)}</option>`).join('');
export const isAdmin = () => state.user?.role === 'admin';

export const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  orders: '<path d="M6 3h12l1 4H5zM5 7h14v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM9 11h6"/>',
  chat: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  box: '<path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10"/>',
  map: '<path d="M9 4l6 2 6-2v14l-6 2-6-2-6 2V6z"/><path d="M9 4v14M15 6v14"/>',
  store: '<path d="M4 9l2-5h12l2 5M4 9h16v11H4zM9 20v-6h6v6"/>',
  plug: '<path d="M9 3v5M15 3v5M7 8h10v4a5 5 0 0 1-10 0zM12 17v4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  log: '<path d="M5 4h14v16H5zM9 8h6M9 12h6M9 16h3"/>',
  call: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3M4 4v4h4M20 20v-4h-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
export const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
