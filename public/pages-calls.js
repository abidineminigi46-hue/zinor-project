import { state, esc, $, $$, api, act, toast, modal, fmtDate, orderBadge, isAdmin, icon } from './core.js';
import { setCleanup } from './app.js';
import { mountVoicePicker, mountRecorder, playActions, stopPlayback, voiceDiagnosis, spyboxSample, metricLine, latencyVerdict, fmtMs } from './voice.js';

const MODE_SHORT = { whatsapp: 'واتساب فقط', call: 'مكالمة فقط', whatsapp_call: 'واتساب + مكالمة', manual: 'يدوي' };
const OUTCOME = {
  confirmed: ['green', 'أكّد'], cancelled: ['gray', 'ألغى'], callback: ['blue', 'عيّطلي من بعد'], do_not_call: ['red', 'ما تعاودوش تعيطو'], think: ['amber', 'يخمّم'],
  unclear: ['amber', 'كلام غير واضح'], review: ['amber', 'للمراجعة'], human: ['violet', 'طلب موظف'], hangup: ['red', 'انقطعت'], no_answer: ['gray', 'ما ردّش'],
  busy: ['gray', 'مشغول'], voicemail: ['gray', 'بريد صوتي'], failed: ['red', 'فشل الاتصال'], info: ['blue', 'استفسار'], cancel_requested: ['violet', 'طلب إلغاء (مبعوثة)'],
  address_change_requested: ['violet', 'طلب تبديل عنوان'], unverified: ['red', 'ما تحققناش'], no_order: ['gray', 'بلا كوموند'], inbound_off: ['gray', 'الواردة مطفية'], test_ok: ['green', 'تجربة ناجحة'],
};
export const outcomeBadge = (o, status) => { const k = o || status; const v = OUTCOME[k]; return v ? `<span class="badge b-${v[0]}">${v[1]}</span>` : `<span class="badge b-gray">${esc(k || '—')}</span>`; };

