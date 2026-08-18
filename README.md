<div align="center">
  <img src="brand/safepay-lockup.svg" alt="SafePay — Trusted payments, everywhere" width="440">

  **A nationwide escrow, settlement and trust-scoring layer for Nigeria.**

  Built for **Hackaholics 7.0 — Wema Bank**

</div>

---

## The problem

Somebody always has to go first.

Every day, across Instagram DMs, WhatsApp catalogues, campus groups and Jiji
listings, Nigerians pay strangers. The buyer sends money and hopes. Or the seller
ships and hopes. That gamble *is* the payment system, and it has three failures
baked in:

1. **Money leaves before anything is confirmed.** Once it is gone, it is gone.
2. **Reputation is trapped.** A seller trusted by 400 people on Instagram starts
   from zero on every new platform.
3. **Disputes go nowhere.** No neutral party, no evidence trail, no resolution.

## What SafePay does

SafePay stands in the middle and holds the money, so neither side has to go
first — and it turns every settled transaction into portable, verifiable
reputation that follows the user everywhere.

| | |
|---|---|
| **Universal escrow** | Not just parcels. Goods, milestone-based service work, rent and deposits, recurring plans, and in-person QR handoffs. |
| **SafeScore** | A 0–100 trust score computed from real settlement history, resistant to gaming, and **explainable down to the point**. |
| **Reputation portability** | `GET /v1/score/:userId` is public. Any app can check a seller — like a credit bureau, for everyday trading. |
| **Trust Badge** | A server-drawn SVG. One `<img>` tag puts a live score in an Instagram bio link. No SDK, no JavaScript. |
| **Automatic dispute triage** | Every dispute is classified — category, severity, confidence, suggested next step — before a human reads it. |
| **Fraud velocity detection** | Circular funding, counterparty fan-out and new-account/high-value patterns are flagged before money moves. |
| **Buyer Protection Reserve** | 20% of every fee funds a publicly visible pool that covers verified edge-case losses. |
| **Developer platform** | Hashed API keys, sandbox mode, HMAC-signed webhooks with retries, request logs, OpenAPI reference. |

### Where Wema fits

SafePay's settlement layer is designed to sit on Wema's virtual-account and NIP
transfer infrastructure — every SafePay merchant becomes a Wema account holder.
The product also wears Wema's brand: the purple `#981D87` is lifted from the fill
of Wema's own logo SVG, and the rest of the palette from their production
stylesheet. See [`docs/BRAND.md`](docs/BRAND.md).

---

## Run it

Node 20+ is the only prerequisite. **No credentials, no database, no cloud
account** — the whole stack boots from a clean checkout.

```bash
# 1. install
npm --prefix backend install
npm --prefix frontend install

# 2. configure (defaults work as-is)
cp backend/.env.example backend/.env

# 3. load demo data — a trust platform with an empty database demos badly
npm --prefix backend run seed

# 4. run both
npm --prefix backend run dev     # http://localhost:4600
npm --prefix frontend run dev    # http://localhost:5180
```

| | |
|---|---|
| Web app | http://localhost:5180 |
| API | http://localhost:4600 |
| API reference | http://localhost:4600/docs |

### Demo accounts

Password for all of them: `password123`

| Account | SafeScore | Why it is interesting |
|---|---|---|
| `ada@safepay.test` | 57 · Trusted | Active buyer, escrows in several states |
| `tunde@safepay.test` | 68 · Trusted | Proven seller, four counterparties, no disputes |
| `amara@safepay.test` | 30 · Building | **Two disputes against her** — watch the score take the hit |
| `kelechi@safepay.test` | 5 · New | Brand-new account, no history to trust yet |
| `admin@safepay.test` | — | **Operations console**: dispute queue, fraud flags, reserve |

The seed prints a sandbox API key on every run:

```bash
curl -H "Authorization: Bearer sk_test_..." http://localhost:4600/v1/escrows
```

---

## A five-minute demo path

1. Sign in as **ada@safepay.test** → the dashboard leads with *"Waiting on you"*,
   because the only thing that matters is what needs a decision now.
2. **New escrow** → pick a type, enter an amount, review. The summary panel shows
   the fee and exactly what the seller receives, live, before anything commits.
3. Open the escrow → **Fund it**. The confirmation dialog states the amount and
   that the seller cannot touch it. The stepper moves to *Funds held*.
