/**
 * KYC — submission, validation, the mock-verification advisory, the
 * admin-only approve/reject lifecycle, rejection + resubmission, and
 * document access control.
 *
 * The mock verifier (services/kycVerification.js) never decides anything on
 * its own — every assertion here that checks a *status* transition goes
 * through an admin action, exactly like production must. The mock's output
 * is only ever checked as an advisory value an admin can see.
 *
 * Run the API first, then:  node test/kyc.mjs
 */
const API = process.env.SAFEPAY_API || 'http://localhost:4600';
let pass = 0, fail = 0;

const call = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

const adaToken = await login('ada@safepay.test');
const tundeToken = await login('tunde@safepay.test');
const amaraToken = await login('amara@safepay.test');
const adminToken = await login('admin@safepay.test');
check('login works for the accounts this suite needs', Boolean(adaToken && tundeToken && amaraToken && adminToken));

const userIdFor = async (email, token) => {
  const r = await call('/v1/admin/users', { token: adminToken });
  return r.json?.users?.find((u) => u.email === email)?.id ?? null;
};

// A minimal 1x1 JPEG, valid enough to pass the format check without shipping a real photo.
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

const validSubmission = (overrides = {}) => ({
  legalName: 'Probe Applicant',
  dateOfBirth: '1992-03-14',
  idType: 'nin',
  idNumber: '12345678901',
  documents: [{ dataUrl: TINY_JPEG, fileName: 'id.jpg', type: 'id_front' }],
  ...overrides,
});

console.log('\n== unauthorized access ==');

let r = await call('/v1/kyc');
check('GET /v1/kyc requires auth', r.status === 401, `got ${r.status}`);

r = await call('/v1/kyc/submit', { method: 'POST', body: validSubmission() });
check('POST /v1/kyc/submit requires auth', r.status === 401, `got ${r.status}`);

r = await call('/v1/admin/kyc', { token: adaToken });
check('admin KYC list is blocked for a non-admin', r.status === 403, `got ${r.status}`);

r = await call(`/v1/admin/kyc/usr_whoever/approve`, { method: 'POST', token: adaToken });
check('a normal user cannot reach the approve endpoint at all', r.status === 403, `got ${r.status}`);

console.log('\n== retrieving status ==');

r = await call('/v1/kyc', { token: adaToken });
check('a fresh account has no KYC submission', r.status === 200 && r.json?.kyc?.status === 'none', JSON.stringify(r.json));

console.log('\n== validation ==');

for (const [label, overrides] of [
  ['missing legal name', { legalName: '' }],
  ['legal name too short', { legalName: 'A' }],
  ['future date of birth', { dateOfBirth: '2999-01-01' }],
  ['under 18', { dateOfBirth: new Date(Date.now() - 10 * 365.25 * 864e5).toISOString().slice(0, 10) }],
  ['unknown id type', { idType: 'made_up_type' }],
  ['nin with wrong digit count', { idType: 'nin', idNumber: '123' }],
  ['bvn with letters', { idType: 'bvn', idNumber: 'ABCDEFGHIJK' }],
  ['no documents', { documents: [] }],
]) {
  r = await call('/v1/kyc/submit', { method: 'POST', token: amaraToken, body: validSubmission(overrides) });
  check(`rejects: ${label}`, r.status === 400, `got ${r.status} ${r.json?.error?.message ?? ''}`);
}

r = await call('/v1/kyc/submit', {
  method: 'POST',
  token: amaraToken,
  body: validSubmission({ documents: [{ dataUrl: 'not-a-data-url' }] }),
});
check('rejects a document that is not an image data URL', r.status === 400, `got ${r.status}`);

console.log('\n== submission -> pending ==');

r = await call('/v1/kyc/submit', { method: 'POST', token: amaraToken, body: validSubmission() });
check('a valid submission is accepted', r.status === 201, `got ${r.status} ${r.json?.error?.message ?? ''}`);
check('status becomes pending', r.json?.kyc?.status === 'pending', r.json?.kyc?.status);
check('the response never carries the full ID number', !JSON.stringify(r.json).includes('12345678901'));
check('the response carries a masked ID number instead', /•+8901$/.test(r.json?.kyc?.idNumberMasked ?? ''), r.json?.kyc?.idNumberMasked);

r = await call('/v1/kyc', { token: amaraToken });
check('GET /v1/kyc reflects the pending submission', r.json?.kyc?.status === 'pending');

r = await call('/v1/kyc/submit', { method: 'POST', token: amaraToken, body: validSubmission() });
check('a second submission is refused while one is pending', r.status === 409, `got ${r.status}`);

console.log('\n== mock verification is advisory only ==');

