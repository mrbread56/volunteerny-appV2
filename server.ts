import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';
import { Resend } from 'resend';
import { emailTemplates } from './server/emailTemplates.js';
import { appOrigin, CANONICAL_APP_ORIGIN } from './server/appUrl.js';
import { totalLoggedHours } from './src/lib/hours.js';
import dotenv from 'dotenv';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

// Load .env file first thing
const envResult = dotenv.config();
if (envResult.error) {
  console.warn('[Dotenv] Could not load .env file:', envResult.error.message);
  console.warn('[Dotenv] Environment variables must be set another way (e.g., system env or Render dashboard).');
} else {
  console.log('[Dotenv] .env file loaded successfully.');
}

// Log which critical env vars are present (without revealing secrets)
console.log('[Startup] RESEND_API_KEY present:', !!process.env.RESEND_API_KEY);
console.log('[Startup] FIREBASE_SERVICE_ACCOUNT_KEY present:', !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
console.log('[Startup] GOOGLE_APPLICATION_CREDENTIALS present:', !!process.env.GOOGLE_APPLICATION_CREDENTIALS);
console.log('[Startup] GOOGLE_CLOUD_PROJECT:', process.env.GOOGLE_CLOUD_PROJECT || '(not set)');
console.log('[Startup] MAIL_FROM:', process.env.MAIL_FROM || '(not set)');
console.log('[Startup] NODE_ENV:', process.env.NODE_ENV || '(not set - defaulting to development)');
console.log('[Startup] APP_URL:', process.env.APP_URL || '(not set)');

// Two-factor sign-in depends entirely on outbound email, and the commonest
// cause of "the code never arrives" is a sender address Resend will not accept.
// Say so at boot rather than letting every OTP fail silently at runtime.
if (!process.env.RESEND_API_KEY) {
  console.warn('[Startup] WARNING: RESEND_API_KEY is not set — two-factor codes CANNOT be delivered.');
}
/**
 * MAIL_FROM gates outbound email only — it must NOT gate the whole API.
 *
 * This used to `process.exit(1)` in production. On a long-running host that is
 * a visible crash loop, but this app is also deployed to Vercel, where the
 * whole Express app is one serverless function: exiting at module load meant
 * EVERY /api/* route, including ones that never send mail, answered
 * `500 FUNCTION_INVOCATION_FAILED` with no indication of why. Observed live —
 * /api/auth/google/url, /api/leaderboard/refresh and even /api/nonexistent all
 * returned that, so a single unset mail variable read as "the entire backend is
 * down".
 *
 * Now the failure is scoped to the endpoints that actually need it, and it says
 * what is wrong instead of crashing.
 */
const MAIL_CONFIG_ERROR: string | null = !process.env.MAIL_FROM
  ? 'MAIL_FROM is not set. Every org login needs an emailed 2FA code, and the ' +
    'fallback sender "vny@volunteernorthyork.indevs.in" only works if that ' +
    'domain is verified in Resend. Verify a domain at https://resend.com/domains ' +
    'and set MAIL_FROM (see .env.example).'
  : null;

if (MAIL_CONFIG_ERROR) {
  // Loud at boot, and repeated on every mail request below, so it cannot scroll
  // past unnoticed the way the old warning did.
  console.error('[Startup] MAIL DISABLED: ' + MAIL_CONFIG_ERROR);
}

// This project has no "(default)" Firestore database, only named ones, so an
// unset FIREBASE_DATABASE_ID makes every Admin SDK call fail with a bare
// "5 NOT_FOUND" that names nothing. Observed in production: the leaderboard
// rebuild and the capacity endpoint both returned it. Say which variable is
// missing instead of leaving a gRPC status code to be decoded.
if (!process.env.FIREBASE_DATABASE_ID) {
  console.error(
    '[Startup] FIREBASE_DATABASE_ID is not set. The Admin SDK will address the ' +
      '"(default)" database, which does not exist in this project, so every server-side ' +
      'Firestore call fails with "5 NOT_FOUND" — leaderboard rebuilds and OTP persistence ' +
      'included. Run `npm run check:firebase` to list the databases that exist, then set it ' +
      'in the deployment environment.'
  );
}

/** Returns true when it has already answered the request. */
/**
 * One greppable line per event that matters.
 *
 *   vercel logs <url> | grep '"evt"'
 *   vercel logs <url> | grep '"evt":"hours_credited"'
 *
 * There are ~189 console.error/warn calls in this project. They are fine, and
 * nobody will ever read them: on Vercel they land unindexed in per-invocation
 * function logs. This is the small set that has to be findable AFTER the fact,
 * emitted as JSON so it can be filtered rather than eyeballed.
 *
 * uid only — never an email, name, school, OTP code or token. These users are
 * mostly minors and log lines outlive the request that wrote them. It is the
 * same reason firestore.rules refuses every client access to emailLog.
 */
function logEvent(evt: string, fields: Record<string, string | number | boolean | null> = {}) {
  console.log(JSON.stringify({ evt, at: new Date().toISOString(), ...fields }));
}

function mailUnavailable(res: any): boolean {
  if (!MAIL_CONFIG_ERROR) return false;
  console.error('[mail] request refused: ' + MAIL_CONFIG_ERROR);
  res.status(503).json({ error: 'Email is not configured on this server.', details: MAIL_CONFIG_ERROR });
  return true;
}

// Secure lazy initialization of firebase-admin
let adminApp: admin.app.App | null = null;
let adminInitFailed = false;
let adminInitErrorMsg = '';
function getFirebaseAdmin(): typeof admin | null {
  if (adminInitFailed) {
    console.warn('[Firebase Admin] Previously failed to initialize — returning null.');
    return null;
  }
  if (!adminApp) {
    console.log('[Firebase Admin] Attempting to initialize Firebase Admin SDK...');
    try {
      let projectId = process.env.GOOGLE_CLOUD_PROJECT || 'volunteer-ny';
      // Attempt to load local config if present
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          projectId = config.projectId || projectId;
          console.log('[Firebase Admin] Using projectId from config:', projectId);
        }
      } catch (e) {
        console.log('[Firebase Admin] Could not read firebase-applet-config.json, using projectId:', projectId);
      }

      // `import * as admin from 'firebase-admin'` yields an ESM namespace whose
      // members live under `.default` once esbuild/tsx transpiles the CJS
      // package. Unwrap ONCE, here, and use `adminObj` for everything below.
      //
      // This is the bug that broke two-factor sign-in: the code below used to
      // call `admin.credential.cert(...)` on the raw namespace, where
      // `credential` is undefined. The resulting TypeError was caught by a
      // handler that reported "Could not parse FIREBASE_SERVICE_ACCOUNT_KEY" —
      // blaming the JSON, which had in fact parsed fine — and execution
      // continued with `initConfig.credential` never assigned. Firebase Admin
      // then booted with nothing but a projectId:
      //
      //   * verifyIdToken() kept working, because it validates against Google's
      //     public certificates and needs no credentials. Users passed auth, so
      //     nothing looked wrong until the very last step.
      //   * setCustomUserClaims() and all Firestore admin access DO need
      //     credentials, so they threw — surfacing as "Your code was correct,
      //     but we could not complete verification on the server", and as the
      //     OTP store silently falling back to per-process memory.
      const adminObj = (admin as any).default || admin;

      const initConfig: admin.AppOptions = { projectId };
      let credentialSource = 'none';

      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.log('[Firebase Admin] Using GOOGLE_APPLICATION_CREDENTIALS for auth.');
        credentialSource = 'GOOGLE_APPLICATION_CREDENTIALS';
        // ADC picks this up automatically.
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        console.log('[Firebase Admin] FIREBASE_SERVICE_ACCOUNT_KEY found, attempting to parse...');

        // Parsing and credential construction are separated so their failures
        // can no longer be reported as each other.
        let serviceAccount: any = null;
        try {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        } catch (parseErr: any) {
          console.error('[Firebase Admin] FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON:', parseErr.message);
        }

        if (serviceAccount) {
          try {
            // Some env-var UIs (Vercel among them) turn the private key's real
            // newlines into literal backslash-n. A correctly-escaped key already
            // has real newlines after JSON.parse, so this only repairs the
            // mangled case and leaves a good key untouched.
            if (typeof serviceAccount.private_key === 'string') {
              serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
            }
            initConfig.credential = adminObj.credential.cert(serviceAccount);
            credentialSource = `service account (${serviceAccount.client_email})`;
            console.log('[Firebase Admin] Loaded service account credential for:', serviceAccount.client_email);
          } catch (certErr: any) {
            console.error('[Firebase Admin] Could not build a credential from the service account:', certErr.message);
          }
        }
      } else {
        console.warn('[Firebase Admin] No service account key found. Will try Application Default Credentials.');
      }

      // Booting without a credential is not a degraded mode — it is a broken
      // one that fails only at the last step of sign-in. Say so loudly.
      if (!initConfig.credential && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.error(
          '[Firebase Admin] NO CREDENTIAL ATTACHED. Token verification will still ' +
            'appear to work, but setting the mfaVerified claim and all Firestore admin ' +
            'access will fail — two-factor sign-in cannot complete. Check ' +
            'FIREBASE_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS.'
        );
      }

      adminApp = adminObj.initializeApp(initConfig);
      console.log(`[Firebase Admin] Initialized project "${projectId}" with credential: ${credentialSource}`);
    } catch (err: any) {
      if (!err.message.includes('already exists')) {
        console.warn('[Firebase Admin Initialization Failed]:', err.message || err);
        adminInitFailed = true;
        adminInitErrorMsg = err.message || 'Unknown initialization error';
        return null;
      }
      const adminObj = (admin as any).default || admin;
      adminApp = adminObj.app();
    }
  }
  return admin;
}

const envResendKey = (process.env.RESEND_API_KEY || '').trim();
const resend = envResendKey ? new Resend(envResendKey) : null;
if (!resend) {
  console.log('RESEND_API_KEY is not defined. Transactional emails will fail.');
} else {
  console.log('Using Resend API key configured in process.env (secured from browser access).');
}


async function verifyAuth(req: express.Request): Promise<{ uid: string; email?: string; emailVerified?: boolean; role?: string; isDemo: boolean; authTime?: number; error?: string }> {
  const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[verifyAuth] Missing or invalid authorization header');
      return { uid: '', isDemo: false, error: 'Missing or invalid authorization header' };
    }
  const token = authHeader.split('Bearer ')[1];
  
  // Demo-mode tokens are accepted ONLY outside production. These tokens are
  // self-asserted (anyone can send "Bearer demo-mode-token-developer"), so
  // honouring them on the live site would let an anonymous caller send mail
  // from our domain, read email history, and spend our AI quota. Demo mode in
  // the browser is unaffected: it never calls these endpoints with a real
  // account, and local/preview builds still accept the token as before.
  if (token.startsWith('demo-mode-token-')) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[verifyAuth] Rejected demo token in production.');
      return { uid: '', isDemo: false, error: 'Rejected demo token in production.' };
    }
    const role = token.replace('demo-mode-token-', '');
    console.log('[verifyAuth] Demo token accepted for role:', role);
    return {
      uid: 'demo-user-123',
      email: role === 'developer' ? 'developer@example.com' : 'demo@example.com',
      role: role,
      isDemo: true
    };
  }

  const adminInstance = getFirebaseAdmin();
    if (!adminInstance) {
      console.warn('[verifyAuth] Firebase Admin not initialized, cannot verify token');
      return { uid: '', isDemo: false, error: `Firebase Admin not initialized: ${adminInitErrorMsg || 'Unknown reason'}` };
    }

  try {
    const adminObj = (adminInstance as any).default || adminInstance;
    const decoded = await adminObj.auth().verifyIdToken(token);
    // uid only. This logged `email: <address>` on EVERY authenticated API call,
    // so a log stream that outlives the request accumulated the email addresses
    // of users who are mostly minors — the exact data the privacy policy
    // promises to protect, written out as a side effect of a debug line nobody
    // reads. The uid is enough to trace a request; the address adds nothing an
    // operator needs and everything a leak would cost.
    if (process.env.NODE_ENV !== 'production') {
      console.log('[verifyAuth] token verified for', decoded.uid);
    }
    return {
      uid: decoded.uid,
      email: decoded.email,
      // Needed by the developer allowlist. firestore.rules already requires it
      // there; the server did not, which made the server the weaker of the two.
      emailVerified: decoded.email_verified === true,
      role: decoded.role,
      isDemo: false,
      // Seconds since epoch, stamped by Firebase when the user actually
      // authenticated. Unlike iat it does NOT move on silent hourly token
      // refresh, so it identifies the sign-in session. /api/auth/verify-otp
      // pins the MFA claim to this value; see the note there.
      authTime: typeof decoded.auth_time === 'number' ? decoded.auth_time : undefined,
    };
  } catch (err: any) {
    console.warn('[verifyAuth] Token verification failed:', err.message || err);
    return { uid: '', isDemo: false, error: err.message || 'Token verification failed' };
  }
}

/**
 * Is this caller on the developer email allowlist?
 *
 * The verified-address requirement is the whole point, and four separate copies
 * of this check were missing it. Firebase does not make you prove you own an
 * address to register with it, so without `email_verified` anyone could sign up
 * using an allowlisted address that had not yet been registered and inherit
 * every developer power the server grants: reading every student's name, email
 * and school, deleting any account, crediting hours to anyone, reading resumes.
 * firestore.rules has always required it for exactly this reason — the server
 * simply did not, which made it the weaker of the two doors. The allowlist is
 * also VITE_-prefixed and therefore public in the client bundle, so the target
 * addresses are known.
 */
