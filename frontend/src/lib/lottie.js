/**
 * Lottie plumbing: shared loading, and palette surgery.
 *
 * The animations we ship are stock exports — a grey/gold card, a gold wallet,
 * a neon-green tick. None of those palettes belong to anybody. Rather than
 * hand-editing tens of thousands of keyframes, we walk each document and swap
 * every colour through a map, so the animations inherit the SafePay palette the
 * same way every other surface does, and can be re-derived for light and dark
 * instead of being baked once.
 */

/* ==========================================================================
   Loading

   lottie-web is ~250KB and the documents are 25-30KB each, so none of it is in
   the main bundle: the player and every document load on first use, and are
   then shared by whichever components ask for them.
   ========================================================================== */

let playerPromise = null;

export const loadLottiePlayer = () =>
  (playerPromise ??= import('lottie-web/build/player/lottie_light').then((m) => m.default));

const documents = new Map();

/** @param {string} file a filename in `public/`, e.g. 'Secure Payment.json' */
export function loadLottieDocument(file) {
  if (!documents.has(file)) {
    const request = fetch(`${import.meta.env.BASE_URL}${encodeURIComponent(file)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`animation ${res.status}`);
        return res.json();
      })
      // A rejected promise must not stay in the cache, or one flaky load leaves
      // the animation broken for the rest of the session.
      .catch((err) => { documents.delete(file); throw err; });
    documents.set(file, request);
  }
  return documents.get(file);
}

/* ==========================================================================
   Palettes
   ========================================================================== */

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Lottie stores colour as normalised [r,g,b] (sometimes with alpha). */
const toHex = (arr) =>
  '#' +
  arr
    .slice(0, 3)
    .map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0'))
    .join('');

const toRgb = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
};

/**
 * "Secure Payment.json" — the landing hero. Source palette, in the order it
 * reads on screen:
 *   #ebebeb / #cfcfcf  card face and its shading
 *   #8896a3 / #5f6675  outlines and structural strokes
 *   #ffba4d / #ffdc69  the coin
 *   #5bbaa7 / #81debc  the confirmation tick
 *   #66c4ff            the lock accent
 *
 * Light keeps the plum outline dark against a pale brand-soft card. Dark has to
 * invert the structure — a plum outline on a plum canvas is an invisible
 * animation — so the outlines become the light pink that carries ink on dark.
 */
export const SECURE_PAYMENT_PALETTE = {
  light: {
    '#ebebeb': '#fbedf9',
    '#cfcfcf': '#f0d8ed',
    '#8896a3': '#a63f97',
    '#5f6675': '#3b1439',
    '#ffba4d': '#b11892',
    '#ffdc69': '#e884d8',
    '#5bbaa7': '#0e8a72',
    '#81debc': '#33cbb0',
    '#66c4ff': '#981d87',
  },
  dark: {
    '#ebebeb': '#3a1636',
    '#cfcfcf': '#552a4f',
    '#8896a3': '#d454c2',
    '#5f6675': '#f4d9ef',
    '#ffba4d': '#e884d8',
    '#ffdc69': '#f7c9ee',
    '#5bbaa7': '#33cbb0',
    '#81debc': '#5ee0c4',
    '#66c4ff': '#d454c2',
  },
};

/**
 * "Collecting Money.json" — notes flying into a wallet, for the moment an
 * escrow is funded. Source palette:
 *   #ffffff            note paper, and the wallet's highlights
 *   #212d3a            every outline and structural stroke
 *   #fbbb48 / #eaa332  the wallet body and its shaded flap
 *   #77c771            the denomination mark on the notes
 *   #bababa / #939393  the card tucked into the wallet
 *
 * A single colour carries every outline here, and it has to work over both the
 * note and the wallet — so unlike the coin above, the wallet stays *darker*
 * than the outline in both themes rather than inverting. Light: dark plum lines
 * over pale paper and a magenta wallet. Dark: near-white pink lines over a dark
 * plum note and the same magenta wallet.
 */
export const COLLECTING_MONEY_PALETTE = {
  light: {
    '#ffffff': '#fbedf9',
    '#212d3a': '#3b1439',
    '#fbbb48': '#b11892',
    '#eaa332': '#7f1571',
    '#77c771': '#0e8a72',
    '#bababa': '#f0d8ed',
    '#939393': '#dbcfd9',
  },
  dark: {
    '#ffffff': '#2c1229',
    '#212d3a': '#f4d9ef',
    '#fbbb48': '#b11892',
    '#eaa332': '#7f1571',
    '#77c771': '#33cbb0',
    '#bababa': '#552a4f',
    '#939393': '#3f2039',
  },
};

/**
 * "Payment Successful.json" — a tick drawn on inside a burst of rings, for a
 * withdrawal leaving SafePay. Source palette:
 *   #ffffff            the tick itself
 *   #03ff98            the ring, and the sparks around it
 *   #00ff97 / #80ffcb  the two expanding halo ellipses
 *
 * The rings fade to nothing by the last frame, which leaves the tick alone on
 * whatever is behind it — and a white tick on a white dialog is nothing at all.
 * So the tick takes the success colour rather than staying white, and the rings
 * drop to tints that read behind it without competing with it.
 */
export const PAYMENT_SUCCESS_PALETTE = {
  light: {
    '#ffffff': '#0e8a72',
    '#03ff98': '#7fd9c6',
    '#00ff97': '#a4e4d6',
    '#80ffcb': '#cceee6',
  },
  dark: {
    '#ffffff': '#5ee0c4',
    '#03ff98': '#1f7a68',
    '#00ff97': '#18604f',
    '#80ffcb': '#14493d',
  },
};

/**
 * Returns a deep copy with every colour remapped. The copy matters: lottie-web
 * mutates the document it is handed, so sharing one object between two players
 * (or between theme switches) corrupts both.
 */
export function recolorLottie(animation, map) {
  const lookup = Object.fromEntries(
    Object.entries(map).map(([from, to]) => [from.toLowerCase(), toRgb(to)]),
  );

  const swap = (value) => {
    if (!Array.isArray(value) || value.length < 3) return value;
    if (value.some((n) => typeof n !== 'number')) return value;
    const hit = lookup[toHex(value)];
    if (!hit) return value;
    // Preserve any trailing alpha the source carried.
    return value.length > 3 ? [...hit, ...value.slice(3)] : hit;
  };

  const walk = (node, key) => {
    if (Array.isArray(node)) return node.map((child) => walk(child, key));
    if (node && typeof node === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(node)) {
        // `c` is the colour property on fills and strokes. Its `k` is either a
        // static [r,g,b] or a keyframe list whose `s`/`e` hold the same shape.
        if (k === 'c' && v && typeof v === 'object') {
          out[k] = { ...v, k: Array.isArray(v.k) ? swapKeyframes(v.k) : v.k };
        } else {
          out[k] = walk(v, k);
        }
      }
      return out;
    }
    return node;
  };

  const swapKeyframes = (k) => {
    if (typeof k[0] === 'number') return swap(k);
    return k.map((frame) =>
      frame && typeof frame === 'object'
        ? { ...frame, ...(frame.s ? { s: swap(frame.s) } : {}), ...(frame.e ? { e: swap(frame.e) } : {}) }
        : frame,
    );
  };

  return walk(animation, null);
}
