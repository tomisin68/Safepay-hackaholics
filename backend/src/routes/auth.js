import { Router } from 'express';
import { users } from '../store/index.js';
import { hashPassword, verifyPassword, signToken, randomId } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, unauthorized } from '../lib/errors.js';
import { sessionAuth, signSecret } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { computeScore } from '../services/scoreEngine.js';
import { issueChallenge, rotateChallenge, verifyChallenge, TTL_MINUTES } from '../services/otp.js';
import { sendOtpEmail, sendLoginAlertEmail, sendWelcomeEmail, sendInBackground } from '../services/mailer.js';
import {
  provisionAuthUser,
  markEmailVerified,
  syncAuthProfile,
  isAuthUserDisabled,
} from '../services/identity.js';
import { isDemoAccount, DEMO_EMAIL_DOMAIN } from '../demoData.js';

const router = Router();

/**
 * Rate limits, tuned per endpoint rather than shared.
 *
 * `verify` is the one that matters: it is the endpoint an attacker would hammer,
 * and the per-challenge attempt ceiling in services/otp.js only stops guessing
 * against one challenge. This caps how fast someone can cycle through many.
 */
const authLimit = rateLimit({ windowMs: 60_000, max: 20, name: 'auth' });
const verifyLimit = rateLimit({ windowMs: 60_000, max: 10, name: 'auth-verify' });
const resendLimit = rateLimit({ windowMs: 15 * 60_000, max: 5, name: 'auth-resend' });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

/** Both are attacker-controlled strings that end up in an email. Bound them. */
const clientIp = (req) => String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '') || 'unknown';
const clientAgent = (req) => String(req.get('user-agent') || 'unknown').slice(0, 180);

/**
 * Opens an OTP challenge and mails the code.
 *
 * The plaintext code exists only inside this function: it goes from the
 * generator straight to the mailer and is never stored, logged, or returned. The
 * response carries a challenge id and a masked address — enough for the client
 * to render "we emailed a***@example.com" and post the code back, and nothing an
 * attacker holding the response could use to skip the email.
 *
 * The masked address matters for a second reason: on the login path it confirms
 * *which* mailbox to check without echoing an address the caller may have only
 * guessed.
 */
async function beginVerification(user, purpose) {
  const { challengeId, code } = issueChallenge({
    userId: user.id,
    email: user.email,
    purpose,
  });

  await sendOtpEmail({ to: user.email, name: user.name, code, minutes: TTL_MINUTES });

  return {
    verificationRequired: true,
    challengeId,
    email: maskEmail(user.email),
    expiresInMinutes: TTL_MINUTES,
  };
}

/**
 * Masks all but the first character of the local part: a****@example.com
 *
 * The run of asterisks is a fixed width rather than the real length. Padding to
 * the true length would turn the mask into a character count, which is a free
 * hint to anyone probing which of several addresses an account uses.
 */
function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain || !local) return '';
  return `${local.slice(0, 1)}****@${domain}`;
}

/* -------------------------------------------------------------------------- *
 * Signup
 *
 * Deliberately does NOT return a session token. A new account is inert until
 * its address is proven: no token, no escrows, no API keys. That is what makes
 * the OTP step compulsory rather than a dismissable prompt.
 * -------------------------------------------------------------------------- */
