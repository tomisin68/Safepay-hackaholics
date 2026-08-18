import 'dotenv/config';
import { users, escrows, disputes, apps, resetAll, flushNow } from './store/index.js';
import { hashPassword, randomId, generateApiKey, hashApiKey, claimCode } from './lib/crypto.js';
import { toKobo } from './lib/money.js';
import { recalculate } from './services/scoreEngine.js';
import { record, collectFee } from './services/ledger.js';
import { ruleClassify } from './services/aiTriage.js';
import { EVENTS } from './services/webhookDispatcher.js';

/**
 * Demo data. A trust platform with an empty database demos badly — SafeScore
 * only means something once there is a settlement history behind it.
 *
 * Run: npm run seed
 */

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();

resetAll();

/* --------------------------------- people -------------------------------- */
const PEOPLE = [
  { key: 'ada',    name: 'Ada Okonkwo',       email: 'ada@safepay.test',    tier: 'address', age: 240, role: 'user' },
  { key: 'tunde',  name: 'Tunde Bakare',      email: 'tunde@safepay.test',  tier: 'bvn_nin', age: 190, role: 'user' },
  { key: 'chidi',  name: 'Chidi Nwosu',       email: 'chidi@safepay.test',  tier: 'bvn_nin', age: 95,  role: 'user' },
  { key: 'amara',  name: 'Amara Eze',         email: 'amara@safepay.test',  tier: 'phone',   age: 40,  role: 'user' },
  { key: 'bola',   name: 'Bola Adeyemi',      email: 'bola@safepay.test',   tier: 'address', age: 320, role: 'user' },
  { key: 'fresh',  name: 'Kelechi Obi',       email: 'kelechi@safepay.test', tier: 'phone',  age: 1,   role: 'user' },
  { key: 'admin',  name: 'SafePay Ops',       email: 'admin@safepay.test',  tier: 'address', age: 400, role: 'admin' },
];

const id = {};
for (const p of PEOPLE) {
  const uid = randomId('usr');
  id[p.key] = uid;
  users.set(uid, {
    id: uid,
    name: p.name,
    email: p.email,
    phone: '+23480' + String(10000000 + Math.floor(Math.random() * 8999999)),
    passwordHash: hashPassword('password123'),
    role: p.role,
    verificationTier: p.tier,
    safeScore: 0,
    scoreTier: 'new',
    createdAt: daysAgo(p.age),
    updatedAt: daysAgo(p.age),
  });
}

/* -------------------------------- escrows -------------------------------- */
function makeEscrow({ buyer, seller, type, amount, title, description, status, createdDaysAgo, milestones }) {
  const eid = randomId('esc');
  const created = daysAgo(createdDaysAgo);
  const amountKobo = toKobo(amount);
  const feeKobo = Math.round(amountKobo * 0.015);

  const timeline = [{ event: 'created', at: created, note: null }];
  let fundedAt = null;
  let releasedAt = null;

  if (['funded', 'in_progress', 'released', 'disputed', 'refunded'].includes(status)) {
    fundedAt = daysAgo(createdDaysAgo - 0.2);
    timeline.push({ event: 'funded', at: fundedAt, note: null });
    record({ escrowId: eid, type: 'fund', amountKobo, note: 'Buyer funded escrow, funds held by SafePay' });
  }
  if (['in_progress', 'released', 'disputed'].includes(status)) {
    timeline.push({ event: 'delivered', at: daysAgo(createdDaysAgo - 0.6), note: 'Dispatched' });
  }
  if (status === 'released') {
    releasedAt = daysAgo(Math.max(0, createdDaysAgo - 1.4));
    timeline.push({ event: 'released', at: releasedAt, note: null });
    collectFee(eid, amountKobo);
    record({ escrowId: eid, type: 'release', amountKobo: amountKobo - feeKobo, note: 'Released to seller (buyer confirmed)' });
  }
  if (status === 'disputed') timeline.push({ event: 'disputed', at: daysAgo(createdDaysAgo - 1), note: null });

  escrows.set(eid, {
    id: eid,
    buyerId: id[buyer],
    sellerId: id[seller],
    sellerEmail: null,
    appId: null,
    type,
    title,
    description,
    amountKobo,
    currency: 'NGN',
    feeKobo,
    netToSellerKobo: amountKobo - feeKobo,
    status,
    milestones: milestones ?? null,
    claimCode: type === 'in_person' ? claimCode() : null,
    autoReleaseAt: ['funded', 'in_progress'].includes(status) ? daysAgo(-(3 + Math.random() * 4)) : null,
    fundedAt,
    releasedAt,
    disputedAt: status === 'disputed' ? daysAgo(createdDaysAgo - 1) : null,
    flagged: false,
    createdAt: created,
    updatedAt: created,
    timeline,
  });

  return eid;
}

