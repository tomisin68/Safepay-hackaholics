import { escrows, fraudFlags, users } from '../store/index.js';
import { randomId } from '../lib/crypto.js';
import { toNaira } from '../lib/money.js';

/**
 * Velocity + pattern detection.
 *
 * Runs synchronously on escrow creation and funding — cheap set arithmetic over
 * a 24h window, so it never becomes the slow part of a request.
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;

const RULES = [
  {
    id: 'velocity_count',
    severity: 'medium',
    label: 'Unusual escrow velocity',
    test: ({ recent }) => recent.length >= 8,
    detail: ({ recent }) => `${recent.length} escrows opened in 24 hours`,
  },
  {
    id: 'counterparty_fanout',
    severity: 'high',
    label: 'High counterparty fan-out',
    test: ({ counterparties, recent }) => counterparties.size >= 6 && recent.length >= 6,
    detail: ({ counterparties }) => `${counterparties.size} distinct counterparties in 24 hours`,
  },
  {
    id: 'circular_funds',
    severity: 'high',
    label: 'Possible circular funding',
    test: ({ recent, counterparties }) => recent.length >= 5 && counterparties.size <= 2,
    detail: ({ recent, counterparties }) =>
      `${recent.length} escrows cycling between only ${counterparties.size} counterparties`,
  },
  {
    id: 'value_spike',
    severity: 'medium',
    label: 'Value far above the account norm',
    test: ({ amountKobo, historicAvgKobo, history }) =>
      history >= 3 && historicAvgKobo > 0 && amountKobo > historicAvgKobo * 10,
    detail: ({ amountKobo, historicAvgKobo }) =>
      `₦${Math.round(toNaira(amountKobo)).toLocaleString()} vs ₦${Math.round(toNaira(historicAvgKobo)).toLocaleString()} average`,
  },
  {
    id: 'new_account_high_value',
    severity: 'high',
    label: 'New account, high value',
    test: ({ accountAgeDays, amountKobo }) => accountAgeDays < 2 && amountKobo >= 50_000_00,
    detail: ({ amountKobo }) => `₦${Math.round(toNaira(amountKobo)).toLocaleString()} on a <48h old account`,
  },
];

export function evaluate(userId, escrow) {
  const user = users.get(userId);
  if (!user) return [];

  const since = Date.now() - WINDOW_MS;
  const mine = escrows.find((e) => e.buyerId === userId || e.sellerId === userId);
  const recent = mine.filter((e) => new Date(e.createdAt).getTime() >= since);
  const counterparties = new Set(
    recent.map((e) => (e.buyerId === userId ? e.sellerId : e.buyerId)).filter(Boolean),
  );
  const history = mine.length;
  const historicAvgKobo = history ? mine.reduce((s, e) => s + e.amountKobo, 0) / history : 0;
  const accountAgeDays = (Date.now() - new Date(user.createdAt).getTime()) / 864e5;

  const ctx = {
    recent,
    counterparties,
    history,
    historicAvgKobo,
    accountAgeDays,
    amountKobo: escrow?.amountKobo ?? 0,
  };

  const hits = RULES.filter((rule) => {
    try {
      return rule.test(ctx);
    } catch {
      return false;
    }
  });

  return hits.map((rule) => {
    const id = randomId('flag');
    const flag = {
      id,
      userId,
      userName: user.name,
      escrowId: escrow?.id ?? null,
      ruleId: rule.id,
      severity: rule.severity,
      label: rule.label,
      detail: rule.detail(ctx),
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    fraudFlags.set(id, flag);
    return flag;
  });
}

export const openFlags = () =>
  fraudFlags.find((f) => f.status === 'open').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
