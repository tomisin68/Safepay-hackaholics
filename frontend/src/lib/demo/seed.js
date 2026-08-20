/**
 * Demo dataset — the browser twin of backend/src/seed.js.
 *
 * A trust platform with an empty database demos badly: SafeScore only means
 * something once there is a settlement history behind it. These are the same
 * seven accounts, thirteen escrows and two disputes the server seeds, so the
 * README's demo path works identically against demo mode.
 */

import {
  users, escrows, disputes, apps, ledger, fraudFlags, meta, proofs,
  walletEntries, topups, payouts,
  randomId, claimCode, hashPassword, toKobo, resetAll,
} from './db.js';
import { collectFee, record, recalculate, ruleClassify, feeFor } from './engine.js';
import * as wallet from './wallet.js';

export const DEMO_PASSWORD = 'password123';

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();

/**
 * `wallet` is the opening SafePay balance, in naira. Kelechi is deliberately
 * short of their own outstanding escrow: somebody has to demo the top-up flow,
 * and a brand-new account with nothing in it is the honest one to pick.
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

const SEED_ESCROWS = [
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

const DISPUTE_TEXT = [
  'The camera arrived but the sensor has a scratch across it and the shutter count is over 40,000, not 8,000 as advertised. This is not as described at all.',
  'I paid five days ago and the speaker never arrived. The seller has stopped replying to my messages and has now blocked me on WhatsApp.',
];

export async function seedDemoData() {
  resetAll();

  /* --- people --- */
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const id = {};
  for (const p of PEOPLE) {
    const uid = randomId('usr');
    id[p.key] = uid;
    users.set(uid, {
      id: uid,
      name: p.name,
      email: p.email,
      phone: `+23480${String(10000000 + Math.floor(Math.random() * 8999999))}`,
      // Every seeded account shares one hash — they all share one password.
      passwordHash,
      role: p.role,
      verificationTier: p.tier,
      safeScore: 0,
      scoreTier: 'new',
      walletKobo: 0,
      bankAccount: SEED_BANK[p.key]
        ? { ...SEED_BANK[p.key], addedAt: daysAgo(Math.min(p.age, 30)) }
        : null,
      createdAt: daysAgo(p.age),
      updatedAt: daysAgo(p.age),
    });

    if (p.wallet > 0) {
      wallet.credit(uid, toKobo(p.wallet), {
        type: 'topup',
        note: 'Bank transfer to Wema Bank (demo opening balance)',
        reference: `SP-SEED-${p.key.toUpperCase()}`,
        at: daysAgo(Math.min(p.age, 30)),
      });
    }
  }

  /* --- escrows, replayed through the ledger so the reserve is real --- */
  for (const spec of SEED_ESCROWS) {
    const eid = randomId('esc');
    const created = daysAgo(spec.createdDaysAgo);
    const amountKobo = toKobo(spec.amount);
    const feeKobo = feeFor(amountKobo);

    const timeline = [{ event: 'created', at: created, note: null }];
    let fundedAt = null;
    let releasedAt = null;

    if (['funded', 'in_progress', 'released', 'disputed', 'refunded'].includes(spec.status)) {
      fundedAt = daysAgo(spec.createdDaysAgo - 0.2);
      timeline.push({ event: 'funded', at: fundedAt, note: null });
      record({ escrowId: eid, type: 'fund', amountKobo, note: 'Buyer funded escrow, funds held by SafePay' });
      wallet.debit(id[spec.buyer], amountKobo, {
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
      wallet.credit(id[spec.seller], amountKobo, {
        type: 'escrow_release', note: `Escrow released: ${spec.title}`, escrowId: eid, at: releasedAt,
      });
      wallet.debit(id[spec.seller], feeKobo, {
        type: 'fee', note: `SafePay fee on ${spec.title}`, escrowId: eid, at: releasedAt,
      });
    }
    if (spec.status === 'disputed') {
      timeline.push({ event: 'disputed', at: daysAgo(spec.createdDaysAgo - 1), note: null });
    }

    escrows.set(eid, {
      id: eid,
      buyerId: id[spec.buyer],
      sellerId: id[spec.seller],
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
  }

  /* --- disputes, triaged by the same classifier the API uses --- */
  escrows.find((e) => e.status === 'disputed').forEach((escrow, i) => {
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

  /* --- one developer app, so the developer console has something to show --- */
  const appId = randomId('app');
  const testKey = `sk_test_${randomId('k').slice(2)}`;
  apps.set(appId, {
    id: appId,
    ownerId: id.chidi,
    name: 'Campus Marketplace',
    description: 'Student-to-student trading app for Nigerian universities.',
    webhookUrl: 'https://webhook.site/replace-me',
    webhookSecret: 'whsec_demoSeedSecretReplaceInProduction',
    subscribedEvents: ['escrow.created', 'escrow.funded', 'escrow.delivered', 'escrow.released', 'escrow.disputed', 'escrow.refunded'],
    testKeyPreview: `${testKey.slice(0, 11)}${'•'.repeat(18)}${testKey.slice(-4)}`,
    liveKeyPreview: null,
    liveEnabled: false,
    revoked: false,
    createdAt: daysAgo(20),
  });

  for (const uid of Object.values(id)) recalculate(uid);

  return { users: users.count(), escrows: escrows.count(), disputes: disputes.count() };
}

/** Untouched by the seed, but reset alongside it. */
export const demoCollections = {
  users, escrows, disputes, apps, ledger, fraudFlags, meta,
  walletEntries, topups, payouts, proofs,
};
