// Yalidine — https://api.yalidine.app/v1/  (رؤوس X-API-ID / X-API-TOKEN)
import { ConnectorError, httpJson, simulator } from './base.js';
import { hmac, safeEqual } from '../../crypto.js';
import { wilayaByCode } from '../../data/wilayas.js';

const BASE = 'https://api.yalidine.app/v1';

export default {
  code: 'yalidine',
  name: 'Yalidine',
  website: 'https://yalidine.com',
  docsUrl: 'https://yalidine.app/app/dev/docs/api/index.php',
  docsStatus: 'needs_verification',
  docsNote:
    'التوثيق متاح داخل حساب المطوّر (Yalidine → Développement). مبني على: POST /v1/parcels، GET /v1/parcels?order_id=، GET /v1/histories/{tracking}، ' +
    'Webhook parcel_status_updated (توقيع X-YALIDINE-SIGNATURE). طلب جمع روتور من الزبون ما كانش في الـAPI العمومية → يتنسّق يدوياً. ' +
    'لازم تتحقق من أسماء الحقول والحالات مع نسخة التوثيق في حسابك قبل التشغيل الحقيقي.',
  capabilities: {
    createShipment: true, tracking: true, webhook: true, polling: true, returnPickup: false,
    stopDesks: true, outForDeliveryStatus: true, eta: false,
  },
  credentialFields: [
    { key: 'api_id', label: 'API ID', secret: false },
    { key: 'api_token', label: 'API Token', secret: true },
    { key: 'webhook_secret', label: 'Webhook secret key (اختياري — للإشعارات)', secret: true, optional: true },
  ],
  settingsFields: [
    { key: 'from_wilaya', label: 'ولاية الإرسال (رقم)', type: 'number' },
  ],
  statusMap: {
    'En préparation': 'created', 'Pas encore expédié': 'created', 'A vérifier': 'created', 'Prêt à expédier': 'created',
    'Ramassé': 'picked_up', 'Bloqué': 'in_transit', 'Débloqué': 'in_transit', 'Transfert': 'in_transit', 'Expédié': 'in_transit',
    'Centre': 'at_hub', 'En localisation': 'in_transit', 'Vers Wilaya': 'in_transit', 'Reçu à Wilaya': 'at_hub',
    'En attente du client': 'at_hub', 'Prêt pour livreur': 'at_hub',
    'Sorti en livraison': 'out_for_delivery',
    'En attente': 'delivery_failed', 'En alerte': 'delivery_failed', 'Tentative échouée': 'delivery_failed', 'Alerte résolue': 'at_hub',
    'Livré': 'delivered',
    'Echèc livraison': 'returning', 'Echec livraison': 'returning', 'Retour vers centre': 'returning', 'Retourné au centre': 'returning',
    'Retour transfert': 'returning', 'Retour groupé': 'returning', 'Retour à retirer': 'returning', 'Retour vers vendeur': 'returning',
    'Echange échoué': 'returning', 'Retourné au vendeur': 'returned',
  },

  headers(account) {
    const c = account.credentials || {};
    if (!c.api_id || !c.api_token) throw new ConnectorError('auth', 'API ID و API Token ناقصين');
    return { 'X-API-ID': c.api_id, 'X-API-TOKEN': c.api_token };
  },

  async testConnection(account) {
    if (account.mode === 'simulation') return { ok: true, message: 'وضع تجريبي — محاكاة صالحة' };
    await httpJson(`${BASE}/wilayas/?page_size=1`, { headers: this.headers(account) });
    return { ok: true, message: 'الاتصال ناجح' };
  },

  async createShipment(account, s) {
    if (account.mode === 'simulation') return simulator.create(this.code, 'YAL', account, s);
    const from = wilayaByCode(account.settings?.from_wilaya || s.originWilayaCode);
    const parcel = {
      order_id: s.reference,
      from_wilaya_name: from?.fr,
      firstname: s.firstName, familyname: s.lastName || s.firstName,
      contact_phone: [s.phone, s.phone2].filter(Boolean).join(','),
      address: s.address || s.communeName,
      to_commune_name: s.communeName, to_wilaya_name: s.wilayaName,
      product_list: s.products, price: s.codAmount, do_insurance: false, declared_value: s.declaredValue,
      height: 10, width: 20, length: 30, weight: Math.max(1, Math.round(s.weightKg || 1)),
      freeshipping: false, is_stopdesk: s.method === 'desk',
      stopdesk_id: s.method === 'desk' ? Number(s.stopdesk?.external_id) || undefined : undefined,
      has_exchange: false,
    };
    const data = await httpJson(`${BASE}/parcels/`, { method: 'POST', headers: this.headers(account), body: [parcel] });
    const r = data?.[s.reference];
    if (!r) throw new ConnectorError('unknown_result', 'جواب Yalidine ما فيهش الطلب', { data });
    if (!r.success) throw new ConnectorError('validation', r.message || 'Yalidine رفضت الطرد', { data });
    return { tracking: r.tracking, externalId: r.import_id ?? r.tracking, labelUrl: r.label || null };
  },

  async findShipment(account, reference) {
    if (account.mode === 'simulation') return simulator.find(this.code, account, reference);
    const data = await httpJson(`${BASE}/parcels/?order_id=${encodeURIComponent(reference)}`, { headers: this.headers(account) });
    const p = data?.data?.[0];
    return p ? { tracking: p.tracking, externalId: p.tracking } : null;
  },

  async getTracking(account, tracking) {
    if (account.mode === 'simulation') return [];
    const data = await httpJson(`${BASE}/histories/${encodeURIComponent(tracking)}`, { headers: this.headers(account) });
    return (data?.data || []).map((h) => ({
      externalStatus: h.status, occurredAt: h.date_status, note: h.reason || null, eventId: `${tracking}:${h.date_status}:${h.status}`,
    }));
  },

  verifyWebhook(account, req) {
    if (account.mode === 'simulation') return true;
    const secret = account.credentials?.webhook_secret;
    if (!secret) return false;
    const sig = req.headers['x-yalidine-signature'];
    return safeEqual(sig, hmac('sha256', secret, req.rawBody));
  },

  // Yalidine تبعث GET ?subscribe=&crc_token= للتحقق من الرابط
  webhookChallenge(query) { return query.crc_token || null; },

  parseWebhook(account, body) {
    const events = body?.events || [];
    return events.filter((e) => !body.type || body.type === 'parcel_status_updated' || e.event_type === 'parcel_status_updated')
      .map((e) => ({
        eventId: e.event_id || `${e.data?.tracking}:${e.occurred_at}:${e.data?.status}`,
        tracking: e.data?.tracking, externalStatus: e.data?.status, occurredAt: e.occurred_at || e.data?.date_status,
        note: e.data?.reason || null,
      }));
  },

  async requestReturnPickup(account, input) {
    if (account.mode === 'simulation') return simulator.pickup('YAL');
    throw new ConnectorError('not_supported', 'Yalidine: جمع الروتور من عند الزبون ما كانش في الـAPI العمومية — نسّقو مع الشركة أو ابعثو طرد تبديل (has_exchange)');
  },
};
