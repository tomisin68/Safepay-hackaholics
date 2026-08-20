/**
 * Demo-mode data layer.
 *
 * Mirrors the server's `collection(name).get/set/find/update/...` surface, so
 * the demo engines below are a straight port of backend/src/services rather
 * than a second, drifting implementation. Persistence is localStorage: a judge
 * who funds an escrow and reloads the page still sees it funded.
 *
 * This exists so the hosted build is explorable with no API behind it. The
 * moment VITE_API_URL points at a real backend, none of this is loaded.
 */

const KEY = 'safepay.demo.db';
/* Bump when the seed shape changes so stale saved databases are rebuilt. */
const VERSION = 4;

const EMPTY = {
  version: VERSION,
  users: {},
  escrows: {},
  disputes: {},
  apps: {},
  ledger: {},
  fraudFlags: {},
  sessions: {},
  walletEntries: {},
  topups: {},
  payouts: {},
  proofs: {},
  meta: { reserveKobo: 0, feesCollectedKobo: 0 },
};

const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

let db = clone(EMPTY);

export function loadFromDisk() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== VERSION) return false;
    db = { ...clone(EMPTY), ...parsed, meta: { ...EMPTY.meta, ...(parsed.meta || {}) } };
    return true;
  } catch {
    return false;
  }
}

let flushTimer = null;
export function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      // Private-mode Safari and a full quota both land here. The demo keeps
      // working in memory; only durability across a reload is lost.
    }
  }, 60);
}

export function resetAll() {
  db = clone(EMPTY);
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

export function collection(name) {
  if (!db[name]) db[name] = {};
  const c = () => db[name];
  return {
    get: (id) => (id && c()[id] ? clone(c()[id]) : null),
    set(id, value) {
      c()[id] = clone(value);
      scheduleFlush();
      return clone(value);
    },
    update(id, patch) {
      const current = c()[id];
      if (!current) return null;
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
      c()[id] = next;
      scheduleFlush();
      return clone(next);
    },
    remove(id) {
      delete c()[id];
      scheduleFlush();
    },
    all: () => Object.values(c()).map(clone),
    find: (predicate) => Object.values(c()).filter(predicate).map(clone),
    findOne: (predicate) => {
      const hit = Object.values(c()).find(predicate);
      return hit ? clone(hit) : null;
    },
    count: () => Object.keys(c()).length,
  };
}

export const meta = {
  get: () => clone(db.meta),
  update(patch) {
    db.meta = { ...db.meta, ...patch };
    scheduleFlush();
    return clone(db.meta);
  },
};

export const users = collection('users');
export const escrows = collection('escrows');
export const disputes = collection('disputes');
export const apps = collection('apps');
export const ledger = collection('ledger');
export const fraudFlags = collection('fraudFlags');
export const sessions = collection('sessions');
export const walletEntries = collection('walletEntries');
export const topups = collection('topups');
export const payouts = collection('payouts');
/* Delivery photos. They live in their own collection here for the same reason
   they do on the server — and because localStorage has a few megabytes total,
   so they must not ride along inside every escrow read. */
export const proofs = collection('proofs');

/* ------------------------------------------------------------------ *
 * Identifiers and passwords
 * ------------------------------------------------------------------ */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1

const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export const randomId = (prefix) => `${prefix}_${b64url(randomBytes(12)).slice(0, 16)}`;
export const randomToken = () => b64url(randomBytes(32));

export function claimCode() {
  const picks = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i += 1) out += ALPHABET[picks[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/**
 * PBKDF2 rather than a bare digest. It is a demo, but visitors type real
 * passwords into demo signup forms, and those end up in localStorage.
 */
export async function hashPassword(plain, saltHex) {
  const salt = saltHex ?? hex(randomBytes(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(plain), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100_000, hash: 'SHA-256' },
    key,
    256,
  );
  return `pbkdf2$${salt}$${hex(new Uint8Array(bits))}`;
}

export async function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt] = stored.split('$');
  if (scheme !== 'pbkdf2' || !salt) return false;
  const candidate = await hashPassword(plain, salt);
  // Constant-time-ish compare. The database is in the visitor's own browser,
  // so this is hygiene rather than a real defence.
  if (candidate.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i += 1) diff |= candidate.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}

export const toKobo = (naira) => Math.round(Number(naira) * 100);
export const toNaira = (kobo) => Number(kobo) / 100;
export const bps = (amountKobo, basisPoints) => Math.round((amountKobo * basisPoints) / 10000);
