import { Router } from 'express';
import { escrows } from '../store/index.js';
import { anyAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { badRequest } from '../lib/errors.js';
import { toKobo } from '../lib/money.js';
import * as engine from '../services/escrowEngine.js';
import { entriesFor } from '../services/ledger.js';
import { balanceOf as walletBalance } from '../services/wallet.js';

const router = Router();
router.use(anyAuth, rateLimit({ windowMs: 60_000, max: 120, name: 'escrows' }));

/** Accepts either `amountKobo` (integer, canonical) or `amount` in naira. */
function resolveAmount(body) {
  if (body.amountKobo != null) return Math.round(Number(body.amountKobo));
  if (body.amount != null) return toKobo(body.amount);
  throw badRequest('Provide an amount.');
}

/* ------------------------------- create ------------------------------- */
router.post('/', (req, res, next) => {
  try {
    const body = req.body ?? {};
    const amountKobo = resolveAmount(body);

    const milestones = Array.isArray(body.milestones)
      ? body.milestones.map((m) => ({
          title: m.title,
          amountKobo: m.amountKobo != null ? Math.round(Number(m.amountKobo)) : toKobo(m.amount),
        }))
      : undefined;

    const { escrow, flags } = engine.create({
      buyerId: body.role === 'seller' ? body.buyerId ?? null : req.actor.userId,
      sellerId: body.role === 'seller' ? req.actor.userId : body.sellerId ?? null,
      sellerEmail: body.sellerEmail,
      type: body.type ?? 'goods',
      amountKobo,
      title: body.title,
      description: body.description,
      milestones,
      appId: req.actor.appId,
    });

    res.status(201).json({ escrow: engine.publicView(escrow), flags: flags.map((f) => f.label) });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------- list -------------------------------- */
router.get('/', (req, res) => {
  const { userId } = req.actor;
  const { status, type, role } = req.query;

  let mine = escrows.find((e) => e.buyerId === userId || e.sellerId === userId);
  if (req.actor.appId) {
    mine = escrows.find((e) => e.appId === req.actor.appId || e.buyerId === userId || e.sellerId === userId);
  }
  if (status) mine = mine.filter((e) => String(status).split(',').includes(e.status));
  if (type) mine = mine.filter((e) => e.type === type);
  if (role === 'buyer') mine = mine.filter((e) => e.buyerId === userId);
  if (role === 'seller') mine = mine.filter((e) => e.sellerId === userId);

  mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({
    escrows: mine.map(engine.publicView),
    summary: summarise(mine, userId),
  });
});

/**
 * The numbers behind the dashboard tiles.
 *
 * `releasedKobo` is deliberately net of the SafePay fee on the viewer's own
 * side: a seller who sold for 100,000 was paid 98,500, and showing them the
 * round number is the kind of small lie that costs a payments product its
 * credibility. A buyer sees what actually left their balance, which is gross.
 */
function summarise(list, userId) {
  const held = list.filter((e) => ['funded', 'in_progress'].includes(e.status));
  const released = list.filter((e) => e.status === 'released');
  const netFor = (e) =>
    (e.sellerId === userId ? (e.netToSellerKobo ?? e.amountKobo - (e.feeKobo ?? 0)) : e.amountKobo);

  return {
    total: list.length,
    inEscrowKobo: held.reduce((s, e) => s + e.amountKobo, 0),
    releasedKobo: released.reduce((s, e) => s + netFor(e), 0),
    earnedKobo: released.filter((e) => e.sellerId === userId).reduce((s, e) => s + (e.netToSellerKobo ?? e.amountKobo), 0),
    feesPaidKobo: released.filter((e) => e.sellerId === userId).reduce((s, e) => s + (e.feeKobo ?? 0), 0),
    balanceKobo: walletBalance(userId),
    openDisputes: list.filter((e) => e.status === 'disputed').length,
    awaitingAction: list.filter(
      (e) => (e.status === 'created' && e.buyerId === userId)
        || (e.status === 'in_progress' && e.buyerId === userId)
        || (e.status === 'funded' && e.sellerId === userId),
    ).length,
  };
}

/* ----------------------------- claim by code -------------------------- */
router.post('/claim', (req, res, next) => {
  try {
    const escrow = engine.claim(req.body?.code, req.actor.userId);
    res.json({ escrow: engine.publicView(escrow) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ read one ------------------------------ */
router.get('/:id', (req, res, next) => {
  try {
    const escrow = engine.getOrThrow(req.params.id);
    engine.assertParty(escrow, req.actor.userId);
    res.json({
      escrow: engine.publicView(escrow),
      ledger: entriesFor(escrow.id),
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ transitions --------------------------- */
const action = (fn) => (req, res, next) => {
  try {
    res.json({ escrow: engine.publicView(fn(req)) });
  } catch (err) {
    next(err);
  }
};

router.post('/:id/fund', action((req) => engine.fund(req.params.id, req.actor.userId)));

router.post('/:id/deliver', action((req) =>
  engine.markDelivered(req.params.id, req.actor.userId, req.body?.note, req.body?.proof)));

/* The photo itself, on its own route. Kept out of the escrow payload so a list
 * of fifty escrows stays a list of fifty escrows. Readable by both parties and
 * by an administrator reviewing a dispute — see engine.deliveryProof. */
router.get('/:id/proof', (req, res, next) => {
  try {
    res.json({ proof: engine.deliveryProof(req.params.id, req.actor.userId) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/release', action((req) =>
  engine.release(req.params.id, req.actor.userId, { reason: 'buyer_confirmed' })));

router.post('/:id/cancel', action((req) => engine.cancel(req.params.id, req.actor.userId)));

router.post('/:id/milestones/:milestoneId/approve', action((req) =>
  engine.approveMilestone(req.params.id, req.params.milestoneId, req.actor.userId)));

export default router;
