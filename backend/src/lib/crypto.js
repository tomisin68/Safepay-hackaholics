import crypto from 'node:crypto';

/* ------------------------------------------------------------------ *
 * Passwords — scrypt with a per-user salt. No external dependency.
 * ------------------------------------------------------------------ */
export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${key}`;
}

export function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const candidate = crypto.scryptSync(plain, salt, 64);
  const expected = Buffer.from(key, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

/* ------------------------------------------------------------------ *
 * Sessions — compact HS256 JWTs, hand-rolled to keep the dep tree tiny.
 * ------------------------------------------------------------------ */
const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function signToken(payload, secret, ttlSeconds = 60 * 60 * 24 * 7) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = `${head}.${b64url(JSON.stringify(body))}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyToken(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * API keys — the raw key is shown once; only the hash is ever stored.
 * ------------------------------------------------------------------ */
export function generateApiKey(mode /* 'test' | 'live' */) {
  return `sk_${mode}_${crypto.randomBytes(24).toString('base64url')}`;
}

export const hashApiKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

/* ------------------------------------------------------------------ *
 * Webhook signatures — HMAC-SHA256 over `timestamp.body`, so a captured
 * payload cannot be replayed outside its tolerance window.
 * ------------------------------------------------------------------ */
export function signWebhook(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export const randomId = (prefix, size = 12) =>
  `${prefix}_${crypto.randomBytes(size).toString('base64url').slice(0, 16)}`;

/** Short, human-readable, unambiguous code for in-person QR handoffs. */
export function claimCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1
  let out = '';
  for (let i = 0; i < 8; i += 1) out += alphabet[crypto.randomInt(alphabet.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}
