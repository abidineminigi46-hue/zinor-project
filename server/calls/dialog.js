// محرّك الحوار الصوتي بالدارجة: نص الزبون (من التعرّف على الكلام) ← ردّ قصير + إجراءات.
// القرارات اللي تبدّل الكوموند (تأكيد، إلغاء، عنوان، شحن) يديرها engine.js عبر ops — هنا غير الفهم والحوار.
import { normText, findWilaya, wilayaByCode } from '../data/wilayas.js';
import { getSetting } from '../services/settings.js';
import { localParts, zonedToDate, addDays, nextSlot } from './time.js';

const AR_DIGITS = { '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9 };
export const normSpeech = (s) => normText(String(s || '').replace(/[٠-٩]/g, (d) => AR_DIGITS[d])).replace(/[؟?!.,،]/g, ' ').replace(/\s+/g, ' ').trim();

const R = {
  botQ: /(روبو|روبوت|robot|مساعد الي|ذكاء اصطناعي|machine)|(^| )(الي|آلي)( |$|\?)|(بنادم|انسان|بشر) ولا|واش (نتا|نتي|انت|راك) (بنادم|انسان)/,
  human: /(نهدر|نتكلم|parler) (مع|avec) (واحد|موظف|بنادم|انسان|مسؤول|quelqu)|موظف|واحد من الخدامين|مسؤول|conseiller|service client/,
  dnc: /(ما|مات|ما ت|ماعادش|لا) ?(تعاودو|تعاودوش|تعيطو|تعيطوش|تعيطولي|تعيطليش|تتصلو|تتصلوش|تعيطلي)|ما تعيطوليش|ne m.?appel|ما عادش تعيطو|متعيطوليش/,
  cancel: /(الغي|نلغي|الغيها|الغيوها|نلغيها|annul|كونسلي|ما نحبهاش|ما نحبهش|ما بقيتش نحب|ما بقيتش حاب|بطلت|ما نحتاجهاش|مانحبهاش|ماعادش نحب)/,
  callback: /(من بعد|مبعد|عيطلي|عاود عيطلي|عاودلي|عيطولي|مشغول|راني خدام|ماشي درك|موش درك|غدوه|في الليل|العشيه|الصباح|بعد ساعه|بعد ساعتين|plus tard|rappel|apres|عاود اتصل)/,
  think: /(نخمم|خليني نخمم|نفكر|نشاور|نشوف ونعيطلك|ما نعرفش|je reflechis|on verra)/,
  address: /(بدل|بدلو|نبدل|نبدلو|غير|change|beddel).{0,12}(العنوان|عنوان|البلديه|الولايه|adresse)|العنوان ماشي|عنوان اخر|ماشي هاذ العنوان|بدلت الدار|راني في ولايه|نسكن في|حولت/,
  track: /(وين راه|وين راهي|وين وصلت|وين وصل|وقتاش توصل|وقتاش تجي|ما وصلتش|ما جاتش|ما وصلنيش|suivi|tracking|la commande ou)/,
  affirm: /(^| )(ايه|اه|اييه|ايوه|ايوا|واه|يه|نعم|صح|صحيح|مريقل|مليح|اوكي|ok|okay|oui|wah|ih|اكيد|بالطبع|اكد|اكدها|نأكد|ناكد|اكدوها|ناكدو|نأكدو|تاكد|عندي|نحبها|ديرها|بعثها|ابعثها|c bon|d.?accord|موافق|وافقت)( |$)/,
  negate: /^(لا|لالا|non|no|ماشي|la)( |$)/,
  thanks: /(صحيت|يعطيك الصحه|شكرا|merci|بارك الله)/,
};

export function detect(text) {
  const t = normSpeech(text);
  const has = (k) => R[k].test(t);
  const intents = new Set();
  if (has('botQ')) intents.add('botQ');
  if (has('human')) intents.add('human');
  if (has('dnc')) intents.add('dnc');
  else if (has('cancel')) intents.add('cancel');
  if (has('callback') && !intents.has('dnc')) intents.add('callback');
  if (has('think')) intents.add('think');
  if (has('address')) intents.add('address');
  if (has('track')) intents.add('track');
  if (has('affirm')) intents.add('affirm');
  if (has('negate') && !has('affirm')) intents.add('negate');
  if (has('thanks')) intents.add('thanks');
  const ref = t.match(/zn ?-?(\d{3,6})/) || t.match(/(?:^| )(\d{4,6})(?: |$)/);
  const digits = t.replace(/\D/g, '');
  return { t, intents, orderRef: ref ? `ZN${ref[1]}` : null, last4: digits.length >= 4 ? digits.slice(-4) : null, wilaya: findWilaya(text) };
}

// "عيطلي على 3" / "الساعة 5 العشية" / "بعد ساعة" / "غدوة الصباح" → Date بتوقيت الجزائر
const HOUR_WORDS = [[/(الواحده|الوحده|واحده)/, 1], [/(الجوج|جوج|زوج|الزوج|الثنين)/, 2], [/(الثلاثه|ثلاثه|التلاته|تلاته)/, 3], [/(الربعه|ربعه|الاربعه|اربعه)/, 4],
  [/(الخمسه|خمسه)/, 5], [/(السته|سته)/, 6], [/(السبعه|سبعه)/, 7], [/(الثمنيه|ثمنيه|الثمانيه|ثمانيه|التمنيه)/, 8], [/(التسعه|تسعه)/, 9], [/(العشره|عشره)/, 10],
  [/(الحداش|حداش|الحاداش)/, 11], [/(الثناش|ثناش|الطناش|طناش|الاطناش)/, 12]];
export function parseCallbackTime(text, now, tz = 'Africa/Algiers') {
  let t = normSpeech(text);
  for (const [re, n] of HOUR_WORDS) t = t.replace(re, ` ${n} `);
  t = t.replace(/\s+/g, ' ').replace(/و ?(نص|النص)/, ':30').replace(/ :30/, ':30');
  if (/بعد ساعتين/.test(t)) return new Date(now.getTime() + 120 * 60000);
  if (/بعد (ساعه|وحده)/.test(t)) return new Date(now.getTime() + 60 * 60000);
  const mm = t.match(/بعد (\d{1,3}) ?(دقيقه|دقايق|min)/);
  if (mm) return new Date(now.getTime() + Number(mm[1]) * 60000);
  const today = localParts(now, tz).day;
  const day = /غدوه|demain/.test(t) ? addDays(today, 1) : today;
  const h = t.match(/(?:الساعه|علي|على|مع|في|vers) ?(\d{1,2})(?:[:h ](\d{2}))?/);
  if (h) {
    let hour = Number(h[1]);
    const evening = /العشيه|الليل|المسا|soir/.test(t);
    if (hour <= 12 && (evening || hour < 8)) hour = hour === 12 ? 12 : hour + 12;
    if (hour > 23) return null;
    return zonedToDate(day, `${String(hour).padStart(2, '0')}:${h[2] || '00'}`, tz);
  }
  if (/العشيه|المسا/.test(t)) return zonedToDate(day, '14:00', tz);
  if (/الصباح|matin/.test(t)) return zonedToDate(day, '10:00', tz);
  if (/الليل|soir/.test(t)) return zonedToDate(day, '18:00', tz);
  if (day !== today) return zonedToDate(day, '10:00', tz);
  return null;
}

const money = (n) => `${Math.round(Number(n))} دينار`; // أرقام بلا فواصل باش يقراها الصوت مليح
export function summarySentence(o, items) {
  const w = wilayaByCode(o.wilaya_code);
  const its = items.map((i) => `${i.name}، ${i.qty === 1 ? 'حبة وحدة' : `${i.qty} حبات`} بـ ${money(i.unit_price * i.qty)}`).join('، و');
  const where = [o.commune, w?.ar].filter(Boolean).join('، ');
  return `عندك ${its}. التوصيل ${o.delivery_method === 'desk' ? 'للمكتب' : 'للدار'}${where ? ` في ${where}` : ''} بـ ${money(o.delivery_fee)}. المجموع ${money(o.total)} تخلّصهم عند الاستلام. نأكدولك الكوموند؟`;
}
const STATUS_SPEECH = {
  awaiting_confirmation: 'مازال تستنى التأكيد', needs_review: 'مازال تستنى التأكيد', confirmed: 'مأكدة وراح تتبعث قريب', dispatching: 'راهي تتبعث',
  shipped: 'راهي مع شركة التوصيل', out_for_delivery: 'خرجت مع الليفرور وراح توصلك اليوم', delivery_failed: 'الليفرور ما قدرش يوصلك، راح نعاودو نبرمجوها',
  delivered: 'تسلّمت', returning: 'راهي راجعة', returned: 'رجعت للمخزن', cancelled: 'ملغاة',
};

const say = (text) => ({ type: 'say', text });
const reply = (texts, { end = false, outcome = null, play = null } = {}) => ({
  actions: [...(play ? [{ type: 'play', media_id: play }] : []), ...[].concat(texts).filter(Boolean).map(say)], end, outcome,
});

/** بداية المكالمة: المقدّمة المسجّلة (مرة وحدة) + الافتتاحية */
export function start(call, ops) {
  const s = getSetting('calls');
  const st = call.state;
  if (call.direction === 'out') {
    st.order_id = call.order_id;
    st.verified = true;
    st.step = 'opening';
    return reply(s.scripts.outbound_opening, { play: s.intros.outbound_media_id });
  }
  const own = ops.findOrdersByPhone(call.phone);
  st.step = 'identify';
  if (own.length === 1) { st.order_id = own[0].id; st.verified = true; }
  st.candidates = own.map((o) => o.id);
  return reply(s.scripts.inbound_opening, { play: s.intros.inbound_media_id });
}

/** دور واحد في الحوار */
export async function turn(call, text, ops, now = new Date()) {
  const st = call.state;
  const d = detect(text);
  const I = d.intents;
  const order = st.order_id ? ops.getOrder(st.order_id) : null;

  if (!String(text || '').trim()) {
    st.silence = (st.silence || 0) + 1;
    if (st.silence >= 2) return finishReview(call, ops, 'الزبون ما هدرش', 'ما سمعتكش. راح نعاودو نتصلو بيك. بالسلامة.');
    return reply('ألو؟ راك تسمعني؟');
  }
  st.silence = 0;

  // أسئلة في أي وقت
  if (I.has('botQ')) return reply(['أنا مساعد آلي تاع متجر Zinor، ماشي بنادم.', 'إذا تحب نحوّلك لواحد من الفريق قولّي.', st.step === 'confirm' ? 'نأكدولك الكوموند؟' : '']);
  if (I.has('human')) { ops.handoff(order, call, 'الزبون طلب يهدر مع موظف'); return reply('مليح، راح نبلّغ واحد من الفريق يعاود يتصل بيك في أقرب وقت. بالسلامة.', { end: true, outcome: 'human' }); }
  if (I.has('dnc') && order) { ops.doNotCall(order, call); return reply('سمحلنا على الإزعاج، ما راحش نعاودو نعيطولك. بالسلامة.', { end: true, outcome: 'do_not_call' }); }

  // ── التعرّف على الكوموند (مكالمة واردة) ──
  if (call.direction === 'in' && !st.verified) return identify(call, d, ops);

  if (!order) return reply('ما لقيتش كوموند. واحد من الفريق راح يتصل بيك. بالسلامة.', { end: true, outcome: 'no_order' });

  switch (st.step) {
    case 'callback_time': return callbackTime(call, order, text, ops, now);
    case 'cancel_confirm':
      if (I.has('affirm') || I.has('cancel')) return doCancel(call, order, ops);
      if (I.has('negate')) { st.step = 'menu'; return reply('مليح، الكوموند باقية. كاين حاجة أخرى؟'); }
      return unclear(call, ops, 'تحب نلغيوها؟ قول إيه ولا لا.');
    case 'ask_commune': return askCommune(call, order, text, d, ops);
    case 'ask_address': return askAddress(call, order, text, d, ops);
    case 'confirm_new':
      if (I.has('affirm')) {
        ops.applyAddress(order, st.pending); delete st.pending;
        const updated = ops.getOrder(order.id);
        st.summary_total = updated.total; // الزبون سمع المجموع الجديد ووافق عليه
        return confirmNow(call, updated, ops, text);
      }
      if (I.has('negate')) { st.step = 'ask_commune'; return reply('سمحلي. قولّي البلدية والولاية من جديد.'); }
      return unclear(call, ops, 'نأكدو بالمجموع الجديد؟');
    case 'ask_name': {
      const name = String(text).replace(/(اسمي|سميتي|انا|je m.?appelle)/g, '').trim();
      if (name.length < 2) return unclear(call, ops, 'واش هو اسمك ولقبك؟');
      ops.setName(order, name);
      return confirmNow(call, ops.getOrder(order.id), ops, st.consent_words || text);
    }
  }

  // ── نوايا عامة (بعد التعرّف) ──
  if (I.has('cancel')) {
    if (['shipped', 'out_for_delivery', 'dispatching', 'delivery_failed'].includes(order.status)) {
      ops.handoff(order, call, 'الزبون حب يلغي كوموند راهي مبعوثة');
      return reply('الكوموند راهي مع شركة التوصيل، ما نقدرش نلغيها من هنا. بلّغت الفريق باش يتصرّفو، وإذا وصلك الليفرور تقدر ترفض الطرد. بالسلامة.', { end: true, outcome: 'cancel_requested' });
    }
    if (['awaiting_confirmation', 'needs_review', 'confirmed', 'new'].includes(order.status)) {
      if (st.step === 'confirm' || call.direction === 'in') { st.step = 'cancel_confirm'; return reply('تحب نلغيو الكوموند؟'); }
      return doCancel(call, order, ops);
    }
    return reply(`الكوموند ${STATUS_SPEECH[order.status] || ''}.`);
  }
  if (I.has('dnc')) { ops.doNotCall(order, call); return reply('مليح، ما راحش نعاودو نعيطولك. بالسلامة.', { end: true, outcome: 'do_not_call' }); }
  if (I.has('callback') && !I.has('affirm')) return askCallback(call, order, text, ops, now);
  if (I.has('think')) return finishReview(call, ops, 'الزبون قال خليني نخمم', 'ماشي مشكل، خمّم على راحتك. تقدر تأكد في واتساب ولا تعيطلنا. بالسلامة.', 'think');
  if (I.has('address')) {
    if (!['awaiting_confirmation', 'needs_review', 'confirmed', 'new'].includes(order.status)) {
      ops.handoff(order, call, 'الزبون حب يبدّل العنوان بعد الإرسال');
      return reply('الكوموند تبعثت، تبديل العنوان يلزمو الفريق. بلّغتهم وراح يتصلو بيك. بالسلامة.', { end: true, outcome: 'address_change_requested' });
    }
    st.step = 'ask_commune';
    return reply('مليح. قولّي البلدية والولاية الجداد.');
  }
  if (I.has('track')) {
    const s = STATUS_SPEECH[order.status] || 'راهي في المعالجة';
    return reply([`الكوموند تاعك ${s}.`, order.tracking && ['shipped', 'out_for_delivery'].includes(order.status) ? 'رقم التتبع راهو عندك في واتساب.' : '', 'كاين حاجة أخرى؟']);
  }

  // تأكيد / جواب على سؤال
  if (st.step === 'opening') {
    if (I.has('negate')) return askCallback(call, order, text, ops, now);
    if (I.has('affirm')) return readSummary(call, order, ops);
    return unclear(call, ops, 'عندك دقيقة باش نأكدو الكوموند؟');
  }
  if (st.step === 'confirm') {
    if (I.has('affirm')) return confirmNow(call, order, ops, text);
    if (I.has('negate')) { st.step = 'menu'; return reply('واش تحب تبدّل؟ العنوان، ولا تحب نلغيوها، ولا نعيطولك من بعد؟'); }
    return unclear(call, ops, 'نأكدولك الكوموند؟ قول إيه ولا لا.');
  }
  // menu (واردة ولا بعد سؤال)
  if (I.has('affirm') && ['awaiting_confirmation', 'needs_review', 'new'].includes(order.status)) {
    return st.summary_total === order.total ? confirmNow(call, order, ops, text) : readSummary(call, order, ops);
  }
  if (I.has('thanks') || (I.has('negate') && st.step === 'menu')) return reply('بالسلامة، نهارك مبروك.', { end: true, outcome: st.outcome_hint || 'info' });
  if (call.direction === 'in' && ['awaiting_confirmation', 'needs_review', 'new'].includes(order.status) && !st.summary_total) {
    st.step = 'confirm';
    st.summary_total = order.total;
    return reply(['لقيت الكوموند تاعك.', summarySentence(order, ops.items(order.id))]);
  }
  return unclear(call, ops, 'تحب تأكد، تلغي، تبدّل العنوان، ولا تعرف وين راهي الكوموند؟');
}

function identify(call, d, ops) {
  const st = call.state;
  if (st.step === 'verify' && st.pending_order_id) {
    const o = ops.getOrder(st.pending_order_id);
    const phoneLast4 = String(o.phone || '').replace(/\D/g, '').slice(-4);
    if (d.last4 && d.last4 === phoneLast4) { st.order_id = o.id; st.verified = true; st.step = 'menu'; return reply('شكراً، تأكدت. كيفاش نقدر نعاونك في الكوموند؟'); }
    st.verify_fail = (st.verify_fail || 0) + 1;
    if (st.verify_fail >= 2) { ops.handoff(null, call, `فشل التحقق من الكوموند ${o.number}`); return reply('ما قدرتش نتأكد. واحد من الفريق راح يتصل بيك. بالسلامة.', { end: true, outcome: 'unverified' }); }
    return reply('ماشي هاذي. عاود قولّي آخر أربعة أرقام تاع التيليفون اللي درت بيه الكوموند.');
  }
  if (d.orderRef) {
    const o = ops.orderByNumber(d.orderRef);
    if (!o) return reply('ما لقيتش كوموند بهاذ الرقم. عاود قولّي رقم الكوموند، يبدا بـ ZN.');
    if (ops.samePhone(o, call.phone)) { st.order_id = o.id; st.verified = true; st.step = 'menu'; return reply('لقيتها. كيفاش نقدر نعاونك؟'); }
    st.pending_order_id = o.id; st.step = 'verify';
    return reply('باش نتأكد، قولّي آخر أربعة أرقام تاع التيليفون اللي درت بيه الكوموند.');
  }
  if (!st.candidates?.length) { st.step = 'ask_ref'; return reply('ما لقيتش كوموند بهاذ الرقم. قولّي رقم الكوموند، يبدا بـ ZN.'); }
  st.step = 'ask_ref';
  return reply('عندك أكثر من كوموند. قولّي رقم الكوموند اللي تحب عليها، يبدا بـ ZN.');
}

function readSummary(call, order, ops) {
  call.state.step = 'confirm';
  call.state.summary_total = order.total;
  return reply(summarySentence(order, ops.items(order.id)));
}

async function confirmNow(call, order, ops, words) {
  const st = call.state;
  // المجموع لازم يكون اللي سمعو
  if (st.summary_total !== order.total) return readSummary(call, order, ops);
  st.consent_words = words;
  const missing = ops.missing(order);
  if (missing.includes('commune')) { st.step = 'ask_commune'; st.confirm_after = true; return reply('باش نكمّلو، واش هي البلدية؟'); }
  if (missing.includes('address')) { st.step = 'ask_address'; st.confirm_after = true; return reply('وواش هو العنوان بالضبط؟'); }
  if (missing.includes('customer_name')) { st.step = 'ask_name'; return reply('واش هو اسمك ولقبك؟'); }
  const r = await ops.confirm(order, call, words);
  st.step = 'done';
  if (!r.ok) return finishReview(call, ops, r.error || 'التأكيد ما كملش', 'سجّلت التأكيد تاعك، واحد من الفريق راح يكمّل الكوموند. بالسلامة.', 'review');
  return reply(`تم، الكوموند تأكدت${r.already ? ' من قبل' : ''} وراح تتبعث. توصلك رسالة فيها رقم التتبع. يعطيك الصحة، بالسلامة.`, { end: true, outcome: 'confirmed' });
}

function askCommune(call, order, text, d, ops) {
  const st = call.state;
  const w = d.wilaya || wilayaByCode(order.wilaya_code);
  let commune = String(text).replace(/(البلديه|البلدية|بلدية|بلديه|الولايه|الولاية|ولاية|ولايه|راني في|نسكن في|في|commune|wilaya)/g, ' ');
  if (d.wilaya) for (const n of [d.wilaya.ar, d.wilaya.fr, ...d.wilaya.aliases]) commune = commune.replace(new RegExp(n, 'gi'), ' ');
  commune = commune.replace(/^(لا|ماشي)\s+/, '').replace(/\s+/g, ' ').trim();
  if (!commune || commune.length < 2) return unclear(call, ops, 'ما فهمتش البلدية. عاود قولّها من فضلك.');
  st.pending = { ...(st.pending || {}), wilaya_code: w?.code ?? order.wilaya_code, commune };
  st.step = 'ask_address';
  return reply(`${commune}${w ? `، ولاية ${w.ar}` : ''}. والعنوان بالضبط؟`);
}

function askAddress(call, order, text, d, ops) {
  const st = call.state;
  const address = String(text).replace(/^(العنوان|عنواني|adresse)\s*/i, '').replace(/^(لا|ماشي)\s+/, '').trim();
  if (address.length < 3) return unclear(call, ops, 'ما فهمتش العنوان. عاود قولو من فضلك.');
  st.pending = { ...(st.pending || {}), address, wilaya_code: st.pending?.wilaya_code ?? order.wilaya_code, commune: st.pending?.commune ?? order.commune };
  const p = ops.previewAddress(order, st.pending);
  if (!p.ok) return finishReview(call, ops, p.error, 'التوصيل لهاذ البلاصة يحتاج الفريق يشوفو. راح يتصلو بيك. بالسلامة.', 'review');
  const w = wilayaByCode(st.pending.wilaya_code);
  st.step = 'confirm_new';
  const changed = p.total !== order.total;
  return reply(`إذن التوصيل لـ ${st.pending.commune}، ${w?.ar || ''}، ${address}. ${changed ? `التوصيل ولّى ${money(p.fee)} والمجموع الجديد ${money(p.total)}.` : `المجموع يبقى ${money(p.total)}.`} نأكدو؟`);
}

function askCallback(call, order, text, ops, now) {
  const when = parseCallbackTime(text, now);
  if (when) return callbackTime(call, order, text, ops, now, when);
  call.state.step = 'callback_time';
  return reply('ماشي مشكل. وقتاش يناسبك نعاودو نعيطولك؟');
}
function callbackTime(call, order, text, ops, now, when = parseCallbackTime(text, now)) {
  const st = call.state;
  if (!when && !st.asked_time_once) { st.asked_time_once = true; return reply('ما فهمتش الوقت. قولّي مثلاً: الساعة خمسة العشية، ولا غدوة الصباح.'); }
  const at = ops.scheduleCallback(order, call, when);
  return reply(`مليح، نعاودو نعيطولك ${at.label}. بالسلامة.`, { end: true, outcome: 'callback' });
}

function doCancel(call, order, ops) {
  ops.cancel(order, call);
  return reply('مليح، لغيت الكوموند. إذا بدّلت رأيك راحنا هنا. بالسلامة.', { end: true, outcome: 'cancelled' });
}

function unclear(call, ops, question) {
  const st = call.state;
  st.unclear = (st.unclear || 0) + 1;
  if (st.unclear >= 3) return finishReview(call, ops, 'كلام غير واضح', 'سمحلي، ما قدرتش نفهمك مليح. واحد من الفريق راح يعاود يتصل بيك. بالسلامة.', 'unclear');
  return reply(st.unclear === 1 ? question : `سمحلي ما فهمتكش. ${question}`);
}
function finishReview(call, ops, reason, text, outcome = 'review') {
  const order = call.state.order_id ? ops.getOrder(call.state.order_id) : null;
  if (order) ops.review(order, call, reason);
  return reply(text, { end: true, outcome });
}

export { nextSlot };
