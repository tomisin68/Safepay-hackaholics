/**
 * Landing-page illustrations.
 *
 * Drawn rather than photographed, for three reasons: they weigh a few hundred
 * bytes each instead of a few hundred kilobytes on a Nigerian mobile
 * connection, they stay sharp at any density, and they read their colours from
 * the same tokens as the rest of the app — so light and dark are one switch
 * here too, with no second asset to keep in sync.
 *
 * Every scene is decorative and paired with real text, so each is aria-hidden
 * and the surrounding copy carries the meaning.
 */

import { cn } from '../lib/cn';

const frame = 'h-auto w-full';

/* Shared bits, so the three scenes look like one family. */
const Panel = ({ x, y, w, h, r = 10, fill = 'var(--c-surface)', stroke = 'var(--c-border)', ...rest }) => (
  <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} stroke={stroke} strokeWidth="1.5" {...rest} />
);

const Line = ({ x, y, w, h = 6, o = 1, fill = 'var(--c-border-strong)' }) => (
  <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} opacity={o} />
);

/**
 * The deal that starts in a chat — the single most common way money moves
 * between strangers here, and the one with no protection at all.
 */
export function SceneChatSale({ className }) {
  return (
    <svg viewBox="0 0 320 210" className={cn(frame, className)} aria-hidden="true" focusable="false">
      <rect width="320" height="210" rx="16" fill="var(--c-sunken)" />

      {/* incoming */}
      <Panel x="20" y="22" w="150" h="40" r="12" />
      <Line x="34" y="34" w="96" />
      <Line x="34" y="46" w="60" o={0.6} />

      {/* outgoing, brand-tinted */}
      <Panel x="150" y="72" w="150" h="40" r="12" fill="var(--c-brand-soft)" stroke="var(--c-brand-line)" />
      <Line x="164" y="84" w="110" fill="var(--c-brand)" o={0.55} />
      <Line x="164" y="96" w="72" fill="var(--c-brand)" o={0.32} />

      {/* the escrow card that ends the standoff */}
      <g>
        <Panel x="42" y="124" w="236" h="66" r="14" stroke="var(--c-brand-line)" />
        <rect x="42" y="124" width="4" height="66" rx="2" fill="var(--c-brand)" />

        <circle cx="74" cy="147" r="13" fill="var(--c-brand)" />
        <path
          d="M74 141.5v-2a3.4 3.4 0 0 1 6.8 0v2"
          transform="translate(-3.4 0)"
          fill="none"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <rect x="68" y="145" width="12" height="9" rx="2" fill="#fff" />

        <Line x="96" y="140" w="86" fill="var(--c-ink)" o={0.8} />
        <Line x="96" y="152" w="54" fill="var(--c-muted)" o={0.5} />

        {/* held-amount chip */}
        <rect x="200" y="136" width="62" height="22" rx="11" fill="var(--c-success-soft)" />
        <path
          d="M211 147.5l3.6 3.6 7.4-7.6"
          fill="none"
          stroke="var(--c-success)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Line x="227" y="144" w="24" h="7" fill="var(--c-success)" o={0.55} />

        <Line x="96" y="170" w="150" h="5" o={0.35} />
      </g>
    </svg>
  );
}

/**
 * The market handoff: a code scanned in person, so cash never has to change
 * hands before the goods do.
 */
