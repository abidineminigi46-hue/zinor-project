// فهم الدارجة الجزائرية (حروف عربية + لاتينية "عربيزي") والفرنسية — يستعملو المحرّك المحلي
import { normText, findWilaya } from '../data/wilayas.js';

const AR = /[؀-ۿ]/g;
const DARIJA_LATN = /\b(ch7al|chhal|che7al|wach|wech|kayen|kayn|rani|raki|nheb|n7eb|bghit|bhit|dyal|ta3|ta3i|3la|m3a|wa7ed|wahed|zouj|safi|mlih|bzaf|kifach|win|fin|nchri|dirli|l3asima|3andkom|3andek|3andi|chwiya|bark|khouya|kho|sahbi|ma3lich|wesh|yaw|labas|lbas|mrigel|mriguel|ih|iih|smiti|ismi|esmi|numero|livraisoun)\b/i;
const FRENCH = /\b(je|vous|bonjour|bonsoir|combien|est-ce|s'il|merci|voudrais|livraison à|commander|domicile|adresse|prix|pour|avec|quel|quelle|mon|ma|votre)\b/i;

export function detectLang(text, prev = 'ar') {
  const t = String(text || '');
  const arCount = (t.match(AR) || []).length;
  const letters = (t.match(/\p{L}/gu) || []).length || 1;
  if (arCount / letters > 0.4) return 'ar';
  if (!/[a-z]/i.test(t)) return prev;
  if (DARIJA_LATN.test(t) || /[a-z][379][a-z]|[379][a-z]/i.test(t)) return 'latn';
  if (FRENCH.test(t)) return 'fr';
  return prev === 'ar' ? 'latn' : prev;
}

const R = {
  greet: /(^|\s)(salam|slm|salut|bonjour|bonsoir|cc|coucou|ahlan|hello|hi|saha|salamou)(?=[\s,!.?،]|$)|السلام|سلام|صباح الخير|مساء الخير|اهلا|مرحبا/,
  price: /ch7al|chhal|che7al|chehal|ch7l|chahal|combien|prix|tarif|soum|سومه|شحال|بشحال|قداش|السعر|الثمن|price|cost|كم/,
  delivery: /livr|tawsil|توصيل|ليفريزون|ليفرزون|frais|expedi|shipping|يوصل|توصلو|twaslo|twasslo|توصلولي/,
  buy: /(^|\s)(nchri|n9chri|nechri|bghit|bhit|nheb|n7eb|nhab|n7ab|habit|7abit|je veux|je voudrais|je prends|commander|dirli|ncommandi|ncomandi|ncommander|reserver|réserver|نشري|نحب|حبيت|بغيت|ديرلي|نكوموندي|نطلب|نحجز|نديها|نديه|ndiha|ndih|ndiro)(\s|$)/,
  notBuy: /(nheb|n7eb|bghit|نحب|بغيت|حبيت)\s+(na3ref|n3ref|nchouf|nsa9si|nsaksi|nfhem|نعرف|نشوف|نسقسي|نفهم)/,
  affirm: /^(ih|iih|ihh|ey|eh|ah|oui|ouii|wi|yes|ok|okay|d'accord|dac|safi|mrigel|mriguel|sah|wah|wakha|يه|ايه|اه|واه|صح|مريقل|اوكي|نعم|ايوا|confirm|confirmi|nconfirmi|اكد|نأكد|ناكد|c'est bon|parfait|valider|je confirme|vas-y|يالاه|yallah)(\s|$|[!.,؟?])/,
  orderPhrase: /(dirli|ديرلي|confirmi|nconfirmi|valide|نأكد|ناكد|اكد|je confirme|confirmer)\s*(had|هاذ|هاد|la|cette|el|l)?\s*(la\s*)?(commande|كوموند|الكوموند|طلبيه|الطلبيه|order|lcommande)/,
  negate: /^(la|lala|non|no|لا|لالا|machi|ماشي)(\s|$|[!.,])/,
  track: /win rahi|wine rahi|fin rahi|wselt|weslet|wsslet|tracking|suivi|suivre|où est|ou est|وين راهي|وين وصلت|تتبع|وصلت ولا|ma wseltch|ma jatch|statut|ما وصلتش|ما جاتش/,
  ret: /retour|rotor|روتور|رطور|نرجع|نرجعها|نرجعو|rembours|rajja3|nraja3|nrajja3|nrejja3|retourner|echanger|échanger|ماعجبنيش|ma3jbatnich|ma3jebnich|مكسور|مكسوره|mksour|mkasr|meksour|خاسر|خاسره|abim|cass/,
  botQ: /(wach|wech|est-ce que|es-tu|êtes-vous|vous êtes|t'es|tu es|واش|انت|نتا|راك)\s*(nta|enta|anta|نتا|انت|راك|vous|tu)?\s*(robot|bot|ai|ia|machine|bnadem|insan|روبو|روبوت|بنادم|انسان|الي|آلي|ذكاء)|(robot|روبو|bot)\s*\?|راني نهدر مع روبو|rani nahder m3a robot/,
  human: /(nheb|n7eb|bghit|نحب|بغيت|je veux|je voudrais)\s+(nahder|nahdar|nhder|نهدر|parler)\s+(m3a|مع|avec|à|a)\s+|conseiller|employé|responsable|موظف|واحد من الخدامين|مسؤول|bnadem 7a9i|insan 7a9i/,
  cancel: /annul|نلغي|الغي|الغيها|cancel|بطلت|batalt|mab9itch|ma bqitch|ما بقيتش|ma7abitch/,
  useWa: /nafs (el |l)?num|meme num|même num|had (el |l)?num|numero ta3 (el )?whatsapp|هاذ الرقم|هاد الرقم|نفس الرقم|رقم الواتساب|ce numéro|ce numero|numéro whatsapp|numero whatsapp|nafs whatsapp/,
  home: /(^|\s)(l ?dar|ldar|domicile|maison|home|lbit|للدار|لدار|الدار|المنزل|البيت|للبيت|للدار|dar)(\s|$|[,.!؟?])/,
  desk: /bureau|stop ?desk|agence|desk|lmaktab|lmekteb|مكتب|المكتب|لمكتب|لاجونس|بيرو|point relais/,
};

export function parse(text, { products = [], waPhone } = {}) {
  const raw = String(text || '').trim();
  const t = normText(raw);
  const out = { raw, lang: null, intents: new Set() };
  const has = (k) => R[k].test(t);
  for (const k of ['greet', 'price', 'delivery', 'track', 'ret', 'cancel', 'useWa']) if (has(k)) out.intents.add(k);
  if (has('botQ')) out.intents.add('botQ');
  else if (has('human')) out.intents.add('human');
  if (has('buy') && !has('notBuy')) out.intents.add('buy');
  if (has('affirm') || has('orderPhrase')) out.intents.add('affirm');
  if (has('orderPhrase')) out.intents.add('buy');
  if (has('negate')) out.intents.add('negate');
  if (out.intents.has('track') && /retour|روتور|نرجع/.test(t)) out.intents.delete('track');
  if (out.intents.has('ret')) out.intents.delete('buy');

  out.wilaya = findWilaya(raw);
  if (has('desk')) out.method = 'desk'; else if (has('home')) out.method = 'home';

  const phone = raw.replace(/[\s.-]/g, '').match(/(?:\+?213|0)[5-7]\d{8}/);
  if (phone) out.phone = phone[0];
  if (out.intents.has('useWa') && waPhone) out.phone = waPhone;

  const nm = raw.match(/(?:ismi|esmi|smiti|smyti|je m'appelle|je suis|mon nom est|nom et prénom|nom|الاسم|اسمي|إسمي|سميتي|سميتى)\s*[:：]?\s*([\p{L}]+(?:\s+[\p{L}]+){0,2})/iu);
  if (nm) out.name = cleanName(nm[1]);

  const ad = raw.match(/(?:adresse|l'adresse|address|3onwan|3nwan|العنوان|عنواني|عنوان)\s*[:：]?\s*([^\n]+)/i);
  if (ad) out.address = ad[1].trim();
  else {
    const seg = raw.split(/[,،\n]| w | و /).map((s) => s.trim()).find((s) => /(cit[ée]|hay|rue|quartier|bloc|lotissement|lgts|logements|immeuble|n°|حي|شارع|عماره|عمارة|تجزئة|مسكن)/i.test(s));
    if (seg) out.address = seg.replace(/^(adresse|العنوان)\s*[:：]?\s*/i, '');
  }

  const cm = raw.match(/(?:commune|baladiya|bladiya|baladia|بلدية|بلديه|البلدية)\s*[:：]?\s*([\p{L}' -]+?)(?=\s*[,،.\n]|\s+w\s|\s+و|$)/iu);
  if (cm) out.commune = titleCase(cm[1].trim());

  const q = t.match(/(?:^|\s)(?:x\s?)?([1-9])\s*(?:x|pcs?|pieces?|pièces?|حبات|حبه|قطع|قطعه)(?=\s|$)/) || t.match(/(?:^|\s)x\s?([1-9])(?=\s|$)/);
  if (q) out.qty = Number(q[1]);
  else if (/(^|\s)(zouj|جوج|زوج|deux|2 )/.test(t + ' ')) out.qty = 2;
  else if (/(^|\s)(tlata|ثلاثه|trois)(\s|$)/.test(t)) out.qty = 3;

  const on = raw.match(/\bZN-?\d{3,}\b/i);
  if (on) out.orderNumber = on[0].toUpperCase().replace('-', '');

  if (products.length) out.product = products[0];
  return out;
}

const STOP = new Set(['w', 'و', 'wa', 'et', 'numero', 'num', 'رقم', 'tel', 'telephone', 'téléphone', 'f', 'في', 'من', 'men']);
function cleanName(s) {
  const parts = s.split(/\s+/).filter((p) => !STOP.has(p.toLowerCase()) && !/\d/.test(p));
  return titleCase(parts.slice(0, 3).join(' '));
}
export const titleCase = (s) => String(s || '').replace(/\b([a-zà-ÿ])/g, (m) => m.toUpperCase());

// اسم بلا كلمات زايدة (لما نكونو سقسينا على الاسم)
export function nameFromFreeText(raw) {
  const s = raw.replace(/(?:\+?213|0)[5-7](?:[\s.-]?\d){8}/g, ' ').replace(/[,،.:]/g, ' ')
    .replace(/\b(ismi|esmi|smiti|ana|je suis|je m'appelle|nom|w|et|numero|num|tel|راني|انا|اسمي|سميتي|و|رقم|الرقم|التيليفون|هاذا|hada|voici|c'est)\b/giu, ' ')
    .replace(/(^|\s)(و|اسمي|سميتي|انا|رقمي|الرقم)(?=\s|$)/g, ' ')
    .trim().split(/\s+/).filter(Boolean);
  if (!s.length || s.length > 4) return null;
  return titleCase(s.join(' '));
}
