import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// Read Firebase config from environment variables (VITE_ prefixed = exposed to client)
// Fall back to imported JSON for backward compatibility during migration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * This project has NO "(default)" Firestore database — it only has named ones.
 *
 * `initializeFirestore(app, {})` addresses "(default)", so every read and write
 * from the browser was aimed at a database that does not exist. That is the
 * source of the long-running "Offline mode: could not fetch profiles",
 * connection timeouts, and "Account setup didn't finish" symptoms: the requests
 * were not slow, they were 404ing.
 *
 * The variable below already existed and was simply never passed to
 * initializeFirestore — the wiring was lost at some point. Run
 * `npm run check:firebase` to list the databases that actually exist.
 */
const firestoreDatabaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID;

export const app = initializeApp(firebaseConfig);

export const db = firestoreDatabaseId
  ? initializeFirestore(app, {}, firestoreDatabaseId)
  : initializeFirestore(app, {});

if (!firestoreDatabaseId && import.meta.env.DEV) {
  console.warn(
    '[firebase] VITE_FIREBASE_DATABASE_ID is not set, so Firestore is pointing at ' +
      '"(default)". If this project has no (default) database, every query will fail. ' +
      'Run `npm run check:firebase` to see which databases exist.'
  );
}

export const auth = getAuth(app);
// `storage` is deliberately NOT exported from here.
//
// This module is imported by 18 files — every page, every context, the router.
// A module-scope `getStorage(app)` therefore pulled the whole Firebase Storage
// SDK (44.65 kB raw, 11.04 kB gzipped) into the entry chunk for every visitor,
// including anyone who only ever reads the landing page. Its single consumer is
// src/lib/storageUpload.ts, which now creates it itself and is loaded only when
// an upload actually happens.

// NOTE: a startup "connection test" used to read test/connection here. The
// security rules deny that path via the default catch-all, so it failed with
// permission-denied on every single page load and never proved connectivity.
// It only added a misleading error to the console, so it was removed.
export default app;
