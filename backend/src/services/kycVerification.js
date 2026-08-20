/**
 * Mock identity verification.
 *
 * SafePay has no real KYC/identity provider wired up for this build — no NIN,
 * BVN, or passport number here is ever checked against a government database
 * or any external service. This module exists so that gap has a clean,
 * single seam: it takes the same shape of input a real provider integration
 * would (the submitted identity details) and returns the same shape of
 * output (a decision plus a reason), so swapping the body of
 * `runMockVerification` for a real API call is a one-file change — nothing
 * in kyc.js or the routes needs to know the difference.
 *
 * The decision here is advisory only. It is never enough on its own to move
 * a KYC submission to `verified` or `rejected` — an administrator still has
 * to act, via POST /v1/admin/kyc/:userId/approve|reject. That is what makes
 * this safe to call "mock": it can flag something suspicious for a human to
 * look at, but it can never certify anyone's identity.
 */

/**
 * A small number of obvious, documented triggers so a demo can reliably show
 * both outcomes without needing a real bad actor. Nothing here resembles a
 * genuine fraud heuristic — it is a light switch, not a fraud model.
 */
const REJECT_NAME_PATTERN = /\btest.?reject\b/i;
const REJECT_ID_PATTERN = /^(\d)\1{10}$/; // eleven of the same digit, e.g. 00000000000

/**
 * @param {{ legalName: string, idType: string, idNumber: string }} submission
 * @returns {Promise<{ decision: 'needs_review' | 'rejected', reason: string, source: 'mock' }>}
 */
export async function runMockVerification({ legalName, idType, idNumber }) {
  const flagged = REJECT_NAME_PATTERN.test(legalName ?? '') || REJECT_ID_PATTERN.test(idNumber ?? '');

  if (flagged) {
    return {
      decision: 'rejected',
      reason: 'Mock verification flagged this submission for a demo trigger. This is not a real identity check.',
      source: 'mock',
    };
  }

  return {
    decision: 'needs_review',
    reason: `No identity provider is connected for ${idType ?? 'this document type'}. An administrator must review this submission manually.`,
    source: 'mock',
  };
}
