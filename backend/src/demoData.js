/**
 * The demo dataset, and the two ways of laying it down.
 *
 *   seedFromScratch()   wipes the database and rebuilds it. What `npm run seed`
 *                       does, and the only safe place to call `resetAll()`.
 *   ensureDemoData()    additive and idempotent. Creates whatever is missing and
 *                       touches nothing else. Safe to run on every boot, against
 *                       a database with real accounts in it.
 *
 * The second one exists because of a specific failure: this API is deployed to a
 * host with no shell, so the only way demo data ever arrives is at boot. The old
 * guard ran the full seed only when the user count was exactly zero — so the
 * first real signup permanently locked the demo accounts out of their own
 * deployment, taking `admin@safepay.test` with them and leaving nobody able to
 * resolve a dispute. `ensureDemoData` fixes that by asking a narrower question:
 * does *this* account exist, and if not, create just it.
 *
 * A trust platform with an empty database demos badly regardless — SafeScore
 * only means anything once there is a settlement history behind it.
 */

import { users, escrows, disputes, apps, meta } from './store/index.js';
import { hashPassword, randomId, generateApiKey, hashApiKey, claimCode } from './lib/crypto.js';
import { toKobo } from './lib/money.js';
import { recalculate } from './services/scoreEngine.js';
import { record, collectFee, feeFor } from './services/ledger.js';
import { ruleClassify } from './services/aiTriage.js';
import { EVENTS } from './services/webhookDispatcher.js';
import * as wallet from './services/wallet.js';

export const DEMO_PASSWORD = 'password123';

/**
 * Reserved for the demo, and unroutable by design: `.test` is set aside by
 * RFC 2606 and can never receive mail. That is what makes it safe to let these
 * accounts skip the emailed-code gate — see routes/auth.js — and why signing up
 * with the domain is refused there.
 */
export const DEMO_EMAIL_DOMAIN = '@safepay.test';

export const isDemoAccount = (user) =>
  Boolean(user) && (user.demoAccount === true || String(user.email ?? '').endsWith(DEMO_EMAIL_DOMAIN));

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();

/* -------------------------------- people --------------------------------- */

/**
 * `wallet` is the opening balance, in naira. Kelechi is deliberately short of
 * their own outstanding escrow: somebody has to demo the top-up flow, and a
 * brand-new account with no money in it is the honest one to pick.
 */
export const PEOPLE = [
  { key: 'ada', name: 'Ada Okonkwo', email: 'ada@safepay.test', tier: 'address', age: 240, role: 'user', wallet: 3_000_000 },
  { key: 'tunde', name: 'Tunde Bakare', email: 'tunde@safepay.test', tier: 'bvn_nin', age: 190, role: 'user', wallet: 400_000 },
  { key: 'chidi', name: 'Chidi Nwosu', email: 'chidi@safepay.test', tier: 'bvn_nin', age: 95, role: 'user', wallet: 900_000 },
  { key: 'amara', name: 'Amara Eze', email: 'amara@safepay.test', tier: 'phone', age: 40, role: 'user', wallet: 350_000 },
  { key: 'bola', name: 'Bola Adeyemi', email: 'bola@safepay.test', tier: 'address', age: 320, role: 'user', wallet: 2_000_000 },
  { key: 'fresh', name: 'Kelechi Obi', email: 'kelechi@safepay.test', tier: 'phone', age: 1, role: 'user', wallet: 150_000 },
  { key: 'admin', name: 'SafePay Ops', email: 'admin@safepay.test', tier: 'address', age: 400, role: 'admin', wallet: 0 },
];

/** A seeded seller already has somewhere to be paid, so withdrawal demos itself. */
const SEED_BANK = {
  tunde: { bankCode: '035', bankName: 'Wema Bank', accountNumber: '0123456789', accountName: 'TUNDE BAKARE' },
  chidi: { bankCode: '035A', bankName: 'ALAT by Wema', accountNumber: '0246813579', accountName: 'CHIDI NWOSU' },
};

