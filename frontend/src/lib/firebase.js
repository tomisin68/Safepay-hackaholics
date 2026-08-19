/**
 * Firebase bootstrap.
 *
 * The web config is not a secret — it ships in every client bundle by design,
 * and access is governed by Firebase Security Rules, not by hiding these keys.
 * They still live behind env vars so a fork can point at its own project
 * without editing source; the literals below are the defaults for safepay-6227f.
 *
 * Analytics is deliberately lazy and guarded. `getAnalytics()` throws outside a
 * browser and in environments without cookies/IndexedDB (Safari private mode,
 * some in-app webviews, SSR, tests) — calling it eagerly at module scope is a
 * blank-page bug waiting for the one judge on the wrong browser.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyDhhd-XJCtIZrQSKJylypgAUXl89w3tpIc',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'safepay-6227f.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'safepay-6227f',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'safepay-6227f.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '432748196696',
  appId: env.VITE_FIREBASE_APP_ID || '1:432748196696:web:40632c1087b23c81aceb2d',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || 'G-DVDBE7L8S4',
};

/** Initialised once, even across Vite HMR reloads. */
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let analyticsPromise = null;

/**
 * Resolves to the Analytics instance, or null when the browser cannot support
 * it. Never rejects — a missing analytics pixel must not break a payment app.
 */
export function analytics() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!firebaseConfig.measurementId) return Promise.resolve(null);

  return (analyticsPromise ??= import('firebase/analytics')
    .then(async ({ getAnalytics, isSupported }) => ((await isSupported()) ? getAnalytics(app) : null))
    .catch(() => null));
}

/** Fire-and-forget page/product event. Silently no-ops when unsupported. */
export async function track(name, params) {
  const instance = await analytics();
  if (!instance) return;
  const { logEvent } = await import('firebase/analytics');
  logEvent(instance, name, params);
}
