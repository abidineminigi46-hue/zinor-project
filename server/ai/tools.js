// أدوات المساعد — نفس الأدوات يستعملهم Claude والمحرّك المحلي.
// القرارات الحسّاسة (الأسعار، الموافقة، إرسال الطرد) يقرّرها الخادم هنا، ماشي النموذج.
import { db } from '../db.js';
import { sha } from '../crypto.js';
import { searchProducts, getProduct, deliveryQuote, deliveryFee, listProducts } from '../services/catalog.js';
import { findWilaya, wilayaByCode } from '../data/wilayas.js';
import { localPhone, isValidDzMobile } from '../services/customers.js';
import { saveState, setMode } from '../services/conversations.js';
import { sendText } from '../services/whatsapp.js';
import { ORDER_STATUS, getOrder, orderByNumber, orderItems, recalcOrder } from '../services/orders.js';
import { createCustomerReturn, RETURN_STATUS } from '../services/returns.js';
import { audit } from '../services/audit.js';
import { sendOrderConfirmation } from '../services/stores.js';

// ───────────── المسودّة (الكوموند قبل التسجيل) ─────────────
export function draftView(conv) {
  const d = conv.state.draft || {};
  const items = (d.items || []).map((i) => { const p = getProduct(i.product_id); return p && { product_id: p.id, name: p.name, name_fr: p.name_fr, qty: i.qty, unit_price: p.price, stock: p.stock }; }).filter(Boolean);
  const w = wilayaByCode(d.wilaya_code);
  const desk = d.stopdesk_id ? db.get('SELECT * FROM stopdesks WHERE id=?', d.stopdesk_id) : null;
  const fee = w && d.delivery_method ? deliveryFee(w.code, d.delivery_method) : null;
  const itemsTotal = items.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const hasDesks = w ? db.get('SELECT COUNT(*) AS n FROM stopdesks WHERE wilaya_code=?', w.code).n > 0 : false;
  const missing = [];
  if (!items.length) missing.push('product');
  if (!w) missing.push('wilaya');
  if (!d.delivery_method) missing.push('delivery_method');
  if (!d.commune) missing.push('commune');
  if (d.delivery_method === 'home' && !d.address) missing.push('address');
  if (d.delivery_method === 'desk' && hasDesks && !desk) missing.push('stopdesk');
  if (!d.customer_name) missing.push('customer_name');
  if (!d.phone) missing.push('phone');
  return {
    items, customer_name: d.customer_name || null, phone: d.phone || null, wilaya_code: w?.code || null, wilaya: w || null,
    commune: d.commune || null, address: d.address || null, delivery_method: d.delivery_method || null, stopdesk: desk,
    items_total: itemsTotal, delivery_fee: fee, total: fee == null ? null : itemsTotal + fee, missing,
    stopdesks: w && d.delivery_method === 'desk' ? db.all('SELECT id, name, commune FROM stopdesks WHERE wilaya_code=?', w.code) : [],
  };
}
// البصمة: المنتجات + الكمية + الولاية + الطريقة + المجموع. إذا تبدّلت → لازم ملخّص جديد وموافقة جديدة
export const draftHash = (v) => v.total == null || !v.items.length ? null :
  sha(JSON.stringify([v.items.map((i) => [i.product_id, i.qty]), v.wilaya_code, v.delivery_method, v.total]));

export function consentValid(conv) {
  const v = draftView(conv);
  const h = draftHash(v);
  return Boolean(h && conv.state.consent?.hash === h);
}
export const summaryCurrent = (conv) => {
  const h = draftHash(draftView(conv));
  return Boolean(h && conv.state.summary?.hash === h);
};

