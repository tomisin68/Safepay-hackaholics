import { escrows, users, proofs } from '../store/index.js';
import { randomId, claimCode } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import * as ledgerSvc from './ledger.js';
import * as wallet from './wallet.js';
import * as fraud from './fraud.js';
import { recalculate } from './scoreEngine.js';
import { broadcast } from './webhookDispatcher.js';
import { notifyEscrow } from './escrowNotifier.js';

export const ESCROW_TYPES = ['goods', 'service_milestone', 'rental', 'recurring', 'in_person'];

/**
 * There is no timer on a hold.
 *
 * An earlier build auto-released a funded escrow after a few days of buyer
 * silence, and said so all over the UI. SafePay does not do that: money leaves
 * a hold when the buyer confirms, when they approve a milestone, or when an
 * administrator decides a dispute — and at no other moment. Anything else would
 * be a promise the product cannot keep.
 */

export const STATUS_FLOW = {
  created: ['funded', 'cancelled'],
  funded: ['in_progress', 'released', 'disputed', 'refunded'],
  in_progress: ['released', 'disputed', 'refunded'],
  disputed: ['released', 'refunded'],
  released: [],
  refunded: [],
  cancelled: [],
  expired: [],
};

/**
 * Ceiling on a delivery photo, as base64 characters.
 *
 * A Firestore document is capped at 1 MiB, and the proof lives in its own
 * document precisely so it gets the whole allowance to itself. The web client
 * downscales before upload and lands well under this; the limit is here for
 * everything that is not the web client.
 */
const MAX_PROOF_CHARS = 700_000;
const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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

/* ------------------------------------------------------------------ *
 * Create
 * ------------------------------------------------------------------ */
export function create({ buyerId, sellerId, sellerEmail, type, amountKobo, title, description, milestones, appId }) {
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
    const total = milestones.reduce((s, m) => s + Math.round(Number(m.amountKobo) || 0), 0);
    if (total !== amountKobo) {
      throw badRequest('Milestone amounts must add up to the escrow total.', { total, amountKobo });
    }
    normalisedMilestones = milestones.map((m, i) => ({
      id: `ms_${i + 1}`,
      title: String(m.title ?? `Milestone ${i + 1}`).slice(0, 120),
      amountKobo: Math.round(Number(m.amountKobo)),
      status: 'pending',
      approvedAt: null,
    }));
  }

  const id = randomId('esc');
  const now = new Date().toISOString();

  const escrow = {
    id,
    buyerId: buyerId ?? null,
    sellerId: resolvedSellerId,
    sellerEmail: sellerEmail ? String(sellerEmail).toLowerCase() : null,
    appId: appId ?? null,
    type,
    title: String(title ?? '').slice(0, 140) || 'Untitled escrow',
    description: String(description ?? '').slice(0, 2000),
    amountKobo,
    currency: 'NGN',
    feeKobo: ledgerSvc.feeFor(amountKobo),
    netToSellerKobo: amountKobo - ledgerSvc.feeFor(amountKobo),
    status: 'created',
    milestones: normalisedMilestones,
    claimCode: type === 'in_person' ? claimCode() : null,
    fundedAt: null,
    releasedAt: null,
    deliveryProof: null,
    flagged: false,
    createdAt: now,
    updatedAt: now,
    timeline: [{ event: 'created', at: now, note: null }],
  };

  escrows.set(id, escrow);

  const flags = buyerId ? fraud.evaluate(buyerId, escrow) : [];
  if (flags.length) escrows.update(id, { flagged: true });

  const saved = escrows.get(id);
  broadcast([saved.buyerId, saved.sellerId], 'escrow.created', publicView(saved));
  notifyEscrow(saved, 'created');
  return { escrow: saved, flags };
}

/* ------------------------------------------------------------------ *
 * Fund
 * ------------------------------------------------------------------ */
export function fund(id, userId) {
  const escrow = getOrThrow(id);
  if (party(escrow, userId) !== 'buyer') throw forbidden('Only the buyer can fund this escrow.');
  assertTransition(escrow.status, 'funded');

  /* Checked before anything is written, so a buyer who cannot cover the escrow
   * gets a 409 carrying the shortfall — which the UI turns into a top-up — and
   * not a half-funded escrow. */
  wallet.assertCanSpend(userId, escrow.amountKobo);

  const now = new Date();

  wallet.debit(userId, escrow.amountKobo, {
    type: 'escrow_fund',
    note: `Held in escrow: ${escrow.title}`,
    escrowId: id,
  });

  ledgerSvc.record({
    escrowId: id,
    type: 'fund',
    amountKobo: escrow.amountKobo,
    note: 'Buyer funded escrow, funds held by SafePay',
  });

  const next = touch(escrow, {
    status: 'funded',
    fundedAt: now.toISOString(),
  }, 'funded');

  fraud.evaluate(userId, next);
  broadcast([next.buyerId, next.sellerId], 'escrow.funded', publicView(next));
  notifyEscrow(next, 'funded');
  return next;
}

