import { state, esc, $, $$, api, act, toast, modal, dzd, fmtDate, orderBadge, shipBadge, retBadge, sourceBadge, carrierName, wilayaName, wilayaOptions, options, isAdmin, icon } from './core.js';
import { inboxPage, shippingPage, simulatorPage } from './pages-ops.js';
import { productsPage, ratesPage, integrationsPage, settingsPage, usersPage, auditPage } from './pages-admin.js';
import { callsSettingsPage, callSimPage, orderCallsCard } from './pages-calls.js';

const NAV = [
  ['الرئيسية', '#/', 'home'], ['الطلبات', '#/orders', 'orders'], ['صندوق واتساب', '#/inbox', 'chat', 'human'], ['الشحن والروتور', '#/shipping', 'truck', 'dispatch'], ['واتساب والمكالمات', '#/calls', 'call', 'calls'],
  ['sec', 'الكتالوج'], ['المنتجات', '#/products', 'box'], ['أسعار التوصيل', '#/rates', 'map'],
  ['sec', 'الربط', true], ['المتاجر والربط', '#/stores', 'store', null, true], ['شركات التوصيل', '#/carriers', 'plug', null, true],
  ['sec', 'الإدارة'], ['الإعدادات', '#/settings', 'gear', null, true], ['المستخدمين', '#/users', 'users', null, true], ['سجلّ الإجراءات', '#/audit', 'log', null, true],
  ['sec', 'التجربة'], ['محاكي واتساب', '#/simulator', 'phone'], ['محاكي المكالمات', '#/call-sim', 'call'],
];
const ROUTES = [
  [/^#\/?$/, homePage], [/^#\/orders$/, ordersPage], [/^#\/orders\/(\d+)$/, orderPage], [/^#\/inbox(?:\/(\d+))?$/, inboxPage],
  [/^#\/shipping$/, shippingPage], [/^#\/products$/, productsPage], [/^#\/rates$/, ratesPage], [/^#\/stores$/, () => integrationsPage('store')],
  [/^#\/carriers$/, () => integrationsPage('carrier')], [/^#\/settings$/, settingsPage], [/^#\/users$/, usersPage], [/^#\/audit$/, auditPage], [/^#\/simulator$/, simulatorPage], [/^#\/calls$/, callsSettingsPage], [/^#\/call-sim$/, callSimPage],
];
let attention = {};
export let cleanup = null;
export const setCleanup = (fn) => { cleanup = fn; };

async function boot() {
  try { state.user = (await api('GET', '/api/me')).user; } catch { state.user = null; }
  window.addEventListener('hashchange', route);
  route();
}

export async function loadMeta() { state.meta = await api('GET', '/api/meta'); }

async function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  if (!state.user) return loginPage();
  if (!state.meta) await loadMeta();
  if (!$('.shell')) layout();
  const h = location.hash || '#/';
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === h || (h.startsWith(a.getAttribute('href') + '/') && a.getAttribute('href') !== '#/')));
  $('.side').classList.remove('open');
  const main = $('#main');
  for (const [re, fn] of ROUTES) {
    const m = h.match(re);
    if (m) { main.innerHTML = '<div class="empty">... جاري التحميل</div>'; try { await fn(main, ...m.slice(1)); } catch (e) { main.innerHTML = `<div class="alert err">${esc(e.message)}</div>`; } return; }
  }
  main.innerHTML = '<div class="empty">الصفحة غير موجودة</div>';
}

