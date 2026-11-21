import { state, esc, $, $$, api, act, toast, modal, dzd, fmtDate, orderBadge, shipBadge, retBadge, carrierName, wilayaName, wilayaOptions, options, icon } from './core.js';
import { msgHtml, setCleanup, bindRows, shipmentBlock, bindShipmentActions } from './app.js';

// ───────────── صندوق واتساب ─────────────
export async function inboxPage(main, id) {
  let filter = 'all', q = '', current = id ? Number(id) : null;
  main.innerHTML = `<div class="page-head"><div><h1>صندوق واتساب</h1><div class="muted small">ردود المساعد، تحويل المحادثة للموظف، والرد اليدوي</div></div></div>
    <div class="inbox"><div class="list"><div class="filters"><input id="iq" placeholder="🔎 رقم أو اسم">
      <div class="chips">${[['all', 'الكل'], ['human', 'عند الموظف'], ['unread', 'غير مقروءة']].map(([k, l]) => `<button class="chip" data-f="${k}">${l}</button>`).join('')}</div></div><div id="convs"></div></div>
    <div class="thread" id="thread"><div class="empty">اختار محادثة</div></div><div class="side-info" id="sinfo"></div></div>`;
  const loadList = async () => {
    const d = await api('GET', `/api/conversations?filter=${filter}&q=${encodeURIComponent(q)}`);
    $('#convs').innerHTML = d.conversations.map((c) => `<div class="conv ${c.id === current ? 'active' : ''}" data-id="${c.id}">
      <div class="row between"><b>${esc(c.customer_name || '+' + c.wa_phone)}</b>${c.unread ? `<span class="badge plain b-green">${c.unread}</span>` : ''}</div>
      <div class="row between small"><span class="mono muted">+${esc(c.wa_phone)}</span>${c.mode === 'human' ? `<span class="badge b-amber">موظف${c.assigned_name ? ': ' + esc(c.assigned_name) : ''}</span>` : '<span class="badge b-green">المساعد</span>'}</div>
      <div class="last">${c.last_author === 'customer' ? '' : '↩ '}${esc(c.last_body || '')}</div></div>`).join('') || '<div class="empty">ما كانش محادثات</div>';
    $$('.conv').forEach((el) => el.onclick = () => { current = Number(el.dataset.id); history.replaceState(null, '', `#/inbox/${current}`); loadThread(true); loadList(); });
  };
  let lastCount = 0;
  const loadThread = async (scroll) => {
    if (!current) return;
    const d = await api('GET', `/api/conversations/${current}`);
    const c = d.conversation;
    const t = $('#thread');
    const draftFocus = document.activeElement?.id === 'reply';
    const draft = $('#reply')?.value || '';
    t.innerHTML = `<div class="head"><b>${esc(d.customer?.name || '+' + c.wa_phone)}</b><span class="mono muted small">+${esc(c.wa_phone)}</span>
        ${c.mode === 'human' ? `<span class="badge b-amber">الذكاء الاصطناعي متوقف</span>${c.handoff_reason ? `<span class="small muted">${esc(c.handoff_reason)}</span>` : ''}` : '<span class="badge b-green">المساعد يجاوب</span>'}
        <div class="grow"></div>${c.mode === 'human' ? '<button class="btn sm primary" id="release">رجّعها للمساعد</button>' : '<button class="btn sm" id="takeover">استلم المحادثة</button>'}</div>
      <div class="msgs" id="msgs">${d.messages.map(msgHtml).join('')}</div>
      <form class="composer" id="cf"><textarea id="reply" placeholder="${c.mode === 'human' ? 'اكتب ردّك...' : 'إذا رديت، المحادثة تتحوّل ليك والمساعد يتوقف'}"></textarea><button class="btn primary">إرسال</button></form>`;
    $('#reply').value = draft; if (draftFocus) $('#reply').focus();
    const box = $('#msgs');
    if (scroll || d.messages.length !== lastCount) box.scrollTop = box.scrollHeight;
    lastCount = d.messages.length;
    $('#takeover') && ($('#takeover').onclick = () => act(() => api('POST', `/api/conversations/${current}/takeover`), 'استلمت المحادثة').then(() => { loadThread(); loadList(); }));
    $('#release') && ($('#release').onclick = () => act(() => api('POST', `/api/conversations/${current}/release`), 'المساعد رجع يجاوب').then(() => { loadThread(); loadList(); }));
    $('#cf').onsubmit = async (e) => { e.preventDefault(); const text = $('#reply').value.trim(); if (!text) return; $('#reply').value = ''; await act(() => api('POST', `/api/conversations/${current}/reply`, { text })); loadThread(true); loadList(); };
    $('#reply').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#cf').requestSubmit(); } };
    const dr = d.draft;
    $('#sinfo').innerHTML = `<div><h3>الزبون</h3><dl class="kv small" style="margin-top:6px"><dt>الاسم</dt><dd>${esc(d.customer?.name || '—')}</dd><dt>الهاتف</dt><dd class="mono">${esc(d.customer?.phone || '—')}</dd><dt>اللغة</dt><dd>${{ ar: 'دارجة (عربي)', latn: 'دارجة (لاتيني)', fr: 'فرنسية' }[c.lang] || '—'}</dd></dl></div>
      <div><h3>الكوموند قيد التحضير</h3>${dr.items.length || dr.wilaya ? `<dl class="kv small" style="margin-top:6px">
        <dt>المنتجات</dt><dd>${dr.items.map((i) => `${esc(i.name)} ×${i.qty}`).join('، ') || '—'}</dd><dt>الولاية</dt><dd>${esc(dr.wilaya || '—')}</dd><dt>التوصيل</dt><dd>${dr.delivery_method === 'desk' ? 'للمكتب' : dr.delivery_method === 'home' ? 'للدار' : '—'}</dd>
        <dt>المجموع</dt><dd>${dzd(dr.total)}</dd><dt>الملخّص</dt><dd>${dr.summary ? '✅ تبعث' : '—'}</dd><dt>الموافقة</dt><dd>${dr.consent ? '✅ وافق' : '—'}</dd>
        <dt>ناقص</dt><dd>${dr.missing.length ? dr.missing.map((x) => ({ product: 'المنتج', wilaya: 'الولاية', delivery_method: 'طريقة التوصيل', commune: 'البلدية', address: 'العنوان', stopdesk: 'المكتب', customer_name: 'الاسم', phone: 'الهاتف' }[x])).join('، ') : 'لا شيء'}</dd></dl>` : '<div class="muted small">—</div>'}</div>
      <div><h3>طلباتو</h3>${d.orders.map((o) => `<a class="row between small" style="padding:5px 0;color:inherit" href="#/orders/${o.id}"><b>${esc(o.number)}</b>${orderBadge(o.status)}</a>`).join('') || '<div class="muted small">—</div>'}</div>`;
  };
  $$('.chip[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; loadList(); });
  let tq; $('#iq').oninput = (e) => { clearTimeout(tq); tq = setTimeout(() => { q = e.target.value; loadList(); }, 250); };
  await loadList();
  if (current) await loadThread(true);
  const timer = setInterval(() => { loadList(); if (current && !document.querySelector('.modal-bg')) loadThread(false); }, 4000);
  setCleanup(() => clearInterval(timer));
}

// ───────────── الشحن والروتور ─────────────
export async function shippingPage(main) {
  let tab = sessionStorage.getItem('ship-tab') || 'attention';
  main.innerHTML = `<div class="page-head"><div><h1>الشحن والروتور</h1><div class="muted small">التتبع، أسباب الفشل والرجوع، والحالات اللي تحتاج تدخل</div></div></div>
    <div class="tabs">${[['attention', 'تحتاج تدخل'], ['active', 'في الطريق'], ['all', 'كل الشحنات'], ['returns', 'الروتور']].map(([k, l]) => `<button data-t="${k}">${l}</button>`).join('')}</div><div id="sbody"></div>`;
  const render = async () => {
    try { sessionStorage.setItem('ship-tab', tab); } catch {}
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.t === tab));
    const body = $('#sbody');
    if (tab === 'returns') return renderReturns(body, render);
    const d = await api('GET', `/api/shipments?filter=${tab}`);
    body.innerHTML = `${d.pending?.length ? `<div class="card" style="margin-bottom:12px"><h2>طلبات ما تبعثتش (ناقصة / مرفوضة)</h2><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>الرقم</th><th>الزبون</th><th>الحالة</th><th>السبب</th></tr></thead><tbody>
      ${d.pending.map((o) => `<tr class="click" data-href="#/orders/${o.id}"><td><b>${esc(o.number)}</b></td><td>${esc(o.customer_name || '—')}</td><td>${orderBadge(o.status)}</td><td class="small">${esc(o.last_error || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      ${d.shipments.length ? `<div class="table-wrap"><table><thead><tr><th>الطلب</th><th>الزبون</th><th>الولاية</th><th>الشركة</th><th>التتبع</th><th>حالة الشحنة</th><th>السبب / آخر ملاحظة</th><th>الطلب</th><th></th></tr></thead><tbody>
      ${d.shipments.map((s) => `<tr><td><a href="#/orders/${s.order_id}"><b>${esc(s.number)}</b></a>${s.kind === 'return_pickup' ? ' <span class="badge plain b-amber">جمع روتور</span>' : ''}</td><td>${esc(s.customer_name || '')}<div class="mono small muted">${esc(s.phone || '')}</div></td>
        <td>${esc(wilayaName(s.wilaya_code))}</td><td>${esc(carrierName(s.carrier_code))}${s.carrier_mode === 'simulation' ? ' <span class="badge plain b-violet">تجريبي</span>' : ''}</td>
        <td class="mono small">${esc(s.tracking || s.dispatch_ref)}</td><td>${s.state === 'created' ? shipBadge(s.status) : `<span class="badge b-red">${{ failed: 'فشل الإرسال', unknown: 'نتيجة غير واضحة', creating: 'قيد الإنشاء' }[s.state]}</span>`}${s.attempt_no > 1 ? `<div class="small muted">محاولة ${s.attempt_no}</div>` : ''}</td>
        <td class="small">${esc(s.failure_reason || s.last_error || s.last_note || '')}</td><td>${orderBadge(s.order_status)}</td>
        <td><div class="row">${s.state === 'created' ? `<button class="btn sm" data-refresh="${s.id}" title="تحديث من الشركة">${icon('refresh')}</button>` : `<a class="btn sm" href="#/orders/${s.order_id}">عاود</a>`}
          ${s.state === 'created' && s.carrier_mode === 'simulation' && s.kind === 'outbound' ? `<select data-simsel="${s.id}">${Object.entries(state.meta.shipStatus).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select><button class="btn sm" data-sim="${s.id}">محاكاة</button>` : ''}</div></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="card empty">ما كانش شحنات هنا 👌</div>'}`;
    bindRows(body);
    bindShipmentActions(body, render);
  };
  $$('.tabs button').forEach((b) => b.onclick = () => { tab = b.dataset.t; render(); });
  await render();
}

async function renderReturns(body, rerender) {
  const d = await api('GET', '/api/returns');
  const reasons = state.meta.reasons;
  body.innerHTML = `<div class="note" style="margin-bottom:12px"><b>طرد راجع:</b> ما تسلّمش ورجع (رفض / تعذّر التوصيل) — يتحدّث من شركة التوصيل حتى يرجع للمخزن. <b>روتور الزبون:</b> بعد الاستلام، عبر واتساب، يتطبّق عليه سياسة الروتور.</div>
    ${d.returns.length ? `<div class="table-wrap"><table><thead><tr><th>الطلب</th><th>النوع</th><th>الزبون</th><th>السبب</th><th>الحالة</th><th>تتبع الجمع</th><th>ملاحظة</th><th></th></tr></thead><tbody>
    ${d.returns.map((r) => `<tr><td><a href="#/orders/${r.order_id}"><b>${esc(r.number)}</b></a><div class="small muted">${dzd(r.total)}</div></td><td>${r.type === 'rto' ? '<span class="badge plain b-amber">طرد راجع</span>' : '<span class="badge plain b-blue">روتور زبون</span>'}</td>
      <td>${esc(r.customer_name || '')}<div class="mono small muted">${esc(r.phone || '')}</div></td><td class="small">${esc(r.reason || '')}${r.reason_code && r.reason_code !== 'rto' ? `<div class="muted">${esc(reasons[r.reason_code] || '')}</div>` : ''}</td>
      <td>${retBadge(r.status)}</td><td class="mono small">${esc(r.pickup_tracking || (r.type === 'rto' ? r.tracking : '') || '—')}</td><td class="small muted">${esc(r.decision_note || '')}</td>
      <td><div class="row">${r.status === 'needs_review' ? `<button class="btn sm primary" data-acc="${r.id}">قبول</button><button class="btn sm danger" data-rej="${r.id}">رفض</button>` : ''}
        ${['accepted', 'in_transit'].includes(r.status) ? `<button class="btn sm" data-recv="${r.id}">رجع للمخزن</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>` : '<div class="card empty">ما كانش روتور</div>'}`;
  $$('[data-acc]', body).forEach((b) => b.onclick = () => act(() => api('POST', `/api/returns/${b.dataset.acc}/decide`, { accept: true }), 'تقبل الروتور').then(rerender));
  $$('[data-rej]', body).forEach((b) => b.onclick = () => { const note = prompt('سبب الرفض (يتبعث للزبون)'); if (note != null) act(() => api('POST', `/api/returns/${b.dataset.rej}/decide`, { accept: false, note }), 'ترفض').then(rerender); });
  $$('[data-recv]', body).forEach((b) => b.onclick = () => act(() => api('POST', `/api/returns/${b.dataset.recv}/received`), 'رجع للمخزن والمخزون تحدّث').then(rerender));
}

// ───────────── محاكي واتساب ─────────────
export async function simulatorPage(main) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem('sim') || '{}'); } catch { return {}; } })();
  let phone = saved.phone || '0550123456';
  const { products } = await api('GET', '/api/products');
  const stores = (await api('GET', '/api/integrations/store')).accounts.filter((a) => a.enabled);
  main.innerHTML = `<div class="page-head"><div><h1>محاكي واتساب</h1><div class="muted small">جرّب كأنك زبون — الرسائل تمرّ بنفس مسار webhook واتساب الحقيقي</div></div></div>
    <div class="sim"><div class="phone"><div class="screen"><div class="bar-top"><div style="width:34px;height:34px;border-radius:50%;background:#1aa86d;display:grid;place-items:center;font-weight:700">Z</div><div class="grow"><b>Zinor Boutique</b><div class="small" style="opacity:.8">حساب تجاري</div></div></div>
      <div class="msgs" id="smsgs"></div>
      <form class="composer" id="sf"><textarea id="stext" placeholder="اكتب رسالة..."></textarea><button class="btn primary">↩</button></form></div></div>
    <div class="stack">
      <div class="card stack"><h2>الزبون</h2><div class="row"><label class="f grow">رقم واتساب الزبون<input id="sphone" value="${esc(phone)}"></label><button class="btn" id="snew">زبون جديد</button></div>
        <div><div class="muted small" style="margin-bottom:6px">رسائل جاهزة:</div><div class="chips">${['salam ch7al livraison l Blida', '3andkom parfum oud? ch7al', 'l dar, commune Boufarik, cité 200 logements bloc 3', 'ih dirli had la commande', 'Yacine Benali 0550123456', 'شحال التوصيل لوهران؟', 'نحب ساعة للمكتب', 'win rahi la commande?', 'nheb nrajja3 l produit, ja mksour', 'wach nta robot?', 'نحب نهدر مع واحد من الخدامين', 'Bonjour, combien la livraison à Sétif ?']
          .map((t) => `<button class="chip" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
        <div class="row"><a class="btn sm" id="openconv" href="#/inbox">افتح في صندوق واتساب ←</a></div></div>
      <div class="card stack"><h2>طلب تجريبي من متجر مربوط</h2><p class="muted small" style="margin:0">ينشئ webhook موقّع بصيغة المنصّة، والزبون (الرقم فوق) يوصلو ملخّص بأزرار التأكيد.</p>
        <div class="grid g2"><label class="f">المتجر<select id="sacc">${stores.map((a) => `<option value="${a.id}">${esc(a.label)} (${esc(a.code)})</option>`).join('')}</select></label>
          <label class="f">المنتج<select id="sprod">${products.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
          <label class="f">الولاية<select id="swil">${wilayaOptions(16)}</select></label><label class="f">البلدية<input id="scom" value="Bab Ezzouar"></label>
          <label class="f">العنوان<input id="sadr" value="حي 5 جويلية عمارة 12"></label><label class="f">الاسم<input id="sname" value="ليلى سعيدي"></label></div>
        <button class="btn gold" id="sorder">ابعث طلب تجريبي</button></div>
      <div class="note">💡 بعد ما تتبعث الكوموند، روح لـ<b>الشحن والروتور</b> وحاكي «خرجت مع الليفرور» باش تشوف التذكير التلقائي هنا.</div>
    </div></div>`;
  const render = async () => {
    const d = await api('GET', `/api/sim/whatsapp?phone=${encodeURIComponent(phone)}`);
    const box = $('#smsgs');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    // من جهة الزبون: رسائلو على اليسار بالأخضر، ورسائل المتجر على اليمين
    box.innerHTML = d.messages.map((m) => {
      const mine = m.direction === 'in';
      const who = mine ? 'أنت' : m.author === 'ai' ? 'Zinor · المساعد 🤖' : m.author === 'agent' ? 'Zinor · موظف' : 'Zinor · رسالة تلقائية';
      return `<div class="msg ${mine ? 'out' : 'in'}"><div class="who" style="color:${mine ? '#0b7a4c' : '#946500'}">${esc(who)}${m.template_name ? ' · قالب' : ''}</div><div class="body">${esc(m.body)}</div>
        ${!mine && m.buttons ? `<div class="btns">${m.buttons.map((b) => `<button type="button" data-btn="${esc(b.id)}" data-title="${esc(b.title)}">${esc(b.title)}</button>`).join('')}</div>` : ''}
        <div class="meta"><span>${fmtDate(m.created_at)}</span></div></div>`;
    }).join('') || '<div class="empty">ابدا المحادثة 👋</div>';
    if (atBottom) box.scrollTop = box.scrollHeight;
    $$('[data-btn]', box).forEach((b) => b.onclick = () => send({ button_id: b.dataset.btn, title: b.dataset.title }));
  };
  const send = async (payload) => {
    await act(() => api('POST', '/api/sim/whatsapp', { from: phone, ...payload }));
    await render();
    $('#smsgs').scrollTop = $('#smsgs').scrollHeight;
  };
  const savePhone = () => { phone = $('#sphone').value.trim(); try { localStorage.setItem('sim', JSON.stringify({ phone })); } catch {} render(); };
  $('#sphone').onchange = savePhone;
  $('#snew').onclick = () => { $('#sphone').value = '05' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'); savePhone(); };
  $('#sf').onsubmit = (e) => { e.preventDefault(); const text = $('#stext').value.trim(); if (!text) return; $('#stext').value = ''; send({ text }); };
  $('#stext').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#sf').requestSubmit(); } };
  $$('.chip[data-t]').forEach((c) => c.onclick = () => send({ text: c.dataset.t }));
  $('#sorder').onclick = async () => {
    const r = await act(() => api('POST', '/api/sim/store-order', { account_id: $('#sacc').value, product_id: $('#sprod').value, wilaya_code: $('#swil').value, commune: $('#scom').value, address: $('#sadr').value, customer_name: $('#sname').value, phone, external_id: String(Date.now()) }));
    toast(r.order ? `دخل الطلب ${r.order.number} — شوف واتساب` : 'تكرار — تجاهلناه');
    render();
  };
  await render();
  const timer = setInterval(render, 3000);
  setCleanup(() => clearInterval(timer));
}
