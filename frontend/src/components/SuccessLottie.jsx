import { useEffect, useRef, useState } from 'react';
import {
  COLLECTING_MONEY_PALETTE,
  PAYMENT_SUCCESS_PALETTE,
  loadLottieDocument,
  loadLottiePlayer,
  recolorLottie,
} from '../lib/lottie';
import { useTheme } from '../context/AppProviders';
import { cn } from '../lib/cn';
import { IconCheck } from './Icons';

/**
 * The animation that confirms money actually moved.
 *
 * Unlike the landing-page hero, these play inside a dialog the user has just
 * pressed a button in: they are on screen immediately, they are the answer to
 * "did that work?", and they are gone as soon as it is dismissed. So there is
 * no intersection observer here — only the two things that still matter in a
 * dialog: honouring reduced motion, and not animating into a hidden tab.
 */

const VARIANTS = {
  /**
   * Funding an escrow. The source is built to loop — one note lands in the
   * wallet as the next one leaves the edge of the frame — and the money going
   * in is the whole point, so it keeps going for as long as the dialog is open.
   * Its last frame is a note dropping into the wallet, which is also the right
   * still to show when motion is not wanted.
   */
  funded: {
    file: 'Collecting Money.json',
    palette: COLLECTING_MONEY_PALETTE,
    loop: true,
    /* The notes fly in from beyond both edges: the composition is used corner
       to corner, so it is framed exactly as exported. */
    viewBoxSize: null,
  },
  /**
   * A withdrawal leaving SafePay. A burst that resolves onto a tick — looping
   * it would keep re-announcing a thing that already happened, so it plays once
   * and holds on the tick.
   */
  paid: {
    file: 'Payment Successful.json',
    palette: PAYMENT_SUCCESS_PALETTE,
    loop: false,
    /* This one is a 1920x1080 export whose subject is a 172x183 box dead in the
       middle — left as exported it renders as a speck. Crop to a square around
       the burst instead: 350px of radius clears the widest ring (~325px) while
       letting the sparks, which are past that, fly out of frame the way they
       are meant to. */
    viewBoxSize: '608 186 700 700',
  },
};

/**
 * @param {'funded'|'paid'} props.variant which moment this is confirming
 * @param {string}          props.label   what the animation is saying, for screen readers
 */
export function SuccessLottie({ variant, label, className }) {
  const config = VARIANTS[variant];
  const hostRef = useRef(null);
  const animRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !config) return undefined;

    let cancelled = false;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    /* A looping animation in a background tab is pure battery for nobody. */
    const onVisibility = () => {
      if (!animRef.current || reduced) return;
      if (document.hidden) animRef.current.pause();
      else animRef.current.play();
    };

    (async () => {
      try {
        const [lottie, doc] = await Promise.all([
          loadLottiePlayer(),
          loadLottieDocument(config.file),
        ]);
        if (cancelled) return;

        const anim = lottie.loadAnimation({
          container: host,
          renderer: 'svg',
          loop: config.loop && !reduced,
          autoplay: !reduced,
          animationData: recolorLottie(doc, config.palette[theme] ?? config.palette.light),
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            progressiveLoad: true,
            ...(config.viewBoxSize ? { viewBoxSize: config.viewBoxSize } : {}),
          },
        });

        // Reduced motion still gets the picture — the settled state, which is
        // the one worth showing: the note in the wallet, or the tick drawn.
        if (reduced) anim.goToAndStop(anim.totalFrames - 1, true);
        animRef.current = anim;
        document.addEventListener('visibilitychange', onVisibility);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      animRef.current?.destroy();
      animRef.current = null;
    };
    // Theme is a palette swap, and the palette is baked into the document that
    // lottie-web holds — so the player is rebuilt rather than mutated.
  }, [config, theme]);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={label}
      className={cn('h-[172px] w-full', className)}
    >
      {failed ? <FallbackMark /> : null}
    </div>
  );
}

/** If the document cannot be fetched, the dialog still has to confirm itself. */
function FallbackMark() {
  return (
    <span
      aria-hidden="true"
      className="mx-auto flex h-14 w-14 translate-y-[58px] items-center justify-center rounded-full bg-success-soft text-success-ink"
    >
      <IconCheck size={26} />
    </span>
  );
}
