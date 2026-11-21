// المحرّك المحلي (بلا مفتاح ذكاء اصطناعي): يفهم الدارجة بقواعد ويستعمل نفس الأدوات تاع Claude.
// الهدف: تجربة المسار كامل بلا مفاتيح. في الإنتاج يُفضّل Claude.
import { parse, nameFromFreeText } from './darija.js';
import { executeTool, draftView, summaryCurrent, consentValid, ownOrders } from './tools.js';
import { searchProducts } from '../services/catalog.js';
import { getSetting } from '../services/settings.js';
import { db } from '../db.js';
import { classifyReason } from '../services/returns.js';

const pickV = (arr, n) => arr[n % arr.length];
const J = { ar: ' و', latn: ' w ', fr: ' et ' };
const SEP = { ar: '، ', latn: ', ', fr: ', ' };

const P = {
  greet: { ar: ['أهلا بيك 👋', 'مرحبا بيك', 'سلام، مرحبا 👋'], latn: ['Salam, mar7ba bik 👋', 'Ahlan 👋', 'Mar7ba bik'], fr: ['Bonjour 👋', 'Bonjour, bienvenue 👋'] },
  help: { ar: 'واش نقدر نعاونك؟ تقدر تسقسي على المنتجات، الأسعار والتوصيل.', latn: 'Kifach n9der n3awnek? Sa9si 3la les produits, les prix wela la livraison.', fr: 'Comment puis-je vous aider ? Produits, prix, livraison…' },
  bot: { ar: 'إيه، أنا مساعد آلي تاع {store} 🤖 نقدر نعاونك في الطلبات والتوصيل، وإذا تحب نحوّلك لواحد من الفريق.', latn: 'Ih, ana assistant automatique (bot) ta3 {store} 🤖 N9der n3awnek f les commandes w la livraison, w ila t7eb nhawlek l wa7ed men l\'équipe.', fr: 'Oui, je suis l\'assistant automatique de {store} 🤖 Je peux vous aider pour les commandes et la livraison, ou vous passer un membre de l\'équipe.' },
  handoff: { ar: 'مليح، حوّلت المحادثة لواحد من الفريق، يجاوبك في أقرب وقت 🙏', latn: 'Mlih, 7awelt la conversation l wa7ed men l\'équipe, yjawbek 9rib 🙏', fr: 'Très bien, je transfère la conversation à un membre de l\'équipe, il vous répond rapidement 🙏' },
  quote: { ar: 'التوصيل لـ{w}: للدار {home} دج ({hd} سا)، للمكتب {desk} دج ({dd} سا).', latn: 'Livraison l {w}: l dar {home} DA ({hd}h), l bureau (stop desk) {desk} DA ({dd}h).', fr: 'Livraison vers {w} : à domicile {home} DA ({hd}h), au bureau (stop desk) {desk} DA ({dd}h).' },
  quoteHome: { ar: 'التوصيل لـ{w} للدار بـ {home} دج ({hd} سا).', latn: 'Livraison l {w} l dar b {home} DA ({hd}h).', fr: 'Livraison vers {w} à domicile : {home} DA ({hd}h).' },
  noDelivery: { ar: 'سمحلنا، التوصيل لـ{w} ماهوش متوفر حالياً.', latn: 'Smahlna, la livraison l {w} ma kaynach drk.', fr: 'Désolé, la livraison vers {w} n\'est pas disponible pour le moment.' },
  price: { ar: '{p} بـ {price} دج.', latn: '{p} b {price} DA.', fr: '{p} : {price} DA.' },
  oos: { ar: '{p} ماكانش في المخزون حالياً 😕', latn: '{p} ma kaynch f stock drk 😕', fr: '{p} est en rupture de stock pour le moment 😕' },
  totals: { ar: 'المجموع: للدار {th} دج، للمكتب {td} دج.', latn: 'Total: l dar {th} DA, l bureau {td} DA.', fr: 'Total : {th} DA à domicile, {td} DA au bureau.' },
  askMethod: { ar: 'تحب التوصيل للدار ولا للمكتب؟', latn: 'T7eb livraison l dar wela l bureau?', fr: 'Vous préférez à domicile ou au bureau ?' },
  askWilaya: { ar: 'لأي ولاية؟', latn: 'L ay wilaya?', fr: 'Pour quelle wilaya ?' },
  askProduct: { ar: 'واش من منتج حاب؟ عندنا: {list}', latn: 'Ach men produit t7eb? 3andna: {list}', fr: 'Quel produit vous intéresse ? Nous avons : {list}' },
  askConfirm: { ar: ['نأكدلك الكوموند؟', 'نسجّلهالك؟'], latn: ['Nconfirmilek la commande?', 'Ndirhalek?'], fr: ['Je confirme la commande ?', 'Je la valide ?'] },
  askMissing: { ar: 'باش نكمّلو، عطيني {list}.', latn: 'Bach nkemlou, 3tini {list}.', fr: 'Pour finaliser, il me faut {list}.' },
  okConsent: { ar: 'مليح ✅', latn: 'Mlih ✅', fr: 'Parfait ✅' },
  saved: { ar: 'سجّلت معلوماتك 👍 تحب نديرلك الكوموند؟', latn: 'Sjelt les infos 👍 T7eb ndirlek la commande?', fr: 'C\'est noté 👍 Voulez-vous passer la commande ?' },
  notUnderstood: { ar: 'ما فهمتكش مليح 🙏 تقدر تعاود بطريقة أخرى؟', latn: 'Ma fhemtekch mlih 🙏 3awed b tari9a okhra?', fr: 'Je n\'ai pas bien compris 🙏 Pouvez-vous reformuler ?' },
  track: { ar: 'كوموندك {n}: {s}{t}', latn: 'La commande {n}: {s}{t}', fr: 'Votre commande {n} : {s}{t}' },
  trackNone: { ar: 'ما لقيتش كوموند مربوطة برقمك 🤔 إذا عندك رقم الكوموند ابعثهولي.', latn: 'Ma l9itch commande 3la numerok 🤔 Ab3atli numero ta3 la commande.', fr: 'Je ne trouve pas de commande liée à votre numéro 🤔 Envoyez-moi le numéro de commande.' },
  retReason: { ar: 'سمحلنا على الإزعاج 🙏 واش هو المشكل مع المنتج؟', latn: 'Smahlna 🙏 Wach howa l mochkil m3a l produit?', fr: 'Désolé pour ce souci 🙏 Quel est le problème avec le produit ?' },
  retReview: { ar: 'سجّلت طلب الروتور تاع {n}. واحد من الفريق راح يراجعو ويجاوبك.', latn: 'Sjelt la demande de retour ta3 {n}. Wa7ed men l\'équipe ychoufha w yjawbek.', fr: 'J\'ai enregistré la demande de retour pour {n}. Un membre de l\'équipe va l\'examiner.' },
  retExisting: { ar: 'طلب الروتور تاع {n} راهو مسجّل ({s}).', latn: 'La demande de retour ta3 {n} rahi msajla ({s}).', fr: 'La demande de retour pour {n} est déjà enregistrée ({s}).' },
  retNotDelivered: { ar: 'كوموندك {n} مازال ما تسلّمتش ({s}). الروتور يكون بعد الاستلام؛ إذا ما تحبهاش تقدر تقول للّيفرور.', latn: 'La commande {n} mazal ma tsalmatch ({s}). Le retour ykoun ba3d l\'istilam.', fr: 'La commande {n} n\'est pas encore livrée ({s}). Un retour se fait après réception.' },
  cancel: { ar: 'مليح، لغيت الكوموند. إذا تحتاج حاجة راني هنا.', latn: 'Mlih, annulit la commande. Ila t7taj 7aja rani hna.', fr: 'D\'accord, commande annulée. Je reste disponible.' },
  thanks: { ar: 'بالصحة 🙏 إذا تحتاج حاجة أخرى راني هنا.', latn: 'B sa7a 🙏 Ila t7taj 7aja okhra rani hna.', fr: 'Avec plaisir 🙏' },
  editAsk: { ar: 'واش تحب تبدّل؟ (الولاية، البلدية، العنوان، للدار/للمكتب، الكمية، الرقم)', latn: 'Wach t7eb tbadel? (wilaya, commune, adresse, dar/bureau, quantité, numero)', fr: 'Que souhaitez-vous modifier ? (wilaya, commune, adresse, domicile/bureau, quantité, numéro)' },
  edited: { ar: 'بدّلتها ✅ شوف الملخّص الجديد وأكّد.', latn: 'Badaltha ✅ Chouf le nouveau résumé w confirmi.', fr: 'C\'est modifié ✅ Vérifiez le nouveau récapitulatif et confirmez.' },
};
const FIELD = {
  product: { ar: 'المنتج', latn: 'le produit', fr: 'le produit' },
  wilaya: { ar: 'الولاية', latn: 'la wilaya', fr: 'la wilaya' },
  delivery_method: { ar: 'للدار ولا للمكتب', latn: 'l dar wela l bureau', fr: 'domicile ou bureau' },
  commune: { ar: 'البلدية', latn: 'la commune', fr: 'la commune' },
  address: { ar: 'العنوان', latn: 'l\'adresse', fr: 'l\'adresse' },
  stopdesk: { ar: 'المكتب اللي تستلم منو ({desks})', latn: 'l bureau li tesstalem menou ({desks})', fr: 'le bureau de retrait ({desks})' },
  customer_name: { ar: 'الاسم واللقب', latn: 'smitek (nom w prénom)', fr: 'votre nom complet' },
  phone: { ar: 'رقم الهاتف تاع التوصيل (ولا نخدمو برقم الواتساب هذا؟)', latn: 'numero ta3 livraison (wela nesta3mlou numero WhatsApp hada?)', fr: 'le numéro pour la livraison (ou ce numéro WhatsApp ?)' },
};
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

