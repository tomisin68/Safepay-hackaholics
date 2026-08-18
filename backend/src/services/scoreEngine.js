import { escrows, disputes, users } from '../store/index.js';
import { toNaira } from '../lib/money.js';

/**
 * SafeScore — a 0-100 portable trust score.
 *
 * Every component is bounded and additive so the score is explainable: the API
 * returns the breakdown, not just the number, because a trust score nobody can
 * interrogate is a trust score nobody trusts.
 */

export const WEIGHTS = {
  volume: 25,        // how many deals actually completed
  value: 10,         // how much value has settled through them
  reliability: 25,   // dispute-free record
  speed: 10,         // how fast they confirm/release
  verification: 15,  // identity assurance
  age: 5,            // account tenure
  diversity: 10,     // how many *different* people vouch for them
};

const VERIFICATION_POINTS = { none: 0, phone: 5, bvn_nin: 12, address: 15 };

const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const logScale = (value, ceiling) => clamp01(Math.log1p(Math.max(0, value)) / Math.log1p(ceiling));

export function tierFor(score) {
  if (score >= 80) return 'verified_pro';
  if (score >= 55) return 'trusted';
  if (score >= 25) return 'building';
  return 'new';
}

export const TIER_LABELS = {
  new: 'New',
  building: 'Building Trust',
  trusted: 'Trusted',
  verified_pro: 'Verified Pro',
};

/** Escrows this user took part in that reached a terminal, money-moved state. */
function settledFor(userId) {
  return escrows.find(
    (e) => (e.buyerId === userId || e.sellerId === userId) && ['released', 'refunded'].includes(e.status),
  );
}

export function computeScore(userId) {
  const user = users.get(userId);
  if (!user) return null;

  const involved = escrows.find((e) => e.buyerId === userId || e.sellerId === userId);
  const settled = settledFor(userId);
  const completed = settled.filter((e) => e.status === 'released');
  const userDisputes = disputes.find((d) => d.againstId === userId);

  /* --- volume ------------------------------------------------------- */
  const volume = logScale(completed.length, 30) * WEIGHTS.volume;

  /* --- value settled ------------------------------------------------ */
  const totalValueNaira = completed.reduce((sum, e) => sum + toNaira(e.amountKobo), 0);
  const value = logScale(totalValueNaira, 5_000_000) * WEIGHTS.value;

  /* --- reliability --------------------------------------------------
   * Smoothed so a single early dispute is a dent, not a life sentence,
   * while a pattern of them still bites hard (squared falloff).
   *
   * Scaled by evidence: a clean record earns full marks only once there is
   * enough history to mean anything. Nobody gets 25 points for never having
   * disputed a transaction they never made.                            */
  const disputeRate = userDisputes.length / (settled.length + 3);
  const evidence = clamp01(settled.length / 6);
  const reliability = (1 - clamp01(disputeRate)) ** 2 * WEIGHTS.reliability * evidence;

  /* --- speed to confirm --------------------------------------------- */
  const releaseHours = completed
    .filter((e) => e.fundedAt && e.releasedAt)
    .map((e) => (new Date(e.releasedAt) - new Date(e.fundedAt)) / 36e5);
  const medianHours = median(releaseHours);
  const speed =
    releaseHours.length === 0 ? 0 : clamp01((120 - medianHours) / 114) * WEIGHTS.speed;

  /* --- verification tier -------------------------------------------- */
  const verification = VERIFICATION_POINTS[user.verificationTier] ?? 0;

  /* --- account age --------------------------------------------------- */
  const ageDays = (Date.now() - new Date(user.createdAt).getTime()) / 864e5;
  const age = clamp01(ageDays / 180) * WEIGHTS.age;

  /* --- counterparty diversity ---------------------------------------
   * Two accounts cycling the same funds between themselves generate
   * volume but no trust. Reward breadth of counterparties.            */
  const counterparties = new Set(
    settled.map((e) => (e.buyerId === userId ? e.sellerId : e.buyerId)).filter(Boolean),
  );
  const diversityRatio = settled.length === 0 ? 0 : counterparties.size / Math.min(settled.length, 12);
  const diversity = clamp01(diversityRatio) * logScale(counterparties.size, 12) * WEIGHTS.diversity;

  const breakdown = { volume, value, reliability, speed, verification, age, diversity };
  let score = Object.values(breakdown).reduce((a, b) => a + b, 0);

  /* Anti-gaming cap: lots of volume concentrated in very few counterparties
   * cannot buy a top-tier badge. */
  const concentrated = settled.length >= 5 && counterparties.size / settled.length < 0.4;
  if (concentrated) score = Math.min(score, 54);

  score = Math.round(clamp01(score / 100) * 100);

  return {
    userId,
    score,
    tier: tierFor(score),
    tierLabel: TIER_LABELS[tierFor(score)],
    breakdown: Object.fromEntries(
      Object.entries(breakdown).map(([k, v]) => [k, Math.round(v * 10) / 10]),
    ),
    weights: WEIGHTS,
    stats: {
      escrowsTotal: involved.length,
      escrowsCompleted: completed.length,
      totalValueSettledNaira: Math.round(totalValueNaira),
      disputes: userDisputes.length,
      disputeRatePct: Math.round(disputeRate * 1000) / 10,
      medianReleaseHours: releaseHours.length ? Math.round(medianHours * 10) / 10 : null,
      uniqueCounterparties: counterparties.size,
      verificationTier: user.verificationTier,
      accountAgeDays: Math.floor(ageDays),
      concentrationFlag: concentrated,
    },
    updatedAt: new Date().toISOString(),
  };
}

/** Recompute and persist. Called after every state change that moves money. */
export function recalculate(userId) {
  const result = computeScore(userId);
  if (!result) return null;
  users.update(userId, { safeScore: result.score, scoreTier: result.tier, scoreUpdatedAt: result.updatedAt });
  return result;
}

function median(list) {
  if (!list.length) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
