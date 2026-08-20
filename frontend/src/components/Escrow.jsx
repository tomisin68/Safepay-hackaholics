import { Link } from 'react-router-dom';
import { cn } from '../lib/cn';
import { ESCROW_TYPE_LABELS, STATUS_META, formatNaira, timeAgo } from '../lib/format';
import { Pill } from './ui/Primitives';
import { TrustChip } from './Trust';
import {
  IconCheck, IconClock, IconWallet, IconShieldCheck, IconAlertTriangle, IconArrowRight,
} from './Icons';

/**
 * The status stepper.
 *
 * This is the single most important component in the product: at a glance,
 * anyone — including someone who has never used escrow before — can see where
 * their money is right now and what happens next.
 */
const STEPS = [
  { key: 'created', label: 'Created', icon: IconCheck, plain: 'Escrow opened' },
  { key: 'funded', label: 'Funded', icon: IconWallet, plain: 'SafePay is holding the money' },
  { key: 'in_progress', label: 'Delivered', icon: IconClock, plain: 'Seller confirmed the handover' },
  { key: 'released', label: 'Released', icon: IconShieldCheck, plain: 'Money paid out to the seller' },
];

const STEP_INDEX = { created: 0, funded: 1, in_progress: 2, released: 3 };

export function StatusStepper({ status, className, compact = false }) {
  const terminated = ['disputed', 'refunded', 'cancelled', 'expired'].includes(status);
  const current = terminated ? STEP_INDEX.funded : (STEP_INDEX[status] ?? 0);

  if (terminated) {
    const meta = STATUS_META[status];
    const shell = {
      danger: 'bg-danger-soft border-danger/25 text-danger-ink',
      neutral: 'bg-neutral-soft border-line text-neutral-ink',
      success: 'bg-success-soft border-success/25 text-success-ink',
      warn: 'bg-warn-soft border-warn/25 text-warn-ink',
      brand: 'bg-brand-soft border-brand-line text-brand-ink',
    }[meta.tone];

    return (
      <div className={cn('rounded-[12px] border p-4', shell, className)}>
        <div className="flex items-center gap-2.5">
          <IconAlertTriangle size={18} className="shrink-0" />
          <div>
            <p className="text-[0.9rem] font-semibold text-ink">{meta.label}</p>
            <p className="text-[0.8rem] text-muted">{meta.hint}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ol className={cn('flex items-start', className)} aria-label="Escrow progress">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const Icon = step.icon;

        return (
          <li key={step.key} className={cn('flex-1 min-w-0', i < STEPS.length - 1 && 'flex')}>
            <div className="flex flex-col items-center flex-1 min-w-0 text-center">
              <div className="flex w-full items-center">
                <span className={cn('h-0.5 flex-1', i === 0 ? 'bg-transparent' : done || active ? 'bg-brand' : 'bg-line')} />
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300',
                    done && 'border-brand bg-brand text-white',
                    active && 'border-brand bg-brand-soft text-brand-ink animate-pulse-ring',
                    !done && !active && 'border-line bg-surface text-faint',
                  )}
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? <IconCheck size={16} /> : <Icon size={16} />}
                </span>
                <span className={cn('h-0.5 flex-1', i === STEPS.length - 1 ? 'bg-transparent' : done ? 'bg-brand' : 'bg-line')} />
              </div>

              <p className={cn('mt-2 text-[0.78rem] font-semibold', active || done ? 'text-ink' : 'text-faint')}>
                {step.label}
              </p>
              {!compact && (
                <p className={cn('mt-0.5 text-[0.7rem] leading-snug px-1', active ? 'text-muted' : 'text-faint')}>
                  {step.plain}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ==========================================================================
   Escrow list card
   ========================================================================== */
export function EscrowCard({ escrow, viewerId }) {
  const meta = STATUS_META[escrow.status] ?? STATUS_META.created;
  const isBuyer = escrow.buyer?.id === viewerId;
  const counterparty = isBuyer ? escrow.seller : escrow.buyer;

  return (
    <Link
      to={`/app/escrow/${escrow.id}`}
      className={cn(
        'group flex items-center gap-4 rounded-[13px] border border-line bg-surface p-4',
        'transition-all duration-200 hover:border-brand/45 hover:shadow-[var(--shadow-md)] hover:-translate-y-px',
      )}
    >
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]',
          meta.tone === 'success' && 'bg-success-soft text-success-ink',
          meta.tone === 'brand' && 'bg-brand-soft text-brand-ink',
          meta.tone === 'warn' && 'bg-warn-soft text-warn-ink',
          meta.tone === 'danger' && 'bg-danger-soft text-danger-ink',
          meta.tone === 'neutral' && 'bg-neutral-soft text-neutral-ink',
        )}
      >
        {escrow.status === 'released' ? <IconShieldCheck size={20} />
          : escrow.status === 'disputed' ? <IconAlertTriangle size={20} />
          : escrow.status === 'created' ? <IconClock size={20} />
          : <IconWallet size={20} />}
      </span>

      <div className="min-w-0 flex-1">
        {/* min-w-0 here too: `truncate` implies white-space:nowrap, so without
            it this row's minimum is the full untruncated title and the card
            refuses to fit a phone. */}
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-[0.94rem] font-semibold text-ink">{escrow.title}</p>
          {escrow.flagged && <Pill tone="warn" size="sm" dot={false}>Review</Pill>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.78rem] text-muted">
          <span className="font-medium">{isBuyer ? 'Buying from' : 'Selling to'}</span>
          {counterparty ? (
            <TrustChip name={counterparty.name} score={counterparty.safeScore} tier={counterparty.scoreTier} />
          ) : (
            <span className="italic text-faint">awaiting counterparty</span>
          )}
          <span className="text-faint">·</span>
          <span>{ESCROW_TYPE_LABELS[escrow.type]}</span>
          <span className="text-faint">·</span>
          <span>{timeAgo(escrow.createdAt)}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="numeric text-[0.98rem] font-semibold text-ink">{formatNaira(escrow.amountKobo)}</span>
        <Pill tone={meta.tone} size="sm">{meta.label}</Pill>
      </div>

      <IconArrowRight
        size={16}
        className="hidden shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand sm:block"
      />
    </Link>
  );
}

/* ==========================================================================
   Milestones
   ========================================================================== */
export function MilestoneList({ milestones, onApprove, canApprove, busyId }) {
  if (!milestones?.length) return null;

  return (
    <ul className="flex flex-col gap-2.5">
      {milestones.map((m, i) => {
        const approved = m.status === 'approved';
        return (
          <li
            key={m.id}
            className={cn(
              'flex items-center gap-3 rounded-[12px] border p-3.5 transition-colors',
              approved ? 'border-success/25 bg-success-soft' : 'border-line bg-surface',
            )}
          >
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.8rem] font-semibold',
                approved ? 'bg-success text-white' : 'bg-sunken text-muted',
              )}
            >
              {approved ? <IconCheck size={15} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.88rem] font-semibold text-ink">{m.title}</p>
              <p className="text-[0.78rem] text-muted">
                {approved ? `Released ${timeAgo(m.approvedAt)}` : 'Awaiting your approval'}
              </p>
            </div>
            <span className="numeric shrink-0 text-[0.86rem] font-semibold text-ink">
              {formatNaira(m.amountKobo)}
            </span>
            {!approved && canApprove && (
              <button
                type="button"
                onClick={() => onApprove(m.id)}
                disabled={busyId === m.id}
                className="shrink-0 rounded-[9px] bg-brand px-3 py-1.5 text-[0.78rem] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
              >
                {busyId === m.id ? 'Releasing…' : 'Approve'}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
