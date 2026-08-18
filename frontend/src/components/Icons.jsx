/**
 * Icon set — monoline, 24px grid, 1.75 stroke, currentColor.
 *
 * Hand-rolled rather than pulled from a package so every glyph shares the same
 * optical weight as the SafePay shield. Emoji are never used as icons.
 */

const Svg = ({ children, size = 20, strokeWidth = 1.75, className, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    {children}
  </svg>
);

export const IconShield = (p) => (
  <Svg {...p}><path d="M12 3l7 2.4v6.2c0 4.3-2.9 7.6-7 9.4-4.1-1.8-7-5.1-7-9.4V5.4L12 3z" /></Svg>
);
export const IconShieldCheck = (p) => (
  <Svg {...p}>
    <path d="M12 3l7 2.4v6.2c0 4.3-2.9 7.6-7 9.4-4.1-1.8-7-5.1-7-9.4V5.4L12 3z" />
    <path d="M9 12l2 2 4-4.5" />
  </Svg>
);
export const IconCheck = (p) => <Svg {...p}><path d="M4.5 12.5l5 5 10-11" /></Svg>;
export const IconCheckCircle = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8.5 12.2l2.4 2.4 4.6-5.2" /></Svg>
);
export const IconClock = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 1.8" /></Svg>
);
export const IconAlert = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5" /><path d="M12 16h.01" /></Svg>
);
export const IconAlertTriangle = (p) => (
  <Svg {...p}>
    <path d="M10.3 4.3L2.8 17a2 2 0 001.7 3h15a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z" />
    <path d="M12 9.5v4" /><path d="M12 17h.01" />
  </Svg>
);
export const IconInfo = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></Svg>
);
export const IconArrowRight = (p) => <Svg {...p}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></Svg>;
export const IconArrowLeft = (p) => <Svg {...p}><path d="M19 12H5" /><path d="M11 18l-6-6 6-6" /></Svg>;
export const IconChevronRight = (p) => <Svg {...p}><path d="M9 5l7 7-7 7" /></Svg>;
export const IconChevronDown = (p) => <Svg {...p}><path d="M5 9l7 7 7-7" /></Svg>;
export const IconPlus = (p) => <Svg {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>;
export const IconX = (p) => <Svg {...p}><path d="M6 6l12 12" /><path d="M18 6L6 18" /></Svg>;
export const IconWallet = (p) => (
  <Svg {...p}>
    <path d="M3 8.5A2.5 2.5 0 015.5 6H18a2 2 0 012 2v1" />
    <path d="M3 8.5V17a2 2 0 002 2h14a2 2 0 002-2v-2" />
    <path d="M21 10.5h-4a2 2 0 000 4h4z" />
  </Svg>
);
export const IconUsers = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0112 0" />
    <path d="M16 5.3a3.2 3.2 0 010 5.4" /><path d="M17.5 14.4A6 6 0 0121 20" />
  </Svg>
);
export const IconUser = (p) => (
  <Svg {...p}><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0114 0" /></Svg>
);
export const IconCode = (p) => (
  <Svg {...p}><path d="M9 7l-5 5 5 5" /><path d="M15 7l5 5-5 5" /></Svg>
);
export const IconChart = (p) => (
  <Svg {...p}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></Svg>
);
export const IconScale = (p) => (
  <Svg {...p}>
    <path d="M12 4v16" /><path d="M6 20h12" /><path d="M5 7h14" />
    <path d="M5 7l-3 6h6z" /><path d="M19 7l-3 6h6z" />
  </Svg>
);
export const IconSun = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
  </Svg>
);
export const IconMoon = (p) => (
  <Svg {...p}><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" /></Svg>
);
export const IconMenu = (p) => (
  <Svg {...p}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></Svg>
);
export const IconCopy = (p) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5 15V6a2 2 0 012-2h8" />
  </Svg>
);
export const IconExternal = (p) => (
  <Svg {...p}><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4" /></Svg>
);
export const IconSearch = (p) => (
  <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Svg>
);
export const IconQr = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <path d="M14 14h3v3h-3z" /><path d="M20.5 14v3M17 20.5h3.5" />
  </Svg>
);
export const IconRefresh = (p) => (
  <Svg {...p}><path d="M20 11a8 8 0 10-1.8 6.3" /><path d="M20 20v-5h-5" /></Svg>
);
export const IconLock = (p) => (
  <Svg {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.8a4 4 0 018 0v2.7" /></Svg>
);
export const IconKey = (p) => (
  <Svg {...p}><circle cx="8" cy="14" r="4" /><path d="M11 11l8-8" /><path d="M16.5 5.5l2.5 2.5" /><path d="M14 8l2.5 2.5" /></Svg>
);
export const IconWebhook = (p) => (
  <Svg {...p}>
    <circle cx="7" cy="17" r="3" /><circle cx="17" cy="17" r="3" /><circle cx="12" cy="6" r="3" />
    <path d="M10.5 8.6L8.4 13.9" /><path d="M13.6 8.5l2.2 5.6" /><path d="M10 17h4" />
  </Svg>
);
export const IconTrash = (p) => (
  <Svg {...p}><path d="M4 7h16" /><path d="M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7" /><path d="M6 7l1 12.2A2 2 0 009 21h6a2 2 0 002-1.8L18 7" /></Svg>
);
export const IconLogout = (p) => (
  <Svg {...p}><path d="M15 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8" /><path d="M17 15l4-3-4-3" /><path d="M21 12H11" /></Svg>
);
export const IconHome = (p) => (
  <Svg {...p}><path d="M4 11l8-6.5 8 6.5" /><path d="M6.5 10v9h11v-9" /></Svg>
);
export const IconSpark = (p) => (
  <Svg {...p}><path d="M12 3l1.9 5.4L19 10.3l-5.1 1.9L12 17.6l-1.9-5.4L5 10.3l5.1-1.9z" /><path d="M18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></Svg>
);
export const IconGlobe = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3.5 9.5h17M3.5 14.5h17" /><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></Svg>
);
export const IconBank = (p) => (
  <Svg {...p}><path d="M3 9.5L12 4l9 5.5" /><path d="M5 10v8M10 10v8M14 10v8M19 10v8" /><path d="M3 21h18" /></Svg>
);
export const IconSpinner = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={`animate-spin-slow ${className}`} aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.22" />
    <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
