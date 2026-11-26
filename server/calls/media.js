// تسجيلات المقدّمة (MP3/WAV) + ملفات الصوت المولّدة — تتخزّن في data/media وتتعرض بروابط موقّعة مؤقتة
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../db.js';
import { signValue, safeEqual, randomToken } from '../crypto.js';
import { httpErr } from '../services/accounts.js';

export const MEDIA_DIR = () => path.join(path.dirname(config.dbPath), 'media');
const MAX = 8 * 1024 * 1024;

export function sniffAudio(buf) {
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return { mime: 'audio/wav', ext: 'wav' };
  if (buf.length > 3 && (buf.toString('ascii', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0))) return { mime: 'audio/mpeg', ext: 'mp3' };
  return null;
}

export function saveIntro({ name, data }, user) {
  const b64 = String(data || '').replace(/^data:[^,]*,/, '');
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) throw httpErr(400, 'الملف فارغ');
  if (buf.length > MAX) throw httpErr(413, 'الملف كبير بزاف (8MB أقصى)');
  const t = sniffAudio(buf);
  if (!t) throw httpErr(415, 'لازم يكون MP3 ولا WAV');
  const dir = path.join(MEDIA_DIR(), 'intros');
  fs.mkdirSync(dir, { recursive: true });
  const file = `${Date.now()}-${randomToken(4)}.${t.ext}`;
  fs.writeFileSync(path.join(dir, file), buf);
  const id = db.insert('media', { kind: 'intro', name: String(name || 'مقدّمة').slice(0, 80), mime: t.mime, file: `intros/${file}`, size: buf.length, uploaded_by: user?.id ?? null });
  return db.get('SELECT * FROM media WHERE id=?', id);
}

export const listMedia = () => db.all("SELECT id, name, mime, size, created_at FROM media WHERE kind='intro' ORDER BY id DESC");
export const getMedia = (id) => db.get('SELECT * FROM media WHERE id=?', id);
export function deleteMedia(id) {
  const m = getMedia(id);
  if (!m) return;
  fs.rmSync(path.join(MEDIA_DIR(), m.file), { force: true });
  db.run('DELETE FROM media WHERE id=?', id);
}
export const mediaPath = (rel) => {
  const p = path.normalize(path.join(MEDIA_DIR(), rel));
  if (!p.startsWith(path.normalize(MEDIA_DIR()))) throw httpErr(400, 'مسار غير صالح');
  return p;
};

// رابط عمومي مؤقت (ساعتين) — لخدمة الهاتف باش تشغّل الصوت
export function signedUrl(rel, ttlSec = 7200) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `${config.publicUrl}/media/${rel}?exp=${exp}&sig=${signValue(`${rel}:${exp}`)}`;
}
export function verifySigned(rel, exp, sig) {
  if (!exp || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, signValue(`${rel}:${exp}`));
}