/* -------------------------------- escrows -------------------------------- */
export const SEED_ESCROWS = [
  { buyer: 'ada', seller: 'tunde', type: 'goods', amount: 185000, title: 'iPhone 13 Pro, 256GB', description: 'Space grey, battery health 91%. Meeting at Ikeja City Mall.', status: 'released', createdDaysAgo: 62 },
  { buyer: 'chidi', seller: 'tunde', type: 'goods', amount: 74500, title: 'PS5 controller x2', description: 'Sealed, DualSense white.', status: 'released', createdDaysAgo: 48 },
  { buyer: 'bola', seller: 'tunde', type: 'goods', amount: 320000, title: 'MacBook Air M1', description: '8GB/256GB, includes charger and sleeve.', status: 'released', createdDaysAgo: 35 },
  { buyer: 'amara', seller: 'tunde', type: 'in_person', amount: 42000, title: 'Ankara fabric bundle', description: '6 yards, collected at Balogun Market.', status: 'released', createdDaysAgo: 28 },
  {
    buyer: 'ada', seller: 'chidi', type: 'service_milestone', amount: 450000, title: 'Brand website build',
    description: 'Four-page marketing site with CMS.', status: 'released', createdDaysAgo: 40,
    milestones: [
      { id: 'ms_1', title: 'Design mockups', amountKobo: toKobo(150000), status: 'approved', approvedAt: daysAgo(38) },
      { id: 'ms_2', title: 'Frontend build', amountKobo: toKobo(200000), status: 'approved', approvedAt: daysAgo(33) },
      { id: 'ms_3', title: 'CMS + handover', amountKobo: toKobo(100000), status: 'approved', approvedAt: daysAgo(30) },
    ],
  },
  {
    buyer: 'bola', seller: 'chidi', type: 'service_milestone', amount: 280000, title: 'Logo + brand kit',
    description: 'Logo, colour system, social templates.', status: 'in_progress', createdDaysAgo: 6,
    milestones: [
      { id: 'ms_1', title: 'Concepts', amountKobo: toKobo(90000), status: 'approved', approvedAt: daysAgo(4) },
      { id: 'ms_2', title: 'Refinement', amountKobo: toKobo(110000), status: 'pending', approvedAt: null },
      { id: 'ms_3', title: 'Final files', amountKobo: toKobo(80000), status: 'pending', approvedAt: null },
    ],
  },
  { buyer: 'ada', seller: 'bola', type: 'rental', amount: 650000, title: 'Studio apartment — 1 month', description: 'Lekki Phase 1, furnished, caution fee included.', status: 'funded', createdDaysAgo: 3 },
  { buyer: 'amara', seller: 'tunde', type: 'goods', amount: 96000, title: 'Nike Air Force 1', description: 'UK size 9, white, with box.', status: 'in_progress', createdDaysAgo: 2 },
  { buyer: 'chidi', seller: 'amara', type: 'goods', amount: 128000, title: 'Canon EOS 200D body', description: 'Shutter count under 8k.', status: 'disputed', createdDaysAgo: 9 },
  { buyer: 'bola', seller: 'amara', type: 'goods', amount: 55000, title: 'Bluetooth speaker', description: 'JBL Charge 5, boxed.', status: 'disputed', createdDaysAgo: 5 },
  { buyer: 'ada', seller: 'amara', type: 'recurring', amount: 35000, title: 'Monthly meal plan', description: 'Weekly delivery, 4 weeks.', status: 'funded', createdDaysAgo: 1 },
  { buyer: 'fresh', seller: 'tunde', type: 'goods', amount: 890000, title: 'Generator — 7.5KVA', description: 'Brand new, warranty card included.', status: 'created', createdDaysAgo: 0 },
  { buyer: 'chidi', seller: 'bola', type: 'in_person', amount: 240000, title: 'Office desk + chair', description: 'Collected from Yaba.', status: 'created', createdDaysAgo: 0 },
];

export const DISPUTE_TEXT = [
  'The camera arrived but the sensor has a scratch across it and the shutter count is over 40,000, not 8,000 as advertised. This is not as described at all.',
  'I paid five days ago and the speaker never arrived. The seller has stopped replying to my messages and has now blocked me on WhatsApp.',
];