// ───────────── صفحة «واتساب والمكالمات» ─────────────
export async function callsSettingsPage(main) {
  const cfg = await api('GET', '/api/calls/config');
  const s = structuredClone(cfg.settings);
  const ai = cfg.ai;
  const ro = !isAdmin();
  const voices = cfg.voices.voices;
  const voiceOpts = (sel) => ['female', 'male', 'unknown'].map((g) => {
    const vs = voices.filter((v) => (v.gender || 'unknown') === g);
    return vs.length ? `<optgroup label="${{ female: 'صوت امرأة', male: 'صوت رجل', unknown: 'أصوات أخرى' }[g]}">${vs.map((v) => `<option value="${esc(v.id)}" ${v.id === sel ? 'selected' : ''} ${v.disabled && v.id !== sel ? 'disabled' : ''}>${esc(v.label)}${v.disabled ? ' (يحتاج SPYBOX_API_KEY)' : ''}</option>`).join('')}</optgroup>` : '';
  }).join('');
  const mediaOpts = (sel) => `<option value="">بلا مقدّمة مسجّلة</option>` + cfg.media.map((m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const modeChips = (key, val) => `<div class="seg" data-mode="${key}">${Object.entries(MODE_SHORT).map(([k, l]) => `<button type="button" class="${k === val ? 'on' : ''}" data-v="${k}" ${ro ? 'disabled' : ''}>${l}</button>`).join('')}</div>`;

  main.innerHTML = `<div class="page-head"><div><h1>واتساب والمكالمات</h1><div class="muted small">طريقة التأكيد لكل مصدر، الفترات، الأصوات والتسجيلات</div></div>
      <a class="btn" href="#/call-sim">${icon('phone')} محاكي المكالمات</a></div>
    <form id="cf" class="stack calls-form">
    <section class="card stack">
      <div class="row between"><h2>المكالمات الحقيقية</h2>${s.real_calls_enabled ? '<span class="badge b-green">مفعّلة</span>' : '<span class="badge b-violet">مطفية — محاكاة برك</span>'}</div>
      <label class="switch"><input type="checkbox" name="real_calls_enabled" ${s.real_calls_enabled ? 'checked' : ''} ${ro ? 'disabled' : ''}> تفعيل المكالمات الحقيقية (تتخلّص عند خدمة الهاتف)</label>
      <label class="switch"><input type="checkbox" name="test_only_owner" ${s.test_only_owner ? 'checked' : ''} ${ro ? 'disabled' : ''}> وضع أول تجربة: الاتصال الحقيقي غير لرقمي، والباقي يبقى محاكاة</label>
      <div class="row"><label class="f grow">رقمي (للتجربة الأولى)<input name="owner_phone" inputmode="tel" value="${esc(s.owner_phone)}" placeholder="05XXXXXXXX" ${ro ? 'disabled' : ''}></label>
        ${ro ? '' : '<button type="button" class="btn" id="testcall">اتصل برقمي للتجربة</button>'}</div>
      <div class="note">ربط n8n / خدمة الهاتف: ${cfg.bridge.ready ? '<b style="color:var(--brand-2)">جاهز</b>' : `<b style="color:var(--danger)">ناقص</b> — ${[!cfg.bridge.startUrl && 'N8N_CALL_START_URL', !cfg.bridge.turnUrl && 'N8N_CALL_TURN_URL', !cfg.bridge.secret && 'CALLS_WEBHOOK_SECRET'].filter(Boolean).join('، ')} في ملف .env`}
        · لغة التعرّف على الكلام: <span class="mono">${esc(cfg.bridge.speechLanguage)}</span>
        <div class="copy" style="margin-top:6px"><input readonly value="${esc(cfg.webhooks.turn)}"><button type="button" class="btn sm" data-copy="${esc(cfg.webhooks.turn)}">نسخ</button></div>
        <div class="copy" style="margin-top:6px"><input readonly value="${esc(cfg.webhooks.events)}"><button type="button" class="btn sm" data-copy="${esc(cfg.webhooks.events)}">نسخ</button></div></div>
    </section>

    <section class="card stack"><h2>الردود والمكالمات</h2>
      <label class="switch"><input type="checkbox" name="wa_replies" ${ai.enabled ? 'checked' : ''} ${ro ? 'disabled' : ''}> الردود الآلية على رسائل واتساب الواردة</label>
      <label class="switch"><input type="checkbox" name="outbound_enabled" ${s.outbound_enabled ? 'checked' : ''} ${ro ? 'disabled' : ''}> المكالمات الصادرة (نعيطو للزبون)</label>
      <label class="switch"><input type="checkbox" name="inbound_enabled" ${s.inbound_enabled ? 'checked' : ''} ${ro ? 'disabled' : ''}> المكالمات الواردة (الزبون يرجع يعيّط)</label>
    </section>

    <section class="card stack"><h2>طريقة التأكيد لكل مصدر</h2>
      ${Object.entries(cfg.channels).map(([k, l]) => `<div class="stack" style="gap:6px"><b class="small">${esc(l)}</b>${modeChips(k, s.modes[k] || 'whatsapp')}</div>`).join('')}
      <div class="note">كي يدخل طلب من إعلان Meta (Click-to-WhatsApp)، واتساب يبعث معرّف الإعلان (referral) ونستعملوه هنا. إذا المصدر ما بانش، نطبّقو «الافتراضي».</div>
      <div class="stack" style="gap:6px"><b class="small">حملات بإعداد خاص (حسب معرّف الإعلان)</b>
        <div id="camps" class="stack" style="gap:6px">${(s.campaign_overrides || []).map(campRow).join('')}</div>
        ${ro ? '' : '<button type="button" class="btn sm" id="addcamp">+ زيد حملة</button>'}</div>
      <div class="stack" style="gap:6px"><b class="small">في وضع «واتساب + مكالمة»</b>
        <div class="seg" data-strategy>${[['immediate', 'مكالمة مباشرة'], ['delayed', 'مكالمة إذا ما أكّدش في واتساب']].map(([k, l]) => `<button type="button" data-v="${k}" class="${s.combined_strategy === k ? 'on' : ''}" ${ro ? 'disabled' : ''}>${l}</button>`).join('')}</div>
        <label class="f">نستناو قبل المكالمة (دقائق)<input type="number" min="5" max="1440" name="delay_minutes" value="${s.delay_minutes}" inputmode="numeric" ${ro ? 'disabled' : ''}></label></div>
    </section>

    <section class="card stack"><h2>فترات الاتصال والمحاولات</h2><div class="muted small">بتوقيت الجزائر (${esc(s.timezone)}) — محاولة وحدة في كل فترة، بلا مكالمات متتابعة لتعويض فترة فاتت.</div>
      ${s.windows.map((w, i) => `<div class="row win"><b class="small" style="min-width:64px">الفترة ${i + 1}</b><input type="time" data-w="${i}" data-k="start" value="${w.start}" ${ro ? 'disabled' : ''}><span class="muted">→</span><input type="time" data-w="${i}" data-k="end" value="${w.end}" ${ro ? 'disabled' : ''}></div>`).join('')}
      <label class="f">أقصى عدد محاولات في اليوم (مع الأولى)<select name="max_attempts_per_day" ${ro ? 'disabled' : ''}>${[1, 2, 3].map((n) => `<option ${n === s.max_attempts_per_day ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="switch"><input type="checkbox" name="only_cod" ${s.only_cod ? 'checked' : ''} ${ro ? 'disabled' : ''}> نعيطو غير للطلبات بالدفع عند الاستلام</label>
    </section>

    <section class="card stack"><h2>نصوص المكالمة</h2>
      <label class="f">افتتاحية المكالمة الصادرة<textarea name="outbound_opening" rows="3" ${ro ? 'disabled' : ''}>${esc(s.scripts.outbound_opening)}</textarea></label>
      <label class="f">افتتاحية المكالمة الواردة<textarea name="inbound_opening" rows="3" ${ro ? 'disabled' : ''}>${esc(s.scripts.inbound_opening)}</textarea></label>
    </section>

    <section class="card stack"><h2>الصوت المخصّص للحوار</h2><div class="muted small">هاذا الصوت اللي يردّ بيه المساعد طول المكالمة.</div>
      ${[['outbound', 'المكالمات الصادرة'], ['inbound', 'المكالمات الواردة']].map(([k, l]) => `<div class="stack" style="gap:6px"><label class="f">${l}<select name="voice_${k}" ${ro ? 'disabled' : ''}>${voiceOpts(s.voice[k])}</select></label>
        <div class="row"><button type="button" class="btn sm" data-sample="${k}">▶ اسمع عيّنة بالدارجة</button><span class="small muted" data-vnote="${k}"></span></div></div>`).join('')}
      <div data-browserwarn></div>
      <div class="note">أصوات Twilio (Google/Polly) تنطق عربي فصيح، ماشي دارجة. للنطق الأقرب للدارجة حط ELEVENLABS_API_KEY وتبانلك أصوات ElevenLabs هنا.${cfg.voices.elevenlabsError ? ` <b style="color:var(--danger)">ElevenLabs: ${esc(cfg.voices.elevenlabsError)}</b>` : ''}</div>
      <div class="acc stack"><label class="switch"><input type="checkbox" name="same_voice" ${s.voice.same_voice ? 'checked' : ''} ${!cfg.voices.cloningSupported || ro ? 'disabled' : ''}> نفس الصوت طول المكالمة (صوت مستنسخ)</label>
        ${cfg.voices.cloningSupported ? `<div class="small">${s.voice.clone_voice_id ? `صوت مستنسخ موجود (صاحبو: <b>${esc(s.voice.clone_owner)}</b>)` : 'ما كانش صوت مستنسخ بعد.'}</div>${ro ? '' : '<button type="button" class="btn sm" id="clone">استنسخ صوت من تسجيلاتي</button>'}`
          : '<div class="small muted">الاستنساخ يحتاج مزوّد يدعمو (ElevenLabs). حالياً غير متاح.</div>'}</div>
    </section>

    <section class="card stack" id="sbcard"><div class="row between"><h2>SpyBox Gemini TTS</h2>${cfg.voices.spybox ? '<span class="badge b-green">مربوط</span>' : '<span class="badge b-gray">SPYBOX_API_KEY ناقص</span>'}</div>
      <div class="small muted">اختار Puck (ولا صوت Gemini آخر) في «الصوت المخصّص للحوار». إذا اخترت «بلا مقدّمة مسجّلة»، نفس الصوت يقرا الافتتاحية وكل الردود.</div>
      <div data-sbstatus class="small"></div>
      ${cfg.voices.spybox && isAdmin() ? '<div class="row"><button type="button" class="btn sm" data-sbpre>حضّر الافتتاحية مسبقاً بالصوت المختار</button></div><div class="small muted">الجمل الثابتة اللي تتحضّر مسبقاً تتشغّل فوراً في المكالمة (0 تأخير، 0 SBC من بعد).</div>' : ''}
    </section>

    <section class="card stack"><h2>المقدّمة المسجّلة</h2><div class="muted small">تسجيل يتشغّل مرة وحدة في البداية (كي يجاوب الزبون، ولا كي المساعد يستقبل المكالمة)، من بعد يكمّل الصوت المخصّص للحوار.</div>
      ${isAdmin() ? `<div id="recorder"></div>
        <div id="mlist" class="stack" style="gap:8px">${cfg.media.map(mediaRow).join('') || '<div class="muted small">ما كانش تسجيلات</div>'}</div>
        <label class="f">مقدّمة المكالمات الصادرة<select name="intro_outbound">${mediaOpts(s.intros.outbound_media_id)}</select></label>
        <label class="f">مقدّمة المكالمات الواردة<select name="intro_inbound">${mediaOpts(s.intros.inbound_media_id)}</select></label>` : '<div class="muted small">رفع التسجيلات وسماعها للمشرف برك.</div>'}
    </section>
    ${ro ? '' : '<div class="savebar"><button class="btn primary" style="flex:1">حفظ الإعدادات</button></div>'}
    </form>`;

  // التفاعل
  $$('.seg[data-mode] button').forEach((b) => b.onclick = () => { const seg = b.parentElement; $$('button', seg).forEach((x) => x.classList.toggle('on', x === b)); });
  $$('.seg[data-strategy] button').forEach((b) => b.onclick = () => $$('.seg[data-strategy] button').forEach((x) => x.classList.toggle('on', x === b)));
  $$('[data-copy]').forEach((b) => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); toast('تنسخ'); });
  $('#addcamp') && ($('#addcamp').onclick = () => $('#camps').insertAdjacentHTML('beforeend', campRow({ source_id: '', label: '', mode: 'whatsapp' })));
  $('#camps').addEventListener('click', (e) => { if (e.target.closest('[data-delcamp]')) e.target.closest('.camp').remove(); });
  $$('[data-sample]').forEach((b) => b.onclick = () => playSample($(`[name=voice_${b.dataset.sample}]`).value, null, $(`[data-vnote=${b.dataset.sample}]`)));
  const loadSb = () => api('GET', '/api/voices/spybox').then((st) => {
    if (!$('[data-sbstatus]')) return;
    const v = latencyVerdict(st.stats.avg_ms);
    $('[data-sbstatus]').innerHTML = `<dl class="kv"><dt>الرصيد</dt><dd>${st.balance ? `${st.balance.available} SBC` : esc(st.balance_error || '—')}</dd>
      <dt>متوسط التأخير</dt><dd>${fmtMs(st.stats.avg_ms)}${st.stats.p90_ms ? ` · p90 ${fmtMs(st.stats.p90_ms)}` : ''} <span class="muted">(${st.stats.count} توليد)</span></dd>
      <dt>للمكالمة المباشرة</dt><dd><span class="badge b-${v.tone}">${v.text}</span></dd><dt>المصروف</dt><dd>${st.stats.credits_total} SBC${st.stats.failed ? ` · ${st.stats.failed} فشل` : ''}</dd></dl>`;
  }).catch((e) => { if ($('[data-sbstatus]')) $('[data-sbstatus]').textContent = e.message; });
  if (cfg.voices.spybox) { loadSb(); window.addEventListener('zinor:tts', loadSb); setCleanup(() => window.removeEventListener('zinor:tts', loadSb)); }
  $('[data-sbpre]') && ($('[data-sbpre]').onclick = async () => {
    const voice = $('[name=voice_outbound]').value;
    if (!voice.startsWith('sb:')) return toast('اختار صوت SpyBox (Puck) في الصوت المخصّص للحوار واحفظ أولاً', 'err');
    const q = await act(() => api('POST', '/api/voices/pregenerate', { voice, dry_run: true }));
    if (!confirm(`تحضير الافتتاحية (صادرة + واردة) بصوت ${voice.slice(3)}: ${q.estimated_credits} SBC تقريباً. نكمّلو؟`)) return;
    const r = await act(() => api('POST', '/api/voices/pregenerate', { voice }), 'تحضّرت الافتتاحية');
    toast(r.items.map((j) => (j.cached ? 'من الذاكرة' : fmtMs(j.ms_total))).join(' · '));
    callsSettingsPage(main);
  });
  voiceDiagnosis().then((d) => { if (!d.ok) $('[data-browserwarn]').innerHTML = `<div class="alert warn small"><b>عيّنات المتصفح ما تقراش العربية في هاذ الجهاز:</b> ${esc(d.reason)}</div>`; });
  $('#testcall') && ($('#testcall').onclick = async () => { const r = await act(() => api('POST', '/api/calls/test')); toast(r.call.real ? 'تبعث الاتصال الحقيقي لرقمك' : 'محاكاة: المكالمة راهي في محاكي المكالمات'); });
  if (isAdmin()) {
    mountRecorder($('#recorder'), { onSaved: () => callsSettingsPage(main) });
    $('#mlist').addEventListener('click', async (e) => {
      const del = e.target.closest('[data-delmedia]');
      if (del && confirm('تمسح التسجيل؟')) { await act(() => api('DELETE', `/api/media/${del.dataset.delmedia}`), 'تمسح'); callsSettingsPage(main); }
    });
    $('#clone') && ($('#clone').onclick = () => modal('استنساخ الصوت', `<div class="alert warn">استعمل غير صوت عندك موافقة صاحبو المكتوبة باش نستعملوه في المكالمات.</div>
      <label class="f">اسم صاحب الصوت<input name="owner" required></label>
      <div class="f">التسجيلات (دقيقة إلى 5 دقائق كلام واضح بالدارجة):</div>
      ${cfg.media.map((m) => `<label class="switch"><input type="checkbox" name="m_${m.id}"> ${esc(m.name)}</label>`).join('') || '<div class="muted">ارفع تسجيل أولاً</div>'}
      <label class="switch"><input type="checkbox" name="consent" required> صاحب الصوت وافق على استعمالو في مكالمات Zinor</label>`, {
      submitLabel: 'استنسخ',
      onSubmit: async (fd) => { await api('POST', '/api/voices/clone', { owner: fd.owner, consent: fd.consent === 'on', media_ids: Object.keys(fd).filter((k) => k.startsWith('m_')).map((k) => k.slice(2)) }); toast('تستنسخ الصوت'); callsSettingsPage(main); },
    }));
  }
  $('#cf').onsubmit = async (e) => {
    e.preventDefault();
    if (ro) return;
    const fd = new FormData(e.target);
    const out = structuredClone(s);
    for (const k of ['real_calls_enabled', 'test_only_owner', 'outbound_enabled', 'inbound_enabled', 'only_cod']) out[k] = fd.has(k);
    out.owner_phone = fd.get('owner_phone').trim();
    out.delay_minutes = Number(fd.get('delay_minutes')) || 60;
    out.max_attempts_per_day = Number(fd.get('max_attempts_per_day'));
    out.combined_strategy = $('.seg[data-strategy] .on')?.dataset.v || out.combined_strategy;
    $$('.seg[data-mode]').forEach((seg) => { out.modes[seg.dataset.mode] = $('.on', seg)?.dataset.v || out.modes[seg.dataset.mode]; });
    out.campaign_overrides = $$('.camp').map((r) => ({ source_id: $('[data-c=id]', r).value.trim(), label: $('[data-c=label]', r).value.trim(), mode: $('[data-c=mode]', r).value })).filter((c) => c.source_id);
    $$('[data-w]').forEach((i) => { out.windows[i.dataset.w][i.dataset.k] = i.value; });
    out.scripts = { outbound_opening: fd.get('outbound_opening'), inbound_opening: fd.get('inbound_opening') };
    out.voice = { ...out.voice, outbound: fd.get('voice_outbound'), inbound: fd.get('voice_inbound'), same_voice: fd.has('same_voice') };
    if (isAdmin()) out.intros = { outbound_media_id: Number(fd.get('intro_outbound')) || null, inbound_media_id: Number(fd.get('intro_inbound')) || null };
    if (out.real_calls_enabled && out.test_only_owner && !out.owner_phone) return toast('حط رقمك قبل ما تفعّل المكالمات الحقيقية', 'err');
    await act(async () => {
      await api('PUT', '/api/settings/calls', out);
      await api('PUT', '/api/settings/ai', { ...ai, enabled: fd.has('wa_replies') });
    }, 'تحفظت الإعدادات — المحاولات اللي ما بداتش للمصادر المطفية تلغات');
    callsSettingsPage(main);
  };
}

const campRow = (c) => `<div class="camp row"><input data-c="id" placeholder="معرّف الإعلان" value="${esc(c.source_id)}" style="flex:1;min-width:110px"><input data-c="label" placeholder="اسم الحملة" value="${esc(c.label || '')}" style="flex:1;min-width:110px">
  <select data-c="mode">${Object.entries(MODE_SHORT).map(([k, l]) => `<option value="${k}" ${k === c.mode ? 'selected' : ''}>${l}</option>`).join('')}</select><button type="button" class="btn sm danger" data-delcamp>✕</button></div>`;
const mediaRow = (m) => `<div class="acc"><div class="row between"><b>${esc(m.name)}</b><span class="small muted">${m.mime === 'audio/wav' ? 'WAV' : 'MP3'} · ${Math.round(m.size / 1024)} KB</span></div>
  <audio controls preload="none" src="/api/media/${m.id}/audio" style="width:100%"></audio><div class="row"><span class="badge plain b-gold">مقدّمة مسجّلة</span><div class="grow"></div><button type="button" class="btn sm danger" data-delmedia="${m.id}">مسح</button></div></div>`;

// عيّنة الصوت: ElevenLabs يتولّد على الخادم؛ الباقي بصوت عربي من المتصفح (رجل/امرأة حسب الاختيار)
export async function playSample(voiceId, text, noteEl) {
  if (String(voiceId).startsWith('sb:')) { if (noteEl) noteEl.textContent = 'صوت مدفوع: شوف التكلفة قبل التوليد'; return spyboxSample(voiceId, text); }
  try {
    const q = `voice=${encodeURIComponent(voiceId)}${text ? `&text=${encodeURIComponent(text)}` : ''}`;
    const info = await api('GET', `/api/voices/sample?format=text&${q}`);
    if (!info.browser) {
      await playActions([{ type: 'say', speech: info.speech }], { kind: 'server', id: voiceId });
      if (noteEl) noteEl.textContent = 'صوت ElevenLabs الحقيقي';
      return;
    }
    const d = await voiceDiagnosis();
    if (!d.ok) { if (noteEl) noteEl.textContent = 'ما كانش صوت عربي في المتصفح — شوف التنبيه'; return toast('ما كانش صوت عربي في هاذ المتصفح', 'err'); }
    const male = /male|maged|majed|tarik|hamed|naayf|omar|shakir|hamdan|fahed|rami|zayd/i, female = /female|laila|layla|salma|hoda|zariyah|mariam|amira|fatima|sana|zeina|hala/i;
    const voice = d.voices.find((v) => (info.gender === 'male' ? male : female).test(v.name)) || d.voices[0];
    await playActions([{ type: 'say', speech: info.speech }], { kind: 'browser', voice });
    if (noteEl) noteEl.textContent = `${info.note} — ${voice.name}`;
  } catch (e) { toast(e.message, 'err'); }
}

// ───────────── محاكي المكالمات ─────────────
export async function callSimPage(main) {
  let current = null, voiceOn = true, showSpeech = false, picker = null;
  const metrics = new Map(); // `${callId}:${text}` → قياس SpyBox
  const session = [];
  let warned = false;
  const cfg = await api('GET', '/api/calls/config');
  main.innerHTML = `<div class="page-head"><div><h1>محاكي المكالمات</h1><div class="muted small">جرّب المكالمة الصادرة والواردة بلا ما تخلّص — نفس المسار تاع n8n / خدمة الهاتف</div></div>
    <div class="row"><button class="btn" id="rundue">شغّل الجدولة دُرك</button><a class="btn" href="#/calls">الإعدادات</a></div></div>
    <div class="callsim">
      <div class="stack">
        <div class="card stack"><h2>صوت المحاكي</h2><div id="vpick"></div><div id="latency" class="small"></div></div>
        ${isAdmin() ? `<div class="card stack"><h2>المقدّمة المسجّلة</h2><div class="small muted">تتشغّل مرة وحدة كي تضغط «جاوب» (ولا في بداية المكالمة الواردة)، ومن بعد يكمّل المساعد.</div>
          <div id="simrec"></div><div id="simintros" class="stack" style="gap:8px"></div></div>` : ''}
        <div class="card stack"><h2>الزبون يعيّط للمتجر</h2><div class="row"><input id="infrom" inputmode="tel" placeholder="رقم المتصل 05..." class="grow"><button class="btn primary" id="inbtn">📞 عيّط</button></div></div>
        <div class="card stack"><div class="row between"><h2>المكالمات الجارية</h2><span class="small muted">تجريبية</span></div><div id="active"></div></div>
        <div class="card stack"><h2>المحاولات المبرمجة</h2><div id="sched" class="small"></div></div>
        <div class="card stack"><h2>قائمة المراجعة</h2><div id="review" class="small"></div></div>
      </div>
      <div class="card stack" id="conv"><div class="empty">اختار مكالمة ولا عيّط للمتجر</div></div>
    </div>`;
  picker = await mountVoicePicker($('#vpick'), { serverVoices: cfg.voices.voices, onChange: () => { warned = false; setTimeout(() => picker && renderLatency()); } });
  const renderLatency = () => {
    const ok = session.filter((m) => !m.error && !m.cached);
    if (!session.length) { $('#latency').innerHTML = picker.choice?.kind === 'spybox' ? '<div class="note">كل ردّ يتولّد في SpyBox ويتحسب. التأخير يتقاس هنا.</div>' : ''; return; }
    const avg = ok.length ? Math.round(ok.reduce((s, m) => s + m.ms_total, 0) / ok.length) : null;
    const v = latencyVerdict(avg);
    $('#latency').innerHTML = `<div class="acc stack" style="gap:4px"><b>التأخير في هاذ الجلسة</b><div>آخر ردّ: ${metricLine(session.at(-1))}</div>
      <div>المتوسط: <b>${fmtMs(avg)}</b> على ${ok.length} توليد · المصروف: ${session.reduce((s, m) => s + (m.cached || m.error ? 0 : (m.credits_charged ?? m.credits_estimated ?? 0)), 0)} SBC</div><span class="badge b-${v.tone}">${v.text}</span></div>`;
  };
  const play = async (rep) => {
    if (!voiceOn || !rep?.actions) return;
    if (picker.choice?.kind === 'spybox' && !warned) {
      const say = rep.actions.find((a) => a.type === 'say');
      const q = say ? await api('POST', '/api/voices/quote', { voice: picker.choice.id, text: say.speech || say.text }).catch(() => null) : null;
      if (!confirm(`صوت ${picker.choice.id.slice(3)} مدفوع: كل ردّ يتولّد في SpyBox (هاذ الردّ ≈ ${q?.estimated_credits ?? '?'} SBC). نكمّلو؟`)) { voiceOn = false; return loadConv(); }
      warned = true;
    }
    playActions(rep.actions, picker.choice, { onMetric: (m) => { metrics.set(`${current}:${m.text}`, m); session.push(m); renderLatency(); loadConv(); } });
  };

  // المقدّمات: تسجيل/رفع + اختيار للصادرة والواردة (يتحفظ مباشرة)
  const loadIntros = async () => {
    if (!isAdmin()) return;
    const [{ media }, conf] = await Promise.all([api('GET', '/api/media'), api('GET', '/api/calls/config')]);
    const s = conf.settings;
    const sel = (k, v) => `<label class="f">${k === 'outbound_media_id' ? 'مقدّمة المكالمات الصادرة' : 'مقدّمة المكالمات الواردة'}<select data-intro="${k}"><option value="">بلا مقدّمة</option>${media.map((m) => `<option value="${m.id}" ${m.id === v ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>`;
    $('#simintros').innerHTML = media.map((m) => `<div class="acc"><div class="row between small"><b>${esc(m.name)}</b><span class="muted">${m.mime === 'audio/wav' ? 'WAV' : 'MP3'}</span></div><audio controls preload="none" src="/api/media/${m.id}/audio" style="width:100%"></audio></div>`).join('')
      + sel('outbound_media_id', s.intros.outbound_media_id) + sel('inbound_media_id', s.intros.inbound_media_id);
    $$('[data-intro]').forEach((x) => x.onchange = async () => {
      const c = (await api('GET', '/api/calls/config')).settings;
      c.intros[x.dataset.intro] = Number(x.value) || null;
      await act(() => api('PUT', '/api/settings/calls', c), 'تحفظ الاختيار');
    });
  };
  if (isAdmin()) { mountRecorder($('#simrec'), { onSaved: async (m) => { await loadIntros(); const c = (await api('GET', '/api/calls/config')).settings; if (!c.intros.outbound_media_id) { c.intros.outbound_media_id = m.id; await api('PUT', '/api/settings/calls', c); await loadIntros(); toast('اخترناه مقدّمة للمكالمات الصادرة'); } } }); loadIntros(); }

  const loadSide = async () => {
    const [a, l] = await Promise.all([api('GET', '/api/sim/calls'), api('GET', '/api/calls')]);
    $('#active').innerHTML = a.active.map((c) => `<div class="acc ${c.id === current ? 'sel' : ''}" data-call="${c.id}"><div class="row between"><b>${c.direction === 'in' ? '⬇ واردة' : '⬆ صادرة'} · ${esc(c.number || c.phone)}</b>
      <span class="badge ${c.status === 'in_progress' ? 'b-green' : 'b-amber'}">${c.status === 'in_progress' ? 'جارية' : 'ترنّ'}</span></div><div class="small muted">${esc(c.customer_name || '')} · <span class="mono">${esc(c.phone)}</span></div>
      ${c.status !== 'in_progress' ? `<div class="row"><button class="btn sm primary" data-ev="answered" data-id="${c.id}">جاوب</button><button class="btn sm" data-ev="no_answer" data-id="${c.id}">ما ردّش</button><button class="btn sm" data-ev="voicemail" data-id="${c.id}">بريد صوتي</button><button class="btn sm" data-ev="busy" data-id="${c.id}">مشغول</button></div>` : ''}</div>`).join('') || '<div class="muted small">ما كانش. اضغط «شغّل الجدولة دُرك» ولا «اتصل دُرك» من صفحة الطلب.</div>';
    $('#sched').innerHTML = l.scheduled.map((t) => `<a class="row between" style="padding:5px 0;border-bottom:1px solid var(--line);color:inherit" href="#/orders/${t.order_id}"><span><b>${esc(t.number)}</b> · ${t.kind === 'callback' ? 'عيّطلي من بعد' : t.kind === 'manual' ? 'يدوي' : `محاولة ${t.attempt_no}`}</span><span class="mono">${fmtDate(t.scheduled_for)}</span></a>`).join('') || '<span class="muted">—</span>';
    $('#review').innerHTML = l.review.map((o) => `<a class="row between" style="padding:5px 0;border-bottom:1px solid var(--line);color:inherit" href="#/orders/${o.id}"><span><b>${esc(o.number)}</b> ${esc(o.customer_name || '')}</span><span class="muted">${esc(o.review_reason)}</span></a>`).join('') || '<span class="muted">—</span>';
    $$('[data-call]').forEach((el) => el.onclick = (e) => { if (e.target.closest('button')) return; current = Number(el.dataset.call); loadConv(); loadSide(); });
    $$('[data-ev]').forEach((b) => b.onclick = async () => {
      const r = await act(() => api('POST', `/api/sim/calls/${b.dataset.id}/event`, { type: b.dataset.ev }));
      if (b.dataset.ev === 'answered') { current = Number(b.dataset.id); play(r.reply); }
      loadConv(); loadSide();
    });
  };
  const loadConv = async () => {
    if (!current) return;
    const { call: c } = await api('GET', `/api/calls/${current}`);
    const live = c.status === 'in_progress';
    $('#conv').innerHTML = `<div class="row between"><div><h2>${c.direction === 'in' ? 'مكالمة واردة' : 'مكالمة صادرة'} · <span class="mono">${esc(c.phone)}</span></h2>
        <div class="small muted">${c.order_id ? `<a href="#/orders/${c.order_id}">فتح الطلب ←</a>` : 'ما تربطتش بطلب بعد'}</div></div>${live ? '<span class="badge b-green">جارية</span>' : outcomeBadge(c.outcome, c.status)}</div>
      <div class="row"><label class="switch small"><input type="checkbox" id="voiceon" ${voiceOn ? 'checked' : ''}> شغّل الصوت</label><label class="switch small"><input type="checkbox" id="showspeech" ${showSpeech ? 'checked' : ''}> اعرض النص المخصّص للصوت</label></div>
      <div class="msgs callmsgs">${c.transcript.map((m, i) => `<div class="msg ${m.who === 'customer' ? 'out' : 'in'}"><div class="who">${m.who === 'customer' ? 'الزبون (أنت)' : m.play ? '▶ مقدّمة مسجّلة' : 'المساعد 🤖'}</div>
        ${m.play ? `<audio controls preload="none" src="/api/media/${m.media_id}/audio" style="width:220px;max-width:100%"></audio>` : `<div class="body">${esc(showSpeech && m.speech ? m.speech : m.text)}</div>`}
        ${m.who === 'bot' && !m.play && m.speech ? `<button type="button" class="btn sm ghost" data-replay="${i}">🔊</button>` : ''}
        ${metrics.get(`${c.id}:${m.speech}`) ? `<div class="meta"><span>${metricLine(metrics.get(`${c.id}:${m.speech}`))}</span></div>` : ''}</div>`).join('')}</div>
      ${live ? `<div class="chips">${['ايه', 'لا', 'واش نتا روبو؟', 'عيطلي على الخمسة العشية', 'خليني نخمم', 'نحب نبدل العنوان', 'نحب نلغي الكوموند', 'وين راهي الكوموند؟', 'نحب نهدر مع موظف'].map((t) => `<button class="chip" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <form class="composer" id="sayf" style="border:1px solid var(--line);border-radius:12px"><input id="saytext" class="grow" placeholder="واش يقول الزبون..." autocomplete="off"><button class="btn primary">قول</button><button type="button" class="btn danger" id="hang">سكّر</button></form>` : ''}`;
    const box = $('.callmsgs'); box.scrollTop = box.scrollHeight;
    $('#voiceon').onchange = (e) => { voiceOn = e.target.checked; if (!voiceOn) stopPlayback(); };
    $('#showspeech').onchange = (e) => { showSpeech = e.target.checked; loadConv(); };
    $$('[data-replay]').forEach((b) => b.onclick = () => { const m = c.transcript[Number(b.dataset.replay)]; playActions([{ type: 'say', speech: m.speech }], picker.choice, { onMetric: (x) => { metrics.set(`${c.id}:${x.text}`, x); session.push(x); renderLatency(); } }); });
    const send = async (text) => { const r = await act(() => api('POST', `/api/sim/calls/${current}/say`, { text })); play(r.reply); loadConv(); loadSide(); };
    $('#sayf') && ($('#sayf').onsubmit = (e) => { e.preventDefault(); const t = $('#saytext').value.trim(); if (t) { $('#saytext').value = ''; send(t); } });
    $$('#conv .chip').forEach((b) => b.onclick = () => send(b.dataset.t));
    $('#hang') && ($('#hang').onclick = async () => { await act(() => api('POST', `/api/sim/calls/${current}/event`, { type: 'completed' })); stopPlayback(); loadConv(); loadSide(); });
  };
  $('#inbtn').onclick = async () => {
    const from = $('#infrom').value.trim();
    if (!from) return toast('حط رقم المتصل', 'err');
    const r = await act(() => api('POST', '/api/sim/calls/inbound', { from }));
    current = r.call.id; play(r.reply); loadConv(); loadSide();
  };
  $('#rundue').onclick = async () => { const r = await act(() => api('POST', '/api/sim/calls/run-due', {})); toast(r.dialed ? `${r.dialed} مكالمة بدات` : 'ما كانش محاولات حان وقتها (أو خارج الفترات)'); loadSide(); };
  await loadSide();
  const timer = setInterval(loadSide, 5000);
  setCleanup(() => { clearInterval(timer); stopPlayback(); });
}

// ───────────── كارت المكالمات في صفحة الطلب ─────────────
export function orderCallsCard(info, orderId) {
  const waiting = true;
  return `<div class="card" id="callcard"><div class="card-head"><h2>التأكيد والمكالمات</h2><span class="badge plain b-blue">${esc(info.mode_label)}</span></div>
    <dl class="kv small"><dt>المصدر</dt><dd>${esc({ woocommerce: 'WooCommerce', store: 'متجر', whatsapp_chat: 'محادثة واتساب', whatsapp_campaign: 'حملة واتساب', manual: 'يدوي', default: 'افتراضي' }[info.channel] || info.channel)}${info.campaign ? ` — ${esc(info.campaign)}` : ''}</dd>
      <dt>آخر نتيجة</dt><dd>${info.last ? `${outcomeBadge(info.last.outcome, info.last.status)} <span class="muted">${fmtDate(info.last.at)}${info.last.real ? '' : ' · محاكاة'}</span>${info.last.error ? `<div style="color:var(--danger)">${esc(info.last.error)}</div>` : ''}` : '—'}</dd>
      <dt>المحاولة الجاية</dt><dd>${info.next ? `<b class="mono">${esc(info.next.local)}</b> <span class="muted">(${esc(info.next.reason || '')})</span>` : '—'}</dd>
      ${info.review_reason ? `<dt>للمراجعة</dt><dd style="color:#946500">${esc(info.review_reason)}</dd>` : ''}${info.do_not_call ? '<dt>ملاحظة</dt><dd style="color:var(--danger)">الزبون طلب ما نعاودوش نعيطولو</dd>' : ''}</dl>
    <div class="row" style="margin-top:10px">${waiting ? `<button class="btn sm primary" data-callact="call-now">📞 اتصل دُرك</button><button class="btn sm" data-callact="stop-calls">أوقف المحاولات</button><button class="btn sm" data-callact="handoff">حوّل لموظف</button>` : ''}</div>
    ${info.calls.length ? `<details style="margin-top:10px"><summary class="small muted" style="cursor:pointer">${info.calls.length} مكالمة — النص الكامل</summary>${info.calls.map((c) => `<div class="acc" style="margin-top:8px"><div class="row between small"><span>${c.direction === 'in' ? '⬇ واردة' : '⬆ صادرة'} · ${fmtDate(c.created_at)}${c.real ? '' : ' · محاكاة'}</span>${outcomeBadge(c.outcome, c.status)}</div>
      ${c.transcript.map((m) => `<div class="small"><b>${m.who === 'customer' ? 'الزبون' : m.play ? '▶' : 'المساعد'}:</b> ${esc(m.text)}</div>`).join('')}${c.error ? `<div class="small" style="color:var(--danger)">${esc(c.error)}</div>` : ''}</div>`).join('')}</details>` : ''}</div>`;
}
