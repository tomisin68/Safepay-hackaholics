import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProviders } from './context/AppProviders';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);

/**
 * Firebase Analytics, after paint and off the critical path.
 *
 * Deferred deliberately: the SDK is ~40KB gzipped and nothing on screen waits
 * for it, so loading it during render would cost first paint for a measurement
 * pixel. `analytics()` resolves to null wherever the browser cannot support it
 * and never rejects, so nothing here can break the app.
 */
if (import.meta.env.PROD) {
  const start = () => import('./lib/firebase').then(({ analytics }) => analytics());
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 4000 });
  else setTimeout(start, 2000);
}
