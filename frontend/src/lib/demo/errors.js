/**
 * The demo's error type, in its own module.
 *
 * It lives here rather than in engine.js so that wallet.js can throw one
 * without importing the engine — and the engine can import the wallet without
 * the two forming a cycle.
 *
 * `status` is an HTTP status because the API client treats a demo failure and a
 * network failure identically; every screen already knows what a 409 means.
 */
export class DemoError extends Error {
  constructor(message, status = 400, code = 'demo_error', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new DemoError(message, 400, 'bad_request', details);
export const forbidden = (message) => new DemoError(message, 403, 'forbidden');
export const notFound = (message) => new DemoError(message, 404, 'not_found');
export const conflict = (message, details) => new DemoError(message, 409, 'conflict', details);
