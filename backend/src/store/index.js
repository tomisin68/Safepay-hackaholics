import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firebaseReady, db as firestore } from '../lib/firebaseAdmin.js';

/**
 * SafePay's data layer.
 *
 * Reads are synchronous and served from memory; writes go to memory first, then
 * out to durable storage in the background. That is what lets every route and
 * service below stay synchronous — `users.get(id)` returns a user, not a promise
 * — while the actual ledger still survives a restart.
 *
 * Two backends sit behind it:
 *
 *   Firestore   authoritative when credentials are present. Hydrated once at
 *               boot, then written through on every mutation.
 *   JSON file   the local fallback, and a warm cache underneath Firestore. A
 *               clean clone with no credentials runs entirely on this, which is
 *               what lets a judge `npm start` and get a working app.
 *
 * Firestore wins at boot when configured, because it is the only copy shared
 * across restarts and redeploys — Render's disk survives a restart but not a
 * rebuild, and nothing but Firestore survives the free plan being swept.
 *
 * The write-through is deliberately fire-and-forget. A Firestore hiccup must not
 * fail an escrow release: the in-memory state and the JSON mirror are both
 * already correct, and the next mutation of that document re-sends it.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * `DATA_DIR` points at a mounted persistent disk in production (Render mounts
 * one at /var/data). Locally it falls back to backend/.data, so a clean
 * checkout still runs with no configuration at all.
 */
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '../../.data');
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
  otpChallenges: {},
  /* Wallet: the balance itself lives on the user record; these are the
   * movements behind it, the pending bank transfers that create one, and the
   * payouts that spend one. */
  walletEntries: {},
  topups: {},
  payouts: {},
  /* Delivery photos, kept out of the escrow document on purpose: a Firestore
   * document is capped at 1 MiB and an escrow is read on every list call. */
  proofs: {},
  meta: { reserveKobo: 0, feesCollectedKobo: 0 },
};

/** Collection names mirrored to Firestore. `meta` is handled separately. */
const COLLECTIONS = Object.keys(EMPTY).filter((k) => k !== 'meta');

/** Single document holding the platform counters. */
const META_DOC = ['meta', 'global'];

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

/* ------------------------------------------------------------------ *
 * Local mirror
 *
 * Writes are debounced — escrow flows touch several collections per
 * request and we do not want a synchronous disk write inside each one.
 * ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ *
 * Firestore write-through
 *
 * Mutations are coalesced by document key and sent as one batched
 * commit. A burst that touches the same escrow four times therefore
 * costs one write, not four — which matters on a free Firestore quota.
 * ------------------------------------------------------------------ */

/** key `collection/id` -> { collection, id, data } | { collection, id, deleted: true } */
const pending = new Map();
let syncTimer = null;
let syncing = false;
let syncFailures = 0;

/** Whether Firestore was successfully read at boot. See `storeHealth()`. */
let hydrated = false;
let hydrationError = null;

function queueSync(collectionName, id, data) {
  if (!firebaseReady) return;
  pending.set(`${collectionName}/${id}`, { collection: collectionName, id, data });
  scheduleSync();
}

function queueDelete(collectionName, id) {
  if (!firebaseReady) return;
  pending.set(`${collectionName}/${id}`, { collection: collectionName, id, deleted: true });
  scheduleSync();
}

function scheduleSync() {
  if (syncTimer || syncing) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncPending();
  }, 250);
  syncTimer.unref?.();
}

/** @returns {Promise<boolean>} whether everything taken off the queue committed */
async function syncPending() {
  if (syncing || pending.size === 0 || !firestore) return true;
  syncing = true;

  // Take the queue, so mutations arriving mid-commit land in the next batch
  // rather than being dropped or written twice.
  const batchItems = [...pending.values()];
  pending.clear();

  try {
    // Firestore caps a batch at 500 operations.
    for (let i = 0; i < batchItems.length; i += 450) {
      const slice = batchItems.slice(i, i + 450);
      const batch = firestore.batch();
      for (const item of slice) {
        const ref = firestore.collection(item.collection).doc(item.id);
        if (item.deleted) batch.delete(ref);
        else batch.set(ref, item.data);
      }
      await batch.commit();
    }
    syncFailures = 0;
    return true;
  } catch (err) {
    syncFailures += 1;
    // Put the work back so the next mutation retries it. Bounded: if the queue
    // has grown past a few thousand documents Firestore is not coming back this
    // run, and holding them all costs more than losing the mirror.
    if (pending.size < 5_000) {
      for (const item of batchItems) {
        const key = `${item.collection}/${item.id}`;
        if (!pending.has(key)) pending.set(key, item); // never overwrite newer state
      }
    }
    // Log the first few, then go quiet — a sustained outage must not fill the log.
    if (syncFailures <= 3) console.error('[store] Firestore sync failed:', err.message);
    return false;
  } finally {
    syncing = false;
    if (pending.size > 0) scheduleSync();
  }
}

