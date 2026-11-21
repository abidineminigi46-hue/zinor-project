import { db } from '../db.js';

// توحيد أرقام الهاتف الجزائرية: 0550123456 / +213550123456 / 213550123456 → 213550123456
export function normPhone(p) {
  if (!p) return null;
  let d = String(p).replace(/[^\d]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 10) d = '213' + d.slice(1);
  if (d.length === 9 && /^[567]/.test(d)) d = '213' + d;
  return d;
}
// الصيغة المحلية للشحن: 0550123456
export function localPhone(p) {
  const n = normPhone(p);
  if (!n) return null;
  return n.startsWith('213') ? '0' + n.slice(3) : n;
}
export const isValidDzMobile = (p) => /^0[567]\d{8}$/.test(localPhone(p) || '') || /^0[2-4]\d{7}$/.test(localPhone(p) || '');

export function upsertCustomerByWa(waPhone, patch = {}) {
  const wa = normPhone(waPhone);
  let c = db.get('SELECT * FROM customers WHERE wa_phone=?', wa);
  if (!c) {
    const id = db.insert('customers', { wa_phone: wa, ...patch });
    return db.get('SELECT * FROM customers WHERE id=?', id);
  }
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null && v !== ''));
  if (Object.keys(clean).length) db.update('customers', c.id, clean);
  return db.get('SELECT * FROM customers WHERE id=?', c.id);
}