const SEED_ESCROWS = [
  { buyer: 'ada',   seller: 'tunde', type: 'goods',   amount: 185000, title: 'iPhone 13 Pro, 256GB', description: 'Space grey, battery health 91%. Meeting at Ikeja City Mall.', status: 'released',    createdDaysAgo: 62 },
  { buyer: 'chidi', seller: 'tunde', type: 'goods',   amount: 74500,  title: 'PS5 controller x2',     description: 'Sealed, DualSense white.',                                    status: 'released',    createdDaysAgo: 48 },
  { buyer: 'bola',  seller: 'tunde', type: 'goods',   amount: 320000, title: 'MacBook Air M1',        description: '8GB/256GB, includes charger and sleeve.',                     status: 'released',    createdDaysAgo: 35 },
  { buyer: 'amara', seller: 'tunde', type: 'in_person', amount: 42000, title: 'Ankara fabric bundle', description: '6 yards, collected at Balogun Market.',                        status: 'released',    createdDaysAgo: 28 },
  { buyer: 'ada',   seller: 'chidi', type: 'service_milestone', amount: 450000, title: 'Brand website build', description: 'Four-page marketing site with CMS.', status: 'released', createdDaysAgo: 40,
    milestones: [
      { id: 'ms_1', title: 'Design mockups',    amountKobo: toKobo(150000), status: 'approved', approvedAt: daysAgo(38) },
      { id: 'ms_2', title: 'Frontend build',    amountKobo: toKobo(200000), status: 'approved', approvedAt: daysAgo(33) },
      { id: 'ms_3', title: 'CMS + handover',    amountKobo: toKobo(100000), status: 'approved', approvedAt: daysAgo(30) },
    ] },
  { buyer: 'bola',  seller: 'chidi', type: 'service_milestone', amount: 280000, title: 'Logo + brand kit', description: 'Logo, colour system, social templates.', status: 'in_progress', createdDaysAgo: 6,
    milestones: [
      { id: 'ms_1', title: 'Concepts',          amountKobo: toKobo(90000),  status: 'approved', approvedAt: daysAgo(4) },
      { id: 'ms_2', title: 'Refinement',        amountKobo: toKobo(110000), status: 'pending',  approvedAt: null },
      { id: 'ms_3', title: 'Final files',       amountKobo: toKobo(80000),  status: 'pending',  approvedAt: null },
    ] },
  { buyer: 'ada',   seller: 'bola',  type: 'rental',  amount: 650000, title: 'Studio apartment — 1 month', description: 'Lekki Phase 1, furnished, caution fee included.', status: 'funded',  createdDaysAgo: 3 },
  { buyer: 'amara', seller: 'tunde', type: 'goods',   amount: 96000,  title: 'Nike Air Force 1',      description: 'UK size 9, white, with box.',                                 status: 'in_progress', createdDaysAgo: 2 },
  { buyer: 'chidi', seller: 'amara', type: 'goods',   amount: 128000, title: 'Canon EOS 200D body',   description: 'Shutter count under 8k.',                                     status: 'disputed',    createdDaysAgo: 9 },
  { buyer: 'bola',  seller: 'amara', type: 'goods',   amount: 55000,  title: 'Bluetooth speaker',     description: 'JBL Charge 5, boxed.',                                        status: 'disputed',    createdDaysAgo: 5 },
  { buyer: 'ada',   seller: 'amara', type: 'recurring', amount: 35000, title: 'Monthly meal plan',    description: 'Weekly delivery, 4 weeks.',                                   status: 'funded',      createdDaysAgo: 1 },
  { buyer: 'fresh', seller: 'tunde', type: 'goods',   amount: 890000, title: 'Generator — 7.5KVA',    description: 'Brand new, warranty card included.',                          status: 'created',     createdDaysAgo: 0 },
  { buyer: 'chidi', seller: 'bola',  type: 'in_person', amount: 240000, title: 'Office desk + chair', description: 'Collected from Yaba.',                                        status: 'created',     createdDaysAgo: 0 },
];

