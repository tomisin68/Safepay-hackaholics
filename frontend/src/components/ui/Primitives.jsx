import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { initials } from '../../lib/format';
import {
  IconCheck, IconCopy, IconX, IconAlertTriangle, IconCheckCircle, IconInfo, IconAlert,
} from '../Icons';

/* ==========================================================================
   Card
   ========================================================================== */
export function Card({ className, children, padded = true, ...rest }) {
  return (
    <div className={cn('card', padded && 'p-5 sm:p-6', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, icon: Icon, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-5', className)}>
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand-ink">
            <Icon size={18} />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[1.02rem] font-semibold text-ink">{title}</h3>
          {description && <p className="text-[0.85rem] text-muted mt-1 leading-relaxed">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ==========================================================================
   Status pill — colour is never the only signal: every pill carries a label,
   and a dot whose shape/position reinforces it.
   ========================================================================== */
const TONES = {
  brand: 'bg-brand-soft text-brand-ink border-brand-line',
  success: 'bg-success-soft text-success-ink border-success/25',
  warn: 'bg-warn-soft text-warn-ink border-warn/25',
  danger: 'bg-danger-soft text-danger-ink border-danger/25',
  neutral: 'bg-neutral-soft text-neutral-ink border-line',
};

const DOT = {
  brand: 'bg-brand',
  success: 'bg-success',
  warn: 'bg-warn',
  danger: 'bg-danger',
  neutral: 'bg-faint',
};

export function Pill({ tone = 'neutral', children, dot = true, icon: Icon, size = 'md', className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[0.7rem]' : 'px-2.5 py-1 text-[0.75rem]',
        TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon size={13} /> : dot ? <span className={cn('h-1.5 w-1.5 rounded-full', DOT[tone])} /> : null}
      {children}
    </span>
  );
}

/* ==========================================================================
   Alert
   ========================================================================== */
const ALERT_ICON = { success: IconCheckCircle, warn: IconAlertTriangle, danger: IconAlert, brand: IconInfo, neutral: IconInfo };

export function Alert({ tone = 'brand', title, children, className, action }) {
  const Icon = ALERT_ICON[tone];
  return (
    <div className={cn('flex gap-3 rounded-[12px] border p-3.5', TONES[tone], className)} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-[0.88rem] leading-snug">{title}</p>}
        {children && <div className={cn('text-[0.84rem] leading-relaxed opacity-90', title && 'mt-1')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/* ==========================================================================
   Avatar
   ========================================================================== */
export function Avatar({ name, size = 40, className }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-ink border border-brand-line',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/* ==========================================================================
   Skeleton / empty / loading
   ========================================================================== */
export const Skeleton = ({ className }) => (
  <div className={cn('skeleton rounded-[8px]', className)} aria-hidden="true" />
);

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-14 px-6', className)}>
      {Icon && (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] bg-brand-soft text-brand-ink">
          <Icon size={26} />
        </span>
      )}
      <h3 className="text-[1.05rem] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[0.88rem] text-muted leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ==========================================================================
   Copy-to-clipboard field — used for API keys, claim codes, embed snippets
   ========================================================================== */
export function CopyField({ value, label, mono = true, className, revealable = false }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(!revealable);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  const shown = revealed ? value : '•'.repeat(Math.min(32, String(value).length));

  return (
    <div className={className}>
      {label && <p className="mb-1.5 text-[0.78rem] font-semibold text-muted">{label}</p>}
      <div className="flex items-stretch gap-2">
        <code
          className={cn(
            'flex-1 min-w-0 overflow-x-auto rounded-[10px] border border-line bg-sunken px-3 py-2.5 text-[0.8rem] text-ink',
            mono && 'numeric',
          )}
        >
          <span className="whitespace-nowrap">{shown}</span>
        </code>
        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="shrink-0 rounded-[10px] border border-line px-3 text-[0.78rem] font-semibold text-muted hover:text-ink hover:bg-sunken transition-colors"
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : `Copy ${label || 'value'}`}
          className={cn(
            'shrink-0 inline-flex items-center gap-1.5 rounded-[10px] border px-3 text-[0.78rem] font-semibold transition-colors duration-200',
            copied
              ? 'border-success/30 bg-success-soft text-success-ink'
              : 'border-line text-muted hover:text-ink hover:bg-sunken',
          )}
        >
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

/* ==========================================================================
   Tabs
   ========================================================================== */
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto rounded-[12px] bg-sunken p-1', className)} role="tablist">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap rounded-[9px] px-3.5 py-2 text-[0.85rem] font-semibold transition-all duration-200',
              active ? 'bg-surface text-ink shadow-[var(--shadow-xs)]' : 'text-muted hover:text-ink',
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-px text-[0.68rem] tnum',
                  active ? 'bg-brand-soft text-brand-ink' : 'bg-line text-muted',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   Modal — focus trapped, Escape closes, scroll locked
   ========================================================================== */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key !== 'Tab') return;
      const focusables = ref.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTarget = ref.current?.querySelector('[data-autofocus]') ?? ref.current;
    focusTarget?.focus?.();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-plum/45 backdrop-blur-[2px] animate-fade"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative w-full bg-surface border border-line shadow-[var(--shadow-lg)] animate-scale-in outline-none',
          'rounded-t-[20px] sm:rounded-[16px] max-h-[92vh] overflow-y-auto',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6 pb-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[1.15rem] font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1.5 text-[0.87rem] text-muted leading-relaxed">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="shrink-0 -mt-1 -mr-1 rounded-[10px] p-2 text-muted hover:text-ink hover:bg-sunken transition-colors"
          >
            <IconX size={18} />
          </button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 border-t border-line bg-raised px-5 sm:px-6 py-4 rounded-b-[16px]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   Toaster
   ========================================================================== */
export function Toaster({ toasts, onDismiss }) {
  return (
    <div
      className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2.5 pointer-events-none sm:w-[380px]"
      aria-live="polite"
      role="status"
    >
      {toasts.map((toast) => {
        const Icon = ALERT_ICON[toast.tone] ?? IconInfo;
        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-[13px] border bg-surface p-3.5 shadow-[var(--shadow-lg)] animate-fade-up',
              toast.tone === 'danger' ? 'border-danger/30' : toast.tone === 'success' ? 'border-success/30' : 'border-line',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                TONES[toast.tone] ?? TONES.brand,
              )}
            >
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.89rem] font-semibold text-ink leading-snug">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-[0.82rem] text-muted leading-relaxed">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-lg p-1 text-faint hover:text-ink transition-colors"
            >
              <IconX size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