4. Sign in as **tunde@safepay.test** → **Mark as delivered**.
5. Back as Ada → **Confirm & release**. Irreversibility is stated plainly before
   the click. The money trail records the fee and the reserve contribution.
6. Raise a dispute on another escrow with *"paid a week ago, never arrived, seller
   blocked me"* → it comes back classified **Likely fraud / critical** with a
   recommended action, before any human sees it.
7. Sign in as **admin@safepay.test** → resolve it, and inspect the fraud flags and
   Protection Reserve.
8. Visit **Trust profile** → the full SafeScore breakdown, and the Trust Badge with
   its one-line embed snippet.

---

## How it is built

```
safepay/
├── backend/            Node + Express REST API
│   └── src/
│       ├── routes/         auth · escrows · disputes · score · developer · admin
│       ├── services/       escrowEngine · scoreEngine · aiTriage · fraud · ledger · webhookDispatcher
│       ├── middleware/      auth (session + API key) · rateLimiter
│       ├── lib/             crypto · money · errors
│       └── store/           persistence, shaped like Firestore
├── frontend/           React + Vite + Tailwind v4
│   └── src/
│       ├── pages/          landing · auth · dashboard · escrows · disputes · trust · developer · admin
│       ├── components/      design system + domain components
│       ├── context/         auth · theme · toasts
│       └── index.css        the design tokens
├── sdks/react/         @safepay/react — SafePayButton, TrustBadge, hooks
├── brand/              logo, in Wema's palette
└── docs/               openapi.yaml · BRAND.md
```

### Engineering decisions worth knowing

**Money is integer kobo, everywhere.** Floating point never touches a balance.
Amounts become strings only at the last moment, before a human reads them.

**The ledger is append-only.** Nothing is edited or deleted; a correction is a new,
opposite entry. That is the record a dispute is settled against.

**The escrow state machine is explicit.** `STATUS_FLOW` declares every legal
transition and every route validates against it, so a double-release returns a
`409` instead of paying twice:

```json
{ "error": { "code": "conflict", "message": "An escrow that is \"released\" cannot move to \"released\"." } }
```

**Storage is swappable.** `store/index.js` exposes a Firestore-shaped API
(`collection(name).get/set/find/update`), backed by an atomically-written JSON
file. Production swaps that one file for `firebase-admin` without touching a
single route or service. The hackathon build boots with zero credentials, which
is what a judge actually needs.

**AI never becomes a dependency.** Dispute triage calls Gemini when
`GEMINI_API_KEY` is set, with an 8-second timeout — and falls back to a
deterministic rule-based classifier on any failure. Set no key at all and the
feature still works; the response just reports `source: "rules"`.

**Keys are hashed, sessions are signed.** API keys are stored as SHA-256 digests
and shown exactly once. Passwords use scrypt with per-user salts. Session JWTs and
webhook signatures are HMAC-SHA256 via Node's own `crypto` — no auth dependency
in the tree.

**Webhooks are signed and replay-resistant.** `SafePay-Signature: t=…,v1=…` is an
HMAC over `` `${timestamp}.${body}` ``, retried four times with backoff. A captured
payload cannot be replayed outside the receiver's tolerance window.

### SafeScore

A 0–100 score, recalculated after every settlement, from seven bounded components:

| Component | Max | What it measures |
|---|---:|---|
| Completed deals | 25 | Volume, log-scaled |
| Value settled | 10 | Naira through the account |
| Dispute-free record | 25 | Smoothed rate, **scaled by evidence** |
| Speed to confirm | 10 | Median hours from funded to released |
| Identity verification | 15 | phone → BVN/NIN → address |
| Account age | 5 | Tenure |
| Counterparty diversity | 10 | How many *different* people vouch for them |

Two details make it hold up:

- **Evidence scaling.** A clean record earns full reliability marks only once
  there is enough history to mean anything. Nobody gets 25 points for never having
  disputed a transaction they never made — which is why a brand-new account scores
  5, not 30.
- **Anti-gaming cap.** Two accounts cycling funds between themselves generate
  volume but no trust. When settled volume is concentrated in too few
  counterparties, the score is capped at 54 and the profile says so.

The full breakdown is returned by the API and rendered in the UI, because a trust
score nobody can interrogate is a trust score nobody trusts.

---

## Design

The interface follows Wema's palette and a Swiss-minimalist system — full
rationale, tokens and verified contrast figures in [`docs/BRAND.md`](docs/BRAND.md).

Things that were checked rather than assumed:

- **Every colour pair was computed.** All clear WCAG AA; most clear AAA. Wema's
  teal scores only 1.98:1 on white, so it is a dark-mode and logo accent only.
- **Colour is never the only signal.** Status pills carry words, the chart offers a
  table view, icon-only buttons carry accessible names.
- **Touch targets are ≥44px**, focus rings are restyled but never removed, and the
  modal traps focus and closes on Escape.
- **All motion surrenders** to `prefers-reduced-motion`.
- **Dark mode is a token swap**, not a second stylesheet — no component holds a raw
  hex value.
- `npx eslint src` reports **0 errors**.

The product is designed around one question: *where is my money right now?* The
status stepper answers it in plain language on every escrow — "SafePay is holding
the money", not "status: FUNDED".

---

## API

Full reference at `/docs` (OpenAPI 3.0, in [`docs/openapi.yaml`](docs/openapi.yaml)).

```bash
# create an escrow
curl -X POST http://localhost:4600/v1/escrows \
  -H "Authorization: Bearer sk_test_..." \
  -H "Content-Type: application/json" \
  -d '{ "type": "goods", "amount": 185000, "title": "iPhone 13 Pro", "sellerEmail": "seller@example.com" }'

# look up anyone's trust score — no auth
curl http://localhost:4600/v1/score/tunde@safepay.test

# embed their badge anywhere
<img src="http://localhost:4600/v1/score/usr_123/badge.svg" width="300" height="76">
```

| | |
|---|---|
| `POST /v1/escrows` | Create |
| `POST /v1/escrows/:id/fund` | Buyer funds it |
| `POST /v1/escrows/:id/deliver` | Seller marks delivered |
| `POST /v1/escrows/:id/release` | Buyer releases — irreversible |
| `POST /v1/escrows/:id/milestones/:mid/approve` | Partial release |
| `POST /v1/escrows/claim` | Join an in-person escrow by code |
| `POST /v1/disputes` | Raise a dispute (auto-triaged) |
| `GET /v1/score/:userId` | **Public** trust lookup |
| `GET /v1/score/:userId/badge.svg` | **Public** embeddable badge |

---

## Deployment

Frontend on Vercel, API on Render. The split is deliberate: the escrow ledger is
a file on disk, so the API needs a host that keeps one. On a serverless platform
the filesystem is ephemeral and every signup would vanish on the next request.

### 1. API → Render

The repo ships a blueprint. **New → Blueprint → pick this repo**, and
[`render.yaml`](render.yaml) provisions the service, mounts a 1 GB disk at
`/var/data`, and generates `JWT_SECRET` for you.

Then set one variable by hand once the frontend is live:

```
WEB_ORIGIN = https://<your-app>.vercel.app
```

Optionally add `GEMINI_API_KEY` — without it, dispute triage uses the
rule-based classifier and still works.

Seed the demo data from the Render shell:

```bash
npm run seed
```

> The free plan sleeps when idle, so the first request after a nap takes ~30s.
> Wake it before a live demo.

### 2. Frontend → Vercel

Set **Root Directory to `frontend`** — Vercel usually detects this itself.
[`frontend/vercel.json`](frontend/vercel.json) pins the install, build and output
paths *relative to that root*, plus the SPA rewrite, without which every deep link
would 404 on refresh. Leave Build & Development Settings in the dashboard on their
defaults: an override there saying `--prefix frontend` resolves to `frontend/frontend`
and the install fails. Add one environment variable:

```
VITE_API_URL = https://safepay-api.onrender.com
```

It is read at build time, so redeploy after changing it.

### Before real money

Set a real `JWT_SECRET`, swap `backend/src/store/index.js` for a `firebase-admin`
adapter (the interface is already Firestore-shaped), and connect settlement to
Wema virtual accounts in place of the simulated ledger.

---

## Submission checklist

- [x] Code committed
- [x] README with description, run instructions and architecture
- [x] Frontend builds clean (`vite build`)
- [x] Backend runs with zero configuration
- [x] OpenAPI reference served at `/docs`
- [x] Demo data and accounts seeded
- [ ] Frontend deployed — *add URL*
- [ ] Backend deployed — *add URL*
- [ ] Loom demo recorded — *add link*

---

<div align="center">
  <img src="brand/safepay-icon.svg" width="52" alt="">

  **SafePay** · Trusted payments, everywhere

  Hackaholics 7.0 — Wema Bank

</div>