/* ------------------------------------------------------------------------- *
 * People
 * ------------------------------------------------------------------------- */

/**
 * Creates the demo accounts that are missing, and repairs the ones that are
 * there.
 *
 * "Repair" is narrow on purpose: the password hash, the verified flag and the
 * demo marker, and nothing else. A judge who has been clicking around as Ada
 * keeps her escrows, her balance and her SafeScore across a redeploy — but her
 * password is always `password123` and she can always get in, which is the
 * whole reason these accounts exist.
 *
 * @returns {{ ids: Record<string,string>, created: string[] }}
 */
function ensurePeople() {
  const ids = {};
  const created = [];
  const passwordHash = hashPassword(DEMO_PASSWORD);

  for (const person of PEOPLE) {
    const existing = users.findOne((u) => u.email === person.email);

    if (existing) {
      ids[person.key] = existing.id;
      users.update(existing.id, {
        passwordHash,
        demoAccount: true,
        emailVerified: true,
        emailVerifiedAt: existing.emailVerifiedAt ?? daysAgo(person.age),
        role: person.role,
      });
      continue;
    }

    const uid = randomId('usr');
    ids[person.key] = uid;
    created.push(person.email);

    users.set(uid, {
      id: uid,
      name: person.name,
      email: person.email,
      phone: `+23480${String(10000000 + Math.floor(Math.random() * 8999999))}`,
      passwordHash,
      role: person.role,
      /* Seeded accounts are pre-verified. There is no mailbox behind a `.test`
       * address to collect a code from, so demanding one would lock the demo
       * out of its own data. Accounts created through /v1/auth/signup still
       * have to clear the OTP gate. */
      demoAccount: true,
      emailVerified: true,
      emailVerifiedAt: daysAgo(person.age),
      verificationTier: person.tier,
      safeScore: 0,
      scoreTier: 'new',
      walletKobo: 0,
      bankAccount: SEED_BANK[person.key]
        ? { ...SEED_BANK[person.key], addedAt: daysAgo(Math.min(person.age, 30)) }
        : null,
      firebaseUid: null,
      lastLoginAt: daysAgo(Math.min(person.age, 2)),
      createdAt: daysAgo(person.age),
      updatedAt: daysAgo(person.age),
    });

    if (person.wallet > 0) {
      wallet.credit(uid, toKobo(person.wallet), {
        type: 'topup',
        note: 'Bank transfer to Wema Bank (demo opening balance)',
        reference: `SP-SEED-${person.key.toUpperCase()}`,
        at: daysAgo(Math.min(person.age, 30)),
      });
    }
  }

  return { ids, created };
}

/* ------------------------------------------------------------------------- *
 * Escrows, disputes, developer app
 * ------------------------------------------------------------------------- */

/**
 * Builds one escrow and replays its money through the ledger and both wallets,
 * so a seeded balance is the balance the seeded history would have produced.
 */
