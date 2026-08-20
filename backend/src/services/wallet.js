/**
 * The SafePay wallet.
 *
 * Every naira a user can see is one of three things, and the whole point of
 * this module is that those three never blur into each other:
 *
 *   available   sitting in their SafePay wallet, theirs to spend or withdraw
 *   held        locked inside a funded escrow, neither side's until it settles
 *   gone        paid out to a bank, or taken as a fee
 *
 * Balances are integer kobo on the user record; every movement that changes one
 * is appended to `walletEntries` with the balance it produced. That is what
 * makes a statement reconcilable rather than decorative — if the entries do not
 * add up to the balance, one of them is wrong and you can see which.
 *
 * The SafePay fee is deducted here, at the moment it is charged, so a seller's
 * balance is what they can actually withdraw and never the headline amount of
 * the sale.
 *
 * Bank transfers are mocked. This is a hackathon build: no money moves, no Wema
 * API is called, and the "virtual account" below is a plausible-looking number
 * with a 30-minute clock on it. Everything is labelled as such in the UI — a
 * fake payment rail that pretends to be real is the one thing a payments demo
 * must not do.
 */

import crypto from 'node:crypto';
import { users, walletEntries, topups, payouts } from '../store/index.js';
import { randomId } from '../lib/crypto.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';

/** How long a mock virtual account stays payable. */
export const TOPUP_TTL_MINUTES = 30;

/** Smallest sensible movement either way — 100.00 NGN. */
const MIN_MOVEMENT_KOBO = 10_000;

/** Ceiling on a single mock transfer, so a stray keystroke cannot mint billions. */
const MAX_TOPUP_KOBO = 500_000_000; // 5,000,000.00 NGN

/**
 * The account SafePay's mock collections sit behind. Wema, because that is the
 * settlement partner this was built for.
 */
export const COLLECTION_BANK = { bankName: 'Wema Bank', bankCode: '035' };

/**
 * Banks a user can withdraw to. Codes are the real CBN/NIP codes so the list is
 * not nonsense, even though nothing is ever sent to them.
 */
export const BANKS = [
  { code: '035', name: 'Wema Bank' },
  { code: '035A', name: 'ALAT by Wema' },
  { code: '044', name: 'Access Bank' },
  { code: '058', name: 'GTBank' },
  { code: '057', name: 'Zenith Bank' },
  { code: '033', name: 'United Bank for Africa' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '232', name: 'Sterling Bank' },
  { code: '032', name: 'Union Bank' },
  { code: '221', name: 'Stanbic IBTC' },
  { code: '076', name: 'Polaris Bank' },
  { code: '082', name: 'Keystone Bank' },
  { code: '50211', name: 'Kuda Bank' },
  { code: '999992', name: 'OPay' },
  { code: '999991', name: 'PalmPay' },
  { code: '50515', name: 'Moniepoint MFB' },
];

/* ------------------------------------------------------------------ *
 * Balances and movements
 * ------------------------------------------------------------------ */

export const balanceOf = (userId) => Number(users.get(userId)?.walletKobo ?? 0);

/**
 * Appends one movement and returns the balance it produced.
 *
 * `amountKobo` is signed: positive credits, negative debits. Callers never
 * write `walletKobo` themselves — going through here is what keeps the entry
 * list and the balance in step.
 */
function move(userId, amountKobo, { type, note, escrowId = null, reference = null, at = null }) {
  const user = users.get(userId);
  if (!user) throw notFound('Account not found.');

  const before = Number(user.walletKobo ?? 0);
  const after = before + amountKobo;
  if (after < 0) {
    throw conflict('That would take your SafePay balance below zero.', {
      code: 'insufficient_balance',
      balanceKobo: before,
      requiredKobo: Math.abs(amountKobo),
      shortfallKobo: Math.abs(amountKobo) - before,
    });
  }

  users.update(userId, { walletKobo: after });

  const id = randomId('wlt');
  walletEntries.set(id, {
    id,
    userId,
    type,
    amountKobo,
    balanceAfterKobo: after,
    note: note ?? null,
    escrowId,
    reference,
    /* `at` exists for the demo seed, which replays a history that is supposed to
     * have happened weeks ago. Nothing on a request path passes it. */
    createdAt: at ?? new Date().toISOString(),
  });

  return after;
}

