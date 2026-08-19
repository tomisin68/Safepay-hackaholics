import { users, apps, requestLogs } from '../store/index.js';
import { verifyToken, hashApiKey, randomId } from '../lib/crypto.js';
import { unauthorized, forbidden } from '../lib/errors.js';
import { verifyFirebaseIdToken } from '../services/identity.js';

const SECRET = () => process.env.JWT_SECRET || 'safepay-dev-secret-change-me';

function bearer(req) {
  const header = req.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return req.get('x-api-key') || null;
}

/**
 * Resolves a presented token to a SafePay user id.
 *
 * Two token families are accepted, tried cheapest first:
 *
 *   1. our own HS256 session JWT, issued by /v1/auth after the OTP gate;
 *   2. a Firebase ID token minted by a client SDK.
 *
 * The second is what makes the Firebase Auth integration load-bearing rather
 * than decorative — a Google or phone sign-in added later needs no change here.
 * Because Firebase records are created with our own id as their uid, both paths
 * land on the same subject with no mapping table.
 *
 * @returns {Promise<string | null>} the user id, or null when the token is bad
 */
async function resolveSubject(token) {
  const payload = verifyToken(token, SECRET());
  if (payload?.sub) return payload.sub;

  // Not one of ours. A Firebase ID token is a JWT too, so this is a real
  // possibility rather than a wasted round-trip on every bad token — but it does
  // mean a garbage token costs one Firebase call. The rate limiters bound that.
  const decoded = await verifyFirebaseIdToken(token);
  return decoded?.uid ?? null;
}

/**
 * Dashboard session. Used by the SafePay web app.
 *
 * The `emailVerified` check is the load-bearing half of the compulsory OTP flow.
 * The token routes already refuse to mint a token for an unverified account, so
 * this should be unreachable — which is exactly why it is here. It closes the
 * gap for a token issued before the gate existed, or for one obtained through a
 * path nobody has thought of yet, and it costs a property read.
 */
export async function sessionAuth(req, _res, next) {
  const token = bearer(req);
  if (!token) return next(unauthorized('Sign in to continue.'));

  /* Express 4 does not catch a rejected promise from middleware — it would hang
   * the request instead of answering it. An auth check that cannot complete has
   * to fail closed, so everything below is wrapped. */
  try {
    const subject = await resolveSubject(token);
    if (!subject) return next(unauthorized('Your session has expired. Sign in again.'));

    const user = users.get(subject);
    if (!user) return next(unauthorized('Account no longer exists.'));

    if (user.emailVerified === false) {
      return next(forbidden('Confirm your email address to continue.'));
    }

    req.user = user;
    req.actor = { userId: user.id, appId: null, mode: 'session' };
    return next();
  } catch (err) {
    console.error('[auth] session check failed:', err.message);
    return next(unauthorized('Could not verify your session. Sign in again.'));
  }
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

  // A key outlives the account that made it. An unverified owner means the
  // account never cleared the OTP gate, so its keys must not work either.
  if (owner?.emailVerified === false) {
    return next(forbidden('Confirm the account email address to use the API.'));
  }

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
export async function optionalAuth(req, _res, next) {
  const token = bearer(req);
  if (!token) return next();

  if (token.startsWith('sk_')) {
    const hash = hashApiKey(token);
    const app = apps.findOne((a) => [a.testKeyHash, a.liveKeyHash].includes(hash));
    if (app && !app.revoked) {
      req.app_ = app;
      req.user = users.get(app.ownerId);
      req.actor = { userId: app.ownerId, appId: app.id, mode: app.testKeyHash === hash ? 'test' : 'live' };
    }
    return next();
  }

  try {
    const subject = await resolveSubject(token);
    if (subject) {
      const user = users.get(subject);
      // Unverified accounts stay anonymous here rather than being rejected — this
      // middleware exists to enrich public endpoints, not to guard them.
      if (user && user.emailVerified !== false) {
        req.user = user;
        req.actor = { userId: user.id, appId: null, mode: 'session' };
      }
    }
  } catch (err) {
    // Optional means optional: an unresolvable token leaves the request anonymous.
    console.error('[auth] optional check failed:', err.message);
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