const escrowIds = SEED_ESCROWS.map(makeEscrow);

/* -------------------------------- disputes ------------------------------- */
const disputedEscrows = escrows.find((e) => e.status === 'disputed');
const DISPUTE_TEXT = [
  'The camera arrived but the sensor has a scratch across it and the shutter count is over 40,000, not 8,000 as advertised. This is not as described at all.',
  'I paid five days ago and the speaker never arrived. The seller has stopped replying to my messages and has now blocked me on WhatsApp.',
];

disputedEscrows.forEach((escrow, i) => {
  const did = randomId('dsp');
  const text = DISPUTE_TEXT[i] ?? DISPUTE_TEXT[0];
  const classification = { ...ruleClassify(text), triagedAt: daysAgo(4 - i) };

  disputes.set(did, {
    id: did,
    escrowId: escrow.id,
    raisedById: escrow.buyerId,
    raisedByRole: 'buyer',
    againstId: escrow.sellerId,
    reason: text,
    evidenceUrls: [],
    ai: classification,
    status: classification.severity === 'critical' ? 'under_review' : 'open',
    resolution: null,
    createdAt: daysAgo(4 - i),
  });
});

/* ------------------------------ developer app ---------------------------- */
const appId = randomId('app');
const testKey = generateApiKey('test');
const liveKey = generateApiKey('live');
apps.set(appId, {
  id: appId,
  ownerId: id.chidi,
  name: 'Campus Marketplace',
  description: 'Student-to-student trading app for Nigerian universities.',
  webhookUrl: 'https://webhook.site/replace-me',
  webhookSecret: 'whsec_demoSeedSecretReplaceInProduction',
  subscribedEvents: EVENTS,
  testKeyHash: hashApiKey(testKey),
  liveKeyHash: hashApiKey(liveKey),
  testKeyPreview: `${testKey.slice(0, 11)}${'•'.repeat(18)}${testKey.slice(-4)}`,
  liveKeyPreview: `${liveKey.slice(0, 11)}${'•'.repeat(18)}${liveKey.slice(-4)}`,
  liveEnabled: false,
  revoked: false,
  createdAt: daysAgo(20),
});

/* ------------------------------- SafeScores ------------------------------ */
for (const uid of Object.values(id)) recalculate(uid);
flushNow();

/* --------------------------------- report -------------------------------- */
const line = (label, value) => console.log(`  ${label.padEnd(22)} ${value}`);

console.log('\n  SafePay demo data ready\n  ' + '-'.repeat(46));
line('Users', users.count());
line('Escrows', escrows.count());
line('Disputes', disputes.count());
line('Developer apps', apps.count());

console.log('\n  Sign in with any of these (password: password123)\n  ' + '-'.repeat(46));
for (const p of PEOPLE) {
  const u = users.get(id[p.key]);
  line(u.email, `SafeScore ${String(u.safeScore).padStart(3)}  ${u.scoreTier}${p.role === 'admin' ? '  [admin]' : ''}`);
}

console.log('\n  Sandbox API key for "Campus Marketplace"\n  ' + '-'.repeat(46));
console.log(`  ${testKey}\n`);
console.log(`  Try it:  curl -H "Authorization: Bearer ${testKey}" http://localhost:${process.env.PORT || 4000}/v1/escrows\n`);
