/**
 * Lottie palette surgery.
 *
 * "Secure Payment.json" ships in a generic grey/gold palette that belongs to
 * nobody. Rather than hand-editing 31KB of keyframes, we walk the document and
 * swap every colour through a map, so the animation inherits the SafePay
 * palette the same way every other surface does — and can be re-derived for
 * light and dark instead of being baked once.
 */

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
 * The source palette, in the order it reads on screen:
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