/** Push everything still queued. Awaited on shutdown and by the tests. */
export async function drainSync() {
  if (!firebaseReady) return true;
  return syncPending();
}

/**
 * Loads Firestore into memory, replacing whatever the JSON mirror held.
 *
 * Called once, before the server accepts traffic. On failure it logs and leaves
 * the local state in place: an API serving yesterday's mirror beats an API that
 * refuses to boot.
 *
 * @returns {Promise<{ ok: boolean, counts?: Record<string, number>, error?: string }>}
 */
export async function hydrateFromFirestore() {
  if (!firebaseReady || !firestore) return { ok: false, error: 'firebase_unconfigured' };

  try {
    const next = structuredClone(EMPTY);
    const counts = {};

    const snapshots = await Promise.all(COLLECTIONS.map((name) => firestore.collection(name).get()));

    COLLECTIONS.forEach((name, index) => {
      for (const doc of snapshots[index].docs) next[name][doc.id] = doc.data();
      counts[name] = snapshots[index].size;
    });

    const metaSnap = await firestore.collection(META_DOC[0]).doc(META_DOC[1]).get();
    next.meta = { ...EMPTY.meta, ...(metaSnap.exists ? metaSnap.data() : {}) };

    db = next;
    hydrated = true;
    flushNow(); // keep the local mirror in step with what we just loaded
    return { ok: true, counts };
  } catch (err) {
    hydrated = false;
    hydrationError = err.message;
    console.error('[store] Firestore hydration failed, using local mirror:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * What the store is *actually* doing right now, as opposed to what it was
 * configured to do. The two diverge exactly when it matters — credentials
 * present but Firestore unreachable — so /health reports this rather than the
 * static `storeBackend` constant.
 */
export function storeHealth() {
  if (!firebaseReady) return { backend: 'local-json', durable: false, reason: 'firebase_unconfigured' };
  if (!hydrated) return { backend: 'local-json', durable: false, reason: hydrationError || 'not_hydrated' };
  return {
    backend: 'firestore',
    durable: true,
    ...(pending.size > 0 ? { queuedWrites: pending.size } : {}),
  };
}

/**
 * Copies the current in-memory state up to Firestore in full. Used after a seed
 * so a freshly seeded deploy is durable immediately rather than only after the
 * next mutation of each document.
 */
export async function pushAllToFirestore() {
  if (!firebaseReady) return { ok: false, error: 'firebase_unconfigured' };
  for (const name of COLLECTIONS) {
    for (const [id, value] of Object.entries(db[name])) queueSync(name, id, value);
  }
  queueSync(META_DOC[0], META_DOC[1], db.meta);

  // Report what actually happened. Claiming a mirror that did not commit is
  // worse than no mirror: it is the log line you would trust on demo day.
  const ok = await syncPending();
  return ok ? { ok: true } : { ok: false, error: 'sync_failed' };
}

/* ------------------------------------------------------------------ *
 * Public API
 *
 * Shaped after Firestore on purpose, which is what made the adapter
 * above a drop-in rather than a rewrite of every route.
 * ------------------------------------------------------------------ */
export function collection(name) {
  if (!db[name]) db[name] = {};
  const c = () => db[name];
  return {
    get: (id) => (id && c()[id] ? structuredClone(c()[id]) : null),
    set(id, value) {
      c()[id] = structuredClone(value);
      scheduleFlush();
      queueSync(name, id, c()[id]);
      return structuredClone(value);
    },
    update(id, patch) {
      const current = c()[id];
      if (!current) return null;
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
      c()[id] = next;
      scheduleFlush();
      queueSync(name, id, next);
      return structuredClone(next);
    },
    remove(id) {
      delete c()[id];
      scheduleFlush();
      queueDelete(name, id);
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
    queueSync(META_DOC[0], META_DOC[1], db.meta);
    return structuredClone(db.meta);
  },
};

/** Used by the seed script only. */
export function resetAll() {
  const previous = db;
  db = structuredClone(EMPTY);
  flushNow();

  // Firestore keeps no memory of what the JSON file used to hold, so a reset has
  // to name the documents it wants gone.
  if (firebaseReady) {
    for (const name of COLLECTIONS) {
      for (const id of Object.keys(previous[name] || {})) queueDelete(name, id);
    }
  }
}

export const storeBackend = firebaseReady ? 'firestore' : 'local-json';

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
export const otpChallenges = collection('otpChallenges');
export const walletEntries = collection('walletEntries');
export const topups = collection('topups');
export const payouts = collection('payouts');
export const proofs = collection('proofs');
