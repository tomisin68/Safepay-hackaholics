import { Router } from 'express';
import { escrows, disputes, users, ledger, fraudFlags } from '../store/index.js';
import { sessionAuth, requireAdmin } from '../middleware/auth.js';
import { notFound } from '../lib/errors.js';
import { reserveSummary } from '../services/ledger.js';
import { openFlags } from '../services/fraud.js';
import { sweepAutoReleases } from '../services/escrowEngine.js';

const router = Router();
router.use(sessionAuth, requireAdmin);

router.get('/overview', (_req, res) => {
  const all = escrows.all();
  const held = all.filter((e) => ['funded', 'in_progress'].includes(e.status));
  const released = all.filter((e) => e.status === 'released');
  const openDisputes = disputes.find((d) => d.status !== 'resolved');

  // 14-day settlement volume for the dashboard chart.
  const series = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10);
    const onDay = released.filter((e) => (e.releasedAt ?? '').slice(0, 10) === day);
    return {
      date: day,
      valueKobo: onDay.reduce((s, e) => s + e.amountKobo, 0),
      count: onDay.length,
    };
  });

  res.json({
    totals: {
      users: users.count(),
      escrows: all.length,
      heldKobo: held.reduce((s, e) => s + e.amountKobo, 0),
      settledKobo: released.reduce((s, e) => s + e.amountKobo, 0),
      openDisputes: openDisputes.length,
      openFlags: openFlags().length,
      disputeRatePct: all.length ? Math.round((disputes.count() / all.length) * 1000) / 10 : 0,
    },
    reserve: reserveSummary(),
    series,
    recentLedger: ledger
      .all()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20),
  });
});

router.get('/flags', (_req, res) => {
  res.json({ flags: openFlags(), all: fraudFlags.all().length });
});

router.post('/flags/:id/:action', (req, res, next) => {
  try {
    const flag = fraudFlags.get(req.params.id);
    if (!flag) throw notFound('Flag not found.');
    const status = req.params.action === 'clear' ? 'cleared' : 'escalated';
    res.json({ flag: fraudFlags.update(flag.id, { status, reviewedAt: new Date().toISOString() }) });
  } catch (err) {
    next(err);
  }
});

router.get('/users', (_req, res) => {
  res.json({
    users: users
      .all()
      .map(({ passwordHash, ...u }) => u)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
});

/** Manual trigger for the auto-release sweep — handy during a live demo. */
router.post('/sweep', (_req, res) => {
  const released = sweepAutoReleases();
  res.json({ released: released.length });
});

export default router;
