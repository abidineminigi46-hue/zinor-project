// تشفير مفاتيح الربط (AES-256-GCM) + كلمات السر (scrypt) + HMAC
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

let KEY;
function key() {
  if (KEY) return KEY;
  let hex = config.secretKey;
  if (!hex) {
    const file = path.join(path.dirname(config.dbPath), '.secret-key');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    hex = fs.readFileSync(file, 'utf8').trim();
  }
  KEY = Buffer.from(hex, 'hex');
  if (KEY.length !== 32) throw new Error('APP_SECRET_KEY لازم يكون 64 حرف hex (32 بايت)');
  return KEY;
}

export function encrypt(obj) {
  if (obj == null) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decrypt(str) {
  if (!str) return {};
  const [, iv, tag, data] = str.split(':');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'));
}

export function maskSecrets(obj = {}, fields = []) {
  const out = {};
  for (const f of fields) {
    const v = obj[f.key];
    if (v == null || v === '') out[f.key] = '';
    else out[f.key] = f.secret ? '••••' + String(v).slice(-4) : v;
  }
  return out;
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 32);
  return `scrypt:${salt.toString('hex')}:${h.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [, salt, h] = String(stored).split(':');
  if (!salt) return false;
  const calc = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 32);
  return crypto.timingSafeEqual(calc, Buffer.from(h, 'hex'));
}

export function hmac(algo, secret, body, enc = 'hex') {
  return crypto.createHmac(algo, secret).update(body).digest(enc);
}
export function safeEqual(a, b) {
  const A = Buffer.from(String(a || '')), B = Buffer.from(String(b || ''));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
export const randomToken = (n = 24) => crypto.randomBytes(n).toString('hex');
export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// توقيع روابط مؤقتة (مثلاً ملفات الصوت اللي Twilio يقراهم)
export const signValue = (value) => hmac('sha256', key(), String(value));
