import { ledger, meta } from '../store/index.js';
import { randomId } from '../lib/crypto.js';
import { bps } from '../lib/money.js';

const FEE_BPS = Number(process.env.PLATFORM_FEE_BPS ?? 150);
const RESERVE_BPS = Number(process.env.RESERVE_SHARE_BPS ?? 2000);

/**
 * Append-only audit trail. Nothing here is ever mutated or deleted — a
 * correction is a new, opposite entry. This is the record a dispute is
 * settled against.
 */
export function record({ escrowId, type, amountKobo, note }) {
  const id = randomId('led');
  const entry = {
    id,
    escrowId,
    type, // fund | release | refund | fee | reserve
    amountKobo,
    note: note ?? null,
    createdAt: new Date().toISOString(),
  };
  ledger.set(id, entry);
  return entry;
}

export const feeFor = (amountKobo) => bps(amountKobo, FEE_BPS);

/**
 * On release: SafePay takes its fee, and a slice of that fee is diverted into
 * the Buyer Protection Reserve — the publicly visible fund that covers verified
 * edge-case losses.
 */
export function collectFee(escrowId, amountKobo) {
  const fee = feeFor(amountKobo);
  const reserveCut = bps(fee, RESERVE_BPS);
  const current = meta.get();

  record({ escrowId, type: 'fee', amountKobo: fee, note: `Platform fee (${FEE_BPS / 100}%)` });
  record({ escrowId, type: 'reserve', amountKobo: reserveCut, note: 'Buyer Protection Reserve contribution' });

  meta.update({
    feesCollectedKobo: (current.feesCollectedKobo ?? 0) + fee,
    reserveKobo: (current.reserveKobo ?? 0) + reserveCut,
  });

  return { feeKobo: fee, reserveKobo: reserveCut, netToSellerKobo: amountKobo - fee };
}

export function reserveSummary() {
  const m = meta.get();
  return {
    reserveKobo: m.reserveKobo ?? 0,
    feesCollectedKobo: m.feesCollectedKobo ?? 0,
    payoutsKobo: m.reservePayoutsKobo ?? 0,
    feeBps: FEE_BPS,
    reserveShareBps: RESERVE_BPS,
  };
}

/** Pay a verified edge-case loss out of the reserve (admin action). */
export function payoutFromReserve(escrowId, amountKobo, note) {
  const m = meta.get();
  const available = m.reserveKobo ?? 0;
  if (amountKobo > available) return { ok: false, reason: 'insufficient_reserve', available };
  meta.update({
    reserveKobo: available - amountKobo,
    reservePayoutsKobo: (m.reservePayoutsKobo ?? 0) + amountKobo,
  });
  record({ escrowId, type: 'reserve_payout', amountKobo, note: note ?? 'Protection Reserve payout' });
  return { ok: true, remaining: available - amountKobo };
}

export const entriesFor = (escrowId) =>
  ledger.find((e) => e.escrowId === escrowId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
