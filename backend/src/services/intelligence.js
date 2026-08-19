/**
 * SafePay Intelligence — transaction risk assessment.
 *
 * The rule: the AI never invents a fact. Every number that drives a decision
 * (the risk score, the risk level) comes from a deterministic pass over real
 * SafePay data — the same kind of explainable, additive scoring used by
 * SafeScore (scoreEngine.js) and fraud detection (fraud.js). If GEMINI_API_KEY
 * is absent, unreachable, or returns something we cannot validate, the
 * deterministic result ships as-is — the feature never depends on a third
 * party being up.
 *
 * What the AI is allowed to do is narrower: given the same signals object the
 * rule engine used (never raw free text, never the score itself), it may
 * rewrite the `reasons` and `recommendation` into clearer language. It cannot
 * change the score or the level, and the prompt forbids it from claiming to
 * have "detected fraud" — SafePay surfaces risk signals, not verdicts.
 */

import { escrows, users, disputes, fraudFlags } from '../store/index.js';
import { toNaira } from '../lib/money.js';
import { notFound } from '../lib/errors.js';
import * as engine from './escrowEngine.js';

/* ------------------------------------------------------------------ *
 * Signal collection — objective facts pulled from real SafePay data.
 * ------------------------------------------------------------------ */

function accountAgeDays(user) {
  if (!user) return null;
  return Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 864e5);
}

/**
 * Mirrors the evidence-scaled dispute rate used by scoreEngine's reliability
 * component, so a single early dispute reads the same way here as it does in
 * SafeScore rather than inventing a second definition of "risky".
 */
function transactionStatsFor(userId) {
  if (!userId) return { completed: 0, settled: 0, avgAmountKobo: 0, disputesAgainst: 0, disputeRatePct: 0 };

  const involved = escrows.find((e) => e.buyerId === userId || e.sellerId === userId);
  const settled = involved.filter((e) => ['released', 'refunded'].includes(e.status));
  const completed = involved.filter((e) => e.status === 'released');
  const avgAmountKobo = completed.length
    ? Math.round(completed.reduce((s, e) => s + e.amountKobo, 0) / completed.length)
    : 0;
  const disputesAgainst = disputes.find((d) => d.againstId === userId).length;
  const disputeRatePct = settled.length
    ? Math.round((disputesAgainst / (settled.length + 3)) * 1000) / 10
    : 0;

  return { completed: completed.length, settled: settled.length, avgAmountKobo, disputesAgainst, disputeRatePct };
}

export function collectSignals(escrow) {
  const buyer = escrow.buyerId ? users.get(escrow.buyerId) : null;
  const seller = escrow.sellerId ? users.get(escrow.sellerId) : null;

  const sellerStats = transactionStatsFor(escrow.sellerId);
  const buyerStats = transactionStatsFor(escrow.buyerId);

  const amountToAverageRatio = sellerStats.avgAmountKobo > 0
    ? Math.round((escrow.amountKobo / sellerStats.avgAmountKobo) * 100) / 100
    : null;

  const recentActivityFlags = fraudFlags
    .find((f) => f.status === 'open' && [escrow.buyerId, escrow.sellerId].includes(f.userId))
    .map((f) => f.label);

  return {
    transaction: {
      amountKobo: escrow.amountKobo,
      amountNaira: toNaira(escrow.amountKobo),
      type: escrow.type,
      status: escrow.status,
    },
    seller: seller
      ? {
          onSafePay: true,
          verificationTier: seller.verificationTier ?? 'none',
          accountAgeDays: accountAgeDays(seller),
          completedTransactions: sellerStats.completed,
          settledTransactions: sellerStats.settled,
          averageTransactionAmountKobo: sellerStats.avgAmountKobo,
          amountToAverageRatio,
          disputeCount: sellerStats.disputesAgainst,
          disputeRatePct: sellerStats.disputeRatePct,
          safeScore: seller.safeScore ?? 0,
          scoreTier: seller.scoreTier ?? 'new',
        }
      : { onSafePay: false, invitedEmail: escrow.sellerEmail ?? null },
    buyer: buyer
      ? {
          verificationTier: buyer.verificationTier ?? 'none',
          accountAgeDays: accountAgeDays(buyer),
          completedTransactions: buyerStats.completed,
          disputeCount: buyerStats.disputesAgainst,
          disputeRatePct: buyerStats.disputeRatePct,
          safeScore: buyer.safeScore ?? 0,
          scoreTier: buyer.scoreTier ?? 'new',
        }
      : null,
    recentActivityFlags,
  };
}

/* ------------------------------------------------------------------ *
 * Deterministic risk engine
 *
 * Additive and bounded, like SafeScore's breakdown — every point is traced
 * to the reason pushed alongside it, so the score is always explainable.
 * ------------------------------------------------------------------ */

