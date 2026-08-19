/**
 * Firebase Admin bootstrap.
 *
 * Uses the modular entry points (`firebase-admin/app`, `/firestore`, `/auth`)
 * rather than the old `admin.initializeApp()` namespace. The namespaced form
 * shown in Firebase's own quickstart is CommonJS-era and its `admin.apps` array
 * no longer exists in v13+, so the double-init guard has to come from `getApps()`.
 *
 * Credentials arrive from the environment, never from a file in the repo. Three
 * shapes are accepted because hosts differ in what they make easy:
 *
 *   FIREBASE_SERVICE_ACCOUNT   the whole service-account JSON as one string, or
 *                              the same JSON base64-encoded. Base64 is the safer
 *                              choice in a dashboard, since nothing downstream
 *                              can mangle the private key's newlines.
 *   FIREBASE_PROJECT_ID  +  FIREBASE_CLIENT_EMAIL  +  FIREBASE_PRIVATE_KEY
 *                              the three fields separately, for hosts that
 *                              dislike large multi-line values.
 *
 * Nothing here throws. A missing or malformed credential logs a warning and
 * leaves `firebaseReady` false — the API still boots and serves every route from
 * the local JSON store. That matters twice over: a judge can clone and run with
 * no secrets at all, and a Firestore outage degrades into "this deploy is
 * ephemeral" rather than "this deploy is down".
 */

import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * Render (and most dashboards) store multi-line values with the newlines
 * escaped, so a pasted private key arrives as one line full of literal `\n`.
 * Left as-is the PEM parser rejects it, which surfaces as an opaque
 * "Invalid PEM formatted message". Unquote and unescape before use.
 */
function normalisePrivateKey(key) {
  if (!key) return null;
  let out = key.trim();
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1);
  }
  return out.replace(/\\n/g, '\n');
}

function readCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();

  if (raw) {
    try {
      const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      const parsed = JSON.parse(json);
      return {
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: normalisePrivateKey(parsed.private_key),
      };
    } catch (err) {
      console.warn('[firebase] FIREBASE_SERVICE_ACCOUNT is not valid JSON or base64 JSON:', err.message);
      return null;
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = normalisePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey };

  return null;
}

const credential = readCredential();

let app = null;
let firestore = null;

if (credential?.projectId && credential.clientEmail && credential.privateKey) {
  try {
    const fresh = getApps().length === 0;
    app = fresh
      ? initializeApp({ credential: cert(credential), projectId: credential.projectId })
      : getApp();

    firestore = getFirestore(app);

    /* Our documents carry optional fields that are legitimately absent (a user
     * with no phone, an escrow with no milestones), and `structuredClone` in the
     * store preserves an explicit `undefined` where JSON would have dropped it.
     * Firestore rejects `undefined` outright unless told to read it as "field not
     * present", so this setting is what keeps such a write from throwing.
     *
     * It must be applied before the instance is used for anything else, hence
     * only on first initialisation. `initializeFirestore(app, settings)` looks
     * like the modular way to do this but silently does not apply the option in
     * v14 — verified against the live project. `.settings()` does. */
    if (fresh) firestore.settings({ ignoreUndefinedProperties: true });
  } catch (err) {
    console.error('[firebase] initialisation failed:', err.message);
    app = null;
    firestore = null;
  }
} else {
  console.warn('[firebase] no credentials in env — running on the local JSON store only.');
}

export const firebaseReady = Boolean(app && firestore);
export const projectId = credential?.projectId ?? null;

/** Firestore handle, or null when Firebase is unconfigured. */
export const db = firebaseReady ? firestore : null;

/** Firebase Auth handle, or null when Firebase is unconfigured. */
export const auth = firebaseReady ? getAuth(app) : null;
