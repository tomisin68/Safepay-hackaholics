/**
 * End-to-end API test.
 *
 * Exercises the flows that actually carry risk: partial milestone releases, the
 * in-person claim handshake and who is allowed to complete it, dispute triage
 * and admin resolution, and the authorisation boundaries around each.
 *
 * Run the API first, then:  npm run test:e2e
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
const admin = await login('admin@safepay.test');
check('login works for all demo accounts', ada && chidi && tunde && admin);

console.log('\n== milestone escrow ==');
let r = await call('/v1/escrows', { method: 'POST', token: ada, body: {
  type: 'service_milestone', amount: 300000, title: 'Landing page build',
  sellerEmail: 'chidi@safepay.test',
  milestones: [{ title: 'Design', amount: 100000 }, { title: 'Build', amount: 200000 }],
}});
const ms = r.json?.escrow;
check('milestone escrow created', r.status === 201 && ms?.milestones?.length === 2);

r = await call('/v1/escrows', { method: 'POST', token: ada, body: {
  type: 'service_milestone', amount: 300000, title: 'Bad', sellerEmail: 'chidi@safepay.test',
  milestones: [{ title: 'A', amount: 100000 }],
}});
check('milestone sum mismatch rejected', r.status === 400, r.json?.error?.message);

await call(`/v1/escrows/${ms.id}/fund`, { method: 'POST', token: ada });
r = await call(`/v1/escrows/${ms.id}/milestones/ms_1/approve`, { method: 'POST', token: ada });
check('first milestone releases, escrow stays open',
  r.json?.escrow?.status === 'in_progress' && r.json.escrow.milestones[0].status === 'approved');

r = await call(`/v1/escrows/${ms.id}/milestones/ms_1/approve`, { method: 'POST', token: ada });
check('double-approving a milestone is rejected', r.status === 409, r.json?.error?.message);

r = await call(`/v1/escrows/${ms.id}/milestones/ms_2/approve`, { method: 'POST', token: ada });
check('last milestone settles the escrow', r.json?.escrow?.status === 'released',
  `net ${r.json?.escrow?.netToSellerKobo} kobo`);

r = await call(`/v1/escrows/${ms.id}/milestones/ms_2/approve`, { method: 'POST', token: chidi });
check('seller cannot approve milestones', r.status === 403 || r.status === 409, r.json?.error?.code);

console.log('\n== in-person QR claim ==');
r = await call('/v1/escrows', { method: 'POST', token: tunde, body: {
  type: 'in_person', amount: 42000, title: 'Ankara bundle', role: 'seller',
}});
const ip = r.json?.escrow;
check('in-person escrow issues a claim code', Boolean(ip?.claimCode), ip?.claimCode);

r = await call('/v1/escrows/claim', { method: 'POST', token: tunde, body: { code: ip.claimCode } });
check('seller cannot claim their own escrow', r.status === 400, r.json?.error?.message);

r = await call('/v1/escrows/claim', { method: 'POST', token: ada, body: { code: ip.claimCode } });
check('buyer claims by code', r.status === 200 && r.json?.escrow?.buyer?.name === 'Ada Okonkwo');

r = await call('/v1/escrows/claim', { method: 'POST', token: chidi, body: { code: ip.claimCode } });
check('a second person cannot claim it', r.status === 403 || r.status === 409, r.json?.error?.code);

r = await call('/v1/escrows/claim', { method: 'POST', token: ada, body: { code: 'ZZZZ-9999' } });
check('unknown code returns 404', r.status === 404);

console.log('\n== dispute -> admin resolution ==');
r = await call('/v1/escrows', { method: 'POST', token: ada, body: {
  type: 'goods', amount: 60000, title: 'Disputed headphones', sellerEmail: 'tunde@safepay.test',
}});
const d = r.json.escrow;
await call(`/v1/escrows/${d.id}/fund`, { method: 'POST', token: ada });
r = await call('/v1/disputes', { method: 'POST', token: ada, body: {
  escrowId: d.id,
  reason: 'The headphones arrived cracked and one earcup does not work at all. Not what was advertised.',
}});
const dispute = r.json?.dispute;
check('dispute created and auto-triaged', r.status === 201 && Boolean(dispute?.ai?.category),
  `${dispute?.ai?.category} / ${dispute?.ai?.severity}`);
check('escrow frozen by the dispute', dispute?.escrow?.status === 'disputed');

r = await call('/v1/disputes', { method: 'POST', token: ada, body: { escrowId: d.id, reason: 'Another one, same escrow please' } });
check('duplicate open dispute rejected', r.status === 409);

r = await call(`/v1/disputes/${dispute.id}/resolve`, { method: 'POST', token: ada, body: { outcome: 'refund_buyer' } });
check('non-admin cannot resolve', r.status === 403);

r = await call(`/v1/disputes/${dispute.id}/resolve`, { method: 'POST', token: admin, body: {
  outcome: 'refund_buyer', note: 'Photos confirm damage in transit.',
}});
check('admin resolves with a refund', r.status === 200 && r.json?.dispute?.status === 'resolved');

r = await call(`/v1/escrows/${d.id}`, { token: ada });
check('escrow ends refunded', r.json?.escrow?.status === 'refunded');

console.log('\n== admin console ==');
r = await call('/v1/admin/overview', { token: admin });
check('overview returns totals, reserve and series',
  r.status === 200 && r.json?.reserve && Array.isArray(r.json?.series) && r.json.series.length === 14,
  `reserve ${r.json?.reserve?.reserveKobo} kobo`);
r = await call('/v1/admin/overview', { token: ada });
check('non-admin blocked from console', r.status === 403);

console.log('\n== scores reflect behaviour ==');
for (const email of ['tunde@safepay.test', 'amara@safepay.test', 'kelechi@safepay.test']) {
  const s = (await call(`/v1/score/${email}`)).json;
  console.log(`        ${s.user.name.padEnd(16)} ${String(s.score).padStart(3)}  ${s.tierLabel.padEnd(15)} disputes ${s.stats.disputeRatePct}%`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
