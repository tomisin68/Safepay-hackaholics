import { Router } from 'express';
import { users } from '../store/index.js';
import { hashPassword, verifyPassword, signToken, randomId } from '../lib/crypto.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { sessionAuth, signSecret } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { computeScore } from '../services/scoreEngine.js';

const router = Router();
const authLimit = rateLimit({ windowMs: 60_000, max: 20, name: 'auth' });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

router.post('/signup', authLimit, (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body ?? {};

    if (!name || String(name).trim().length < 2) throw badRequest('Enter your full name.');
    if (!EMAIL.test(String(email ?? ''))) throw badRequest('Enter a valid email address.');
    if (String(password ?? '').length < 8) throw badRequest('Password must be at least 8 characters.');

    const normalisedEmail = String(email).toLowerCase().trim();
    if (users.findOne((u) => u.email === normalisedEmail)) {
      throw conflict('An account with that email already exists.');
    }

    const id = randomId('usr');
    const now = new Date().toISOString();
    const user = {
      id,
      name: String(name).trim(),
      email: normalisedEmail,
      phone: phone ? String(phone).trim() : null,
      passwordHash: hashPassword(String(password)),
      role: 'user',
      verificationTier: phone ? 'phone' : 'none',
      safeScore: 0,
      scoreTier: 'new',
      createdAt: now,
      updatedAt: now,
    };
    users.set(id, user);

    const score = computeScore(id);
    users.update(id, { safeScore: score.score, scoreTier: score.tier });

    const token = signToken({ sub: id, email: normalisedEmail }, signSecret());
    res.status(201).json({ token, user: publicUser(users.get(id)) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authLimit, (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    const user = users.findOne((u) => u.email === String(email ?? '').toLowerCase().trim());

    // Same message either way — never reveal whether an email is registered.
    if (!user || !verifyPassword(String(password ?? ''), user.passwordHash)) {
      throw unauthorized('That email and password do not match.');
    }

    const token = signToken({ sub: user.id, email: user.email }, signSecret());
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', sessionAuth, (req, res) => {
  res.json({ user: publicUser(req.user), score: computeScore(req.user.id) });
});

router.patch('/me', sessionAuth, (req, res, next) => {
  try {
    const { name, phone, verificationTier } = req.body ?? {};
    const patch = {};
    if (name) patch.name = String(name).trim().slice(0, 80);
    if (phone) patch.phone = String(phone).trim().slice(0, 24);
    if (verificationTier) {
      if (!['none', 'phone', 'bvn_nin', 'address'].includes(verificationTier)) {
        throw badRequest('Unknown verification tier.');
      }
      patch.verificationTier = verificationTier;
    }
    const updated = users.update(req.user.id, patch);
    res.json({ user: publicUser(updated), score: computeScore(req.user.id) });
  } catch (err) {
    next(err);
  }
});

/** Directory lookup so a buyer can pick a counterparty without knowing their id. */
router.get('/directory', sessionAuth, (req, res) => {
  const q = String(req.query.q ?? '').toLowerCase().trim();
  const results = users
    .find((u) => u.id !== req.user.id && (!q || u.name.toLowerCase().includes(q) || u.email.includes(q)))
    .slice(0, 12)
    .map((u) => ({ id: u.id, name: u.name, email: u.email, safeScore: u.safeScore, scoreTier: u.scoreTier }));
  res.json({ results });
});

export default router;
