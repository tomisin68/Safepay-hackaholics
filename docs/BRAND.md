# SafePay brand & design system

SafePay is built for Hackaholics 7.0, so it wears **Wema Bank's colours** rather
than a palette of its own. Every value below was taken from Wema's own published
assets, not eyeballed from a screenshot.

## Where the colours came from

| Source | Value |
|---|---|
| `wemabank.com/wema.svg` — the fill of the Wema "W" mark | `#981D87` |
| Wema production stylesheet (`assets/index-*.css`), 14 occurrences | `#981D87` |
| Same stylesheet — brighter brand magenta | `#B11892` |
| Same stylesheet — deep plum, the dark terminus of Wema's `137deg` gradients | `#3B1439` |
| Same stylesheet — alert red | `#E8323E` |
| Same stylesheet — the teal that closes one of Wema's gradient sets | `#33CBB0` |
| Wema type stack | Outfit, Inter Tight, Inter |

Wema's signature gradient is `linear-gradient(137deg, …)`. SafePay reuses that
exact angle for its one permitted gradient surface.

## Palette

### Brand

| Token | Light | Dark | Role |
|---|---|---|---|
| `brand` | `#981D87` | `#B11892` | Primary actions, the one accent that matters |
| `brand-strong` | `#7F1571` | `#C93AAB` | Hover |
| `brand-ink` | `#7A1770` | `#E884D8` | Brand-coloured text (8.5:1 on its chip) |
| `brand-soft` | `#FBEDF9` | `#2C1229` | Chip and highlight backgrounds |
| `plum` | `#3B1439` | `#2A0F28` | Dark surfaces, hero, code blocks |
| `accent` | `#0B6B58` | `#33CBB0` | "Settled" — teal, darkened for light mode |

### Status

Status colours are **reserved** — they never double as a chart series, and they
always ship with a label and an icon, never colour alone.

| Token | Light text | Light chip | Contrast |
|---|---|---|---|
| `success` | `#0B6B58` | `#E6F7F2` | 5.82:1 |
| `warn` | `#8A5300` | `#FDF3E3` | 5.76:1 |
| `danger` | `#A81622` | `#FDECEE` | 6.57:1 |
| `neutral` | `#4A4550` | `#F2F1F4` | 8.26:1 |

### Verified contrast

Every pair was computed, not estimated. All clear WCAG AA; most clear AAA.

```
 7.34:1  white on brand button
15.61:1  ink on white
 5.82:1  muted on white
17.41:1  ink on dark surface
 8.10:1  muted on dark surface
 9.07:1  teal accent on dark
```

One finding changed the design: Wema's teal `#33CBB0` scores only **1.98:1** on a
light surface. It is therefore a dark-mode and logo accent only — light mode uses
`#0B6B58` for the same semantic role.

## Typography

| Face | Use |
|---|---|
| **Outfit** 600–800 | Headings, the wordmark, numbers that carry weight |
| **Inter** 400–700 | Body, UI, labels |
| **IBM Plex Mono** | Money, IDs, API keys, code — anything that must align in a column |

Money and identifiers use `font-variant-numeric: tabular-nums` so digits never
jitter as a value updates and columns line up.

## The logo

The mark keeps SafePay's shield-and-check idea and re-renders it in Wema's system:

- **Badge** — Wema's `137deg` gradient, `#B11892 → #3B1439`, on a `112/512` radius
  rounded square. Two faint intersecting slashes echo the geometric construction
  of Wema's own "W".
- **Shield and check** — white monoline, 19–21 stroke weight, so the mark stays
  readable down to 16px where the finer details drop out.
- **Two nodes** — teal `#33CBB0` dots at the shield's shoulders: the buyer and the
  seller, connected. This is the only place the teal appears in the mark.

| File | Use |
|---|---|
| `brand/safepay-icon.svg` | App icon, favicon, avatar |
| `brand/safepay-icon-mono.svg` | Single-colour on light backgrounds |
| `brand/safepay-lockup.svg` | Horizontal lockup with tagline |
| `brand/safepay-lockup-dark.svg` | Same, for dark backgrounds |

## Design principles

**Purple is an accent, not a wash.** The design-system research flagged
"AI purple/pink gradients" as an anti-pattern for fintech. The canvas stays white
(or deep plum in dark mode) and the brand purple is spent deliberately: primary
buttons, active navigation, the hero. Gradients appear on exactly two surfaces —
the hero and the protection band — and nowhere else.

**Swiss minimalism.** Generous whitespace, a strict grid, high contrast, no
ornament that does not carry information. The visual style the research
recommended for enterprise and financial dashboards.

**Money is legible before it is pretty.** Amounts are monospaced and tabular.
Fees are always shown next to totals. "Seller receives" is stated explicitly
rather than left as arithmetic for the user.

**Colour is never the only signal.** Every status pill carries a word. Every
chart offers a table view. Every icon-only control has an accessible name.

**Motion means something.** 150–260ms, ease-out, used for state changes and
spatial continuity only. All of it surrenders to `prefers-reduced-motion`.

## Tokens in code

Tokens live in `frontend/src/index.css` as CSS custom properties, mapped into
Tailwind v4 via `@theme inline`. Light and dark are one variable swap, and **no
component contains a raw hex value** — which is what makes the dark theme a
switch rather than a rewrite.

```css
:root      { --c-brand: #981D87; }
.dark      { --c-brand: #B11892; }
@theme inline { --color-brand: var(--c-brand); }
```
