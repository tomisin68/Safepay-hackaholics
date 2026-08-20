import { Router } from 'express';
import { sessionAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import * as kyc from '../services/kyc.js';

/**
 * KYC: session-only, like wallet.js. An API key belongs to an app, not to a
 * person, and identity documents are the last thing a partner integration
 * should ever be able to reach.
 */
const router = Router();
router.use(sessionAuth, rateLimit({ windowMs: 60_000, max: 30, name: 'kyc' }));

router.get('/', (req, res) => {
  res.json({ kyc: kyc.getStatus(req.user.id) });
});

router.post('/submit', async (req, res, next) => {
  try {
    res.status(201).json({ kyc: await kyc.submit(req.user.id, req.body ?? {}) });
  } catch (err) {
    next(err);
  }
});

/** The account owner's own document, or an admin reviewing it. Nobody else. */
router.get('/document/:docId', (req, res, next) => {
  try {
    res.json({ document: kyc.document(req.params.docId, req.user.id) });
  } catch (err) {
    next(err);
  }
});

export default router;
