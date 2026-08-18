import { tooMany } from '../lib/errors.js';

/**
 * Fixed-window rate limiting, keyed per API key / user / IP.
 *
 * Deliberately dependency-free and in-process: for a single API node this is
 * exact, and the counter map is swept so it cannot grow without bound. A
 * multi-node deployment swaps the Map for Redis and keeps the same interface.
 */
export function rateLimit({ windowMs = 60_000, max = 120, name = 'default' } = {}) {
  const hits = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs);
  sweep.unref?.();

  return (req, res, next) => {
    const identity =
      req.actor?.appId ||
      req.actor?.userId ||
      req.ip ||
      req.socket?.remoteAddress ||
      'anonymous';
    const key = `${name}:${identity}`;
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(remaining));
    res.set('RateLimit-Reset', String(Math.ceil((entry.resetAt - now) / 1000)));

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(tooMany(`Too many requests. Try again in ${Math.ceil((entry.resetAt - now) / 1000)}s.`));
    }
    next();
  };
}
