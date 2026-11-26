// النص المخصّص للصوت: نفس الجملة بصح مكتوبة باش تتقرا بالدارجة الجزائرية
//   Zinor → زينور · Bab Ezzouar → باب الزوار · 3700 دينار → ثلاثة آلاف وسبعمية دينار · ZN1013 → زاد نون، واحد صفر واحد ثلاثة
import { WILAYAS } from '../data/wilayas.js';

// ───── الأرقام بالدارجة ─────
const ONES = ['صفر', 'واحد', 'زوج', 'ثلاثة', 'ربعة', 'خمسة', 'ستة', 'سبعة', 'ثمنية', 'تسعة', 'عشرة', 'حداش', 'طناش', 'طلطاش', 'ربعطاش', 'خمسطاش', 'سطاش', 'سبعطاش', 'ثمنطاش', 'تسعطاش'];
const TENS = ['', '', 'عشرين', 'ثلاثين', 'ربعين', 'خمسين', 'ستين', 'سبعين', 'ثمانين', 'تسعين'];
const HUNDREDS = ['', 'مية', 'ميتين', 'ثلاثمية', 'ربعمية', 'خمسمية', 'ستمية', 'سبعمية', 'ثمنمية', 'تسعمية'];

function below1000(n) {
  const parts = [];
  if (n >= 100) { parts.push(HUNDREDS[Math.floor(n / 100)]); n %= 100; }
  if (n >= 20) parts.push(n % 10 ? `${ONES[n % 10]} و${TENS[Math.floor(n / 10)]}` : TENS[Math.floor(n / 10)]);
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(' و');
}
export function numberToDarija(num) {
  let n = Math.round(Number(num));
  if (!Number.isFinite(n)) return String(num);
  if (n === 0) return 'صفر';
  if (n < 0) return `ناقص ${numberToDarija(-n)}`;
  const parts = [];
  if (n >= 1_000_000) {
    const m = Math.floor(n / 1_000_000);
    parts.push(m === 1 ? 'مليون' : m === 2 ? 'زوج ملاين' : m <= 10 ? `${ONES[m]} ملاين` : `${below1000(m)} مليون`);
    n %= 1_000_000;
  }
  if (n >= 1000) {
    const t = Math.floor(n / 1000);
    parts.push(t === 1 ? 'ألف' : t === 2 ? 'ألفين' : t <= 10 ? `${ONES[t]} آلاف` : `${below1000(t)} ألف`);
    n %= 1000;
  }
  if (n > 0) parts.push(below1000(n));
  return parts.join(' و');
}
const digitByDigit = (s) => [...s].map((d) => ONES[Number(d)]).join(' ');

