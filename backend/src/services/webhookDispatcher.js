import { apps, webhookLogs } from '../store/index.js';
import { randomId, signWebhook } from '../lib/crypto.js';

/**
 * Signed webhook delivery with bounded retries.
 *
 * Every request carries `SafePay-Signature: t=<unix>,v1=<hmac>` over
 * `${timestamp}.${rawBody}`. Receivers verify the HMAC and reject anything with
 * a timestamp outside their tolerance window, which kills replay attacks.
 */

const RETRY_DELAYS_MS = [0, 2_000, 10_000, 60_000];
const TIMEOUT_MS = 8_000;

export const EVENTS = [
  'escrow.created',
  'escrow.funded',
  'escrow.delivered',
  'escrow.released',
  'escrow.disputed',
  'escrow.refunded',
  'dispute.resolved',
  'score.updated',
];

async function attempt(app, event, payload, logId, attemptNo) {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ id: logId, event, createdAt: new Date().toISOString(), data: payload });
  const signature = signWebhook(app.webhookSecret, timestamp, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(app.webhookUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SafePay-Webhooks/1.0',
        'SafePay-Event': event,
        'SafePay-Delivery': logId,
        'SafePay-Signature': `t=${timestamp},v1=${signature}`,
      },
      body,
    });
    return { ok: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, error: err.name === 'AbortError' ? 'Timed out after 8s' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Fire-and-forget: a slow partner endpoint must never slow down an escrow. */
export function dispatch(appId, event, payload) {
  const app = apps.get(appId);
  if (!app?.webhookUrl) return null;
  if (Array.isArray(app.subscribedEvents) && !app.subscribedEvents.includes(event)) return null;

  const logId = randomId('whl');
  webhookLogs.set(logId, {
    id: logId,
    appId,
    event,
    url: app.webhookUrl,
    payload,
    status: 'pending',
    attempts: 0,
    responseStatus: null,
    error: null,
    createdAt: new Date().toISOString(),
  });

  (async () => {
    for (let i = 0; i < RETRY_DELAYS_MS.length; i += 1) {
      if (RETRY_DELAYS_MS[i]) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
      const result = await attempt(app, event, payload, logId, i + 1);
      webhookLogs.update(logId, {
        attempts: i + 1,
        status: result.ok ? 'delivered' : i === RETRY_DELAYS_MS.length - 1 ? 'failed' : 'retrying',
        responseStatus: result.status,
        error: result.error,
        deliveredAt: result.ok ? new Date().toISOString() : null,
      });
      if (result.ok) return;
    }
  })().catch((err) => console.error('[webhooks]', err));

  return logId;
}

/** Broadcast to every app owned by the users touched by an escrow. */
export function broadcast(userIds, event, payload) {
  const owners = new Set(userIds.filter(Boolean));
  for (const app of apps.all()) {
    if (owners.has(app.ownerId)) dispatch(app.id, event, payload);
  }
}

export const logsForApp = (appId, limit = 50) =>
  webhookLogs
    .find((l) => l.appId === appId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
