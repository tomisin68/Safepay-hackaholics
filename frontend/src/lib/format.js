/* Money is kobo (integer minor units) on the wire. It becomes a string only
   at the very edge, right before a human reads it. */

export const toNaira = (kobo) => Number(kobo || 0) / 100;
export const toKobo = (naira) => Math.round(Number(naira || 0) * 100);

export function formatNaira(kobo, { decimals = true } = {}) {
  const value = toNaira(kobo);
  return `₦${value.toLocaleString('en-NG', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })}`;
}

/** Compact form for tiles: ₦1.2m, ₦840k. */
export function formatCompact(kobo) {
  const value = toNaira(kobo);
  if (Math.abs(value) >= 1_000_000) return `₦${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`;
  if (Math.abs(value) >= 1_000) return `₦${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return `₦${value.toFixed(0)}`;
}

export function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;

  if (abs < 60_000) return future ? 'in a moment' : 'just now';

  const mins = Math.round(abs / 60_000);
  if (mins < 60) return future ? `in ${mins}m` : `${mins}m ago`;
  const hours = Math.round(abs / 3_600_000);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(abs / 86_400_000);
  if (days < 30) return future ? `in ${days}d` : `${days}d ago`;
  const months = Math.round(days / 30);
  return future ? `in ${months}mo` : `${months}mo ago`;
}

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-NG', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '—';

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

export const ESCROW_TYPE_LABELS = {
  goods: 'Goods',
  service_milestone: 'Service / milestones',
  rental: 'Rental',
  recurring: 'Recurring',
  in_person: 'In person',
};

/**
 * `hint` is the one line under the status stepper, and it is the sentence most
 * likely to be read carefully by someone who is worried about their money. It
 * says only what SafePay will actually do — no timers, no promises about what
 * happens if nobody acts, because nothing happens if nobody acts.
 */
export const STATUS_META = {
  created: { label: 'Awaiting funding', tone: 'neutral', hint: 'Nobody has paid yet.' },
  funded: { label: 'Funds held', tone: 'brand', hint: 'SafePay is holding the money until the buyer confirms.' },
  in_progress: { label: 'Delivered', tone: 'warn', hint: 'Seller says it is on the way or done. The buyer confirms next.' },
  released: { label: 'Released', tone: 'success', hint: 'Money has gone to the seller, less the SafePay fee.' },
  disputed: { label: 'Disputed', tone: 'danger', hint: 'Frozen. Nothing moves until a reviewer decides.' },
  refunded: { label: 'Refunded', tone: 'neutral', hint: 'Money went back to the buyer in full.' },
  cancelled: { label: 'Cancelled', tone: 'neutral', hint: 'Closed before any money moved.' },
  expired: { label: 'Expired', tone: 'neutral', hint: 'Closed without being funded.' },
};

export const SCORE_TIER_META = {
  new: { label: 'New', tone: 'neutral', blurb: 'Just getting started on SafePay.' },
  building: { label: 'Building Trust', tone: 'warn', blurb: 'A track record is forming.' },
  trusted: { label: 'Trusted', tone: 'success', blurb: 'Consistent, dispute-free settlements.' },
  verified_pro: { label: 'Verified Pro', tone: 'brand', blurb: 'Top tier — verified and proven at volume.' },
};