const L = {
  ar: { home: 'للدار', desk: 'للمكتب (Stop desk)', total: 'المجموع', pay: 'الدفع عند الاستلام', da: 'دج', delivery: 'التوصيل' },
  latn: { home: 'l dar', desk: 'l bureau (stop desk)', total: 'Total', pay: 'khlas 3and l\'istilam', da: 'DA', delivery: 'Livraison' },
  fr: { home: 'à domicile', desk: 'au bureau (stop desk)', total: 'Total', pay: 'paiement à la livraison', da: 'DA', delivery: 'Livraison' },
};
export function summaryText(v, lang = 'ar') {
  const t = L[lang] || L.ar;
  const nm = (i) => (lang === 'ar' ? i.name : i.name_fr || i.name);
  const wn = lang === 'ar' ? v.wilaya?.ar : v.wilaya?.fr;
  const lines = v.items.map((i) => `📦 ${nm(i)} ×${i.qty} — ${i.unit_price * i.qty} ${t.da}`);
  lines.push(`🚚 ${t.delivery} ${t[v.delivery_method]} (${wn}) — ${v.delivery_fee} ${t.da}`);
  lines.push(`💰 ${t.total}: ${v.total} ${t.da} (${t.pay})`);
  const who = [v.customer_name, v.phone, v.commune, v.delivery_method === 'home' ? v.address : v.stopdesk?.name].filter(Boolean);
  if (who.length) lines.push(`👤 ${who.join(' — ')}`);
  return lines.join('\n');
}

