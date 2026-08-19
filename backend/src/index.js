import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/auth.js';
import escrowRoutes from './routes/escrows.js';
import disputeRoutes from './routes/disputes.js';
import scoreRoutes from './routes/score.js';
import developerRoutes from './routes/developer.js';
import adminRoutes from './routes/admin.js';

import { ApiError } from './lib/errors.js';
import { sweepAutoReleases } from './services/escrowEngine.js';
import { flushNow, users } from './store/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 4000);

app.set('trust proxy', 1);
app.disable('x-powered-by');

/**
 * In production `WEB_ORIGIN` pins the browser origins allowed to call the API
 * (comma-separated). Left unset — as it is locally — any origin is reflected,
 * so the dev server and curl both work without configuration.
 *
 * The public score and badge endpoints set their own `Access-Control-Allow-Origin: *`,
 * because reputation portability is the whole point of them.
 */
const ALLOWED_ORIGINS = (process.env.WEB_ORIGIN || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);          // curl, server-to-server
    if (ALLOWED_ORIGINS.length === 0) return callback(null, true);
    return callback(null, ALLOWED_ORIGINS.includes(origin.replace(/\/$/, '')));
  },
  credentials: true,
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
}));
app.use(express.json({ limit: '1mb' }));

/* Baseline hardening — cheap, and expected of anything holding money. */
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'DENY');
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'safepay-api', version: '1.0.0', time: new Date().toISOString() });
});

app.get('/', (_req, res) => {
  res.json({
    name: 'SafePay API',
    tagline: 'Trusted payments, everywhere.',
    version: '1.0.0',
    docs: '/docs',
    openapi: '/openapi.yaml',
    endpoints: {
      auth: '/v1/auth',
      escrows: '/v1/escrows',
      disputes: '/v1/disputes',
      score: '/v1/score/:userId',
      trustBadge: '/v1/score/:userId/badge.svg',
      developer: '/v1/developer/apps',
      admin: '/v1/admin/overview',
    },
  });
});

app.use('/v1/auth', authRoutes);
app.use('/v1/escrows', escrowRoutes);
app.use('/v1/disputes', disputeRoutes);
app.use('/v1/score', scoreRoutes);
app.use('/v1/developer', developerRoutes);
app.use('/v1/admin', adminRoutes);

/* ------------------------------- API docs -------------------------------- */
const SPEC = path.resolve(__dirname, '../../docs/openapi.yaml');

app.get('/openapi.yaml', (_req, res) => {
  if (!fs.existsSync(SPEC)) return res.status(404).json({ error: 'spec not found' });
  res.type('text/yaml').send(fs.readFileSync(SPEC, 'utf8'));
});

app.get('/docs', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>SafePay API Reference</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='112' fill='%23981D87'/%3E%3C/svg%3E"/>
    <style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>
  </head>
  <body>
    <redoc spec-url="/openapi.yaml" theme='{"colors":{"primary":{"main":"#981D87"}},"typography":{"fontFamily":"Inter, system-ui, sans-serif","headings":{"fontFamily":"Outfit, Inter, sans-serif"}}}'></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`);
});

/* ------------------------------ error handling --------------------------- */
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'No such endpoint.' } });
});

app.use((err, _req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } });
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong on our side.' } });
});

/* ------------------------------ first boot -------------------------------
 * Hosts without shell access (Render's free plan, for one) give you no way to
 * run `npm run seed`, so a fresh deploy would come up with an empty database
 * and every demo account bouncing off the login screen. With SEED_ON_EMPTY set,
 * the API seeds itself the first time it finds no users.
 *
 * Guarded twice on purpose. It is opt-in via the environment, and even then it
 * only runs against a database with zero users — so it can populate an empty
 * deploy but can never overwrite real data, however many times the service
 * restarts. If the host has no persistent disk and the store resets, the next
 * boot simply re-seeds.
 * ------------------------------------------------------------------------ */
if (process.env.SEED_ON_EMPTY === 'true' && users.count() === 0) {
  console.log('  Empty database and SEED_ON_EMPTY=true — loading demo data...');
  // Importing runs the seed script; it is a top-level program, not a module of
  // helpers. Failure here must not stop the API from serving.
  await import('./seed.js').catch((err) => console.error('[seed] failed:', err.message));
}

/* --------------------------- background workers -------------------------- */
const sweeper = setInterval(sweepAutoReleases, 60_000);
sweeper.unref?.();

const server = app.listen(PORT, () => {
  console.log(`\n  SafePay API  ->  http://localhost:${PORT}`);
  console.log(`  Docs         ->  http://localhost:${PORT}/docs`);
  console.log(`  AI triage    ->  ${process.env.GEMINI_API_KEY ? 'Gemini' : 'rule-based fallback'}\n`);
  sweepAutoReleases();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\nShutting down, flushing store...');
    flushNow();
    server.close(() => process.exit(0));
  });
}

export default app;
