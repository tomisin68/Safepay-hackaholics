import { Router } from 'express';
import { disputes, escrows, users } from '../store/index.js';
import { anyAuth, requireAdmin } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { randomId } from '../lib/crypto.js';
import { toNaira } from '../lib/money.js';
import * as engine from '../services/escrowEngine.js';
import { triage } from '../services/aiTriage.js';
import { broadcast } from '../services/webhookDispatcher.js';
import { payoutFromReserve } from '../services/ledger.js';

const router = Router();
router.use(anyAuth, rateLimit({ windowMs: 60_000, max: 60, name: 'disputes' }));

const view = (d) => ({
  ...d,
  escrow: engine.publicView(escrows.get(d.escrowId)),
  raisedByName: users.get(d.raisedById)?.name ?? 'Unknown',
  againstName: users.get(d.againstId)?.name ?? 'Unknown',
});

/* ----------------------------- raise a dispute ----------------------------- */
router.post('/', async (req, res, next) => {
  try {
    const { escrowId, reason, evidenceUrls } = req.body ?? {};
    if (!reason || String(reason).trim().length < 12) {
      throw badRequest('Tell us what went wrong — at least a sentence, so we can resolve it faster.');
    }

    const escrow = engine.getOrThrow(escrowId);
    const role = engine.assertParty(escrow, req.actor.userId);

    if (!['funded', 'in_progress'].includes(escrow.status)) {
      throw conflict('Only a funded escrow can be disputed.');
    }
    if (disputes.findOne((d) => d.escrowId === escrowId && d.status !== 'resolved')) {
      throw conflict('There is already an open dispute on this escrow.');
    }

    // Classify before a human ever sees it. Never blocks on the model.
    const classification = await triage(String(reason), {
      type: escrow.type,
      amountNaira: toNaira(escrow.amountKobo),
      raisedByRole: role,
    });

    const id = randomId('dsp');
    const dispute = {
      id,
      escrowId,
      raisedById: req.actor.userId,
      raisedByRole: role,
      againstId: role === 'buyer' ? escrow.sellerId : escrow.buyerId,
      reason: String(reason).slice(0, 2000),
      evidenceUrls: Array.isArray(evidenceUrls) ? evidenceUrls.slice(0, 10).map(String) : [],
      ai: classification,
      status: classification.severity === 'critical' ? 'under_review' : 'open',
      resolution: null,
      createdAt: new Date().toISOString(),
    };
    disputes.set(id, dispute);
    engine.markDisputed(escrowId, req.actor.userId);

    res.status(201).json({ dispute: view(disputes.get(id)) });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------- list ---------------------------------- */
router.get('/', (req, res) => {
  const isAdmin = req.user?.role === 'admin';
  const all = disputes.all().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const scoped = isAdmin
    ? all
    : all.filter((d) => d.raisedById === req.actor.userId || d.againstId === req.actor.userId);

  const filtered = req.query.status
    ? scoped.filter((d) => String(req.query.status).split(',').includes(d.status))
    : scoped;

  res.json({
    disputes: filtered.map(view),
    counts: {
      open: all.filter((d) => d.status === 'open').length,
      under_review: all.filter((d) => d.status === 'under_review').length,
      resolved: all.filter((d) => d.status === 'resolved').length,
    },
  });
});

router.get('/:id', (req, res, next) => {
  try {
    const dispute = disputes.get(req.params.id);
    if (!dispute) throw notFound('Dispute not found.');
    const isAdmin = req.user?.role === 'admin';
    const isParty = [dispute.raisedById, dispute.againstId].includes(req.actor.userId);
    if (!isAdmin && !isParty) throw forbidden('You are not party to this dispute.');
    res.json({ dispute: view(dispute) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ admin resolve ----------------------------- */
router.post('/:id/resolve', requireAdmin, (req, res, next) => {
  try {
    const dispute = disputes.get(req.params.id);
    if (!dispute) throw notFound('Dispute not found.');
    if (dispute.status === 'resolved') throw conflict('This dispute is already resolved.');

    const { outcome, note, coverFromReserve } = req.body ?? {};
    if (!['release_to_seller', 'refund_buyer'].includes(outcome)) {
      throw badRequest('outcome must be "release_to_seller" or "refund_buyer".');
    }

    const escrow =
      outcome === 'release_to_seller'
        ? engine.release(dispute.escrowId, null, { reason: 'dispute_resolved_for_seller' })
        : engine.refund(dispute.escrowId, { reason: 'dispute_resolved_for_buyer' });

    let reserve = null;
    if (coverFromReserve && outcome === 'refund_buyer') {
      reserve = payoutFromReserve(dispute.escrowId, escrow.amountKobo, `Dispute ${dispute.id} covered`);
    }

    const resolved = disputes.update(dispute.id, {
      status: 'resolved',
      resolution: { outcome, note: String(note ?? '').slice(0, 1000), resolvedBy: req.user.id },
      resolvedAt: new Date().toISOString(),
    });

    broadcast([escrow.buyerId, escrow.sellerId], 'dispute.resolved', {
      disputeId: dispute.id,
      outcome,
      escrow: engine.publicView(escrow),
    });

    res.json({ dispute: view(resolved), reserve });
  } catch (err) {
    next(err);
  }
});

/** Admin moves a dispute into review without deciding it yet. */
router.post('/:id/review', requireAdmin, (req, res, next) => {
  try {
    const dispute = disputes.get(req.params.id);
    if (!dispute) throw notFound('Dispute not found.');
    res.json({ dispute: view(disputes.update(dispute.id, { status: 'under_review' })) });
  } catch (err) {
    next(err);
  }
});

export default router;
