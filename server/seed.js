// بيانات التجربة (وهمية) — تتزاد أوتوماتيكياً كي تكون القاعدة فارغة
import fs from 'node:fs';
import { config } from './config.js';
import { db, openDb } from './db.js';
import { hashPassword, encrypt, randomToken } from './crypto.js';
import { WILAYAS } from './data/wilayas.js';

const CENTER = [2, 6, 9, 10, 15, 16, 26, 35, 42, 44];
const FAR_SOUTH = [1, 8, 11, 33, 37, 49, 50, 52, 53, 54, 56, 58];

export function seedIfEmpty({ quiet = false } = {}) {
  if (db.get('SELECT COUNT(*) n FROM users').n) return false;
  db.tx(() => {
    db.insert('users', { email: 'admin@zinor.local', name: 'المشرف', role: 'admin', password_hash: hashPassword('admin12345') });
    db.insert('users', { email: 'agent@zinor.local', name: 'سارة (موظفة)', role: 'agent', password_hash: hashPassword('agent12345') });

    const products = [
      ['ZN-OUD-01', 'عطر عود رويال', 'Parfum Oud Royal', 'oud,عود,parfum,عطر,ريحة,riha,fragrance', 'عطر عود فاخر 100ml يدوم طول النهار', 3200, 40],
      ['ZN-WAT-02', 'ساعة كلاسيك جلد', 'Montre Classic cuir', 'montre,ساعة,ساعه,saa3a,sa3a,watch,magana,منقانة', 'ساعة رجالية بسوار جلد، ضمان 6 أشهر', 4500, 25],
      ['ZN-BAG-03', 'ساك جلد نسائي', 'Sac à main cuir', 'sac,ساك,حقيبة,حقيبه,شنطة,bag', 'ساك يد نسائي جلد طبيعي، 3 ألوان', 5200, 15],
      ['ZN-EAR-04', 'كيتمان بلوتوث برو', 'Écouteurs Bluetooth Pro', 'ecouteur,écouteurs,كيتمان,kitman,airpods,bluetooth,بلوتوث,سماعات', 'سماعات لاسلكية مع علبة شحن، 24 ساعة', 2800, 60],
      ['ZN-SKN-05', 'كوفري العناية بالوجه', 'Coffret soin visage', 'coffret,soin,كوفري,كريم,creme,crème,عناية,skincare', 'كريم + سيروم + غسول، لكل أنواع البشرة', 3900, 0],
    ];
    for (const [sku, name, name_fr, keywords, description, price, stock] of products) db.insert('products', { sku, name, name_fr, keywords, description, price, stock });

    for (const w of WILAYAS) {
      const tier = w.code === 16 ? [500, 300] : CENTER.includes(w.code) ? [600, 400] : FAR_SOUTH.includes(w.code) ? [1400, 900] : [800, 450];
      db.insert('delivery_rates', { wilaya_code: w.code, home_price: tier[0], desk_price: tier[1], home_days: FAR_SOUTH.includes(w.code) ? '72-120' : '24-48', desk_days: FAR_SOUTH.includes(w.code) ? '72-96' : '24-72' });
    }
    const desks = [[9, 'مكتب البليدة وسط', 'Blida'], [9, 'مكتب بوفاريك', 'Boufarik'], [16, 'مكتب باب الزوار', 'Bab Ezzouar'], [16, 'مكتب الشراقة', 'Cheraga'], [31, 'مكتب حي السلام', 'Es Senia'], [31, 'مكتب بير الجير', 'Bir El Djir'], [19, 'مكتب سطيف وسط', 'Sétif']];
    desks.forEach(([wc, name, commune], i) => db.insert('stopdesks', { carrier_code: 'zr_express', wilaya_code: wc, name, commune, external_id: String(100 + i) }));

    db.insert('carrier_accounts', { carrier_code: 'zr_express', label: 'ZR Express — حساب رئيسي', mode: 'simulation', is_default: 1, status: 'simulation', credentials: encrypt({}) });
    db.insert('carrier_accounts', { carrier_code: 'yalidine', label: 'Yalidine', mode: 'simulation', status: 'simulation', credentials: encrypt({}) });
    db.insert('carrier_rules', { priority: 10, wilaya_code: 31, delivery_method: null, carrier_account_id: 2 }); // وهران → Yalidine

    db.insert('store_accounts', { platform: 'shopify', label: 'متجر Shopify', mode: 'simulation', status: 'simulation', credentials: encrypt({ webhook_secret: randomToken(16) }) });
    db.insert('store_accounts', { platform: 'woocommerce', label: 'موقع WooCommerce', mode: 'simulation', status: 'simulation', credentials: encrypt({ webhook_secret: randomToken(16) }) });
    db.insert('store_accounts', { platform: 'youcan', label: 'متجر YouCan', mode: 'live', status: 'needs_config', credentials: encrypt({}) });

    // طلبات تاريخية وهمية للوحة (الإحصائيات وretour حسب الولاية)
    const demo = [
      ['ياسين م.', '0550110022', 23, 'delivered'], ['مريم ب.', '0661334455', 16, 'delivered'], ['كريم د.', '0770556677', 6, 'returned'],
      ['نور هـ.', '0552778899', 31, 'delivered'], ['رياض س.', '0663990011', 9, 'out_for_delivery'], ['سلمى ج.', '0771223344', 30, 'returned'],
      ['أمين أ.', '0554556677', 31, 'shipped'], ['ليندة ك.', '0665889900', 16, 'delivered'], ['نبيل ج.', '0773112233', 13, 'new'],
      ['هدى و.', '0556445566', 25, 'delivered'], ['سمير ع.', '0667778899', 23, 'returned'], ['إيمان ف.', '0779001122', 19, 'delivered'],
    ];
    demo.forEach(([name, phone, wc, status], i) => {
      const p = 1 + (i % 4);
      const pr = db.get('SELECT price FROM products WHERE id=?', p).price;
      const fee = db.get('SELECT home_price FROM delivery_rates WHERE wilaya_code=?', wc).home_price;
      const created = `datetime('now', '-${12 - i} days')`;
      const id = db.insert('orders', {
        number: `ZN${1001 + i}`, source: ['store', 'whatsapp', 'manual'][i % 3], store_platform: i % 3 === 0 ? 'shopify' : null, customer_name: name, phone,
        wilaya_code: wc, commune: 'وسط المدينة', address: 'عنوان تجريبي', delivery_method: 'home', items_total: pr, delivery_fee: fee, total: pr + fee, status,
        carrier_code: status === 'new' ? null : 'zr_express', carrier_account_id: status === 'new' ? null : 1, tracking: status === 'new' ? null : `ZR-DEMO${i}`, notes: 'بيانات تجريبية',
      });
      db.run(`UPDATE orders SET created_at=${created}, updated_at=${created} WHERE id=?`, id);
      db.insert('order_items', { order_id: id, product_id: p, sku: `demo`, name: db.get('SELECT name FROM products WHERE id=?', p).name, qty: 1, unit_price: pr });
      db.insert('order_events', { order_id: id, status, note: 'بيانات تجريبية', actor: 'seed' });
    });
  });
  if (!quiet) console.log('🌱 تزادت بيانات التجربة — admin@zinor.local / admin12345 · agent@zinor.local / agent12345');
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--reset')) for (const f of [config.dbPath, config.dbPath + '-wal', config.dbPath + '-shm']) fs.rmSync(f, { force: true });
  openDb();
  if (!seedIfEmpty()) console.log('القاعدة فيها بيانات من قبل. استعمل --reset باش تعاود.');
}
