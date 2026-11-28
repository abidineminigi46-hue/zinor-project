import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile) && !process.env.ZINOR_SKIP_ENV_FILE) process.loadEnvFile(envFile);

const env = (k, d = '') => (process.env[k] ?? '').trim() || d;

export const config = {
  port: Number(env('PORT', '3000')),
  publicUrl: env('PUBLIC_URL', `http://localhost:${env('PORT', '3000')}`),
  dbPath: path.resolve(ROOT, env('DB_PATH', './data/zinor.db')),
  secretKey: env('APP_SECRET_KEY'),
  wa: {
    token: env('WA_ACCESS_TOKEN'),
    phoneNumberId: env('WA_PHONE_NUMBER_ID'),
    appSecret: env('WA_APP_SECRET'),
    verifyToken: env('WA_VERIFY_TOKEN', 'zinor-verify'),
    graphVersion: env('WA_GRAPH_VERSION', 'v21.0'),
    templateLang: env('WA_TEMPLATE_LANG', 'ar'),
  },
  ai: {
    apiKey: env('ANTHROPIC_API_KEY'),
    model: env('AI_MODEL', 'claude-opus-5-5'),
    effort: env('AI_EFFORT', 'low'),
  },
  pollIntervalMin: Number(env('POLL_INTERVAL_MIN', '15')),
  calls: {
    // n8n: الـWebhook اللي يبدا المكالمة عند خدمة الهاتف (Twilio)
    n8nStartUrl: env('N8N_CALL_START_URL'),
    // n8n: الـWebhook اللي Twilio يبعثلو كلام الزبون (يتحط في <Gather action>)
    n8nTurnUrl: env('N8N_CALL_TURN_URL'),
    // سرّ مشترك بين Zinor و n8n لتوقيع الطلبات في الاتجاهين
    webhookSecret: env('CALLS_WEBHOOK_SECRET'),
    speechLanguage: env('CALLS_SPEECH_LANGUAGE', 'ar-DZ'),
    schedulerSeconds: Number(env('CALLS_SCHEDULER_SECONDS', '30')),
  },
  elevenlabs: { apiKey: env('ELEVENLABS_API_KEY'), model: env('ELEVENLABS_MODEL', 'eleven_multilingual_v2') },
  spybox: {
    apiKey: env('SPYBOX_API_KEY'),
    baseUrl: env('SPYBOX_BASE_URL', 'https://spybox-crea.vercel.app/api/v1').replace(/\/$/, ''),
    model: env('SPYBOX_MODEL', 'gemini-tts'),
    timeoutSec: Number(env('SPYBOX_TIMEOUT_SEC', '90')),
    // أقصى وقت نستناو التوليد وسط مكالمة حقيقية قبل ما نرجعو لـ <Say> (Twilio يستنى ~15 ثانية)
    callBudgetMs: Number(env('SPYBOX_CALL_BUDGET_MS', '8000')),
  },
};

export const waLive = () => Boolean(config.wa.token && config.wa.phoneNumberId);
export const aiLive = () => Boolean(config.ai.apiKey);
export const callsBridgeReady = () => Boolean(config.calls.n8nStartUrl && config.calls.n8nTurnUrl && config.calls.webhookSecret);

// هل هاذ الملف هو اللي تشغّل مباشرة (node server/index.js)؟ — يخدم في ويندوز (C:\\...) ولينكس
export function isMain(importMetaUrl) {
  if (!process.argv[1]) return false;
  const a = fileURLToPath(importMetaUrl), b = path.resolve(process.argv[1]);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}
