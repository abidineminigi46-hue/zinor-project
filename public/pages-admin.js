import { state, esc, $, $$, api, act, toast, modal, dzd, fmtDate, connBadge, docsBadge, carrierName, wilayaName, wilayaOptions, options, isAdmin, icon } from './core.js';
import { loadMeta } from './app.js';

// ───────────── المنتجات ─────────────
export async function productsPage(main) {
  const { products } = await api('GET', '/api/products');
  main.innerHTML = `<div class="page-head"><div><h1>المنتجات</h1><div class="muted small">الأسعار والمخزون اللي يستعملهم المساعد والتحقق قبل الشحن</div></div>${isAdmin() ? `<button class="btn primary" id="add">${icon('plus')} منتج جديد</button>` : ''}</div>
    <div class="table-wrap"><table><thead><tr><th>SKU</th><th>الاسم</th><th>بالفرنسية</th><th>كلمات البحث (دارجة/فرنسية)</th><th>السعر (دج)</th><th>المخزون</th><th>مفعّل</th><th></th></tr></thead><tbody>
    ${products.map((p) => `<tr data-id="${p.id}"><td class="mono small">${esc(p.sku)}</td><td><input data-k="name" value="${esc(p.name)}"></td><td><input data-k="name_fr" value="${esc(p.name_fr || '')}"></td>
      <td><input data-k="keywords" value="${esc(p.keywords)}" style="min-width:200px"></td><td><input data-k="price" type="number" value="${p.price}" style="width:100px"></td>
      <td><input data-k="stock" type="number" value="${p.stock}" style="width:80px">${p.stock <= 0 ? ' <span class="badge b-red">نفد</span>' : ''}</td>
      <td><label class="switch"><input type="checkbox" data-k="active" ${p.active ? 'checked' : ''}></label></td><td>${isAdmin() ? '<button class="btn sm" data-save>حفظ</button>' : ''}</td></tr>`).join('')}</tbody></table></div>`;
  if (!isAdmin()) $$('input', main).forEach((i) => i.disabled = true);
  $$('[data-save]').forEach((b) => b.onclick = () => {
    const tr = b.closest('tr'), body = {};
    $$('[data-k]', tr).forEach((i) => body[i.dataset.k] = i.type === 'checkbox' ? (i.checked ? 1 : 0) : i.type === 'number' ? Number(i.value) : i.value);
    act(() => api('PUT', `/api/products/${tr.dataset.id}`, body), 'تم الحفظ');
  });
  $('#add') && ($('#add').onclick = () => modal('منتج جديد', `<div class="grid g2"><label class="f">SKU<input name="sku" required></label><label class="f">الاسم<input name="name" required></label>
    <label class="f">بالفرنسية<input name="name_fr"></label><label class="f">السعر (دج)<input name="price" type="number" required></label><label class="f">المخزون<input name="stock" type="number" value="0"></label>
    <label class="f">كلمات البحث<input name="keywords" placeholder="parfum,عطر,ريحة"></label></div><label class="f">الوصف<textarea name="description"></textarea></label>`,
  { onSubmit: async (fd) => { await api('POST', '/api/products', fd); toast('تزاد المنتج'); productsPage(main); } }));
}

