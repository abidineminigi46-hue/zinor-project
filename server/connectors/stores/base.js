// ─────────────────────────────────────────────────────────────────────────────
// الواجهة الداخلية الموحّدة لكل منصّة متجر (Store Connector)
// {
//   platform, name, docsUrl, docsStatus: 'documented'|'needs_verification'|'not_public', docsNote,
//   capabilities: { webhookOrders, statusSync, trackingSync },
//   credentialFields, settingsFields,
//   webhookHelp,                                   // واش يحط المستعمل في لوحة المنصّة
//   verifyWebhook(account, req)        → boolean
//   eventKey(req, body)                → string     (لمنع تكرار نفس الحدث)
//   isOrderEvent(req, body)            → boolean
//   parseOrder(body, account)          → NormalizedOrder
//   testConnection(account)            → { ok, message }
//   pushUpdate(account, order, event)  → { ok, message }  event: { type:'shipped'|'delivered'|'returned'|'cancelled', tracking, carrierName }
// }
// NormalizedOrder = { externalId, externalNumber, customerName, phone, wilayaText, commune, address,
//                     method:'home'|'desk'|null, items:[{sku,name,qty,unitPrice}], deliveryFee, total, note }
// ─────────────────────────────────────────────────────────────────────────────
import { hmac, safeEqual } from '../../crypto.js';
import { ConnectorError, httpJson } from '../carriers/base.js';

export { ConnectorError, httpJson };

export function verifyHmac(req, secret, header, enc = 'hex') {
  if (!secret) return false;
  const sig = req.headers[header.toLowerCase()];
  if (!sig) return false;
  const calc = hmac('sha256', secret, req.rawBody, enc);
  return safeEqual(String(sig).replace(/^sha256=/, ''), calc);
}

export const guessMethod = (...texts) => {
  const t = texts.filter(Boolean).join(' ').toLowerCase();
  if (/stop ?desk|bureau|agence|مكتب|desk|point relais/.test(t)) return 'desk';
  if (/domicile|home|منزل|الدار|à domicile/.test(t)) return 'home';
  return null;
};

export const num = (v) => Math.round(Number(String(v ?? 0).replace(/[^\d.]/g, '')) || 0);

// قراءة حقل بمسار "a.b.0.c"
export const pick = (obj, path) => String(path || '').split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