router.post('/signup', authLimit, async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body ?? {};

    if (!name || String(name).trim().length < 2) throw badRequest('Enter your full name.');
    if (!EMAIL.test(String(email ?? ''))) throw badRequest('Enter a valid email address.');
    if (String(password ?? '').length < 8) throw badRequest('Password must be at least 8 characters.');
    if (String(password).length > 200) throw badRequest('That password is too long.');

    const normalisedEmail = String(email).toLowerCase().trim();

    /* The demo domain is reserved. Its accounts skip the emailed-code gate — see
     * /login below — so letting anyone sign up under it would turn a convenience
     * for judges into a way to create an unverified account that behaves like a
     * verified one. `.test` can never receive mail anyway (RFC 2606), so there
     * is no legitimate signup to refuse here. */
    if (normalisedEmail.endsWith(DEMO_EMAIL_DOMAIN)) {
      throw badRequest(`${DEMO_EMAIL_DOMAIN} is reserved for the SafePay demo accounts. Use a real address.`);
    }

    const existing = users.findOne((u) => u.email === normalisedEmail);

    if (existing) {
      /* An account stuck at the verification step is not a conflict — it is
       * someone who closed the tab. Re-issue rather than dead-ending them.
       * Only ever reachable with the correct password, so it leaks nothing. */
      if (!existing.emailVerified && verifyPassword(String(password), existing.passwordHash)) {
        return res.status(202).json(await beginVerification(existing, 'signup'));
      }
      throw conflict('An account with that email already exists.');
    }

    const id = randomId('usr');
    const now = new Date().toISOString();
    const user = {
      id,
      name: String(name).trim().slice(0, 80),
      email: normalisedEmail,
      phone: phone ? String(phone).trim().slice(0, 24) : null,
      passwordHash: hashPassword(String(password)),
      role: 'user',
      emailVerified: false,
      verificationTier: phone ? 'phone' : 'none',
      safeScore: 0,
      scoreTier: 'new',
      walletKobo: 0,
      bankAccount: null,
      firebaseUid: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };
    users.set(id, user);

    const score = computeScore(id);
    users.update(id, { safeScore: score.score, scoreTier: score.tier });

    /* Mirror into Firebase Auth. A failure here is logged, not fatal: the
     * SafePay record is authoritative for sign-in, so the account still works
     * and the next profile update repairs the mirror. */
    const provisioned = await provisionAuthUser({
      uid: id,
      email: normalisedEmail,
      password: String(password),
      name: user.name,
      phone: user.phone,
    });
    if (provisioned.ok) users.update(id, { firebaseUid: provisioned.uid });

    res.status(202).json(await beginVerification(users.get(id), 'signup'));
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------------- *
 * Login
 * -------------------------------------------------------------------------- */
router.post('/login', authLimit, async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    const user = users.findOne((u) => u.email === String(email ?? '').toLowerCase().trim());

    // Same message either way — never reveal whether an email is registered.
    if (!user || !verifyPassword(String(password ?? ''), user.passwordHash)) {
      throw unauthorized('That email and password do not match.');
    }

    // Break-glass: an account disabled in the Firebase console is locked here too.
    if (await isAuthUserDisabled(user.id)) {
      throw forbidden('This account has been suspended. Contact support.');
    }

    /* An unverified account cannot get a token, however correct the password.
     * This is the same gate as signup, reached from the other direction.
     *
     * The seeded demo accounts are the one exception, and it is not a loophole:
     * their addresses are on a reserved domain that cannot receive mail, so a
     * code sent to one is a code nobody can ever read. Gating them would lock
     * the demo — the admin console included — out of its own data. Signup on
     * that domain is refused above, so nobody can mint themselves one. */
    if (!user.emailVerified && !isDemoAccount(user)) {
      return res.status(202).json(await beginVerification(user, 'login'));
    }

    const at = new Date().toISOString();
    users.update(user.id, { lastLoginAt: at });

    const token = signToken({ sub: user.id, email: user.email, ver: true }, signSecret());

    /* The alert is the whole point of knowing about this login, but it must not
     * sit between the user and their dashboard. Queued, not awaited. Skipped for
     * demo accounts: every sign-in would be a guaranteed bounce off a reserved
     * domain, and judges sign in constantly. */
    if (!isDemoAccount(user)) {
      const ip = clientIp(req);
      const userAgent = clientAgent(req);
      sendInBackground(() => sendLoginAlertEmail({ to: user.email, name: user.name, ip, userAgent, at }));
    }

    res.json({ token, user: publicUser(users.get(user.id)) });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------------- *
 * OTP verification
 * -------------------------------------------------------------------------- */

/**
 * Exchanges a correct code for a session token. This is the only route that
 * turns an unverified account into a usable one.
 */
router.post('/verify-email', verifyLimit, async (req, res, next) => {
  try {
    const { challengeId, code } = req.body ?? {};
    if (!challengeId) throw badRequest('Missing verification session.');

    const { userId } = verifyChallenge({ challengeId: String(challengeId), code });

    const user = users.get(userId);
    if (!user) throw badRequest('That account no longer exists.');

    const wasAlreadyVerified = Boolean(user.emailVerified);
    const at = new Date().toISOString();

    if (!wasAlreadyVerified) {
      users.update(userId, {
        emailVerified: true,
        emailVerifiedAt: at,
        // Proving control of the address is itself a verification step, so it
        // lifts a brand-new account off the floor of the SafeScore tiers.
        verificationTier: user.verificationTier === 'none' ? 'email' : user.verificationTier,
      });

      await markEmailVerified(userId);
      sendInBackground(() => sendWelcomeEmail({ to: user.email, name: user.name }));
    }

    users.update(userId, { lastLoginAt: at });

    const score = computeScore(userId);
    users.update(userId, { safeScore: score.score, scoreTier: score.tier });

    const fresh = users.get(userId);
    const token = signToken({ sub: userId, email: fresh.email, ver: true }, signSecret());

    /* A first sign-in is still a sign-in. Sending the alert here as well means
     * every session start is accounted for, not just those via /login. */
    if (!isDemoAccount(fresh)) {
      const ip = clientIp(req);
      const userAgent = clientAgent(req);
      sendInBackground(() => sendLoginAlertEmail({ to: fresh.email, name: fresh.name, ip, userAgent, at }));
    }

    res.json({ token, user: publicUser(fresh), score });
  } catch (err) {
    next(err);
  }
});

/**
 * Issues a fresh code against an existing challenge. The old code stops working
 * the moment this succeeds.
 */
router.post('/resend-code', resendLimit, async (req, res, next) => {
  try {
    const { challengeId } = req.body ?? {};
    if (!challengeId) throw badRequest('Missing verification session.');

    const { code, email, userId } = rotateChallenge(String(challengeId));
    const user = users.get(userId);

    await sendOtpEmail({ to: email, name: user?.name, code, minutes: TTL_MINUTES });

    res.json({
      verificationRequired: true,
      challengeId: String(challengeId),
      email: maskEmail(email),
      expiresInMinutes: TTL_MINUTES,
    });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------------- *
 * Session
 * -------------------------------------------------------------------------- */
router.get('/me', sessionAuth, (req, res) => {
  res.json({ user: publicUser(req.user), score: computeScore(req.user.id) });
});

router.patch('/me', sessionAuth, async (req, res, next) => {
  try {
    const { name, phone, verificationTier } = req.body ?? {};
    const patch = {};
    if (name) patch.name = String(name).trim().slice(0, 80);
    if (phone) patch.phone = String(phone).trim().slice(0, 24);
    if (verificationTier) {
      if (!['none', 'email', 'phone', 'bvn_nin', 'address'].includes(verificationTier)) {
        throw badRequest('Unknown verification tier.');
      }
      patch.verificationTier = verificationTier;
    }
    const updated = users.update(req.user.id, patch);

    // Keep the Firebase record in step. Cosmetic, so failures are swallowed.
    if (patch.name || patch.phone) {
      await syncAuthProfile(req.user.id, { name: patch.name, phone: patch.phone });
    }

    res.json({ user: publicUser(updated), score: computeScore(req.user.id) });
  } catch (err) {
    next(err);
  }
});

/** Directory lookup so a buyer can pick a counterparty without knowing their id. */
router.get('/directory', sessionAuth, (req, res) => {
  const q = String(req.query.q ?? '').toLowerCase().trim();
  const results = users
    // Unverified accounts are invisible: nobody should be able to open an escrow
    // against an address that has never been proven.
    .find((u) => u.id !== req.user.id && u.emailVerified !== false
      && (!q || u.name.toLowerCase().includes(q) || u.email.includes(q)))
    .slice(0, 12)
    .map((u) => ({ id: u.id, name: u.name, email: u.email, safeScore: u.safeScore, scoreTier: u.scoreTier }));
  res.json({ results });
});

export default router;