// ───────────── أسعار التوصيل ─────────────
export async function ratesPage(main) {
  const d = await api('GET', '/api/rates');
  main.innerHTML = `<div class="page-head"><div><h1>أسعار التوصيل</h1><div class="muted small">58 ولاية — للدار وللمكتب. المساعد يجاوب من هاذ الأسعار.</div></div><input id="rf" placeholder="🔎 ولاية"></div>
    <div class="grid g3"><div class="table-wrap" style="grid-column:span 2"><table><thead><tr><th>الولاية</th><th>للدار (دج)</th><th>المدة (سا)</th><th>للمكتب (دج)</th><th>المدة (سا)</th><th>متوفر</th><th></th></tr></thead><tbody>
    ${d.rates.map((r) => `<tr data-code="${r.wilaya_code}" data-name="${esc(r.wilaya.ar + ' ' + r.wilaya.fr)}"><td><b>${r.wilaya_code}</b> ${esc(r.wilaya.ar)} <span class="muted small">${esc(r.wilaya.fr)}</span></td>
      <td><input data-k="home_price" type="number" value="${r.home_price ?? ''}" style="width:90px"></td><td><input data-k="home_days" value="${esc(r.home_days)}" style="width:80px"></td>
      <td><input data-k="desk_price" type="number" value="${r.desk_price ?? ''}" style="width:90px"></td><td><input data-k="desk_days" value="${esc(r.desk_days)}" style="width:80px"></td>
      <td><label class="switch"><input type="checkbox" data-k="active" ${r.active ? 'checked' : ''}></label></td><td>${isAdmin() ? '<button class="btn sm" data-save>حفظ</button>' : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="card stack"><h2>مكاتب الاستلام (Stop desk)</h2>
      ${d.stopdesks.map((s) => `<div class="row between small" style="border-bottom:1px solid var(--line);padding-bottom:6px"><span><b>${esc(s.name)}</b> — ${esc(wilayaName(s.wilaya_code))} <span class="muted">${esc(carrierName(s.carrier_code))} · ${esc(s.external_id || '')}</span></span>${isAdmin() ? `<button class="btn sm danger" data-del="${s.id}">✕</button>` : ''}</div>`).join('')}
      ${isAdmin() ? `<form id="sdf" class="stack"><div class="grid g2"><label class="f">الولاية<select name="wilaya_code" required>${wilayaOptions()}</select></label><label class="f">الشركة<select name="carrier_code">${state.meta.carriers.map((c) => `<option value="${c.code}">${esc(c.name)}</option>`).join('')}</select></label></div>
        <div class="grid g2"><label class="f">الاسم<input name="name" required></label><label class="f">البلدية<input name="commune"></label></div><label class="f">معرّف المكتب عند الشركة<input name="external_id"></label><button class="btn">زيد مكتب</button></form>` : ''}</div></div>`;
  if (!isAdmin()) $$('tbody input', main).forEach((i) => i.disabled = true);
  $('#rf').oninput = (e) => $$('tr[data-code]').forEach((tr) => tr.hidden = !tr.dataset.name.toLowerCase().includes(e.target.value.toLowerCase()) && !tr.dataset.code.startsWith(e.target.value));
  $$('[data-save]').forEach((b) => b.onclick = () => {
    const tr = b.closest('tr'), body = {};
    $$('[data-k]', tr).forEach((i) => body[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value);
    act(() => api('PUT', `/api/rates/${tr.dataset.code}`, body), 'تم الحفظ');
  });
  $$('[data-del]').forEach((b) => b.onclick = () => act(() => api('DELETE', `/api/stopdesks/${b.dataset.del}`)).then(() => ratesPage(main)));
  $('#sdf') && ($('#sdf').onsubmit = (e) => { e.preventDefault(); act(() => api('POST', '/api/stopdesks', Object.fromEntries(new FormData(e.target))), 'تزاد').then(() => ratesPage(main)); });
}

// ───────────── المتاجر / شركات التوصيل ─────────────
const COLORS = { shopify: '#5e8e3e', ayor: '#e2572f', lightfunnels: '#4b5cf0', woocommerce: '#7f54b3', justsell: '#e8a020', youcan: '#e5357b', zr_express: '#d11f2a', yalidine: '#e30613' };
const CAPS = {
  carrier: { createShipment: 'إنشاء الشحنة', tracking: 'التتبع', webhook: 'Webhook', polling: 'تحقق دوري', outForDeliveryStatus: 'حالة «خرج للتوصيل»', returnPickup: 'جمع الروتور', stopDesks: 'Stop desk', eta: 'الوقت المقدّر' },
  store: { webhookOrders: 'استقبال الطلبات', statusSync: 'مزامنة الحالة', trackingSync: 'مزامنة التتبع' },
};
export async function integrationsPage(kind) {
  const main = $('#main');
  const d = await api('GET', `/api/integrations/${kind}?all=1`);
  const isCarrier = kind === 'carrier';
  const active = d.accounts.filter((a) => !a.deleted_at), removed = d.accounts.filter((a) => a.deleted_at);
  main.innerHTML = `<div class="page-head"><div><h1>${isCarrier ? 'شركات التوصيل' : 'المتاجر والربط'}</h1><div class="muted small">${isCarrier ? 'ربط الحسابات، اختبار الاتصال، الشركة الافتراضية وقواعد الاختيار' : 'اربط أكثر من متجر — الطلبات تدخل أوتوماتيكياً وتتأكد عبر واتساب'}</div></div>
    <button class="btn" id="howto">إضافة ${isCarrier ? 'شركة' : 'منصّة'} غير مدعومة؟</button></div>
    <div class="integ">${d.catalog.map((c) => {
      const accs = active.filter((a) => a.code === c.code);
      return `<div class="card"><div class="row between"><div class="plat"><div class="ic" style="background:${COLORS[c.code] || '#555'}">${esc(c.name[0])}</div><div><h2>${esc(c.name)}</h2>${docsBadge(c.docsStatus)}</div></div>
          ${isAdmin() ? `<button class="btn sm primary" data-add="${c.code}">${icon('plus')} زيد حساب</button>` : ''}</div>
        <div class="caps">${Object.entries(CAPS[kind]).map(([k, l]) => `<span class="cap ${c.capabilities[k] ? '' : 'no'}">${l}</span>`).join('')}</div>
        <details><summary class="small muted" style="cursor:pointer">واش مربوط بالضبط / واش ناقص</summary><div class="note" style="margin-top:6px">${esc(c.docsNote)}${c.docsUrl ? `<br><a href="${esc(c.docsUrl)}" target="_blank" rel="noopener">التوثيق ↗</a>` : ''}</div></details>
        ${accs.map((a) => accountBlock(kind, a, c)).join('') || '<div class="muted small">ما كانش حساب مربوط</div>'}</div>`;
    }).join('')}</div>
    ${isCarrier ? rulesBlock(d) : ''}
    ${removed.length ? `<div class="card" style="margin-top:14px"><h2>روابط منزوعة</h2><p class="muted small">المفاتيح تمسحت؛ الطلبات والشحنات القديمة باقية ظاهرة في السجل.</p>${removed.map((a) => `<div class="row small" style="margin-top:6px">${connBadge('removed')}<b>${esc(a.label)}</b><span class="muted">${esc(a.code)} · ${fmtDate(a.deleted_at)}</span></div>`).join('')}</div>` : ''}`;

  const reload = async () => { await loadMeta(); integrationsPage(kind); };
  $('#howto').onclick = () => modal('إضافة موصّل جديد (للمطوّر)', `<ol class="stack" style="padding-inline-start:18px;margin:0">
    <li>انسخ <span class="mono">server/connectors/${isCarrier ? 'carriers/yalidine.js' : 'stores/generic.js'}</span> لملف جديد واملا نفس الدوال (الواجهة الموحّدة).</li>
    <li>${isCarrier ? 'حدّد <span class="mono">statusMap</span>: كل حالة عند الشركة ← حالة موحّدة (created, in_transit, out_for_delivery, delivered, returning...).' : 'حدّد <span class="mono">parseOrder</span>: حقول المنصّة ← الطلب الموحّد، و<span class="mono">verifyWebhook</span>.'}</li>
    <li>سجّل الموصّل في <span class="mono">server/connectors/${isCarrier ? 'carriers' : 'stores'}/index.js</span> وعاود شغّل الخادم.</li>
    <li>يبان هنا أوتوماتيكياً وتقدر تزيد حساب. منطق الكوموندات ما يتبدّلش.</li></ol>
    <div class="note">التفاصيل الكاملة في <span class="mono">docs/CONNECTORS.md</span>.${isCarrier ? '' : ' منصّة بلا موصّل تقدر تبعث طلباتها دابا عبر Webhook عام بصيغة Zinor JSON (حساب Ayor/Justsell).'}</div>`);
  $$('[data-add]').forEach((b) => b.onclick = () => accountModal(kind, d.catalog.find((c) => c.code === b.dataset.add), null, reload));
  $$('[data-edit]').forEach((b) => b.onclick = () => { const a = active.find((x) => x.id === Number(b.dataset.edit)); accountModal(kind, d.catalog.find((c) => c.code === a.code), a, reload); });
  $$('[data-test]').forEach((b) => b.onclick = async () => { const r = await act(() => api('POST', `/api/integrations/${kind}/${b.dataset.test}/test`)); toast(r.message, r.ok ? 'ok' : 'err'); reload(); });
  $$('[data-toggle]').forEach((b) => b.onclick = () => act(() => api('POST', `/api/integrations/${kind}/${b.dataset.toggle}/${b.dataset.on === '1' ? 'disable' : 'enable'}`), b.dataset.on === '1' ? 'تعطّل' : 'تفعّل').then(reload));
  $$('[data-default]').forEach((b) => b.onclick = () => act(() => api('POST', `/api/integrations/carrier/${b.dataset.default}/default`), 'ولّات الافتراضية').then(reload));
  $$('[data-remove]').forEach((b) => b.onclick = () => confirm('تنحّي الربط؟ المفاتيح تتمسح والسجلّ القديم يبقى.') && act(() => api('DELETE', `/api/integrations/${kind}/${b.dataset.remove}`), 'تنحّى الربط').then(reload));
  $$('[data-copy]').forEach((b) => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); toast('تنسخ الرابط'); });
  $('#rulef') && ($('#rulef').onsubmit = (e) => { e.preventDefault(); act(() => api('POST', '/api/carrier-rules', Object.fromEntries(new FormData(e.target))), 'تزادت القاعدة').then(reload); });
  $$('[data-delrule]').forEach((b) => b.onclick = () => act(() => api('DELETE', `/api/carrier-rules/${b.dataset.delrule}`)).then(reload));
}

function accountBlock(kind, a, c) {
  return `<div class="acc"><div class="row between"><div class="row"><b>${esc(a.label)}</b>${connBadge(a.status)}${a.is_default ? '<span class="badge plain b-gold">★ الافتراضية</span>' : ''}</div><span class="small muted">${a.mode === 'live' ? 'حقيقي' : 'تجريبي'}</span></div>
    ${a.last_error ? `<div class="small" style="color:var(--danger)">${esc(a.last_error)}</div>` : ''}
    ${a.webhook_url ? `<div class="copy"><input readonly value="${esc(a.webhook_url)}"><button class="btn sm" data-copy="${esc(a.webhook_url)}">نسخ</button></div>${c.webhookHelp ? `<div class="small muted">${esc(c.webhookHelp)}</div>` : ''}` : ''}
    ${a.last_event_at ? `<div class="small muted">آخر حدث: ${fmtDate(a.last_event_at)}</div>` : ''}${a.last_test_at ? `<div class="small muted">آخر اختبار: ${fmtDate(a.last_test_at)}</div>` : ''}
    ${isAdmin() ? `<div class="row"><button class="btn sm" data-edit="${a.id}">تعديل</button><button class="btn sm" data-test="${a.id}">اختبار الاتصال</button>
      <button class="btn sm" data-toggle="${a.id}" data-on="${a.enabled ? 1 : 0}">${a.enabled ? 'تعطيل' : 'تفعيل'}</button>
      ${kind === 'carrier' && !a.is_default && a.enabled ? `<button class="btn sm" data-default="${a.id}">اجعلها الافتراضية</button>` : ''}<button class="btn sm danger" data-remove="${a.id}">نزع الربط</button></div>` : ''}</div>`;
}

function rulesBlock(d) {
  const accs = d.accounts.filter((a) => !a.deleted_at);
  return `<div class="card" style="margin-top:14px"><div class="card-head"><h2>قواعد اختيار الشركة</h2><span class="muted small">الترتيب: اختيار يدوي في الطلب ← أول قاعدة تطابق ← الشركة الافتراضية</span></div>
    <div class="table-wrap"><table><thead><tr><th>الأولوية</th><th>الولاية</th><th>طريقة التوصيل</th><th>الشركة</th><th></th></tr></thead><tbody>
    ${d.rules.map((r) => `<tr><td>${r.priority}</td><td>${r.wilaya_code ? esc(wilayaName(r.wilaya_code)) : 'كل الولايات'}</td><td>${{ home: 'للدار', desk: 'للمكتب' }[r.delivery_method] || 'الكل'}</td><td>${esc(accs.find((a) => a.id === r.carrier_account_id)?.label || '—')}</td><td>${isAdmin() ? `<button class="btn sm danger" data-delrule="${r.id}">✕</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">ما كانش قواعد — كل شي يروح للافتراضية</td></tr>'}
    </tbody></table></div>
    ${isAdmin() ? `<form id="rulef" class="row" style="margin-top:10px"><input name="priority" type="number" value="50" style="width:90px" title="الأولوية"><select name="wilaya_code">${wilayaOptions().replace('<option value="">—</option>', '<option value="">كل الولايات</option>')}</select>
      <select name="delivery_method"><option value="">الكل</option><option value="home">للدار</option><option value="desk">للمكتب</option></select>
      <select name="carrier_account_id" required>${accs.filter((a) => a.enabled).map((a) => `<option value="${a.id}">${esc(a.label)}</option>`).join('')}</select><button class="btn">زيد قاعدة</button></form>` : ''}</div>`;
}

function accountModal(kind, c, a, done) {
  const field = (f, val, group) => f.type === 'checkbox'
    ? `<label class="switch"><input type="checkbox" name="${group}.${f.key}" ${val !== false ? 'checked' : ''}> ${esc(f.label)}</label>`
    : f.type === 'json' ? `<label class="f">${esc(f.label)}<textarea name="${group}.${f.key}" class="mono" placeholder='{"phone":"billing.phone"}'>${val ? esc(JSON.stringify(val)) : ''}</textarea></label>`
      : `<label class="f">${esc(f.label)}${f.optional ? ' <span class="muted">(اختياري)</span>' : ''}<input name="${group}.${f.key}" ${f.secret ? 'type="password" autocomplete="new-password"' : ''} value="${esc(val ?? '')}" placeholder="${a && f.secret && val ? 'اتركه فارغ باش يبقى القديم' : ''}"></label>`;
  modal(`${a ? 'تعديل' : 'ربط حساب'} — ${c.name}`, `
    <label class="f">الاسم في اللوحة<input name="label" value="${esc(a?.label || c.name)}" required></label>
    <label class="f">الوضع<select name="mode"><option value="simulation" ${a?.mode !== 'live' ? 'selected' : ''}>تجريبي (محاكاة — بلا مفاتيح)</option><option value="live" ${a?.mode === 'live' ? 'selected' : ''}>حقيقي (API الشركة/المنصّة)</option></select></label>
    <div class="note">${esc(c.docsNote)}</div>
    <h3>المفاتيح <span class="muted small">(تتخزّن مشفّرة على الخادم وما ترجعش للواجهة)</span></h3>
    ${c.credentialFields.map((f) => field(f, a ? (f.secret ? '' : a.credentials[f.key]) : '', 'credentials')).join('')}
    ${c.settingsFields?.length ? '<h3>إعدادات</h3>' + c.settingsFields.map((f) => field(f, a?.settings?.[f.key], 'settings')).join('') : ''}`, {
    onSubmit: async (fd, bg) => {
      const body = { code: c.code, label: fd.label, mode: fd.mode, credentials: {}, settings: {} };
      for (const [k, v] of Object.entries(fd)) {
        const [g, key] = k.split('.');
        if (!key) continue;
        const def = (g === 'settings' ? c.settingsFields : c.credentialFields).find((x) => x.key === key);
        body[g][key] = def?.type === 'json' ? (v ? JSON.parse(v) : undefined) : def?.type === 'number' ? Number(v) || undefined : v;
      }
      for (const f of c.settingsFields || []) if (f.type === 'checkbox') body.settings[f.key] = !!$(`[name="settings.${f.key}"]`, bg)?.checked;
      if (a) await api('PUT', `/api/integrations/${kind}/${a.id}`, body); else await api('POST', `/api/integrations/${kind}`, body);
      toast('تم الحفظ'); done();
    },
  });
}

// ───────────── الإعدادات ─────────────
export async function settingsPage(main) {
  const { settings: s } = await api('GET', '/api/settings');
  const noOfd = state.meta.carriers.filter((c) => !c.capabilities.outForDeliveryStatus);
  const vars = { order_confirmation: '{name} {store} {items} {delivery} {wilaya} {commune} {total}', shipped: '{order} {carrier} {tracking} {total}', out_for_delivery: '{name} {order} {total} {eta}', delivered: '{order}', delivery_failed: '{name} {order} {reason}', returned: '{order}' };
  main.innerHTML = `<div class="page-head"><div><h1>الإعدادات</h1></div></div>
    <div class="grid g2">
      <form class="card stack" data-key="store"><h2>المتجر</h2><label class="f">اسم المتجر<input name="name" value="${esc(s.store.name)}"></label>
        <label class="f">ولاية الإرسال (المخزن)<select name="origin_wilaya">${wilayaOptions(s.store.origin_wilaya)}</select></label><button class="btn primary">حفظ</button></form>
      <form class="card stack" data-key="ai"><h2>الذكاء الاصطناعي</h2>
        <label class="switch"><input type="checkbox" name="enabled" ${s.ai.enabled ? 'checked' : ''}> الردود الآلية مفعّلة</label>
        <label class="f">المحرّك<select name="mode"><option value="auto" ${s.ai.mode === 'auto' ? 'selected' : ''}>تلقائي: Claude إذا كاين مفتاح، وإلا المحلي</option><option value="mock" ${s.ai.mode === 'mock' ? 'selected' : ''}>المحرّك المحلي دايماً (تجربة)</option></select></label>
        <div class="note">الحالي: <b>${state.meta.engine.ai === 'claude' ? 'Claude — ' + esc(state.meta.engine.model) : 'المحرّك المحلي'}</b>. ${state.meta.engine.aiKey ? '' : 'لتفعيل Claude حط ANTHROPIC_API_KEY في ملف .env.'}</div><button class="btn primary">حفظ</button></form>
      <form class="card stack" data-key="notifications"><h2>رسائل واتساب التلقائية</h2>
        ${[['shipped', 'تأكيد الطلب والشحن (مع رقم التتبع)'], ['out_for_delivery', 'تذكير: الطرد خرج مع الليفرور'], ['delivered', 'تم التسليم'], ['delivery_failed', 'فشل التوصيل'], ['returned', 'الروتور رجع للمخزن']]
          .map(([k, l]) => `<label class="switch"><input type="checkbox" name="${k}" ${s.notifications[k] ? 'checked' : ''}> ${l}</label>`).join('')}
        ${noOfd.length ? `<div class="alert warn">هاذ الشركات ما تبعثش حالة «خرج للتوصيل»، التذكير ما يخدمش معاها: ${noOfd.map((c) => esc(c.name)).join('، ')}</div>` : `<div class="note">كل الشركات المدعومة تبعث حالة «خرج للتوصيل» (Yalidine: «Sorti en livraison»، ZR: «En livraison»). التذكير يتبعث مرة وحدة لكل محاولة توصيل. الوقت المقدّر يتزاد غير إذا الشركة عطاتو.</div>`}
        <div class="note">خارج نافذة 24 ساعة من آخر رسالة للزبون، واتساب يفرض قالب معتمد (template) — النظام يبدّل أوتوماتيكياً. لازم تسجّل نفس القوالب في Meta Business بنفس الأسماء وترتيب المتغيّرات.</div><button class="btn primary">حفظ</button></form>
      <form class="card stack" data-key="returns"><h2>سياسة الروتور</h2>
        <label class="f">مدة الروتور (أيام بعد الاستلام)<input name="window_days" type="number" value="${s.returns.window_days}"></label>
        <div class="f">قبول تلقائي لهاذ الأسباب (الباقي يروح لقرار الموظف):</div>
        ${Object.entries(state.meta.reasons).map(([k, l]) => `<label class="switch"><input type="checkbox" name="auto_${k}" ${s.returns.auto_accept_reasons.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
        <label class="f">نص السياسة (يستعملو المساعد)<textarea name="note">${esc(s.returns.note)}</textarea></label><button class="btn primary">حفظ</button></form>
    </div>
    <div class="card" style="margin-top:14px"><div class="card-head"><h2>قوالب رسائل واتساب</h2><span class="muted small">المتغيّرات بين {} — اسم القالب لازم يطابق القالب المعتمد في Meta</span></div>
      <div class="grid g2">${Object.entries(s.templates).map(([k, t]) => `<form class="acc" data-tpl="${k}"><b>${esc(t.label)}</b>
        <label class="f">اسم القالب في Meta<input name="wa_template" class="mono" value="${esc(t.wa_template)}"></label>
        <label class="f">النص<textarea name="text" rows="5">${esc(t.text)}</textarea></label><div class="small muted">المتغيّرات: <span class="mono">${vars[k] || ''}</span></div>
        <div class="row"><button class="btn sm primary">حفظ القالب</button></div></form>`).join('')}</div></div>`;
  if (!isAdmin()) $$('input,select,textarea,button', main).forEach((i) => i.disabled = true);
  $$('form[data-key]').forEach((f) => f.onsubmit = (e) => {
    e.preventDefault();
    const key = f.dataset.key, fd = new FormData(f), cur = s[key];
    let body;
    if (key === 'notifications') body = Object.fromEntries(Object.keys(cur).map((k) => [k, fd.has(k)]));
    else if (key === 'ai') body = { ...cur, enabled: fd.has('enabled'), mode: fd.get('mode') };
    else if (key === 'returns') body = { ...cur, window_days: Number(fd.get('window_days')), note: fd.get('note'), auto_accept_reasons: Object.keys(state.meta.reasons).filter((r) => fd.has('auto_' + r)), review_reasons: Object.keys(state.meta.reasons).filter((r) => !fd.has('auto_' + r)) };
    else body = { ...cur, name: fd.get('name'), origin_wilaya: Number(fd.get('origin_wilaya')) };
    act(() => api('PUT', `/api/settings/${key}`, body), 'تم الحفظ').then(async () => { await loadMeta(); });
  });
  $$('form[data-tpl]').forEach((f) => f.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const templates = structuredClone(s.templates);
    templates[f.dataset.tpl] = { ...templates[f.dataset.tpl], wa_template: fd.get('wa_template'), text: fd.get('text') };
    act(() => api('PUT', '/api/settings/templates', templates), 'تحفظ القالب').then((r) => { s.templates = r.value; });
  });
}

// ───────────── المستخدمين ─────────────
export async function usersPage(main) {
  const { users } = await api('GET', '/api/users');
  main.innerHTML = `<div class="page-head"><div><h1>المستخدمين والصلاحيات</h1><div class="muted small">المشرف: كل شي · الموظف: الطلبات، واتساب، الشحن والروتور (بلا الربط والإعدادات)</div></div><button class="btn primary" id="add">${icon('plus')} مستخدم</button></div>
    <div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الإيميل</th><th>الدور</th><th>الحالة</th><th></th></tr></thead><tbody>
    ${users.map((u) => `<tr><td>${esc(u.name)}</td><td class="mono">${esc(u.email)}</td><td>${u.role === 'admin' ? '<span class="badge b-gold">مشرف</span>' : '<span class="badge b-blue">موظف</span>'}</td><td>${u.active ? '<span class="badge b-green">نشط</span>' : '<span class="badge b-gray">موقّف</span>'}</td>
      <td><div class="row">${u.id !== state.user.id ? `<button class="btn sm" data-tog="${u.id}" data-a="${u.active}">${u.active ? 'توقيف' : 'تفعيل'}</button><button class="btn sm" data-role="${u.id}" data-r="${u.role}">${u.role === 'admin' ? 'اجعلو موظف' : 'اجعلو مشرف'}</button>` : ''}<button class="btn sm" data-pw="${u.id}">كلمة سر</button></div></td></tr>`).join('')}</tbody></table></div>`;
  const re = () => usersPage(main);
  $('#add').onclick = () => modal('مستخدم جديد', `<label class="f">الاسم<input name="name" required></label><label class="f">الإيميل<input name="email" type="email" required></label><label class="f">كلمة السر (8+)<input name="password" type="password" minlength="8" required></label><label class="f">الدور<select name="role"><option value="agent">موظف</option><option value="admin">مشرف</option></select></label>`, { onSubmit: async (fd) => { await api('POST', '/api/users', fd); toast('تزاد'); re(); } });
  $$('[data-tog]').forEach((b) => b.onclick = () => act(() => api('PUT', `/api/users/${b.dataset.tog}`, { active: b.dataset.a !== '1' })).then(re));
  $$('[data-role]').forEach((b) => b.onclick = () => act(() => api('PUT', `/api/users/${b.dataset.role}`, { role: b.dataset.r === 'admin' ? 'agent' : 'admin' })).then(re));
  $$('[data-pw]').forEach((b) => b.onclick = () => modal('تبديل كلمة السر', '<label class="f">كلمة السر الجديدة<input name="password" type="password" minlength="8" required></label>', { onSubmit: async (fd) => { await api('PUT', `/api/users/${b.dataset.pw}`, fd); toast('تبدّلت'); } }));
}

// ───────────── سجلّ الإجراءات والأخطاء ─────────────
export async function auditPage(main) {
  let level = '';
  main.innerHTML = `<div class="page-head"><div><h1>سجلّ الإجراءات والأخطاء</h1><div class="muted small">واش صرا، شكون دارو، وواش يلزم نعاودو</div></div><select id="lv"><option value="">الكل</option><option value="error">الأخطاء برك</option><option value="info">الإجراءات</option></select></div><div id="al"></div>`;
  const load = async () => {
    const { entries } = await api('GET', `/api/audit?level=${level}`);
    $('#al').innerHTML = `<div class="table-wrap"><table><thead><tr><th>الوقت</th><th>المستوى</th><th>الإجراء</th><th>شكون</th><th>العنصر</th><th>التفاصيل</th></tr></thead><tbody>
      ${entries.map((e) => `<tr><td class="small muted">${fmtDate(e.created_at)}</td><td>${e.level === 'error' ? `<span class="badge b-red">خطأ</span>${e.retryable ? ' <span class="badge plain b-amber">قابل لإعادة المحاولة</span>' : ''}` : '<span class="badge b-gray">إجراء</span>'}</td>
        <td class="mono small">${esc(e.action)}</td><td>${esc(e.actor || '')}</td><td>${e.entity === 'orders' && e.entity_id ? `<a href="#/orders/${e.entity_id}">طلب #${e.entity_id}</a>` : esc((e.entity || '') + (e.entity_id ? ' #' + e.entity_id : ''))}</td>
        <td class="small mono" style="max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.details || '')}">${esc(e.details || '')}</td></tr>`).join('')}</tbody></table></div>`;
  };
  $('#lv').onchange = (e) => { level = e.target.value; load(); };
  await load();
}
