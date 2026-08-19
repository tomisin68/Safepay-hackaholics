/**
 * Thin API client.
 *
 * One place that knows about tokens, error shape, and the base URL — so no
 * component ever touches fetch directly.
 */

const BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'safepay.token';

/**
 * Demo mode.
 *
 * A production build with no `VITE_API_URL` has no API to talk to: every
 * request would hit the static host and come back as a 405 or an HTML page.
 * Rather than ship a site where nothing works, that build serves itself from a
 * seeded in-browser database (see ./demo). Set `VITE_API_URL` and this turns
 * itself off; `VITE_DEMO_MODE=true|false` overrides the decision either way.
 *
 * In dev the Vite proxy forwards /v1 to localhost:4600, so demo mode stays off
 * unless it is asked for explicitly.
 */
const DEMO_FLAG = import.meta.env.VITE_DEMO_MODE;
export const isDemoMode =
  DEMO_FLAG === 'true' ? true : DEMO_FLAG === 'false' ? false : !BASE && import.meta.env.PROD;

let demoModule = null;
const demo = () => (demoModule ??= import('./demo/index.js'));

/** Re-seed the in-browser database. No-op when a real API is configured. */
export async function resetDemoData() {
  if (!isDemoMode) return false;
  const { resetDemo } = await demo();
  await resetDemo();
  return true;
}

async function demoRequest(path, { method, body, auth }) {
  const [pathname, search = ''] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(search));
  const { handleDemoRequest } = await demo();

  try {
    const { data } = await handleDemoRequest({
      method,
      path: pathname,
      query,
      body,
      token: auth ? getToken() : null,
    });
    return data;
  } catch (err) {
    const status = err.status ?? 500;
    if (status === 401 && auth && getToken()) {
      setToken(null);
      if (!location.pathname.startsWith('/login')) {
        location.assign(`/login?next=${encodeURIComponent(location.pathname)}`);
      }
    }
    throw new ApiError(err.message || `Request failed (${status})`, {
      status,
      code: err.code,
      details: err.details,
    });
  }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, auth = true, signal } = {}) {
  if (isDemoMode) return demoRequest(path, { method, body, auth });

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach SafePay. Check your connection and try again.', { status: 0 });
  }

  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  try {
    if (text) data = JSON.parse(text);
  } catch {
    // A non-JSON body (a proxy error page, say) is not fatal — fall through
    // with data still null and let the status code drive the outcome.
  }

  if (!res.ok) {
    // A dead session should not strand the user on a broken screen.
    if (res.status === 401 && auth && token) {
      setToken(null);
      if (!location.pathname.startsWith('/login')) {
        location.assign(`/login?next=${encodeURIComponent(location.pathname)}`);
      }
    }
    throw new ApiError(data?.error?.message || `Request failed (${res.status})`, {
      status: res.status,
      code: data?.error?.code,
      details: data?.error?.details,
    });
  }

  return data;
}

const get = (path, opts) => request(path, { ...opts, method: 'GET' });
const post = (path, body, opts) => request(path, { ...opts, method: 'POST', body: body ?? {} });
const patch = (path, body, opts) => request(path, { ...opts, method: 'PATCH', body: body ?? {} });
const del = (path, opts) => request(path, { ...opts, method: 'DELETE' });

export const api = {
  request,

  auth: {
    /**
     * Both of these can answer in one of two shapes:
     *
     *   { token, user }                          signed in
     *   { verificationRequired, challengeId, …}  an email code is outstanding
     *
     * Signup always returns the second. Login returns it too when the account
     * never finished verifying — see AppProviders, which is the one place that
     * has to tell them apart.
     */
    signup: (payload) => post('/v1/auth/signup', payload, { auth: false }),
    login: (payload) => post('/v1/auth/login', payload, { auth: false }),
    verifyEmail: (payload) => post('/v1/auth/verify-email', payload, { auth: false }),
    resendCode: (challengeId) => post('/v1/auth/resend-code', { challengeId }, { auth: false }),
    me: () => get('/v1/auth/me'),
    updateMe: (payload) => patch('/v1/auth/me', payload),
    directory: (q = '') => get(`/v1/auth/directory?q=${encodeURIComponent(q)}`),
  },

  escrows: {
    list: (params = '') => get(`/v1/escrows${params}`),
    get: (id) => get(`/v1/escrows/${id}`),
    create: (payload) => post('/v1/escrows', payload),
    fund: (id) => post(`/v1/escrows/${id}/fund`),
    deliver: (id, note) => post(`/v1/escrows/${id}/deliver`, { note }),
    release: (id) => post(`/v1/escrows/${id}/release`),
    cancel: (id) => post(`/v1/escrows/${id}/cancel`),
    approveMilestone: (id, milestoneId) => post(`/v1/escrows/${id}/milestones/${milestoneId}/approve`),
    claim: (code) => post('/v1/escrows/claim', { code }),
  },

  disputes: {
    list: (params = '') => get(`/v1/disputes${params}`),
    get: (id) => get(`/v1/disputes/${id}`),
    create: (payload) => post('/v1/disputes', payload),
    resolve: (id, payload) => post(`/v1/disputes/${id}/resolve`, payload),
    review: (id) => post(`/v1/disputes/${id}/review`),
  },

  score: {
    get: (userId) => get(`/v1/score/${encodeURIComponent(userId)}`, { auth: true }),
    public: (userId) => get(`/v1/score/${encodeURIComponent(userId)}`, { auth: false }),
    badgeUrl: (userId, theme = 'light') =>
      `${BASE || location.origin}/v1/score/${encodeURIComponent(userId)}/badge.svg?theme=${theme}`,
  },

  developer: {
    apps: () => get('/v1/developer/apps'),
    createApp: (payload) => post('/v1/developer/apps', payload),
    updateApp: (id, payload) => patch(`/v1/developer/apps/${id}`, payload),
    rotate: (id, mode) => post(`/v1/developer/apps/${id}/rotate`, { mode }),
    revoke: (id) => del(`/v1/developer/apps/${id}`),
    webhooks: (id) => get(`/v1/developer/apps/${id}/webhooks`),
    requests: (id) => get(`/v1/developer/apps/${id}/requests`),
    testWebhook: (id) => post(`/v1/developer/apps/${id}/webhooks/test`),
  },

  intelligence: {
    risk: (escrowId) => get(`/v1/intelligence/escrows/${escrowId}/risk`),
    dispute: (disputeId) => post('/v1/intelligence/dispute', { disputeId }),
  },

  admin: {
    overview: () => get('/v1/admin/overview'),
    flags: () => get('/v1/admin/flags'),
    reviewFlag: (id, action) => post(`/v1/admin/flags/${id}/${action}`),
    users: () => get('/v1/admin/users'),
    sweep: () => post('/v1/admin/sweep'),
  },
};