function layout() {
  const e = state.meta.engine;
  $('#app').innerHTML = `<div class="shell">
    <aside class="side"><div class="brand"><div class="logo">Z</div><div>Zinor<small>متجر + واتساب + توصيل</small></div></div>
      <nav class="nav">${NAV.filter((n) => !(n[0] === 'sec' ? n[2] && !isAdmin() : n[4] && !isAdmin())).map((n) => n[0] === 'sec' ? `<div class="nav-sec">${n[1]}</div>` : `<a href="${n[1]}">${icon(n[2])}<span>${n[0]}</span>${n[3] ? `<span class="count" data-count="${n[3]}" hidden></span>` : ''}</a>`).join('')}</nav>
      <div class="foot">${esc(state.user.name)} · ${state.user.role === 'admin' ? 'مشرف' : 'موظف'}<br><a href="#" id="logout" style="color:#9fe0c3">خروج</a></div></aside>
    <div class="main"><header class="top"><button class="btn sm menu" id="menu">${icon('menu')}</button>
      <div class="grow"></div>
      <span class="badge ${e.whatsapp === 'live' ? 'b-green' : 'b-violet'}" title="WhatsApp Cloud API">واتساب: ${e.whatsapp === 'live' ? 'مربوط' : 'محاكاة'}</span>
      <span class="badge ${e.ai === 'claude' ? 'b-green' : 'b-violet'}" title="${esc(e.model)}">الذكاء: ${e.ai === 'claude' ? 'Claude' : 'المحرّك المحلي'}</span>
    </header><main class="content" id="main"></main></div></div>`;
  $('#menu').onclick = () => $('.side').classList.toggle('open');
  $('#logout').onclick = async (ev) => { ev.preventDefault(); await api('POST', '/api/logout'); state.user = null; state.meta = null; location.hash = '#/login'; location.reload(); };
  refreshCounts();
  setInterval(refreshCounts, 20000);
}

async function refreshCounts() {
  try {
    attention = (await api('GET', '/api/dashboard')).attention;
    for (const el of $$('[data-count]')) { const n = attention[el.dataset.count]; el.textContent = n; el.hidden = !n; }
  } catch {}
}

function loginPage() {
  $('#app').innerHTML = `<div class="login"><form class="card stack" id="lf">
    <div class="brand" style="color:var(--ink);padding:0"><div class="logo" style="color:#fff">Z</div><div>Zinor<small style="color:var(--muted)">لوحة التحكّم</small></div></div>
    <label class="f">الإيميل<input name="email" type="email" required autocomplete="username" value="admin@zinor.local"></label>
    <label class="f">كلمة السر<input name="password" type="password" required autocomplete="current-password"></label>
    <div id="lerr"></div><button class="btn primary">دخول</button>
    <p class="muted small" style="margin:0">حسابات التجربة: admin@zinor.local / admin12345 — agent@zinor.local / agent12345</p></form></div>`;
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const fd = Object.fromEntries(new FormData(e.target));
      state.user = (await api('POST', '/api/login', fd)).user;
      location.hash = '#/'; route();
    } catch (err) { $('#lerr').innerHTML = `<div class="alert err">${esc(err.message)}</div>`; }
  };
}

