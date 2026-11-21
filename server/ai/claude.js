// المساعد بـ Claude (Anthropic Messages API + tool use). يستعمل نفس أدوات tools.js.
import { config } from '../config.js';
import { db } from '../db.js';
import { TOOL_DEFS, executeTool, draftView, summaryCurrent, consentValid } from './tools.js';
import { getSetting } from '../services/settings.js';
import { getOrder } from '../services/orders.js';

let client;
async function getClient() {
  if (client) return client;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  client = new Anthropic({ apiKey: config.ai.apiKey });
  return client;
}

const SYSTEM = (store) => `You are the WhatsApp sales & support assistant of "${store.name}", an Algerian online store (cash on delivery, prices in Algerian dinars, DA/دج).

LANGUAGE & STYLE
- Customers write Algerian Darija in Arabic script, Darija in Latin letters/Arabizi (ch7al, 3andkom, nheb, dirli, l dar…), or French. Reply in the SAME style and script the customer just used.
- Short, natural, friendly WhatsApp messages (1–3 short lines). Answer directly when the question is clear. Context-aware: never re-ask something the customer already gave (check the draft in <context>). Do not start every message with a greeting; greet at most once at the start.
- Example: "salam ch7al livraison l Blida" → get_delivery_quote("Blida") then answer in Latin Darija with both prices (l dar / l bureau) or ask which they prefer.
- If asked whether they talk to a bot/robot/human, answer honestly that you are an automated assistant and offer a human.

FACTS COME FROM TOOLS ONLY
- Prices, stock, delivery fees/delays, order status and tracking must come from tools. Never invent numbers, products, delays or policies. If info is missing, ask for it.
- Save every detail the customer gives with update_order_draft (product, qty, wilaya, commune, address, home/desk, stop desk, name, phone), even if they are only asking — saving never creates an order.
- The WhatsApp number may be used as delivery phone only if the customer says so (use_whatsapp_number=true); otherwise ask for the delivery phone.

ORDER FLOW (no confirmation call; the server ships automatically)
1. When the customer shows buying intent and product + wilaya + delivery method are known, call show_order_summary (it sends the official summary with the total incl. delivery). Then ask a short confirmation question. Do not restate the summary.
2. Only when the customer clearly agrees after seeing the current summary ("ih dirli had la commande", "نأكد", "oui je confirme", "ok ديرلي"), call record_purchase_consent with their words.
3. Then ask ONLY for still-missing fields (name, phone, commune, address for home, stop desk for desk). When everything is complete the server sends the order to the delivery company and the customer receives the confirmation with tracking — never ask them to confirm again and never mention a phone call.
4. If they give name/phone but did not agree to buy, do NOT record consent; keep the conversation going and ask what they want.
5. If the summary changes (product, qty, wilaya, delivery method), consent is reset: show the new summary and ask again.

OTHER
- Tracking: track_order (only this customer's orders). Returns after delivery: request_return with their reason; a parcel not delivered yet is not a return.
- When a store order is being edited (<context> editing_order), use edit_pending_order.
- Hand off to a human (handoff_to_human) for complaints, disputes, requests for a person, or anything you cannot solve with the tools. Return policy: ${getSetting('returns').note}`;

function history(conv) {
  const rows = db.all('SELECT direction, author, body FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 30', conv.id).reverse();
  const msgs = [];
  for (const r of rows) {
    const role = r.direction === 'in' ? 'user' : 'assistant';
    const text = r.author === 'agent' ? `[staff] ${r.body}` : r.author === 'system' ? `[automatic message] ${r.body}` : r.body;
    const last = msgs.at(-1);
    if (last && last.role === role) last.content += `\n${text}`; else msgs.push({ role, content: text });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

function contextBlock(conv) {
  const v = draftView(conv);
  const editing = conv.state.editing_order_id ? getOrder(conv.state.editing_order_id) : null;
  return `<context>${JSON.stringify({
    whatsapp_number: conv.wa_phone,
    draft: { items: v.items.map((i) => ({ id: i.product_id, name: i.name, qty: i.qty, price: i.unit_price })), wilaya: v.wilaya?.fr, commune: v.commune, address: v.address,
      delivery_method: v.delivery_method, stopdesk: v.stopdesk?.name, customer_name: v.customer_name, phone: v.phone, total: v.total, missing: v.missing },
    summary_shown_and_current: summaryCurrent(conv), purchase_consent_recorded: consentValid(conv),
    editing_order: editing ? { number: editing.number, total: editing.total } : null,
  })}</context>`;
}

export async function claudeBrain(ctx) {
  const c = await getClient();
  const store = getSetting('store');
  const messages = history(ctx.conv);
  if (!messages.length) return [];
  const last = messages.at(-1);
  last.content = [{ type: 'text', text: last.content }, { type: 'text', text: contextBlock(ctx.conv) }];
  const texts = [];
  for (let i = 0; i < 8; i++) {
    const res = await c.beta.messages.create({
      model: config.ai.model, max_tokens: 4000, system: [{ type: 'text', text: SYSTEM(store), cache_control: { type: 'ephemeral' } }],
      tools: TOOL_DEFS, messages, output_config: { effort: config.ai.effort },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    });
    if (res.stop_reason === 'refusal') { await executeTool(ctx, 'handoff_to_human', { reason: 'AI refusal' }); return ['نحوّلك لواحد من الفريق يجاوبك 🙏']; }
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (res.stop_reason !== 'tool_use') { if (text) texts.push(text); break; }
    messages.push({ role: 'assistant', content: res.content });
    const results = [];
    for (const b of res.content.filter((x) => x.type === 'tool_use')) {
      let out;
      try { out = await executeTool(ctx, b.name, b.input); } catch (e) { out = { error: e.message }; }
      results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out), is_error: Boolean(out?.error) });
    }
    messages.push({ role: 'user', content: results });
  }
  return texts;
}
