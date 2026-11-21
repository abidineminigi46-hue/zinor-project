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
};

export const waLive = () => Boolean(config.wa.token && config.wa.phoneNumberId);
export const aiLive = () => Boolean(config.ai.apiKey);
