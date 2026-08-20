/**
 * Demo engines — ported from backend/src/services so the numbers a visitor
 * sees in demo mode are the numbers the real API would return. Keep the
 * weights and the status flow in step with the server if either moves.
 */

import {
  escrows, disputes, users, ledger, fraudFlags, meta, proofs,
  randomId, claimCode, toNaira, bps,
} from './db.js';
import { DemoError, badRequest, forbidden, notFound, conflict } from './errors.js';
import * as wallet from './wallet.js';

export { DemoError };

/* ==========================================================================
   Ledger
   ========================================================================== */

export const FEE_BPS = 150;
const RESERVE_SHARE_BPS = 2000;

export const feeFor = (amountKobo) => bps(amountKobo, FEE_BPS);

export function record({ escrowId, type, amountKobo, note }) {
  const id = randomId('led');
  return ledger.set(id, {
    id,
    escrowId,
    type,
    amountKobo,
    note: note ?? null,
    createdAt: new Date().toISOString(),
  });
}

export function collectFee(escrowId, amountKobo) {
  const fee = feeFor(amountKobo);
  const toReserve = bps(fee, RESERVE_SHARE_BPS);
  const current = meta.get();
  meta.update({
    feesCollectedKobo: current.feesCollectedKobo + fee,
    reserveKobo: current.reserveKobo + toReserve,
  });
  record({ escrowId, type: 'fee', amountKobo: fee, note: 'SafePay fee (1.5%)' });
  record({ escrowId, type: 'reserve', amountKobo: toReserve, note: '20% of fee to Buyer Protection Reserve' });
  return { fee, toReserve };
}

export function reserveSummary() {
  const m = meta.get();
  return {
    reserveKobo: m.reserveKobo,
    feesCollectedKobo: m.feesCollectedKobo,
    payoutsKobo: ledger.find((e) => e.type === 'reserve_payout').reduce((s, e) => s + e.amountKobo, 0),
    shareOfFeePct: RESERVE_SHARE_BPS / 100,
  };
}

