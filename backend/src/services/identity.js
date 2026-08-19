/**
 * Firebase Authentication, as SafePay uses it.
 *
 * Every SafePay account gets a matching Firebase Auth user record, created with
 * our own id as its uid so the two systems never need a mapping table. That
 * record is what makes the integration real rather than decorative: the Firebase
 * console lists actual users, `emailVerified` reflects the OTP gate, disabling an
 * account there locks it out here, and a Firebase ID token minted by any client
 * SDK is accepted by this API (see middleware/auth.js).
 *
 * The API still verifies passwords itself, against the scrypt hash in the store.
 * That is a deliberate choice, not an oversight:
 *
 *   - the seeded demo accounts have no Firebase records, and judges must be able
 *     to sign into them;
 *   - it keeps sign-in off the network path, so an Identity Toolkit blip cannot
 *     lock every user out of a live escrow;
 *   - it means the app boots and works with no credentials at all.
 *
 * Firebase holds its own hash of the same password, so the client SDK can sign
 * in directly too — neither store ever holds a plaintext password.
 *
 * Nothing here throws. Firebase being unconfigured or unreachable is a degraded
 * mode, not an outage: the local account is still authoritative for auth.
 */

import { auth, firebaseReady } from '../lib/firebaseAdmin.js';

export { firebaseReady };

/**
 * Creates (or repairs) the Firebase Auth record for a SafePay account.
 *
 * Idempotent. A uid that already exists is updated instead — which is what makes
 * it safe to call on a retried signup, where the previous attempt created the
 * Firebase user before something later failed.
 *
 * @returns {Promise<{ ok: boolean, uid?: string, error?: string, skipped?: boolean }>}
 */
export async function provisionAuthUser({ uid, email, password, name, phone }) {
  if (!firebaseReady) return { ok: false, skipped: true, error: 'firebase_unconfigured' };

  const profile = {
    email,
    displayName: name,
    emailVerified: false,
    ...(password ? { password } : {}),
    // E.164 only. Anything else makes Firebase reject the whole call, so a
    // malformed number is dropped rather than allowed to fail the signup.
    ...(/^\+[1-9]\d{7,14}$/.test(String(phone ?? '')) ? { phoneNumber: phone } : {}),
  };

  try {
    const record = await auth.createUser({ uid, ...profile });
    return { ok: true, uid: record.uid };
  } catch (err) {
    if (err.code === 'auth/uid-already-exists' || err.code === 'auth/email-already-exists') {
      try {
        // Never downgrade a verified address back to unverified on a repair.
        const existing = await auth.getUser(uid).catch(() => null);
        const patch = { ...profile };
        if (existing?.emailVerified) delete patch.emailVerified;
        const record = await auth.updateUser(uid, patch);
        return { ok: true, uid: record.uid };
      } catch (updateErr) {
        console.error('[identity] could not repair Firebase user:', updateErr.message);
        return { ok: false, error: updateErr.message };
      }
    }
    console.error('[identity] createUser failed:', err.code || err.message);
    return { ok: false, error: err.code || err.message };
  }
}

/** Flips `emailVerified` on the Firebase record once the OTP is accepted. */
export async function markEmailVerified(uid) {
  if (!firebaseReady) return { ok: false, skipped: true };
  try {
    await auth.updateUser(uid, { emailVerified: true });
    return { ok: true };
  } catch (err) {
    // The local record is already verified; a stale Firebase flag is cosmetic.
    console.error('[identity] markEmailVerified failed:', err.code || err.message);
    return { ok: false, error: err.code || err.message };
  }
}

/** Mirrors a profile edit (name, phone) onto the Firebase record. */
export async function syncAuthProfile(uid, { name, phone }) {
  if (!firebaseReady) return { ok: false, skipped: true };
  const patch = {
    ...(name ? { displayName: name } : {}),
    ...(/^\+[1-9]\d{7,14}$/.test(String(phone ?? '')) ? { phoneNumber: phone } : {}),
  };
  if (Object.keys(patch).length === 0) return { ok: true };

  try {
    await auth.updateUser(uid, patch);
    return { ok: true };
  } catch (err) {
    console.error('[identity] syncAuthProfile failed:', err.code || err.message);
    return { ok: false, error: err.code || err.message };
  }
}

/**
 * Whether the Firebase record has been disabled — checked on sign-in so an
 * account locked from the Firebase console is locked here too. That is the
 * break-glass control for a compromised account during a demo.
 *
 * Unreachable Firebase resolves to `false`: this is an extra gate on top of the
 * password check, and it must never become a way to lock out every user at once.
 */
export async function isAuthUserDisabled(uid) {
  if (!firebaseReady) return false;
  try {
    const record = await auth.getUser(uid);
    return Boolean(record.disabled);
  } catch {
    return false;
  }
}

/**
 * Verifies a Firebase ID token minted by a client SDK.
 *
 * `checkRevoked` makes this a real session check rather than a signature check:
 * a revoked refresh token stops working immediately instead of at token expiry.
 *
 * @returns {Promise<{ uid: string, email?: string, emailVerified: boolean } | null>}
 */
export async function verifyFirebaseIdToken(token) {
  if (!firebaseReady) return null;
  try {
    const decoded = await auth.verifyIdToken(token, true);
    return { uid: decoded.uid, email: decoded.email, emailVerified: Boolean(decoded.email_verified) };
  } catch {
    return null;
  }
}