function makeEscrow(ids, spec) {
  const eid = randomId('esc');
  const created = daysAgo(spec.createdDaysAgo);
  const amountKobo = toKobo(spec.amount);
  const feeKobo = feeFor(amountKobo);
  const buyerId = ids[spec.buyer];
  const sellerId = ids[spec.seller];

  const timeline = [{ event: 'created', at: created, note: null }];
  let fundedAt = null;
  let releasedAt = null;

  if (['funded', 'in_progress', 'released', 'disputed', 'refunded'].includes(spec.status)) {
    fundedAt = daysAgo(spec.createdDaysAgo - 0.2);
    timeline.push({ event: 'funded', at: fundedAt, note: null });
    record({ escrowId: eid, type: 'fund', amountKobo, note: 'Buyer funded escrow, funds held by SafePay' });
    wallet.debit(buyerId, amountKobo, {
      type: 'escrow_fund', note: `Held in escrow: ${spec.title}`, escrowId: eid, at: fundedAt,
    });
  }
  if (['in_progress', 'released', 'disputed'].includes(spec.status)) {
    timeline.push({ event: 'delivered', at: daysAgo(spec.createdDaysAgo - 0.6), note: 'Dispatched' });
  }
  if (spec.status === 'released') {
    releasedAt = daysAgo(Math.max(0, spec.createdDaysAgo - 1.4));
    timeline.push({ event: 'released', at: releasedAt, note: null });
    collectFee(eid, amountKobo);
    record({ escrowId: eid, type: 'release', amountKobo: amountKobo - feeKobo, note: 'Released to seller (buyer confirmed)' });
    wallet.credit(sellerId, amountKobo, {
      type: 'escrow_release', note: `Escrow released: ${spec.title}`, escrowId: eid, at: releasedAt,
    });
    wallet.debit(sellerId, feeKobo, {
      type: 'fee', note: `SafePay fee on ${spec.title}`, escrowId: eid, at: releasedAt,
    });
  }
  if (spec.status === 'disputed') {
    timeline.push({ event: 'disputed', at: daysAgo(spec.createdDaysAgo - 1), note: null });
  }

  escrows.set(eid, {
    id: eid,
    buyerId,
    sellerId,
    sellerEmail: null,
    appId: null,
    type: spec.type,
    title: spec.title,
    description: spec.description,
    amountKobo,
    currency: 'NGN',
    feeKobo,
    netToSellerKobo: amountKobo - feeKobo,
    status: spec.status,
    milestones: spec.milestones ?? null,
    claimCode: spec.type === 'in_person' ? claimCode() : null,
    fundedAt,
    releasedAt,
    disputedAt: spec.status === 'disputed' ? daysAgo(spec.createdDaysAgo - 1) : null,
    deliveryProof: null,
    flagged: false,
    createdAt: created,
    updatedAt: created,
    timeline,
  });

  return eid;
}

function makeDisputes() {
  escrows
    .find((e) => e.status === 'disputed')
    .forEach((escrow, i) => {
      if (disputes.findOne((d) => d.escrowId === escrow.id)) return;
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
}

/** @returns {{ testKey: string, liveKey: string }} the keys, printed once by the CLI */
function makeDeveloperApp(ownerId) {
  const appId = randomId('app');
  const testKey = generateApiKey('test');
  const liveKey = generateApiKey('live');

  apps.set(appId, {
    id: appId,
    ownerId,
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

  return { testKey, liveKey };
}

/* ------------------------------------------------------------------------- *
 * Entry points
 * ------------------------------------------------------------------------- */

/**
 * Lays down whatever is missing, and nothing else.
 *
 * The escrow history is all-or-nothing: it is written only when none of the
 * demo people have any escrows at all. Half a history is worse than none —
 * SafeScore would be computed against a record that never happened.
 *
 * @returns {{ createdUsers: string[], seededHistory: boolean }}
 */
export function ensureDemoData() {
  const { ids, created } = ensurePeople();
  const demoIds = new Set(Object.values(ids));

  const hasHistory = escrows.findOne((e) => demoIds.has(e.buyerId) || demoIds.has(e.sellerId));
  let seededHistory = false;

  if (!hasHistory) {
    for (const spec of SEED_ESCROWS) makeEscrow(ids, spec);
    makeDisputes();
    if (!apps.findOne((a) => a.ownerId === ids.chidi)) makeDeveloperApp(ids.chidi);
    seededHistory = true;
  }

  for (const uid of Object.values(ids)) recalculate(uid);

  return { createdUsers: created, seededHistory };
}

/**
 * The destructive version, for `npm run seed`. Everything currently stored is
 * deleted first — never call this from the server.
 *
 * @param {() => void} resetAll  injected so this module never imports the reset
 *   by accident; the CLI is the only caller that should be able to reach it.
 */
export function seedFromScratch(resetAll) {
  resetAll();
  meta.update({ reserveKobo: 0, feesCollectedKobo: 0 });

  const { ids } = ensurePeople();
  for (const spec of SEED_ESCROWS) makeEscrow(ids, spec);
  makeDisputes();
  const keys = makeDeveloperApp(ids.chidi);
  for (const uid of Object.values(ids)) recalculate(uid);

  return { ids, ...keys };
}
