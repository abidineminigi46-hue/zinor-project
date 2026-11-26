// الصوت في المتصفح: اختيار صوت عربي، قراءة النص المخصّص للصوت، تشغيل المقدّمة، والتسجيل من الميكرو
import { esc, $, api, toast } from './core.js';

// ───── أصوات المتصفح ─────
export function browserVoices() {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve([]);
    const now = speechSynthesis.getVoices();
    if (now.length) return resolve(now);
    const t = setTimeout(() => resolve(speechSynthesis.getVoices()), 1500);
    speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); resolve(speechSynthesis.getVoices()); }, { once: true });
  });
}
const isArabic = (v) => /^ar(\b|[-_])/i.test(v.lang || '') || /arab|عرب/i.test(v.name || '');

/** حالة القراءة بالصوت + السبب إذا ما تقراش العربية */
export async function voiceDiagnosis() {
  if (!('speechSynthesis' in window)) return { ok: false, voices: [], reason: 'متصفحك ما يدعمش القراءة بالصوت (Web Speech API). جرّب Chrome ولا Edge ولا Safari.' };
  const all = await browserVoices();
  const ar = all.filter(isArabic);
  if (ar.length) return { ok: true, voices: ar, all };
  const ua = navigator.userAgent;
  const how = /Android/i.test(ua) ? 'في Android: الإعدادات ← النظام ← اللغة ← تحويل النص إلى كلام (محرك Google) ← ثبّت «العربية»، ومن بعد عاود حلّ المتصفح.'
    : /iPhone|iPad/i.test(ua) ? 'في iPhone: الإعدادات ← تسهيلات الاستخدام ← المحتوى المنطوق ← الأصوات ← العربية ← حمّل صوت (مجد ولا ليلى)، ومن بعد عاود حلّ Safari.'
      : /Windows/i.test(ua) ? 'في Windows: الإعدادات ← الوقت واللغة ← الكلام ← «إضافة أصوات» ← العربية، ومن بعد عاود حلّ المتصفح. ولا افتح اللوحة بـ Microsoft Edge (فيه أصوات عربية «Online»).'
        : /Mac/i.test(ua) ? 'في Mac: إعدادات النظام ← تسهيلات الاستخدام ← المحتوى المنطوق ← صوت النظام ← إدارة الأصوات ← العربية.'
          : 'ثبّت صوت عربي في نظام الجهاز (إعدادات تحويل النص إلى كلام)، ولا جرّب متصفح آخر.';
  return {
    ok: false, voices: [], all,
    reason: `${all.length ? `المتصفح فيه ${all.length} صوت بصح حتى واحد ماهوش عربي` : 'المتصفح ما عطا حتى صوت'} — لهذا كان يقرا غير الكلمات اللاتينية (Zinor، Bab Ezzouar…) ويفوّت العربية. ${how}`,
  };
}

// ───── المشغّل: تسجيل المقدّمة ثم كلام المساعد، بالترتيب ─────
let playToken = 0;
export function stopPlayback() { playToken++; window.speechSynthesis?.cancel(); document.querySelectorAll('audio[data-zinor-player]').forEach((a) => a.pause()); }

function playAudio(src, token) {
  return new Promise((resolve) => {
    if (token !== playToken) return resolve();
    const a = new Audio(src);
    a.dataset.zinorPlayer = '1';
    a.onended = a.onerror = () => resolve();
    a.play().catch(() => resolve());
  });
}
function speakOnce(text, voice, token) {
  return new Promise((resolve) => {
    if (token !== playToken || !text) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice; u.lang = voice.lang || 'ar';
    u.rate = 0.95;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
    // بعض المتصفحات ما تبعثش onend
    setTimeout(resolve, Math.min(60000, 1500 + text.length * 120));
  });
}

/**
 * يشغّل ردّ المساعد: { type:'play', media_id } ثم { type:'say', speech }
 * choice = { kind:'browser', voice } | { kind:'server', id:'el:...' }
 */