function levelFor(score) {
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

export function ruleAssessment(signals) {
  const { seller, buyer, recentActivityFlags } = signals;
  let points = 0;
  const reasons = [];

  if (!seller.onSafePay) {
    points += 20;
    reasons.push('Seller has not yet joined SafePay, so there is no transaction history to evaluate.');
  } else {
    if (seller.completedTransactions === 0) {
      points += 15;
      reasons.push("Seller has no completed transactions on SafePay yet.");
    } else if (seller.completedTransactions >= 3 && seller.amountToAverageRatio != null) {
      if (seller.amountToAverageRatio >= 5) {
        points += 30;
        reasons.push(`Transaction amount is ${seller.amountToAverageRatio.toFixed(1)}x the seller's average transaction size.`);
      } else if (seller.amountToAverageRatio >= 2.5) {
        points += 15;
        reasons.push(`Transaction amount is notably above the seller's average (${seller.amountToAverageRatio.toFixed(1)}x).`);
      }
    }

    if (seller.disputeCount > 0) {
      if (seller.settledTransactions >= 3 && seller.disputeRatePct >= 20) {
        points += 25;
        reasons.push(`Seller has a history of disputes (${seller.disputeRatePct}% of past settled transactions).`);
      } else {
        points += 10;
        reasons.push('Seller has at least one prior dispute on record.');
      }
    }

    if (seller.verificationTier === 'none') {
      points += 10;
      reasons.push('Seller has not completed identity verification.');
    }

    if (seller.accountAgeDays != null && seller.accountAgeDays < 3) {
      points += 10;
      reasons.push('Seller account was created very recently.');
    }
  }

  if (buyer && buyer.disputeCount > 0) {
    points += 8;
    reasons.push('Buyer has previously been the subject of a dispute.');
  }

  if (recentActivityFlags.length > 0) {
    points += 12;
    reasons.push('SafePay fraud monitoring has flagged unusual recent activity on this account.');
  }

  const riskScore = Math.max(0, Math.min(100, points));
  const riskLevel = levelFor(riskScore);

  if (reasons.length === 0) {
    reasons.push('No notable risk signals were found for this transaction.');
  }

  const recommendation = riskLevel === 'HIGH'
    ? 'Request additional verification from the seller, and consider a milestone-based release for extra protection.'
    : riskLevel === 'MEDIUM'
      ? 'Consider requesting additional verification or using a milestone-based release.'
      : 'No additional verification is required based on current signals.';

  return { riskScore, riskLevel, reasons, recommendation };
}

/* ------------------------------------------------------------------ *
 * AI narration — Gemini, same provider and fallback contract as
 * aiTriage.js. Only touches wording; never the score or level.
 * ------------------------------------------------------------------ */

const RISK_PROMPT = `You are SafePay's transaction risk assistant. SafePay is an escrow platform in Nigeria.

You will receive a JSON object with:
- "signals": objective facts SafePay already computed from real transaction and account data.
- "computedRiskScore" (0-100) and "computedRiskLevel" (LOW, MEDIUM, HIGH): a risk score and level SafePay already calculated deterministically from those signals.

Your only job is to explain the result in plain language for the buyer, using nothing but the facts inside "signals". Rules:
- Do not invent any fact that is not present in "signals".
- Do not change the risk score or risk level — treat them as fixed and already decided.
- Never claim to have detected fraud or guarantee an outcome. Use careful language such as "risk signal", "unusual activity", or "additional verification recommended".

Respond with ONLY minified JSON, no markdown fence:
{"reasons":["<one short factual sentence per notable signal, 2-4 items>"],"recommendation":"<one or two practical sentences of next steps>"}`;

async function callGemini(systemPrompt, payload, maxOutputTokens) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  // gemini-2.0-flash was retired by Google (404s); gemini-3.6-flash is its
  // replacement. It's a reasoning model — it spends part of maxOutputTokens on
  // hidden "thinking" tokens before the visible answer, so callers need a
  // budget generous enough to leave room for the actual JSON reply.
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens },
      }),
    });

    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('empty response');

    return { parsed: JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim()), model };
  } catch (err) {
    console.warn('[intelligence] falling back to rules:', err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function geminiExplainRisk(signals, rule) {
  const result = await callGemini(RISK_PROMPT, {
    signals,
    computedRiskScore: rule.riskScore,
    computedRiskLevel: rule.riskLevel,
  }, 2000);
  if (!result) return null;

  const { parsed, model } = result;
  const reasons = Array.isArray(parsed.reasons)
    ? parsed.reasons.map((r) => String(r).slice(0, 220)).filter(Boolean).slice(0, 6)
    : null;
  const recommendation = typeof parsed.recommendation === 'string' && parsed.recommendation.trim()
    ? parsed.recommendation.slice(0, 320)
    : null;

  if (!reasons?.length || !recommendation) return null;
  return { reasons, recommendation, source: `gemini:${model}` };
}

/* ------------------------------------------------------------------ *
 * Public entry point
 * ------------------------------------------------------------------ */

export async function assessTransactionRisk(escrowId) {
  const escrow = engine.getOrThrow(escrowId);
  const signals = collectSignals(escrow);
  const rule = ruleAssessment(signals);
  const ai = await geminiExplainRisk(signals, rule);

  return {
    riskLevel: rule.riskLevel,
    riskScore: rule.riskScore,
    reasons: ai?.reasons ?? rule.reasons,
    recommendation: ai?.recommendation ?? rule.recommendation,
    signals,
    source: ai?.source ?? 'rules',
    assessedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * Dispute intelligence — advisory only.
 *
 * This never picks a financial outcome. `recommendation` is limited to two
 * values, both of which leave the money exactly where it already is
 * (disputing an escrow freezes it independently of this endpoint) — the
 * actual release/refund decision stays with admin.resolve, same as today.
 * ------------------------------------------------------------------ */

const DISPUTE_PROMPT = `You are SafePay's dispute intelligence assistant. SafePay is an escrow platform in Nigeria.

You will receive a JSON object with:
- "signals": the dispute's auto-triage classification and the underlying transaction's already-computed risk assessment — both derived from real SafePay data.
- "computedRecommendation": one of "KEEP_FUNDS_FROZEN" or "ESCALATE_TO_HUMAN_REVIEW", already decided deterministically.

Your only job is to write a short, plain-language assessment and key findings using nothing but the facts inside "signals". Rules:
- Do not invent any fact that is not present in "signals".
- Do not change "computedRecommendation" — repeat it back exactly as given.
- You are not deciding who receives the money. A human reviewer makes that call. Never say the funds should be released or refunded to a specific party.
- Never claim certainty of fraud; use language like "risk signal" or "recommend review".

Respond with ONLY minified JSON, no markdown fence:
{"assessment":"<1-2 sentences>","keyFindings":["<short factual finding>", ...max 5],"recommendation":"<computedRecommendation, unchanged>"}`;

function severityWeight(severity) {
  return { low: 10, medium: 30, high: 60, critical: 90 }[severity] ?? 30;
}

function ruleDisputeAssessment(dispute, txRisk) {
  const category = (dispute.ai?.category ?? 'other').replace(/_/g, ' ');
  const severity = dispute.ai?.severity ?? 'medium';

  const keyFindings = [`Dispute auto-classified as "${category}" (${severity} severity).`];
  if (txRisk.riskLevel !== 'LOW') {
    keyFindings.push(`The underlying transaction already carried ${txRisk.riskLevel} risk: ${txRisk.reasons[0]}`);
  }
  keyFindings.push(...txRisk.reasons.slice(txRisk.riskLevel !== 'LOW' ? 1 : 0));

  const severityScore = severityWeight(severity);
  const confidence = Math.round(Math.max(0, Math.min(100, (severityScore + txRisk.riskScore) / 2))) / 100;

  const recommendation = ['critical', 'high'].includes(severity) || txRisk.riskLevel === 'HIGH'
    ? 'ESCALATE_TO_HUMAN_REVIEW'
    : 'KEEP_FUNDS_FROZEN';

  const assessment = `This dispute carries ${severity} severity signals and the underlying transaction shows ${txRisk.riskLevel.toLowerCase()} risk. A human reviewer should confirm the outcome — this assessment does not release or refund funds.`;

  return { assessment, confidence, keyFindings: keyFindings.slice(0, 5), recommendation };
}

async function geminiExplainDispute(signals, rule) {
  const result = await callGemini(DISPUTE_PROMPT, {
    signals,
    computedRecommendation: rule.recommendation,
  }, 2000);
  if (!result) return null;

  const { parsed, model } = result;
  const keyFindings = Array.isArray(parsed.keyFindings)
    ? parsed.keyFindings.map((f) => String(f).slice(0, 220)).filter(Boolean).slice(0, 5)
    : null;
  const assessment = typeof parsed.assessment === 'string' && parsed.assessment.trim()
    ? parsed.assessment.slice(0, 400)
    : null;
  // The recommendation is never taken from the model — only ever the value we computed.
  if (!keyFindings?.length || !assessment) return null;
  return { assessment, keyFindings, source: `gemini:${model}` };
}

export async function assessDisputeRisk(disputeId) {
  const dispute = disputes.get(disputeId);
  if (!dispute) throw notFound('Dispute not found.');

  const escrow = engine.getOrThrow(dispute.escrowId);
  const txRisk = await assessTransactionRisk(escrow.id);
  const rule = ruleDisputeAssessment(dispute, txRisk);

  const disputeSignals = {
    dispute: {
      category: dispute.ai?.category ?? 'other',
      severity: dispute.ai?.severity ?? 'medium',
      triageConfidence: dispute.ai?.confidence ?? null,
      raisedByRole: dispute.raisedByRole,
      status: dispute.status,
    },
    transaction: { riskLevel: txRisk.riskLevel, riskScore: txRisk.riskScore, reasons: txRisk.reasons },
  };
  const ai = await geminiExplainDispute(disputeSignals, rule);

  return {
    assessment: ai?.assessment ?? rule.assessment,
    confidence: rule.confidence,
    keyFindings: ai?.keyFindings ?? rule.keyFindings,
    recommendation: rule.recommendation,
    source: ai?.source ?? 'rules',
    assessedAt: new Date().toISOString(),
  };
}
