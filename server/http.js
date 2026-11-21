// راوتر HTTP صغير بلا مكتبات
import fs from 'node:fs';
import path from 'node:path';

export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, ...handlers) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handlers });
  }
  get(p, ...h) { this.add('GET', p, ...h); } post(p, ...h) { this.add('POST', p, ...h); }
  put(p, ...h) { this.add('PUT', p, ...h); } del(p, ...h) { this.add('DELETE', p, ...h); }
  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = pathname.match(r.re);
      if (m) return { handlers: r.handlers, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }
}

export async function readBody(req, limit = 2_000_000) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('الطلب كبير بزاف'), { status: 413 }); chunks.push(c); }
  req.rawBody = Buffer.concat(chunks);
  const ct = req.headers['content-type'] || '';
  if (!req.rawBody.length) return {};
  if (ct.includes('application/json')) {
    try { return JSON.parse(req.rawBody.toString('utf8')); } catch { throw Object.assign(new Error('JSON غير صالح'), { status: 400 }); }
  }
  if (ct.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(req.rawBody.toString('utf8')));
  return {};
}

export function send(res, status, data, headers = {}) {
  if (res.headersSent) return;
  const isStr = typeof data === 'string';
  res.writeHead(status, { 'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isStr ? data : JSON.stringify(data));
}

export function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((x) => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
export function serveStatic(res, root, rel) {
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) return false;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
  return true;
}
