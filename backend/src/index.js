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
import intelligenceRoutes from './routes/intelligence.js';
import kycRoutes from './routes/kyc.js';
import walletRoutes from './routes/wallet.js';

import { ApiError } from './lib/errors.js';
import {
  flushNow, hydrateFromFirestore, drainSync, storeBackend, storeHealth,
} from './store/index.js';
import { ensureDemoData } from './demoData.js';
import { firebaseReady, projectId } from './lib/firebaseAdmin.js';
import { mailerReady } from './services/mailer.js';
import { purgeExpiredChallenges } from './services/otp.js';

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

/**
 * Liveness plus a read on the optional subsystems, which is what you actually
 * want at 3am on demo day: it answers "is Firestore attached and is mail going
 * out" without needing the logs. Booleans only — never the credentials behind
 * them, since this endpoint is public.
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'safepay-api',
    version: '1.0.0',
    store: storeHealth(),
    firebase: firebaseReady ? { connected: true, projectId } : { connected: false },
    email: { provider: 'keplars', configured: mailerReady },
    time: new Date().toISOString(),
  });
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
      verifyEmail: '/v1/auth/verify-email',
      escrows: '/v1/escrows',
      wallet: '/v1/wallet',
      disputes: '/v1/disputes',
      score: '/v1/score/:userId',
      trustBadge: '/v1/score/:userId/badge.svg',
      developer: '/v1/developer/apps',
      admin: '/v1/admin/overview',
      intelligenceRisk: '/v1/intelligence/escrows/:id/risk',
      intelligenceDispute: '/v1/intelligence/dispute',
      kyc: '/v1/kyc',
    },
  });
});

app.use('/v1/auth', authRoutes);
app.use('/v1/escrows', escrowRoutes);
app.use('/v1/disputes', disputeRoutes);
app.use('/v1/score', scoreRoutes);
app.use('/v1/developer', developerRoutes);
app.use('/v1/admin', adminRoutes);
app.use('/v1/intelligence', intelligenceRoutes);
app.use('/v1/wallet', walletRoutes);
app.use('/v1/kyc', kycRoutes);

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
 * Order matters here, and the ordering is the whole point:
 *
 *   1. pull Firestore into memory, so the demo bootstrap below decides against
 *      the real database rather than an empty local mirror. Get this backwards
 *      and every restart writes demo accounts on top of live data;
 *   2. create whatever demo data is missing;
 *   3. only then start listening.
 *
 * Top-level await in an ES module is what makes step 3 safe: no request can
 * arrive against a half-loaded store.
 * ------------------------------------------------------------------------ */
if (firebaseReady) {
  const hydrated = await hydrateFromFirestore();
  if (hydrated.ok) {
    const total = Object.values(hydrated.counts).reduce((a, b) => a + b, 0);
    console.log(`  Firestore    ->  loaded ${total} documents from ${projectId}`);
  } else {
    console.warn(`  Firestore    ->  unavailable (${hydrated.error}); serving the local mirror`);
  }
}

/* Hosts without shell access (Render's free plan, for one) give you no way to
 * run `npm run seed`, so a deploy would come up with no demo accounts and every
 * judge bouncing off the login screen. This lays them down at boot instead.
 *
 * It is additive, not a seed: it creates the accounts that are missing, repairs
 * the password and verified flag on the ones that are there, and writes the
 * escrow history only when the demo accounts have none at all. Real accounts and
 * real escrows are never touched, so it is safe on every restart — which is the
 * point. The old version only fired against a completely empty database, so the
 * first genuine signup permanently locked `admin@safepay.test` out of its own
 * deployment and left nobody able to resolve a dispute.
 *
 * Set DEMO_ACCOUNTS=false to turn it off. Do that before anyone treats this as
 * a real deployment: the accounts it creates share one published password, and
 * one of them is an administrator. */
if (process.env.DEMO_ACCOUNTS !== 'false') {
  try {
    const { createdUsers, seededHistory } = ensureDemoData();
    if (createdUsers.length || seededHistory) {
      console.log(`  Demo data    ->  created ${createdUsers.length} account(s)`
        + `${seededHistory ? ' and the seeded escrow history' : ''}`);
    }
  } catch (err) {
    // A failure here must not stop the API from serving real traffic.
    console.error('[demo] bootstrap failed:', err.message);
  }
}

/* --------------------------- background workers -------------------------- */
/* Spent and expired OTP challenges are dead weight once their window closes, and
 * left alone the collection would only ever grow. Hourly is plenty for rows with
 * a ten-minute life. */
const otpSweeper = setInterval(() => {
  const removed = purgeExpiredChallenges();
  if (removed > 0) console.log(`[otp] purged ${removed} expired challenge(s)`);
}, 3_600_000);
otpSweeper.unref?.();

const server = app.listen(PORT, () => {
  console.log(`\n  SafePay API  ->  http://localhost:${PORT}`);
  console.log(`  Docs         ->  http://localhost:${PORT}/docs`);
  console.log(`  Store        ->  ${storeBackend === 'firestore' ? `Firestore (${projectId})` : 'local JSON file'}`);
  console.log(`  Auth         ->  ${firebaseReady ? 'Firebase Auth mirror active' : 'local only (no Firebase creds)'}`);
  console.log(`  Email        ->  ${mailerReady ? 'Keplars' : 'NOT CONFIGURED - codes print to this log'}`);
  console.log(`  Demo accounts->  ${process.env.DEMO_ACCOUNTS === 'false' ? 'disabled' : 'enabled (@safepay.test)'}`);
  console.log(`  AI triage    ->  ${process.env.GEMINI_API_KEY ? 'Gemini' : 'rule-based fallback'}\n`);
});

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (shuttingDown) return; // Render sends SIGTERM then SIGKILL; don't double-drain
    shuttingDown = true;
    console.log('\nShutting down, flushing store...');
    flushNow();
    // Anything still queued for Firestore would otherwise be lost on a redeploy.
    await drainSync().catch(() => {});
    server.close(() => process.exit(0));
  });
}

export default app;
