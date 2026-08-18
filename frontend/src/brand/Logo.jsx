import { cn } from '../lib/cn';

/**
 * The SafePay mark, in Wema Bank's palette.
 *
 * Badge fill uses Wema's signature 137deg gradient (#B11892 -> #3B1439); the
 * shield and check are white monoline so the mark stays legible down to 16px,
 * and the two nodes — the buyer and the seller — are the teal that closes
 * Wema's own gradient set.
 */
export function LogoMark({ size = 36, className, rounded = 'rounded-[24%]' }) {
  const gradientId = `sp-badge-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={cn(rounded, className)}
      role="img"
      aria-label="SafePay"
    >
      <defs>
        <linearGradient id={gradientId} x1="0.06" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#B11892" />
          <stop offset="1" stopColor="#3B1439" />
        </linearGradient>
        <clipPath id={`${gradientId}-clip`}>
          <rect width="512" height="512" rx="112" ry="112" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${gradientId}-clip)`}>
        <rect width="512" height="512" fill={`url(#${gradientId})`} />
        <path d="M-40 392 L200 152 L232 184 L-8 424 Z" fill="#fff" opacity="0.05" />
        <path d="M300 -40 L560 220 L560 168 L352 -40 Z" fill="#fff" opacity="0.05" />
      </g>

      <path
        d="M256 96 L368 134 V248 C368 328 320 384 256 412 C192 384 144 328 144 248 V134 Z"
        fill="none" stroke="#fff" strokeWidth="19" strokeLinejoin="round" strokeLinecap="round"
      />
      <path
        d="M204 256 L241 294 L320 206"
        fill="none" stroke="#fff" strokeWidth="21" strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="368" cy="134" r="15" fill="#33CBB0" />
      <circle cx="144" cy="134" r="15" fill="#33CBB0" />
    </svg>
  );
}

export function Wordmark({ className, onDark = false }) {
  return (
    <span
      className={cn('font-display font-bold tracking-[-0.03em] leading-none', className)}
      style={{ color: onDark ? '#fff' : 'var(--c-ink)' }}
    >
      Safe
      <span style={{ color: onDark ? '#E884D8' : 'var(--c-brand)' }}>Pay</span>
    </span>
  );
}

export function Logo({ size = 34, showTagline = false, onDark = false, className }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      <span className="flex flex-col">
        <Wordmark onDark={onDark} className="text-[1.32rem]" />
        {showTagline && (
          <span
            className="text-[0.58rem] font-semibold tracking-[0.16em] uppercase mt-0.5"
            style={{ color: onDark ? '#B9A6B7' : 'var(--c-faint)' }}
          >
            Trusted payments, everywhere
          </span>
        )}
      </span>
    </span>
  );
}
