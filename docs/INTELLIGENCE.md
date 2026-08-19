# SafePay Intelligence

An AI-assisted risk layer over existing SafePay transaction data. It is not a
chatbot and it does not decide anything on its own — it reads a real escrow
(or dispute), computes deterministic risk signals from SafePay's own data, and
returns a structured, explainable assessment.

## How the risk calculation works

1. **Signals** (`backend/src/services/intelligence.js: collectSignals`) — pulled
   straight from the store, nothing invented: the transaction amount, the
   seller's completed transactions and average transaction size, the ratio of
   this amount to that average, the seller's dispute count/rate (same
   evidence-scaled formula SafeScore uses), verification tier, account age,
   the buyer's dispute history, and any open fraud flags on either party.
2. **Deterministic rule engine** (`ruleAssessment`) — an additive, bounded
   point system, the same style as `scoreEngine.js` and `fraud.js`: each
   triggered signal adds points and a plain-language reason. The total maps to
   `riskScore` (0–100) and `riskLevel` (`LOW` < 30 ≤ `MEDIUM` < 60 ≤ `HIGH`).
   **This step alone is the entire feature — the score and level never come
   from the AI.**
3. **AI narration** (optional) — when `GEMINI_API_KEY` is set, the same
   signals object (never raw text, never the user's own words) is sent to
   Gemini with instructions to explain the *already-decided* score using only
   those facts, and to avoid claiming fraud detection. It may rewrite
   `reasons` and `recommendation` for clarity; it cannot touch the score or
   level. If the key is absent, the call times out, fails, or the response
   doesn't parse into the expected shape, the rule engine's own `reasons`/
   `recommendation` ship unchanged — the feature never depends on the AI
   provider being up.

The same rule engine is ported to `frontend/src/lib/demo/engine.js` so the
public demo build (no backend attached) shows identical, real signals rather
than a mock.

## Environment variable

No new variable is required — SafePay Intelligence reuses the `GEMINI_API_KEY`
already used for dispute triage (`backend/.env.example`). Leave it unset and
every endpoint below still works, just without AI-written explanations.

## Running it locally

```bash
cd backend
npm install
npm run seed     # demo accounts + escrow/dispute history to score against
npm run dev       # http://localhost:4600

cd ../frontend
npm install
npm run dev       # proxies /v1 to the backend above
```

Sign in as `ada@safepay.test` / `password123`, open any escrow, and the
**SafePay Intelligence** card in the sidebar shows the live assessment.

## API

### `GET /v1/intelligence/escrows/:id/risk`

Auth: dashboard session or API key, and the caller must be the buyer or
seller on that escrow (same rule as `GET /v1/escrows/:id`).

```
GET /v1/intelligence/escrows/esc_JbRmBoCmk1JrSKft/risk
Authorization: Bearer <token>
```

```json
{
  "risk": {
    "riskLevel": "MEDIUM",
    "riskScore": 42,
    "reasons": [
      "Transaction amount is 6.1x the seller's average transaction size.",
      "Seller has not completed identity verification."
    ],
    "recommendation": "Consider requesting additional verification or using a milestone-based release.",
    "signals": { "...": "the objective facts the score was computed from" },
    "source": "rules",
    "assessedAt": "2026-08-19T10:15:00.000Z"
  }
}
```

### `POST /v1/intelligence/dispute`

Auth: either party to the dispute, or an admin. Body: `{ "disputeId": "dsp_..." }`.

```json
{
  "assessment": "This dispute carries high severity signals and the underlying transaction shows medium risk. A human reviewer should confirm the outcome — this assessment does not release or refund funds.",
  "confidence": 0.65,
  "keyFindings": ["Dispute auto-classified as \"non delivery\" (high severity)."],
  "recommendation": "ESCALATE_TO_HUMAN_REVIEW",
  "source": "rules",
  "assessedAt": "2026-08-19T10:16:00.000Z"
}
```

Full request/response schemas: `docs/openapi.yaml` (tag `Intelligence`), served
at `/docs` alongside the rest of the API.

## Limitation

SafePay Intelligence provides risk signals and recommendations — it does not
authorize, block, or settle a transaction, and it does not independently
decide a dispute's financial outcome. Escrow releases go through the existing
escrow state machine; dispute payouts still require an admin to call
`POST /v1/disputes/:id/resolve`. Nothing here bypasses those paths.
