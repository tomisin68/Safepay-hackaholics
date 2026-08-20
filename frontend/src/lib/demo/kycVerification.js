/**
 * Mock identity verification — demo-mode mirror of
 * backend/src/services/kycVerification.js. See that file for the full
 * rationale: no real provider is connected, this is advisory only, and an
 * admin action is always what actually decides a submission.
 */

const REJECT_NAME_PATTERN = /\btest.?reject\b/i;
const REJECT_ID_PATTERN = /^(\d)\1{10}$/;

export function runMockVerification({ legalName, idType, idNumber }) {
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
