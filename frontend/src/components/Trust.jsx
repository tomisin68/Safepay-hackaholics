import { cn } from '../lib/cn';
import { SCORE_TIER_META } from '../lib/format';
import { Pill } from './ui/Primitives';
import { IconShieldCheck } from './Icons';

const TIER_STROKE = {
  new: 'var(--c-faint)',
  building: 'var(--c-warn)',
  trusted: 'var(--c-success)',
  verified_pro: 'var(--c-brand)',
};

/**
 * SafeScore ring.
 *
 * The arc is the number — the digits inside are the confirmation, not the
 * other way round. Tier is stated in words as well as colour, so the reading
 * never depends on hue alone.
 */
export function ScoreRing({ score = 0, tier = 'new', size = 108, thickness = 9, showLabel = true, className }) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const meta = SCORE_TIER_META[tier] ?? SCORE_TIER_META.new;

  return (
    <div className={cn('inline-flex flex-col items-center gap-2.5', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          role="img"
          aria-label={`SafeScore ${score} out of 100 — ${meta.label}`}
          className="-rotate-90"
        >
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="var(--c-sunken)" strokeWidth={thickness}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke={TIER_STROKE[tier]}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            style={{ transition: 'stroke-dasharray 700ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-bold text-ink leading-none" style={{ fontSize: size * 0.29 }}>
            {score}
          </span>
          <span className="text-faint font-medium leading-none mt-1" style={{ fontSize: size * 0.11 }}>
            / 100
          </span>
        </div>
      </div>
      {showLabel && <Pill tone={meta.tone} icon={IconShieldCheck}>{meta.label}</Pill>}
    </div>
  );
}

/** Compact inline trust indicator, shown next to a counterparty's name. */
export function TrustChip({ score, tier, name, className }) {
  const meta = SCORE_TIER_META[tier] ?? SCORE_TIER_META.new;
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {name && <span className="font-medium text-ink truncate">{name}</span>}
      <Pill tone={meta.tone} size="sm" dot={false} icon={IconShieldCheck}>
        <span className="tnum">{score ?? 0}</span>
      </Pill>
    </span>
  );
}

/**
 * The SafeScore breakdown.
 *
 * A trust score nobody can interrogate is a trust score nobody trusts — so
 * every component is shown with the points it earned out of the points
 * available.
 */
const COMPONENT_COPY = {
  volume: 'Completed deals',
  value: 'Value settled',
  reliability: 'Dispute-free record',
  speed: 'Speed to confirm',
  verification: 'Identity verified',
  age: 'Account age',
  diversity: 'Different counterparties',
};

export function ScoreBreakdown({ breakdown, weights, className }) {
  if (!breakdown || !weights) return null;

  return (
    <ul className={cn('flex flex-col gap-3.5', className)}>
      {Object.entries(weights).map(([key, max]) => {
        const earned = breakdown[key] ?? 0;
        const pct = max ? (earned / max) * 100 : 0;
        return (
          <li key={key}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="text-[0.85rem] font-medium text-ink">{COMPONENT_COPY[key] ?? key}</span>
              <span className="text-[0.78rem] tnum text-muted">
                <span className="font-semibold text-ink">{earned.toFixed(1)}</span>
                <span className="text-faint"> / {max}</span>
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-sunken"
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={COMPONENT_COPY[key] ?? key}
            >
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${pct}%`, transition: 'width 700ms cubic-bezier(0.22, 1, 0.36, 1)' }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
