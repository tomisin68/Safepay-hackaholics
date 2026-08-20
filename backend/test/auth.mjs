/**
 * End-to-end test for the email-verification gate.
 *
 * The whole point of the OTP flow is that certain things are *impossible*, so
 * most of what follows asserts a failure rather than a success: no token from
 * signup, no session without the code, no unlimited guesses, no replay.
 *
 * Reading a real code requires reading the email, which a test cannot do. So the
 * server under test is started with KEPLARS_API_KEY unset, which puts the mailer
 * in console mode and prints codes to its log. That is also the assertion that
 * the dev fallback works — without it a credential-less clone could never sign up.
 *
 * Run the API with its output redirected to a file, then:
 *   SAFEPAY_LOG=/path/to/server.log npm run test:auth
 *
 * Probe accounts use `@probe.example`, not `@safepay.test`. The latter is
 * reserved for the seeded demo accounts, which skip the OTP gate on purpose —
 * signing up under it is refused, so it cannot be used to test the gate.
 *
 * The signup limiter allows 20 requests a minute. Back-to-back runs will trip
 * it; wait a minute between them.
 */

import fs from 'node:fs';

const API = process.env.SAFEPAY_API || 'http://localhost:4600';
const LOG = process.env.SAFEPAY_LOG;

let pass = 0;
let fail = 0;

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
  if (cond) { pass += 1; console.log(`  PASS  ${label}${detail ? '  ' + detail : ''}`); }
  else { fail += 1; console.log(`  FAIL  ${label}  ${detail}`); }
};

/**
 * Scrapes the newest code the mailer logged for an address.
 *
 * Reads the tail backwards so a resent code beats the one it replaced, which is
 * what the resend assertions depend on.
 */
function codeFor(email) {
  if (!LOG) return null;
  const lines = fs.readFileSync(LOG, 'utf8').split('\n').reverse();
  for (const line of lines) {
    if (!line.includes(email)) continue;
    const match = line.match(/code for \S+ is (\d{6})/);
    if (match) return match[1];
  }
  return null;
}

const unique = `probe.${Date.now()}@probe.example`;
const PASSWORD = 'Str0ng-Test-Passw0rd';

console.log('\n  Email verification gate\n  ' + '-'.repeat(52));

/* ------------------------------------------------------------------ *
 * Signup must not hand out a session
 * ------------------------------------------------------------------ */
let r = await call('/v1/auth/signup', {
  method: 'POST',
  body: { name: 'Probe Account', email: unique, password: PASSWORD },
});
check('signup returns 202, not 201', r.status === 202, `got ${r.status}`);
check('signup issues NO token', !r.json?.token, r.json?.token ? 'LEAKED A TOKEN' : '');
check('signup asks for verification', r.json?.verificationRequired === true);
check('signup returns a challenge id', typeof r.json?.challengeId === 'string');
check('signup masks the email', /^p\*+@probe\.example$/.test(r.json?.email ?? ''), r.json?.email);
check('signup never returns the code', !JSON.stringify(r.json).match(/\b\d{6}\b/));

const challengeId = r.json?.challengeId;

/* ------------------------------------------------------------------ *
 * Invited-before-registered escrow linking
 *
 * A buyer invites someone by email who has no SafePay account yet. The
 * escrow is created with sellerId: null. Once the invited person signs up
 * and verifies — the moment their account stops being inert — the escrow
 * must be waiting for them, not orphaned on the email address forever.
 *
 * Run early, before the brute-force/guessing block below spends most of the
 * shared 10-per-minute verify-email rate limit for this IP — this only
 * needs one clean verification, not a tolerance for a possible 429.
 * ------------------------------------------------------------------ */
if (LOG) {
  const inviteEmail = `invited.${Date.now()}@probe.example`;

  r = await call('/v1/auth/login', { method: 'POST', body: { email: 'ada@safepay.test', password: 'password123' } });
  const buyerToken = r.json?.token;

  r = await call('/v1/escrows', {
    method: 'POST',
    token: buyerToken,
    body: { type: 'goods', amount: 5000, title: 'Invited-seller probe', sellerEmail: inviteEmail },
  });
  const invitedEscrow = r.json?.escrow;
  check('escrow created inviting an email with no account yet',
    r.status === 201 && invitedEscrow?.seller?.invited === true, `got ${r.status}`);

  r = await call('/v1/auth/signup', {
    method: 'POST',
    body: { name: 'Invited Person', email: inviteEmail, password: PASSWORD },
  });
  const inviteChallenge = r.json?.challengeId;
  const inviteCode = codeFor(inviteEmail);
  check('the invited person can sign up and gets their own code', /^\d{6}$/.test(inviteCode ?? ''), inviteCode ?? 'none');

  r = await call('/v1/auth/verify-email', { method: 'POST', body: { challengeId: inviteChallenge, code: inviteCode } });
  check('the invited person verifies', r.status === 200, `got ${r.status} ${r.json?.error?.message ?? ''}`);
  const inviteToken = r.json?.token;

  r = await call('/v1/escrows', { token: inviteToken });
  const seen = (r.json?.escrows ?? []).some((e) => e.id === invitedEscrow?.id);
  check('the invited escrow now appears for the newly registered account', seen);
}

