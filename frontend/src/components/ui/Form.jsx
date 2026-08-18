import { forwardRef, useId, useState } from 'react';
import { cn } from '../../lib/cn';
import { IconAlert, IconChevronDown } from '../Icons';

/**
 * Every field has a real <label>, helper text before the user makes a mistake,
 * and an error message next to the input rather than in a summary at the top.
 */

export function Field({ label, hint, error, required, children, id, className, action }) {
  const generated = useId();
  const fieldId = id ?? generated;
  const describedBy = [hint && `${fieldId}-hint`, error && `${fieldId}-error`].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={fieldId} className="text-[0.85rem] font-semibold text-ink">
          {label}
          {required && <span className="text-danger ml-0.5" aria-hidden="true">*</span>}
        </label>
        {action}
      </div>

      {typeof children === 'function'
        ? children({ id: fieldId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })
        : children}

      {hint && !error && (
        <p id={`${fieldId}-hint`} className="text-[0.78rem] text-muted leading-relaxed">{hint}</p>
      )}
      {error && (
        <p id={`${fieldId}-error`} className="flex items-start gap-1.5 text-[0.78rem] font-medium text-danger-ink">
          <IconAlert size={13} className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL = [
  'w-full rounded-[10px] border bg-surface px-3.5 text-[0.93rem] text-ink',
  'placeholder:text-faint transition-[border-color,box-shadow] duration-200',
  'focus:outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/15',
  'disabled:opacity-60 disabled:bg-sunken disabled:cursor-not-allowed',
].join(' ');

export const Input = forwardRef(function Input({ className, invalid, prefix, size = 'md', ...rest }, ref) {
  const height = size === 'lg' ? 'h-[52px]' : 'h-11';

  if (prefix) {
    return (
      <div
        className={cn(
          'flex items-center rounded-[10px] border bg-surface transition-[border-color,box-shadow] duration-200',
          'focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/15',
          invalid ? 'border-danger' : 'border-line-strong',
          height,
          className,
        )}
      >
        <span className="pl-3.5 pr-1 text-[0.95rem] font-semibold text-muted select-none">{prefix}</span>
        <input
          ref={ref}
          className="h-full flex-1 min-w-0 bg-transparent pr-3.5 text-[0.95rem] text-ink placeholder:text-faint focus:outline-none"
          {...rest}
        />
      </div>
    );
  }

  return (
    <input
      ref={ref}
      className={cn(CONTROL, height, invalid ? 'border-danger' : 'border-line-strong', className)}
      {...rest}
    />
  );
});

export const Textarea = forwardRef(function Textarea({ className, invalid, rows = 4, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(CONTROL, 'py-2.5 leading-relaxed resize-y', invalid ? 'border-danger' : 'border-line-strong', className)}
      {...rest}
    />
  );
});

export const Select = forwardRef(function Select({ className, invalid, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          CONTROL, 'h-11 appearance-none pr-10',
          invalid ? 'border-danger' : 'border-line-strong',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <IconChevronDown
        size={16}
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
});

/**
 * Money input. Types as a plain number, displays with separators on blur, and
 * always reports kobo upward so no component ever does float arithmetic.
 */
export function MoneyInput({ value, onChange, id, invalid, autoFocus, placeholder = '0.00', ...rest }) {
  const [focused, setFocused] = useState(false);

  const display = focused
    ? value
    : value === '' || value == null
      ? ''
      : Number(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div
      className={cn(
        'flex items-center rounded-[12px] border-2 bg-surface transition-[border-color,box-shadow] duration-200 h-[64px]',
        'focus-within:border-brand focus-within:ring-[4px] focus-within:ring-brand/12',
        invalid ? 'border-danger' : 'border-line-strong',
      )}
    >
      <span className="pl-4 pr-1 text-[1.35rem] font-semibold text-muted select-none">₦</span>
      <input
        id={id}
        inputMode="decimal"
        autoFocus={autoFocus}
        value={display}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.]/g, '');
          const parts = raw.split('.');
          const clean = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : raw;
          onChange(clean);
        }}
        className="numeric h-full flex-1 min-w-0 bg-transparent pr-4 text-[1.5rem] font-semibold text-ink placeholder:text-faint placeholder:font-normal focus:outline-none"
        {...rest}
      />
    </div>
  );
}

/** Radio group rendered as selectable cards — far easier to tap than a native radio. */
export function OptionCards({ options, value, onChange, name, columns = 2 }) {
  return (
    <div className={cn('grid gap-2.5', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')} role="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <label
            key={option.value}
            className={cn(
              'group relative flex cursor-pointer items-start gap-3 rounded-[12px] border-2 p-3.5 transition-all duration-200',
              active
                ? 'border-brand bg-brand-soft shadow-[var(--shadow-xs)]'
                : 'border-line bg-surface hover:border-brand/40 hover:bg-raised',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={active}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {Icon && (
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] transition-colors',
                  active ? 'bg-brand text-white' : 'bg-sunken text-muted group-hover:text-brand-ink',
                )}
              >
                <Icon size={16} />
              </span>
            )}
            <span className="min-w-0">
              <span className={cn('block text-[0.89rem] font-semibold', active ? 'text-brand-ink' : 'text-ink')}>
                {option.label}
              </span>
              {option.description && (
                <span className="mt-0.5 block text-[0.78rem] leading-snug text-muted">{option.description}</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