export async function mockBrain(ctx, text) {
  const { conv } = ctx;
  const lang = ctx.lang;
  const turn = (conv.state.turn = (conv.state.turn || 0) + 1);
  const say = (key, vars = {}) => fill(Array.isArray(P[key][lang]) ? pickV(P[key][lang], turn) : P[key][lang], vars);
  const out = [];
  const tool = (n, i) => executeTool(ctx, n, i);

  const products = searchProducts(text);
  const nlu = parse(text, { products, waPhone: conv.wa_phone });
  const I = nlu.intents;
  const store = getSetting('store').name;
  const firstContact = !db.get("SELECT 1 FROM messages WHERE conversation_id=? AND direction='out' LIMIT 1", conv.id);
  if (I.has('greet') && (firstContact || turn % 4 === 1)) out.push(pickV(P.greet[lang], turn));

  if (I.has('botQ')) { out.push(say('bot', { store })); return out; }
  if (I.has('human')) { await tool('handoff_to_human', { reason: 'الزبون طلب يهدر مع موظف' }); out.push(say('handoff')); return out; }

  // تعديل طلب جاي من متجر
  if (conv.state.editing_order_id) {
    const f = editFields(nlu, conv);
    if (Object.keys(f).length) { await tool('edit_pending_order', f); out.push(say('edited')); }
    else out.push(say('editAsk'));
    return out;
  }

  // الروتور
  if (I.has('ret') || conv.state.awaiting === 'return_reason') {
    const hasReason = conv.state.awaiting === 'return_reason' || classifyReason(text) !== 'other';
    const delivered = ownOrders(conv).find((o) => o.status === 'delivered');
    if (!hasReason && !nlu.orderNumber && delivered) { conv.state.awaiting = 'return_reason'; out.push(say('retReason')); return out; }
    delete conv.state.awaiting;
    const r = await tool('request_return', { order_number: nlu.orderNumber, reason: text });
    if (r.error === 'not_delivered') out.push(say('retNotDelivered', { n: r.order, s: r.status }));
    else if (r.error) out.push(say('trackNone'));
    else if (r.existing) out.push(say('retExisting', { n: r.order, s: r.return_status }));
    else if (!r.auto_accepted) out.push(say('retReview', { n: r.order }));
    return out; // القبول التلقائي يبعث رسالتو وحدو
  }

  if (I.has('track') && !I.has('buy')) {
    const r = await tool('track_order', { order_number: nlu.orderNumber });
    if (!r.found) out.push(say('trackNone'));
    else for (const o of r.orders.slice(0, 2)) out.push(say('track', { n: o.number, s: o.status, t: o.tracking ? ` — ${lang === 'ar' ? 'رقم التتبع' : 'tracking'}: ${o.tracking}` : '' }));
    return out;
  }

  if (I.has('cancel') && conv.state.draft) { await tool('cancel_draft', {}); out.push(say('cancel')); return out; }

  // ── جمع المعلومات (حتى إذا غير يسقسي — التسجيل ما يخلقش كوموند) ──
  const before = draftView(conv);
  const f = {};
  if (nlu.product) { f.product_id = nlu.product.id; if (nlu.qty) f.qty = nlu.qty; }
  else if (nlu.qty && before.items.length === 1) f.qty = nlu.qty;
  if (nlu.wilaya) f.wilaya = String(nlu.wilaya.code);
  if (nlu.method) f.delivery_method = nlu.method;
  if (nlu.commune) f.commune = nlu.commune;
  if (nlu.address) f.address = nlu.address;
  if (nlu.name) f.customer_name = nlu.name;
  if (nlu.phone) { if (I.has('useWa')) f.use_whatsapp_number = true; else f.phone = nlu.phone; }
  else if (I.has('useWa')) f.use_whatsapp_number = true;
  const desk = (before.delivery_method === 'desk' || nlu.method === 'desk') && !nlu.address ? matchStopdesk(text, { ...before, wilaya: nlu.wilaya || before.wilaya }) : null;
  if (desk) f.stopdesk_id = desk.id;
  // جواب على سؤال سابق (اسم/بلدية/عنوان) بلا كلمات مفتاحية
  const asked = conv.state.asked || [];
  if (asked.includes('customer_name') && !f.customer_name && !I.has('price') && !I.has('affirm')) {
    const nm = nameFromFreeText(text); if (nm && !nlu.wilaya) f.customer_name = nm;
  }
  const unparsed = !Object.keys(f).length && !I.size;
  if (unparsed && asked.length === 1 && asked[0] === 'commune') f.commune = text.trim();
  if (unparsed && asked.length === 1 && asked[0] === 'address') f.address = text.trim();
  if (unparsed && asked.includes('commune') && asked.includes('address') && text.includes(',')) {
    const [c, ...a] = text.split(','); f.commune = c.trim(); f.address = a.join(',').trim();
  }
  if (Object.keys(f).length) await tool('update_order_draft', f);
  const v = draftView(conv);
  const gaveOnlyContact = (f.customer_name || f.phone || f.use_whatsapp_number) && !f.product_id && !f.wilaya && !f.delivery_method;

  // ── الموافقة على الشراء ──
  let justConsented = false;
  if ((I.has('affirm') || I.has('buy')) && !I.has('negate') && summaryCurrent(conv) && !consentValid(conv) && !I.has('price')) {
    const r = await tool('record_purchase_consent', { customer_words: text });
    justConsented = !!r.recorded;
  }

  if (consentValid(conv)) {
    const missing = v.missing;
    if (!missing.length) return out; // الخادم يبعث الكوموند ويرسل التأكيد مع رقم التتبع
    conv.state.asked = missing;
    out.push((justConsented ? say('okConsent') + ' ' : '') + askMissing(missing, v, lang, say));
    return out;
  }

  // ── أسئلة الأسعار والتوصيل ──
  const answered = [];
  if (nlu.product && (I.has('price') || !I.has('buy'))) {
    const p = nlu.product;
    answered.push(p.stock > 0 ? say('price', { p: lang === 'ar' ? p.name : p.name_fr || p.name, price: p.price }) : say('oos', { p: lang === 'ar' ? p.name : p.name_fr || p.name }));
  }
  if (v.wilaya && (I.has('delivery') || I.has('price') || f.wilaya) && !summaryNeeded(v)) {
    const r = await tool('get_delivery_quote', { wilaya: String(v.wilaya.code) });
    const wn = lang === 'ar' ? v.wilaya.ar : v.wilaya.fr;
    // ما نعاودوش نفس سعر التوصيل إذا قلناه من قبل وما سقساش عليه
    const alreadyQuoted = conv.state.quoted === v.wilaya.code && !I.has('delivery') && !f.wilaya;
    conv.state.quoted = v.wilaya.code;
    if (r.available === false || r.error) answered.push(say('noDelivery', { w: wn }));
    else if (r.home && r.desk) {
      if (!alreadyQuoted) answered.push(say('quote', { w: wn, home: r.home.price, desk: r.desk.price, hd: r.home.days, dd: r.desk.days }));
      if (v.items.length) answered.push(say('totals', { th: v.items_total + r.home.price, td: v.items_total + r.desk.price }));
    } else if (r.home) answered.push(say('quoteHome', { w: wn, home: r.home.price, hd: r.home.days }));
  } else if ((I.has('delivery') || I.has('price')) && !v.wilaya && !nlu.product) {
    answered.push(say('askWilaya'));
  }
  out.push(...answered);

  // ── ملخّص الطلب كي تكون الأساسيات كاملة وكاين نيّة شراء ──
  const wantsToBuy = I.has('buy') || (I.has('affirm') && before.items.length > 0) || (f.delivery_method && v.items.length && v.wilaya);
  if (summaryNeeded(v) && wantsToBuy && !summaryCurrent(conv)) {
    const r = await tool('show_order_summary', {});
    if (r.sent) { out.push(say('askConfirm')); conv.state.asked = []; return out; }
    if (r.error === 'out_of_stock') { out.push(say('oos', { p: r.items.join('، ') })); return out; }
  }
  if (summaryCurrent(conv) && !justConsented && (I.has('buy') || I.has('affirm'))) { out.push(say('askConfirm')); return out; }

  if (wantsToBuy && !summaryNeeded(v)) {
    const basics = ['product', 'wilaya', 'delivery_method'].filter((x) => v.missing.includes(x));
    if (basics[0] === 'product') out.push(say('askProduct', { list: productList(lang) }));
    else if (basics[0] === 'wilaya') out.push(say('askWilaya'));
    else if (basics[0] === 'delivery_method') out.push(say('askMethod'));
    return out;
  }
  if (v.wilaya && v.items.length && !v.delivery_method && answered.length) { out.push(say('askMethod')); return out; }
  if (gaveOnlyContact) { out.push(say('saved')); return out; }
  if (/merci|saha|ya3tik|يعطيك الصحة|شكرا|baraka/i.test(text) && !out.length) { out.push(say('thanks')); return out; }
  if (!out.length || (out.length === 1 && I.has('greet') && I.size === 1)) {
    if (I.has('greet')) out.push(say('help'));
    else { conv.state.misses = (conv.state.misses || 0) + 1; out.push(say('notUnderstood')); }
    if (conv.state.misses >= 3) { await tool('handoff_to_human', { reason: 'المساعد ما فهمش الزبون 3 مرات' }); out.push(say('handoff')); conv.state.misses = 0; }
  }
  return out;
}