// ───────────── الرئيسية ─────────────
async function homePage(main) {
  const today = new Date().toISOString().slice(0, 10);
  const q = JSON.parse(sessionStorage.getItem('dash') || '{}');
  main.innerHTML = `<div class="page-head"><div><h1>الرئيسية</h1><div class="muted small">ملخّص الطلبات والتوصيل</div></div>
    <div class="row"><div class="chips">${[['اليوم', 0], ['7 أيام', 7], ['30 يوم', 30], ['الكل', -1]].map(([l, d]) => `<button class="chip" data-d="${d}">${l}</button>`).join('')}</div>
    <input type="date" id="from" value="${q.from || ''}"><span class="muted">→</span><input type="date" id="to" value="${q.to || ''}"></div></div><div id="dash"></div>`;
  const load = async () => {
    const from = $('#from').value, to = $('#to').value;
    try { sessionStorage.setItem('dash', JSON.stringify({ from, to })); } catch {}
    const d = await api('GET', `/api/dashboard?from=${from}&to=${to}`);
    const k = d.kpis;
    const maxRate = Math.max(30, ...d.retour.map((r) => r.rate));
    $('#dash').innerHTML = `
      <div class="kpis">${[['جديدة', k.new, 'var(--info)', 'new'], ['مؤكدة', k.confirmed, 'var(--violet)', 'confirmed'], ['مرسلة', k.shipped, 'var(--gold)', 'shipped'], ['مسلّمة', k.delivered, 'var(--brand)', 'delivered'], ['راجعة', k.returned, 'var(--danger)', 'returned']]
        .map(([l, v, c, s]) => `<a class="kpi" style="--c:${c};color:inherit" href="#/orders" data-status="${s}"><div class="l">${l}</div><div class="v">${v}</div></a>`).join('')}</div>
      <div class="grid g3" style="margin-top:14px">
        <div class="card" style="grid-column:span 2"><div class="card-head"><h2>الـretour حسب الولاية</h2><span class="muted small">% من الطرود المسلّمة والراجعة</span></div>
          ${d.retour.length ? `<div class="bars">${d.retour.map((r) => `<div class="bar ${r.rate >= 12 ? 'high' : ''}" title="${r.returned}/${r.total}"><div class="pct">${r.rate}%</div><div class="track"><div class="fill" style="height:${Math.max(6, (r.rate / maxRate) * 100)}%"></div></div><div class="name">${esc(r.wilaya)}</div></div>`).join('')}</div>` : '<div class="empty">ما كانش بيانات بعد</div>'}</div>
        <div class="card stack"><h2>يحتاج تدخل</h2>
          ${[['طلبات فشل إرسالها / تحتاج مراجعة', d.attention.dispatch, '#/shipping'], ['محادثات عند الموظف', d.attention.human, '#/inbox'], ['روتور يستنى قرار', d.attention.returns, '#/shipping'], ['فشل التوصيل', d.attention.failed, '#/shipping']]
            .map(([l, n, href]) => `<a href="${href}" class="row between" style="color:inherit;padding:6px 0;border-bottom:1px solid var(--line)"><span>${l}</span><span class="badge ${n ? 'b-red' : 'b-gray'}">${n}</span></a>`).join('')}
          <div class="row between"><span class="muted">مداخيل المسلّمة</span><b>${dzd(d.revenue)}</b></div>
          <div class="row">${d.bySource.map((s) => sourceBadge(s.source) + ` <b>${s.n}</b>`).join(' &nbsp; ')}</div></div>
      </div>
      <div class="card" style="margin-top:14px"><div class="card-head"><h2>آخر الطلبات</h2><a href="#/orders">الكل ←</a></div>${ordersTable(d.recent)}</div>`;
    $$('.kpi').forEach((a) => a.onclick = () => sessionStorage.setItem('orders-f', JSON.stringify({ group: a.dataset.status })));
    bindRows();
  };
  $$('.chip[data-d]').forEach((b) => b.onclick = () => {
    const d = Number(b.dataset.d);
    $('#to').value = d < 0 ? '' : today;
    $('#from').value = d < 0 ? '' : new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    load();
  });
  $('#from').onchange = load; $('#to').onchange = load;
  await load();
}

function ordersTable(rows) {
  if (!rows.length) return '<div class="empty">ما كانش طلبات</div>';
  return `<div class="table-wrap"><table><thead><tr><th>الرقم</th><th>الزبون</th><th>الهاتف</th><th>الولاية</th><th>المبلغ</th><th>المصدر</th><th>الشركة</th><th>التتبع</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>
    ${rows.map((o) => `<tr class="click" data-href="#/orders/${o.id}"><td><b>${esc(o.number)}</b></td><td>${esc(o.customer_name || '—')}</td><td class="mono">${esc(o.phone || '—')}</td><td>${esc(wilayaName(o.wilaya_code))}</td>
      <td>${dzd(o.total)}</td><td>${sourceBadge(o.source, o.store_platform)}</td><td>${esc(o.carrier_code ? carrierName(o.carrier_code) : '—')}</td><td class="mono small">${esc(o.tracking || '—')}</td><td>${orderBadge(o.status)}</td><td class="small muted">${fmtDate(o.created_at)}</td></tr>`).join('')}
    </tbody></table></div>`;
}
export function bindRows(root = document) { $$('tr[data-href]', root).forEach((tr) => tr.onclick = () => (location.hash = tr.dataset.href)); }

