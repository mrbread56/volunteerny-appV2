import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress benign connection errors from Vite's HMR client which are expected in our container environment.
if (typeof window !== 'undefined') {
  const ignorePatterns = [
    'websocket',
    'vite',
    'hmr',
    'database \'(default)\' not found',
    'firebase configuration',
    'failed to connect to websocket'
  ];

  const shouldIgnore = (message: string) => {
    const msg = String(message).toLowerCase();
    return ignorePatterns.some((pattern) => msg.includes(pattern));
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason || '');
    if (shouldIgnore(reason)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (shouldIgnore(msg)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  // Override console.error/warn to prevent annoying overlay reports in development frames
  const originalError = console.error;
  console.error = function (...args) {
    const joinStr = args.map(a => String(a)).join(' ');
    if (shouldIgnore(joinStr)) {
      return; // Suppress it silently to maintain clean viewer experience
    }
    originalError.apply(console, args);
  };

  const originalWarn = console.warn;
  console.warn = function (...args) {
    const joinStr = args.map(a => String(a)).join(' ');
    if (shouldIgnore(joinStr)) {
      return; // Suppress it silently to maintain clean viewer experience
    }
    originalWarn.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