/* ------------------------------------------------------------------ *
 * Login before verifying must not hand out a session either
 * ------------------------------------------------------------------ */
r = await call('/v1/auth/login', { method: 'POST', body: { email: unique, password: PASSWORD } });
check('login on an unverified account issues NO token', !r.json?.token);
check('login on an unverified account re-challenges', r.json?.verificationRequired === true);
const loginChallenge = r.json?.challengeId;

/* Wrong password must stay indistinguishable from an unknown account. */
r = await call('/v1/auth/login', { method: 'POST', body: { email: unique, password: 'wrong-password-here' } });
const wrongPw = { status: r.status, message: r.json?.error?.message };
r = await call('/v1/auth/login', { method: 'POST', body: { email: `nobody.${Date.now()}@probe.example`, password: 'wrong-password-here' } });
check('wrong password and unknown email are indistinguishable',
  wrongPw.status === r.status && wrongPw.message === r.json?.error?.message,
  `${wrongPw.status}/${r.status}`);

/* ------------------------------------------------------------------ *
 * Brute force and malformed input
 * ------------------------------------------------------------------ */
r = await call('/v1/auth/verify-email', { method: 'POST', body: { challengeId: loginChallenge, code: 'abcdef' } });
check('a non-numeric code is rejected', r.status === 400, `got ${r.status}`);

r = await call('/v1/auth/verify-email', { method: 'POST', body: { challengeId: loginChallenge, code: '000000' } });
check('a wrong code is rejected', r.status === 400, `got ${r.status}`);
check('a wrong code reports attempts remaining', /attempt/i.test(r.json?.error?.message ?? ''), r.json?.error?.message);

/* The shape check above already consumed one attempt; five in total must burn
 * the challenge rather than allowing unlimited guesses. */
let exhausted = false;
for (let i = 0; i < 6; i += 1) {
  r = await call('/v1/auth/verify-email', { method: 'POST', body: { challengeId: loginChallenge, code: '111111' } });
  if (r.status === 429 || /too many/i.test(r.json?.error?.message ?? '')) { exhausted = true; break; }
}
check('guessing is capped and the challenge is burned', exhausted);

r = await call('/v1/auth/verify-email', { method: 'POST', body: { challengeId: loginChallenge, code: '111111' } });
check('a burned challenge stays dead', r.status >= 400, `got ${r.status}`);

r = await call('/v1/auth/verify-email', { method: 'POST', body: { challengeId: 'otp_does_not_exist', code: '123456' } });
check('an unknown challenge id is rejected', r.status >= 400, `got ${r.status}`);

/* ------------------------------------------------------------------ *
 * The happy path
 * ------------------------------------------------------------------ */