const amaraId = await userIdFor('amara@safepay.test');
r = await call(`/v1/admin/kyc/${amaraId}`, { token: adminToken });
check('admin detail view exposes the mock verifier\'s suggestion', ['needs_review', 'rejected'].includes(r.json?.submission?.mockVerification?.decision), JSON.stringify(r.json?.submission?.mockVerification));
check('the mock verification is explicitly labelled as a mock, not a real check', r.json?.submission?.mockVerification?.source === 'mock');
check('admin detail view shows the real (unmasked) ID number — that is the reviewer\'s job', r.json?.submission?.idNumber === '12345678901');

r = await call('/v1/admin/kyc', { token: adminToken });
check('pending submission appears in the admin review queue', (r.json?.submissions ?? []).some((s) => s.userId === amaraId));

console.log('\n== document access protection ==');

const docId = (await call(`/v1/admin/kyc/${amaraId}`, { token: adminToken })).json?.submission?.documentIds?.[0];
check('a document id was recorded', Boolean(docId));

r = await call(`/v1/kyc/document/${docId}`, { token: amaraToken });
check('the owner can fetch their own document', r.status === 200, `got ${r.status}`);

r = await call(`/v1/kyc/document/${docId}`, { token: tundeToken });
check('another user cannot fetch someone else\'s document', r.status === 403, `got ${r.status}`);

r = await call(`/v1/kyc/document/${docId}`, { token: adminToken });
check('an admin can fetch any document', r.status === 200, `got ${r.status}`);

r = await call(`/v1/kyc/document/${docId}`);
check('an unauthenticated request cannot fetch a document', r.status === 401, `got ${r.status}`);

console.log('\n== admin approval -> verified ==');

r = await call(`/v1/admin/kyc/${amaraId}/approve`, { method: 'POST', token: amaraToken });
check('a non-admin cannot approve, even their own submission', r.status === 403, `got ${r.status}`);

r = await call(`/v1/admin/kyc/${amaraId}/approve`, { method: 'POST', token: adminToken });
check('an admin approves the submission', r.status === 200 && r.json?.kyc?.status === 'verified', `got ${r.status}`);

r = await call('/v1/kyc', { token: amaraToken });
check('the applicant sees verified', r.json?.kyc?.status === 'verified');

r = await call('/v1/auth/me', { token: amaraToken });
check('verification tier was raised on approval', r.json?.user?.verificationTier === 'bvn_nin', r.json?.user?.verificationTier);

r = await call('/v1/kyc/submit', { method: 'POST', token: amaraToken, body: validSubmission() });
check('a verified account cannot submit again', r.status === 409, `got ${r.status}`);

console.log('\n== admin rejection -> rejected, then resubmission ==');

r = await call('/v1/kyc/submit', {
  method: 'POST',
  token: tundeToken,
  body: validSubmission({ legalName: 'Test Reject Trigger', idType: 'bvn' }),
});
check('a second applicant submits', r.status === 201, `got ${r.status}`);

const tundeId = await userIdFor('tunde@safepay.test');

r = await call(`/v1/admin/kyc/${tundeId}/reject`, { method: 'POST', token: adminToken, body: {} });
check('rejecting without a reason is refused', r.status === 400, `got ${r.status}`);

const REASON = 'The uploaded document photo is too blurry to confirm the ID number.';
r = await call(`/v1/admin/kyc/${tundeId}/reject`, { method: 'POST', token: adminToken, body: { reason: REASON } });
check('an admin rejects with a reason', r.status === 200 && r.json?.kyc?.status === 'rejected', `got ${r.status}`);

r = await call('/v1/kyc', { token: tundeToken });
check('the applicant sees rejected', r.json?.kyc?.status === 'rejected');
check('the applicant sees the rejection reason', r.json?.kyc?.rejectionReason === REASON, r.json?.kyc?.rejectionReason);

r = await call(`/v1/admin/kyc/${tundeId}/approve`, { method: 'POST', token: adminToken });
check('a rejected submission cannot jump straight to verified', r.status === 409, `got ${r.status}`);

r = await call('/v1/kyc/submit', { method: 'POST', token: tundeToken, body: validSubmission({ idType: 'bvn', idNumber: '55566677788' }) });
check('a rejected applicant can resubmit', r.status === 201, `got ${r.status}`);
check('resubmission goes back to pending', r.json?.kyc?.status === 'pending');

r = await call(`/v1/admin/kyc/${tundeId}`, { token: adminToken });
check('the resubmission clears the previous rejection reason', r.json?.submission?.rejectionReason === null);
check('submission count tracks the resubmission', r.json?.submission?.submissionCount === 2, r.json?.submission?.submissionCount);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