export const entriesFor = (escrowId) =>
  ledger.find((e) => e.escrowId === escrowId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/* The wallet is a module of its own — see ./wallet.js — but the demo router
   reaches everything through the engine, so it is re-exported here. */
export { wallet };

/* ==========================================================================
   SafeScore
   ========================================================================== */

export const WEIGHTS = {
  volume: 25, value: 10, reliability: 25, speed: 10, verification: 15, age: 5, diversity: 10,
};

const VERIFICATION_POINTS = { none: 0, email: 3, phone: 5, bvn_nin: 12, address: 15 };

const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const logScale = (value, ceiling) => clamp01(Math.log1p(Math.max(0, value)) / Math.log1p(ceiling));

export function tierFor(score) {
  if (score >= 80) return 'verified_pro';
  if (score >= 55) return 'trusted';
  if (score >= 25) return 'building';
  return 'new';
}

export const TIER_LABELS = {
  new: 'New', building: 'Building Trust', trusted: 'Trusted', verified_pro: 'Verified Pro',
};

function median(list) {
  if (!list.length) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeScore(userId) {
  const user = users.get(userId);
  if (!user) return null;

  const involved = escrows.find((e) => e.buyerId === userId || e.sellerId === userId);
  const settled = involved.filter((e) => ['released', 'refunded'].includes(e.status));
  const completed = settled.filter((e) => e.status === 'released');
  const userDisputes = disputes.find((d) => d.againstId === userId);

  const volume = logScale(completed.length, 30) * WEIGHTS.volume;

  const totalValueNaira = completed.reduce((sum, e) => sum + toNaira(e.amountKobo), 0);
  const value = logScale(totalValueNaira, 5_000_000) * WEIGHTS.value;

  /* Smoothed so a single early dispute is a dent, not a life sentence, and
     scaled by evidence so a clean record earns full marks only once there is
     enough history to mean anything. */
  const disputeRate = userDisputes.length / (settled.length + 3);
  const evidence = clamp01(settled.length / 6);
  const reliability = (1 - clamp01(disputeRate)) ** 2 * WEIGHTS.reliability * evidence;

  const releaseHours = completed
    .filter((e) => e.fundedAt && e.releasedAt)
    .map((e) => (new Date(e.releasedAt) - new Date(e.fundedAt)) / 36e5);
  const medianHours = median(releaseHours);
  const speed = releaseHours.length === 0 ? 0 : clamp01((120 - medianHours) / 114) * WEIGHTS.speed;

  const verification = VERIFICATION_POINTS[user.verificationTier] ?? 0;

  const ageDays = (Date.now() - new Date(user.createdAt).getTime()) / 864e5;
  const age = clamp01(ageDays / 180) * WEIGHTS.age;

  /* Two accounts cycling the same funds between themselves generate volume but
     no trust. Reward breadth of counterparties. */
  const counterparties = new Set(
    settled.map((e) => (e.buyerId === userId ? e.sellerId : e.buyerId)).filter(Boolean),
  );
  const diversityRatio = settled.length === 0 ? 0 : counterparties.size / Math.min(settled.length, 12);
  const diversity = clamp01(diversityRatio) * logScale(counterparties.size, 12) * WEIGHTS.diversity;

  const breakdown = { volume, value, reliability, speed, verification, age, diversity };
  let score = Object.values(breakdown).reduce((a, b) => a + b, 0);

  const concentrated = settled.length >= 5 && counterparties.size / settled.length < 0.4;
  if (concentrated) score = Math.min(score, 54);

  score = Math.round(clamp01(score / 100) * 100);

  return {
    userId,
    score,
    tier: tierFor(score),
    tierLabel: TIER_LABELS[tierFor(score)],
    breakdown: Object.fromEntries(Object.entries(breakdown).map(([k, v]) => [k, Math.round(v * 10) / 10])),
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

export function recalculate(userId) {
  const result = computeScore(userId);
  if (!result) return null;
  users.update(userId, { safeScore: result.score, scoreTier: result.tier, scoreUpdatedAt: result.updatedAt });
  return result;
}

/* ==========================================================================
   Fraud heuristics
   ========================================================================== */

export function evaluateFraud(userId, escrow) {
  const flags = [];
  const user = users.get(userId);
  if (!user) return flags;

  const ageDays = (Date.now() - new Date(user.createdAt).getTime()) / 864e5;
  const mine = escrows.find((e) => e.buyerId === userId || e.sellerId === userId);

  if (ageDays < 2 && escrow.amountKobo >= 5_000_000) {
    flags.push({ label: 'High value on a brand-new account', severity: 'high' });
  }
  const lastHour = mine.filter((e) => Date.now() - new Date(e.createdAt).getTime() < 36e5);
  if (lastHour.length >= 5) {
    flags.push({ label: 'Unusual burst of escrows in one hour', severity: 'medium' });
  }
  if (escrow.sellerId) {
    const pair = mine.filter((e) => e.buyerId === escrow.sellerId && e.sellerId === userId);
    if (pair.length >= 3) flags.push({ label: 'Funds cycling between the same two accounts', severity: 'high' });
  }

  for (const flag of flags) {
    const id = randomId('flg');
    fraudFlags.set(id, {
      id, userId, escrowId: escrow.id, label: flag.label, severity: flag.severity,
      status: 'open', createdAt: new Date().toISOString(), reviewedAt: null,
    });
  }
  return flags;
}

export const openFlags = () =>
  fraudFlags.find((f) => f.status === 'open').map((f) => ({ ...f, user: users.get(f.userId)?.name ?? 'Unknown' }));

/* ==========================================================================
   Dispute triage — the rule-based classifier the server falls back to when no
   GEMINI_API_KEY is configured. Demo mode always takes this path.
   ========================================================================== */

const CATEGORIES = {
  not_delivered: { label: 'Item never delivered', guidance: 'Refund the buyer unless the seller produces dispatch proof.' },
  not_as_described: { label: 'Not as described', guidance: 'Request photos from both sides, then split or refund.' },
  damaged: { label: 'Arrived damaged', guidance: 'Ask for unboxing evidence; a partial refund is usually fair.' },
  likely_fraud: { label: 'Likely fraud', guidance: 'Freeze funds, refund the buyer, and flag the seller account.' },
  buyer_remorse: { label: 'Buyer changed their mind', guidance: 'Release to the seller — remorse is not a protected reason.' },
  other: { label: 'Needs a human', guidance: 'Read the thread and contact both parties.' },
};

const SEVERITY_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };

const RULES = [
  {
    category: 'not_delivered', severity: 'high', weight: 2,
    patterns: [/never (arrived|came|delivered|showed)/i, /not (yet )?(received|delivered|arrived)/i, /still waiting/i, /no (parcel|package|item)/i],
  },
  {
    category: 'likely_fraud', severity: 'critical', weight: 3,
    patterns: [/block(ed|ing)? me/i, /stopped (replying|responding)/i, /scam/i, /fraud/i, /disappeared/i, /fake (account|profile)/i, /phone (is )?(off|switched off)/i],
  },
  {
    category: 'not_as_described', severity: 'medium', weight: 2,
    patterns: [/not as (described|advertised)/i, /different (from|than)/i, /wrong (item|colour|color|size|model)/i, /shutter count/i, /counterfeit|replica|fake (item|product)/i],
  },
  {
    category: 'damaged', severity: 'medium', weight: 2,
    patterns: [/damaged|broken|cracked|scratch(ed)?|dent(ed)?|faulty|not working/i],
  },
  {
    category: 'buyer_remorse', severity: 'low', weight: 2,
    patterns: [/changed my mind/i, /no longer (want|need)/i, /found (it )?cheaper/i, /do ?n.?t (want|need) it/i],
  },
];

export function ruleClassify(text = '') {
  const scores = new Map();
  let severity = 'low';

  for (const rule of RULES) {
    const hits = rule.patterns.filter((p) => p.test(text)).length;
    if (!hits) continue;
    scores.set(rule.category, (scores.get(rule.category) ?? 0) + hits * rule.weight);
    if (SEVERITY_ORDER[rule.severity] > SEVERITY_ORDER[severity]) severity = rule.severity;
  }

  if (scores.size === 0) {
    return {
      category: 'other', label: CATEGORIES.other.label, severity: 'medium', confidence: 0.3,
      summary: text.trim().slice(0, 180) || 'No description supplied.',
      guidance: CATEGORIES.other.guidance, source: 'rules',
    };
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [category, top] = ranked[0];
  const total = ranked.reduce((s, [, v]) => s + v, 0);

  return {
    category,
    label: CATEGORIES[category].label,
    severity,
    confidence: Math.min(0.92, 0.45 + (top / total) * 0.45),
    summary: text.trim().slice(0, 180),
    guidance: CATEGORIES[category].guidance,
    source: 'rules',
  };
}

/* ==========================================================================
   Escrow state machine
   ========================================================================== */

export const ESCROW_TYPES = ['goods', 'service_milestone', 'rental', 'recurring', 'in_person'];

/* There is no timer on a hold. Money leaves an escrow when the buyer confirms,
   when they approve a milestone, or when an administrator decides a dispute —
   and at no other moment. An earlier build auto-released after a few days of
   buyer silence and advertised it all over the UI; SafePay does not do that,
   so the copy and the clock both had to go. */

/** Base64 characters. Matches the server's ceiling on a delivery photo. */
const MAX_PROOF_CHARS = 700_000;
const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const STATUS_FLOW = {
  created: ['funded', 'cancelled'],
  funded: ['in_progress', 'released', 'disputed', 'refunded'],
  in_progress: ['released', 'disputed', 'refunded'],
  disputed: ['released', 'refunded'],
  released: [], refunded: [], cancelled: [], expired: [],
};

function assertTransition(from, to) {
  if (!STATUS_FLOW[from]?.includes(to)) {
    throw conflict(`An escrow that is "${from}" cannot move to "${to}".`, { from, to });
  }
}

const party = (escrow, userId) =>
  escrow.buyerId === userId ? 'buyer' : escrow.sellerId === userId ? 'seller' : null;

export function assertParty(escrow, userId) {
  const role = party(escrow, userId);
  if (!role) throw forbidden('You are not a party to this escrow.');
  return role;
}

export function getOrThrow(id) {
  const escrow = escrows.get(id);
  if (!escrow) throw notFound('Escrow not found.');
  return escrow;
}

function touch(escrow, patch, event) {
  const note = patch.note ?? null;
  const clean = { ...patch };
  delete clean.note;
  return escrows.update(escrow.id, {
    ...clean,
    timeline: [...(escrow.timeline ?? []), { event, at: new Date().toISOString(), note }],
  });
}

export function createEscrow({ buyerId, sellerId, sellerEmail, type, amountKobo, title, description, milestones }) {
  if (!ESCROW_TYPES.includes(type)) throw badRequest(`type must be one of: ${ESCROW_TYPES.join(', ')}`);
  if (!Number.isInteger(amountKobo) || amountKobo < 10000) {
    throw badRequest('Amount must be at least 100.00 NGN.');
  }
  if (buyerId && sellerId && buyerId === sellerId) {
    throw badRequest('Buyer and seller must be different people.');
  }

  let resolvedSellerId = sellerId ?? null;
  if (!resolvedSellerId && sellerEmail) {
    resolvedSellerId = users.findOne((u) => u.email === String(sellerEmail).toLowerCase())?.id ?? null;
  }

  let normalisedMilestones = null;
  if (type === 'service_milestone') {
    if (!Array.isArray(milestones) || milestones.length === 0) {
      throw badRequest('A milestone escrow needs at least one milestone.');
    }
    const total = milestones.reduce((s, m) => s + Number(m.amountKobo ?? 0), 0);
    if (total !== amountKobo) {
      throw badRequest('Milestone amounts must add up to the escrow total.', { total, amountKobo });
    }
    normalisedMilestones = milestones.map((m, i) => ({
      id: m.id ?? `ms_${i + 1}`,
      title: String(m.title ?? `Milestone ${i + 1}`).slice(0, 120),
      amountKobo: Number(m.amountKobo),
      status: 'pending',
      approvedAt: null,
    }));
  }

  const id = randomId('esc');
  const now = new Date().toISOString();
  const feeKobo = feeFor(amountKobo);

  escrows.set(id, {
    id,
    buyerId: buyerId ?? null,
    sellerId: resolvedSellerId,
    sellerEmail: sellerEmail ? String(sellerEmail).toLowerCase() : null,
    appId: null,
    type,
    title: String(title ?? '').slice(0, 140) || 'Untitled escrow',
    description: String(description ?? '').slice(0, 2000),
    amountKobo,
    currency: 'NGN',
    feeKobo,
    netToSellerKobo: amountKobo - feeKobo,
    status: 'created',
    milestones: normalisedMilestones,
    claimCode: type === 'in_person' ? claimCode() : null,
    fundedAt: null,
    releasedAt: null,
    disputedAt: null,
    deliveryProof: null,
    flagged: false,
    createdAt: now,
    updatedAt: now,
    timeline: [{ event: 'created', at: now, note: null }],
  });

  const flags = buyerId ? evaluateFraud(buyerId, escrows.get(id)) : [];
  if (flags.length) escrows.update(id, { flagged: true });

  return { escrow: escrows.get(id), flags };
}

export function fund(id, userId) {
  const escrow = getOrThrow(id);
  if (party(escrow, userId) !== 'buyer') throw forbidden('Only the buyer can fund this escrow.');
  assertTransition(escrow.status, 'funded');

  /* Checked before anything is written, so a buyer who cannot cover the escrow
     gets a 409 carrying the shortfall — which the UI turns into a top-up — and
     not a half-funded escrow. */
  wallet.assertCanSpend(userId, escrow.amountKobo);

  wallet.debit(userId, escrow.amountKobo, {
    type: 'escrow_fund',
    note: `Held in escrow: ${escrow.title}`,
    escrowId: id,
  });
  record({ escrowId: id, type: 'fund', amountKobo: escrow.amountKobo, note: 'Buyer funded escrow, funds held by SafePay' });

  return touch(escrow, { status: 'funded', fundedAt: new Date().toISOString() }, 'funded');
}

export function markDelivered(id, userId, note, proof) {
  const escrow = getOrThrow(id);
  if (party(escrow, userId) !== 'seller') throw forbidden('Only the seller can update delivery.');
  assertTransition(escrow.status, 'in_progress');

  const stored = proof ? storeProof(escrow, userId, proof) : null;

  return touch(escrow, {
    status: 'in_progress',
    note: note ?? null,
    ...(stored ? { deliveryProof: stored } : {}),
  }, 'delivered');
}

/**
 * Files the seller's photo of the handover.
 *
 * A buyer who goes quiet is the hardest case an escrow has: without evidence
 * the only honest answer is "we cannot tell". This is that evidence — timestamped,
 * attributed, and visible to both sides and to whoever decides a dispute.
 */
function storeProof(escrow, userId, proof) {
  const dataUrl = String(proof?.dataUrl ?? '');
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) throw badRequest('Upload a photo as a base64 data URL.');

  const [, contentType, payload] = match;
  if (!PROOF_TYPES.includes(contentType.toLowerCase())) {
    throw badRequest('Delivery proof must be a JPEG, PNG or WebP image.');
  }
  if (payload.length > MAX_PROOF_CHARS) {
    throw badRequest('That image is too large. Around 1MB or less, please.');
  }

  const id = randomId('prf');
  const uploadedAt = new Date().toISOString();
  const byteSize = Math.floor((payload.length * 3) / 4);
  const fileName = proof?.fileName ? String(proof.fileName).slice(0, 120) : null;

  proofs.set(id, {
    id, escrowId: escrow.id, uploadedById: userId, contentType, dataUrl, fileName, byteSize,
    createdAt: uploadedAt,
  });

  return { id, fileName, byteSize, contentType, uploadedAt, uploadedById: userId };
}

/**
 * The image behind `escrow.deliveryProof`.
 *
 * Both parties may look, and so may an administrator — collecting evidence and
 * then hiding it from the only person who decides disputes would defeat the
 * point of collecting it. Nobody else.
 */
export function deliveryProof(escrowId, userId) {
  const escrow = getOrThrow(escrowId);
  if (users.get(userId)?.role !== 'admin') assertParty(escrow, userId);
  if (!escrow.deliveryProof?.id) throw notFound('No delivery proof was uploaded for this escrow.');

  const stored = proofs.get(escrow.deliveryProof.id);
  if (!stored) throw notFound('That delivery proof is no longer available.');

  return {
    id: stored.id,
    escrowId: stored.escrowId,
    dataUrl: stored.dataUrl,
    contentType: stored.contentType,
    fileName: stored.fileName,
    byteSize: stored.byteSize,
    uploadedById: stored.uploadedById,
    uploadedAt: stored.createdAt,
  };
}

export function release(id, userId) {
  const escrow = getOrThrow(id);
  if (userId && party(escrow, userId) !== 'buyer') throw forbidden('Only the buyer can release these funds.');
  assertTransition(escrow.status, 'released');

  const { fee } = collectFee(id, escrow.amountKobo);
  record({ escrowId: id, type: 'release', amountKobo: escrow.amountKobo - fee, note: 'Released to seller (buyer confirmed)' });

  /* Net, not gross. The seller's balance is the number they can withdraw, so
     the fee comes off here rather than being mentioned elsewhere and quietly
     forgotten. Two entries so the statement shows both halves. */
  if (escrow.sellerId) payOutToSeller(escrow, escrow.amountKobo, fee, `Escrow released: ${escrow.title}`);

  const next = touch(escrow, { status: 'released', releasedAt: new Date().toISOString() }, 'released');
  [escrow.buyerId, escrow.sellerId].filter(Boolean).forEach(recalculate);
  return next;
}

/**
 * Moves one settled amount out of the hold and into the seller's wallet, less
 * the SafePay fee on it. Two entries rather than one net credit, so a seller
 * can see the gross they earned and the fee they paid.
 */
function payOutToSeller(escrow, grossKobo, feeKobo, note) {
  wallet.credit(escrow.sellerId, grossKobo, { type: 'escrow_release', note, escrowId: escrow.id });
  if (feeKobo > 0) {
    wallet.debit(escrow.sellerId, feeKobo, {
      type: 'fee', note: `SafePay fee on ${escrow.title}`, escrowId: escrow.id,
    });
  }
}

export function approveMilestone(id, milestoneId, userId) {
  const escrow = getOrThrow(id);
  if (party(escrow, userId) !== 'buyer') throw forbidden('Only the buyer can approve a milestone.');
  if (escrow.type !== 'service_milestone') throw badRequest('This escrow has no milestones.');
  if (!['funded', 'in_progress'].includes(escrow.status)) throw conflict('Fund the escrow before approving milestones.');

  const target = (escrow.milestones ?? []).find((m) => m.id === milestoneId);
  if (!target) throw notFound('Milestone not found.');
  if (target.status === 'approved') throw conflict('That milestone is already approved.');

  const milestones = escrow.milestones.map((m) =>
    m.id === milestoneId ? { ...m, status: 'approved', approvedAt: new Date().toISOString() } : m,
  );
  const allApproved = milestones.every((m) => m.status === 'approved');

  /* The fee is charged per milestone, on the slice being released. Charging it
     again on the whole escrow at the end billed the last milestone twice. */
  const { fee } = collectFee(id, target.amountKobo);
  record({ escrowId: id, type: 'milestone_release', amountKobo: target.amountKobo - fee, note: `Milestone released: ${target.title}` });
  if (escrow.sellerId) payOutToSeller(escrow, target.amountKobo, fee, `Milestone released: ${target.title}`);

  const next = touch(escrow, {
    milestones,
    status: allApproved ? 'released' : 'in_progress',
    ...(allApproved ? { releasedAt: new Date().toISOString() } : {}),
  }, allApproved ? 'released' : 'milestone_approved');

  if (allApproved) [escrow.buyerId, escrow.sellerId].filter(Boolean).forEach(recalculate);
  return next;
}

export function markDisputed(id, userId) {
  const escrow = getOrThrow(id);
  assertParty(escrow, userId);
  assertTransition(escrow.status, 'disputed');
  return touch(escrow, { status: 'disputed', disputedAt: new Date().toISOString() }, 'disputed');
}

export function refund(id, { amountKobo } = {}) {
  const escrow = getOrThrow(id);
  assertTransition(escrow.status, 'refunded');
  const amount = amountKobo ?? escrow.amountKobo;
  record({ escrowId: id, type: 'refund', amountKobo: amount, note: 'Refunded to buyer' });

  /* Refunds are whole: no fee is taken on an escrow that did not complete, so
     the buyer gets back exactly what left their balance. */
  if (escrow.buyerId) {
    wallet.credit(escrow.buyerId, amount, {
      type: 'escrow_refund', note: `Refunded: ${escrow.title}`, escrowId: id,
    });
  }

  const next = touch(escrow, { status: 'refunded', refundedAt: new Date().toISOString() }, 'refunded');
  [escrow.buyerId, escrow.sellerId].filter(Boolean).forEach(recalculate);
  return next;
}

export function cancel(id, userId) {
  const escrow = getOrThrow(id);
  assertParty(escrow, userId);
  assertTransition(escrow.status, 'cancelled');
  return touch(escrow, { status: 'cancelled', cancelledAt: new Date().toISOString() }, 'cancelled');
}

export function claim(code, userId) {
  const normalised = String(code ?? '').toUpperCase().trim();
  const escrow = escrows.findOne((e) => e.claimCode === normalised);
  if (!escrow) throw notFound('That code does not match any open escrow.');
  if (escrow.sellerId === userId) throw badRequest('You cannot claim your own escrow.');
  if (escrow.buyerId && escrow.buyerId !== userId) throw forbidden('This escrow already has a buyer.');
  if (escrow.status !== 'created') throw conflict('This escrow has already been claimed.');
  return touch(escrow, { buyerId: userId }, 'claimed');
}

export function publicView(escrow) {
  if (!escrow) return null;
  const buyer = escrow.buyerId ? users.get(escrow.buyerId) : null;
  const seller = escrow.sellerId ? users.get(escrow.sellerId) : null;
  return {
    id: escrow.id,
    type: escrow.type,
    title: escrow.title,
    description: escrow.description,
    status: escrow.status,
    amountKobo: escrow.amountKobo,
    feeKobo: escrow.feeKobo,
    netToSellerKobo: escrow.netToSellerKobo ?? escrow.amountKobo - escrow.feeKobo,
    currency: escrow.currency,
    milestones: escrow.milestones,
    claimCode: escrow.claimCode,
    flagged: Boolean(escrow.flagged),
    buyer: buyer && { id: buyer.id, name: buyer.name, safeScore: buyer.safeScore, scoreTier: buyer.scoreTier },
    seller: seller
      ? { id: seller.id, name: seller.name, safeScore: seller.safeScore, scoreTier: seller.scoreTier }
      : escrow.sellerEmail
        ? { id: null, name: escrow.sellerEmail, invited: true }
        : null,
    deliveryProof: escrow.deliveryProof ?? null,
    fundedAt: escrow.fundedAt,
    releasedAt: escrow.releasedAt,
    disputedAt: escrow.disputedAt ?? null,
    createdAt: escrow.createdAt,
    updatedAt: escrow.updatedAt,
    timeline: escrow.timeline ?? [],
  };
}

/* ==========================================================================
   SafePay Intelligence — deterministic transaction + dispute risk.

   Demo mode never calls an AI provider, so this is the rule engine only —
   the exact same scoring backend/src/services/intelligence.js runs when
   GEMINI_API_KEY is unset. Keep the point values and thresholds in step with
   that file if either moves.
   ========================================================================== */

function accountAgeDays(user) {
  if (!user) return null;
  return Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 864e5);
}

function transactionStatsFor(userId) {
  if (!userId) return { completed: 0, settled: 0, avgAmountKobo: 0, disputesAgainst: 0, disputeRatePct: 0 };

  const involved = escrows.find((e) => e.buyerId === userId || e.sellerId === userId);
  const settled = involved.filter((e) => ['released', 'refunded'].includes(e.status));
  const completed = involved.filter((e) => e.status === 'released');
  const avgAmountKobo = completed.length
    ? Math.round(completed.reduce((s, e) => s + e.amountKobo, 0) / completed.length)
    : 0;
  const disputesAgainst = disputes.find((d) => d.againstId === userId).length;
  const disputeRatePct = settled.length
    ? Math.round((disputesAgainst / (settled.length + 3)) * 1000) / 10
    : 0;

  return { completed: completed.length, settled: settled.length, avgAmountKobo, disputesAgainst, disputeRatePct };
}

export function collectRiskSignals(escrow) {
  const buyer = escrow.buyerId ? users.get(escrow.buyerId) : null;
  const seller = escrow.sellerId ? users.get(escrow.sellerId) : null;

  const sellerStats = transactionStatsFor(escrow.sellerId);
  const buyerStats = transactionStatsFor(escrow.buyerId);

  const amountToAverageRatio = sellerStats.avgAmountKobo > 0
    ? Math.round((escrow.amountKobo / sellerStats.avgAmountKobo) * 100) / 100
    : null;

  const recentActivityFlags = fraudFlags
    .find((f) => f.status === 'open' && [escrow.buyerId, escrow.sellerId].includes(f.userId))
    .map((f) => f.label);

  return {
    transaction: { amountKobo: escrow.amountKobo, amountNaira: toNaira(escrow.amountKobo), type: escrow.type, status: escrow.status },
    seller: seller
      ? {
          onSafePay: true,
          verificationTier: seller.verificationTier ?? 'none',
          accountAgeDays: accountAgeDays(seller),
          completedTransactions: sellerStats.completed,
          settledTransactions: sellerStats.settled,
          averageTransactionAmountKobo: sellerStats.avgAmountKobo,
          amountToAverageRatio,
          disputeCount: sellerStats.disputesAgainst,
          disputeRatePct: sellerStats.disputeRatePct,
          safeScore: seller.safeScore ?? 0,
          scoreTier: seller.scoreTier ?? 'new',
        }
      : { onSafePay: false, invitedEmail: escrow.sellerEmail ?? null },
    buyer: buyer
      ? {
          verificationTier: buyer.verificationTier ?? 'none',
          accountAgeDays: accountAgeDays(buyer),
          completedTransactions: buyerStats.completed,
          disputeCount: buyerStats.disputesAgainst,
          disputeRatePct: buyerStats.disputeRatePct,
          safeScore: buyer.safeScore ?? 0,
          scoreTier: buyer.scoreTier ?? 'new',
        }
      : null,
    recentActivityFlags,
  };
}

function riskLevelFor(score) {
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

export function assessTransactionRisk(escrow) {
  const signals = collectRiskSignals(escrow);
  const { seller, buyer, recentActivityFlags } = signals;
  let points = 0;
  const reasons = [];

  if (!seller.onSafePay) {
    points += 20;
    reasons.push('Seller has not yet joined SafePay, so there is no transaction history to evaluate.');
  } else {
    if (seller.completedTransactions === 0) {
      points += 15;
      reasons.push('Seller has no completed transactions on SafePay yet.');
    } else if (seller.completedTransactions >= 3 && seller.amountToAverageRatio != null) {
      if (seller.amountToAverageRatio >= 5) {
        points += 30;
        reasons.push(`Transaction amount is ${seller.amountToAverageRatio.toFixed(1)}x the seller's average transaction size.`);
      } else if (seller.amountToAverageRatio >= 2.5) {
        points += 15;
        reasons.push(`Transaction amount is notably above the seller's average (${seller.amountToAverageRatio.toFixed(1)}x).`);
      }
    }

    if (seller.disputeCount > 0) {
      if (seller.settledTransactions >= 3 && seller.disputeRatePct >= 20) {
        points += 25;
        reasons.push(`Seller has a history of disputes (${seller.disputeRatePct}% of past settled transactions).`);
      } else {
        points += 10;
        reasons.push('Seller has at least one prior dispute on record.');
      }
    }

    if (seller.verificationTier === 'none') {
      points += 10;
      reasons.push('Seller has not completed identity verification.');
    }

    if (seller.accountAgeDays != null && seller.accountAgeDays < 3) {
      points += 10;
      reasons.push('Seller account was created very recently.');
    }
  }

  if (buyer && buyer.disputeCount > 0) {
    points += 8;
    reasons.push('Buyer has previously been the subject of a dispute.');
  }

  if (recentActivityFlags.length > 0) {
    points += 12;
    reasons.push('SafePay fraud monitoring has flagged unusual recent activity on this account.');
  }

  const riskScore = Math.max(0, Math.min(100, points));
  const riskLevel = riskLevelFor(riskScore);
  if (reasons.length === 0) reasons.push('No notable risk signals were found for this transaction.');

  const recommendation = riskLevel === 'HIGH'
    ? 'Request additional verification from the seller, and consider a milestone-based release for extra protection.'
    : riskLevel === 'MEDIUM'
      ? 'Consider requesting additional verification or using a milestone-based release.'
      : 'No additional verification is required based on current signals.';

  return { riskLevel, riskScore, reasons, recommendation, signals, source: 'rules', assessedAt: new Date().toISOString() };
}

function severityWeight(severity) {
  return { low: 10, medium: 30, high: 60, critical: 90 }[severity] ?? 30;
}

export function assessDisputeRisk(dispute) {
  const escrow = getOrThrow(dispute.escrowId);
  const txRisk = assessTransactionRisk(escrow);

  const category = (dispute.ai?.category ?? 'other').replace(/_/g, ' ');
  const severity = dispute.ai?.severity ?? 'medium';

  const keyFindings = [`Dispute auto-classified as "${category}" (${severity} severity).`];
  if (txRisk.riskLevel !== 'LOW') {
    keyFindings.push(`The underlying transaction already carried ${txRisk.riskLevel} risk: ${txRisk.reasons[0]}`);
  }
  keyFindings.push(...txRisk.reasons.slice(txRisk.riskLevel !== 'LOW' ? 1 : 0));

  const confidence = Math.round(Math.max(0, Math.min(100, (severityWeight(severity) + txRisk.riskScore) / 2))) / 100;
  const recommendation = ['critical', 'high'].includes(severity) || txRisk.riskLevel === 'HIGH'
    ? 'ESCALATE_TO_HUMAN_REVIEW'
    : 'KEEP_FUNDS_FROZEN';
  const assessment = `This dispute carries ${severity} severity signals and the underlying transaction shows ${txRisk.riskLevel.toLowerCase()} risk. A human reviewer should confirm the outcome — this assessment does not release or refund funds.`;

  return {
    assessment,
    confidence,
    keyFindings: keyFindings.slice(0, 5),
    recommendation,
    source: 'rules',
    assessedAt: new Date().toISOString(),
  };
}

export { badRequest, forbidden, notFound, conflict } from './errors.js';
