# @safepay/react

React components and hooks for SafePay escrow and portable trust scores.

```bash
npm install @safepay/react
```

## The one rule

**A live secret key never belongs in a browser.** Anything that moves money is
created on your server; the SDK throws immediately if it sees an `sk_live_` key
on the client. Read-only trust data is public, so `<TrustBadge />` and
`useSafeScore` need no credentials at all.

## Setup

```jsx
import { SafePayProvider } from '@safepay/react';

export default function App({ children }) {
  return (
    <SafePayProvider
      baseUrl="https://api.safepay.ng"
      createEscrowUrl="/api/safepay/create-escrow"   // your server route
    >
      {children}
    </SafePayProvider>
  );
}
```

Your server route holds the secret:

```js
// POST /api/safepay/create-escrow
export async function POST(req) {
  const body = await req.json();

  const res = await fetch('https://api.safepay.ng/v1/escrows', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SAFEPAY_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return Response.json(await res.json());
}
```

## Checkout

```jsx
import { SafePayButton, TrustBadge } from '@safepay/react';

function Listing({ listing }) {
  return (
    <>
      <TrustBadge userId={listing.sellerId} />

      <SafePayButton
        amount={listing.price}
        title={listing.name}
        sellerId={listing.sellerId}
        onCreated={(escrow) => router.push(`/escrow/${escrow.id}`)}
        onError={(err) => toast.error(err.message)}
      >
        Pay safely with SafePay
      </SafePayButton>
    </>
  );
}
```

## Showing trust

`<TrustBadge />` renders a plain `<img>` pointing at a server-drawn SVG — it works
with SSR, needs no JavaScript, and cannot drift out of date.

```jsx
<TrustBadge userId="usr_123" theme="dark" />
```

For the raw numbers:

```jsx
const { score, loading, error } = useSafeScore(sellerId);

if (score) {
  return <span>{score.score}/100 · {score.tierLabel}</span>;
}
```

## Watching an escrow

Escrow status changes when the *other* party acts, so a checkout screen that
never re-checks will show stale state. Pass `pollMs`:

```jsx
const { escrow, refresh } = useEscrow(escrowId, { pollMs: 5000 });

if (escrow?.status === 'released') return <OrderComplete />;
```

In production, prefer a webhook to your server over polling from the browser —
see `escrow.released` in the [API reference](https://api.safepay.ng/docs).

## API

| Export | What it does |
|---|---|
| `SafePayProvider` | Configures base URL and your escrow-creation route |
| `useSafePay()` | The current configuration |
| `SafePayButton` | Creates an escrow via your server, then calls `onCreated` |
| `TrustBadge` | Server-rendered SVG trust badge, no auth |
| `useSafeScore(userId)` | `{ score, loading, error }` — public lookup |
| `useEscrow(id, { pollMs })` | `{ escrow, loading, error, refresh }` |
| `badgeUrl(userId, opts)` | Build a badge URL yourself |
| `SAFEPAY_EVENTS` | Every webhook event name |