// ───── أسماء البلديات والكلمات اللاتينية الشائعة ─────
const NAMES = {
  'zinor': 'زينور', 'zinor boutique': 'زينور بوتيك', 'whatsapp': 'واتساب', 'stop desk': 'المكتب', 'yalidine': 'ياليدين', 'zr express': 'زد آر إكسبريس',
  'bab ezzouar': 'باب الزوار', 'bab el oued': 'باب الواد', 'kouba': 'القبة', 'hydra': 'حيدرة', 'el harrach': 'الحراش', 'dar el beida': 'الدار البيضاء',
  'cheraga': 'الشراقة', 'draria': 'الدرارية', 'birkhadem': 'بئر خادم', 'bir mourad rais': 'بئر مراد رايس', 'ouled fayet': 'أولاد فايت', 'ain benian': 'عين البنيان',
  'rouiba': 'الرويبة', 'reghaia': 'الرغاية', 'bordj el kiffan': 'برج الكيفان', 'baraki': 'براقي', 'el biar': 'الأبيار', 'ben aknoun': 'بن عكنون',
  'hussein dey': 'حسين داي', 'bachdjerrah': 'باش جراح', 'saoula': 'السحاولة', 'zeralda': 'زرالدة', 'staoueli': 'سطاوالي', 'dely ibrahim': 'دالي إبراهيم',
  'mohammadia': 'المحمدية', 'el achour': 'العاشور', 'sidi mhamed': 'سيدي امحمد', 'alger centre': 'الجزائر الوسطى', 'belouizdad': 'بلوزداد',
  'boufarik': 'بوفاريك', 'ouled yaich': 'أولاد يعيش', 'bougara': 'بوقرة', 'larbaa': 'الأربعاء', 'mouzaia': 'موزاية', 'el affroun': 'العفرون',
  'bir el djir': 'بئر الجير', 'es senia': 'السانية', 'ain turk': 'عين الترك', 'arzew': 'أرزيو', 'gdyel': 'قديل', 'bethioua': 'بطيوة',
  'el khroub': 'الخروب', 'ain smara': 'عين سمارة', 'hamma bouziane': 'حامة بوزيان', 'el eulma': 'العلمة', 'ain oulmene': 'عين ولمان',
  'el bouni': 'البوني', 'el hadjar': 'الحجار', 'tizi ouzou': 'تيزي وزو', 'azazga': 'عزازقة', 'akbou': 'أقبو', 'boumerdes': 'بومرداس',
  'tipaza': 'تيبازة', 'cherchell': 'شرشال', 'kolea': 'القليعة', 'douera': 'الدويرة', 'centre ville': 'وسط المدينة', 'cite': 'حي', 'cité': 'حي',
  'juillet': 'جويلية', 'janvier': 'جانفي', 'fevrier': 'فيفري', 'mars': 'مارس', 'avril': 'أفريل', 'mai': 'ماي', 'juin': 'جوان', 'aout': 'أوت', 'septembre': 'سبتمبر', 'octobre': 'أكتوبر', 'novembre': 'نوفمبر', 'decembre': 'ديسمبر',
  'lgts': 'مسكن', 'logements': 'مسكن', 'bloc': 'عمارة', 'bt': 'عمارة', 'rue': 'شارع', 'n°': 'رقم',
};
for (const w of WILAYAS) { NAMES[w.fr.toLowerCase()] ??= w.ar; for (const a of w.aliases) if (/^[a-z' ]+$/.test(a) && a.length > 3) NAMES[a] ??= w.ar; }
const NAME_KEYS = Object.keys(NAMES).sort((a, b) => b.length - a.length);
const deaccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// تحويل تقريبي لكلمة لاتينية (فرنسية/دارجة) لحروف عربية — باش ما تتفوّتش في القراءة
const DIGRAPHS = [['ou', 'و'], ['ch', 'ش'], ['kh', 'خ'], ['gh', 'غ'], ['dj', 'ج'], ['th', 'ث'], ['sh', 'ش'], ['ph', 'ف'], ['qu', 'ك'], ['ai', 'اي'], ['ei', 'اي'], ['au', 'و'], ['eau', 'و'], ['an', 'ان'], ['en', 'ان'], ['on', 'ون']];
const LETTERS = { a: 'ا', b: 'ب', c: 'ك', d: 'د', e: '', f: 'ف', g: 'ڨ', h: 'ه', i: 'ي', j: 'ج', k: 'ك', l: 'ل', m: 'م', n: 'ن', o: 'و', p: 'ب', q: 'ق', r: 'ر', s: 'س', t: 'ت', u: 'و', v: 'ف', w: 'و', x: 'كس', y: 'ي', z: 'ز', 3: 'ع', 7: 'ح', 9: 'ق' };
export function transliterate(word) {
  let w = deaccent(word.toLowerCase());
  let out = '';
  for (let i = 0; i < w.length;) {
    const dg = DIGRAPHS.find(([k]) => w.startsWith(k, i));
    if (dg) { out += dg[1]; i += dg[0].length; continue; }
    const ch = w[i];
    if (ch === 'e' && (i === 0 || i === w.length - 1)) { out += i === 0 ? 'ا' : ''; i++; continue; }
    if (ch === 'g' && 'eiy'.includes(w[i + 1] || '')) { out += 'ج'; i++; continue; }
    if (ch === 'c' && 'eiy'.includes(w[i + 1] || '')) { out += 'س'; i++; continue; }
    out += LETTERS[ch] ?? (/[\p{L}\p{N}]/u.test(ch) ? '' : ch);
    i++;
  }
  if (/^[اوي]/.test(out) === false && /^[aeiou]/.test(w)) out = 'ا' + out;
  return out.replace(/(.)\1+/g, '$1');
}

export function toSpeech(text) {
  let t = String(text || '');
  // مرجع الكوموند: ZN1013 → زاد نون، واحد صفر واحد ثلاثة
  t = t.replace(/\bZN-?(\d+)\b/gi, (_, d) => `زاد نون، ${digitByDigit(d)}`);
  // المبالغ: 3700 دينار / 3 700 دج / 3,700 DA
  t = t.replace(/(\d[\d\s.,  ]*\d|\d)\s*(دينار|دج|DA|DZD)/gi, (_, n) => `${numberToDarija(n.replace(/[^\d]/g, ''))} دينار`);
  // أرقام هاتف/تتبع طويلة → رقم برقم، والأرقام الصغيرة بالكلمات
  t = t.replace(/\d{5,}/g, (d) => digitByDigit(d));
  t = t.replace(/\d{1,4}/g, (d) => numberToDarija(d));
  // الأسماء المعروفة (أطول تطابق أولاً) — الحروف اللاتينية بلا accents باش Cité = Cite
  t = t.replace(/[A-Za-zÀ-ÿ]+/g, (w) => deaccent(w));
  for (const k of NAME_KEYS) {
    const re = new RegExp(`(^|[^\\p{L}])${deaccent(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'giu');
    t = t.replace(re, (m, pre) => pre + NAMES[k]);
  }
  // الباقي من الكلمات اللاتينية
  t = t.replace(/[A-Za-zÀ-ÿ'][A-Za-zÀ-ÿ'-]*/g, (w) => NAMES[w.toLowerCase()] || transliterate(w));
  return t.replace(/\s+/g, ' ').replace(/ ،/g, '،').trim();
}

export function withSpeech(reply) {
  if (!reply?.actions) return reply;
  return { ...reply, actions: reply.actions.map((a) => (a.type === 'say' ? { ...a, speech: toSpeech(a.text) } : a)) };
}

export const SAMPLE_SPEECH_TEXT = 'سلام، معاك متجر Zinor. عيّطنالك على الكوموند اللي درتها: عطر عود رويال، حبة وحدة، التوصيل للدار في Bab Ezzouar، الجزائر. المجموع 3700 دينار تخلّصهم عند الاستلام. نأكدولك الكوموند؟';