export function SceneMarketHandoff({ className }) {
  const cells = [
    [0, 0], [1, 0], [2, 0], [4, 0], [5, 0],
    [0, 1], [2, 1], [3, 1], [5, 1],
    [0, 2], [1, 2], [2, 2], [4, 2],
    [1, 3], [3, 3], [4, 3], [5, 3],
    [0, 4], [2, 4], [3, 4], [5, 4],
    [1, 5], [2, 5], [4, 5], [5, 5],
  ];

  return (
    <svg viewBox="0 0 320 210" className={cn(frame, className)} aria-hidden="true" focusable="false">
      <rect width="320" height="210" rx="16" fill="var(--c-sunken)" />

      {/* the phone doing the scanning */}
      <Panel x="106" y="26" w="108" h="158" r="16" />

      {/* QR */}
      <rect x="122" y="48" width="76" height="76" rx="8" fill="var(--c-brand-soft)" />
      <g fill="var(--c-brand)">
        {cells.map(([cx, cy]) => (
          <rect key={`${cx}-${cy}`} x={128 + cx * 11} y={54 + cy * 11} width="8" height="8" rx="1.5" />
        ))}
      </g>
      {/* finder squares — brand-ink rather than plum, which is all but
          invisible against the dark canvas in dark mode */}
      <g fill="none" stroke="var(--c-brand-ink)" strokeWidth="2.5">
        <rect x="126" y="52" width="20" height="20" rx="4" />
        <rect x="174" y="52" width="20" height="20" rx="4" />
        <rect x="126" y="100" width="20" height="20" rx="4" />
      </g>

      {/* scan beam */}
      <rect x="118" y="82" width="84" height="3" rx="1.5" fill="var(--c-accent)" opacity="0.85" />

      <Line x="122" y="138" w="76" fill="var(--c-ink)" o={0.7} />
      <Line x="122" y="150" w="48" o={0.45} />

      <rect x="122" y="164" width="76" height="12" rx="6" fill="var(--c-brand)" />

      {/* two parties, either side */}
      <g>
        <circle cx="52" cy="92" r="20" fill="var(--c-brand-soft)" />
        <circle cx="52" cy="86" r="7" fill="var(--c-brand)" />
        <path d="M38 106a14 14 0 0 1 28 0z" fill="var(--c-brand)" />
        <Line x="30" y="122" w="44" o={0.4} />
      </g>
      <g>
        <circle cx="268" cy="92" r="20" fill="var(--c-success-soft)" />
        <circle cx="268" cy="86" r="7" fill="var(--c-success)" />
        <path d="M254 106a14 14 0 0 1 28 0z" fill="var(--c-success)" />
        <Line x="246" y="122" w="44" o={0.4} />
      </g>

      {/* the handoff itself */}
      <path d="M78 92h20" stroke="var(--c-border-strong)" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
      <path d="M222 92h20" stroke="var(--c-border-strong)" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Paid work, released a stage at a time — neither "everything upfront" nor
 * "everything on trust at the end".
 */
export function SceneMilestones({ className }) {
  const rows = [
    { y: 40, label: 92, done: true },
    { y: 92, label: 116, done: true },
    { y: 144, label: 74, done: false },
  ];

  return (
    <svg viewBox="0 0 320 210" className={cn(frame, className)} aria-hidden="true" focusable="false">
      <rect width="320" height="210" rx="16" fill="var(--c-sunken)" />

      {/* the spine the stages hang off */}
      <path d="M52 54v104" stroke="var(--c-border-strong)" strokeWidth="2" strokeLinecap="round" />
      <path d="M52 54v52" stroke="var(--c-brand)" strokeWidth="2" strokeLinecap="round" />

      {rows.map((row) => (
        <g key={row.y}>
          {row.done ? (
            <>
              <circle cx="52" cy={row.y + 14} r="11" fill="var(--c-brand)" />
              <path
                d={`M47 ${row.y + 14}l3.6 3.6 7-7.4`}
                fill="none"
                stroke="#fff"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : (
            <circle cx="52" cy={row.y + 14} r="11" fill="var(--c-surface)" stroke="var(--c-border-strong)" strokeWidth="2" />
          )}

          <Panel x="80" y={row.y} w="204" h="38" r="11" stroke={row.done ? 'var(--c-brand-line)' : 'var(--c-border)'} />
          <Line x="96" y={row.y + 12} w={row.label} fill="var(--c-ink)" o={row.done ? 0.75 : 0.45} />
          <Line x="96" y={row.y + 24} w={row.label * 0.55} o={0.35} />

          <rect
            x="238"
            y={row.y + 11}
            width="32"
            height="16"
            rx="8"
            fill={row.done ? 'var(--c-success-soft)' : 'var(--c-neutral-soft)'}
          />
          <Line
            x="245"
            y={row.y + 16}
            w="18"
            h="6"
            fill={row.done ? 'var(--c-success)' : 'var(--c-faint)'}
            o={0.7}
          />
        </g>
      ))}
    </svg>
  );
}

/**
 * A compact stand-in for a person. Deterministic from the initials, so the
 * same name always gets the same colour.
 */
export function AvatarGlyph({ initials, size = 40, tone = 0, className }) {
  const tones = [
    ['var(--c-brand-soft)', 'var(--c-brand-ink)'],
    ['var(--c-success-soft)', 'var(--c-success-ink)'],
    ['var(--c-warn-soft)', 'var(--c-warn-ink)'],
    ['var(--c-neutral-soft)', 'var(--c-neutral-ink)'],
  ];
  const [bg, fg] = tones[tone % tones.length];

  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', className)}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