function isAllowlistedDeveloper(authContext: { email?: string; emailVerified?: boolean }): boolean {
  if (!authContext.emailVerified) return false;
  const email = (authContext.email || '').toLowerCase();
  if (!email) return false;
  return (process.env.VITE_DEVELOPER_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    .includes(email);
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Trust exactly one proxy hop — Vercel's.
//
// Without this, req.ip is the socket address (always the proxy) and any code
// reaching for the real client address has to read x-forwarded-for by hand,
// which the CLIENT controls. That is how the unauthenticated /api/log/client-error
// limiter was defeated: rotate the header, get a fresh bucket every request.
// `1` means "believe the last hop only", so a forged chain cannot extend it.
app.set('trust proxy', 1);

if (!process.env.VERCEL) {
  app.use(compression());
}
app.use(express.json());

  // CORS and Preflight handler
  app.use((req, res, next) => {
    // Same wrong default as the email templates had: this allowed the
    // MAIL_FROM domain, which is not where the app is served from, and did not
    // allow the origin that actually calls this API. See server/appUrl.ts.
    const allowedOrigin = process.env.NODE_ENV === 'production' ? appOrigin() : '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  // Strict Security Headers & HTTPS Enforcement Middleware
  app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    // Prevent MIME-type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Limit referrer leakage
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Enforce HTTPS in production
    // 307, not the default 302. A 302 tells clients they may retry as GET with
    // the body dropped, so any POST that hit this path — applying, sending
    // mail, verifying an OTP — would silently arrive as an empty GET instead of
    // failing loudly. 307 preserves method and body. It is also deliberately
    // temporary rather than 301/308: a permanently-cached redirect keyed to a
    // hostname is painful to undo if the domain ever moves.
    //
    // Loopback is exempt so local production-mode testing works. 127.0.0.1 and
    // ::1 are spelled out because req.hostname !== 'localhost' alone redirected
    // them, which is what made the security suite's probe hang.
    const loopback = ['localhost', '127.0.0.1', '::1', '[::1]'];
    if (
      process.env.NODE_ENV === 'production' &&
      !loopback.includes(req.hostname) &&
      req.headers['x-forwarded-proto'] !== 'https'
    ) {
      return res.redirect(307, `https://${req.get('host')}${req.url}`);
    }
    next();
  });

  let ai: GoogleGenAI | null = null;
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } else {
    console.warn('GEMINI_API_KEY environment variable is not defined.');
  }

  // --- OTP Logic & Cache ---
  // ══════════════════════════════════════════════════════════════════
  // OTP SYSTEM — rebuilt from scratch
  //
  // Previous version had 4 cascading bugs (Firebase Admin context loss,
  // stateless memory Map on Vercel, React Strict Mode duplicates, and
  // Firestore fallback masking errors). This version:
  //   1. Stores OTPs in Firestore only (no in-memory Map)
  //   2. Resolves the Firebase Admin context once via a helper
  //   3. Is idempotent (reuses unexpired codes on duplicate requests)
  //   4. Has flat, readable error handling — no nested try-catches
  // ══════════════════════════════════════════════════════════════════

  /** Get a properly-contexted Firebase Admin instance. Handles ESM/CJS interop. */
  function getAdminObj(): any {
    const inst = getFirebaseAdmin();
    if (!inst) return null;
    return (inst as any).default || inst;
  }

  /**
   * Firestore handle bound to the correct database.
   *
   * FIREBASE_DATABASE_ID must name a database that exists in the project; the
   * Admin SDK otherwise talks to "(default)". `npm run check:firebase` lists
   * what is actually there.
   */
  function adminFirestore(): any {
    const adminObj = getAdminObj();
    if (!adminObj) throw new Error('Firebase Admin is not initialized');
    const databaseId = process.env.FIREBASE_DATABASE_ID;
    if (!databaseId) return adminObj.firestore();
    // admin.firestore() takes only an App — selecting a named database needs
    // the modular getFirestore(app, databaseId).
    return getFirestore(adminObj.app(), databaseId);
  }

  /**
   * Rate limiter: max 5 OTP requests per 10-minute window per user.
   *
   * This used to be a bare in-process Map. The OTP *store* below already
   * dual-writes to Firestore so codes survive a restart, but the limiter did
   * not — so on any deployment with more than one instance (or after a restart)
   * the "5 per 10 minutes" ceiling silently became 5 per instance, per restart.
   * The counter now lives in Firestore alongside the code, with the Map kept
   * only as a same-process fast path and as a fallback if Firestore is down.
   *
   * Fails CLOSED on a Firestore read error only if the local Map already shows
   * the user at the limit; otherwise a transient outage would lock everyone out.
   */
  const otpRateLimit = new Map<string, { count: number; windowStart: number }>();
  const RATE_WINDOW_MS = 10 * 60 * 1000;
  const RATE_MAX = 5;

  async function isOtpRateLimited(uid: string): Promise<boolean> {
    const now = Date.now();
    const local = otpRateLimit.get(uid);
    const localFresh = local && now - local.windowStart <= RATE_WINDOW_MS;

    let ref: any = null;
    try {
      const adminObj = getAdminObj();
      if (adminObj) ref = adminFirestore().collection('otp_rate_limits').doc(uid);
    } catch {
      ref = null;
    }

    if (!ref) {
      // No Firestore: fall back to the per-process counter.
      if (!localFresh) {
        otpRateLimit.set(uid, { count: 1, windowStart: now });
        return false;
      }
      local!.count++;
      return local!.count > RATE_MAX;
    }

    try {
      // A transaction is what makes this correct across instances — two servers
      // racing on the same uid cannot both read "4" and both write "5".
      const overLimit = await adminFirestore().runTransaction(async (tx: any) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : null;
        const windowStart = typeof data?.windowStart === 'number' ? data.windowStart : 0;

        if (!data || now - windowStart > RATE_WINDOW_MS) {
          tx.set(ref, { count: 1, windowStart: now });
          return false;
        }
        const count = (typeof data.count === 'number' ? data.count : 0) + 1;
        tx.set(ref, { count, windowStart }, { merge: true });
        return count > RATE_MAX;
      });

      otpRateLimit.set(uid, {
        count: overLimit ? RATE_MAX + 1 : (localFresh ? local!.count + 1 : 1),
        windowStart: localFresh ? local!.windowStart : now,
      });
      return overLimit;
    } catch (err: any) {
      console.warn('[otp] rate-limit transaction failed, using in-process counter:', err.message);
      if (!localFresh) {
        otpRateLimit.set(uid, { count: 1, windowStart: now });
        return false;
      }
      local!.count++;
      return local!.count > RATE_MAX;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // OTP STORE
  //
  // The previous design had send-otp and verify-otp each independently pick
  // EITHER Firestore OR an in-process Map, choosing whichever happened to work
  // at that moment. That is why 2FA only worked occasionally:
  //
  //   * send falls back to memory after a transient Firestore write failure,
  //     then verify's Firestore READ succeeds and finds no document ->
  //     "No code was requested" even though the user is holding the email.
  //   * send falls back to memory, but a document from an EARLIER attempt is
  //     still in Firestore -> verify compares the typed code against that stale
  //     record -> "Incorrect code" even though the emailed digits were typed
  //     correctly. This is the "I got the email but it says wrong digits" case.
  //   * the Map is per-process, so on any restart, redeploy, or second instance
  //     a code issued by one process is invisible to the next.
  //
  // Fix: stop choosing. Every write goes to BOTH stores, and every read
  // consults BOTH and takes the most recently issued record. Divergence
  // between the two can then no longer produce a failure.
  // ══════════════════════════════════════════════════════════════════

  // `consumed` is a tombstone, not a deletion.
  //
  // Deleting the record on success or lockout looked tidier and was wrong on
  // serverless: clearOtp removed it from Firestore and from THE HANDLING
  // INSTANCE's Map, while every other warm instance kept its own copy with its
  // own lower attempt count — so a code that had already been used, or already
  // locked out, stayed live over there. Marking it instead means Firestore
  // always has an authoritative answer that a stale Map cannot override, while
  // a genuinely absent document still means "the write never landed", which is
  // the case the in-memory fallback exists for. One document per user, replaced
  // by the next send, so nothing accumulates.
  type OtpRecord = { otp: string; expires: number; attempts: number; issuedAt: number; consumed?: boolean };

  const memoryOtpStore = new Map<string, OtpRecord>();

  function otpDocRef(uid: string): any | null {
    const adminObj = getAdminObj();
    if (!adminObj) return null;
    try {
      // `adminObj.firestore()` addresses the "(default)" database. This project
      // has none — only named databases — so that call returned 5 NOT_FOUND on
      // every OTP read and write, silently forcing the store onto its
      // per-process memory fallback. A code issued by one process was then
      // invisible to the next, which is the "No code was requested" case.
      return adminFirestore().collection('verification_otps').doc(uid);
    } catch {
      return null;
    }
  }

  function isOtpRecord(v: any): v is OtpRecord {
    return !!v && typeof v.otp === 'string' && typeof v.expires === 'number';
  }

  /**
   * Read from both stores.
   *
   * Firestore is authoritative WHENEVER IT HAS A DOCUMENT — including a
   * consumed tombstone, which is how an already-used or locked-out code stops a
   * stale in-process Map on another instance from resurrecting it.
   *
   * A genuinely absent document is different, and the distinction is the whole
   * point of the dual store: it means the send-time write never landed, so the
   * only copy of the code the user is holding in their inbox is this instance's
   * memory. Falling back there is correct. Conflating "no document" with
   * "database unreachable" is what made a cleared code come back to life.
   */
  async function readOtp(uid: string): Promise<OtpRecord | null> {
    let fromDb: OtpRecord | null = null;
    let dbAnswered = false;
    try {
      const ref = otpDocRef(uid);
      if (ref) {
        const doc = await ref.get();
        dbAnswered = true;
        if (doc.exists) {
          const data = doc.data();
          if (isOtpRecord(data)) fromDb = data;
        }
      }
    } catch (err: any) {
      console.warn('[otp] Firestore read failed, relying on memory store:', err.message);
    }

    if (fromDb) {
      if (fromDb.consumed) {
        memoryOtpStore.delete(uid);
        return null;
      }
      const fromMem = memoryOtpStore.get(uid) || null;
      if (fromMem && !fromMem.consumed && fromMem.issuedAt > fromDb.issuedAt) return fromMem;
      return fromDb;
    }

    // No document. Either it was never written (Firestore write failed at send
    // time) or the database could not be reached — in both cases memory is the
    // only copy there is. dbAnswered is kept for clarity at the call site.
    void dbAnswered;
    const fromMem = memoryOtpStore.get(uid) || null;
    return fromMem && !fromMem.consumed ? fromMem : null;
  }

  /**
   * Check a submitted code and consume exactly one attempt, atomically.
   *
   * The attempt counter used to be a read-modify-write: verify-otp read the
   * record, compared, then wrote back attempts + 1. Fire N requests at once and
   * every one of them reads the same count and writes the same count + 1 — so a
   * whole concurrent batch cost ONE attempt, not N. With the 6-digit space at
   * 899,999 and no rate limiter on this endpoint, that reduced the second
   * factor to a matter of time for anyone holding the password. Doing the
   * compare and the increment inside one transaction is what makes "5 attempts"
   * mean five.
   *
   * Falls back to the in-process store only when Firestore cannot answer, which
   * is the same resilience the dual store was built for.
   */
  type OtpVerdict = {
    ok: boolean;
    reason?: 'none' | 'expired' | 'locked' | 'wrong' | 'busy';
    remaining?: number;
  };

  async function verifyOtpAtomic(uid: string, submitted: string): Promise<OtpVerdict> {
    // Tombstone rather than delete — see the note on OtpRecord.
    const tomb = (rec: OtpRecord): OtpRecord => ({ ...rec, consumed: true, attempts: 5 });

    const ref = otpDocRef(uid);
    if (ref) {
      try {
        const verdict: OtpVerdict = await adminFirestore().runTransaction(async (tx: any) => {
          const snap = await tx.get(ref);
          if (!snap.exists) return { ok: false, reason: 'none' };
          const rec = snap.data();
          if (!isOtpRecord(rec) || rec.consumed) return { ok: false, reason: 'none' };
          if (Date.now() > rec.expires) {
            tx.set(ref, tomb(rec));
            return { ok: false, reason: 'expired' };
          }
          if (rec.attempts >= 5) {
            tx.set(ref, tomb(rec));
            return { ok: false, reason: 'locked' };
          }
          if (rec.otp !== submitted) {
            tx.update(ref, { attempts: rec.attempts + 1 });
            return { ok: false, reason: 'wrong', remaining: 4 - rec.attempts };
          }
          tx.set(ref, tomb(rec));
          return { ok: true };
        });
        // Firestore decided; this instance's copy must not outlive that.
        if (verdict.ok || verdict.reason !== 'wrong') memoryOtpStore.delete(uid);
        else {
          const m = memoryOtpStore.get(uid);
          if (m) memoryOtpStore.set(uid, { ...m, attempts: m.attempts + 1 });
        }
        return verdict;
      } catch (err: any) {
        // Fail closed. This used to fall through to the memory store below,
        // which is a bypass an attacker can trigger deliberately.
        //
        // Firestore aborts a transaction when several of them contend for the
        // same document — precisely what a burst of guesses at one account
        // produces — so an attacker can provoke this branch on demand. The
        // fallback below is a per-instance Map, so every warm serverless
        // instance would then enforce its own independent count of five, never
        // seeing increments made by the others or by Firestore.
        //
        // This is a defensive change, not a fix for an observed breach:
        // `npm run check:concurrency` fires 200 simultaneous wrong codes and
        // the transaction holds at exactly 5 consumed attempts, with the rest
        // correctly reading the tombstone. The branch is closed because it
        // cannot be relied on to stay unreachable, not because it was reached.
        //
        // The memory store is still the right answer when Firestore is not
        // configured at all — that is the `ref == null` case below, and it is
        // reached without ever consulting Firestore. But once Firestore is the
        // authority, a failure to reach it must deny, not fall back to a weaker
        // authority.
        console.warn('[otp] verify transaction failed, denying this attempt:', err.message);
        return { ok: false, reason: 'busy' };
      }
    }

    // No Admin SDK, so there is no Firestore to be the authority. Single
    // process, so a plain check is atomic enough — no second reader to race.
    const rec = memoryOtpStore.get(uid);
    if (!rec || rec.consumed) return { ok: false, reason: 'none' };
    if (Date.now() > rec.expires) { memoryOtpStore.set(uid, tomb(rec)); return { ok: false, reason: 'expired' }; }
    if (rec.attempts >= 5) { memoryOtpStore.set(uid, tomb(rec)); return { ok: false, reason: 'locked' }; }
    if (rec.otp !== submitted) {
      memoryOtpStore.set(uid, { ...rec, attempts: rec.attempts + 1 });
      return { ok: false, reason: 'wrong', remaining: 4 - rec.attempts };
    }
    memoryOtpStore.set(uid, tomb(rec));
    return { ok: true };
  }

  /** Write to both stores. Firestore is best-effort; memory always succeeds. */
  async function writeOtp(uid: string, record: OtpRecord): Promise<void> {
    memoryOtpStore.set(uid, record);
    try {
      const ref = otpDocRef(uid);
      if (ref) await ref.set(record);
    } catch (err: any) {
      console.warn('[otp] Firestore write failed, memory store still holds the code:', err.message);
    }
  }

  /** Remove from both stores so a stale record can never win a later read. */
  async function clearOtp(uid: string): Promise<void> {
    memoryOtpStore.delete(uid);
    try {
      const ref = otpDocRef(uid);
      if (ref) await ref.delete();
    } catch {
      /* best effort */
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // LEADERBOARD AGGREGATION
  //
  // scalableLeaderboard.ts shipped an aggregateGlobalLeaderboard() that its own
  // comment said runs "periodically via a Cloud Function or cron worker". No
  // such worker existed, so /leaderboards/global_top was never written and the
  // Leaderboard tab only ever showed hardcoded placeholder peers.
  //
  // It also could not have worked from the browser: firestore.rules allows
  // `list` on /students only to the owner or a developer, and allows `write` on
  // /leaderboards only to a developer. Aggregation is inherently a privileged,
  // cross-user read, so it belongs here on the Admin SDK, which bypasses rules.
  // ══════════════════════════════════════════════════════════════════

  const LEADERBOARD_TOP_N = 100;
  let lastAggregateAt = 0;

  async function rebuildGlobalLeaderboard(): Promise<{ count: number }> {
    const dbAdmin = adminFirestore();

    // trackerEnabled === false means the student opted out of rankings, so they
    // must not appear at all. Firestore cannot combine that inequality with an
    // orderBy on a different field without a composite index, so we over-fetch
    // and filter in memory — cheap at this collection size.
    const snap = await dbAdmin
      .collection('students')
      .orderBy('hours', 'desc')
      .limit(LEADERBOARD_TOP_N * 2)
      .get();

    const entries = snap.docs
      .map((d: any) => ({ id: d.id, data: d.data() || {} }))
      .filter(({ data }: any) => data.trackerEnabled !== false)
      .slice(0, LEADERBOARD_TOP_N)
      .map(({ id, data }: any) => ({
        userId: id,
        // Honour the anonymity toggle here, server-side. Sending the real name
        // and letting the client hide it would leak it to every viewer.
        name: data.trackerAnonymous ? 'Anonymous Student' : (data.fullName || 'Anonymous Student'),
        score: Number(data.hours || 0),
        updatedAt: new Date().toISOString(),
      }));

    await dbAdmin.collection('leaderboards').doc('global_top').set(
      { entries, lastUpdated: new Date().toISOString(), totalTracked: entries.length },
      { merge: true }
    );

    lastAggregateAt = Date.now();
    return { count: entries.length };
  }

  /**
   * Called by the client after any event that changes a student's hour total
   * (an organization approving hours, a direct credit log). Throttled so a burst
   * of approvals collapses into one rebuild — /leaderboards/global_top is a
   * single document and Firestore caps sustained writes to roughly 1/sec on one
   * document.
   */
  app.post('/api/leaderboard/refresh', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (authContext.isDemo) {
        return res.json({ success: true, skipped: 'demo-mode' });
      }
      if (!getAdminObj()) {
        return res.status(500).json({ error: 'Server configuration error.' });
      }

      const THROTTLE_MS = 30 * 1000;
      if (Date.now() - lastAggregateAt < THROTTLE_MS) {
        return res.json({ success: true, throttled: true });
      }

      const result = await rebuildGlobalLeaderboard();
      return res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[leaderboard] rebuild failed:', err);
      return res.status(500).json({
        error: 'Failed to rebuild leaderboard',
        ...(process.env.NODE_ENV !== 'production' ? { details: err?.message } : {}),
      });
    }
  });

  /**
   * The scheduled rebuild. vercel.json registers a daily cron on this path.
   *
   * It has never once run. Vercel invokes crons with GET and the only handler
   * was app.post, so every nightly invocation hit a bare 404 — and because the
   * setInterval safety net below is deliberately disabled on Vercel, and the
   * POST route needs a Firebase ID token no cron can produce, the production
   * board was only ever rebuilt when a browser happened to trigger it. A
   * student who opted out of the rankings could stay listed indefinitely.
   *
   * Authenticated by CRON_SECRET when it is set (Vercel sends it as a bearer
   * token), falling back to the x-vercel-cron marker. A spoofed marker buys
   * nothing an ordinary signed-in user could not already do through the POST
   * route: this reads only server-side data and writes one derived document.
   */
  /**
   * Liveness, for an external monitor. Unauthenticated, called every few minutes.
   *
   * Its real job is to prove THIS MODULE LOADED. api/index.ts imports the whole
   * Express app, so a single bad module load 500s every /api/* route at once
   * while Vercel's CDN keeps serving a perfectly healthy-looking SPA — a student
   * browses opportunities happily and then every apply, every hours submission
   * and every sign-in code fails silently. That has happened twice here: the
   * extensionless import, and MAIL_FROM calling process.exit at load. In both
   * cases this handler does not answer at all, which is the correct signal.
   *
   * Everything it asserts is in-process. Deliberately NO Firestore read (it is
   * public and uncached, so a loop against it would bill a read per request —
   * the same mistake /api/leaderboard/refresh already had to be hardened
   * against), NO Resend call (it would spend the send quota and cause the very
   * outage it exists to detect), and NO token verification (a round trip to
   * Google on every probe, and a monitor holds no Firebase token anyway).
   *
   * Booleans only. A public endpoint gets no secrets, no error strings and no
   * stack traces — but each key names the broken thing well enough to reach the
   * right RUNBOOK section.
   */
  app.get('/api/health', (_req, res) => {
    const checks = {
      // Lazy init: parses the service account locally, no network. Catches a
      // rotated or malformed key.
      adminInit: !!getAdminObj(),
      // Unset makes every server-side Firestore call fail with a bare
      // 5 NOT_FOUND against a "(default)" database this project does not have.
      databaseId: !!process.env.FIREBASE_DATABASE_ID,
      // Unset locks every organization out of sign-in: their second factor
      // arrives by email or not at all.
      mailFrom: !!process.env.MAIL_FROM,
      resendKey: !!process.env.RESEND_API_KEY,
      // Unset fails the nightly leaderboard rebuild closed, silently.
      cronSecret: !!process.env.CRON_SECRET,
    };
    const ok = Object.values(checks).every(Boolean);
    // The STATUS CODE is the whole public answer. An earlier version returned
    // the per-check booleans and the deployed commit to anyone who asked, which
    // told an anonymous caller exactly which subsystem was unconfigured —
    // including whether CRON_SECRET exists, i.e. whether the cron and deep
    // health routes are reachable at all — and pinned the running source
    // version. A monitor only needs 200 or 503; the detail belongs behind the
    // same bearer /api/health/deep already requires.
    res
      .status(ok ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({ ok });
  });

  /**
   * The deeper check: one authenticated request a day that actually looks at
   * the data.
   *
   * This exists mainly to connect a pipe that was built and never plugged in.
   * `clientErrors` had exactly one reference in the whole codebase — the write.
   * Every permission-denied and failed read the app has ever reported has been
   * accumulating in a collection nothing has opened. That is the fastest signal
   * this application can produce about its own health, and it was invisible.
   *
   * Same auth shape as the cron: an unset secret disables it rather than
   * leaving an unauthenticated endpoint that reads the database.
   */
  app.get('/api/health/deep', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const adb = adminFirestore();
      if (!adb) return res.status(503).json({ ok: false, firestore: 'unavailable' });
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // One real read, and it doubles as a cron-liveness check: this document's
      // lastUpdated is written by the nightly rebuild, so a stale timestamp
      // means a student who opted out of the rankings is still listed.
      const board = await adb.collection('leaderboards').doc('global_top').get();
      const lastUpdated = board.exists ? board.data()?.lastUpdated : null;
      const boardAgeHours = lastUpdated
        ? Math.round((Date.now() - Date.parse(String(lastUpdated))) / 3.6e6)
        : null;

      // Single-field range only, so no composite index is needed; status is
      // filtered in memory for the same reason.
      const mail = await adb.collection('emailLog').where('at', '>=', since).limit(200).get();
      const emailFailures24h = mail.docs.filter((d: any) => d.data()?.status === 'failed').length;

      const errs = await adb.collection('clientErrors')
        .where('at', '>=', since).orderBy('at', 'desc').limit(50).get();

      const ok =
        emailFailures24h === 0 &&
        errs.size < 10 &&
        boardAgeHours !== null && boardAgeHours < 48;

      res.status(ok ? 200 : 503).set('Cache-Control', 'no-store').json({
        ok,
        // Moved off the public endpoint: which subsystem is unconfigured, and
        // which commit is running, are operator details rather than liveness.
        checks: {
          adminInit: !!getAdminObj(),
          databaseId: !!process.env.FIREBASE_DATABASE_ID,
          mailFrom: !!process.env.MAIL_FROM,
          resendKey: !!process.env.RESEND_API_KEY,
          cronSecret: true,
        },
        commit: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7),
        firestore: 'ok',
        boardAgeHours,
        emailFailures24h,
        clientErrors24h: errs.size,
        // Context only. Never the message — it can contain user input.
        topContexts: [...new Set(errs.docs.map((d: any) => d.data()?.context))].slice(0, 5),
      });
    } catch (err: any) {
      logEvent('health_deep_failed', { msg: String(err?.message || err).slice(0, 200) });
      res.status(503).json({ ok: false, firestore: 'unreachable' });
    }
  });

  app.get('/api/leaderboard/refresh', async (req, res) => {
    // Fails CLOSED when CRON_SECRET is unset.
    //
    // This used to fall back to "is the x-vercel-cron header present?" when no
    // secret was configured — and no secret IS configured anywhere: not in
    // .env.example, not in vercel.json, not in the runbook. So the fallback was
    // the live branch, and anyone could run `curl -H 'x-vercel-cron: 1'` in a
    // loop to trigger a full students scan plus a write to a single document,
    // unauthenticated and billed to us. Worse, this route deliberately skips
    // the 30-second throttle the POST route has, so it was the cheaper of the
    // two to abuse. A cron that silently stops running is a far smaller problem
    // than an open amplification endpoint, so an unset secret now disables it
    // and says so in the logs.
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      console.warn('[leaderboard] CRON_SECRET is not set, so the scheduled rebuild is disabled.');
      return res.status(503).json({ error: 'Scheduled rebuild is not configured.' });
    }
    if (req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!getAdminObj()) return res.status(500).json({ error: 'Server configuration error.' });

    // Throttled, unlike before. A daily cron never trips a 30-second window, so
    // this costs the legitimate caller nothing and bounds a leaked secret.
    const CRON_THROTTLE_MS = 30 * 1000;
    if (Date.now() - lastAggregateAt < CRON_THROTTLE_MS) {
      return res.json({ success: true, throttled: true });
    }
    try {
      const result = await rebuildGlobalLeaderboard();
      console.log(`[leaderboard] cron rebuild — ${result.count} ranked student(s)`);
      return res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[leaderboard] cron rebuild failed:', err);
      return res.status(500).json({ error: 'Failed to rebuild leaderboard' });
    }
  });

  // A safety net so the board cannot go permanently stale if no approvals
  // happen to fire the endpoint above. Cheap: one indexed query every 15 min.
  const LEADERBOARD_INTERVAL_MS = 15 * 60 * 1000;
  if (getAdminObj() && !process.env.VERCEL) {
    // Build once at boot so a fresh deploy never serves an empty board, then
    // keep it warm on a timer.
    rebuildGlobalLeaderboard()
      .then(({ count }) => console.log(`[leaderboard] built at startup — ${count} ranked student(s)`))
      .catch((err) => console.warn('[leaderboard] startup build failed:', err.message));

    setInterval(() => {
      rebuildGlobalLeaderboard().catch((err) =>
        console.warn('[leaderboard] scheduled rebuild failed:', err.message)
      );
    }, LEADERBOARD_INTERVAL_MS).unref();
  }

  /**
   * Credit a student with approved volunteer hours.
   *
   * This exists because the rule it replaces could not be made safe.
   * firestore.rules let any account with role == 'organization' write
   * loggedHours and hours to ANY student document: hasOnly() constrains which
   * fields may be written, never whose document they are written to. Creating
   * an organization account is free and instant, so anyone could credit — or
   * erase — the hours of any student whose uid they knew. Ontario requires 40
   * community-involvement hours to graduate, which makes that a forged or
   * destroyed graduation record.
   *
   * The missing check is "does this organization actually have a relationship
   * with this student", and rules cannot express it: they can only read an
   * exact document path, while the answer needs a query over applications and
   * opportunities. The Admin SDK can run that query, so the authority moves
   * here and the organization branch is gone from the rules entirely.
   *
   * A caller must satisfy one of:
   *   - it is named on the pending hoursRequest being approved, or
   *   - the student holds an accepted application to an opportunity it owns.
   */
  /**
   * Delete an account for real — Auth identity included.
   *
   * The developer console used to do this from the browser, deleting
   * users/{id} and then students/{id} or organizations/{id}. The client cannot
   * touch Firebase Auth, so the identity always survived: the "deleted" person
   * could still sign in, and firestore.rules lets a signed-in account create
   * its own users doc, so they came back — with whichever role they chose on
   * the way in. It also manufactured exactly the orphaned-account state the
   * incomplete-profile recovery screen exists to apologise for.
   *
   * Only the Admin SDK can remove the identity, so the operation belongs here.
   * Auth is deleted FIRST: if that fails the documents are left alone and the
   * caller is told, which is recoverable. The reverse order would leave a
   * signed-in identity with no profile — the exact orphan we are removing.
   */
  /**
   * The developer console's student list, as an allow-listed projection.
   *
   * The console used to read up to 200 whole student documents straight from
   * the browser. `resumeUrl` and `passportUrl` on those documents are not URLs
   * — they hold entire files as base64, capped at 400 KB EACH by the rules — so
   * a list that renders a name, an email and a school was pulling as much as
   * 160 MB of minors' identity documents into a browser tab, over and over, on
   * every load. The Firestore web SDK has no field projection, so the only
   * place this can be narrowed is here.
   *
   * Same shape as GET /api/students/:id/review-profile, which already does
   * exactly this for organizations. loggedHours collapses to a count because
   * the console only ever renders its length, and 200 students x up to 500
   * entries is its own payload problem.
   */
  app.get('/api/admin/students', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const adb = adminFirestore();
      const callerSnap = await adb.collection('users').doc(authContext.uid).get();
      const caller = callerSnap.exists ? callerSnap.data() : null;
      const isDeveloperCaller =
        caller?.role === 'developer' ||
        isAllowlistedDeveloper(authContext);
      if (!isDeveloperCaller) {
        return res.status(403).json({ error: 'Only a developer can list students.' });
      }

      const snap = await adb.collection('students').limit(200).get();
      const students = snap.docs.map((d: any) => {
        const s = d.data() || {};
        // Allow-list, not a deny-list: a field added to the student document
        // later must be opted IN here, so the next base64 blob somebody stores
        // does not silently start shipping to the browser again.
        return {
          uid: d.id,
          fullName: s.fullName || '',
          email: s.email || '',
          school: s.school || '',
          grade: s.grade ?? '',
          isBanned: s.isBanned === true,
          hours: Number(s.hours) || 0,
          loggedHoursCount: Array.isArray(s.loggedHours) ? s.loggedHours.length : 0,
        };
      });

      return res.json({ students });
    } catch (err: any) {
      console.error('[admin/students] failed:', err);
      return res.status(500).json({ error: 'Could not load the student list.' });
    }
  });

  /**
   * Delete an account and everything hanging off it.
   *
   * The role is read from users/{userId}, never from the caller. It used to be
   * taken from the request body and used to pick which profile collection to
   * clear — so a wrong or stale value deleted the sign-in identity and the
   * users document, then cleared nothing, leaving exactly the orphaned profile
   * this endpoint exists to prevent, and answering 200.
   *
   * The cascade matters more than it looks. Opportunities are world-readable
   * (firestore.rules), so an organization deleted without them leaves live
   * postings that students keep finding and applying to, with nobody able to
   * ever accept them. A deleted student likewise leaves applications sitting in
   * organizations' queues whose Review button 404s.
   *
   * Batches are capped. These collections are small per user, and a runaway
   * delete loop in a serverless handler is worse than a few survivors — which
   * a repeat call clears anyway.
   */
  async function purgeAccount(adb: any, adminObj: any, userId: string) {
    const userSnap = await adb.collection('users').doc(userId).get();
    const role = userSnap.exists ? userSnap.data()?.role : null;
    // Read before anything is deleted — emailLog is keyed by ADDRESS, and once
    // the account document is gone there is no way back to it.
    const userEmail = userSnap.exists ? String(userSnap.data()?.email || '') : '';

    const deleteWhere = async (coll: string, field: string, value: string) => {
      // Paginated. This was a single `.limit(300)` with nothing after it, so an
      // account with more than 300 rows in any one collection kept the
      // remainder forever — a deletion that silently only half-deletes is worse
      // than one that fails, because nobody finds out.
      let removed = 0;
      for (;;) {
        const snap = await adb.collection(coll).where(field, '==', value).limit(300).get();
        if (snap.empty) break;
        await Promise.all(snap.docs.map((d: any) => d.ref.delete()));
        removed += snap.size;
        if (snap.size < 300) break;
      }
      return removed;
    };

    // Documents first, sign-in identity LAST.
    //
    // The other order is unrecoverable. Deleting the Auth record first and then
    // hitting anything — a Firestore hiccup, a missing index, a serverless time
    // limit part-way through an organization's opportunities — leaves a person
    // with no way to sign in, therefore no way to retry, while
    // students/{uid} still holds their passportUrl: a base64 passport scan of a
    // minor. Only a developer could then clean it up. This way a failure leaves
    // the account intact and retryable, which is the safe direction to fail.
    if (role === 'organization') {
      // Applications point at an opportunity, so clear them before the
      // opportunity that identifies them disappears.
      const opps = await adb.collection('opportunities').where('orgId', '==', userId).limit(300).get();
      for (const opp of opps.docs) {
        await deleteWhere('applications', 'opportunityId', opp.id);
        await deleteWhere('savedOpportunities', 'opportunityId', opp.id);
        await opp.ref.delete();
      }
    } else if (role === 'student') {
      await deleteWhere('applications', 'studentId', userId);
      await deleteWhere('savedOpportunities', 'studentId', userId);
      await deleteWhere('hoursRequests', 'studentId', userId);
      await deleteWhere('interestRequests', 'studentId', userId);
    }

    // Four collections carry identifiers and none of them were purged, so a
    // deleted account left its name, email and free text behind in each:
    //   feedbacks   userId, userEmail, and whatever they wrote
    //   reports     reportingUserId/Email/Name AND reportedUserId/Name
    //   orgRatings  studentId — and the document id is literally
    //               {studentUid}_{orgUid}_{opportunityId}, so the identifier
    //               survives even if every field is cleared
    //   emailLog    the recipient address of everything ever sent to them
    // A deletion request that leaves those is not a deletion.
    await deleteWhere('feedbacks', 'userId', userId);
    await deleteWhere('reports', 'reportingUserId', userId);
    await deleteWhere('reports', 'reportedUserId', userId);
    await deleteWhere('orgRatings', 'studentId', userId);
    await deleteWhere('orgRatings', 'orgId', userId);
    // emailLog is keyed by the recipient ADDRESS, not by uid.
    //
    // This used to be deleteWhere('emailLog', 'toUid', userId) — and `toUid` is
    // written nowhere. recordEmailLog persists { to, subject, templateName,
    // status, error, sentBy, at }, so the query matched zero documents every
    // time and a deleted user's email address survived in the log. The only
    // thing that ever removed it was an opportunistic 30-day prune that runs
    // when a developer happens to open the Control Room.
    if (userEmail) {
      await deleteWhere('emailLog', 'to', userEmail);
      await deleteWhere('emailLog', 'sentBy', userEmail);
    }

    // References written ABOUT this student. Absent from the purge entirely,
    // and the authoring organization could still read them afterwards — they
    // carry studentId, studentName and free text about a named minor.
    await deleteWhere('recommendations', 'studentId', userId);
    await deleteWhere('recommendations', 'orgId', userId);

    // Reported client errors carry uid, path and user agent.
    await deleteWhere('clientErrors', 'uid', userId);

    // ── Cloud Storage ────────────────────────────────────────────────────
    //
    // Deletion never touched it. Every upload lands under {collection}/{uid}/,
    // so the objects simply stayed: a student's resume, an organization's logo,
    // and the photographs attached to safety reports and feedback — evidence
    // involving minors.
    //
    // Worse than orphaned data. Every URL this app hands out is a
    // getDownloadURL() link with a token embedded in it, and that token
    // BYPASSES storage.rules entirely — so any link already shared, pasted into
    // an email, or sitting in someone's history kept resolving forever after
    // the account was erased. "Delete my account" did not delete the most
    // sensitive thing the account held.
    //
    // deleteFiles is prefix-based and paginated by the SDK. Failures are
    // collected rather than thrown: a Storage problem must not abort a purge
    // that has already removed the Firestore half, or the account is left
    // in a worse state than before it was asked for.
    const storageFailures: string[] = [];
    try {
      const bucket = adminObj.storage().bucket(process.env.VITE_FIREBASE_STORAGE_BUCKET);
      for (const prefix of [
        `students/${userId}/`,
        `organizations/${userId}/`,
        `reports/${userId}/`,
        `feedbacks/${userId}/`,
      ]) {
        try {
          await bucket.deleteFiles({ prefix, force: true });
        } catch (err: any) {
          storageFailures.push(`${prefix}: ${err?.message || err}`);
        }
      }
    } catch (err: any) {
      storageFailures.push(`bucket unavailable: ${err?.message || err}`);
    }
    if (storageFailures.length) {
      // Loud, because the remnant is a file about a minor that someone asked to
      // have removed. RUNBOOK covers clearing it by hand.
      logEvent('purge_storage_incomplete', { target: userId, failures: storageFailures.length });
      console.error('[purge] Storage objects NOT removed for', userId, storageFailures);
    }

    if (role === 'student' || role === 'organization') {
      await adb.collection(role === 'student' ? 'students' : 'organizations').doc(userId).delete();
    }
    await adb.collection('users').doc(userId).delete();

    // The board is a materialised snapshot, so deleting the student's documents
    // does NOT remove them from it. Their name and hours stayed visible to every
    // signed-in user until the next nightly rebuild — which is a disclosure of a
    // minor's data after they asked to be erased.
    rebuildGlobalLeaderboard().catch((err: any) =>
      console.error('[purgeAccount] leaderboard rebuild after deletion failed:', err?.message || err),
    );

    let authDeleted = false;
    try {
      await adminObj.auth().deleteUser(userId);
      authDeleted = true;
    } catch (authErr: any) {
      // Already gone is a success here: it means a previous half-finished
      // delete left documents behind, and clearing them is exactly the job.
      if (authErr?.code !== 'auth/user-not-found') throw authErr;
    }

    return { authDeleted, role };
  }

  /**
   * Let a signed-in user delete their own account.
   *
   * The profile screens used to do this from the browser with deleteDoc on
   * users/{uid} and then students|organizations/{uid}. firestore.rules is
   * `allow delete: if false` on users and developer-only on both profile
   * collections, so the very first call threw, user.delete() on the next line
   * never ran, and the student saw a raw "Missing or insufficient permissions".
   * Nothing was ever deleted — including uploaded passport scans of minors.
   */
  app.post('/api/account/delete', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (authContext.isDemo) {
        return res.status(403).json({ error: 'Demo mode cannot delete real accounts.' });
      }
      // Confirming the address proves this is the account holder acting
      // deliberately, and matches what the UI already asks them to type.
      const { confirmEmail } = req.body || {};
      if (
        typeof confirmEmail !== 'string' ||
        confirmEmail.trim().toLowerCase() !== (authContext.email || '').toLowerCase()
      ) {
        return res.status(400).json({ error: 'The confirmation email does not match this account.' });
      }

      const adminObj = getAdminObj();
      if (!adminObj) throw new Error('Firebase Admin is not initialized');
      const result = await purgeAccount(adminFirestore(), adminObj, authContext.uid);
      console.warn(`[account/delete] ${authContext.email || authContext.uid} deleted their own account`);
      return res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[account/delete] failed:', err);
      return res.status(500).json({ error: 'Could not delete your account. Please try again.' });
    }
  });

  app.post('/api/admin/delete-user', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      // Demo sessions must never reach a real deletion.
      if (authContext.isDemo) {
        return res.status(403).json({ error: 'Demo mode cannot delete real accounts.' });
      }

      const { userId } = req.body || {};
      if (typeof userId !== 'string' || !userId.trim()) {
        return res.status(400).json({ error: 'userId is required.' });
      }

      const adb = adminFirestore();
      // The role is read from the database, never from the request body — the
      // same rule the hours endpoint follows.
      const callerSnap = await adb.collection('users').doc(authContext.uid).get();
      const caller = callerSnap.exists ? callerSnap.data() : null;
      const isDeveloperCaller =
        caller?.role === 'developer' ||
        isAllowlistedDeveloper(authContext);
      if (!isDeveloperCaller) {
        console.warn(`[admin/delete-user] ${authContext.uid} attempted to delete ${userId}`);
        return res.status(403).json({ error: 'Only a developer can delete accounts.' });
      }
      if (userId === authContext.uid) {
        return res.status(400).json({ error: 'You cannot delete your own account from here.' });
      }

      const adminObj = getAdminObj();
      if (!adminObj) throw new Error('Firebase Admin is not initialized');

      let result;
      try {
        result = await purgeAccount(adb, adminObj, userId);
      } catch (authErr: any) {
        console.error('[admin/delete-user] auth delete failed:', authErr);
        return res.status(502).json({
          error: 'Could not delete the sign-in account, so nothing was removed.',
          details: 'The profile documents were left intact. Please try again.',
        });
      }

      console.warn(`[admin/delete-user] ${authContext.email || authContext.uid} deleted ${result.role} ${userId}`);
      return res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[admin/delete-user] failed:', err);
      return res.status(500).json({ error: 'Could not delete that account. Please try again.' });
    }
  });

  /**
   * References and ratings — written here because the fact that authorises
   * them is a QUERY, and firestore.rules can only read an exact document path.
   *
   * The rules could prove "you are this org" and, once tightened, "you own this
   * opportunity". Neither is the real test. The real test is "did this student
   * actually volunteer with this organization", which lives across the
   * applications collection. Without it, a throwaway organization could author
   * a reference about any student it liked, and any student could manufacture
   * ratings against an organization they had never worked with — and ratings
   * are a trust signal other students use to choose who to volunteer with.
   *
   * Same shape and same reason as POST /api/hours/approve. Client creates are
   * refused by the rules; this is the only door.
   */

  /** The shared test: an accepted application from this student to this
   *  opportunity. Returns false rather than throwing on a missing index. */
  /**
   * The addresses this account is allowed to send mail to.
   *
   * ROADMAP B17. /api/email/send accepted any recipient from any signed-in
   * account: ten arbitrary addresses per request, twenty requests per ten
   * minutes, with an attacker-chosen subject and body, delivered from the
   * SPF/DKIM-signed domain that also carries this platform's real mail. The
   * templates escape their inputs and actionUrl is origin-locked, so this was
   * never link injection — it was impersonation, and the damage lands on the
   * sending domain's reputation, which is shared with every genuine
   * notification the platform sends.
   *
   * The fix is the relationship the app already models. You may email:
   *   - yourself, always;
   *   - as a student: an organization you have applied to, and any coordinator
   *     you named on your own hours request;
   *   - as an organization: a student who applied to one of your opportunities;
   *   - as a developer: anyone, because the console's test-send exists to
   *     diagnose delivery and is already developer-gated.
   *
   * Returning null means unrestricted. Every lookup is bounded and read with
   * the Admin SDK, because a student cannot read an organization's contact
   * address directly and must not be able to.
   */
  async function allowedEmailRecipients(
    adb: any,
    uid: string,
    ownEmail?: string,
  ): Promise<{ allowed: Set<string>; selfAsserted: Set<string> } | null> {
    const allowed = new Set<string>();
    // Addresses the CALLER typed in themselves, which nobody has verified.
    // Kept apart from `allowed` because they are not the same kind of fact.
    const selfAsserted = new Set<string>();
    if (ownEmail) allowed.add(ownEmail.toLowerCase());

    const userSnap = await adb.collection('users').doc(uid).get();
    const role = userSnap.exists ? userSnap.data()?.role : null;
    if (role === 'developer') return null;

    const admin = getAdminObj();
    const FieldPath = admin?.firestore?.FieldPath;

    /** documentId() `in` queries take at most 10 values. */
    const byId = async (collection: string, ids: string[], field: string) => {
      if (!FieldPath) return;
      for (let i = 0; i < ids.length; i += 10) {
        const chunk = ids.slice(i, i + 10);
        if (!chunk.length) continue;
        const snap = await adb.collection(collection)
          .where(FieldPath.documentId(), 'in', chunk).get();
        for (const d of snap.docs) {
          const value = d.data()?.[field];
          if (typeof value === 'string' && value) allowed.add(value.toLowerCase());
        }
      }
    };

    if (role === 'student') {
      const apps = await adb.collection('applications')
        .where('studentId', '==', uid).limit(100).get();
      const orgIds = [...new Set(apps.docs.map((d: any) => d.data()?.orgId).filter(Boolean))] as string[];
      await byId('organizations', orgIds, 'contactEmail');
      await byId('users', orgIds, 'email');

      // A coordinator the student named themselves.
      //
      // SELF-ASSERTED, and that distinction is the whole point. `coordinatorContact`
      // is written by the student through the client SDK, and the rules only
      // check it is a string under 200 characters — they cannot check it belongs
      // to a real supervisor. So this branch, on its own, let anyone authorise
      // any address: create an account, write an hours request naming
      // victim@anywhere.com, and the relationship check hands it back as
      // "allowed". Up to 100 addresses could be pre-authorised that way.
      //
      // The address still has to be reachable — a genuine coordinator is often
      // at an organisation that has never registered here, so requiring a
      // registered account would break the one flow that graduation depends on.
      // What gets withheld instead is the ability to choose what the message
      // SAYS; see the send handler.
      const hours = await adb.collection('hoursRequests')
        .where('studentId', '==', uid).limit(100).get();
      for (const d of hours.docs) {
        const contact = d.data()?.coordinatorContact;
        if (typeof contact === 'string' && contact) selfAsserted.add(contact.toLowerCase());
      }
    } else if (role === 'organization') {
      const apps = await adb.collection('applications')
        .where('orgId', '==', uid).limit(200).get();
      const studentIds = [...new Set(apps.docs.map((d: any) => d.data()?.studentId).filter(Boolean))] as string[];
      await byId('users', studentIds, 'email');
    }

    return { allowed, selfAsserted };
  }

  async function hasAcceptedApplication(adb: any, studentId: string, opportunityId: string): Promise<boolean> {
    const snap = await adb.collection('applications')
      .where('studentId', '==', studentId)
      .where('opportunityId', '==', opportunityId)
      .limit(5)
      .get();
    return snap.docs.some((d: any) => d.data()?.status === 'accepted');
  }

  /**
   * Tell an applicant what an organization decided about them.
   *
   * This exists because the browser cannot do it. The organization screens used
   * to resolve the student's address with getDoc(users/{studentId}) — and
   * firestore.rules only allows that read to the account's owner or a
   * developer. So the read threw for every real organization, the throw was
   * caught, and the address fell back to the literal sandbox string
   * "student@example.com". Every acceptance and every rejection went there
   * instead of to the student, while the UI reported the applicant had been
   * notified. Three separate screens had the same broken lookup
   * (OrgOpportunityApplicants, OrgDashboard, lib/waitlistService).
   *
   * Doing it here fixes the delivery AND is the stricter design: the address is
   * resolved with the Admin SDK and used to send the mail, and is never
   * returned to the caller, so an organization still cannot read a student's
   * contact details out of the app.
   *
   * Authorization is ownership of the opportunity the application belongs to —
   * not merely "is an organization", which anyone gets free at signup.
   */
  app.post('/api/applications/notify', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (authContext.isDemo) {
        return res.json({ success: true, emailSent: false, mode: 'demo' });
      }

      const { applicationId, status, reason, note } = req.body || {};
      if (typeof applicationId !== 'string' || !applicationId.trim() || applicationId.length > 128) {
        return res.status(400).json({ error: 'applicationId is required.' });
      }
      const ALLOWED = ['accepted', 'rejected', 'terminated', 'waitlist_promoted'];
      if (!ALLOWED.includes(status)) {
        return res.status(400).json({ error: 'status must be one of: ' + ALLOWED.join(', ') });
      }

      // Rate limited like every other outbound-mail route. Without this an
      // organization holding one applicant could loop this endpoint and
      // mail-bomb that student — who is usually a minor — from our verified
      // sending domain, from a free account, burning the domain's reputation
      // along the way.
      if (await isEmailRateLimited(authContext.uid)) {
        return res.status(429).json({ error: 'Too many notifications sent. Please wait a few minutes.' });
      }

      const adminObj = getAdminObj();
      if (!adminObj) return res.status(500).json({ error: 'Server configuration error.' });
      const adb = adminFirestore();

      const appSnap = await adb.collection('applications').doc(applicationId).get();
      if (!appSnap.exists) return res.status(404).json({ error: 'Application not found.' });
      const appData = appSnap.data() || {};

      const oppSnap = await adb.collection('opportunities').doc(String(appData.opportunityId || '')).get();
      if (!oppSnap.exists) return res.status(404).json({ error: 'Opportunity not found.' });
      // THE authorization check: this caller must own the posting.
      if (oppSnap.data()?.orgId !== authContext.uid) {
        return res.status(403).json({ error: 'You do not own this opportunity.' });
      }

      const studentSnap = await adb.collection('users').doc(String(appData.studentId || '')).get();
      const studentEmail = studentSnap.exists ? studentSnap.data()?.email : null;
      if (!studentEmail) {
        // Report it rather than silently "succeeding" — the org needs to know
        // the applicant was not reached so they can follow up another way.
        return res.status(422).json({ error: 'This applicant has no email address on file.' });
      }

      const orgSnap = await adb.collection('organizations').doc(authContext.uid).get();
      const orgName = orgSnap.exists ? (orgSnap.data()?.organizationName || 'Verified Organization') : 'Verified Organization';
      const oppTitle = oppSnap.data()?.title || 'Volunteer Opportunity';
      const studentName = appData.studentName || 'Student';

      const accepted = status === 'accepted' || status === 'waitlist_promoted';
      const subject = status === 'waitlist_promoted'
        ? `A spot opened up — you're in for "${oppTitle}"`
        : accepted
          ? `Your application for "${oppTitle}" was accepted`
          : status === 'terminated'
            ? `Placement update for "${oppTitle}"`
            : `Application update for "${oppTitle}"`;

      const html = renderTemplate('application_status', {
        studentName,
        oppTitle,
        orgName,
        status: accepted ? 'accepted' : 'rejected',
        note: status === 'waitlist_promoted'
          ? 'A place became available and you have been moved off the waitlist.'
          : status === 'terminated'
            ? 'Your placement for this shift was ended by the organization.'
            : status === 'rejected'
              ? [reason, note].filter((s) => typeof s === 'string' && s.trim()).join('. ').slice(0, 1000) || undefined
              : undefined,
      });
      if (!html) return res.status(500).json({ error: 'Could not build the message.' });

      if (!resend) {
        return res.status(503).json({ error: 'Email delivery is not configured on this server.' });
      }
      const { error } = await resend.emails.send({
        from: process.env.MAIL_FROM || 'Volunteer North York <vny@volunteernorthyork.indevs.in>',
        to: [studentEmail],
        subject,
        html,
      });
      // Recorded in the same log the Control Room shows. Without this the three
      // highest-volume real senders were invisible there, so a developer
      // checking during an incident would see no applicant emails and conclude
      // mail was down when it was working.
      recordEmailLog({
        to: studentEmail,
        subject,
        templateName: 'application_status',
        status: error ? 'failed' : 'sent',
        error: error?.message,
        sentBy: authContext.email || authContext.uid,
      });

      if (error) {
        console.error('[applications/notify] Resend error:', error.message);
        return res.status(502).json({ error: 'The applicant could not be emailed.' });
      }

      res.json({ success: true, emailSent: true });
    } catch (err: any) {
      console.error('[applications/notify] Crash:', err);
      res.status(500).json({ error: 'Failed to notify the applicant.' });
    }
  });

  /**
   * Delete an opportunity together with everything that points at it.
   *
   * The organization cannot do this from the browser. The rules let only the
   * student who owns an application (or a developer) delete it, and an
   * organization cannot even list savedOpportunities. So a client-side delete
   * removed the posting and stranded every application to it: unreachable by
   * the organization, whose applicant queries are built from opportunities that
   * still exist and whose `list` rule proves ownership via exists() on the
   * opportunity, and unresolvable for the student, who kept a pending row for a
   * placement that no longer existed.
   *
   * Students with a live application are emailed before anything is removed —
   * having a placement vanish silently is the actual harm here.
   */
  app.post('/api/opportunities/delete', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (authContext.isDemo) return res.json({ success: true, demo: true });

      const { opportunityId } = req.body || {};
      if (typeof opportunityId !== 'string' || !opportunityId.trim() || opportunityId.length > 128) {
        return res.status(400).json({ error: 'opportunityId is required.' });
      }
      const adminObj = getAdminObj();
      if (!adminObj) return res.status(500).json({ error: 'Server configuration error.' });
      const adb = adminFirestore();

      const oppRef = adb.collection('opportunities').doc(opportunityId);
      const oppSnap = await oppRef.get();
      if (!oppSnap.exists) return res.status(404).json({ error: 'Opportunity not found.' });
      if (oppSnap.data()?.orgId !== authContext.uid) {
        return res.status(403).json({ error: 'You do not own this opportunity.' });
      }
      const oppTitle = oppSnap.data()?.title || 'a volunteer opportunity';

      const appsSnap = await adb.collection('applications')
        .where('opportunityId', '==', opportunityId).limit(500).get();
      const savedSnap = await adb.collection('savedOpportunities')
        .where('opportunityId', '==', opportunityId).limit(500).get();

      // Who to tell — captured BEFORE the delete, sent AFTER it.
      //
      // This used to email every applicant serially first, one Firestore read
      // plus one Resend send each, and only then delete. Resend allows ~2
      // requests a second, so 200 applicants is over a minute of awaits: the
      // serverless function was killed part-way through, nothing was deleted,
      // and sixty students had already been told the opportunity was withdrawn.
      // The organization then saw a network error and pressed Delete again,
      // emailing those sixty a second time. Deleting first means the state is
      // correct even if the mail never goes out, which is the safe direction.
      const LIVE = ['pending', 'reviewed', 'accepted', 'waitlist'];
      const recipients: { name: string; studentId: string }[] = appsSnap.docs
        .map((d: any) => d.data() || {})
        .filter((a: any) => LIVE.includes(a.status))
        .slice(0, 100)
        .map((a: any) => ({ name: a.studentName || 'Student', studentId: String(a.studentId || '') }));

      await Promise.all([
        ...appsSnap.docs.map((d: any) => d.ref.delete()),
        ...savedSnap.docs.map((d: any) => d.ref.delete()),
      ]);
      await oppRef.delete();

      if (resend && recipients.length) {
        const orgSnap = await adb.collection('organizations').doc(authContext.uid).get();
        const orgName = orgSnap.exists ? (orgSnap.data()?.organizationName || 'The organization') : 'The organization';
        for (const r of recipients) {
          try {
            const uSnap = await adb.collection('users').doc(r.studentId).get();
            const to = uSnap.exists ? uSnap.data()?.email : null;
            if (!to) continue;
            const html = renderTemplate('application_status', {
              studentName: r.name,
              oppTitle,
              orgName,
              status: 'rejected',
              note: 'This opportunity has been withdrawn by the organization, so your application has been closed. Nothing went wrong with your application — please browse other opportunities.',
            });
            if (!html) continue;
            const { error: sendErr } = await resend.emails.send({
              from: process.env.MAIL_FROM || 'Volunteer North York <vny@volunteernorthyork.indevs.in>',
              to: [to],
              subject: `"${oppTitle}" has been withdrawn`,
              html,
            });
            recordEmailLog({
              to, subject: `"${oppTitle}" has been withdrawn`,
              templateName: 'application_status', status: sendErr ? 'failed' : 'sent',
              error: sendErr?.message, sentBy: authContext.email || authContext.uid,
            });
          } catch (mailErr: any) {
            console.error('[opportunities/delete] withdrawal email failed:', mailErr?.message || mailErr);
          }
        }
      }

      return res.json({ success: true, applicationsRemoved: appsSnap.size });
    } catch (err: any) {
      console.error('[opportunities/delete] failed:', err);
      return res.status(500).json({ error: 'Could not delete the opportunity. Please try again.' });
    }
  });

  /**
   * The contact details of everyone who applied to one of your opportunities.
   *
   * `firestore.rules` refuses a client read of `users/{uid}` to anyone but its
   * owner, and that rule is right: without it any signed-in account could walk
   * the whole user base. But it is the wrong answer to "can this organization
   * reach the students who applied to its own posting", which it also blocked —
   * leaving an organization unable to contact a volunteer it had just accepted.
   *
   * Applying IS the contact request. A student chooses the organization, and
   * the organization has to be able to arrange a shift, ask a question, or
   * follow up. So this returns addresses for every applicant to one specific
   * opportunity, at any status, and the authorization is ownership of that
   * opportunity — not "is an organization", which anyone gets free at signup.
   * An organization still cannot read a student it has no relationship with.
   */
  app.get('/api/opportunities/:id/applicant-contacts', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (authContext.isDemo) return res.json({ contacts: [] , demo: true });

      const opportunityId = String(req.params.id || '');
      if (!opportunityId || opportunityId.length > 128) {
        return res.status(400).json({ error: 'Invalid opportunity id.' });
      }
      const adminObj = getAdminObj();
      if (!adminObj) return res.status(500).json({ error: 'Server configuration error.' });
      const adb = adminFirestore();

      const oppSnap = await adb.collection('opportunities').doc(opportunityId).get();
      if (!oppSnap.exists) return res.status(404).json({ error: 'Opportunity not found.' });
      if (oppSnap.data()?.orgId !== authContext.uid) {
        return res.status(403).json({ error: 'You do not own this opportunity.' });
      }

      const appsSnap = await adb.collection('applications')
        .where('opportunityId', '==', opportunityId).limit(500).get();

      // One lookup per distinct student, not per application.
      const studentIds: string[] = Array.from(new Set<string>(appsSnap.docs
        .map((d: any) => String(d.data()?.studentId || ''))
        .filter((v: string) => !!v)));
      const emails = new Map<string, string>();
      await Promise.all(studentIds.map(async (uid) => {
        const u = await adb.collection('users').doc(uid).get().catch(() => null);
        const email = u?.exists ? u.data()?.email : null;
        if (email) emails.set(uid, email);
      }));

      const contacts = appsSnap.docs.map((d: any) => {
        const a = d.data() || {};
        return {
          applicationId: d.id,
          studentId: a.studentId,
          studentName: a.studentName || 'Student',
          status: a.status,
          email: emails.get(String(a.studentId)) || null,
        };
      });

      return res.json({ contacts });
    } catch (err: any) {
      console.error('[applicant-contacts] failed:', err);
      return res.status(500).json({ error: 'Could not load applicant contact details.' });
    }
  });

  app.post('/api/recommendations/create', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (authContext.isDemo) {
        return res.status(403).json({ error: 'Demo mode cannot write references.' });
      }

      const { studentId, opportunityId, text, rating } = req.body || {};
      if (typeof studentId !== 'string' || !studentId.trim()) {
        return res.status(400).json({ error: 'studentId is required.' });
      }
      if (typeof opportunityId !== 'string' || !opportunityId.trim()) {
        return res.status(400).json({ error: 'opportunityId is required.' });
      }
      const body = String(text ?? '').trim();
      if (!body) return res.status(400).json({ error: 'The reference text is required.' });
      if (body.length > 1000) return res.status(400).json({ error: 'The reference is too long (max 1000 characters).' });
      const stars = Number(rating);
      if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
        return res.status(400).json({ error: 'rating must be between 1 and 5.' });
      }

      const adb = adminFirestore();

      // 1. The caller owns the opportunity.
      const oppSnap = await adb.collection('opportunities').doc(opportunityId).get();
      if (!oppSnap.exists || oppSnap.data()?.orgId !== authContext.uid) {
        console.warn(`[recommendations] ${authContext.uid} tried to reference on opportunity ${opportunityId} it does not own`);
        return res.status(403).json({ error: 'You can only write a reference for your own opportunity.' });
      }

      // 2. The student actually volunteered on it. This is the check rules
      //    could not make, and the reason this endpoint exists.
      if (!(await hasAcceptedApplication(adb, studentId, opportunityId))) {
        return res.status(403).json({
          error: 'You can only write a reference for a student whose application you accepted.',
        });
      }

      const orgSnap = await adb.collection('organizations').doc(authContext.uid).get();
      const studentSnap = await adb.collection('students').doc(studentId).get();

      // Deterministic id: one reference per org per student per opportunity, so
      // a double-click overwrites rather than duplicating.
      const recId = `${authContext.uid}_${studentId}_${opportunityId}`;
      await adb.collection('recommendations').doc(recId).set({
        orgId: authContext.uid,
        orgName: orgSnap.data()?.organizationName || 'Organization',
        studentId,
        studentName: studentSnap.data()?.fullName || 'Student',
        opportunityId,
        opportunityTitle: oppSnap.data()?.title || 'Opportunity',
        text: body,
        rating: stars,
        createdAt: new Date().toISOString(),
      });

      return res.json({ success: true, id: recId });
    } catch (err: any) {
      console.error('[recommendations/create] failed:', err);
      return res.status(500).json({ error: 'Could not save that reference. Please try again.' });
    }
  });

  app.post('/api/ratings/create', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (authContext.isDemo) {
        return res.status(403).json({ error: 'Demo mode cannot write ratings.' });
      }

      const { opportunityId, stars, comment } = req.body || {};
      if (typeof opportunityId !== 'string' || !opportunityId.trim()) {
        return res.status(400).json({ error: 'opportunityId is required.' });
      }
      const score = Number(stars);
      if (!Number.isFinite(score) || score < 1 || score > 5) {
        return res.status(400).json({ error: 'stars must be between 1 and 5.' });
      }
      const note = String(comment ?? '').trim();
      if (note.length > 500) return res.status(400).json({ error: 'The comment is too long (max 500 characters).' });

      const adb = adminFirestore();

      // The org is read from the opportunity, never taken from the request —
      // otherwise the caller picks which organization their rating lands on.
      const oppSnap = await adb.collection('opportunities').doc(opportunityId).get();
      if (!oppSnap.exists) {
        return res.status(404).json({ error: 'That opportunity no longer exists.' });
      }
      const orgId = oppSnap.data()?.orgId;
      if (typeof orgId !== 'string' || !orgId) {
        return res.status(409).json({ error: 'That opportunity has no organization on record, so it cannot be rated.' });
      }

      if (!(await hasAcceptedApplication(adb, authContext.uid, opportunityId))) {
        return res.status(403).json({
          error: 'You can only rate an organization you actually volunteered with.',
        });
      }

      const orgSnap = await adb.collection('organizations').doc(orgId).get();
      const studentSnap = await adb.collection('students').doc(authContext.uid).get();

      const ratingId = `${authContext.uid}_${orgId}_${opportunityId}`;
      await adb.collection('orgRatings').doc(ratingId).set({
        studentId: authContext.uid,
        studentName: studentSnap.data()?.fullName || 'Student',
        orgId,
        orgName: orgSnap.data()?.organizationName || 'Organization',
        opportunityId,
        opportunityTitle: oppSnap.data()?.title || 'Opportunity',
        stars: score,
        comment: note,
        createdAt: new Date().toISOString(),
      });

      return res.json({ success: true, id: ratingId, orgId });
    } catch (err: any) {
      console.error('[ratings/create] failed:', err);
      return res.status(500).json({ error: 'Could not save that rating. Please try again.' });
    }
  });

  app.post('/api/hours/approve', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (authContext.isDemo) {
        return res.json({ success: true, demo: true, hours: 0 });
      }
      if (!getAdminObj()) return res.status(500).json({ error: 'Server configuration error.' });

      const adb = adminFirestore();
      const { studentId, requestId, activity, hours, date } = req.body || {};
      // Declining is a status transition on the same document, gated by the
      // same relationship check. It used to be a direct client updateDoc, which
      // forced firestore.rules to carry a "the coordinator may set status"
      // branch — and the student writes coordinatorContact, so that branch let
      // them settle their own request. Routing it here let the branch be
      // deleted. See docs/ARCHITECTURE-PRINCIPLES.md §2.
      const declining = req.body?.approved === false;

      if (typeof studentId !== 'string' || !studentId || studentId.length > 128) {
        return res.status(400).json({ error: 'A valid studentId is required.' });
      }
      const parsedHours = Number(hours);
      if (!declining && (!Number.isFinite(parsedHours) || parsedHours <= 0 || parsedHours > 24)) {
        return res.status(400).json({ error: 'Hours must be a number between 0 and 24.' });
      }
      if (declining && !requestId) {
        return res.status(400).json({ error: 'Declining requires the hours request to decline.' });
      }

      // The caller must be an organization. Read the role server-side; never
      // trust a role claim that arrived in the request.
      const callerSnap = await adb.collection('users').doc(authContext.uid).get();
      const caller = callerSnap.exists ? callerSnap.data() : null;
      const isDeveloperCaller =
        caller?.role === 'developer' ||
        isAllowlistedDeveloper(authContext);
      if (!isDeveloperCaller && caller?.role !== 'organization') {
        return res.status(403).json({ error: 'Only an organization can approve volunteer hours.' });
      }

      // ── The relationship check that rules could not do ──
      //
      // The authorising fact must be one the STUDENT cannot fabricate.
      //
      // An earlier version of this endpoint accepted "the caller's email equals
      // the request's coordinatorContact" on its own. That field is written by
      // the student when they submit the request, so it authorised nothing: a
      // student could name any address they controlled, register it as an
      // organization (Firebase does not require proof of ownership to sign up),
      // and approve their own graduation hours. check:security proves this by
      // attempting exactly that.
      //
      // So a coordinator email match is now only ever a *tie-break* for which
      // request to settle — never the reason the write is allowed.
      let authorised = isDeveloperCaller;
      let requestRef: FirebaseFirestore.DocumentReference | undefined;
      let requestData: any = null;

      if (typeof requestId === 'string' && requestId) {
        // Via a local const: `adb` is `any`, so assigning straight to the
        // outer `let` does not narrow away `undefined` and every later use
        // needs a non-null assertion.
        const ref = adb.collection('hoursRequests').doc(requestId) as FirebaseFirestore.DocumentReference;
        requestRef = ref;
        const reqSnap = await ref.get();
        requestData = reqSnap.exists ? reqSnap.data() : null;
        if (!requestData || requestData.studentId !== studentId || requestData.status !== 'pending') {
          return res.status(403).json({ error: 'That hours request is not available for approval.' });
        }
      }

      if (!authorised) {
        const oppSnap = await adb.collection('opportunities')
          .where('orgId', '==', authContext.uid).get();
        const oppIds = new Set(oppSnap.docs.map((d: any) => d.id));
        if (oppIds.size > 0) {
          const appSnap = await adb.collection('applications')
            .where('studentId', '==', studentId)
            .get();
          authorised = appSnap.docs.some((d: any) => d.data().status === 'accepted' && oppIds.has(d.data().opportunityId));
        }
      }

      // Second route, for hours volunteered outside a posted opportunity: the
      // organization named as coordinator may sign off, but ONLY if a developer
      // has vetted it. craVerified is settable by developers alone, so a
      // throwaway account created to rubber-stamp its own request cannot reach
      // this branch, while a real charity that was verified once can keep
      // confirming hours for work it did not advertise on the platform.
      if (!authorised && requestData) {
        const orgSnap = await adb.collection('organizations').doc(authContext.uid).get();
        const vetted = orgSnap.exists && orgSnap.data()?.craVerified === true;
        const callerEmail = (caller?.email || authContext.email || '').trim().toLowerCase();
        const named = (requestData.coordinatorContact || '').trim().toLowerCase() === callerEmail;
        if (vetted && named) authorised = true;
      }

      if (!authorised) {
        console.warn(`[hours/approve] ${authContext.uid} tried to credit unrelated student ${studentId}`);
        return res.status(403).json({
          error:
            'You can only credit hours for a student who volunteered with your organization. ' +
            'If they volunteered outside a posted opportunity, your organization needs to be verified first.',
        });
      }

      // ── Write ──

      // Declining settles the request and credits nothing. It runs only after
      // the same relationship check above, so an unrelated organization cannot
      // quietly kill a student's request either.
      if (declining) {
        if (!requestRef) {
          return res.status(400).json({ error: 'Declining requires the hours request to decline.' });
        }
        await requestRef.update({
          status: 'declined',
          // Read by the student's notification bell. Without a decision stamp
          // it fell back to requestedAt — when the STUDENT submitted — so a
          // decision made after they last opened the bell always compared as
          // already-seen and the unread badge never appeared.
          decidedAt: new Date().toISOString(),
          declinedBy: authContext.uid,
          declinedAt: new Date().toISOString(),
        });
        return res.json({ success: true, declined: true });
      }

      const studentRef = adb.collection('students').doc(studentId);
      // Read outside the transaction: it is only used to label the entry, and a
      // transaction may not issue reads after its first write.
      const creditingOrgSnap = await adb.collection('organizations').doc(authContext.uid).get();
      const creditingOrgName = creditingOrgSnap.exists
        ? (creditingOrgSnap.data()?.organizationName || '')
        : '';
      const result = await adb.runTransaction(async (tx: any) => {
        // Re-read the request INSIDE the transaction. The pre-check above runs
        // before the transaction starts, so two concurrent approvals of the
        // same request both passed it: each transaction then read loggedHours,
        // appended, and the student was credited twice for one activity. The
        // total is recomputed rather than incremented, which stops the scalar
        // drifting from the array, but it faithfully totals a duplicate entry.
        // On a 40-hour graduation requirement that is a falsified record.
        if (requestRef) {
          const live = await tx.get(requestRef);
          if (!live.exists || live.data().status !== 'pending') {
            throw new Error('ALREADY_SETTLED');
          }
        }
        const snap = await tx.get(studentRef);
        if (!snap.exists) throw new Error('STUDENT_NOT_FOUND');
        const existing = Array.isArray(snap.data().loggedHours) ? snap.data().loggedHours : [];
        if (existing.length >= 500) throw new Error('TOO_MANY_ENTRIES');
        const entry = {
          id: 'log_' + crypto.randomBytes(6).toString('hex'),
          activity: String(activity || 'Volunteer Activity').slice(0, 200),
          hours: parsedHours,
          date: String(date || new Date().toISOString().slice(0, 10)).slice(0, 32),
          approved: true,
          approvedBy: authContext.uid,
          approvedAt: new Date().toISOString(),
          // Carried across from the request the student submitted.
          //
          // These were never copied, even though the student had typed both and
          // requestData is right here. The printed transcript renders
          // "${coordinatorName} (${coordinatorContact})" per row under
          // "Coordinator Supervisor Details", and escapeHTML maps undefined to
          // "" — so every row of the document a student hands their guidance
          // counsellor for graduation credit read " ()". The supervisor is the
          // part of that record a school actually checks.
          // Falls back to the crediting ORGANIZATION when there is no request
          // to carry these from. The direct-credit path (an organization
          // logging hours itself, with no hoursRequest) leaves requestData
          // null, so without this half the transcript rows still rendered
          // " ()" under "Coordinator Supervisor Details" — the very symptom
          // this was added to fix.
          coordinatorName: String(
            requestData?.coordinatorName || creditingOrgName || '',
          ).slice(0, 200),
          coordinatorContact: String(
            requestData?.coordinatorContact || authContext.email || '',
          ).slice(0, 200),
          // WHERE the student volunteered. An Ontario board form has an
          // "Organization" column on every activity row, and this was never
          // stored on the entry — only on the hoursRequest, which the transcript
          // does not read. So the printed record a student hands to guidance
          // named the supervisor but never the organization they supervised for.
          organization: String(
            requestData?.organization || creditingOrgName || '',
          ).slice(0, 200),
        };
        const loggedHours = [...existing, entry];
        // Recomputed from the array, never incremented, so a retry cannot
        // double-count and the scalar can never drift from its source.
        //
        // totalLoggedHours is imported rather than reimplemented. The copy that
        // used to live here summed the same numbers but skipped the
        // Math.round(total * 100) / 100 that src/lib/hours.ts applies — so a
        // student logging 0.1 + 0.2 got 0.3 written by the client and
        // 0.30000000000000004 written by the server, into the SAME field, with
        // whichever wrote last winning. The leaderboard ranks on that field.
        // Two implementations of "the single definition" is how the drift this
        // comment denies actually happened.
        const total = totalLoggedHours(loggedHours);
        const priorTotal = totalLoggedHours(existing);
        tx.update(studentRef, { loggedHours, hours: total });
        // decidedAt: same reason as the decline path above.
        if (requestRef) tx.update(requestRef, { status: 'approved', decidedAt: new Date().toISOString() });
        return { total, entryId: entry.id, priorTotal };
      });

      // Tell the student their hours were credited.
      //
      // This used to be done from the organization's browser, which had to read
      // the student's address out of users/{studentId} first — a read
      // firestore.rules denies to organizations. It threw every time, so the
      // confirmation never went anywhere. Here the address is resolved with the
      // Admin SDK, after the credit has already been committed.
      //
      // Deliberately after the transaction and deliberately not awaited into
      // the response's success: the hours ARE credited at this point, and a
      // mail failure must not turn that into an error the organization retries.
      try {
        const emailSnap = await adb.collection('users').doc(studentId).get();
        const studentEmail = emailSnap.exists ? emailSnap.data()?.email : null;
        if (studentEmail && resend) {
          const orgSnap = await adb.collection('organizations').doc(authContext.uid).get();
          const studentDoc = await adb.collection('students').doc(studentId).get();
          const html = renderTemplate('hours_confirmation', {
            studentName: (studentDoc.exists && studentDoc.data()?.fullName) || 'Student',
            hours: parsedHours,
            activity: String(activity || 'Volunteer Activity'),
            orgName: orgSnap.exists ? (orgSnap.data()?.organizationName || 'Verified Organization') : 'Verified Organization',
          });
          if (html) {
            const { error } = await resend.emails.send({
              from: process.env.MAIL_FROM || 'Volunteer North York <vny@volunteernorthyork.indevs.in>',
              to: [studentEmail],
              subject: `${parsedHours} volunteer hours confirmed`,
              html,
            });
            recordEmailLog({
              to: studentEmail, subject: `${parsedHours} volunteer hours confirmed`,
              templateName: 'hours_confirmation', status: error ? 'failed' : 'sent',
              error: error?.message, sentBy: authContext.email || authContext.uid,
            });
            if (error) console.error('[hours/approve] confirmation email failed:', error.message);
          }
        }
      } catch (mailErr: any) {
        console.error('[hours/approve] confirmation email failed:', mailErr?.message || mailErr);
      }

      // Crossing 40 hours is the entire reason a student is here, and nothing
      // marked it — the bar filled, a client-side badge unlocked, and no one was
      // told. `result.total` is the newly recomputed total and `priorTotal` the
      // one before this approval, so this fires exactly once, on the approval
      // that crosses the line.
      if (result.priorTotal < 40 && result.total >= 40) {
        try {
          const uSnap = await adb.collection('users').doc(studentId).get();
          const to = uSnap.exists ? uSnap.data()?.email : null;
          if (to && resend) {
            const html = renderTemplate('notification', {
              heading: "You've reached 40 volunteer hours",
              details:
                `That is the community involvement requirement for your Ontario Secondary School Diploma, complete. ` +
                `Print your hours record and take it to your guidance office — your school may also need its own signed form.`,
              actionLabel: 'Print your hours record',
              actionUrl: `${appOrigin()}/student/dashboard?tab=hours`,
            });
            if (html) {
              const { error: mErr } = await resend.emails.send({
                from: process.env.MAIL_FROM || 'Volunteer North York <vny@volunteernorthyork.indevs.in>',
                to: [to],
                subject: "You've reached 40 volunteer hours",
                html,
              });
              recordEmailLog({
                to, subject: "You've reached 40 volunteer hours", templateName: 'notification',
                status: mErr ? 'failed' : 'sent', error: mErr?.message,
                sentBy: authContext.email || authContext.uid,
              });
            }
          }
        } catch (mErr: any) {
          console.error('[hours/approve] milestone email failed:', mErr?.message || mErr);
        }
      }

      return res.json({ success: true, hours: result.total, entryId: result.entryId });
    } catch (err: any) {
      if (err?.message === 'ALREADY_SETTLED') {
        return res.status(409).json({ error: 'Those hours have already been settled. Refresh to see the current status.' });
      }
      if (err?.message === 'STUDENT_NOT_FOUND') {
        return res.status(404).json({ error: 'That student record no longer exists, so the hours were not credited.' });
      }
      if (err?.message === 'TOO_MANY_ENTRIES') {
        return res.status(409).json({ error: 'This student has reached the maximum number of logged activities.' });
      }
      console.error('[hours/approve] failed:', err);
      return res.status(500).json({ error: 'Could not credit the hours. Please try again.' });
    }
  });

  /**
   * The slice of a student's profile an organization may see while reviewing
   * their application.
   *
   * students/{uid} previously allowed `get` to any account with
   * role == 'organization' — the same flaw as the hours write above. An
   * organization account is free and instant, so anyone could read any
   * student's full record given a uid, and that record carries resumeUrl and
   * passportUrl: whole identity documents, base64-encoded inline, for students
   * who are mostly minors.
   *
   * Two changes, both here rather than in rules, because "does this student
   * have an application to one of our opportunities" is a query and rules can
   * only read an exact path:
   *
   *   1. The caller must own an opportunity this student applied to. Any
   *      status counts — an organization has to read a pending applicant in
   *      order to decide on them.
   *   2. The response is an allow-list. passportUrl is deliberately absent: no
   *      organization-facing screen has ever displayed it, so it now leaves
   *      Firestore for nobody but the student and a developer.
   */
  app.get('/api/students/:id/review-profile', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (authContext.isDemo) return res.json({ profile: null, demo: true });
      if (!getAdminObj()) return res.status(500).json({ error: 'Server configuration error.' });

      const studentId = String(req.params.id || '');
      if (!studentId || studentId.length > 128) {
        return res.status(400).json({ error: 'Invalid student id.' });
      }

      const adb = adminFirestore();
      const callerSnap = await adb.collection('users').doc(authContext.uid).get();
      const caller = callerSnap.exists ? callerSnap.data() : null;
      const isDeveloperCaller =
        caller?.role === 'developer' ||
        isAllowlistedDeveloper(authContext);
      if (!isDeveloperCaller && caller?.role !== 'organization') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      let authorised = isDeveloperCaller;
      if (!authorised) {
        const oppSnap = await adb.collection('opportunities')
          .where('orgId', '==', authContext.uid).get();
        const oppIds = new Set(oppSnap.docs.map((d: any) => d.id));
        if (oppIds.size > 0) {
          const appSnap = await adb.collection('applications')
            .where('studentId', '==', studentId)
            .get();
          authorised = appSnap.docs.some((d: any) => oppIds.has(d.data().opportunityId));
        }
      }
      if (!authorised) {
        console.warn(`[review-profile] ${authContext.uid} tried to read unrelated student ${studentId}`);
        return res.status(403).json({ error: 'That student has not applied to any of your opportunities.' });
      }

      const snap = await adb.collection('students').doc(studentId).get();
      if (!snap.exists) return res.status(404).json({ error: 'Student not found.' });
      const d = snap.data() || {};

      return res.json({
        profile: {
          uid: studentId,
          fullName: d.fullName ?? '',
          school: d.school ?? '',
          grade: d.grade ?? '',
          neighborhood: d.neighborhood ?? '',
          interests: Array.isArray(d.interests) ? d.interests : [],
          skills: Array.isArray(d.skills) ? d.skills : [],
          availability: Array.isArray(d.availability) ? d.availability : [],
          previousExperience: d.previousExperience ?? '',
          resumeUrl: d.resumeUrl ?? '',
          // passportUrl intentionally omitted — see the note above.
        },
      });
    } catch (err: any) {
      console.error('[review-profile] failed:', err);
      return res.status(500).json({ error: 'Could not load that student profile.' });
    }
  });

  /**
   * How many volunteers an opportunity has already accepted.
   *
   * The apply flow needs this to decide between 'pending' and 'waitlist', but a
   * student cannot compute it client-side: it means counting OTHER students'
   * application documents, which the security rules correctly refuse. That
   * query sat in the same try block as the addDoc that creates the
   * application, so the permission-denied it always raised aborted the write —
   * no student could apply to anything.
   *
   * Counting here with the Admin SDK keeps the rules tight and returns only an
   * integer, never another student's record.
   */
  app.get('/api/opportunities/:id/accepted-count', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      // Demo sessions have no real documents to count.
      if (authContext.isDemo) {
        return res.json({ acceptedCount: 0, demo: true });
      }
      if (!getAdminObj()) {
        return res.status(500).json({ error: 'Server configuration error.' });
      }

      const opportunityId = String(req.params.id || '');
      if (!opportunityId || opportunityId.length > 128) {
        return res.status(400).json({ error: 'Invalid opportunity id.' });
      }

      const snap = await adminFirestore()
        .collection('applications')
        .where('opportunityId', '==', opportunityId)
        .where('status', '==', 'accepted')
        .count()
        .get();

      return res.json({ acceptedCount: snap.data().count });
    } catch (err: any) {
      console.error('[applications] accepted-count failed:', err);
      return res.status(500).json({ error: 'Failed to read capacity.' });
    }
  });

  // ── SEND OTP ──
  app.post('/api/auth/send-otp', async (req, res) => {
    if (mailUnavailable(res)) return;
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.email) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (await isOtpRateLimited(authContext.uid)) {
        return res.status(429).json({ error: 'Too many requests. Please wait a few minutes.' });
      }

      const adminObj = getAdminObj();
      if (!adminObj) {
        console.error('[send-otp] Firebase Admin not available');
        return res.status(500).json({ error: 'Server configuration error. Please contact support.' });
      }

      const now = Date.now();
      const TTL_MS = 10 * 60 * 1000;

      // Reuse the code only for a short burst window. That collapses duplicate
      // requests (React re-renders, an impatient double-click) into ONE code and
      // one email, while a genuine "Resend" a minute later still issues a fresh
      // code. Either way the expiry is pushed out to a full TTL, so a resent
      // code is never handed over already half-expired — previously a reused
      // code kept its original deadline and could expire seconds after arriving.
      const BURST_MS = 60 * 1000;

      const existing = await readOtp(authContext.uid);
      const reuse = !!existing && existing.expires > now && now - existing.issuedAt < BURST_MS;

      const otp = reuse ? existing!.otp : crypto.randomInt(100000, 999999).toString();
      const record: OtpRecord = {
        otp,
        expires: now + TTL_MS,
        attempts: reuse ? existing!.attempts : 0,
        issuedAt: reuse ? existing!.issuedAt : now,
      };
      await writeOtp(authContext.uid, record);
      console.log(`[send-otp] ${reuse ? 'Reusing' : 'Generated'} OTP for ${authContext.email}`);

      // Never print codes in production logs — anyone with log access could
      // complete someone else's second factor.
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DEV OTP] Code for ${authContext.email}: ${otp}`);
      }

      // Delivery must succeed, or this endpoint must not report success.
      //
      // This was wrapped in `if (resend)`, so when RESEND_API_KEY was missing or
      // invalid the server answered { success: true } WITHOUT sending anything.
      // The client then showed "we sent you a code" and the user waited for an
      // email that was never dispatched — one of the "it just sits there" cases.
      if (!resend) {
        console.error('[send-otp] RESEND_API_KEY is not configured — cannot deliver the code.');
        await clearOtp(authContext.uid);
        return res.status(503).json({
          error: 'Email delivery is not configured on this server, so we cannot send your code. Please contact support.',
        });
      }

      const fromAddress = process.env.MAIL_FROM || 'Volunteer North York <vny@volunteernorthyork.indevs.in>';
      const { error } = await resend.emails.send({
        from: fromAddress,
        to: authContext.email,
        subject: 'Your Volunteer NY Security Code',
        html: `<div style="font-family: system-ui, sans-serif; max-width: 400px; margin: 0 auto; text-align: center; padding: 32px 24px;">
            <h2 style="margin: 0 0 8px; font-size: 18px; color: #1A2B36;">Your Security Code</h2>
            <p style="margin: 0 0 24px; color: #5C7483; font-size: 14px;">Enter this code to complete your sign-in:</p>
            <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1F4C63; padding: 16px; background: #F9F9F7; border-radius: 8px;">${otp}</div>
            <p style="margin: 24px 0 0; color: #5C7483; font-size: 12px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
          </div>`,
      });

      if (error) {
        // Surface the real reason. A rejected sender domain and a rate limit are
        // very different problems, and collapsing both into "please try again"
        // is why this failure was impossible to diagnose from the UI.
        console.error('[send-otp] Resend rejected the message:', {
          message: error.message,
          name: (error as any).name,
          from: fromAddress,
        });
        await clearOtp(authContext.uid);
        // details and hint are diagnostics for whoever runs the server, not for
        // the organization staring at the screen. Unconditionally they leaked
        // the raw Resend message, our sending address and a note about domain
        // verification to an end user who can act on none of it — and this is
        // the two-factor gate, so it is shown to every organization whenever
        // mail is misconfigured. The sibling /api/email/send already gates its
        // details on NODE_ENV; this route did not. Full text is logged above.
        return res.status(502).json({
          error:
            'We could not send your verification code. Please try again in a moment, ' +
            'and contact support if it keeps happening.',
          ...(process.env.NODE_ENV !== 'production'
            ? {
                details: error.message,
                hint: `Sender address in use: ${fromAddress}. If that domain is not verified in Resend, delivery will always fail — set MAIL_FROM to a verified sender.`,
              }
            : {}),
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      // Was: `Crash: ${err.message}. Please check server logs.` — a raw
      // exception handed to an organization, telling them to read logs they
      // have no access to. The stack is logged here for whoever does.
      console.error('[send-otp] Crash:', err);
      res.status(500).json({
        error: 'Something went wrong sending your verification code. Please try again.',
        ...(process.env.NODE_ENV !== 'production' ? { details: err?.message } : {}),
      });
    }
  });

  // ── VERIFY OTP ──
  app.post('/api/auth/verify-otp', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { code } = req.body;
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Please enter your 6-digit code.' });
      }

      const adminObj = getAdminObj();
      if (!adminObj) {
        return res.status(500).json({ error: 'Server configuration error.' });
      }

      // Tolerate how people actually type a code out of an email client:
      // spaces, and the non-breaking space that copying from HTML can carry.
      const submitted = code.replace(/[\s ]/g, '');

      // One transaction does the lookup, the expiry check, the attempt cap, the
      // comparison and the consume. It used to be five separate steps around a
      // read-modify-write, so concurrent guesses all read the same attempt
      // count and a whole batch cost ONE attempt instead of one each — see
      // verifyOtpAtomic.
      const verdict = await verifyOtpAtomic(authContext.uid, submitted);

      if (!verdict.ok) {
        if (verdict.reason === 'none') {
          return res.status(400).json({ error: 'No code was requested. Please request a new code.' });
        }
        if (verdict.reason === 'expired') {
          return res.status(400).json({ error: 'Your code has expired. Please request a new one.' });
        }
        if (verdict.reason === 'locked') {
          return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
        }
        if (verdict.reason === 'busy') {
          // Deliberately indistinguishable from ordinary load, and deliberately
          // NOT an attempt: a denied verification must never be cheaper for an
          // attacker than a counted one.
          return res.status(503).json({ error: 'We could not check that code just now. Please try again in a moment.' });
        }
        const left = verdict.remaining ?? 0;
        return res.status(400).json({
          error: `Incorrect code. Please check and try again. ${left} attempt${left === 1 ? '' : 's'} remaining.`,
        });
      }

      // ── Code is correct, and the transaction already consumed it. ──

      if (!authContext.isDemo) {
        // The claim must name the sign-in it belongs to.
        //
        // This used to write only { mfaVerified: true }. Custom claims live on
        // the Firebase Auth user record, not on a session, so that flag was
        // permanent: a student passed one OTP and was never challenged again,
        // on any device, forever. The settings screen meanwhile promised a code
        // "every time you log back in". Verified against production — an
        // account signed in 3.8 days after its claim was written and received
        // no code.
        //
        // auth_time is minted by Firebase at sign-in and survives the silent
        // hourly token refresh, so pinning the claim to it means "verified for
        // THIS sign-in". The client compares mfaVerifiedFor against auth_time
        // from the same token (src/lib/mfa.ts), so both sides of the comparison
        // come from one signed document and no clock skew between our server
        // and Firebase can enter into it. Signing in again mints a new
        // auth_time, the values stop matching, and the gate closes.
        if (typeof authContext.authTime !== 'number') {
          return res.status(500).json({
            error: 'Your code was correct, but we could not complete verification on the server. Please try again, or contact support if this persists.',
          });
        }
        let claimSet = false;
        try {
          const userRecord = await adminObj.auth().getUser(authContext.uid);
          const existingClaims = userRecord.customClaims || {};
          await adminObj.auth().setCustomUserClaims(authContext.uid, {
            ...existingClaims,
            mfaVerified: true,
            mfaVerifiedFor: authContext.authTime,
            mfaVerifiedAt: Date.now(),
          });
          claimSet = true;
          console.log('[verify-otp] MFA claim set for:', authContext.uid);
        } catch (authErr: any) {
          console.error('[verify-otp] Could not set MFA claim:', authErr.message);
        }
        
        // Fail closed. This used to return { success: true, fallbackClaim: true },
        // and the client responded by writing its own sessionStorage flag and
        // treating itself as verified — an MFA pass with nothing recorded
        // server-side. If the claim cannot be written the correct outcome is a
        // failed verification, not a self-granted one.
        if (!claimSet) {
          return res.status(500).json({
            error: 'Your code was correct, but we could not complete verification on the server. Please try again, or contact support if this persists.',
          });
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('[verify-otp] Crash:', err);
      res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // TRANSACTIONAL EMAIL
  //
  // These two routes existed on the client (src/lib/emailService.ts and the
  // developer console) but had no server implementation, so every POST to
  // /api/email/send fell through to the SPA catch-all and 404'd. Because
  // sendTransactionalEmail() swallows its own errors and resolves with
  // { success: false } instead of throwing, every caller's .catch() never ran:
  // welcome emails, acceptance/rejection notices, waitlist promotions and
  // hour confirmations all failed silently, and one call site even recorded
  // emailSent = true afterwards. The dangling `emailTemplates` import at the
  // top of this file was the leftover of that removal.
  // ══════════════════════════════════════════════════════════════════

  /**
   * Recent send attempts, newest first.
   *
   * Mirrored to Firestore, because in-memory alone is wrong on serverless: each
   * invocation can land on a different instance, so the Control Room showed
   * whatever that one instance happened to have sent — usually nothing. It was
   * the only piece of module state here with no durable backing, while the OTP
   * and email rate limiters had both already been moved for the same reason.
   *
   * The in-memory copy is kept as the fallback for when Firestore is
   * unreachable, matching the OTP store's shape.
   */
  const emailHistory: Array<{
    id: string; to: string; subject: string; templateName: string;
    status: 'sent' | 'failed' | 'demo'; error?: string; sentBy: string; at: string;
  }> = [];
  const EMAIL_HISTORY_LIMIT = 100;

  type EmailLogEntry = (typeof emailHistory)[number];

  /** Best-effort mirror. A logging failure must never fail the send it logs. */
  /**
   * Record a send in the log the developer console reads.
   *
   * `/api/email/send` was the only route that did this, so the three highest
   * volume real senders — applicant notifications, withdrawal notices and hours
   * confirmations — never appeared. Anyone checking that table during an
   * incident would see nothing and conclude mail was down.
   *
   * Function declaration, not a const, so the endpoints defined earlier in this
   * file can call it. Never throws: a logging failure must not fail a send.
   */
  function recordEmailLog(entry: Omit<EmailLogEntry, 'id' | 'at'>): void {
    try {
      const full: EmailLogEntry = {
        ...entry,
        id: 'em_' + crypto.randomBytes(6).toString('hex'),
        at: new Date().toISOString(),
      };
      emailHistory.unshift(full);
      if (emailHistory.length > EMAIL_HISTORY_LIMIT) emailHistory.length = EMAIL_HISTORY_LIMIT;
      persistEmailLog(full);
    } catch {
      /* the send itself already happened */
    }
  }

  function persistEmailLog(entry: EmailLogEntry): void {
    try {
      const adb = adminFirestore();
      if (adb) void adb.collection('emailLog').doc(entry.id).set(entry).catch(() => {});
    } catch {
      /* memory copy still holds it */
    }
  }

  /** Max 20 send requests per 10 minutes per account, so an authenticated
   *  session can't turn this into an open relay for our sending domain. */
  const emailRateLimit = new Map<string, { count: number; windowStart: number }>();
  async function isEmailRateLimited(uid: string): Promise<boolean> {
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const local = emailRateLimit.get(uid);
    const localFresh = local && now - local.windowStart <= windowMs;

    let ref: any = null;
    try {
      const adminObj = getAdminObj();
      if (adminObj) ref = adminFirestore().collection('email_rate_limits').doc(uid);
    } catch {
      ref = null;
    }

    if (!ref) {
      if (!localFresh) {
        emailRateLimit.set(uid, { count: 1, windowStart: now });
        return false;
      }
      local!.count++;
      return local!.count > 20;
    }

    try {
      const overLimit = await adminFirestore().runTransaction(async (tx: any) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : null;
        const windowStart = typeof data?.windowStart === 'number' ? data.windowStart : 0;

        if (!data || now - windowStart > windowMs) {
          tx.set(ref, { count: 1, windowStart: now });
          return false;
        }
        const count = (typeof data.count === 'number' ? data.count : 0) + 1;
        tx.set(ref, { count, windowStart }, { merge: true });
        return count > 20;
      });

      emailRateLimit.set(uid, {
        count: overLimit ? 21 : (localFresh ? local!.count + 1 : 1),
        windowStart: localFresh ? local!.windowStart : now,
      });
      return overLimit;
    } catch (err: any) {
      console.warn('[email] rate-limit transaction failed, using in-process counter:', err.message);
      if (!localFresh) {
        emailRateLimit.set(uid, { count: 1, windowStart: now });
        return false;
      }
      local!.count++;
      return local!.count > 20;
    }
  }

  const isEmailAddress = (v: unknown): v is string =>
    typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  /**
   * The button URL in a `notification` email must point at this app.
   *
   * Any signed-in account can call /api/email/send — that is by design, because
   * the client sends welcome, application-status and hours emails. But the
   * `notification` template renders a call-to-action button straight from
   * request data, so `actionUrl` let any account that could sign up (which is
   * anyone, instantly, for free) send mail that:
   *
   *   - originates from our Resend domain and therefore passes SPF and DKIM,
   *   - is pixel-identical to a genuine Volunteer North York notice,
   *   - and links wherever the sender likes.
   *
   * That is a working phishing kit aimed at the exact population this site
   * collects: high-school students, many of them minors. The rate limit caps
   * the volume at ~200 messages per account per 10 minutes; it does nothing
   * about how convincing each one is. It also risks the sending domain being
   * blacklisted, which would silently break every real transactional email.
   *
   * Constraining the link to our own origin removes the payload while leaving
   * every legitimate caller working — all of them build the URL from the app's
   * own origin already.
   */
  function isSafeActionUrl(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return true;
    if (typeof value !== 'string') return false;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return false; // relative or malformed — not something we will put in mail
    }
    // Both the configured origin AND the canonical one. The callers build these
    // from window.location.origin, so if APP_URL ever drifts from the domain
    // the app is actually served on, matching only appOrigin() would start
    // rejecting genuine welcome and hours emails. Accepting the canonical
    // origin as well keeps real mail working through that misconfiguration
    // without widening this to anything an attacker controls.
    const allowedOrigins = [appOrigin(), CANONICAL_APP_ORIGIN];
    return allowedOrigins.some((o) => {
      try {
        const a = new URL(o);
        return parsed.protocol === a.protocol && parsed.host === a.host;
      } catch {
        return false;
      }
    });
  }

  /**
   * Templates a signed-in client may ask for by name.
   *
   * `auth_verification` and `admin_alert` are deliberately absent. Escaping
   * their fields stopped the injected-link version of the attack, but not the
   * attack: any account that can sign up (anyone, instantly, free) could still
   * ask this endpoint for a pixel-identical "Account Verification Code" or
   * "System Security Alert" email, SPF- and DKIM-signed by the real domain,
   * addressed to any student on the platform, with the subject line under their
   * control. A convincing 2FA notice we did not initiate is a phishing kit
   * whether or not the code itself is clickable. Neither template is sent by
   * any real flow — the only caller was the developer console's test-send
   * dropdown — so they are server-internal only: reachable by calling
   * emailTemplates directly, never by naming them in a request body.
   */
  const CLIENT_TEMPLATES = new Set([
    'welcome_student',
    'application_status',
    'hours_confirmation',
    'new_applicant',
    'notification',
  ]);

  /** Maps the client's templateName + templateData onto the positional
   *  template functions in server/emailTemplates.ts. */
  function renderTemplate(templateName: string, d: any): string | null {
    switch (templateName) {
      case 'welcome_student':
        return emailTemplates.welcome_student(d.studentName || 'Student');
      case 'application_status':
        return emailTemplates.application_status(
          d.studentName || 'Student',
          d.oppTitle || 'Volunteer Opportunity',
          d.orgName || 'Community Partner',
          d.status === 'accepted' ? 'accepted' : 'rejected',
          d.note
        );
      case 'hours_confirmation':
        return emailTemplates.hours_confirmation(
          d.studentName || 'Student',
          Number(d.hours) || 0,
          d.oppTitle || 'Volunteer Opportunity',
          d.orgName || 'Community Partner',
          d.supervisorName || 'Site Supervisor'
        );
      case 'new_applicant':
        return emailTemplates.new_applicant(
          d.orgName || 'Community Partner',
          d.applicantName || 'A student',
          d.oppTitle || 'Volunteer Opportunity',
          d.message
        );
      case 'auth_verification':
        return emailTemplates.auth_verification(
          d.userName || 'there',
          d.code || '',
          d.purpose === 'reset' ? 'reset' : 'verification'
        );
      case 'notification':
        return emailTemplates.notification(
          d.heading || d.subject || 'Volunteer North York',
          d.details || '',
          d.actionLabel,
          d.actionUrl
        );
      case 'admin_alert':
        return emailTemplates.admin_alert(d.subject || 'Notification', d.details || '');
      default:
        return null;
    }
  }

  app.post('/api/email/send', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Demo sessions simulate mail, and this must run BEFORE the mail-config
      // gate: demo mode is precisely how the app is exercised without
      // secrets, so refusing these calls made every demo flow (hours logging,
      // applications, signup) report an email failure that nothing actually
      // needed.
      if (authContext.isDemo) {
        const body = req.body || {};
        emailHistory.unshift({
          id: 'em_' + crypto.randomBytes(6).toString('hex'),
          to: Array.isArray(body.to) ? body.to.join(', ') : String(body.to ?? ''),
          subject: String(body.subject ?? '(demo)'),
          templateName: String(body.templateName ?? 'notification'),
          status: 'demo',
          sentBy: authContext.email || authContext.uid,
          at: new Date().toISOString(),
        });
        if (emailHistory.length > EMAIL_HISTORY_LIMIT) emailHistory.length = EMAIL_HISTORY_LIMIT;
        persistEmailLog(emailHistory[0]);
        return res.json({ success: true, mode: 'demo', warning: 'Demo mode: email was simulated, not sent.' });
      }

      if (mailUnavailable(res)) return;

      if (await isEmailRateLimited(authContext.uid)) {
        return res.status(429).json({ error: 'Too many emails requested. Please wait a few minutes.' });
      }

      // `let`, not `const`: for a coordinator address the server discards these
      // and rebuilds them below, so they must be reassignable.
      const { to } = req.body || {};
      let { subject, templateName, templateData } = req.body || {};

      const recipients = (Array.isArray(to) ? to : [to]).filter(isEmailAddress).map((e: string) => e.trim());
      if (recipients.length === 0) {
        return res.status(400).json({ error: 'A valid recipient email address is required.' });
      }
      if (recipients.length > 10) {
        return res.status(400).json({ error: 'Too many recipients in a single request (max 10).' });
      }

      // B17: you may only email people this account actually has a relationship
      // with. See allowedEmailRecipients for what that means per role.
      {
        const adb = adminFirestore();
        if (!adb) {
          return res.status(500).json({ error: 'Server configuration error.' });
        }
        const scope = await allowedEmailRecipients(adb, authContext.uid, authContext.email);
        if (scope) {
          const { allowed, selfAsserted } = scope;
          const refused = recipients.filter(
            (r: string) => !allowed.has(r.toLowerCase()) && !selfAsserted.has(r.toLowerCase()),
          );
          if (refused.length) {
            // Deliberately does not name which address was refused, or confirm
            // that any of the others exist — that would make this endpoint a
            // membership oracle for a platform used by minors.
            console.warn(`[email/send] ${authContext.uid} tried to email ${refused.length} unrelated address(es).`);
            return res.status(403).json({
              error: 'You can only email people connected to your account — an organization you applied to, a student who applied to you, or a coordinator you named.',
            });
          }

          // Reaching a SELF-ASSERTED address costs you the right to compose the
          // message.
          //
          // Allowing an unverified address was necessary: a real coordinator is
          // usually at an organisation that has never registered here. But the
          // pairing of "any address I typed" with "any subject and body I chose"
          // is a send-arbitrary-mail-from-a-signed-domain primitive, and it is
          // reachable by anyone who can create a student account. So for these
          // recipients the server picks the template and writes the subject, and
          // the only client-supplied values that survive are the ones the
          // hours-verification template needs.
          const toUnverified = recipients.filter((r: string) => !allowed.has(r.toLowerCase()));
          if (toUnverified.length) {
            if (toUnverified.length !== recipients.length) {
              // Mixing verified and unverified recipients would let the stricter
              // rule below be dodged by attaching one legitimate address.
              return res.status(400).json({
                error: 'Send an hours-verification request on its own, not alongside other recipients.',
              });
            }
            // The server writes the message, not the caller.
            //
            // Everything the client sent — subject, heading, details, button
            // label and destination — is discarded and rebuilt from the
            // student's OWN hours request. The request is looked up by the
            // address it names, so a caller can only ever produce a sentence
            // about hours they actually submitted.
            //
            // This is what makes an unverified recipient safe to keep. The
            // address is still attacker-chosen; the words no longer are, so the
            // worst available outcome is mailing a stranger a factual note about
            // a real submission rather than arbitrary branded text.
            const target = toUnverified[0];
            const match = await adb.collection('hoursRequests')
              .where('studentId', '==', authContext.uid)
              .where('coordinatorContact', '==', target)
              .limit(1).get();
            if (match.empty) {
              return res.status(403).json({
                error: 'You can only email a coordinator you named on one of your own hours requests.',
              });
            }
            const hr: any = match.docs[0].data() || {};
            const who = String(hr.studentName || 'A student').slice(0, 100);
            const what = String(hr.activity || 'volunteer work').slice(0, 200);
            const when = String(hr.date || '').slice(0, 40);
            const howMany = Number(hr.hours);
            const hoursText = Number.isFinite(howMany) ? `${howMany} hour${howMany === 1 ? '' : 's'}` : 'volunteer hours';

            subject = `${who} asked you to confirm their volunteer hours`;
            templateName = 'notification';
            templateData = {
              heading: 'Please confirm these volunteer hours',
              details:
                `${who} submitted ${hoursText} for "${what}"${when ? ` on ${when}` : ''} ` +
                `and has asked you to verify them online.`,
              actionLabel: 'Review the request',
              actionUrl: `${appOrigin()}/org/dashboard?tab=hours`,
            };
            logEvent('coordinator_notice_rebuilt', { uid: authContext.uid });
          }
        }
      }
      if (typeof subject !== 'string' || !subject.trim()) {
        return res.status(400).json({ error: 'A subject line is required.' });
      }

      // Checked before rendering, so a rejected link never reaches the mailer.
      if (!isSafeActionUrl((templateData || {}).actionUrl)) {
        console.warn(`[email/send] Blocked off-site actionUrl from ${authContext.uid}:`, (templateData || {}).actionUrl);
        return res.status(400).json({
          error: 'The action link must point at Volunteer North York.',
          details: 'Off-site links are not permitted in outbound email.',
        });
      }

      if (!CLIENT_TEMPLATES.has(templateName)) {
        // 403, not 400: for the two server-internal templates the name is
        // recognised and refused, and saying so is the point — a 400 "unknown
        // template" would read as a typo to the honest caller and as an
        // encouragement to keep guessing to the other one.
        console.warn(`[email/send] Blocked template '${templateName}' requested by ${authContext.uid}`);
        return res.status(403).json({
          error: 'That email template cannot be requested by a client.',
          details: 'Only transactional templates sent by the app are available.',
        });
      }

      const html = renderTemplate(templateName, templateData || {});
      if (html === null) {
        return res.status(400).json({ error: `Unknown email template: ${templateName}` });
      }

      const record = (status: 'sent' | 'failed' | 'demo', error?: string) => {
        emailHistory.unshift({
          id: 'em_' + crypto.randomBytes(6).toString('hex'),
          to: recipients.join(', '),
          subject,
          templateName,
          status,
          error,
          sentBy: authContext.email || authContext.uid,
          at: new Date().toISOString(),
        });
        if (emailHistory.length > EMAIL_HISTORY_LIMIT) emailHistory.length = EMAIL_HISTORY_LIMIT;
        persistEmailLog(emailHistory[0]);
      };

      // (Demo sessions are already short-circuited above, before the
      // mail-config gate — see the top of this handler.)

      if (!resend) {
        record('failed', 'RESEND_API_KEY not configured');
        return res.status(503).json({
          error: 'Email delivery is not configured on this server.',
          details: 'RESEND_API_KEY is missing.',
        });
      }

      const { error } = await resend.emails.send({
        from: process.env.MAIL_FROM || 'Volunteer North York <vny@volunteernorthyork.indevs.in>',
        to: recipients,
        subject,
        html,
      });

      if (error) {
        console.error('[email/send] Resend error:', error.message);
        record('failed', error.message);
        return res.status(502).json({
          error: 'The email could not be delivered.',
          details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
        });
      }

      record('sent');
      res.json({ success: true, mode: 'live' });
    } catch (err: any) {
      console.error('[email/send] Crash:', err);
      res.status(500).json({ error: 'Failed to send the email. Please try again.' });
    }
  });

  app.get('/api/email/history', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Recipient addresses are personal data, so this is developer-only.
      //
      // "Developer" means the same thing here as in firestore.rules and in the
      // client: the role on the account, OR the bootstrap email allowlist. This
      // route checked only the allowlist, so a developer promoted by role — the
      // supported way to add a second one — loaded the Control Room and got 403
      // on every request it makes. The role is read server-side from Firestore,
      // never from the request, and it cannot be self-assigned (the rules
      // require incoming().role == existing().role on update).
      let isDeveloper: boolean;
      if (authContext.isDemo) {
        // A demo token asserts its own role — `Bearer demo-mode-token-developer`
        // is something anyone can type — so it must not unlock the real
        // recipient addresses of real sends. Demo tokens are already refused
        // outright when NODE_ENV is production, but preview deployments do not
        // always set that, and this is the one route where a demo token would
        // otherwise return live data.
        isDeveloper = false;
      } else {
        isDeveloper = isAllowlistedDeveloper(authContext);
        if (!isDeveloper && getAdminObj()) {
          try {
            const snap = await adminFirestore().collection('users').doc(authContext.uid).get();
            isDeveloper = snap.exists && snap.data()?.role === 'developer';
          } catch (lookupErr: any) {
            console.warn('[email/history] role lookup failed, falling back to allowlist:', lookupErr?.message);
          }
        }
      }

      if (!isDeveloper) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Firestore first — see the note on emailHistory for why the in-process
      // array cannot be trusted on serverless. Old entries are pruned here
      // rather than on the send path: this route is developer-only and rare, so
      // the cost lands where nobody is waiting on it.
      try {
        const adb = adminFirestore();
        const snap = await adb.collection('emailLog')
          .orderBy('at', 'desc').limit(EMAIL_HISTORY_LIMIT).get();
        if (!snap.empty) {
          const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          void adb.collection('emailLog').where('at', '<', cutoff).limit(200).get()
            .then((old: any) => Promise.all(old.docs.map((d: any) => d.ref.delete())))
            .catch(() => {});
          return res.json(snap.docs.map((d: any) => d.data()));
        }
      } catch (logErr: any) {
        console.warn('[email/history] Firestore unavailable, using in-process log:', logErr?.message);
      }
      res.json(emailHistory);
    } catch (err: any) {
      console.error('[email/history] Crash:', err);
      res.status(500).json({ error: 'Failed to load email history.' });
    }
  });

    // Secure feedback analyze endpoint using Gemini
  /**
   * Client error sink.
   *
   * Until this existed, every caught error in the browser reached
   * console.error and stopped there. Nobody found out that a student's hours
   * submission failed, or that a page crashed, unless that student wrote in.
   * The crash screen meanwhile told them "our team has been notified", which
   * was not true of anyone.
   *
   * Deliberately unauthenticated: the errors most worth seeing happen during
   * sign-in and signup, before there is a session to authenticate with. That
   * makes it a write endpoint anyone can reach, so it is bounded on every axis
   * that matters - a hard rate limit per address, a payload cap, a fixed set of
   * stored fields, and a capped collection - rather than trusted.
   */
  const errorLogLimit = new Map<string, { count: number; windowStart: number }>();
  /**
   * Per-IP limiter for the unauthenticated error sink.
   *
   * Two things were wrong with the previous version and each defeated it on its
   * own. The key came from `x-forwarded-for`, which the CLIENT sets and Express
   * does not validate unless `trust proxy` is configured — so rotating one
   * header gave an attacker a fresh 30/min bucket per request, and each accepted
   * request writes a ~5 KB document to Firestore, billed to us. And the Map was
   * never pruned, so it grew one entry per distinct (spoofable) value until the
   * process died.
   *
   * `app.set('trust proxy', 1)` below makes `req.ip` the real client address on
   * Vercel rather than a client-supplied string, and expired entries are swept
   * on write so the map stays proportional to active callers, not to history.
   */
  function errorLogRateLimited(ip: string): boolean {
    const now = Date.now();
    const windowMs = 60 * 1000;

    if (errorLogLimit.size > 5000) {
      for (const [key, v] of errorLogLimit) {
        if (now - v.windowStart > windowMs) errorLogLimit.delete(key);
      }
    }

    const entry = errorLogLimit.get(ip);
    if (!entry || now - entry.windowStart > windowMs) {
      errorLogLimit.set(ip, { count: 1, windowStart: now });
      return false;
    }
    entry.count += 1;
    return entry.count > 30;
  }

  app.post('/api/log/client-error', async (req, res) => {
    try {
      // req.ip, not the raw header — see errorLogRateLimited. With
      // `trust proxy` set, Express derives this from x-forwarded-for only as far
      // as the hop it is told to trust, so a client cannot choose its own key.
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (errorLogRateLimited(ip)) return res.status(429).json({ ok: false });

      const { context, message, stack, path } = req.body || {};
      if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ ok: false });

      // Whoever is running the server sees it immediately, even without
      // Firestore. On Vercel this reaches the platform log (12-Factor XI).
      console.error(`[client] ${String(context || 'unknown')} @ ${String(path || '?')}: ${message.slice(0, 300)}`);

      // Best effort beyond that. A failure to record an error must never
      // become a second error.
      const adminObj = getAdminObj();
      if (adminObj) {
        // Only the caller's own token is trusted for identity - never a uid
        // from the body, which anyone could set to anyone.
        let uid: string | null = null;
        try {
          const auth = await verifyAuth(req);
          if (auth?.uid && !auth.error) uid = auth.uid;
        } catch { /* anonymous is fine and expected */ }

        await adminFirestore().collection('clientErrors').add({
          context: String(context || 'unknown').slice(0, 100),
          message: String(message).slice(0, 1000),
          stack: typeof stack === 'string' ? stack.slice(0, 4000) : null,
          path: String(path || '').slice(0, 200),
          uid,
          userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
          at: new Date().toISOString(),
        }).catch(() => {});
      }

      res.json({ ok: true });
    } catch {
      res.status(200).json({ ok: false });
    }
  });

  app.post('/api/feedback/analyze', async (req, res) => {
    // verifyAuth ALWAYS resolves to an object — it signals failure via the
    // `error` field, never by returning null. `if (!authContext)` was therefore
    // dead code, and this endpoint answered 200 to completely unauthenticated
    // callers, letting anyone spend the project's Gemini quota. Match the
    // check every other route uses.
    const authContext = await verifyAuth(req);
    if (!authContext || !authContext.uid || authContext.error) {
      return res.status(401).json({ error: 'Unauthorized: Valid authentication required to use AI features.' });
    }

    // Rate limited like its two siblings. Requiring a signed-in caller bounds
    // WHO can spend the AI quota but not HOW MUCH: an account is free and
    // instant, and this was the only paid call in the file with no limiter at
    // all, so one account could loop it and run up the Gemini bill unbounded.
    if (await isEmailRateLimited(authContext.uid)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
    }

    const { subject, message, type } = req.body || {};

    if (typeof subject !== 'string' || typeof message !== 'string' || !subject.trim() || !message.trim()) {
      return res.status(400).json({ error: 'Subject and message are required' });
    }

    if (!ai) {
      return res.json({
        category: type || 'other',
        urgency: 'medium',
        summary: `Feedback received regarding: ${subject}`,
        // This branch is a graceful degradation, not an error — the ticket is
        // still filed and triaged by hand. Don't name the missing env var in a
        // response that reaches end users.
        suggestedFix: 'Standard review required — this ticket will be triaged manually.',
        aiAvailable: false,
      });
    }

    // Sanitize user input before sending to the AI model to prevent
    // prompt injection. Strip anything that looks like prompt directives.
    const safeSubject = String(subject).slice(0, 200).replace(/["\n\r]/g, ' ');
    const safeMessage = String(message).slice(0, 2000).replace(/["\n\r]/g, ' ');
    const safeType = String(type || 'other').slice(0, 20);

    try {
      const prompt = `
        Analyze the following user feedback/issue and categorize it and provide an overview for developers.
        Feedback Subject: "${safeSubject}"
        Feedback Message: "${safeMessage}"
        User Selected Type: "${safeType}"

        Determine the true core category, rate its urgency (low, medium, high, or critical), summarize it into a concise 1-2 sentence developer-oriented summary, and provide a constructive suggestion or fix tip.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                description: 'Categorized type: bug, feature, ux, or other',
                enum: ['bug', 'feature', 'ux', 'other'],
              },
              urgency: {
                type: Type.STRING,
                description: 'Severity degree: low, medium, high, or critical',
                enum: ['low', 'medium', 'high', 'critical'],
              },
              summary: {
                type: Type.STRING,
                description: 'A brief 1-2 sentence human developer-friendly summary of the feedback.',
              },
              suggestedFix: {
                type: Type.STRING,
                description: 'Actionable suggestion or solution advice for the development team.',
              },
            },
            required: ['category', 'urgency', 'summary', 'suggestedFix'],
          },
        },
      });

      const aiText = response.text?.trim() || '{}';
      const aiResult = JSON.parse(aiText);
      return res.json(aiResult);
    } catch (error: any) {
      console.error('Gemini Analysis Failed:', error);
      return res.json({
        category: type || 'other',
        urgency: 'medium',
        summary: `Feedback: "${subject}". Summary analysis failed.`,
        suggestedFix: 'Please review this report manually.',
      });
    }
  });


  // The Google OAuth relay that lived here (/api/auth/google/url and
  // /api/auth/google/callback, plus their redirect allowlist) has been removed.
  // It was complete but unreachable: no client code ever called it, and
  // GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET were never configured, so both
  // endpoints could only ever answer 500. Google sign-in goes through
  // Firebase's signInWithPopup (see Login.tsx and AuthContext), which needs no
  // server relay. Restore from git history if a server-side flow is ever needed.
// Express 4 does not catch a rejected promise from an async handler. Most
// routes here try/catch, but one miss means the request hangs until Vercel's
// timeout with nothing in the log at all — the worst possible failure, because
// it looks like slowness rather than an error.
//
// Both halves are needed: the middleware catches synchronous throws, the
// process handler catches the async ones Express never sees. Neither leaks the
// underlying message to the caller.
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logEvent('unhandled_error', {
    path: req.path,
    method: req.method,
    msg: String(err?.message || err).slice(0, 300),
  });
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

process.on('unhandledRejection', (reason: any) => {
  logEvent('unhandled_rejection', { msg: String(reason?.message || reason).slice(0, 300) });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const viteMod = 'vite';
    const { createServer: createViteServer } = await import(viteMod);
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // The app is routinely served through proxies and tunnels (preview
        // hosts, ngrok-style relays). Vite's default Host-header allowlist
        // answers those with 403 "Blocked request", which reads as the whole
        // app being down. Allow every host in dev; the real origin guard is
        // CORS on the API, not this header check.
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;

