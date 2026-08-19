/**
 * Demo mode — the SafePay API, running in the visitor's own tab.
 *
 * Why this exists: the hosted build is a static site. Without an API behind it
 * every demo account bounces off the login screen, which is the worst possible
 * first impression for a payments product. This module answers the same routes
 * `src/lib/api.js` calls, against a seeded localStorage database, so the public
 * link is fully explorable with nothing deployed.
 *
 * It is not a substitute for the API. Point VITE_API_URL at a real backend and
 * none of this is even downloaded — see `isDemoMode` in ../api.js.
 */

import {
  users, escrows, disputes, apps, ledger, fraudFlags, sessions,
  randomId, randomToken, hashPassword, verifyPassword, loadFromDisk,
} from './db.js';
import * as engine from './engine.js';
import { DemoError } from './engine.js';
import { seedDemoData, DEMO_PASSWORD, PEOPLE } from './seed.js';

export { DEMO_PASSWORD, PEOPLE };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Network illusion: instant responses make the UI's loading states untestable
   and make the demo feel like a mock. A short delay is honest about latency. */
const LATENCY_MS = 180;
const settle = () => new Promise((r) => setTimeout(r, LATENCY_MS));

let ready = null;
function ensureSeeded() {
  return (ready ??= (async () => {
    if (!loadFromDisk() || users.count() === 0) await seedDemoData();
  })());
}

/** Wipe and re-seed — exposed so a stuck demo can be reset from the UI. */
export async function resetDemo() {
  ready = seedDemoData();
  await ready;
}

const publicUser = (user) => {
  if (!user) return null;
  // Destructured only to drop it — the hash never leaves this module.
  const { passwordHash: _hash, ...rest } = user;
  return rest;
};

function actorFor(token) {
  if (!token) throw new DemoError('Sign in to continue.', 401, 'unauthorized');
  const session = sessions.get(token);
  if (!session) throw new DemoError('Your session has expired. Sign in again.', 401, 'unauthorized');
  const user = users.get(session.userId);
  if (!user) throw new DemoError('Your session has expired. Sign in again.', 401, 'unauthorized');
  return user;
}

const requireAdmin = (user) => {
  if (user.role !== 'admin') throw new DemoError('Administrator access required.', 403, 'forbidden');
  return user;
};

const disputeView = (d) => ({
  ...d,
  escrow: engine.publicView(escrows.get(d.escrowId)),
  raisedByName: users.get(d.raisedById)?.name ?? 'Unknown',
  againstName: users.get(d.againstId)?.name ?? 'Unknown',
});

/* ==========================================================================
   Routes
   ========================================================================== */

/**
 * @param {string} method  HTTP verb
 * @param {string} path    e.g. "/v1/escrows/esc_123/fund"
 * @param {object} query   parsed search params
 * @param {object} body    parsed JSON body
 * @param {string} token   bearer token, if any
 */
