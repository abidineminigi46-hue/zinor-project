// معالجة webhook واتساب: رسائل الزبائن، الضغط على الأزرار، وحالات الرسائل
import { db } from '../db.js';
import { getOrCreateConversation, addMessage, saveState } from './conversations.js';
import { updateMessageStatus, sendText } from './whatsapp.js';
import { runAssistant } from '../ai/agent.js';
import { getOrder, setOrderStatus, validateOrder } from './orders.js';
import { dispatchOrder } from './shipping.js';
import { audit } from './audit.js';

export async function processWhatsAppWebhook(body) {
  const results = [];
  for (const entry of body?.entry || []) for (const change of entry.changes || []) {
    const v = change.value || {};
    for (const st of v.statuses || []) updateMessageStatus(st.id, st.status, st.errors?.[0]?.title);
    const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
    for (const m of v.messages || []) results.push(await handleMessage(m, names[m.from]));
  }
  return results;
}

async function handleMessage(m, profileName) {
  // منع التكرار: واتساب يقدر يعاود نفس الحدث
  if (m.id && db.get('SELECT id FROM messages WHERE wa_message_id=?', m.id)) return { duplicate: true };
  const conv = getOrCreateConversation(m.from, profileName);
  let text = '', buttonId = null, type = 'text';
  if (m.type === 'text') text = m.text?.body || '';
  else if (m.type === 'interactive') {
    const r = m.interactive?.button_reply || m.interactive?.list_reply;
    buttonId = r?.id; text = r?.title || ''; type = 'button';
  } else if (m.type === 'button') { buttonId = m.button?.payload; text = m.button?.text || ''; type = 'button'; }
  else { text = `[${m.type}]`; type = m.type; }

  const inboundId = addMessage(conv, { direction: 'in', author: 'customer', body: text, type, waMessageId: m.id });
  if (buttonId?.startsWith('oc:')) return handleOrderButton(conv, buttonId, inboundId);
  if (type !== 'text' && type !== 'button') {
    if (conv.mode === 'ai') sendText(conv, 'وصلني 👍 حالياً نقرا غير الرسائل المكتوبة — اكتبلي واش تحتاج، ولا نحوّلك لواحد من الفريق.', { author: 'ai' });
    return { conv: conv.id, unsupported: m.type };
  }
  return { conv: conv.id, ...(await runAssistant(conv, inboundId, text)) };
}

// أزرار تأكيد طلب المتجر: نأكد / نبدّل / نلغي
async function handleOrderButton(conv, id, inboundId) {
  const [, action, orderId] = id.split(':');
  const order = getOrder(Number(orderId));
  if (!order || order.wa_phone !== conv.wa_phone) return { error: 'not_owner' }; // كل زبون يتحكم غير في طلباتو
  if (order.status !== 'awaiting_confirmation') {
    sendText(conv, `الكوموند ${order.number} راهي ${order.status === 'cancelled' ? 'ملغاة' : 'متعالجة'} من قبل 👍`, { author: 'system' });
    return { ignored: true };
  }
  if (action === 'cancel') {
    setOrderStatus(order.id, 'cancelled', { note: 'ألغاها الزبون عبر واتساب', actor: 'customer' });
    sendText(conv, `لغينا الكوموند ${order.number}. إذا بدّلت رأيك راني هنا 🙏`, { author: 'system' });
    return { cancelled: order.id };
  }
  if (action === 'edit') {
    conv.state.editing_order_id = order.id;
    saveState(conv);
    if (conv.mode === 'ai') sendText(conv, 'واش تحب تبدّل؟ (الولاية، البلدية، العنوان، للدار/للمكتب، الكمية، الرقم)', { author: 'ai' });
    return { editing: order.id };
  }
  if (action === 'confirm') {
    const v = validateOrder(order);
    const blocking = v.errors.filter((e) => !/مخزون|منتج غير معروف|المجموع/.test(e));
    if (blocking.length) {
      conv.state.editing_order_id = order.id; saveState(conv);
      sendText(conv, `باش نبعثو الكوموند ${order.number} يلزمنا: ${blocking.join('، ')}. ابعثهملي من فضلك.`, { author: 'system' });
      return { incomplete: blocking };
    }
    setOrderStatus(order.id, 'confirmed', { note: 'أكّدها الزبون عبر زر واتساب', actor: 'customer', extra: { confirmed_at: new Date().toISOString(), confirmed_via: 'whatsapp_button', consent_message_id: inboundId } });
    audit('order.confirm.button', { actor: 'customer', entity: 'orders', entityId: order.id });
    const r = await dispatchOrder(order.id, { actor: 'auto' });
    if (!r.ok) sendText(conv, `أكّدنا الكوموند ${order.number} ✅ راح نبعثولك رقم التتبع قريب.`, { author: 'system' });
    return { confirmed: order.id, dispatch: r };
  }
  return { error: 'unknown_action' };
}