// ───────────── الطلبات ─────────────
const GROUPS = { new: 'new', confirmed: 'confirmed', shipped: 'shipped', delivered: 'delivered', returned: 'returned' };
async function ordersPage(main) {
  const saved = JSON.parse(sessionStorage.getItem('orders-f') || '{}');
  sessionStorage.removeItem('orders-f');
  const m = state.meta;
  main.innerHTML = `<div class="page-head"><div><h1>الطلبات</h1><div class="muted small">ابحث بالهاتف، رقم الكوموند أو رقم التتبع</div></div><button class="btn primary" id="new">${icon('plus')} طلب جديد</button></div>
    <div class="card flat" style="margin-bottom:12px"><div class="row">
      <input id="q" class="grow" placeholder="🔎 هاتف، ZN1001، رقم التتبع، اسم..." style="min-width:220px">
      <select id="source">${options({ whatsapp: 'واتساب', store: 'متجر', manual: 'يدوي' }, '', 'كل المصادر')}</select>
      <select id="wilaya"><option value="">كل الولايات</option>${wilayaOptions().replace('<option value="">—</option>', '')}</select>
      <select id="carrier">${options(Object.fromEntries(m.carrierAccounts.map((a) => [a.id, a.label])), '', 'كل الشركات')}</select>
      <select id="status">${options(m.orderStatus, GROUPS[saved.group] || '', 'كل الحالات')}</select>
    </div></div><div id="list"></div>`;
  const load = async () => {
    const p = new URLSearchParams({ q: $('#q').value, source: $('#source').value, wilaya: $('#wilaya').value, carrier: $('#carrier').value, status: $('#status').value });
    const d = await api('GET', '/api/orders?' + p);
    $('#list').innerHTML = `<div class="muted small" style="margin-bottom:6px">${d.orders.length} طلب</div>` + ordersTable(d.orders);
    bindRows($('#list'));
  };
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  $$('select', main).forEach((s) => s.onchange = load);
  $('#new').onclick = newOrderModal;
  await load();
}

async function newOrderModal() {
  const { products } = await api('GET', '/api/products');
  const m = state.meta;
  modal('طلب جديد (يدوي)', `
    <div class="grid g2"><label class="f">الاسم واللقب<input name="customer_name" required></label><label class="f">الهاتف<input name="phone" required placeholder="05XXXXXXXX"></label></div>
    <div class="grid g2"><label class="f">المنتج<select name="product_id" required>${products.filter((p) => p.active).map((p) => `<option value="${p.id}">${esc(p.name)} — ${dzd(p.price)} (مخزون ${p.stock})</option>`).join('')}</select></label>
      <label class="f">الكمية<input name="qty" type="number" min="1" value="1"></label></div>
    <div class="grid g2"><label class="f">الولاية<select name="wilaya_code" required>${wilayaOptions()}</select></label><label class="f">البلدية<input name="commune" required></label></div>
    <div class="grid g2"><label class="f">التوصيل<select name="delivery_method"><option value="home">للدار</option><option value="desk">للمكتب (Stop desk)</option></select></label>
      <label class="f">شركة التوصيل<select name="carrier_account_id">${options(Object.fromEntries(m.carrierAccounts.filter((a) => a.enabled && !a.removed).map((a) => [a.id, a.label])), '', 'تلقائي (القواعد / الافتراضية)')}</select></label></div>
    <label class="f">العنوان<input name="address"></label>
    <label class="switch"><input type="checkbox" name="confirmed" checked> الزبون أكّد (يتبعث مباشرة)</label>`, {
    submitLabel: 'إنشاء',
    onSubmit: async (fd) => {
      const r = await api('POST', '/api/orders', { ...fd, confirmed: fd.confirmed === 'on', items: [{ product_id: fd.product_id, qty: fd.qty }] });
      if (fd.confirmed === 'on') await api('POST', `/api/orders/${r.order.id}/dispatch`, {});
      toast(`تم إنشاء ${r.order.number}`);
      location.hash = `#/orders/${r.order.id}`;
    },
  });
}

