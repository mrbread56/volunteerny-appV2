import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

/*
 * Vite's HMR client logs connection noise in containerised dev environments.
 * Silencing it is fine — silencing it in PRODUCTION is not, and that is what
 * this block used to do. Three specific problems, all now fixed:
 *
 *   1. It ran unconditionally, so the overrides shipped in the production
 *      bundle and hid real user-facing failures from the console, from the
 *      ErrorBoundary, and from any monitoring. It also swallowed
 *      `unhandledrejection` and `error` events outright.
 *   2. The ignore list contained "firebase configuration" and
 *      "database '(default)' not found" — genuine production failure modes,
 *      not dev noise.
 *   3. Matching was `lowercased.includes(pattern)`, and "vite" is a substring
 *      of "invite", so any error mentioning invites was silently discarded.
 *
 * The list is now anchored to Vite's own log prefixes, nothing is swallowed at
 * the event level, and the whole block folds away in a production build.
 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const isViteHmrNoise = (message: string) => {
    const msg = String(message);
    return (
      msg.startsWith('[vite]') ||
      msg.startsWith('[hmr]') ||
      msg.includes("WebSocket connection to 'ws://localhost") ||
      msg.includes('failed to connect to websocket (')
    );
  };

  const originalError = console.error;
  console.error = function (...args) {
    if (isViteHmrNoise(args.map((a) => String(a)).join(' '))) return;
    originalError.apply(console, args);
  };

  const originalWarn = console.warn;
  console.warn = function (...args) {
    if (isViteHmrNoise(args.map((a) => String(a)).join(' '))) return;
    originalWarn.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