const summaryNeeded = (v) => v.items.length && v.wilaya && v.delivery_method;

function askMissing(missing, v, lang, say) {
  const desks = v.stopdesks.map((s) => s.name).join(' / ');
  const parts = missing.map((m) => fill(FIELD[m][lang], { desks }));
  const list = parts.length > 1 ? parts.slice(0, -1).join(SEP[lang]) + J[lang] + parts.at(-1) : parts[0];
  return say('askMissing', { list });
}

function productList(lang) {
  return db.all('SELECT name, name_fr, price FROM products WHERE active=1 AND stock>0 ORDER BY id LIMIT 5')
    .map((p) => `${lang === 'ar' ? p.name : p.name_fr || p.name} (${p.price})`).join('، ');
}

function matchStopdesk(text, v) {
  if (!v.wilaya) return null;
  const t = text.toLowerCase();
  return db.all('SELECT * FROM stopdesks WHERE wilaya_code=?', v.wilaya.code).find((s) => t.includes(s.name.toLowerCase()) || (s.commune && t.includes(s.commune.toLowerCase())));
}

function editFields(nlu) {
  const f = {};
  if (nlu.wilaya) f.wilaya = String(nlu.wilaya.code);
  if (nlu.commune) f.commune = nlu.commune;
  if (nlu.address) f.address = nlu.address;
  if (nlu.method) f.delivery_method = nlu.method;
  if (nlu.qty) f.qty = nlu.qty;
  if (nlu.name) f.customer_name = nlu.name;
  if (nlu.phone) f.phone = nlu.phone;
  return f;
}
