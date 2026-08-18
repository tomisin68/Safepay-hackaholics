import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { IconSpinner } from '../Icons';

/**
 * One button. Every variant keeps a >=44px touch target at md/lg, a visible
 * focus ring, and a real loading state — a money button that gives no feedback
 * gets double-tapped, and double-tapping a money button is how people lose
 * money.
 */

const VARIANTS = {
  primary:
    'bg-brand text-white shadow-[var(--shadow-brand)] hover:bg-brand-strong active:translate-y-px border border-transparent',
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-raised hover:border-brand/40 active:translate-y-px',
  subtle:
    'bg-brand-soft text-brand-ink border border-brand-line hover:bg-brand-soft/70 active:translate-y-px',
  ghost:
    'bg-transparent text-muted hover:text-ink hover:bg-sunken border border-transparent',
  danger:
    'bg-danger text-white hover:brightness-110 active:translate-y-px border border-transparent',
  success:
    'bg-success text-white hover:brightness-110 active:translate-y-px border border-transparent',
  onDark:
    'bg-white text-plum hover:bg-white/90 active:translate-y-px border border-transparent',
  outlineOnDark:
    'bg-white/10 text-white border border-white/25 hover:bg-white/18 active:translate-y-px backdrop-blur-sm',
};

const SIZES = {
  sm: 'h-9 px-3.5 text-[0.83rem] gap-1.5 rounded-[9px]',
  md: 'h-11 px-5 text-[0.92rem] gap-2 rounded-[11px]',
  lg: 'h-[52px] px-7 text-[1rem] gap-2.5 rounded-[13px]',
};

export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    icon: Icon,
    iconRight: IconRight,
    fullWidth = false,
    className,
    children,
    to,
    href,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  const classes = cn(
    'relative inline-flex items-center justify-center font-semibold whitespace-nowrap select-none',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out',
    'disabled:opacity-55 disabled:pointer-events-none',
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
    className,
  );

  const content = (
    <>
      {loading ? <IconSpinner size={size === 'sm' ? 15 : 17} /> : Icon ? <Icon size={size === 'sm' ? 15 : 17} /> : null}
      {children}
      {IconRight && !loading ? <IconRight size={size === 'sm' ? 15 : 17} /> : null}
    </>
  );

  if (to && !isDisabled) {
    return <Link ref={ref} to={to} className={classes} {...rest}>{content}</Link>;
  }
  if (href && !isDisabled) {
    return (
      <a ref={ref} href={href} className={classes} target="_blank" rel="noreferrer noopener" {...rest}>
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
});

/** Icon-only button — always carries an accessible name. */
export function IconButton({ label, icon: Icon, size = 'md', variant = 'ghost', className, ...rest }) {
  const box = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-[11px] transition-colors duration-200',
        VARIANTS[variant],
        box,
        className,
      )}
      {...rest}
    >
      <Icon size={size === 'sm' ? 16 : 19} />
    </button>
  );
}