/* ------------------------------------------------------------------ *
 * Seller marks goods dispatched / work started
 * ------------------------------------------------------------------ */
export function markDelivered(id, userId, note, proof) {
  const escrow = getOrThrow(id);
  if (party(escrow, userId) !== 'seller') throw forbidden('Only the seller can update delivery.');
  assertTransition(escrow.status, 'in_progress');

  const stored = proof ? storeProof(escrow, userId, proof) : null;

  const next = touch(escrow, {
    status: 'in_progress',
    note: note ?? null,
    /* Metadata only. The image itself is a separate document, so listing a
     * hundred escrows does not drag a hundred photographs along with it. */
    ...(stored ? { deliveryProof: stored } : {}),
  }, 'delivered');

  broadcast([next.buyerId, next.sellerId], 'escrow.delivered', publicView(next));
  notifyEscrow(next, 'delivered');
  return next;
}

/**
 * Files the seller's photo of the handover.
 *
 * A buyer who goes quiet is the hardest case an escrow has: without evidence
 * the only honest answer is "we cannot tell". This is that evidence — timestamped,
 * attributed, and visible to both sides and to whoever decides a dispute.
 *
 * @param {{ dataUrl: string, fileName?: string }} proof
 * @returns {{ id: string, fileName: string|null, byteSize: number, contentType: string, uploadedAt: string, uploadedById: string }}
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

  proofs.set(id, {
    id,
    escrowId: escrow.id,
    uploadedById: userId,
    contentType,
    dataUrl,
    fileName: proof?.fileName ? String(proof.fileName).slice(0, 120) : null,
    byteSize: Math.floor((payload.length * 3) / 4),
    createdAt: uploadedAt,
  });

  return {
    id,
    fileName: proof?.fileName ? String(proof.fileName).slice(0, 120) : null,
    byteSize: Math.floor((payload.length * 3) / 4),
    contentType,
    uploadedAt,
    uploadedById: userId,
  };
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

/* ------------------------------------------------------------------ *
 * Release
 * ------------------------------------------------------------------ */
export function release(id, userId, { reason = 'buyer_confirmed' } = {}) {
  const escrow = getOrThrow(id);
  if (reason === 'buyer_confirmed' && party(escrow, userId) !== 'buyer') {
    throw forbidden('Only the buyer can release these funds.');
  }
  assertTransition(escrow.status, 'released');

  const { feeKobo, netToSellerKobo } = ledgerSvc.collectFee(id, escrow.amountKobo);
  ledgerSvc.record({
    escrowId: id,
    type: 'release',
    amountKobo: netToSellerKobo,
    note: `Released to seller (${reason.replace(/_/g, ' ')})`,
  });

  /* Net, not gross. The seller's balance is the number they can withdraw, so
   * the fee comes off here rather than being mentioned somewhere else and
   * quietly forgotten. Two entries so the statement shows both halves. */
  if (escrow.sellerId) {
    payOutToSeller(escrow, escrow.amountKobo, feeKobo, `Escrow released: ${escrow.title}`);
  }

  const next = touch(escrow, {
    status: 'released',
    releasedAt: new Date().toISOString(),
    releaseReason: reason,
    feeKobo,
    netToSellerKobo,
  }, 'released');

  for (const uid of [next.buyerId, next.sellerId].filter(Boolean)) recalculate(uid);
  broadcast([next.buyerId, next.sellerId], 'escrow.released', publicView(next));
  notifyEscrow(next, 'released');
  return next;
}

/**
 * Moves one settled amount out of the hold and into the seller's wallet, less
 * the SafePay fee on it.
 *
 * Written as two wallet entries rather than one net credit on purpose: a seller
 * looking at their statement should be able to see the gross they earned and
 * the fee they paid, not a single number they have to take on trust.
 */
function payOutToSeller(escrow, grossKobo, feeKobo, note) {
  wallet.credit(escrow.sellerId, grossKobo, {
    type: 'escrow_release',
    note,
    escrowId: escrow.id,
  });
  if (feeKobo > 0) {
    wallet.debit(escrow.sellerId, feeKobo, {
      type: 'fee',
      note: `SafePay fee on ${escrow.title}`,
      escrowId: escrow.id,
    });
  }
}

/* ------------------------------------------------------------------ *
 * Milestones — partial releases on a service escrow
 * ------------------------------------------------------------------ */