async function route(method, path, query, body, token) {
  const seg = path.replace(/^\/+|\/+$/g, '').split('/');
  // Every route below is under /v1.
  if (seg[0] !== 'v1') throw new DemoError('Not found.', 404, 'not_found');
  const [, area, ...rest] = seg;

  /* ----------------------------- auth ----------------------------- */
  if (area === 'auth') {
    if (method === 'POST' && rest[0] === 'signup') {
      const { name, email, password, phone } = body ?? {};
      if (!name || String(name).trim().length < 2) throw engine.badRequest('Enter your full name.');
      if (!EMAIL.test(String(email ?? ''))) throw engine.badRequest('Enter a valid email address.');
      if (String(password ?? '').length < 8) throw engine.badRequest('Password must be at least 8 characters.');

      const normalised = String(email).toLowerCase().trim();
      if (users.findOne((u) => u.email === normalised)) {
        throw new DemoError('An account with that email already exists.', 409, 'conflict');
      }

      const id = randomId('usr');
      const now = new Date().toISOString();
      users.set(id, {
        id,
        name: String(name).trim(),
        email: normalised,
        phone: phone ? String(phone).trim() : null,
        passwordHash: await hashPassword(String(password)),
        role: 'user',
        verificationTier: phone ? 'phone' : 'none',
        safeScore: 0,
        scoreTier: 'new',
        createdAt: now,
        updatedAt: now,
      });
      engine.recalculate(id);

      const newToken = randomToken();
      sessions.set(newToken, { userId: id, createdAt: now });
      return { status: 201, data: { token: newToken, user: publicUser(users.get(id)) } };
    }

    if (method === 'POST' && rest[0] === 'login') {
      const user = users.findOne((u) => u.email === String(body?.email ?? '').toLowerCase().trim());
      const ok = user && (await verifyPassword(String(body?.password ?? ''), user.passwordHash));
      // Same message either way — never reveal whether an email is registered.
      if (!ok) throw new DemoError('That email and password do not match.', 401, 'unauthorized');

      const newToken = randomToken();
      sessions.set(newToken, { userId: user.id, createdAt: new Date().toISOString() });
      return { status: 200, data: { token: newToken, user: publicUser(user) } };
    }

    if (method === 'GET' && rest[0] === 'me') {
      const user = actorFor(token);
      return { status: 200, data: { user: publicUser(user), score: engine.computeScore(user.id) } };
    }

    if (method === 'PATCH' && rest[0] === 'me') {
      const user = actorFor(token);
      const patch = {};
      if (body?.name) patch.name = String(body.name).trim().slice(0, 80);
      if (body?.phone) patch.phone = String(body.phone).trim().slice(0, 24);
      if (body?.verificationTier) {
        if (!['none', 'phone', 'bvn_nin', 'address'].includes(body.verificationTier)) {
          throw engine.badRequest('Unknown verification tier.');
        }
        patch.verificationTier = body.verificationTier;
      }
      users.update(user.id, patch);
      engine.recalculate(user.id);
      return { status: 200, data: { user: publicUser(users.get(user.id)), score: engine.computeScore(user.id) } };
    }

    if (method === 'GET' && rest[0] === 'directory') {
      const user = actorFor(token);
      const q = String(query.q ?? '').toLowerCase().trim();
      const results = users
        .find((u) => u.id !== user.id && (!q || u.name.toLowerCase().includes(q) || u.email.includes(q)))
        .slice(0, 12)
        .map((u) => ({ id: u.id, name: u.name, email: u.email, safeScore: u.safeScore, scoreTier: u.scoreTier }));
      return { status: 200, data: { results } };
    }
  }

  /* ---------------------------- escrows ---------------------------- */
  if (area === 'escrows') {
    const user = actorFor(token);

    if (method === 'GET' && rest.length === 0) {
      let mine = escrows.find((e) => e.buyerId === user.id || e.sellerId === user.id);
      if (query.status) mine = mine.filter((e) => String(query.status).split(',').includes(e.status));
      if (query.type) mine = mine.filter((e) => e.type === query.type);
      if (query.role === 'buyer') mine = mine.filter((e) => e.buyerId === user.id);
      if (query.role === 'seller') mine = mine.filter((e) => e.sellerId === user.id);
      mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const held = mine.filter((e) => ['funded', 'in_progress'].includes(e.status));
      const released = mine.filter((e) => e.status === 'released');
      return {
        status: 200,
        data: {
          escrows: mine.map(engine.publicView),
          summary: {
            total: mine.length,
            inEscrowKobo: held.reduce((s, e) => s + e.amountKobo, 0),
            releasedKobo: released.reduce((s, e) => s + e.amountKobo, 0),
            earnedKobo: released
              .filter((e) => e.sellerId === user.id)
              .reduce((s, e) => s + (e.netToSellerKobo ?? e.amountKobo), 0),
            openDisputes: mine.filter((e) => e.status === 'disputed').length,
            awaitingAction: mine.filter(
              (e) => (e.status === 'created' && e.buyerId === user.id) || (e.status === 'in_progress' && e.buyerId === user.id),
            ).length,
          },
        },
      };
    }

    if (method === 'POST' && rest.length === 0) {
      const { escrow, flags } = engine.createEscrow({ ...body, buyerId: user.id });
      return { status: 201, data: { escrow: engine.publicView(escrow), flags: flags.map((f) => f.label) } };
    }

    if (method === 'POST' && rest[0] === 'claim') {
      return { status: 200, data: { escrow: engine.publicView(engine.claim(body?.code, user.id)) } };
    }

    const [id, action, milestoneId, milestoneAction] = rest;

    if (method === 'GET' && id && !action) {
      const escrow = engine.getOrThrow(id);
      engine.assertParty(escrow, user.id);
      return { status: 200, data: { escrow: engine.publicView(escrow), ledger: engine.entriesFor(id) } };
    }

    if (method === 'POST' && id) {
      if (action === 'fund') return { status: 200, data: { escrow: engine.publicView(engine.fund(id, user.id)) } };
      if (action === 'deliver') return { status: 200, data: { escrow: engine.publicView(engine.markDelivered(id, user.id, body?.note)) } };
      if (action === 'release') return { status: 200, data: { escrow: engine.publicView(engine.release(id, user.id)) } };
      if (action === 'cancel') return { status: 200, data: { escrow: engine.publicView(engine.cancel(id, user.id)) } };
      if (action === 'milestones' && milestoneAction === 'approve') {
        return { status: 200, data: { escrow: engine.publicView(engine.approveMilestone(id, milestoneId, user.id)) } };
      }
    }
  }

  /* ---------------------------- disputes --------------------------- */
  if (area === 'disputes') {
    const user = actorFor(token);
    const isAdmin = user.role === 'admin';

    if (method === 'GET' && rest.length === 0) {
      const all = disputes.all().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const scoped = isAdmin ? all : all.filter((d) => d.raisedById === user.id || d.againstId === user.id);
      const filtered = query.status
        ? scoped.filter((d) => String(query.status).split(',').includes(d.status))
        : scoped;
      return {
        status: 200,
        data: {
          disputes: filtered.map(disputeView),
          counts: {
            open: all.filter((d) => d.status === 'open').length,
            under_review: all.filter((d) => d.status === 'under_review').length,
            resolved: all.filter((d) => d.status === 'resolved').length,
          },
        },
      };
    }

    if (method === 'POST' && rest.length === 0) {
      const { escrowId, reason, evidenceUrls } = body ?? {};
      if (!reason || String(reason).trim().length < 12) {
        throw engine.badRequest('Tell us what went wrong — at least a sentence, so we can resolve it faster.');
      }
      const escrow = engine.getOrThrow(escrowId);
      const role = engine.assertParty(escrow, user.id);
      if (!['funded', 'in_progress'].includes(escrow.status)) {
        throw new DemoError('Only a funded escrow can be disputed.', 409, 'conflict');
      }
      if (disputes.findOne((d) => d.escrowId === escrowId && d.status !== 'resolved')) {
        throw new DemoError('There is already an open dispute on this escrow.', 409, 'conflict');
      }

      const ai = { ...engine.ruleClassify(reason), triagedAt: new Date().toISOString() };
      const id = randomId('dsp');
      disputes.set(id, {
        id,
        escrowId,
        raisedById: user.id,
        raisedByRole: role,
        againstId: role === 'buyer' ? escrow.sellerId : escrow.buyerId,
        reason: String(reason),
        evidenceUrls: Array.isArray(evidenceUrls) ? evidenceUrls.slice(0, 8) : [],
        ai,
        status: ai.severity === 'critical' ? 'under_review' : 'open',
        resolution: null,
        createdAt: new Date().toISOString(),
      });
      engine.markDisputed(escrowId, user.id);
      return { status: 201, data: { dispute: disputeView(disputes.get(id)) } };
    }

    const [id, action] = rest;

    if (method === 'GET' && id && !action) {
      const dispute = disputes.get(id);
      if (!dispute) throw engine.notFound('Dispute not found.');
      if (!isAdmin && ![dispute.raisedById, dispute.againstId].includes(user.id)) {
        throw engine.forbidden('You are not party to this dispute.');
      }
      return { status: 200, data: { dispute: disputeView(dispute) } };
    }

    if (method === 'POST' && id && action === 'review') {
      requireAdmin(user);
      return { status: 200, data: { dispute: disputeView(disputes.update(id, { status: 'under_review' })) } };
    }

    if (method === 'POST' && id && action === 'resolve') {
      requireAdmin(user);
      const dispute = disputes.get(id);
      if (!dispute) throw engine.notFound('Dispute not found.');
      const outcome = body?.outcome ?? 'refund_buyer';

      if (outcome === 'refund_buyer') engine.refund(dispute.escrowId);
      else if (outcome === 'release_seller') engine.release(dispute.escrowId, null);

      const resolved = disputes.update(id, {
        status: 'resolved',
        resolution: {
          outcome,
          note: body?.note ?? null,
          resolvedBy: user.id,
          resolvedAt: new Date().toISOString(),
        },
      });
      return { status: 200, data: { dispute: disputeView(resolved), reserve: engine.reserveSummary() } };
    }
  }

  /* ----------------------------- score ----------------------------- */
  if (area === 'score') {
    const [userId, sub] = rest;
    const target =
      users.get(userId) ?? users.findOne((u) => u.email === String(userId ?? '').toLowerCase());
    if (!target) throw engine.notFound('No SafePay profile for that user.');

    if (sub) throw engine.notFound('Not available in demo mode.');

    const viewer = token ? sessions.get(token) : null;
    const score = engine.computeScore(target.id);
    const detailed = viewer?.userId === target.id || users.get(viewer?.userId)?.role === 'admin';

    return {
      status: 200,
      data: {
        user: { id: target.id, name: target.name, memberSince: target.createdAt },
        score: score.score,
        tier: score.tier,
        tierLabel: score.tierLabel,
        stats: {
          escrowsCompleted: score.stats.escrowsCompleted,
          disputeRatePct: score.stats.disputeRatePct,
          uniqueCounterparties: score.stats.uniqueCounterparties,
          verificationTier: score.stats.verificationTier,
          medianReleaseHours: score.stats.medianReleaseHours,
          ...(detailed
            ? {
                totalValueSettledNaira: score.stats.totalValueSettledNaira,
                accountAgeDays: score.stats.accountAgeDays,
                concentrationFlag: score.stats.concentrationFlag,
              }
            : {}),
        },
        breakdown: score.breakdown,
        weights: score.weights,
        updatedAt: score.updatedAt,
      },
    };
  }

  /* --------------------------- developer --------------------------- */
  if (area === 'developer') {
    const user = actorFor(token);
    const EVENTS = ['escrow.created', 'escrow.funded', 'escrow.delivered', 'escrow.released', 'escrow.disputed', 'escrow.refunded'];
    const view = (a) => ({ ...a, webhookSecret: undefined });

    if (method === 'GET' && rest[0] === 'apps' && rest.length === 1) {
      return {
        status: 200,
        data: { apps: apps.find((a) => a.ownerId === user.id && !a.revoked).map(view), availableEvents: EVENTS },
      };
    }

    if (method === 'POST' && rest[0] === 'apps' && rest.length === 1) {
      const id = randomId('app');
      const testKey = `sk_test_${randomToken().slice(0, 24)}`;
      apps.set(id, {
        id,
        ownerId: user.id,
        name: String(body?.name ?? 'Untitled app').slice(0, 80),
        description: String(body?.description ?? '').slice(0, 400),
        webhookUrl: body?.webhookUrl ?? null,
        webhookSecret: `whsec_${randomToken().slice(0, 24)}`,
        subscribedEvents: EVENTS,
        testKeyPreview: `${testKey.slice(0, 11)}${'•'.repeat(18)}${testKey.slice(-4)}`,
        liveKeyPreview: null,
        liveEnabled: false,
        revoked: false,
        createdAt: new Date().toISOString(),
      });
      return { status: 201, data: { app: view(apps.get(id)), testKey, liveKey: null } };
    }

    const [, id, sub, subAction] = rest;
    const owned = () => {
      const app = apps.get(id);
      if (!app || app.ownerId !== user.id) throw engine.notFound('App not found.');
      return app;
    };

    if (method === 'GET' && id && !sub) return { status: 200, data: { app: view(owned()) } };
    if (method === 'PATCH' && id && !sub) {
      owned();
      return { status: 200, data: { app: view(apps.update(id, body ?? {})) } };
    }
    if (method === 'DELETE' && id && !sub) {
      owned();
      apps.update(id, { revoked: true });
      return { status: 200, data: { ok: true } };
    }
    if (method === 'POST' && id && sub === 'rotate') {
      owned();
      const mode = body?.mode === 'live' ? 'live' : 'test';
      const key = `sk_${mode}_${randomToken().slice(0, 24)}`;
      apps.update(id, { [`${mode}KeyPreview`]: `${key.slice(0, 11)}${'•'.repeat(18)}${key.slice(-4)}` });
      return { status: 200, data: { app: view(apps.get(id)), key } };
    }
    if (method === 'GET' && id && sub === 'webhooks') return { status: 200, data: { logs: [] } };
    if (method === 'GET' && id && sub === 'requests') {
      const days = Array.from({ length: 14 }, (_, i) => ({
        date: new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10),
        count: 0,
      }));
      return { status: 200, data: { logs: [], series: days } };
    }
    if (method === 'POST' && id && sub === 'webhooks' && subAction === 'test') {
      return { status: 200, data: { ok: true, deliveryId: randomId('whl') } };
    }
  }

  /* ----------------------------- admin ----------------------------- */
  if (area === 'admin') {
    requireAdmin(actorFor(token));

    if (method === 'GET' && rest[0] === 'overview') {
      const all = escrows.all();
      const held = all.filter((e) => ['funded', 'in_progress'].includes(e.status));
      const released = all.filter((e) => e.status === 'released');
      const openDisputes = disputes.find((d) => d.status !== 'resolved');
      const series = Array.from({ length: 14 }, (_, i) => {
        const day = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10);
        const onDay = released.filter((e) => (e.releasedAt ?? '').slice(0, 10) === day);
        return { date: day, valueKobo: onDay.reduce((s, e) => s + e.amountKobo, 0), count: onDay.length };
      });
      return {
        status: 200,
        data: {
          totals: {
            users: users.count(),
            escrows: all.length,
            heldKobo: held.reduce((s, e) => s + e.amountKobo, 0),
            settledKobo: released.reduce((s, e) => s + e.amountKobo, 0),
            openDisputes: openDisputes.length,
            openFlags: engine.openFlags().length,
            disputeRatePct: all.length ? Math.round((disputes.count() / all.length) * 1000) / 10 : 0,
          },
          reserve: engine.reserveSummary(),
          series,
          recentLedger: ledger.all().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20),
        },
      };
    }

    if (method === 'GET' && rest[0] === 'flags') {
      return { status: 200, data: { flags: engine.openFlags(), all: engine.openFlags().length } };
    }

    if (method === 'POST' && rest[0] === 'flags' && rest[1]) {
      const status = rest[2] === 'clear' ? 'cleared' : 'escalated';
      const flag = fraudFlags.get(rest[1]);
      if (!flag) throw engine.notFound('Flag not found.');
      return {
        status: 200,
        data: { flag: fraudFlags.update(flag.id, { status, reviewedAt: new Date().toISOString() }) },
      };
    }

    if (method === 'GET' && rest[0] === 'users') {
      return {
        status: 200,
        data: {
          users: users.all().map((u) => ({
            ...publicUser(u),
            escrows: escrows.find((e) => e.buyerId === u.id || e.sellerId === u.id).length,
            disputes: disputes.find((d) => d.againstId === u.id).length,
          })),
        },
      };
    }

    if (method === 'POST' && rest[0] === 'sweep') {
      return { status: 200, data: { released: engine.sweepAutoReleases().length } };
    }
  }

  throw new DemoError(`No demo route for ${method} ${path}`, 404, 'not_found');
}

/**
 * Entry point used by the API client. Resolves `{ status, data }`; throws
 * DemoError with an HTTP-ish status for anything the routes reject.
 */
export async function handleDemoRequest({ method, path, query, body, token }) {
  await ensureSeeded();
  await settle();
  return route(method.toUpperCase(), path, query ?? {}, body, token);
}
