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

/**
 * App Check: proof that requests come from OUR web app, not from a script
 * pointed at the project id.
 *
 * The Firestore rules are the authorization layer, and they are good — but
 * they authorize ACCOUNTS, not CLIENTS. Anyone can read the public web config
 * out of the bundle, sign up, and drive the database from curl or a bot at
 * whatever rate they like. App Check adds a second requirement: a reCAPTCHA v3
 * attestation that the caller is a real browser running this app.
 *
 * Gated on the env var, deliberately: with no site key set this whole block is
 * inert, so nothing changes for local dev, tests, or CI until the key is
 * provisioned in the console and added to the environment. Rollout order
 * matters and is documented in docs/RUNBOOK.md — register the app, set the
 * key, watch App Check metrics show legitimate traffic verifying, and only
 * THEN enforce, service by service. Enforcing before the client ships tokens
 * would lock every real user out.
 */
/*
 * App Check is OFF until it is proven to work, and that is a deliberate choice.
 *
 * As shipped it was initialised, loaded Google reCAPTCHA on every page for every
 * visitor including signed-out minors, produced a 400 on every page load, and
 * NEVER exchanged a token — verified in production on 29 Aug 2026: reCAPTCHA
 * loads, recaptcha/api2/clr returns 400, and there is no request to
 * firebaseappcheck.googleapis.com at all. So it provided no attestation
 * whatsoever.
 *
 * That is the worst of both: the whole privacy cost and none of the protection.
 * The cookie banner tells visitors "there are no advertising or analytics
 * trackers on this site, and nothing here follows you to other websites", and
 * reCAPTCHA v3 is continuous behavioural scoring that reads Google's cookies on
 * google.com — so the statement was false, for nothing in return. This site is
 * aimed at children, and the OPC's position is that such services should not
 * place tracking technologies at all.
 *
 * It is also a live hazard. The note below is right that enforcing before the
 * client ships tokens locks every real user out — and the client is not
 * shipping tokens. Anyone switching enforcement on in the console, seeing it
 * "configured", would take the site down for every user at once.
 *
 * To turn it back on: register the site key for this domain, confirm a token is
 * actually minted (a request to firebaseappcheck.googleapis.com that is not a
 * 400), THEN set VITE_APPCHECK_ENABLED=true alongside the site key. Two
 * variables, so that a key sitting in the environment can no longer switch on a
 * mechanism nobody has checked.
 */
const appCheckSiteKey = import.meta.env.VITE_APPCHECK_SITE_KEY;
const appCheckEnabled = String(import.meta.env.VITE_APPCHECK_ENABLED || '') === 'true';
if (appCheckSiteKey && appCheckEnabled) {
  import('firebase/app-check')
    .then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    })
    .catch((err) => {
      // Never let attestation setup break the app: unenforced App Check failing
      // to load costs nothing, and once enforcement is on, Firestore itself
      // will say so far more clearly than a swallowed import error.
      console.warn('[app-check] not initialised:', err?.message || err);
    });
}

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
