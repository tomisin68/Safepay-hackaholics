import { Card, CardHeader, Pill, Skeleton, Alert } from './ui/Primitives';
import { IconSpark } from './Icons';
import { cn } from '../lib/cn';

const LEVEL_META = {
  LOW: { label: 'Low risk', tone: 'success' },
  MEDIUM: { label: 'Medium risk', tone: 'warn' },
  HIGH: { label: 'High risk', tone: 'danger' },
};

const METER_COLOR = {
  LOW: 'bg-success',
  MEDIUM: 'bg-warn',
  HIGH: 'bg-danger',
};

/**
 * SafePay Intelligence — a risk read on a single transaction.
 *
 * Deliberately not framed as fraud detection: the score and reasons come from
 * deterministic signals over real SafePay data (see backend/src/services/
 * intelligence.js), and the copy stays in "risk signal" / "recommend review"
 * language rather than verdicts.
 */
export function TransactionRiskCard({ risk, loading, error, className }) {
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader icon={IconSpark} title="SafePay Intelligence" description="Reading this transaction's risk signals…" />
        <Skeleton className="h-2.5 w-full rounded-full" />
        <Skeleton className="mt-4 h-3.5 w-4/5 rounded-[6px]" />
        <Skeleton className="mt-2 h-3.5 w-3/5 rounded-[6px]" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader icon={IconSpark} title="SafePay Intelligence" />
        <Alert tone="neutral" title="Risk assessment unavailable">{error}</Alert>
      </Card>
    );
  }

  if (!risk) return null;

  const meta = LEVEL_META[risk.riskLevel] ?? LEVEL_META.LOW;

  return (
    <Card className={className}>
      <CardHeader
        icon={IconSpark}
        title="SafePay Intelligence"
        description="A risk read on this transaction, based on real SafePay account and settlement data."
        action={<Pill tone={meta.tone}>{meta.label}</Pill>}
      />

      <div className="mb-5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[0.78rem] font-medium text-muted">Risk score</span>
          <span className="numeric text-[0.85rem] font-semibold text-ink">{risk.riskScore} / 100</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-valuenow={risk.riskScore}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Risk score"
        >
          <div
            className={cn('h-full rounded-full', METER_COLOR[risk.riskLevel])}
            style={{ width: `${risk.riskScore}%`, transition: 'width 700ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </div>
      </div>

      <div className="mb-5">
        <p className="mb-2 text-[0.78rem] font-semibold text-muted">Why?</p>
        <ul className="flex flex-col gap-1.5">
          {risk.reasons.map((reason, i) => (
            <li key={i} className="flex gap-2 text-[0.85rem] leading-relaxed text-ink">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden="true" />
              {reason}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-[11px] bg-sunken px-3.5 py-3">
        <p className="mb-1 text-[0.78rem] font-semibold text-muted">Recommendation</p>
        <p className="text-[0.85rem] text-ink">{risk.recommendation}</p>
      </div>

      <p className="mt-4 text-[0.72rem] leading-relaxed text-faint">
        This is a transaction risk read, not fraud detection — SafePay never blocks a transfer
        automatically from this signal alone.
      </p>
    </Card>
  );
}