export const credit = (userId, amountKobo, detail) => move(userId, Math.abs(amountKobo), detail);
export const debit = (userId, amountKobo, detail) => move(userId, -Math.abs(amountKobo), detail);

/**
 * Whether this user can cover an amount right now, without moving anything.
 * Used by the escrow engine so it can refuse a funding attempt with numbers the
 * UI can turn into a top-up prompt rather than a dead end.
 */
export function assertCanSpend(userId, amountKobo) {
  const balance = balanceOf(userId);
  if (balance < amountKobo) {
    throw conflict('Your SafePay balance is not enough to fund this escrow.', {
      code: 'insufficient_balance',
      balanceKobo: balance,
      requiredKobo: amountKobo,
      shortfallKobo: amountKobo - balance,
    });
  }
  return balance;
}

export const entriesFor = (userId, limit = 50) =>
  walletEntries
    .find((e) => e.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);

/** Lifetime figures, so the wallet screen can show where the money went. */
export function totalsFor(userId) {
  const all = walletEntries.find((e) => e.userId === userId);
  const sum = (predicate) => all.filter(predicate).reduce((s, e) => s + Math.abs(e.amountKobo), 0);
  return {
    fundedInKobo: sum((e) => e.type === 'topup'),
    earnedKobo: sum((e) => e.type === 'escrow_release'),
    spentKobo: sum((e) => e.type === 'escrow_fund'),
    feesPaidKobo: sum((e) => e.type === 'fee'),
    withdrawnKobo: sum((e) => e.type === 'withdrawal'),
  };
}

/* ------------------------------------------------------------------ *
 * Withdrawal account
 * ------------------------------------------------------------------ */

export const bankFor = (userId) => users.get(userId)?.bankAccount ?? null;

export function setBankAccount(userId, { bankCode, accountNumber, accountName }) {
  const bank = BANKS.find((b) => b.code === String(bankCode ?? '').trim());
  if (!bank) throw badRequest('Choose a bank from the list.');

  const number = String(accountNumber ?? '').replace(/\D/g, '');
  if (number.length !== 10) throw badRequest('A Nigerian account number is 10 digits.');

  const name = String(accountName ?? '').trim();
  if (name.length < 3) throw badRequest('Enter the account name exactly as your bank has it.');

  const bankAccount = {
    bankCode: bank.code,
    bankName: bank.name,
    accountNumber: number,
    accountName: name.slice(0, 80),
    addedAt: new Date().toISOString(),
  };
  users.update(userId, { bankAccount });
  return bankAccount;
}

export function removeBankAccount(userId) {
  users.update(userId, { bankAccount: null });
  return null;
}

/* ------------------------------------------------------------------ *
 * Adding money — the mock Wema virtual account
 * ------------------------------------------------------------------ */

/** Ten digits, NUBAN-shaped. Not a real account, and never dialled anywhere. */
const mockAccountNumber = () => String(crypto.randomInt(1_000_000_000, 9_999_999_999));

const isExpired = (topup) => new Date(topup.expiresAt).getTime() <= Date.now();

/** Lazily expires a pending top-up whose 30 minutes have run out. */
function settleExpiry(topup) {
  if (!topup || topup.status !== 'pending' || !isExpired(topup)) return topup;
  return topups.update(topup.id, { status: 'expired' });
}

/**
 * Opens a mock virtual account for one transfer.
 *
 * The amount is fixed at creation because that is how a real one-time virtual
 * account behaves — the number is bound to the transfer it expects, which is
 * what lets the "I have sent it" button credit an exact figure rather than
 * asking the user to be honest twice.
 */
