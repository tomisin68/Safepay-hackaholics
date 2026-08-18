import { users, apps, requestLogs } from '../store/index.js';
import { verifyToken, hashApiKey, randomId } from '../lib/crypto.js';
import { unauthorized, forbidden } from '../lib/errors.js';

const SECRET = () => process.env.JWT_SECRET || 'safepay-dev-secret-change-me';

function bearer(req) {
  const header = req.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return req.get('x-api-key') || null;
}

/**
 * Dashboard session. Used by the SafePay web app.
 */
export function sessionAuth(req, _res, next) {
  const token = bearer(req);
  if (!token) return next(unauthorized('Sign in to continue.'));

  const payload = verifyToken(token, SECRET());
  if (!payload?.sub) return next(unauthorized('Your session has expired. Sign in again.'));

  const user = users.get(payload.sub);
  if (!user) return next(unauthorized('Account no longer exists.'));

  req.user = user;
  req.actor = { userId: user.id, appId: null, mode: 'session' };
  next();
}

/**
 * Developer API key. Used by partner apps integrating SafePay.
 * The raw key is never stored — we hash the presented key and look that up.
 */
export function apiKeyAuth(req, _res, next) {
  const key = bearer(req);
  if (!key?.startsWith('sk_')) {
    return next(unauthorized('Provide your SafePay API key as a Bearer token.'));
  }

  const hash = hashApiKey(key);
  const app = apps.findOne((a) => a.testKeyHash === hash || a.liveKeyHash === hash);
  if (!app) return next(unauthorized('Invalid API key.'));
  if (app.revoked) return next(forbidden('This API key has been revoked.'));

  const mode = app.testKeyHash === hash ? 'test' : 'live';
  const owner = users.get(app.ownerId);

  req.app_ = app;
  req.user = owner;
  req.actor = { userId: app.ownerId, appId: app.id, mode };

  logRequest(req, app.id, mode);
  next();
}

/**
 * Accepts either a dashboard session or an API key — most escrow endpoints
 * are reachable both ways, which is what makes the platform genuinely
 * API-first rather than an API bolted onto a UI.
 */
export function anyAuth(req, res, next) {
  const token = bearer(req);
  if (!token) return next(unauthorized('Sign in or supply an API key.'));
  if (token.startsWith('sk_')) return apiKeyAuth(req, res, next);
  return sessionAuth(req, res, next);
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') return next(forbidden('Admin access only.'));
  next();
}

/** Optional auth — attaches the actor if present, never rejects. */
export function optionalAuth(req, _res, next) {
  const token = bearer(req);
  if (!token) return next();
  if (token.startsWith('sk_')) {
    const app = apps.findOne((a) => [a.testKeyHash, a.liveKeyHash].includes(hashApiKey(token)));
    if (app) {
      req.app_ = app;
      req.user = users.get(app.ownerId);
      req.actor = { userId: app.ownerId, appId: app.id, mode: app.testKeyHash === hashApiKey(token) ? 'test' : 'live' };
    }
    return next();
  }
  const payload = verifyToken(token, SECRET());
  if (payload?.sub) {
    const user = users.get(payload.sub);
    if (user) {
      req.user = user;
      req.actor = { userId: user.id, appId: null, mode: 'session' };
    }
  }
  next();
}

function logRequest(req, appId, mode) {
  const id = randomId('req', 8);
  requestLogs.set(id, {
    id,
    appId,
    mode,
    method: req.method,
    path: req.originalUrl.split('?')[0],
    at: new Date().toISOString(),
  });
}

export const signSecret = SECRET;
