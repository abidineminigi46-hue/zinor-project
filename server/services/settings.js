import { db } from '../db.js';

// القيم الافتراضية — كلها قابلة للتعديل من اللوحة
export const DEFAULTS = {
  store: { name: 'Zinor Boutique', currency: 'دج', origin_wilaya: 16, support_hours: '9:00 - 20:00' },
  ai: { enabled: true, mode: 'auto', handoff_keywords: ['نحب نهدر مع واحد', 'employé', 'conseiller', 'bnadem', 'insan'] },
  notifications: {
    shipped: true, out_for_delivery: true, delivered: true, delivery_failed: true, returned: true,
  },
  // نص كل رسالة + اسم القالب المعتمد في Meta (يُستعمل خارج نافذة 24 ساعة)
  templates: {
    order_confirmation: {
      label: 'تأكيد طلب المتجر (بأزرار)', wa_template: 'zinor_order_confirm',
      text: 'سلام {name} 👋 وصلتنا طلبيتك من {store}:\n{items}\nالتوصيل: {delivery} — {wilaya}، {commune}\nالمجموع عند الاستلام: {total} دج\nتأكد الطلبية؟',
      buttons: ['نأكد الطلب', 'نبدّل المعلومات', 'نلغي الطلب'],
    },
    shipped: {
      label: 'تأكيد الطلب والشحن', wa_template: 'zinor_order_shipped',
      text: 'تم ✅ كوموندك رقم {order} راهي مسجّلة وتبعثت مع {carrier}. رقم التتبع: {tracking}. المبلغ عند الاستلام {total} دج.',
    },
    out_for_delivery: {
      label: 'تذكير: الطرد خرج مع الليفرور', wa_template: 'zinor_out_for_delivery',
      text: 'سلام {name}، كوموندك رقم {order} راهي خرجت مع الليفرور.{eta} المبلغ عند الاستلام {total} دج. خلي تيليفونك قريب باش يقدر يتصل بيك. إذا تحتاج مساعدة ردّ على هاذ المساج.',
    },
    delivered: {
      label: 'تم التسليم', wa_template: 'zinor_delivered',
      text: 'كوموندك رقم {order} تسلّمت. يعطيك الصحة على الثقة 🙏 إذا كاين أي مشكل مع المنتج ردّ على هاذ المساج.',
    },
    delivery_failed: {
      label: 'فشل التوصيل', wa_template: 'zinor_delivery_failed',
      text: 'سلام {name}، الليفرور ما قدرش يوصلّك كوموندك رقم {order}{reason}. ردّ علينا باش نعاودو نبرمجوها.',
    },
    returned: {
      label: 'الروتور', wa_template: 'zinor_returned',
      text: 'كوموندك رقم {order} رجعت للمخزن. إذا حبيت نعاودو نبعثوها ردّ على هاذ المساج.',
    },
  },
  // ───── واتساب والمكالمات ─────
  calls: {
    real_calls_enabled: false,        // المكالمات الحقيقية مطفية افتراضياً
    test_only_owner: true,            // وضع أول تجربة: الاتصال الحقيقي غير لرقم صاحب المتجر
    owner_phone: '',
    outbound_enabled: true,           // المكالمات الصادرة
    inbound_enabled: true,            // المكالمات الواردة (الزبون يرجع يعيّط)
    // طريقة التأكيد لكل مصدر: whatsapp | call | whatsapp_call | manual
    modes: { woocommerce: 'whatsapp_call', store: 'whatsapp', whatsapp_chat: 'whatsapp', whatsapp_campaign: 'whatsapp', manual: 'manual', default: 'whatsapp' },
    campaign_overrides: [],           // [{ source_id, label, mode }] حسب معرّف إعلان Meta (referral.source_id)
    combined_strategy: 'delayed',     // immediate | delayed (في وضع واتساب + مكالمة)
    delay_minutes: 60,
    only_cod: true,
    timezone: 'Africa/Algiers',
    windows: [{ start: '10:00', end: '12:00' }, { start: '14:00', end: '16:00' }, { start: '18:00', end: '20:00' }],
    max_attempts_per_day: 3,
    scripts: {
      outbound_opening: 'سلام، معاك متجر Zinor. عيّطنالك على الكوموند اللي درتها. عندك دقيقة باش نأكدوها؟',
      inbound_opening: 'سلام، معاك متجر Zinor. كيفاش نقدر نعاونك في الكوموند تاعك؟',
    },
    voice: { outbound: 'sim-female', inbound: 'sim-female', same_voice: false, clone_voice_id: '', clone_owner: '', clone_consent: false },
    intros: { outbound_media_id: null, inbound_media_id: null },
  },
  returns: {
    window_days: 7,
    auto_accept_reasons: ['defective', 'wrong_item'],
    review_reasons: ['size', 'changed_mind', 'other'],
    customer_pays_return_fee: false,
    note: 'نقبلو الروتور في 7 أيام من الاستلام، المنتج لازم يكون في حالتو الأصلية.',
  },
};

export function getSetting(key) {
  const row = db.get('SELECT value FROM settings WHERE key=?', key);
  const def = DEFAULTS[key];
  if (!row) return structuredClone(def);
  const v = JSON.parse(row.value);
  return def && typeof def === 'object' && !Array.isArray(def) ? deepMerge(structuredClone(def), v) : v;
}
export function setSetting(key, value) {
  db.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value));
}
export const allSettings = () => Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, getSetting(k)]));

function deepMerge(a, b) {
  for (const [k, v] of Object.entries(b || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') deepMerge(a[k], v);
    else a[k] = v;
  }
  return a;
}

export function render(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}