export function createTopup(userId, amountKobo) {
  const user = users.get(userId);
  if (!user) throw notFound('Account not found.');

  const amount = Math.round(Number(amountKobo));
  if (!Number.isInteger(amount) || amount < MIN_MOVEMENT_KOBO) {
    throw badRequest('Enter an amount of at least 100.00 NGN.');
  }
  if (amount > MAX_TOPUP_KOBO) throw badRequest('The most you can add in one transfer is 5,000,000.00 NGN.');

  /* Anything still pending for this user is abandoned the moment they ask for a
   * new number — two live accounts expecting two different amounts is exactly
   * the confusion this flow exists to avoid. */
  for (const stale of topups.find((t) => t.userId === userId && t.status === 'pending')) {
    topups.update(stale.id, { status: 'cancelled' });
  }

  const now = new Date();
  const id = randomId('top');
  const topup = {
    id,
    userId,
    amountKobo: amount,
    ...COLLECTION_BANK,
    accountNumber: mockAccountNumber(),
    /* The name the transfer must be sent to. Deliberately just "SafePay": it is
     * the name a user checks against before letting go of their money. */
    accountName: 'SafePay',
    reference: `SP-${id.slice(-8).toUpperCase()}`,
    status: 'pending',
    mock: true,
    expiresAt: new Date(now.getTime() + TOPUP_TTL_MINUTES * 60_000).toISOString(),
    createdAt: now.toISOString(),
    completedAt: null,
  };
  topups.set(id, topup);
  return topup;
}

export function getTopup(userId, id) {
  const topup = topups.get(id);
  if (!topup || topup.userId !== userId) throw notFound('That payment session no longer exists.');
  return settleExpiry(topup);
}

/**
 * The "I have already sent it" button.
 *
 * In a real build this is what the bank's webhook would do. Here the user says
 * so, and because no money exists there is nothing to reconcile against.
 */
export function confirmTopup(userId, id) {
  const topup = getTopup(userId, id);

  if (topup.status === 'completed') return { topup, balanceKobo: balanceOf(userId) };
  if (topup.status === 'expired') {
    throw conflict('That account number has expired. Start a new transfer to get a fresh one.', {
      code: 'topup_expired',
    });
  }
  if (topup.status !== 'pending') throw conflict('That payment session was cancelled.');

  const balanceKobo = credit(userId, topup.amountKobo, {
    type: 'topup',
    note: `Bank transfer to ${topup.bankName} - ${topup.accountNumber}`,
    reference: topup.reference,
  });

  return {
    topup: topups.update(id, { status: 'completed', completedAt: new Date().toISOString() }),
    balanceKobo,
  };
}

/* ------------------------------------------------------------------ *
 * Taking money out
 * ------------------------------------------------------------------ */

export function withdraw(userId, amountKobo) {
  const bankAccount = bankFor(userId);
  if (!bankAccount) {
    throw conflict('Add the bank account you want to be paid into first.', { code: 'no_bank_account' });
  }

  const amount = Math.round(Number(amountKobo));
  if (!Number.isInteger(amount) || amount < MIN_MOVEMENT_KOBO) {
    throw badRequest('Enter an amount of at least 100.00 NGN.');
  }

  const balance = balanceOf(userId);
  if (balance < amount) {
    throw conflict('You do not have that much available.', {
      code: 'insufficient_balance',
      balanceKobo: balance,
      requiredKobo: amount,
      shortfallKobo: amount - balance,
    });
  }

  const id = randomId('pay');
  const reference = `SP-W-${id.slice(-8).toUpperCase()}`;

  const balanceKobo = debit(userId, amount, {
    type: 'withdrawal',
    note: `Payout to ${bankAccount.bankName} - ${bankAccount.accountNumber}`,
    reference,
  });

  const payout = {
    id,
    userId,
    amountKobo: amount,
    bankAccount,
    reference,
    /* Settled immediately because nothing is actually being transferred. A real
     * payout would sit `processing` until the bank said otherwise. */
    status: 'paid',
    mock: true,
    createdAt: new Date().toISOString(),
  };
  payouts.set(id, payout);

  return { payout, balanceKobo };
}

export const payoutsFor = (userId, limit = 20) =>
  payouts
    .find((p) => p.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);

/** Everything the wallet screen needs, in one read. */
export function summary(userId) {
  return {
    balanceKobo: balanceOf(userId),
    bankAccount: bankFor(userId),
    totals: totalsFor(userId),
    entries: entriesFor(userId),
    payouts: payoutsFor(userId),
    banks: BANKS,
    topupExpiryMinutes: TOPUP_TTL_MINUTES,
  };
}
