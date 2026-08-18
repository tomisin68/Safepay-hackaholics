/**
 * @safepay/react — a thin, dependency-free wrapper over the SafePay REST API.
 *
 * Two rules shape this package:
 *
 *  1. **A live key never belongs in a browser.** Anything that moves money is
 *     called from your server. The components here either take a server-created
 *     escrow, or call a small endpoint of yours that holds the secret. The SDK
 *     will refuse an `sk_live_` key on the client and say so loudly.
 *  2. **Read-only trust data is public**, so `<TrustBadge />` and `useSafeScore`
 *     need no credentials at all.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';

const DEFAULT_BASE = 'https://api.safepay.ng';
const SafePayContext = createContext(null);

/* ------------------------------------------------------------------ *
 * Provider
 * ------------------------------------------------------------------ */
export function SafePayProvider({ children, baseUrl = DEFAULT_BASE, publicKey, createEscrowUrl }) {
  if (typeof publicKey === 'string' && publicKey.startsWith('sk_live_')) {
    throw new Error(
      '[SafePay] A live secret key must never reach the browser. Create escrows from your server and pass `createEscrowUrl` instead.',
    );
  }

  const value = useMemo(
    () => ({ baseUrl: baseUrl.replace(/\/$/, ''), publicKey, createEscrowUrl }),
    [baseUrl, publicKey, createEscrowUrl],
  );

  return <SafePayContext.Provider value={value}>{children}</SafePayContext.Provider>;
}

export function useSafePay() {
  const ctx = useContext(SafePayContext);
  if (!ctx) throw new Error('[SafePay] Wrap your app in <SafePayProvider> first.');
  return ctx;
}

/* ------------------------------------------------------------------ *
 * Trust score — public, no auth
 * ------------------------------------------------------------------ */
export function useSafeScore(userId, { baseUrl } = {}) {
  const ctx = useContext(SafePayContext);
  const base = (baseUrl ?? ctx?.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');

  const [state, setState] = useState({ score: null, loading: Boolean(userId), error: null });

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    fetch(`${base}/v1/score/${encodeURIComponent(userId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json())?.error?.message ?? `HTTP ${res.status}`);
        return res.json();
      })
      .then((score) => { if (!cancelled) setState({ score, loading: false, error: null }); })
      .catch((error) => { if (!cancelled) setState({ score: null, loading: false, error }); });

    return () => { cancelled = true; };
  }, [userId, base]);

  return state;
}

export const badgeUrl = (userId, { baseUrl = DEFAULT_BASE, theme = 'light' } = {}) =>
  `${baseUrl.replace(/\/$/, '')}/v1/score/${encodeURIComponent(userId)}/badge.svg?theme=${theme}`;

/**
 * The zero-JavaScript path: a plain <img>. It renders instantly, works with SSR,
 * and stays correct because the server draws it.
 */
export function TrustBadge({ userId, theme = 'light', baseUrl, width = 300, height = 76, ...rest }) {
  const ctx = useContext(SafePayContext);
  const base = baseUrl ?? ctx?.baseUrl ?? DEFAULT_BASE;

  return (
    <img
      src={badgeUrl(userId, { baseUrl: base, theme })}
      alt="SafePay trust score"
      width={width}
      height={height}
      loading="lazy"
      {...rest}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Escrow
 * ------------------------------------------------------------------ */
export function useEscrow(escrowId, { pollMs = 0 } = {}) {
  const { baseUrl, publicKey } = useSafePay();
  const [state, setState] = useState({ escrow: null, loading: Boolean(escrowId), error: null });

  const load = useCallback(async () => {
    if (!escrowId) return;
    try {
      const res = await fetch(`${baseUrl}/v1/escrows/${escrowId}`, {
        headers: publicKey ? { Authorization: `Bearer ${publicKey}` } : {},
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? `HTTP ${res.status}`);
      const data = await res.json();
      setState({ escrow: data.escrow, loading: false, error: null });
    } catch (error) {
      setState({ escrow: null, loading: false, error });
    }
  }, [escrowId, baseUrl, publicKey]);

  useEffect(() => { load(); }, [load]);

  /* Escrow state changes when the *other* party acts, so a checkout screen that
     never re-checks will happily show stale status. */
  useEffect(() => {
    if (!pollMs || !escrowId) return undefined;
    const timer = setInterval(load, pollMs);
    return () => clearInterval(timer);
  }, [pollMs, escrowId, load]);

  return { ...state, refresh: load };
}

/**
 * <SafePayButton />
 *
 * Hands off to your server to create the escrow (`createEscrowUrl`), then calls
 * `onCreated` with whatever it returns. Never holds a secret itself.
 */
export function SafePayButton({
  amount,
  amountKobo,
  title,
  sellerId,
  sellerEmail,
  type = 'goods',
  metadata,
  onCreated,
  onError,
  children = 'Pay safely with SafePay',
  className,
  style,
  disabled,
  ...rest
}) {
  const { createEscrowUrl } = useSafePay();
  const [loading, setLoading] = useState(false);

  const start = async () => {
    if (!createEscrowUrl) {
      const error = new Error(
        '[SafePay] Set `createEscrowUrl` on <SafePayProvider> — the endpoint on your server that creates the escrow with your secret key.',
      );
      onError?.(error);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(createEscrowUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, amountKobo, title, sellerId, sellerEmail, type, metadata }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? `HTTP ${res.status}`);
      const data = await res.json();
      onCreated?.(data.escrow ?? data);
    } catch (error) {
      onError?.(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 48,
        padding: '0 22px',
        border: 0,
        borderRadius: 11,
        background: '#981D87',
        color: '#fff',
        fontFamily: 'Outfit, Inter, system-ui, sans-serif',
        fontSize: 15,
        fontWeight: 600,
        cursor: loading ? 'progress' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
      {...rest}
    >
      <ShieldGlyph />
      {loading ? 'Opening escrow…' : children}
    </button>
  );
}

function ShieldGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l7 2.4v6.2c0 4.3-2.9 7.6-7 9.4-4.1-1.8-7-5.1-7-9.4V5.4L12 3z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
      <path d="M9 12l2 2 4-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const SAFEPAY_EVENTS = [
  'escrow.created', 'escrow.funded', 'escrow.delivered', 'escrow.released',
  'escrow.disputed', 'escrow.refunded', 'dispute.resolved', 'score.updated',
];