export function approveMilestone(id, milestoneId, userId) {
  const escrow = getOrThrow(id);
  if (party(escrow, userId) !== 'buyer') throw forbidden('Only the buyer can approve a milestone.');
  if (escrow.type !== 'service_milestone') throw badRequest('This escrow has no milestones.');
  if (!['funded', 'in_progress'].includes(escrow.status)) {
    throw conflict('Fund the escrow before approving milestones.');
  }

  const milestones = escrow.milestones ?? [];
  const target = milestones.find((m) => m.id === milestoneId);
  if (!target) throw notFound('Milestone not found.');
  if (target.status === 'approved') throw conflict('That milestone is already approved.');

  const updated = milestones.map((m) =>
    m.id === milestoneId ? { ...m, status: 'approved', approvedAt: new Date().toISOString() } : m,
  );

  /* The fee is charged per milestone, on the slice being released. The older
   * behaviour paid each milestone gross and then charged the fee on the whole
   * escrow again at the end, which billed the last milestone twice. */
  const { feeKobo } = ledgerSvc.collectFee(id, target.amountKobo);
  ledgerSvc.record({
    escrowId: id,
    type: 'release',
    amountKobo: target.amountKobo - feeKobo,
    note: `Milestone released: ${target.title}`,
  });
  if (escrow.sellerId) {
    payOutToSeller(escrow, target.amountKobo, feeKobo, `Milestone released: ${target.title}`);
  }

  const allApproved = updated.every((m) => m.status === 'approved');
  const next = touch(escrow, {
    milestones: updated,
    status: allApproved ? 'released' : 'in_progress',
    ...(allApproved ? { releasedAt: new Date().toISOString(), releaseReason: 'all_milestones_approved' } : {}),
  }, allApproved ? 'released' : `milestone_approved:${target.title}`);

  if (allApproved) {
    for (const uid of [next.buyerId, next.sellerId].filter(Boolean)) recalculate(uid);
    broadcast([next.buyerId, next.sellerId], 'escrow.released', publicView(next));
    notifyEscrow(next, 'released');
    return next;
  }

  notifyEscrow(next, 'milestone', { milestone: target });
  return next;
}

/* ------------------------------------------------------------------ *
 * Dispute / refund / cancel
 * ------------------------------------------------------------------ */
export function markDisputed(id, userId) {
  const escrow = getOrThrow(id);
  assertParty(escrow, userId);
  assertTransition(escrow.status, 'disputed');
  const next = touch(escrow, { status: 'disputed', disputedAt: new Date().toISOString() }, 'disputed');
  broadcast([next.buyerId, next.sellerId], 'escrow.disputed', publicView(next));
  notifyEscrow(next, 'disputed');
  return next;
}

export function refund(id, { reason = 'dispute_resolved', amountKobo } = {}) {
  const escrow = getOrThrow(id);
  assertTransition(escrow.status, 'refunded');
  const amount = amountKobo ?? escrow.amountKobo;

  ledgerSvc.record({ escrowId: id, type: 'refund', amountKobo: amount, note: `Refunded to buyer (${reason})` });

  /* Refunds are whole: no fee is taken on an escrow that did not complete, so
   * the buyer gets back exactly what left their balance. */
  if (escrow.buyerId) {
    wallet.credit(escrow.buyerId, amount, {
      type: 'escrow_refund',
      note: `Refunded: ${escrow.title}`,
      escrowId: id,
    });
  }

  const next = touch(escrow, {
    status: 'refunded',
    refundedAt: new Date().toISOString(),
    refundReason: reason,
    refundedKobo: amount,
  }, 'refunded');

  for (const uid of [next.buyerId, next.sellerId].filter(Boolean)) recalculate(uid);
  broadcast([next.buyerId, next.sellerId], 'escrow.refunded', publicView(next));
  notifyEscrow(next, 'refunded');
  return next;
}

export function cancel(id, userId) {
  const escrow = getOrThrow(id);
  assertParty(escrow, userId);
  assertTransition(escrow.status, 'cancelled');

  const next = touch(escrow, { status: 'cancelled', cancelledAt: new Date().toISOString() }, 'cancelled');

  /* No webhook to match this one: `cancelled` was never in the published event
   * list, and adding a topic partners have not subscribed to is a breaking
   * change dressed up as a feature. The two people involved still deserve to
   * be told. */
  notifyEscrow(next, 'cancelled');
  return next;
}

/* ------------------------------------------------------------------ *
 * In-person QR handoff — seller shows a code, buyer claims it
 * ------------------------------------------------------------------ */
export function claim(code, userId) {
  const normalised = String(code ?? '').trim().toUpperCase();
  const escrow = escrows.findOne((e) => e.claimCode === normalised);
  if (!escrow) throw notFound('That code does not match any open escrow.');
  if (escrow.sellerId === userId) throw badRequest('You cannot claim your own escrow.');
  if (escrow.buyerId && escrow.buyerId !== userId) throw forbidden('This escrow already has a buyer.');
  if (escrow.status !== 'created') throw conflict('This escrow has already been claimed.');

  const next = escrows.update(escrow.id, { buyerId: userId });

  /* The first moment this escrow has two sides, and the seller is standing
   * there waiting to know the scan worked. */
  notifyEscrow(next, 'claimed');
  return next;
}

/* ------------------------------------------------------------------ *
 * Serialisation
 * ------------------------------------------------------------------ */
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
