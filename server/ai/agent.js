// منسّق المحادثة: رسالة واردة → (ذكاء اصطناعي أو موظف) → إرسال تلقائي للكوموند كي تكتمل
import { aiLive } from '../config.js';
import { db } from '../db.js';
import { getSetting } from '../services/settings.js';
import { saveState } from '../services/conversations.js';
import { sendText } from '../services/whatsapp.js';
import { detectLang } from './darija.js';
import { mockBrain } from './mock.js';
import { claudeBrain } from './claude.js';
import { draftView, consentValid } from './tools.js';
import { createOrder, getOrder } from '../services/orders.js';
import { dispatchOrder } from '../services/shipping.js';
import { upsertCustomerByWa } from '../services/customers.js';
import { logError, audit } from '../services/audit.js';
import { modeFor, startConfirmation } from '../calls/engine.js';

export const engineName = () => {
  const ai = getSetting('ai');
  if (ai.mode === 'mock' || !aiLive()) return 'mock';
  return 'claude';
};

export async function runAssistant(conv, inboundMsgId, text) {
  const ai = getSetting('ai');
  if (!ai.enabled || conv.mode !== 'ai') return { skipped: true };
  conv.state.lang = detectLang(text, conv.state.lang || 'ar');
  const ctx = { conv, lang: conv.state.lang, inboundMsgId, calls: [] };
  let replies;
  const engine = engineName();
  try {
    replies = engine === 'claude' ? await claudeBrain(ctx) : await mockBrain(ctx, text);
  } catch (e) {
    logError('ai.reply', e, { entity: 'conversations', entityId: conv.id, details: { engine } });
    replies = await mockBrain(ctx, text); // احتياط: المحرّك المحلي
  }
  saveState(conv);
  const dispatched = await tryAutoDispatch(conv, ctx);
  const replyText = replies.map((r) => r?.trim()).filter(Boolean).join('\n');
  if (replyText) sendText(conv, replyText, { author: 'ai' });
  saveState(conv);
  return { replies, calls: ctx.calls, dispatched, engine };
}

/**
 * كي يكون الزبون شاف الملخّص ووافق، والمعلومات كاملة → نسجّلو الكوموند ونبعثوها لشركة التوصيل مباشرة.
 * بلا تأكيد ثاني وبلا مكالمة. الموافقة تتمسح في نفس الـtransaction باش ما تتخلقش كوموند مرتين.
 */
export async function tryAutoDispatch(conv, ctx = {}) {
  const v = draftView(conv);
  if (!consentValid(conv) || v.missing.length) return null;
  const consent = conv.state.consent;
  // طريقة التأكيد حسب المصدر (محادثة عادية ولا حملة إعلانية)
  const ref = conv.state.referral;
  const probe = { source: 'whatsapp', campaign_id: ref?.source_id || (ref ? 'unknown' : null) };
  const { channel, mode } = modeFor(probe);
  const chatConfirms = mode === 'whatsapp' || mode === 'whatsapp_call'; // الموافقة في المحادثة = تأكيد واتساب
  const order = db.tx(() => {
    const o = createOrder({
      source: 'whatsapp', conversationId: conv.id, customerId: conv.customer_id, customerName: v.customer_name, phone: v.phone,
      waPhone: conv.wa_phone, wilayaCode: v.wilaya_code, commune: v.commune, address: v.address, deliveryMethod: v.delivery_method,
      stopdeskId: v.stopdesk?.id ?? null, items: v.items.map((i) => ({ productId: i.product_id, qty: i.qty })),
      status: chatConfirms ? 'confirmed' : 'awaiting_confirmation', confirmedVia: chatConfirms ? 'whatsapp_chat' : null,
      consentMessageId: consent.messageId, consentText: consent.words, sourceChannel: channel, campaignId: ref?.source_id ?? null, paymentMethod: 'cod',
    }, { actor: 'whatsapp-ai' });
    db.update('orders', o.id, { confirm_mode: mode });
    conv.state.last_order_id = o.id;
    delete conv.state.draft; delete conv.state.summary; delete conv.state.consent; delete conv.state.asked;
    saveState(conv);
    return o;
  });
  upsertCustomerByWa(conv.wa_phone, { name: v.customer_name, phone: v.phone, wilaya_code: v.wilaya_code, commune: v.commune, address: v.address });
  audit('order.auto_from_chat', { actor: 'whatsapp-ai', entity: 'orders', entityId: order.id, details: { consent: consent.words, channel, mode } });
  const lang = ctx.lang || conv.state.lang || 'ar';
  if (!chatConfirms) {
    startConfirmation(order.id, { skipWhatsapp: true });
    sendText(conv, mode === 'call' ? {
      ar: `سجّلنا كوموندك رقم ${order.number} ✅ راح نعيطولك باش نأكدوها.`, latn: `Sjelna la commande ${order.number} ✅ Rah n3aytoulek bach nconfirmiwha.`, fr: `Commande ${order.number} enregistrée ✅ Nous allons vous appeler pour la confirmer.`,
    }[lang] : {
      ar: `سجّلنا كوموندك رقم ${order.number} ✅ واحد من الفريق راح يأكدها معاك.`, latn: `Sjelna la commande ${order.number} ✅ Wa7ed men l'équipe yconfirmiha m3ak.`, fr: `Commande ${order.number} enregistrée ✅ Un membre de l'équipe va la confirmer avec vous.`,
    }[lang], { author: 'system' });
    return getOrder(order.id);
  }
  const r = await dispatchOrder(order.id, { actor: 'auto' });
  if (!r.ok) {
    sendText(conv, {
      ar: `سجّلنا كوموندك رقم ${order.number} ✅ راح نبعثولك رقم التتبع في أقرب وقت.`,
      latn: `Sjelna la commande ${order.number} ✅ Nab3atoulek numero ta3 suivi 9rib.`,
      fr: `Votre commande ${order.number} est enregistrée ✅ Vous recevrez le numéro de suivi très vite.`,
    }[lang], { author: 'system' });
  }
  return getOrder(order.id);
}
