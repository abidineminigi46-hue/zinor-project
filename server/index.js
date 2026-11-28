import http from 'node:http';
import path from 'node:path';
import { config, ROOT, waLive, aiLive, isMain } from './config.js';
import { openDb, db } from './db.js';
import { readBody, send, serveStatic } from './http.js';
import { currentUser } from './auth.js';
import { api } from './routes/api.js';
import { hooks } from './routes/webhooks.js';
import { pollActiveShipments } from './services/shipping.js';
import { logError } from './services/audit.js';
import { seedIfEmpty } from './seed.js';
import { runDue } from './calls/engine.js';
import { verifySigned, mediaPath } from './calls/media.js';
import fs from 'node:fs';

const PUBLIC = path.join(ROOT, 'public');

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    req.query = Object.fromEntries(url.searchParams);
    const pathname = url.pathname;
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      const router = pathname.startsWith('/api/') ? api : pathname.startsWith('/webhooks/') ? hooks : null;
      if (router) {
        const m = router.match(req.method, pathname);
        if (!m) return send(res, 404, { error: 'غير موجود' });
        req.params = m.params;
        req.body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req, pathname === '/api/media' ? 12_000_000 : 2_000_000) : {};
        const opts = m.handlers.find((h) => typeof h === 'object') || {};
        const fns = m.handlers.filter((h) => typeof h === 'function');
        if (router === api && !opts.public) {
          req.user = currentUser(req);
          if (!req.user) return send(res, 401, { error: 'لازم تدخل' });
          // حماية CSRF بسيطة: طلبات التعديل لازم تكون JSON من نفس الأصل
          if (req.method !== 'GET' && !String(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'JSON مطلوب' });
        }
        for (const fn of fns) await fn(req, res);
        return;
      }
      // الواجهات
      if (pathname === '/' ) return serveStatic(res, ROOT, 'index.html') || send(res, 404, 'not found');
      if (pathname === '/admin' || pathname === '/admin/') return serveStatic(res, PUBLIC, 'index.html');
      if (pathname.startsWith('/admin/')) return serveStatic(res, PUBLIC, pathname.slice(7)) || serveStatic(res, PUBLIC, 'index.html');
      if (pathname === '/health') return send(res, 200, { ok: true });
      // ملفات الصوت لخدمة الهاتف — روابط موقّعة ومؤقتة برك
      if (pathname.startsWith('/media/') && req.method === 'GET') {
        const rel = decodeURIComponent(pathname.slice(7));
        if (!/^(intros|tts)\/[\w.-]+$/.test(rel) || !verifySigned(rel, req.query.exp, req.query.sig)) return send(res, 403, 'forbidden');
        const file = mediaPath(rel);
        if (!fs.existsSync(file)) return send(res, 404, 'not found');
        res.writeHead(200, { 'Content-Type': rel.endsWith('.wav') ? 'audio/wav' : rel.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg', 'Cache-Control': 'private, max-age=600' });
        return fs.createReadStream(file).pipe(res);
      }
      send(res, 404, 'not found');
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) logError('http', e, { details: { path: pathname } });
      send(res, status, { error: e.message || 'خطأ' });
    }
  });
}

export function start({ port = config.port, dbFile = config.dbPath, quiet = false } = {}) {
  openDb(dbFile);
  seedIfEmpty({ quiet });
  const server = createServer();
  const timer = config.pollIntervalMin > 0 ? setInterval(() => pollActiveShipments().catch((e) => logError('poll', e)), config.pollIntervalMin * 60000) : null;
  timer?.unref();
  // جدولة المكالمات: كل 30 ثانية نشوفو المحاولات اللي حان وقتها
  const callTimer = config.calls.schedulerSeconds > 0 ? setInterval(() => runDue(new Date()).catch((e) => logError('calls.scheduler', e)), config.calls.schedulerSeconds * 1000) : null;
  callTimer?.unref();
  return new Promise((resolve, reject) => {
    server.once('error', (e) => {
      if (e.code === 'EADDRINUSE') console.error(`\n❌ المنفذ ${port} مستعمل. سكّر البرنامج اللي يستعملو ولا بدّل PORT في ملف .env\n`);
      else console.error('\n❌ ما قدرش السيرفر يشعل:', e.message, '\n');
      reject(e);
    });
    server.listen(port, () => {
    if (!quiet) {
      console.log(`\n✅ Zinor يخدم على ${config.publicUrl}`);
      console.log(`   لوحة التحكّم: ${config.publicUrl}/admin`);
      console.log(`   واتساب: ${waLive() ? 'مربوط (Cloud API)' : 'محاكاة — جرّب من "محاكي واتساب" في اللوحة'}`);
      console.log(`   الذكاء الاصطناعي: ${aiLive() ? 'Claude (' + config.ai.model + ')' : 'المحرّك المحلي (بلا مفتاح)'}\n`);
    }
    resolve({ server, close: () => new Promise((r) => { clearInterval(timer); clearInterval(callTimer); server.close(() => { db.close(); r(); }); }) });
    });
  });
}

if (isMain(import.meta.url)) start().catch(() => { process.exitCode = 1; });
