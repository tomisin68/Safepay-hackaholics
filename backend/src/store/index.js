import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * SafePay's data layer.
 *
 * The API surface below (`collection(name).get/set/find/all/update/remove`) is
 * deliberately shaped like Firestore so production can swap this file for a
 * `firebase-admin` adapter without touching a single route or service.
 *
 * For the hackathon build it is a durable JSON file: the whole app boots with
 * `npm start` and no credentials, which is what a judge needs to be able to do.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = {
  users: {},
  escrows: {},
  disputes: {},
  apps: {},
  webhookLogs: {},
  ledger: {},
  fraudFlags: {},
  requestLogs: {},
  meta: { reserveKobo: 0, feesCollectedKobo: 0 },
};

function load() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...structuredClone(EMPTY), ...parsed, meta: { ...EMPTY.meta, ...(parsed.meta || {}) } };
  } catch {
    return structuredClone(EMPTY);
  }
}

let db = load();

/* Writes are debounced — escrow flows touch several collections per request and
 * we do not want a synchronous disk write inside each one. */
let flushTimer = null;
let flushing = false;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushNow();
  }, 40);
}

export function flushNow() {
  if (flushing) return;
  flushing = true;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE); // atomic swap, never a half-written db
  } catch (err) {
    console.error('[store] flush failed:', err.message);
  } finally {
    flushing = false;
  }
}

export function collection(name) {
  if (!db[name]) db[name] = {};
  const c = () => db[name];
  return {
    get: (id) => (id && c()[id] ? structuredClone(c()[id]) : null),
    set(id, value) {
      c()[id] = structuredClone(value);
      scheduleFlush();
      return structuredClone(value);
    },
    update(id, patch) {
      const current = c()[id];
      if (!current) return null;
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
      c()[id] = next;
      scheduleFlush();
      return structuredClone(next);
    },
    remove(id) {
      delete c()[id];
      scheduleFlush();
    },
    all: () => Object.values(c()).map((v) => structuredClone(v)),
    find: (predicate) => Object.values(c()).filter(predicate).map((v) => structuredClone(v)),
    findOne: (predicate) => {
      const hit = Object.values(c()).find(predicate);
      return hit ? structuredClone(hit) : null;
    },
    count: () => Object.keys(c()).length,
  };
}

export const meta = {
  get: () => structuredClone(db.meta),
  update(patch) {
    db.meta = { ...db.meta, ...patch };
    scheduleFlush();
    return structuredClone(db.meta);
  },
};

/** Used by the seed script only. */
export function resetAll() {
  db = structuredClone(EMPTY);
  flushNow();
}

process.on('exit', flushNow);
process.on('SIGINT', () => { flushNow(); process.exit(0); });
process.on('SIGTERM', () => { flushNow(); process.exit(0); });

export const users = collection('users');
export const escrows = collection('escrows');
export const disputes = collection('disputes');
export const apps = collection('apps');
export const webhookLogs = collection('webhookLogs');
export const ledger = collection('ledger');
export const fraudFlags = collection('fraudFlags');
export const requestLogs = collection('requestLogs');
