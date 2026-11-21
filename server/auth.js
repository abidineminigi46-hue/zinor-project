import { db } from './db.js';
import { verifyPassword, randomToken } from './crypto.js';
import { parseCookies } from './http.js';

const DAYS = 7;
export function login(email, password) {
  const u = db.get('SELECT * FROM users WHERE email=? AND active=1', String(email || '').toLowerCase().trim());
  if (!u || !verifyPassword(password, u.password_hash)) return null;
  const token = randomToken(32);
  db.run("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,datetime('now', ?))", token, u.id, `+${DAYS} days`);
  return { token, user: publicUser(u) };
}
export function logout(token) { db.run('DELETE FROM sessions WHERE token=?', token); }
export function currentUser(req) {
  const token = parseCookies(req).zsid || (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return null;
  const u = db.get("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.active=1", token);
  return u ? { ...publicUser(u), token } : null;
}
export const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });
export const sessionCookie = (token, secure) => `zsid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DAYS * 86400}${secure ? '; Secure' : ''}`;
