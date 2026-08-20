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

> Seeded accounts are pre-verified, so they sign straight in. There is no mailbox
> behind `@safepay.test` to collect a code from, and demanding one would lock the
> demo out of its own data. Accounts created through the signup form still have to
> clear the [email verification gate](#5-email-and-the-verification-gate) — and
> with no `KEPLARS_API_KEY` set, the code is printed to the API's console, so the
> flow is walkable locally with no email account at all.

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
│       ├── services/       escrowEngine · scoreEngine · aiTriage · fraud · ledger
│       │                   webhookDispatcher · otp · mailer · identity
│       ├── middleware/      auth (session JWT + Firebase ID token + API key) · rateLimiter
│       ├── lib/             crypto · money · errors · firebaseAdmin
│       └── store/           Firestore write-through, with a local JSON mirror
├── frontend/           React + Vite + Tailwind v4
│   └── src/
│       ├── pages/          landing · auth · dashboard · escrows · disputes · trust · developer · admin
│       ├── components/      design system + domain components
│       ├── context/         auth · theme · toasts
│       └── index.css        the design tokens
├── sdks/react/         @safepay/react — SafePayButton, TrustBadge, hooks
├── brand/              logo, in Wema's palette
├── firestore.rules     deny-all: nothing in the browser touches Firestore
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

**Storage is write-through, so the routes stay synchronous.** `store/index.js`
exposes a Firestore-shaped API (`collection(name).get/set/find/update`). Reads are
served from memory; writes land in memory, then go to Firestore in a coalesced
background batch and to an atomically-written JSON mirror. That is what lets
`users.get(id)` return a user rather than a promise — turning the whole codebase
async to reach Firestore would have been a rewrite of every route and service, for
no behavioural gain on a single node. A Firestore hiccup cannot fail an escrow
release: memory and the local mirror are already correct, and the next mutation of
that document re-sends it. With no credentials the mirror is the whole store, so a
clean clone boots with zero configuration — which is what a judge actually needs.

**Email verification is enforced by absence, not by a prompt.** Signup returns no
token at all; only `verify-email` mints one. See
[the verification gate](#5-email-and-the-verification-gate). Codes are hashed with
an HMAC keyed by `JWT_SECRET`, compared in constant time, single-use, and burned
after five attempts — a six-digit code is only 10⁶ wide, so the attempt ceiling is
what actually secures it.

**Firebase Auth is load-bearing, not decorative.** Every account gets a real Auth
record created with SafePay's own id as its uid, so the two systems need no mapping
table. `emailVerified` there tracks the OTP gate, disabling an account in the
console locks it out of the API, and the session middleware accepts a Firebase ID
token as readily as its own JWT — so adding Google or phone sign-in later touches
no middleware. Passwords are still verified locally against scrypt: the seeded demo
accounts have no Firebase records and judges must be able to sign into them, and it
keeps sign-in off the network path so an Identity Toolkit blip cannot lock everyone
out of a live escrow.

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
# sign up — note the 202 and the absence of a token
curl -X POST http://localhost:4600/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{ "name": "Ada Okonkwo", "email": "ada@example.com", "password": "correct-horse-battery" }'
# { "verificationRequired": true, "challengeId": "otp_...", "email": "a****@example.com",
#   "expiresInMinutes": 10 }

# exchange the emailed code for a session — the only way a new account gets one
curl -X POST http://localhost:4600/v1/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{ "challengeId": "otp_...", "code": "418203" }'
# { "token": "eyJ...", "user": { ..., "emailVerified": true } }

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
| `POST /v1/auth/signup` | Create an account — returns a challenge, **not** a token |
| `POST /v1/auth/verify-email` | Exchange the emailed code for a session |
| `POST /v1/auth/resend-code` | New code; invalidates the previous one |
| `POST /v1/auth/login` | Sign in — also fires an alert email |
| `POST /v1/escrows` | Create |
| `POST /v1/escrows/:id/fund` | Buyer funds it, from their SafePay balance |
| `POST /v1/escrows/:id/deliver` | Seller confirms delivery, with an optional photo |
| `GET /v1/escrows/:id/proof` | The delivery photo — both parties, and admins |
| `POST /v1/escrows/:id/release` | Buyer releases — irreversible |
| `POST /v1/escrows/:id/milestones/:mid/approve` | Partial release |
| `POST /v1/escrows/claim` | Join an in-person escrow by code |
| `GET /v1/wallet` | Balance, statement and payout account |
| `POST /v1/wallet/topups` | Open a mock Wema account for one transfer |
| `POST /v1/wallet/topups/:id/confirm` | "I have already sent it" |
| `PUT /v1/wallet/bank` | Set the bank account a withdrawal pays into |
| `POST /v1/wallet/withdrawals` | Withdraw to that account |
| `POST /v1/disputes` | Raise a dispute (auto-triaged) |
| `GET /v1/score/:userId` | **Public** trust lookup |
| `GET /v1/score/:userId/badge.svg` | **Public** embeddable badge |

---

## Deployment

Frontend on Vercel, API on Render. The split is deliberate: the API is a
long-lived process, which is what the webhook retry queue, the OTP sweeper and
the in-process rate limiters all assume. On a serverless platform each of those
would need re-architecting around a scheduler and an external store.

Deploying takes **four variables on Render** and one on Vercel:

| Where | Variable | Why |
|---|---|---|
| Render | `FIREBASE_SERVICE_ACCOUNT` | Firestore + Firebase Auth ([§4](#4-firebase-authentication-and-firestore)) |
| Render | `KEPLARS_API_KEY` | Verification codes and sign-in alerts ([§5](#5-email-and-the-verification-gate)) |
| Render | `MAIL_FROM` | Optional — defaults to your connected Keplars sender |
| Render | `APP_URL` | The frontend URL, for buttons inside emails |
| Render | `WEB_ORIGIN` | CORS allow-list — the frontend URL |
| Vercel | `VITE_API_URL` | Where the API lives |

`JWT_SECRET` is generated for you by the blueprint. Everything else has a working
default.

### 1. API → Render

The repo ships a blueprint. **New → Blueprint → pick this repo**, and
[`render.yaml`](render.yaml) provisions the service, mounts a 1 GB disk at
`/var/data`, and generates `JWT_SECRET` for you.

> Create the service **from the blueprint**, not with New → Web Service.
> A manually-created service ignores `render.yaml` entirely, so its Root
> Directory stays at the repo root — where `npm start` does not exist, because
> that script lives in [`backend/package.json`](backend/package.json). The
> deploy then fails with `Missing script: "start"` followed by a port-scan
> timeout. If you already made one by hand, set **Root Directory** to
> `backend` and add the disk and variables below yourself.

Then set one variable by hand once the frontend is live:

```
WEB_ORIGIN = https://<your-app>.vercel.app
```

Optionally add `GEMINI_API_KEY` — without it, dispute triage uses the
rule-based classifier and still works.

Seed the demo data. On a paid instance, from the Render shell:

```bash
npm run seed
```

The free plan has no shell, so `npm run seed` cannot be run by hand. The API
lays the demo accounts down at boot instead, and does it **additively**: it
creates the `@safepay.test` accounts that are missing, repairs the password and
verified flag on the ones already there, and writes the seeded escrow history
only when those accounts have none at all. Real accounts and real escrows are
never touched, so it is safe on every restart.

This is on by default. It replaced an earlier `SEED_ON_EMPTY` guard that only
fired against a completely empty database — which meant the first genuine signup
permanently locked `admin@safepay.test` out of its own deployment and left
nobody able to resolve a dispute.

Turn it off before treating this as a real deployment, because the accounts it
creates share one published password and one of them is an administrator:

```
DEMO_ACCOUNTS = false
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

> **If you skip this variable, the build does not break — it switches to demo
> mode.** See below. That is deliberate: a static host answers `POST /v1/auth/login`
> with a 405, so an unconfigured deployment would otherwise be a site where no
> account can sign in.

### 3. Demo mode — the deployed link works with no backend

A production build with no `VITE_API_URL` serves the entire app from a seeded
database in the visitor's own browser
([`frontend/src/lib/demo/`](frontend/src/lib/demo/)). The demo accounts sign in,
escrows fund, deliver and release, disputes get triaged, SafeScore recomputes,
and the admin console fills up — with nothing deployed and nothing sent anywhere.
State persists in `localStorage`, so a reload does not undo a demo.

The escrow state machine, SafeScore weights and dispute classifier are ported
from `backend/src/services/`, so the numbers match what the real API returns —
the seeded scores come out at Ada 57, Tunde 68, Amara 30, Kelechi 5, exactly as
the table above says.

Control it explicitly with `VITE_DEMO_MODE`:

| Value | Behaviour |
|---|---|
| *(unset)* | On for a production build with no `VITE_API_URL`; off otherwise |
| `true` | Always on — useful for previewing the demo locally |
| `false` | Always off, so a backend outage surfaces as an error instead of fake data |

**Set `VITE_DEMO_MODE=false` once the API is live**, so an outage is visible
rather than silently papered over.

### 4. Firebase: Authentication and Firestore

Both run server-side, through `firebase-admin`. The API holds the service
account; the browser never talks to Firestore at all.

**Set one variable on Render** — the service-account JSON, base64-encoded so the
private key's newlines cannot be mangled by a dashboard paste:

```bash
node -e "console.log(Buffer.from(require('fs').readFileSync('serviceAccountKey.json','utf8')).toString('base64'))"
```

```
FIREBASE_SERVICE_ACCOUNT = <that base64 string>
```

Raw JSON on one line works too — [`backend/src/lib/firebaseAdmin.js`](backend/src/lib/firebaseAdmin.js)
accepts either, and also takes `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` +
`FIREBASE_PRIVATE_KEY` separately if you prefer three short values to one long one.

**Two things must be switched on in the Firebase console**, or the API falls back
to its local store and logs why:

1. **Firestore Database → Create database.** The Cloud Firestore API is off on a
   new project, and the SDK's error for that is a bare `PERMISSION_DENIED`.
2. **Authentication → Sign-in method → Email/Password → Enable.**

Then **publish [`firestore.rules`](firestore.rules)**, which denies all client
access. That is the correct rule here rather than a placeholder: nothing in the
browser reads Firestore, and the Admin SDK bypasses rules entirely — so deny-all
costs the app nothing. Leaving Firestore in test mode would be the largest hole in
the deployment, because the public web config in the bundle is enough for anyone
to point a Firestore client at the project and read the whole ledger.

| Piece | Where | What it does |
|---|---|---|
| **Firestore** | [`backend/src/store/index.js`](backend/src/store/index.js) | Durable source of truth. Hydrated into memory at boot, then written through on every mutation — which is what keeps every route and service synchronous. |
| **Firebase Auth** | [`backend/src/services/identity.js`](backend/src/services/identity.js) | A real Auth record per account, created with SafePay's own id as its uid so no mapping table is needed. `emailVerified` mirrors the OTP gate; disabling an account in the console locks it out here. |
| **ID tokens** | [`backend/src/middleware/auth.js`](backend/src/middleware/auth.js) | The API accepts a Firebase ID token from any client SDK as well as its own session JWT, so adding Google or phone sign-in later needs no change to the middleware. |
| **Analytics** | [`frontend/src/lib/firebase.js`](frontend/src/lib/firebase.js) | The only Firebase the browser touches. Loaded lazily after first paint, guarded by `isSupported()` — `getAnalytics()` throws in browsers without cookies or IndexedDB, and a measurement pixel must never blank a payments app. |

The web config is not a secret; Firebase ships it in every client bundle and
enforces access through Security Rules. It is still read from `VITE_FIREBASE_*`
(see [`frontend/.env.example`](frontend/.env.example)) so a fork can point at its
own project without editing source. Leave `VITE_FIREBASE_MEASUREMENT_ID` empty to
switch Analytics off entirely.

**With no Firebase credentials the API still boots** and serves everything from
its local JSON file. That is what lets a judge clone and run with no secrets. Check
which mode a deploy is in at `/health`:

```json
{ "store": { "backend": "firestore", "durable": true },
  "firebase": { "connected": true, "projectId": "safepay-6227f" },
  "email": { "provider": "keplars", "configured": true } }
```

`store.backend` reports what the store is *actually doing*, not what it was
configured to do — the two diverge exactly when it matters, and `durable: false`
with a `reason` is how an unenabled Firestore shows up.

### 5. Email and the verification gate

Transactional email goes through **Keplars**. Two variables on Render:

```
KEPLARS_API_KEY = kms_<workspaceId>.live_<secret>
APP_URL         = https://<your-app>.vercel.app
```

> **`MAIL_FROM` is optional and best left unset.** Omit it and Keplars sends as
> the mailbox connected to the workspace — the Gmail / Workspace / Outlook
> account you linked over OAuth, or an address on a domain you verified. Set it
> only to choose between several verified senders; an address Keplars does not
> recognise is rejected outright rather than substituted, which is the easiest
> way to end up with a signup that never receives its code.

Keplars splits delivery into priority tiers, and each message asks for the one it
needs: the OTP goes out `instant` (0-5s), because a code that arrives after the
user gives up is the same as no code; the sign-in alert `high`; the welcome
`async`. Nothing here uses the SDK — one `fetch` to
`POST /api/v1/send-email/{tier}` with a 12-second ceiling and no retries, so a
struggling mail API can never hold a signup open.

Every template lives in [`backend/src/services/mailer.js`](backend/src/services/mailer.js).
Three of them belong to the account itself:

| Email | Trigger |
|---|---|
| **Verification code** | Signup, and any login by an account that never verified |
| **Sign-in alert** | Every successful sign-in — with time, IP and user agent |
| **Welcome** | Once, the moment an address is proven |

The rest follow the money. Every escrow transition mails **both parties**, each in
their own words — "your payment is held" and "you can start work" are the same
funding event seen from opposite sides, and sending either party the other's
version is worse than sending nothing:

| Event | Buyer hears | Seller hears |
|---|---|---|
| `created` | You opened an escrow with *X* | *X* opened an escrow with you |
| `claimed` | You joined *X*'s escrow | Your code was claimed |
| `funded` | Your payment is held until you release it | Safe to start — the money is out of their hands |
| `delivered` | *X* says this is delivered | Delivery recorded |
| `milestone` | You approved *M*, *n* of *m* done | *M* paid, the rest stays in escrow |
| `released` | This escrow is complete | You have been paid, net of fee |
| `disputed` | Nothing moves until this is resolved | Nothing moves until this is resolved |
| `refunded` | Your money is coming back | Refunded to the buyer |
| `cancelled` | Cancelled before funding, no money moved | Cancelled before funding, no money moved |

**A seller invited by bare email address gets all of it.** `POST /v1/escrows`
accepts a `sellerEmail` for someone who has never used SafePay, and that address
is the one that most needs to hear — nobody signs up for a payment they were
never told about. Their copy swaps the dashboard button for a signup link, since
a protected route would only bounce them to a login they cannot complete.

[`escrowNotifier.js`](backend/src/services/escrowNotifier.js) sits between the
engine and the mailer: it resolves who the two parties are and queues the mail
through `sendInBackground`, never awaited. An escrow transition is a financial
state change that has already happened by the time mail is attempted — it must
not be able to fail, or even slow down, because a mail API is having a bad
minute. This is the human-facing twin of
[`webhookDispatcher.js`](backend/src/services/webhookDispatcher.js), which tells
*machines* about the same moments; `cancelled` and `claimed` are email-only,
because neither was ever in the published webhook event list and adding a topic
partners have not subscribed to is a breaking change dressed up as a feature.

**Email verification is compulsory, and enforced by absence rather than by a
prompt.** `POST /v1/auth/signup` answers `202` and issues *no session token*; the
only route that mints one for a new account is `POST /v1/auth/verify-email`. A
correct password on an unverified account gets the same `202` and a fresh code, so
there is no path to a session that skips the mailbox. The code itself
([`backend/src/services/otp.js`](backend/src/services/otp.js)) is six digits from
`crypto.randomInt`, stored only as an HMAC-SHA256 keyed by `JWT_SECRET`, compared
in constant time, single-use, valid ten minutes, and burned after five wrong
attempts. `sendInBackground` keeps the sign-in alert off the response path, so a
slow mail provider cannot slow down a login.

`npm --prefix backend run test:auth` asserts all of that — 40 checks, most of them
asserting that something is *impossible*.

**With no `KEPLARS_API_KEY` the mailer prints codes to the server log** instead of
sending, so a credential-less clone can still complete a signup. Never run a
production deploy that way: the log then contains live codes. `/health` reports
`email.configured` so you can tell at a glance.

### Before real money

Set a real `JWT_SECRET`, publish [`firestore.rules`](firestore.rules), verify a
sending domain in Keplars, and connect settlement to Wema virtual accounts in place
of the simulated ledger.

---

## Submission checklist

- [x] Code committed
- [x] README with description, run instructions and architecture
- [x] Frontend builds clean (`vite build`)
- [x] Backend runs with zero configuration
- [x] OpenAPI reference served at `/docs`
- [x] Demo data and accounts seeded
- [x] Firebase Auth + Firestore wired, credentials from the environment only
- [x] Compulsory email OTP on signup, alert email on every sign-in
- [x] `firestore.rules` denies all client access — publish before going live
- [x] Tests green — `npm --prefix backend run test:auth` (40) and `test:e2e` (20)
- [x] Frontend deployed — https://safepay-hackaholics-nu.vercel.app
- [x] Deployed link usable with no backend (demo mode)
- [ ] Backend deployed — *add URL*
- [ ] Loom demo recorded — *add link*

---

<div align="center">
  <img src="brand/safepay-icon.svg" width="52" alt="">

  **SafePay** · Trusted payments, everywhere

  Hackaholics 7.0 — Wema Bank

</div>
