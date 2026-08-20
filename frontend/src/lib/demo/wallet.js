/**
 * Demo-mode wallet — the browser twin of backend/src/services/wallet.js.
 *
 * Same three-way split between money that is available, money that is held in
 * an escrow, and money that has gone; the same signed-entry statement behind
 * the balance; the same mocked Wema virtual account with thirty minutes on the
 * clock. Keep the two in step if either moves.
 */

import { users, walletEntries, topups, payouts, randomId } from './db.js';
import { DemoError } from './errors.js';

const badRequest = (m, d) => new DemoError(m, 400, 'bad_request', d);
const conflict = (m, d) => new DemoError(m, 409, 'conflict', d);
const notFound = (m) => new DemoError(m, 404, 'not_found');

export const TOPUP_TTL_MINUTES = 30;
const MIN_MOVEMENT_KOBO = 10_000;
const MAX_TOPUP_KOBO = 500_000_000;

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
    /* `at` exists for the seed, which replays a history from weeks ago. */
    createdAt: at ?? new Date().toISOString(),
  });
  return after;
}

export const credit = (userId, amountKobo, detail) => move(userId, Math.abs(amountKobo), detail);
export const debit = (userId, amountKobo, detail) => move(userId, -Math.abs(amountKobo), detail);

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

const entriesFor = (userId, limit = 50) =>
  walletEntries
    .find((e) => e.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);

function totalsFor(userId) {
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

/** Ten digits, NUBAN-shaped, and entirely fictional. */
function mockAccountNumber() {
  const [a, b] = crypto.getRandomValues(new Uint32Array(2));
  return String(1_000_000_000 + (((a ^ b) >>> 0) % 8_999_999_999)).slice(0, 10);
}

const expired = (topup) => new Date(topup.expiresAt).getTime() <= Date.now();

function settleExpiry(topup) {
  if (!topup || topup.status !== 'pending' || !expired(topup)) return topup;
  return topups.update(topup.id, { status: 'expired' });
}

export function createTopup(userId, amountKobo) {
  if (!users.get(userId)) throw notFound('Account not found.');

  const amount = Math.round(Number(amountKobo));
  if (!Number.isInteger(amount) || amount < MIN_MOVEMENT_KOBO) {
    throw badRequest('Enter an amount of at least 100.00 NGN.');
  }
  if (amount > MAX_TOPUP_KOBO) throw badRequest('The most you can add in one transfer is 5,000,000.00 NGN.');

  for (const stale of topups.find((t) => t.userId === userId && t.status === 'pending')) {
    topups.update(stale.id, { status: 'cancelled' });
  }

  const now = new Date();
  const id = randomId('top');
  const topup = {
    id,
    userId,
    amountKobo: amount,
    bankName: 'Wema Bank',
    bankCode: '035',
    accountNumber: mockAccountNumber(),
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
    status: 'paid',
    mock: true,
    createdAt: new Date().toISOString(),
  };
  payouts.set(id, payout);

  return { payout, balanceKobo };
}

/** Everything the wallet screen needs, in one read. */
export function summary(userId) {
  return {
    balanceKobo: balanceOf(userId),
    bankAccount: bankFor(userId),
    totals: totalsFor(userId),
    entries: entriesFor(userId),
    payouts: payouts
      .find((p) => p.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20),
    banks: BANKS,
    topupExpiryMinutes: TOPUP_TTL_MINUTES,
  };
}
