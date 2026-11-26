import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','agent')), password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY, sku TEXT UNIQUE NOT NULL, name TEXT NOT NULL, name_fr TEXT, keywords TEXT DEFAULT '',
  description TEXT DEFAULT '', price INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  weight_kg REAL DEFAULT 0.5);

CREATE TABLE IF NOT EXISTS delivery_rates(
  wilaya_code INTEGER PRIMARY KEY, home_price INTEGER, desk_price INTEGER,
  home_days TEXT DEFAULT '24-48 سا', desk_days TEXT DEFAULT '24-72 سا', active INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS stopdesks(
  id INTEGER PRIMARY KEY, carrier_code TEXT NOT NULL, wilaya_code INTEGER NOT NULL, name TEXT NOT NULL,
  commune TEXT, address TEXT, external_id TEXT);

CREATE TABLE IF NOT EXISTS customers(
  id INTEGER PRIMARY KEY, wa_phone TEXT UNIQUE, name TEXT, phone TEXT, wilaya_code INTEGER, commune TEXT,
  address TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS conversations(
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, wa_phone TEXT UNIQUE NOT NULL,
  mode TEXT NOT NULL DEFAULT 'ai' CHECK(mode IN ('ai','human')), assigned_user_id INTEGER,
  needs_human INTEGER NOT NULL DEFAULT 0, handoff_reason TEXT, last_inbound_at TEXT, state TEXT NOT NULL DEFAULT '{}',
  ai_history TEXT NOT NULL DEFAULT '[]', unread INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY, conversation_id INTEGER NOT NULL, direction TEXT NOT NULL CHECK(direction IN ('in','out')),
  author TEXT NOT NULL CHECK(author IN ('customer','ai','agent','system')), agent_user_id INTEGER,
  type TEXT NOT NULL DEFAULT 'text', body TEXT NOT NULL, buttons TEXT, template_name TEXT,
  wa_message_id TEXT UNIQUE, status TEXT, error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);

CREATE TABLE IF NOT EXISTS store_accounts(
  id INTEGER PRIMARY KEY, platform TEXT NOT NULL, label TEXT NOT NULL, credentials TEXT, settings TEXT NOT NULL DEFAULT '{}',
  mode TEXT NOT NULL DEFAULT 'simulation' CHECK(mode IN ('live','simulation')), enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'needs_config', last_error TEXT, last_event_at TEXT, deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS carrier_accounts(
  id INTEGER PRIMARY KEY, carrier_code TEXT NOT NULL, label TEXT NOT NULL, credentials TEXT, settings TEXT NOT NULL DEFAULT '{}',
  mode TEXT NOT NULL DEFAULT 'simulation' CHECK(mode IN ('live','simulation')), enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'needs_config', last_error TEXT, last_test_at TEXT,
  deleted_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS carrier_rules(
  id INTEGER PRIMARY KEY, priority INTEGER NOT NULL DEFAULT 100, wilaya_code INTEGER, delivery_method TEXT,
  carrier_account_id INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY, number TEXT UNIQUE NOT NULL, source TEXT NOT NULL CHECK(source IN ('whatsapp','store','manual')),
  store_account_id INTEGER, store_platform TEXT, external_id TEXT, customer_id INTEGER, conversation_id INTEGER,
  customer_name TEXT, phone TEXT, wa_phone TEXT, wilaya_code INTEGER, commune TEXT, address TEXT,
  delivery_method TEXT CHECK(delivery_method IN ('home','desk')), stopdesk_id INTEGER,
  items_total INTEGER NOT NULL DEFAULT 0, delivery_fee INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, carrier_account_id INTEGER, carrier_code TEXT, tracking TEXT,
  consent_message_id INTEGER, consent_text TEXT, confirmed_at TEXT, confirmed_via TEXT,
  last_error TEXT, notes TEXT, created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_account_id, external_id));
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_wa ON orders(wa_phone);

CREATE TABLE IF NOT EXISTS order_items(
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, product_id INTEGER, sku TEXT, name TEXT NOT NULL,
  qty INTEGER NOT NULL, unit_price INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS order_events(
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, status TEXT NOT NULL, note TEXT, actor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS shipments(
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, carrier_account_id INTEGER NOT NULL, carrier_code TEXT NOT NULL,
  dispatch_ref TEXT UNIQUE NOT NULL, state TEXT NOT NULL CHECK(state IN ('creating','created','failed','unknown')),
  tracking TEXT, external_id TEXT, label_url TEXT, status TEXT, external_status TEXT, last_event_at TEXT,
  attempt_no INTEGER NOT NULL DEFAULT 0, failure_reason TEXT, last_error TEXT, kind TEXT NOT NULL DEFAULT 'outbound',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_ship_tracking ON shipments(carrier_code, tracking);

CREATE TABLE IF NOT EXISTS shipment_events(
  id INTEGER PRIMARY KEY, shipment_id INTEGER NOT NULL, event_key TEXT UNIQUE NOT NULL, external_status TEXT,
  status TEXT, occurred_at TEXT, applied INTEGER NOT NULL DEFAULT 0, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS returns(
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, type TEXT NOT NULL CHECK(type IN ('rto','customer')),
  status TEXT NOT NULL, reason TEXT, reason_code TEXT, decided_by INTEGER, decision_note TEXT,
  pickup_shipment_id INTEGER, pickup_tracking TEXT, conversation_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY, dedupe_key TEXT UNIQUE NOT NULL, order_id INTEGER, kind TEXT NOT NULL, message_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS webhook_events(
  id INTEGER PRIMARY KEY, source TEXT NOT NULL, event_key TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, event_key));

CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY, level TEXT NOT NULL DEFAULT 'info', user_id INTEGER, actor TEXT, action TEXT NOT NULL,
  entity TEXT, entity_id INTEGER, details TEXT, retryable INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));

-- محاولات الاتصال المبرمجة (Zinor هو اللي يسيّر الجدولة)
CREATE TABLE IF NOT EXISTS call_tasks(
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'auto' CHECK(kind IN ('auto','callback','manual')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','dialing','done','cancelled')),
  scheduled_for TEXT NOT NULL, day TEXT, window_index INTEGER, attempt_no INTEGER NOT NULL DEFAULT 1,
  call_id INTEGER, result TEXT, reason TEXT, error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_call_tasks_due ON call_tasks(status, scheduled_for);

-- المكالمات (صادرة/واردة) + نص الحوار + النتيجة
CREATE TABLE IF NOT EXISTS calls(
  id INTEGER PRIMARY KEY, direction TEXT NOT NULL CHECK(direction IN ('out','in')), order_id INTEGER, task_id INTEGER,
  phone TEXT NOT NULL, provider TEXT NOT NULL, provider_call_id TEXT UNIQUE, real INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued', outcome TEXT, state TEXT NOT NULL DEFAULT '{}', transcript TEXT NOT NULL DEFAULT '[]',
  error TEXT, started_at TEXT, ended_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));

-- تسجيلات المقدّمة المرفوعة من اللوحة
CREATE TABLE IF NOT EXISTS media(
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'intro', name TEXT NOT NULL, mime TEXT NOT NULL, file TEXT NOT NULL,
  size INTEGER NOT NULL, uploaded_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));

-- "شركة توصيل" تجريبية تحاكي API حقيقية (للتجربة بلا مفاتيح)
CREATE TABLE IF NOT EXISTS sim_parcels(
  id INTEGER PRIMARY KEY, carrier_code TEXT NOT NULL, account_id INTEGER NOT NULL, reference TEXT NOT NULL,
  tracking TEXT UNIQUE NOT NULL, payload TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(carrier_code, account_id, reference));
`;

class DB {
  constructor(file) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.raw.exec(SCHEMA);
    this.migrate();
    this.depth = 0;
  }
  // ترقية قاعدة بيانات قديمة بلا ما تضيع البيانات
  migrate() {
    const add = (table, col, def) => {
      const cols = this.raw.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
      if (!cols.includes(col)) this.raw.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    };
    add('orders', 'source_channel', 'TEXT');          // store | woocommerce | whatsapp_chat | whatsapp_campaign | manual
    add('orders', 'campaign_id', 'TEXT');
    add('orders', 'payment_method', 'TEXT');          // cod | prepaid | null
    add('orders', 'confirm_mode', 'TEXT');            // whatsapp | call | whatsapp_call | manual
    add('orders', 'do_not_call', 'INTEGER NOT NULL DEFAULT 0');
    add('orders', 'assigned_user_id', 'INTEGER');
    add('orders', 'review_reason', 'TEXT');
  }
  run(sql, ...p) { return this.raw.prepare(sql).run(...p); }
  get(sql, ...p) { const r = this.raw.prepare(sql).get(...p); return r ? { ...r } : undefined; }
  all(sql, ...p) { return this.raw.prepare(sql).all(...p).map((r) => ({ ...r })); }
  insert(table, obj) {
    const keys = Object.keys(obj);
    const r = this.run(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`, ...keys.map((k) => norm(obj[k])));
    return Number(r.lastInsertRowid);
  }
  update(table, id, obj) {
    const keys = Object.keys(obj);
    if (!keys.length) return;
    this.run(`UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...keys.map((k) => norm(obj[k])), id);
  }
  tx(fn) {
    if (this.depth > 0) return fn();
    this.depth++;
    this.raw.exec('BEGIN IMMEDIATE');
    try { const r = fn(); this.raw.exec('COMMIT'); return r; }
    catch (e) { this.raw.exec('ROLLBACK'); throw e; }
    finally { this.depth--; }
  }
  close() { this.raw.close(); }
}
const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v !== null && typeof v === 'object') ? JSON.stringify(v) : v);

export let db;
export function openDb(file = config.dbPath) { db = new DB(file); return db; }
export const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
