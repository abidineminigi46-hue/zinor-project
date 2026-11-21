// ZR Express — واجهة Procolis (https://procolis.com/api_v1/) برؤوس token / key
// ملاحظة: ZR Express عندها منصّة جديدة (api.zrexpress.app بـ Secret Key + Tenant ID)؛ توثيقها يلزم يتطلب من الشركة.
import { ConnectorError, httpJson, simulator } from './base.js';

const BASE = 'https://procolis.com/api_v1';

export default {
  code: 'zr_express',
  name: 'ZR Express',
  website: 'https://zrexpress.com',
  docsUrl: 'https://procolis.com',
  docsStatus: 'needs_verification',
  docsNote:
    'مبني على API Procolis القديمة: POST add_colis (الحقل Tracking نحطّوه حنا = مرجع فريد ضد التكرار)، POST lire للتتبع، POST token للاختبار. ' +
    'ما فيهاش webhook → التحديث بالتحقق الدوري. ما فيهاش طلب جمع روتور. المنصة الجديدة (Secret Key + Tenant ID) توثيقها ماشي عمومي — اطلبوه من ZR Express وزيدو موصّل zr_express_v2 بنفس الواجهة.',
  capabilities: {
    createShipment: true, tracking: true, webhook: false, polling: true, returnPickup: false,
    stopDesks: true, outForDeliveryStatus: true, eta: false,
  },
  credentialFields: [
    { key: 'token', label: 'Token', secret: true },
    { key: 'key', label: 'Key', secret: true },
  ],
  settingsFields: [],
  statusMap: {
    'En Préparation': 'created', 'Prêt à expédier': 'created', 'Dispatcher': 'picked_up', 'Expédié': 'in_transit',
    'Vers Wilaya': 'in_transit', 'Transfert': 'in_transit', 'Au Bureau': 'at_hub', 'Reçu à Wilaya': 'at_hub',
    'En livraison': 'out_for_delivery', 'Sortie en livraison': 'out_for_delivery',
    'Tentative échouée': 'delivery_failed', 'Report': 'delivery_failed', 'Non joignable': 'delivery_failed',
    'Ne répond pas': 'delivery_failed', 'Reporté': 'delivery_failed',
    'Livrée': 'delivered', 'Livré': 'delivered',
    'Annulé': 'returning', 'Retour vers centre': 'returning', 'Retour Navette': 'returning', 'Retour transite': 'returning',
    'Retour reçu': 'returned', 'Retourné au vendeur': 'returned', 'Retour Livré': 'returned',
  },

  headers(account) {
    const c = account.credentials || {};
    if (!c.token || !c.key) throw new ConnectorError('auth', 'Token و Key ناقصين');
    return { token: c.token, key: c.key };
  },

  async testConnection(account) {
    if (account.mode === 'simulation') return { ok: true, message: 'وضع تجريبي — محاكاة صالحة' };
    const r = await httpJson(`${BASE}/token`, { method: 'POST', headers: this.headers(account), body: {} });
    const statut = r?.Statut || r?.statut || '';
    if (/activ/i.test(statut)) return { ok: true, message: statut };
    throw new ConnectorError('auth', statut || 'الحساب غير مفعّل');
  },

  async createShipment(account, s) {
    if (account.mode === 'simulation') return simulator.create(this.code, 'ZR', account, s);
    const colis = {
      Tracking: s.reference, TypeLivraison: s.method === 'desk' ? '1' : '0', TypeColis: '0', Confrimee: '',
      Client: s.customerName, MobileA: s.phone, MobileB: s.phone2 || '', Adresse: s.address || s.communeName,
      IDWilaya: String(s.wilayaCode), Commune: s.communeName, Total: String(s.codAmount), Note: s.note || '',
      TProduit: s.products, id_Externe: s.reference, Source: 'Zinor',
    };
    const r = await httpJson(`${BASE}/add_colis`, { method: 'POST', headers: this.headers(account), body: { Colis: [colis] } });
    const row = r?.Colis?.[0];
    if (!row) throw new ConnectorError('unknown_result', 'جواب ZR ما فيهش الطرد', { data: r });
    if (row.MessageRetour && !/good|ok|ajout/i.test(row.MessageRetour)) throw new ConnectorError('validation', row.MessageRetour, { data: r });
    return { tracking: row.Tracking || s.reference, externalId: row.Tracking || s.reference, labelUrl: null };
  },

  async findShipment(account, reference) {
    if (account.mode === 'simulation') return simulator.find(this.code, account, reference);
    const r = await httpJson(`${BASE}/lire`, { method: 'POST', headers: this.headers(account), body: { Colis: [{ Tracking: reference }] } });
    const row = r?.Colis?.[0];
    return row && row.Situation ? { tracking: row.Tracking || reference, externalId: reference } : null;
  },

  async getTracking(account, tracking) {
    if (account.mode === 'simulation') return [];
    const r = await httpJson(`${BASE}/lire`, { method: 'POST', headers: this.headers(account), body: { Colis: [{ Tracking: tracking }] } });
    const row = r?.Colis?.[0];
    if (!row?.Situation) return [];
    const at = row.DateH_Action || row.Date_Action || null;
    return [{ externalStatus: row.Situation, occurredAt: at, note: row.Motif || null, eventId: `${tracking}:${row.Situation}:${at || ''}` }];
  },

  verifyWebhook() { return false; },
  parseWebhook() { return []; },

  async requestReturnPickup(account) {
    if (account.mode === 'simulation') return simulator.pickup('ZR');
    throw new ConnectorError('not_supported', 'ZR Express (Procolis): ما كانش طلب جمع روتور في الـAPI — نسّقو مع المكتب');
  },
};