// ───────────── صفحة الطلب ─────────────
async function orderPage(main, id) {
  const d = await api('GET', `/api/orders/${id}`);
  const o = d.order, m = state.meta;
  const locked = ['shipped', 'out_for_delivery', 'delivered', 'returning', 'returned', 'cancelled'].includes(o.status);
  const canDispatch = ['confirmed', 'dispatch_failed', 'dispatch_unknown', 'needs_review'].includes(o.status);
  const lastShip = d.shipments.filter((s) => s.kind === 'outbound').at(-1);
  main.innerHTML = `<div class="page-head"><div class="row"><a href="#/orders" class="btn sm ghost">→</a><h1>${esc(o.number)}</h1>${orderBadge(o.status)}${sourceBadge(o.source, o.store_platform)}${o.external_id ? `<span class="muted small">#${esc(o.external_id)}</span>` : ''}</div>
    <div class="row">
      ${['new', 'awaiting_confirmation', 'needs_review'].includes(o.status) ? '<button class="btn" id="confirm">تأكيد يدوي</button>' : ''}
      ${o.wa_phone && ['new', 'awaiting_confirmation'].includes(o.status) ? '<button class="btn" id="sendconf">ابعث طلب التأكيد في واتساب</button>' : ''}
      ${canDispatch ? `<select id="carrier">${options(Object.fromEntries(m.carrierAccounts.filter((a) => a.enabled && !a.removed).map((a) => [a.id, a.label])), o.carrier_account_id || '', 'تلقائي')}</select>
        <button class="btn primary" id="dispatch">${o.status === 'dispatch_unknown' ? 'تحقق وعاود المحاولة' : o.status === 'dispatch_failed' ? 'عاود الإرسال' : 'ابعث لشركة التوصيل'}</button>` : ''}
      ${!locked ? '<button class="btn danger" id="cancel">إلغاء</button>' : ''}
    </div></div>
    ${o.last_error && !locked ? `<div class="alert err" style="margin-bottom:12px"><b>آخر خطأ:</b> ${esc(o.last_error)}${o.status === 'dispatch_unknown' ? '<br>النتيجة غير واضحة: قبل أي إرسال جديد نتحققو عند الشركة بنفس المرجع باش ما يتخلقش طرد ثاني.' : ''}</div>` : ''}
    ${!locked && !d.validation.ok ? `<div class="alert warn" style="margin-bottom:12px"><b>ناقص قبل الإرسال:</b> ${d.validation.errors.map(esc).join(' · ')}</div>` : ''}
    ${d.validation.warnings.length ? `<div class="alert info" style="margin-bottom:12px">${d.validation.warnings.map(esc).join(' · ')}</div>` : ''}
    <div class="grid g3">
      <div class="stack" style="grid-column:span 2">
        <div class="card"><div class="card-head"><h2>المنتجات والمبلغ</h2></div>
          <div class="table-wrap"><table><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead><tbody>
          ${d.items.map((i) => `<tr><td>${esc(i.name)} <span class="muted small mono">${esc(i.sku || '')}</span></td><td>${i.qty}</td><td>${dzd(i.unit_price)}</td><td>${dzd(i.unit_price * i.qty)}</td></tr>`).join('')}
          <tr><td colspan="3">التوصيل</td><td>${dzd(o.delivery_fee)}</td></tr><tr><td colspan="3"><b>المجموع عند الاستلام</b></td><td><b>${dzd(o.total)}</b></td></tr></tbody></table></div></div>
        <div class="card"><div class="card-head"><h2>بيانات التوصيل</h2>${locked ? '<span class="muted small">الطلب تبعث — التعديل مقفول</span>' : '<button class="btn sm primary" id="save">حفظ</button>'}</div>
          <form id="df" class="grid g2">
            <label class="f">الاسم<input name="customer_name" value="${esc(o.customer_name || '')}" ${locked ? 'disabled' : ''}></label>
            <label class="f">الهاتف<input name="phone" value="${esc(o.phone || '')}" ${locked ? 'disabled' : ''}></label>
            <label class="f">الولاية<select name="wilaya_code" ${locked ? 'disabled' : ''}>${wilayaOptions(o.wilaya_code)}</select></label>
            <label class="f">البلدية<input name="commune" value="${esc(o.commune || '')}" ${locked ? 'disabled' : ''}></label>
            <label class="f">طريقة التوصيل<select name="delivery_method" ${locked ? 'disabled' : ''}><option value="">—</option><option value="home" ${o.delivery_method === 'home' ? 'selected' : ''}>للدار</option><option value="desk" ${o.delivery_method === 'desk' ? 'selected' : ''}>للمكتب</option></select></label>
            <label class="f">مكتب الاستلام<select name="stopdesk_id" ${locked ? 'disabled' : ''} id="desks"><option value="">—</option></select></label>
            <label class="f" style="grid-column:1/-1">العنوان<input name="address" value="${esc(o.address || '')}" ${locked ? 'disabled' : ''}></label>
            <label class="f" style="grid-column:1/-1">ملاحظات<input name="notes" value="${esc(o.notes || '')}"></label>
          </form>
          <dl class="kv" style="margin-top:10px"><dt>واتساب</dt><dd class="mono">${esc(o.wa_phone || '—')}</dd><dt>التأكيد</dt><dd>${o.confirmed_via ? esc({ whatsapp_chat: 'موافقة في المحادثة', whatsapp_button: 'زر واتساب', staff: 'الموظف' }[o.confirmed_via] || o.confirmed_via) + ' · ' + fmtDate(o.confirmed_at) : '—'}${o.consent_text ? ` — «${esc(o.consent_text)}»` : ''}</dd></dl>
        </div>
        <div class="card"><div class="card-head"><h2>الشحن</h2></div>${d.shipments.length ? d.shipments.map((s) => shipmentBlock(s)).join('') : '<div class="muted">ما تبعثش بعد</div>'}</div>
        ${d.returns.length ? `<div class="card"><h2>الروتور</h2>${d.returns.map((r) => `<div class="row" style="margin-top:8px">${retBadge(r.status)}<b>${r.type === 'rto' ? 'طرد راجع (ما تسلّمش)' : 'روتور من الزبون'}</b><span class="muted">${esc(r.reason || '')}</span>${r.pickup_tracking ? `<span class="mono small">${esc(r.pickup_tracking)}</span>` : ''}</div>`).join('')}</div>` : ''}
      </div>
      <div class="stack">
        ${d.calls ? orderCallsCard(d.calls, o.id) : ''}
        <div class="card"><h2 style="margin-bottom:12px">تاريخ الحالات</h2><ul class="timeline">${d.events.map((e) => `<li>${orderBadge(e.status)}<div class="small" style="margin-top:3px">${esc(e.note || '')}</div><div class="muted small">${fmtDate(e.created_at)} · ${esc(e.actor || '')}</div></li>`).join('')}</ul></div>
        <div class="card"><div class="card-head"><h2>المحادثة</h2>${d.conversation ? `<a href="#/inbox/${d.conversation.id}">فتح ←</a>` : ''}</div>
          ${d.conversation ? `<div class="stack" id="convbox" style="max-height:420px;overflow:auto;background:#efeae0;border-radius:10px;padding:10px">${d.conversation.messages.slice(-14).map(msgHtml).join('')}</div>` : '<div class="muted">ما كانش محادثة</div>'}</div>
      </div></div>`;

  if ($('#convbox')) $('#convbox').scrollTop = $('#convbox').scrollHeight;
  // مكاتب الاستلام
  const rates = await api('GET', '/api/rates');
  const fillDesks = () => {
    const w = Number($('[name=wilaya_code]').value);
    $('#desks').innerHTML = '<option value="">—</option>' + rates.stopdesks.filter((s) => s.wilaya_code === w).map((s) => `<option value="${s.id}" ${o.stopdesk_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  };
  fillDesks(); $('[name=wilaya_code]').onchange = fillDesks;
  const reload = () => orderPage(main, id);
  $('#save') && ($('#save').onclick = () => act(() => api('PUT', `/api/orders/${id}`, Object.fromEntries(new FormData($('#df')))), 'تم الحفظ').then(reload));
  $('#confirm') && ($('#confirm').onclick = () => act(() => api('POST', `/api/orders/${id}/confirm`), 'تم التأكيد').then(reload));
  $('#sendconf') && ($('#sendconf').onclick = () => act(() => api('POST', `/api/orders/${id}/send-confirmation`), 'تبعث طلب التأكيد').then(reload));
  $('#cancel') && ($('#cancel').onclick = () => confirm('تلغي الطلب؟') && act(() => api('POST', `/api/orders/${id}/cancel`, {}), 'تلغى').then(reload));
  $('#dispatch') && ($('#dispatch').onclick = async () => {
    $('#dispatch').disabled = true;
    const r = await act(() => api('POST', `/api/orders/${id}/${o.status === 'confirmed' ? 'dispatch' : 'retry'}`, { carrier_account_id: $('#carrier').value }));
    toast(r.ok ? `تبعث ✅ ${r.shipment?.tracking || ''}` : (r.errors || [r.error]).join(' · '), r.ok ? 'ok' : 'err');
    reload();
  });
  bindShipmentActions(main, reload);
  $$('[data-callact]', main).forEach((b) => b.onclick = async () => {
    b.disabled = true;
    const labels = { 'call-now': 'بدات المكالمة — شوف محاكي المكالمات إذا الوضع تجريبي', 'stop-calls': 'توقفت المحاولات', handoff: 'تحوّل الطلب ليك' };
    await act(() => api('POST', `/api/orders/${id}/${b.dataset.callact}`), labels[b.dataset.callact]).finally(() => { b.disabled = false; });
    reload();
  });
}