export async function playActions(actions, choice) {
  stopPlayback();
  const token = playToken;
  for (const a of actions || []) {
    if (token !== playToken) return;
    if (a.type === 'play') await playAudio(`/api/media/${a.media_id}/audio`, token);
    else if (a.type === 'say') {
      const text = a.speech || a.text;
      if (choice?.kind === 'server') await playAudio(`/api/voices/tts?voice=${encodeURIComponent(choice.id)}&text=${encodeURIComponent(text)}`, token);
      else if (choice?.kind === 'browser' && choice.voice) await speakOnce(text, choice.voice, token);
    }
  }
}

/** قائمة اختيار صوت المحاكي + عيّنة + سبب إذا ما كانش صوت عربي */
export async function mountVoicePicker(el, { serverVoices = [], onChange } = {}) {
  const diag = await voiceDiagnosis();
  const saved = (() => { try { return localStorage.getItem('zinor.simVoice') || ''; } catch { return ''; } })();
  const opts = [
    ...diag.voices.map((v) => ({ key: `b:${v.voiceURI || v.name}`, label: `${v.name} (${v.lang}) — صوت المتصفح`, choice: { kind: 'browser', voice: v } })),
    ...serverVoices.filter((v) => v.provider === 'elevenlabs').map((v) => ({ key: `s:${v.id}`, label: `${v.label} — يتولّد على الخادم`, choice: { kind: 'server', id: v.id } })),
  ];
  let current = opts.find((o) => o.key === saved) || opts[0] || null;
  el.innerHTML = `${opts.length ? `<label class="f">الصوت اللي يقرا ردود المساعد في المحاكي<select data-vsel>${opts.map((o) => `<option value="${esc(o.key)}" ${o === current ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>
      <div class="row"><button type="button" class="btn sm" data-vsample>▶ اسمع عيّنة بالدارجة</button><button type="button" class="btn sm ghost" data-vstop>⏹ وقّف</button></div>` : ''}
    ${diag.ok ? '<div class="small muted">الأصوات العربية تاع المتصفح تنطق بالفصحى؛ النص مكتوب بالدارجة بحروف عربية باش يتقرا كامل.</div>'
      : `<div class="alert warn" data-vwarn><b>الصوت العربي ما راهوش متوفر:</b> ${esc(diag.reason)}${opts.length ? '<br>تقدر تستعمل صوت ElevenLabs من القائمة.' : ''}</div>`}
    <details class="small"><summary class="muted" style="cursor:pointer">النص المخصّص للصوت (عيّنة)</summary><div class="note" data-vtext style="margin-top:6px"></div></details>`;
  const sample = await api('GET', '/api/voices/sample?format=text');
  $('[data-vtext]', el).textContent = sample.speech;
  $('[data-vsel]', el)?.addEventListener('change', (e) => {
    current = opts.find((o) => o.key === e.target.value);
    try { localStorage.setItem('zinor.simVoice', current.key); } catch {}
    onChange?.(current?.choice);
  });
  $('[data-vsample]', el)?.addEventListener('click', () => playActions([{ type: 'say', speech: sample.speech }], current?.choice));
  $('[data-vstop]', el)?.addEventListener('click', stopPlayback);
  onChange?.(current?.choice || null);
  return { diag, get choice() { return current?.choice || null; } };
}

// ───── التسجيل: من الميكرو أو ملف، نسمعو قبل الحفظ، ونحوّلو لـ WAV ─────
async function toWav(blob, rate = 16000) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close?.();
  const off = new OfflineAudioContext(1, Math.ceil(buf.duration * rate), rate);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return new Blob([out], { type: 'audio/wav' });
}
const blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });

export function mountRecorder(el, { onSaved } = {}) {
  let pending = null, rec = null, stream = null, timer = null;
  const micOk = window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder;
  el.innerHTML = `<div class="stack recorder">
    <label class="f">اسم التسجيل<input data-rname placeholder="مثلاً: مقدّمة سارة"></label>
    <div class="row"><button type="button" class="btn primary" data-rmic ${micOk ? '' : 'disabled'}>🎙 سجّل من الميكرو</button>
      <label class="btn" style="position:relative;overflow:hidden">⬆ ارفع تسجيل<input type="file" data-rfile accept="audio/*,.mp3,.wav,.m4a" style="position:absolute;inset:0;opacity:0"></label></div>
    ${micOk ? '' : `<div class="small alert warn">${!window.isSecureContext ? 'التسجيل من الميكرو يخدم غير على https ولا localhost. من التلفون، افتح اللوحة برابط https، ولا استعمل «ارفع تسجيل» (سجّل في تطبيق المسجّل تاع التلفون وارفع الملف).' : 'المتصفح ما يدعمش التسجيل من الميكرو — استعمل «ارفع تسجيل».'}</div>`}
    <div data-rlive hidden class="row"><span class="badge b-red">● راه يسجّل</span><b data-rtime class="mono">0:00</b><button type="button" class="btn sm danger" data-rstop>⏹ وقّف</button></div>
    <div data-rpreview hidden class="acc stack"><b class="small">اسمع قبل ما تحفظ</b><audio controls data-raudio style="width:100%"></audio>
      <div class="row"><button type="button" class="btn primary sm" data-rsave>💾 حفظ التسجيل</button><button type="button" class="btn sm" data-rdiscard>↺ عاود</button><span class="small muted" data-rinfo></span></div></div></div>`;
  const show = (sel, on) => { $(sel, el).hidden = !on; };
  const setPending = (blob, info) => {
    pending = blob;
    $('[data-raudio]', el).src = URL.createObjectURL(blob);
    $('[data-rinfo]', el).textContent = info;
    show('[data-rpreview]', true);
  };
  $('[data-rmic]', el).onclick = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) { return toast(`ما قدرناش نفتحو الميكرو: ${e.message}`, 'err'); }
    const chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(timer); show('[data-rlive]', false);
      try { const wav = await toWav(new Blob(chunks, { type: rec.mimeType })); setPending(wav, `WAV · ${Math.round(wav.size / 1024)} KB`); }
      catch (e) { toast(`ما قدرناش نحوّلو التسجيل: ${e.message}`, 'err'); }
    };
    rec.start(250);
    const t0 = Date.now();
    show('[data-rlive]', true); show('[data-rpreview]', false);
    timer = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      $('[data-rtime]', el).textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= 90) rec.state === 'recording' && rec.stop(); // حد أقصى دقيقة ونص
    }, 250);
  };
  $('[data-rstop]', el).onclick = () => rec?.state === 'recording' && rec.stop();
  $('[data-rfile]', el).onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return toast('الملف كبير بزاف', 'err');
    if (!$('[data-rname]', el).value) $('[data-rname]', el).value = f.name.replace(/\.\w+$/, '');
    const direct = /\.(mp3|wav)$/i.test(f.name) || /audio\/(mpeg|mp3|wav|x-wav)/.test(f.type);
    if (direct && f.size <= 8 * 1024 * 1024) return setPending(f, `${f.name} · ${Math.round(f.size / 1024)} KB`);
    try { const wav = await toWav(f); setPending(wav, `تحوّل لـ WAV · ${Math.round(wav.size / 1024)} KB`); }
    catch { toast('الصيغة ما تخدمش — استعمل MP3 ولا WAV', 'err'); }
  };
  $('[data-rdiscard]', el).onclick = () => { pending = null; show('[data-rpreview]', false); };
  $('[data-rsave]', el).onclick = async () => {
    if (!pending) return;
    const r = await api('POST', '/api/media', { name: $('[data-rname]', el).value || 'مقدّمة', data: await blobToDataUrl(pending) }).catch((e) => { toast(e.message, 'err'); return null; });
    if (!r) return;
    toast('تحفظ التسجيل');
    pending = null; show('[data-rpreview]', false); $('[data-rname]', el).value = '';
    onSaved?.(r.media);
  };
}
