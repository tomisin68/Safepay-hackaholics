import { Router } from 'express';
import { sessionAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { badRequest } from '../lib/errors.js';
import { toKobo } from '../lib/money.js';
import * as wallet from '../services/wallet.js';

/**
 * Wallet: balance, the mock Wema top-up, the withdrawal account, and payouts.
 *
 * Session-only. An API key belongs to an app, not to a person, and nothing here
 * should be reachable by a partner integration — a developer key must never be
 * able to move a user's money to a bank account of its choosing.
 */
const router = Router();
router.use(sessionAuth, rateLimit({ windowMs: 60_000, max: 90, name: 'wallet' }));

/** Accepts either `amountKobo` (canonical) or `amount` in naira. */
function resolveAmount(body) {
  if (body?.amountKobo != null) return Math.round(Number(body.amountKobo));
  if (body?.amount != null) return toKobo(body.amount);
  throw badRequest('Provide an amount.');
}

router.get('/', (req, res) => {
  res.json(wallet.summary(req.user.id));
});

/* ------------------------------- bank account ------------------------------ */

router.put('/bank', (req, res, next) => {
  try {
    res.json({ bankAccount: wallet.setBankAccount(req.user.id, req.body ?? {}) });
  } catch (err) {
    next(err);
  }
});

router.delete('/bank', (req, res) => {
  wallet.removeBankAccount(req.user.id);
  res.json({ bankAccount: null });
});

/* --------------------------------- top-ups --------------------------------- */

router.post('/topups', (req, res, next) => {
  try {
    res.status(201).json({ topup: wallet.createTopup(req.user.id, resolveAmount(req.body)) });
  } catch (err) {
    next(err);
  }
});

router.get('/topups/:id', (req, res, next) => {
  try {
    res.json({ topup: wallet.getTopup(req.user.id, req.params.id) });
  } catch (err) {
    next(err);
  }
});

/** "I have already sent it" — the mock stand-in for the bank's webhook. */
router.post('/topups/:id/confirm', (req, res, next) => {
  try {
    res.json(wallet.confirmTopup(req.user.id, req.params.id));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- withdrawals ------------------------------- */

router.post('/withdrawals', (req, res, next) => {
  try {
    res.status(201).json(wallet.withdraw(req.user.id, resolveAmount(req.body)));
  } catch (err) {
    next(err);
  }
});

export default router;
