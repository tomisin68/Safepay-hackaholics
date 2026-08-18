/** Tiny class joiner — no dependency needed for what clsx does in one line. */
export const cn = (...parts) => parts.flat(Infinity).filter(Boolean).join(' ');
