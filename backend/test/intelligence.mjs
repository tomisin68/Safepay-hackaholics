/**
 * SafePay Intelligence — transaction risk + dispute assessment.
 *
 * Runs against whatever GEMINI_API_KEY is (or isn't) set in the environment
 * the API was started with, so it never asserts on `source` — the point of
 * the rule-based fallback is that the shape of the response is identical
 * either way. What it does assert is the contract: valid enum values, bounded
 * scores, non-empty explanations, and that access control matches the escrow
 * and dispute routes it piggybacks on.
 *
 * Run the API first, then:  node test/intelligence.mjs
 */
const API = process.env.SAFEPAY_API || 'http://localhost:4600';
let pass = 0, fail = 0;

const call = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, json };
};

const check = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${detail}`); }
};

const login = async (email) =>
  (await call('/v1/auth/login', { method: 'POST', body: { email, password: 'password123' } })).json?.token;

const ada = await login('ada@safepay.test');
const chidi = await login('chidi@safepay.test');
const tunde = await login('tunde@safepay.test');
check('login works for the accounts this suite needs', ada && chidi && tunde);

console.log('\n== transaction risk ==');

let r = await call('/v1/escrows', { method: 'POST', token: ada, body: {
  type: 'goods', amount: 25000, title: 'Intelligence test item', sellerEmail: 'chidi@safepay.test',
}});
const escrow = r.json?.escrow;
check('escrow created for the risk check', r.status === 201 && Boolean(escrow?.id));

r = await call(`/v1/intelligence/escrows/${escrow.id}/risk`, { token: ada });
const risk = r.json?.risk;
check('risk endpoint returns 200', r.status === 200);
check('riskLevel is one of LOW|MEDIUM|HIGH', ['LOW', 'MEDIUM', 'HIGH'].includes(risk?.riskLevel), risk?.riskLevel);
check('riskScore is a number 0-100', typeof risk?.riskScore === 'number' && risk.riskScore >= 0 && risk.riskScore <= 100, risk?.riskScore);
check('reasons is a non-empty array', Array.isArray(risk?.reasons) && risk.reasons.length > 0);
check('recommendation is a non-empty string', typeof risk?.recommendation === 'string' && risk.recommendation.length > 0);
check('signals carry the transaction amount, not just a verdict', risk?.signals?.transaction?.amountKobo === escrow.amountKobo);

r = await call(`/v1/intelligence/escrows/${escrow.id}/risk`, { token: tunde });
check('non-party is blocked from the risk assessment', r.status === 403);

r = await call('/v1/intelligence/escrows/esc_does_not_exist/risk', { token: ada });
check('unknown escrow returns 404', r.status === 404);

r = await call(`/v1/intelligence/escrows/${escrow.id}/risk`);
check('unauthenticated request is rejected', r.status === 401);

console.log('\n== dispute intelligence (advisory only) ==');

await call(`/v1/escrows/${escrow.id}/fund`, { method: 'POST', token: ada });
r = await call('/v1/disputes', { method: 'POST', token: ada, body: {
  escrowId: escrow.id,
  reason: 'The item never arrived and the seller stopped responding to messages after payment.',
}});
const dispute = r.json?.dispute;
check('dispute raised for the intelligence check', r.status === 201 && Boolean(dispute?.id));

r = await call('/v1/intelligence/dispute', { method: 'POST', token: ada, body: { disputeId: dispute.id } });
const assessment = r.json;
check('dispute assessment returns 200', r.status === 200);
check('assessment text is present', typeof assessment?.assessment === 'string' && assessment.assessment.length > 0);
check('confidence is a number between 0 and 1', typeof assessment?.confidence === 'number' && assessment.confidence >= 0 && assessment.confidence <= 1, assessment?.confidence);
check('keyFindings is a non-empty array', Array.isArray(assessment?.keyFindings) && assessment.keyFindings.length > 0);
check(
  'recommendation never names a payout — advisory only',
  ['KEEP_FUNDS_FROZEN', 'ESCALATE_TO_HUMAN_REVIEW'].includes(assessment?.recommendation),
  assessment?.recommendation,
);

r = await call('/v1/intelligence/dispute', { method: 'POST', token: tunde, body: { disputeId: dispute.id } });
check('non-party is blocked from the dispute assessment', r.status === 403);

r = await call('/v1/intelligence/dispute', { method: 'POST', token: ada, body: {} });
check('missing disputeId is rejected', r.status === 400);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
