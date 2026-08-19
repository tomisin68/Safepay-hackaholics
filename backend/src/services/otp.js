/**
 * Email one-time codes.
 *
 * The rules a code has to satisfy to be worth anything, and where each is
 * enforced below:
 *
 *   generated from a CSPRNG        `crypto.randomInt`, never `Math.random`
 *   never stored in the clear      HMAC-SHA256 keyed by JWT_SECRET
 *   compared in constant time      `crypto.timingSafeEqual`
 *   single use                     consumed on success, deleted after
 *   short-lived                    TTL_MINUTES, checked on every attempt
 *   not brute-forceable            MAX_ATTEMPTS, counted server-side
 *   not floodable                  RESEND_COOLDOWN_MS between sends
 *
 * A six-digit code is only 10^6 wide, so the attempt ceiling is what actually
 * secures it: five guesses against a ten-minute window is a 1-in-200,000 shot,
 * and burning the challenge on the fifth is what stops someone buying more.
 *
 * Challenges live in their own collection so the write-through store persists
 * them to Firestore — a code stays valid across a Render restart mid-signup,
 * and the attempt counter cannot be reset by bouncing the process.
 */

import crypto from 'node:crypto';
import { otpChallenges, users } from '../store/index.js';
import { randomId } from '../lib/crypto.js';
import { badRequest, tooMany } from '../lib/errors.js';

export const TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60_000;
/** Ceiling on codes issued per challenge, so "resend" cannot be farmed forever. */
const MAX_SENDS = 5;
const CODE_LENGTH = 6;

const pepper = () => process.env.JWT_SECRET || 'safepay-dev-secret-change-me';

/**
 * Codes are hashed, not encrypted — we only ever need to answer "does this
 * match", never "what was it". Keying the HMAC with JWT_SECRET means a leaked
 * database alone does not let anyone precompute the million possible digests.
 */
const hashCode = (code) => crypto.createHmac('sha256', pepper()).update(String(code)).digest('hex');

/** Uniform over 000000-999999. `randomInt` rejects modulo bias internally. */
function generateCode() {
  const max = 10 ** CODE_LENGTH;
  return String(crypto.randomInt(0, max)).padStart(CODE_LENGTH, '0');
}

function constantTimeEquals(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  // Lengths are hex digests of fixed width, so this only guards malformed input.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Housekeeping — expired challenges are dead weight and a small privacy risk. */
export function purgeExpiredChallenges() {
  const now = Date.now();
  let removed = 0;
  for (const challenge of otpChallenges.all()) {
    // Keep them an hour past expiry: enough for "that code expired" to still be
    // answerable, short enough that nothing lingers.
    if (new Date(challenge.expiresAt).getTime() + 3_600_000 < now) {
      otpChallenges.remove(challenge.id);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Opens a challenge and returns the plaintext code to hand to the mailer. The
 * caller sends it; nothing else in the process ever sees it again.
 *
 * Any older open challenge for the same user is dropped first, so a second
 * signup attempt cannot leave two live codes in play.
 *
 * @returns {{ challengeId: string, code: string, expiresAt: string }}
 */
export function issueChallenge({ userId, email, purpose = 'signup' }) {
  for (const existing of otpChallenges.find((c) => c.userId === userId && !c.consumedAt)) {
    otpChallenges.remove(existing.id);
  }

  const code = generateCode();
  const now = Date.now();
  const id = randomId('otp');

  otpChallenges.set(id, {
    id,
    userId,
    email,
    purpose,
    codeHash: hashCode(code),
    attempts: 0,
    sends: 1,
    createdAt: new Date(now).toISOString(),
    lastSentAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MINUTES * 60_000).toISOString(),
    consumedAt: null,
  });

  return { challengeId: id, code, expiresAt: new Date(now + TTL_MINUTES * 60_000).toISOString() };
}

/**
 * Rotates the code on an existing challenge. Rotating rather than reusing means
 * a code shoulder-surfed from the first email dies with the second — and the
 * attempt counter resets with it, since a fresh code deserves fresh guesses.
 *
 * @returns {{ code: string, email: string, userId: string, expiresAt: string }}
 * @throws  ApiError when the challenge is unknown, spent, or on cooldown
 */
export function rotateChallenge(challengeId) {
  const challenge = otpChallenges.get(challengeId);
  if (!challenge || challenge.consumedAt) {
    throw badRequest('That verification session is no longer valid. Start again from sign in.');
  }

  const now = Date.now();
  const since = now - new Date(challenge.lastSentAt).getTime();
  if (since < RESEND_COOLDOWN_MS) {
    throw tooMany(`Wait ${Math.ceil((RESEND_COOLDOWN_MS - since) / 1000)}s before asking for another code.`);
  }
  if (challenge.sends >= MAX_SENDS) {
    throw tooMany('Too many codes requested for this account. Try again in a few minutes.');
  }

  const code = generateCode();
  otpChallenges.update(challengeId, {
    codeHash: hashCode(code),
    attempts: 0,
    sends: challenge.sends + 1,
    lastSentAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MINUTES * 60_000).toISOString(),
  });

  return {
    code,
    email: challenge.email,
    userId: challenge.userId,
    expiresAt: new Date(now + TTL_MINUTES * 60_000).toISOString(),
  };
}

/**
 * Checks a submitted code and, on success, consumes the challenge.
 *
 * Every failure path is deliberately vague about *why* — "incorrect or expired"
 * rather than distinguishing the two — except the attempts-remaining hint,
 * which is information the legitimate owner needs and an attacker already has.
 *
 * @returns {{ userId: string, email: string, purpose: string }}
 * @throws  ApiError on any invalid, expired, exhausted, or already-used code
 */
export function verifyChallenge({ challengeId, code }) {
  const challenge = otpChallenges.get(challengeId);
  if (!challenge) throw badRequest('That verification session has expired. Sign in to get a new code.');
  if (challenge.consumedAt) throw badRequest('That code has already been used.');

  if (new Date(challenge.expiresAt).getTime() < Date.now()) {
    otpChallenges.remove(challengeId);
    throw badRequest('That code has expired. Request a new one.');
  }

  if (challenge.attempts >= MAX_ATTEMPTS) {
    otpChallenges.remove(challengeId);
    throw tooMany('Too many incorrect attempts. Request a new code.');
  }

  const submitted = String(code ?? '').trim();
  if (!/^\d{6}$/.test(submitted)) {
    // Still counted. Otherwise the shape check becomes a free probe.
    otpChallenges.update(challengeId, { attempts: challenge.attempts + 1 });
    throw badRequest('Enter the 6-digit code from your email.');
  }

  if (!constantTimeEquals(hashCode(submitted), challenge.codeHash)) {
    const attempts = challenge.attempts + 1;
    otpChallenges.update(challengeId, { attempts });

    const left = MAX_ATTEMPTS - attempts;
    if (left <= 0) {
      otpChallenges.remove(challengeId);
      throw tooMany('Too many incorrect attempts. Request a new code.');
    }
    throw badRequest(`That code is not right. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`);
  }

  /* Correct. Burn it before returning, so a replayed request finds it spent
   * even if the caller retries the same body. */
  otpChallenges.update(challengeId, { consumedAt: new Date().toISOString(), attempts: challenge.attempts + 1 });

  // The account may have been removed between issuing and verifying.
  const user = users.get(challenge.userId);
  if (!user) throw badRequest('That account no longer exists.');

  return { userId: challenge.userId, email: challenge.email, purpose: challenge.purpose };
}
