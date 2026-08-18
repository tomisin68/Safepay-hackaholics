import { Router } from 'express';
import { users } from '../store/index.js';
import { optionalAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { notFound } from '../lib/errors.js';
import { computeScore, TIER_LABELS } from '../services/scoreEngine.js';

const router = Router();

/**
 * Reputation portability.
 *
 * These endpoints are public on purpose: a score locked inside one app is not a
 * reputation, it is a silo. Any third party can look a seller up, exactly like
 * a credit bureau — but for everyday trading.
 */
router.use(rateLimit({ windowMs: 60_000, max: 240, name: 'score' }));

const TIER_COLOR = {
  new: '#6B6270',
  building: '#8A5300',
  trusted: '#0B6B58',
  verified_pro: '#981D87',
};

function resolveUser(idOrEmail) {
  return (
    users.get(idOrEmail) ||
    users.findOne((u) => u.email === String(idOrEmail).toLowerCase()) ||
    null
  );
}

/** Full score with the breakdown — an explainable trust score. */
router.get('/:userId', optionalAuth, (req, res, next) => {
  try {
    const user = resolveUser(req.params.userId);
    if (!user) throw notFound('No SafePay profile for that user.');

    const score = computeScore(user.id);
    const detailed = req.actor?.userId === user.id || req.user?.role === 'admin';

    res.json({
      user: { id: user.id, name: user.name, memberSince: user.createdAt },
      score: score.score,
      tier: score.tier,
      tierLabel: score.tierLabel,
      stats: {
        escrowsCompleted: score.stats.escrowsCompleted,
        disputeRatePct: score.stats.disputeRatePct,
        uniqueCounterparties: score.stats.uniqueCounterparties,
        verificationTier: score.stats.verificationTier,
        medianReleaseHours: score.stats.medianReleaseHours,
        ...(detailed
          ? {
              totalValueSettledNaira: score.stats.totalValueSettledNaira,
              accountAgeDays: score.stats.accountAgeDays,
              concentrationFlag: score.stats.concentrationFlag,
            }
          : {}),
      },
      ...(detailed ? { breakdown: score.breakdown, weights: score.weights } : {}),
      updatedAt: score.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Embeddable Trust Badge.
 *
 * A single <img src="…/badge/:userId.svg"> — works in an Instagram bio link, a
 * WhatsApp storefront, or any website, with no SDK and no JavaScript.
 */
router.get('/:userId/badge.svg', (req, res) => {
  const user = resolveUser(req.params.userId);
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';

  const score = user ? computeScore(user.id) : null;
  const name = user ? user.name : 'Unknown seller';
  const value = score ? score.score : 0;
  const tierLabel = score ? TIER_LABELS[score.tier] : 'Not on SafePay';
  const accent = score ? TIER_COLOR[score.tier] : '#6B6270';

  const bg = theme === 'dark' ? '#241021' : '#FFFFFF';
  const border = theme === 'dark' ? '#4A2545' : '#EDE7EC';
  const ink = theme === 'dark' ? '#FFFFFF' : '#20111E';
  const muted = theme === 'dark' ? '#B9A6B7' : '#6B6270';
  const ring = theme === 'dark' ? '#3E2039' : '#F1E9F0';

  const clean = (s) => String(s).replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]);

  const circumference = 2 * Math.PI * 22;
  const dash = (value / 100) * circumference;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="76" viewBox="0 0 300 76" role="img" aria-label="SafePay trust score ${value} out of 100 for ${clean(name)}">
  <title>SafePay SafeScore — ${clean(name)}: ${value}/100 (${clean(tierLabel)})</title>
  <rect x="0.75" y="0.75" width="298.5" height="74.5" rx="14" fill="${bg}" stroke="${border}" stroke-width="1.5"/>
  <g transform="translate(38,38)">
    <circle r="22" fill="none" stroke="${ring}" stroke-width="6"/>
    <circle r="22" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round"
            stroke-dasharray="${dash.toFixed(1)} ${(circumference - dash).toFixed(1)}"
            transform="rotate(-90)"/>
    <text x="0" y="6" text-anchor="middle" font-family="Outfit, Inter, Segoe UI, sans-serif"
          font-size="19" font-weight="700" fill="${ink}">${value}</text>
  </g>
  <text x="76" y="28" font-family="Outfit, Inter, Segoe UI, sans-serif" font-size="15" font-weight="600" fill="${ink}">${clean(name).slice(0, 22)}</text>
  <text x="76" y="46" font-family="Inter, Segoe UI, sans-serif" font-size="12" font-weight="600" fill="${accent}">${clean(tierLabel)}</text>
  <text x="76" y="62" font-family="Inter, Segoe UI, sans-serif" font-size="10" letter-spacing="1.1" fill="${muted}">VERIFIED BY SAFEPAY</text>
  <g transform="translate(258,22) scale(0.076)" opacity="0.9">
    <path d="M256 96 L368 134 V248 C368 328 320 384 256 412 C192 384 144 328 144 248 V134 Z"
          fill="none" stroke="${accent}" stroke-width="26" stroke-linejoin="round"/>
    <path d="M204 256 L241 294 L320 206" fill="none" stroke="${accent}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

  res.set('Content-Type', 'image/svg+xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300');
  res.set('Access-Control-Allow-Origin', '*');
  res.send(svg);
});

export default router;
