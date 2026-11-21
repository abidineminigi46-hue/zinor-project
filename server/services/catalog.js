import { db } from '../db.js';
import { wilayaByCode, normText } from '../data/wilayas.js';

export const listProducts = (all = false) =>
  db.all(`SELECT * FROM products ${all ? '' : 'WHERE active=1'} ORDER BY id`);
export const getProduct = (id) => db.get('SELECT * FROM products WHERE id=?', id);
export const productBySku = (sku) => db.get('SELECT * FROM products WHERE sku=?', sku);

// بحث بسيط بالكلمات (عربية/لاتينية/فرنسية)
export function searchProducts(query) {
  const q = normText(query);
  const products = listProducts();
  if (!q.trim()) return products;
  const scored = products.map((p) => {
    const hay = normText([p.name, p.name_fr, p.keywords, p.sku].join(' '));
    const words = hay.split(/[\s,]+/).filter((w) => w.length > 2);
    let score = 0;
    for (const w of words) if (q.includes(w)) score += w.length;
    return { p, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.map((x) => x.p);
}

export function deliveryQuote(wilayaCode) {
  const w = wilayaByCode(wilayaCode);
  if (!w) return null;
  const r = db.get('SELECT * FROM delivery_rates WHERE wilaya_code=?', w.code);
  if (!r || !r.active) return { wilaya: w, available: false };
  const desks = db.all('SELECT id, name, commune, address, carrier_code FROM stopdesks WHERE wilaya_code=? ORDER BY id', w.code);
  return {
    wilaya: w, available: true,
    home: r.home_price != null ? { price: r.home_price, days: r.home_days } : null,
    desk: r.desk_price != null ? { price: r.desk_price, days: r.desk_days } : null,
    stopdesks: desks,
  };
}

export function deliveryFee(wilayaCode, method) {
  const q = deliveryQuote(wilayaCode);
  if (!q?.available) return null;
  return q[method]?.price ?? null;
}

export const dzd = (n) => Number(n || 0).toLocaleString('fr-DZ').replace(/ | /g, ' ');