export function shipmentBlock(s) {
  const sim = s.carrier_label && state.meta.carrierAccounts.find((a) => a.id === s.carrier_account_id);
  return `<div class="acc" style="margin-bottom:10px"><div class="row between"><div class="row"><b>${esc(carrierName(s.carrier_code))}</b>${s.kind === 'return_pickup' ? '<span class="badge plain b-amber">جمع روتور</span>' : ''}
      <span class="badge plain ${s.state === 'created' ? 'b-green' : s.state === 'unknown' ? 'b-red' : s.state === 'failed' ? 'b-red' : 'b-gray'}">${{ created: 'مقبولة', creating: 'قيد الإنشاء', failed: 'فشلت', unknown: 'غير واضحة' }[s.state]}</span>${shipBadge(s.status)}</div>
      <div class="row"><span class="mono">${esc(s.tracking || s.dispatch_ref)}</span>${s.state === 'created' ? `<button class="btn sm" data-refresh="${s.id}">${icon('refresh')}</button>` : ''}</div></div>
    ${s.last_error ? `<div class="small" style="color:var(--danger)">${esc(s.last_error)}</div>` : ''}${s.failure_reason ? `<div class="small">السبب: ${esc(s.failure_reason)}</div>` : ''}
    ${s.events?.length ? `<div class="small muted">${s.events.slice(-6).map((e) => `${fmtDate(e.occurred_at || e.created_at)} — ${esc(e.external_status)}${e.applied ? '' : ' (متجاهَل)'}${e.note ? ' · ' + esc(e.note) : ''}`).join('<br>')}</div>` : ''}
    ${s.state === 'created' && s.kind === 'outbound' ? `<div class="row small"><span class="muted">محاكاة حالة الشركة (حسابات تجريبي):</span><select data-simsel="${s.id}">${Object.entries(state.meta.shipStatus).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select><button class="btn sm" data-sim="${s.id}">طبّق</button></div>` : ''}
  </div>`;
}
export function bindShipmentActions(root, reload) {
  $$('[data-refresh]', root).forEach((b) => b.onclick = async () => { const r = await act(() => api('POST', `/api/shipments/${b.dataset.refresh}/refresh`)); toast(r.ok ? `تحديث: ${r.applied || 0} حالة جديدة` : r.error, r.ok ? 'ok' : 'err'); reload(); });
  $$('[data-sim]', root).forEach((b) => b.onclick = async () => {
    const status = $(`[data-simsel="${b.dataset.sim}"]`, root).value;
    const note = ['delivery_failed', 'returning'].includes(status) ? prompt('السبب (اختياري)', status === 'returning' ? 'رفض الاستلام' : 'الزبون ما ردّش') : null;
    const r = await act(() => api('POST', `/api/shipments/${b.dataset.sim}/simulate`, { status, note }));
    toast(r.applied ? 'تطبّقت الحالة' : `متجاهَلة: ${r.reason}`, r.applied ? 'ok' : 'err');
    reload();
  });
}

export function msgHtml(m) {
  const who = m.direction === 'in' ? 'الزبون' : m.author === 'ai' ? 'المساعد 🤖' : m.author === 'agent' ? `موظف: ${m.agent_name || ''}` : 'رسالة تلقائية';
  const st = m.status === 'simulated' ? 'محاكاة' : m.status === 'failed' ? '⚠️ فشل' : m.status || '';
  return `<div class="msg ${m.direction} ${m.author}"><div class="who">${esc(who)}${m.template_name ? ` · قالب ${esc(m.template_name)}` : ''}</div><div class="body">${esc(m.body)}</div>
    ${m.buttons ? `<div class="btns">${m.buttons.map((b) => `<button type="button" data-btn="${esc(b.id)}" data-title="${esc(b.title)}">${esc(b.title)}</button>`).join('')}</div>` : ''}
    <div class="meta"><span>${fmtDate(m.created_at)}</span><span>${esc(st)}${m.error ? ' ' + esc(m.error) : ''}</span></div></div>`;
}

boot();
