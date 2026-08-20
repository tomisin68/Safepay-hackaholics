import { useEffect, useRef, useState } from 'react';
import {
  SECURE_PAYMENT_PALETTE,
  loadLottieDocument,
  loadLottiePlayer,
  recolorLottie,
} from '../lib/lottie';
import { useTheme } from '../context/AppProviders';
import { cn } from '../lib/cn';

/**
 * The "Secure Payment" animation, in SafePay's colours.
 *
 * Three things this deliberately does not do:
 *   - ship lottie-web in the main bundle (it is ~250KB and the animation is
 *     below the fold, so both the player and the document load on demand),
 *   - play while off-screen, or in a background tab,
 *   - move at all when the visitor has asked for reduced motion — they get the
 *     final frame, which is the resolved state and the one worth showing.
 */

export function SecurePaymentLottie({ className, label = 'Money held safely in escrow, then released' }) {
  const hostRef = useRef(null);
  const animRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let cancelled = false;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // Wait until it is actually near the viewport before paying for any of it.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          animRef.current?.pause();
          return;
        }
        if (animRef.current) {
          if (!reduced) animRef.current.play();
          return;
        }
        observer.unobserve(host);
        start();
      },
      { rootMargin: '200px 0px' },
    );

    async function start() {
      try {
        const [lottie, doc] = await Promise.all([
          loadLottiePlayer(),
          loadLottieDocument('Secure Payment.json'),
        ]);
        if (cancelled) return;

        const anim = lottie.loadAnimation({
          container: host,
          renderer: 'svg',
          loop: !reduced,
          autoplay: !reduced,
          animationData: recolorLottie(doc, SECURE_PAYMENT_PALETTE[theme] ?? SECURE_PAYMENT_PALETTE.light),
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true },
          // The source opens and closes on empty frames: everything scales in
          // from nothing and back out again. Looping the full 0-150 leaves a
          // visible blank beat every cycle, which reads as a broken image
          // rather than a pause. Loop the part that has a subject in it.
          initialSegment: [18, 132],
        });

        // Reduced motion still gets the picture — the settled state, which is
        // the moment worth showing: money released, confirmed.
        if (reduced) anim.goToAndStop(112, true);
        animRef.current = anim;
        observer.observe(host);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    observer.observe(host);

    return () => {
      cancelled = true;
      observer.disconnect();
      animRef.current?.destroy();
      animRef.current = null;
    };
    // Theme is a palette swap, and the palette is baked into the document that
    // lottie-web holds — so the player is rebuilt rather than mutated.
  }, [theme]);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={label}
      className={cn('h-full w-full', className)}
    >
      {failed ? <FallbackMark /> : null}
    </div>
  );
}

/** If the document cannot be fetched the section still needs a subject. */
function FallbackMark() {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
      <circle cx="60" cy="60" r="52" fill="var(--c-brand-soft)" />
      <path
        d="M60 26 L88 38v22c0 17-12 28-28 34-16-6-28-17-28-34V38z"
        fill="none"
        stroke="var(--c-brand)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M48 60l9 9 18-18" fill="none" stroke="var(--c-accent)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
