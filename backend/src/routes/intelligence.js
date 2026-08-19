import { Router } from 'express';
import { disputes } from '../store/index.js';
import { anyAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import * as engine from '../services/escrowEngine.js';
import { assessTransactionRisk, assessDisputeRisk } from '../services/intelligence.js';

const router = Router();
// Lower ceiling than the other routes on purpose — each call may reach an
// external AI provider, so the limit doubles as a cost/latency guard.
router.use(anyAuth, rateLimit({ windowMs: 60_000, max: 30, name: 'intelligence' }));

/**
 * Transaction risk assessment. Same access rule as GET /v1/escrows/:id —
 * only the buyer or seller on the escrow can request an assessment of it.
 */
router.get('/escrows/:id/risk', async (req, res, next) => {
  try {
    const escrow = engine.getOrThrow(req.params.id);
    engine.assertParty(escrow, req.actor.userId);
    const risk = await assessTransactionRisk(escrow.id);
    res.json({ risk });
  } catch (err) {
    next(err);
  }
});

/**
 * Dispute intelligence — advisory only. It never releases or refunds funds;
 * the actual financial decision stays with POST /v1/disputes/:id/resolve.
 */
router.post('/dispute', async (req, res, next) => {
  try {
    const { disputeId } = req.body ?? {};
    if (!disputeId) throw badRequest('Provide a disputeId.');

    const dispute = disputes.get(disputeId);
    if (!dispute) throw notFound('Dispute not found.');

    const isAdmin = req.user?.role === 'admin';
    const isParty = [dispute.raisedById, dispute.againstId].includes(req.actor.userId);
    if (!isAdmin && !isParty) throw forbidden('You are not party to this dispute.');

    const result = await assessDisputeRisk(disputeId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