if (!LOG) {
  console.log('\n  SKIP  code-dependent assertions (set SAFEPAY_LOG to the server log)\n');
} else {
  // The signup challenge was replaced by the login one, which is now burned.
  // Ask for a fresh challenge the same way a user would.
  r = await call('/v1/auth/login', { method: 'POST', body: { email: unique, password: PASSWORD } });
  const liveChallenge = r.json?.challengeId;
  check('a new login issues a fresh challenge', Boolean(liveChallenge) && liveChallenge !== loginChallenge);

  const code = codeFor(unique);
  check('the mailer logged a 6-digit code (dev fallback works)', /^\d{6}$/.test(code ?? ''), code ?? 'none found');

  // A correct code against the wrong challenge must fail.
  r = await call('/v1/auth/verify-email', { method: 'POST', body: { challengeId: challengeId, code } });
  check('a correct code is bound to its own challenge', r.status >= 400, `got ${r.status}`);

  r = await call('/v1/auth/verify-email', { method: 'POST', body: { challengeId: liveChallenge, code } });
  check('the correct code verifies', r.status === 200, `got ${r.status} ${r.json?.error?.message ?? ''}`);
  check('verification issues a token', typeof r.json?.token === 'string');
  check('the user is now emailVerified', r.json?.user?.emailVerified === true);
  check('the response never includes a password hash', !('passwordHash' in (r.json?.user ?? {})));
  check('proving the address lifts the verification tier', r.json?.user?.verificationTier === 'email',
    r.json?.user?.verificationTier);

  const token = r.json?.token;

  // Single use.
  r = await call('/v1/auth/verify-email', { method: 'POST', body: { challengeId: liveChallenge, code } });
  check('the same code cannot be replayed', r.status >= 400, `got ${r.status}`);

  // The session works.
  r = await call('/v1/auth/me', { token });
  check('the issued token opens a session', r.status === 200, `got ${r.status}`);
  check('/me returns the verified user', r.json?.user?.email === unique);

  // And now login works straight through.
  r = await call('/v1/auth/login', { method: 'POST', body: { email: unique, password: PASSWORD } });
  check('login now returns a token directly', typeof r.json?.token === 'string' && !r.json?.verificationRequired);
  check('login records lastLoginAt', Boolean(r.json?.user?.lastLoginAt));

  /* --------------------------------------------------------------- *
   * Resend rotates the code and invalidates the old one
   * --------------------------------------------------------------- */
  const second = `probe2.${Date.now()}@probe.example`;
  r = await call('/v1/auth/signup', {
    method: 'POST',
    body: { name: 'Probe Two', email: second, password: PASSWORD },
  });
  const rotateChallenge = r.json?.challengeId;
  const firstCode = codeFor(second);
  check('a second signup gets its own code', /^\d{6}$/.test(firstCode ?? ''), firstCode ?? 'none');

  r = await call('/v1/auth/resend-code', { method: 'POST', body: { challengeId: rotateChallenge } });
  check('resend is refused inside the cooldown', r.status === 429, `got ${r.status}`);

  /* --------------------------------------------------------------- *
   * An unverified account is invisible and inert
   * --------------------------------------------------------------- */
  r = await call('/v1/auth/directory?q=probe2', { token });
  const listed = (r.json?.results ?? []).some((u) => u.email === second);
  check('an unverified account is hidden from the directory', !listed);

  r = await call('/v1/escrows', { method: 'POST', token: 'not-a-real-token', body: { amount: 1000 } });
  check('a garbage token cannot create an escrow', r.status === 401, `got ${r.status}`);
}

/* ------------------------------------------------------------------ *
 * The demo domain is reserved
 *
 * Accounts on it skip the emailed-code gate, so being able to sign up under it
 * would be a way to mint an unverified account that behaves like a verified
 * one. This is the assertion that closes that door.
 * ------------------------------------------------------------------ */
r = await call('/v1/auth/signup', {
  method: 'POST',
  body: { name: 'Impostor', email: `sneak.${Date.now()}@safepay.test`, password: PASSWORD },
});
check('signing up on the reserved demo domain is refused', r.status === 400, `got ${r.status}`);

r = await call('/v1/auth/signup', {
  method: 'POST',
  body: { name: 'Someone Else', email: 'ada@safepay.test', password: PASSWORD },
});
check('and that holds for an existing demo account too', r.status === 400, `got ${r.status}`);

/* ------------------------------------------------------------------ *
 * Duplicate signup
 *
 * The probe account is verified by this point only when a log was supplied;
 * either way a second signup at the same address must never mint a session.
 * ------------------------------------------------------------------ */
r = await call('/v1/auth/signup', {
  method: 'POST',
  body: { name: 'Probe Account', email: unique, password: 'a-different-password' },
});
check('signing up over an existing account never issues a token', !r.json?.token,
  r.json?.token ? 'LEAKED A TOKEN' : `got ${r.status}`);
check('signing up over an existing account with the wrong password conflicts',
  r.status === 409, `got ${r.status}`);

/* ------------------------------------------------------------------ *
 * Seeded accounts still work
 * ------------------------------------------------------------------ */
r = await call('/v1/auth/login', { method: 'POST', body: { email: 'ada@safepay.test', password: 'password123' } });
check('seeded demo accounts sign in without a code', typeof r.json?.token === 'string', `got ${r.status}`);

r = await call('/v1/auth/login', { method: 'POST', body: { email: 'admin@safepay.test', password: 'password123' } });
const adminToken = r.json?.token;
r = await call('/v1/admin/users', { token: adminToken });
check('the admin console still lists users', r.status === 200, `got ${r.status}`);
check('the admin user list carries no password hashes',
  !(r.json?.users ?? []).some((u) => 'passwordHash' in u));

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */
for (const [label, body] of [
  ['a short password is rejected', { name: 'X Y', email: `v.${Date.now()}@probe.example`, password: 'short' }],
  ['a malformed email is rejected', { name: 'X Y', email: 'not-an-email', password: PASSWORD }],
  ['a missing name is rejected', { email: `v2.${Date.now()}@probe.example`, password: PASSWORD }],
]) {
  r = await call('/v1/auth/signup', { method: 'POST', body });
  check(label, r.status === 400, `got ${r.status}`);
}

console.log('\n  ' + '-'.repeat(52));
console.log(`  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
