import { Router } from 'express';
import crypto from 'node:crypto';
import { apps, webhookLogs, requestLogs } from '../store/index.js';
import { sessionAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { generateApiKey, hashApiKey, randomId } from '../lib/crypto.js';
import { EVENTS, logsForApp, dispatch } from '../services/webhookDispatcher.js';

const router = Router();
router.use(sessionAuth, rateLimit({ windowMs: 60_000, max: 90, name: 'developer' }));

/** Keys are never returned again after creation — only this masked form. */
const mask = (key) => `${key.slice(0, 11)}${'•'.repeat(18)}${key.slice(-4)}`;

const view = (app) => ({
  id: app.id,
  name: app.name,
  description: app.description,
  webhookUrl: app.webhookUrl,
  webhookSecret: app.webhookSecret,
  subscribedEvents: app.subscribedEvents,
  testKeyPreview: app.testKeyPreview,
  liveKeyPreview: app.liveKeyPreview,
  liveEnabled: Boolean(app.liveEnabled),
  createdAt: app.createdAt,
  stats: {
    requests24h: requestLogs.find(
      (l) => l.appId === app.id && Date.now() - new Date(l.at).getTime() < 864e5,
    ).length,
    webhooksDelivered: webhookLogs.find((l) => l.appId === app.id && l.status === 'delivered').length,
    webhooksFailed: webhookLogs.find((l) => l.appId === app.id && l.status === 'failed').length,
  },
});

function ownedOrThrow(id, userId) {
  const app = apps.get(id);
  if (!app) throw notFound('App not found.');
  if (app.ownerId !== userId) throw forbidden('That app belongs to another account.');
  return app;
}

/* ------------------------------- create app ------------------------------ */
router.post('/apps', (req, res, next) => {
  try {
    const { name, description, webhookUrl } = req.body ?? {};
    if (!name || String(name).trim().length < 2) throw badRequest('Give your app a name.');
    if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
      throw badRequest('Webhook URL must start with http:// or https://');
    }

    const id = randomId('app');
    const testKey = generateApiKey('test');
    const liveKey = generateApiKey('live');

    apps.set(id, {
      id,
      ownerId: req.user.id,
      name: String(name).trim().slice(0, 60),
      description: String(description ?? '').slice(0, 240),
      webhookUrl: webhookUrl ?? null,
      webhookSecret: `whsec_${crypto.randomBytes(24).toString('base64url')}`,
      subscribedEvents: EVENTS,
      testKeyHash: hashApiKey(testKey),
      liveKeyHash: hashApiKey(liveKey),
      testKeyPreview: mask(testKey),
      liveKeyPreview: mask(liveKey),
      liveEnabled: false,
      revoked: false,
      createdAt: new Date().toISOString(),
    });

    // The only time the raw keys ever leave the server.
    res.status(201).json({
      app: view(apps.get(id)),
      keys: { test: testKey, live: liveKey },
      notice: 'Copy these keys now — SafePay stores only a hash and cannot show them again.',
    });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------- list apps ------------------------------ */
router.get('/apps', (req, res) => {
  const mine = apps
    .find((a) => a.ownerId === req.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ apps: mine.map(view), availableEvents: EVENTS });
});

router.get('/apps/:id', (req, res, next) => {
  try {
    res.json({ app: view(ownedOrThrow(req.params.id, req.user.id)) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- update app ------------------------------ */
router.patch('/apps/:id', (req, res, next) => {
  try {
    const app = ownedOrThrow(req.params.id, req.user.id);
    const { name, description, webhookUrl, subscribedEvents } = req.body ?? {};
    const patch = {};

    if (name) patch.name = String(name).trim().slice(0, 60);
    if (description !== undefined) patch.description = String(description).slice(0, 240);
    if (webhookUrl !== undefined) {
      if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
        throw badRequest('Webhook URL must start with http:// or https://');
      }
      patch.webhookUrl = webhookUrl || null;
    }
    if (Array.isArray(subscribedEvents)) {
      patch.subscribedEvents = subscribedEvents.filter((e) => EVENTS.includes(e));
    }

    res.json({ app: view(apps.update(app.id, patch)) });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------- rotate key ----------------------------- */
router.post('/apps/:id/rotate', (req, res, next) => {
  try {
    const app = ownedOrThrow(req.params.id, req.user.id);
    const mode = req.body?.mode === 'live' ? 'live' : 'test';
    const key = generateApiKey(mode);

    apps.update(app.id, {
      [`${mode}KeyHash`]: hashApiKey(key),
      [`${mode}KeyPreview`]: mask(key),
    });

    res.json({
      app: view(apps.get(app.id)),
      key,
      notice: `Your previous ${mode} key stopped working immediately.`,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/apps/:id', (req, res, next) => {
  try {
    const app = ownedOrThrow(req.params.id, req.user.id);
    apps.update(app.id, { revoked: true });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------- logs ---------------------------------- */
router.get('/apps/:id/webhooks', (req, res, next) => {
  try {
    const app = ownedOrThrow(req.params.id, req.user.id);
    res.json({ logs: logsForApp(app.id, 50) });
  } catch (err) {
    next(err);
  }
});

router.get('/apps/:id/requests', (req, res, next) => {
  try {
    const app = ownedOrThrow(req.params.id, req.user.id);
    const logs = requestLogs
      .find((l) => l.appId === app.id)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 100);

    // 14-day daily histogram for the usage chart.
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.now() - (13 - i) * 864e5);
      const key = d.toISOString().slice(0, 10);
      return { date: key, count: logs.filter((l) => l.at.slice(0, 10) === key).length };
    });

    res.json({ logs, series: days });
  } catch (err) {
    next(err);
  }
});

/** Fire a sample event so a developer can verify their endpoint end-to-end. */
router.post('/apps/:id/webhooks/test', (req, res, next) => {
  try {
    const app = ownedOrThrow(req.params.id, req.user.id);
    if (!app.webhookUrl) throw badRequest('Add a webhook URL first.');
    const logId = dispatch(app.id, 'escrow.released', {
      id: 'esc_sample000000',
      status: 'released',
      amountKobo: 2_500_000,
      currency: 'NGN',
      test: true,
    });
    res.json({ ok: true, deliveryId: logId });
  } catch (err) {
    next(err);
  }
});

export default router;