// ───────────── تعريف الأدوات (JSON Schema — يتبعثو لـClaude) ─────────────
export const TOOL_DEFS = [
  { name: 'search_products', description: 'Search the catalog by name/keywords (Arabic, Darija, French). Returns id, name, price (DZD), stock. Always use for any product, price or stock question.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } },
  { name: 'get_delivery_quote', description: 'Delivery prices and delays for a wilaya (name in any spelling or number): home and stop-desk options, plus stop-desk list. Use for any delivery cost/delay question.',
    input_schema: { type: 'object', properties: { wilaya: { type: 'string' } }, required: ['wilaya'], additionalProperties: false } },
  { name: 'update_order_draft', description: 'Save order details the customer gave (only what they actually said). Call whenever the customer gives product, quantity, wilaya, commune, address, delivery method, stop desk, name or phone — even if they are only asking. Saving details never creates an order. Set use_whatsapp_number=true only if the customer said to use their WhatsApp number.',
    input_schema: { type: 'object', additionalProperties: false, properties: {
      product_id: { type: 'integer' }, qty: { type: 'integer', minimum: 1 }, wilaya: { type: 'string' }, commune: { type: 'string' },
      address: { type: 'string' }, delivery_method: { type: 'string', enum: ['home', 'desk'] }, stopdesk_id: { type: 'integer' },
      customer_name: { type: 'string' }, phone: { type: 'string' }, use_whatsapp_number: { type: 'boolean' } } } },
  { name: 'show_order_summary', description: 'Sends the customer the official order summary (products, delivery fee, total in DZD). Requires product, wilaya and delivery method in the draft. The summary is sent automatically — do not repeat it in your text; just ask if they confirm.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'record_purchase_consent', description: 'Record that the customer clearly agreed to buy AFTER seeing the current summary (e.g. "ih dirli had la commande", "نأكد", "oui je confirme"). Never call for questions, hesitation, or when they only gave name/phone. Quote their exact words.',
    input_schema: { type: 'object', properties: { customer_words: { type: 'string' } }, required: ['customer_words'], additionalProperties: false } },
  { name: 'track_order', description: "Status and tracking of THIS customer's own orders (scoped to their phone number). Optional order_number like ZN1004.",
    input_schema: { type: 'object', properties: { order_number: { type: 'string' } }, additionalProperties: false } },
  { name: 'request_return', description: 'Customer wants to return an order they already RECEIVED. Needs the reason in their words. If the parcel was not delivered yet, this is not a return.',
    input_schema: { type: 'object', properties: { order_number: { type: 'string' }, reason: { type: 'string' } }, required: ['reason'], additionalProperties: false } },
  { name: 'edit_pending_order', description: 'Customer pressed "نبدّل المعلومات" on a store order and gives new details. Applies them; the server re-sends the updated summary with confirm buttons.',
    input_schema: { type: 'object', additionalProperties: false, properties: {
      qty: { type: 'integer', minimum: 1 }, wilaya: { type: 'string' }, commune: { type: 'string' }, address: { type: 'string' },
      delivery_method: { type: 'string', enum: ['home', 'desk'] }, customer_name: { type: 'string' }, phone: { type: 'string' } } } },
  { name: 'handoff_to_human', description: 'Transfer the conversation to a staff member (customer asks for a human, complaint, refund dispute, anything you cannot solve from the data). AI replies stop until staff hands back.',
    input_schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'], additionalProperties: false } },
  { name: 'cancel_draft', description: 'Customer no longer wants the order being prepared in chat.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false } },
];

// ───────────── التنفيذ ─────────────
export async function executeTool(ctx, name, input = {}) {
  const { conv } = ctx;
  ctx.calls.push({ name, input });
  switch (name) {
    case 'search_products': {
      const r = searchProducts(input.query);
      const list = (r.length ? r : listProducts()).slice(0, 6);
      return { matched: r.length > 0, products: list.map((p) => ({ id: p.id, name: p.name, name_fr: p.name_fr, price_dzd: p.price, in_stock: p.stock > 0, stock: p.stock, description: p.description })) };
    }
    case 'get_delivery_quote': {
      const w = /^\d{1,2}$/.test(String(input.wilaya).trim()) ? wilayaByCode(input.wilaya) : findWilaya(input.wilaya);
      if (!w) return { error: 'wilaya_not_found' };
      const q = deliveryQuote(w.code);
      if (!q.available) return { wilaya: w.ar, available: false };
      return { wilaya: { code: w.code, ar: w.ar, fr: w.fr }, home: q.home, desk: q.desk, stopdesks: q.stopdesks.map((s) => ({ id: s.id, name: s.name, commune: s.commune })) };
    }
    case 'update_order_draft': {
      const d = (conv.state.draft ||= {});
      const changed = [];
      if (input.product_id) {
        const p = getProduct(input.product_id);
        if (!p || !p.active) return { error: 'product_not_found' };
        const items = d.items || [];
        const ex = items.find((i) => i.product_id === p.id);
        if (ex) ex.qty = input.qty || ex.qty; else items.push({ product_id: p.id, qty: input.qty || 1 });
        d.items = items; changed.push('product');
      } else if (input.qty && d.items?.length === 1) { d.items[0].qty = input.qty; changed.push('qty'); }
      if (input.wilaya) {
        const w = /^\d{1,2}$/.test(String(input.wilaya).trim()) ? wilayaByCode(input.wilaya) : findWilaya(input.wilaya);
        if (w) { if (d.wilaya_code !== w.code) { d.stopdesk_id = null; } d.wilaya_code = w.code; changed.push('wilaya'); }
      }
      if (input.delivery_method) { d.delivery_method = input.delivery_method; changed.push('delivery_method'); }
      if (input.commune) { d.commune = input.commune.trim(); changed.push('commune'); }
      if (input.address) { d.address = input.address.trim(); changed.push('address'); }
      if (input.stopdesk_id) {
        const s = db.get('SELECT * FROM stopdesks WHERE id=?', input.stopdesk_id);
        if (s && s.wilaya_code === d.wilaya_code) { d.stopdesk_id = s.id; d.commune ||= s.commune; changed.push('stopdesk'); }
      }
      if (input.customer_name) { d.customer_name = input.customer_name.trim(); changed.push('customer_name'); }
      const phone = input.use_whatsapp_number ? localPhone(conv.wa_phone) : input.phone;
      if (phone) {
        if (!isValidDzMobile(phone)) { saveState(conv); return { error: 'invalid_phone', hint: 'رقم جزائري: 05/06/07 + 8 أرقام' }; }
        d.phone = localPhone(phone); changed.push('phone');
      }
      saveState(conv);
      const v = draftView(conv);
      return { saved: changed, missing: v.missing, total: v.total, summary_is_current: summaryCurrent(conv), consent_is_valid: consentValid(conv) };
    }
    case 'show_order_summary': {
      const v = draftView(conv);
      const need = ['product', 'wilaya', 'delivery_method'].filter((f) => v.missing.includes(f));
      if (need.length) return { error: 'missing_basics', missing: need };
      if (v.items.some((i) => i.stock < i.qty)) return { error: 'out_of_stock', items: v.items.filter((i) => i.stock < i.qty).map((i) => i.name) };
      const msgId = sendText(conv, summaryText(v, ctx.lang), { author: 'ai' });
      conv.state.summary = { hash: draftHash(v), msgId };
      saveState(conv);
      return { sent: true, total: v.total, still_missing_after_consent: v.missing };
    }
    case 'record_purchase_consent': {
      const v = draftView(conv);
      const h = draftHash(v);
      if (!h || conv.state.summary?.hash !== h) return { error: 'summary_not_shown_or_outdated', hint: 'call show_order_summary first, then ask the customer to confirm' };
      if (!(ctx.inboundMsgId > conv.state.summary.msgId)) return { error: 'consent_must_come_after_summary' };
      conv.state.consent = { hash: h, messageId: ctx.inboundMsgId, words: String(input.customer_words || '').slice(0, 300) };
      saveState(conv);
      return { recorded: true, still_missing: v.missing, note: v.missing.length ? 'ask ONLY for the missing fields' : 'all set — the order is sent automatically, do not ask to confirm again' };
    }
    case 'track_order': {
      const own = ownOrders(conv);
      const list = input.order_number ? own.filter((o) => o.number === String(input.order_number).toUpperCase().replace('-', '')) : own.slice(0, 3);
      if (!list.length) return { found: false, note: input.order_number ? 'no order with this number linked to this phone' : 'no orders for this phone' };
      return { found: true, orders: list.map((o) => ({ number: o.number, status: ORDER_STATUS[o.status], status_code: o.status, total_dzd: o.total, carrier: o.carrier_code, tracking: o.tracking, created_at: o.created_at })) };
    }
    case 'request_return': {
      const own = ownOrders(conv);
      const o = input.order_number ? own.find((x) => x.number === String(input.order_number).toUpperCase().replace('-', '')) : own.find((x) => x.status === 'delivered') || own[0];
      if (!o) return { error: 'order_not_found_for_this_phone' };
      const r = await createCustomerReturn(o, input.reason, { conversationId: conv.id });
      if (!r.ok) return { error: r.code, message: r.message, order: o.number, status: ORDER_STATUS[o.status] };
      if (!r.auto && !r.existing) { setMode(conv, 'human', { reason: `روتور ${o.number} يحتاج قرار` }); ctx.handedOff = true; }
      return { order: o.number, return_status: RETURN_STATUS[r.ret.status], auto_accepted: !!r.auto, in_policy_window: r.inWindow, existing: !!r.existing };
    }
    case 'edit_pending_order': {
      const id = conv.state.editing_order_id;
      const o = id && getOrder(id);
      if (!o || o.wa_phone !== conv.wa_phone || o.status !== 'awaiting_confirmation') return { error: 'no_order_being_edited' };
      const upd = {};
      if (input.wilaya) { const w = findWilaya(input.wilaya) || wilayaByCode(input.wilaya); if (w) upd.wilaya_code = w.code; }
      if (input.commune) upd.commune = input.commune;
      if (input.address) upd.address = input.address;
      if (input.delivery_method) upd.delivery_method = input.delivery_method;
      if (input.customer_name) upd.customer_name = input.customer_name;
      if (input.phone && isValidDzMobile(input.phone)) upd.phone = localPhone(input.phone);
      if (Object.keys(upd).length) db.update('orders', o.id, upd);
      const items = orderItems(o.id);
      if (input.qty && items.length === 1) db.run('UPDATE order_items SET qty=? WHERE id=?', input.qty, items[0].id);
      const n = recalcOrder(o.id);
      audit('order.edit.whatsapp', { actor: 'customer', entity: 'orders', entityId: o.id, details: input });
      delete conv.state.editing_order_id;
      saveState(conv);
      sendOrderConfirmation(n);
      ctx.sentConfirmation = true;
      return { updated: true, total_changed: n.total !== o.total, address_changed: ['wilaya_code', 'commune', 'address', 'delivery_method'].some((k) => k in upd), new_total: n.total, note: 'updated summary with buttons was sent; just say it briefly' };
    }
    case 'handoff_to_human': {
      setMode(conv, 'human', { reason: input.reason });
      audit('conversation.handoff', { actor: 'ai', entity: 'conversations', entityId: conv.id, details: input });
      ctx.handedOff = true;
      return { ok: true, note: 'tell the customer a team member will answer soon' };
    }
    case 'cancel_draft': {
      delete conv.state.draft; delete conv.state.summary; delete conv.state.consent;
      saveState(conv);
      return { ok: true };
    }
    default: return { error: 'unknown_tool' };
  }
}

// كل زبون يشوف غير الطلبات المربوطة برقمو
export function ownOrders(conv) {
  return db.all('SELECT * FROM orders WHERE wa_phone=? OR phone=? ORDER BY id DESC LIMIT 20', conv.wa_phone, localPhone(conv.wa_phone));
}
