import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';
import { Resend } from 'resend';
import { emailTemplates } from './server/emailTemplates.js';
import { appOrigin, CANONICAL_APP_ORIGIN } from './server/appUrl.js';
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


async function verifyAuth(req: express.Request): Promise<{ uid: string; email?: string; role?: string; isDemo: boolean; error?: string }> {
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
    console.log('[verifyAuth] Token verified for user:', decoded.uid, 'email:', decoded.email);
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role,
      isDemo: false
    };
  } catch (err: any) {
    console.warn('[verifyAuth] Token verification failed:', err.message || err);
    return { uid: '', isDemo: false, error: err.message || 'Token verification failed' };
  }
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

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

  type OtpRecord = { otp: string; expires: number; attempts: number; issuedAt: number };

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

  /** Read from both stores and return whichever record was issued most recently. */
  async function readOtp(uid: string): Promise<OtpRecord | null> {
    let fromDb: OtpRecord | null = null;
    try {
      const ref = otpDocRef(uid);
      if (ref) {
        const doc = await ref.get();
        if (doc.exists) {
          const data = doc.data();
          if (isOtpRecord(data)) fromDb = { issuedAt: 0, attempts: 0, ...data };
        }
      }
    } catch (err: any) {
      console.warn('[otp] Firestore read failed, relying on memory store:', err.message);
    }

    const fromMem = memoryOtpStore.get(uid) || null;
    if (!fromDb) return fromMem;
    if (!fromMem) return fromDb;
    return fromMem.issuedAt >= fromDb.issuedAt ? fromMem : fromDb;
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
      return res.status(500).json({ error: 'Failed to rebuild leaderboard', details: err.message });
    }
  });

  // A safety net so the board cannot go permanently stale if no approvals
  // happen to fire the endpoint above. Cheap: one indexed query every 15 min.
  const LEADERBOARD_INTERVAL_MS = 15 * 60 * 1000;
  if (getAdminObj()) {
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

      if (typeof studentId !== 'string' || !studentId || studentId.length > 128) {
        return res.status(400).json({ error: 'A valid studentId is required.' });
      }
      const parsedHours = Number(hours);
      if (!Number.isFinite(parsedHours) || parsedHours <= 0 || parsedHours > 24) {
        return res.status(400).json({ error: 'Hours must be a number between 0 and 24.' });
      }

      // The caller must be an organization. Read the role server-side; never
      // trust a role claim that arrived in the request.
      const callerSnap = await adb.collection('users').doc(authContext.uid).get();
      const caller = callerSnap.exists ? callerSnap.data() : null;
      const isDeveloperCaller =
        caller?.role === 'developer' ||
        (process.env.VITE_DEVELOPER_EMAILS || '')
          .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
          .includes((authContext.email || '').toLowerCase());
      if (!isDeveloperCaller && caller?.role !== 'organization') {
        return res.status(403).json({ error: 'Only an organization can approve volunteer hours.' });
      }

      // ── The relationship check that rules could not do ──
      let authorised = isDeveloperCaller;
      let requestRef: FirebaseFirestore.DocumentReference | null = null;

      if (!authorised && typeof requestId === 'string' && requestId) {
        requestRef = adb.collection('hoursRequests').doc(requestId);
        const reqSnap = await requestRef.get();
        const reqData = reqSnap.exists ? reqSnap.data() : null;
        const callerEmail = (caller?.email || authContext.email || '').trim().toLowerCase();
        if (
          reqData &&
          reqData.studentId === studentId &&
          (reqData.coordinatorContact || '').trim().toLowerCase() === callerEmail &&
          reqData.status === 'pending'
        ) {
          authorised = true;
        }
      }

      if (!authorised) {
        // Does this student hold an accepted application to one of our
        // opportunities? `in` takes at most 30 values, so cap the scan.
        const oppSnap = await adb.collection('opportunities')
          .where('orgId', '==', authContext.uid).limit(30).get();
        const oppIds = oppSnap.docs.map((d: any) => d.id);
        if (oppIds.length) {
          const appSnap = await adb.collection('applications')
            .where('studentId', '==', studentId)
            .where('opportunityId', 'in', oppIds)
            .limit(10).get();
          authorised = appSnap.docs.some((d: any) => d.data().status === 'accepted');
        }
      }

      if (!authorised) {
        console.warn(`[hours/approve] ${authContext.uid} tried to credit unrelated student ${studentId}`);
        return res.status(403).json({
          error: 'You can only credit hours for a student who volunteered with your organization.',
        });
      }

      // ── Write ──
      const studentRef = adb.collection('students').doc(studentId);
      const result = await adb.runTransaction(async (tx: any) => {
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
        };
        const loggedHours = [...existing, entry];
        // Recomputed from the array, never incremented, so a retry cannot
        // double-count and the scalar can never drift from its source.
        const total = loggedHours.reduce((sum: number, l: any) => {
          const n = Number(l?.hours);
          return sum + (Number.isFinite(n) ? n : 0);
        }, 0);
        tx.update(studentRef, { loggedHours, hours: total });
        if (requestRef) tx.update(requestRef, { status: 'approved' });
        return { total, entryId: entry.id };
      });

      return res.json({ success: true, hours: result.total, entryId: result.entryId });
    } catch (err: any) {
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
        (process.env.VITE_DEVELOPER_EMAILS || '')
          .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
          .includes((authContext.email || '').toLowerCase());
      if (!isDeveloperCaller && caller?.role !== 'organization') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      let authorised = isDeveloperCaller;
      if (!authorised) {
        const oppSnap = await adb.collection('opportunities')
          .where('orgId', '==', authContext.uid).limit(30).get();
        const oppIds = oppSnap.docs.map((d: any) => d.id);
        if (oppIds.length) {
          const appSnap = await adb.collection('applications')
            .where('studentId', '==', studentId)
            .where('opportunityId', 'in', oppIds)
            .limit(1).get();
          authorised = !appSnap.empty;
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
        return res.status(502).json({
          error: 'We could not deliver your verification email.',
          details: error.message,
          hint: `Sender address in use: ${fromAddress}. If that domain is not verified in Resend, delivery will always fail — set MAIL_FROM to a verified sender.`,
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('[send-otp] Crash:', err);
      res.status(500).json({ error: `Crash: ${err.message}. Please check server logs.` });
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

      // Reads both stores and takes the freshest record, so a stale Firestore
      // document can no longer shadow the code that was actually emailed.
      const stored = await readOtp(authContext.uid);

      if (!stored) {
        return res.status(400).json({ error: 'No code was requested. Please request a new code.' });
      }

      if (Date.now() > stored.expires) {
        await clearOtp(authContext.uid);
        return res.status(400).json({ error: 'Your code has expired. Please request a new one.' });
      }

      if (stored.attempts >= 5) {
        await clearOtp(authContext.uid);
        return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
      }

      // Tolerate how people actually type a code out of an email client:
      // spaces, and the non-breaking space that copying from HTML can carry.
      const submitted = code.replace(/[\s ]/g, '');

      if (stored.otp !== submitted) {
        await writeOtp(authContext.uid, { ...stored, attempts: stored.attempts + 1 });
        return res.status(400).json({
          error: `Incorrect code. Please check and try again. ${4 - stored.attempts} attempt${4 - stored.attempts === 1 ? '' : 's'} remaining.`,
        });
      }

      // ── Code is correct. Set the MFA custom claim. ──
      await clearOtp(authContext.uid);

      if (!authContext.isDemo) {
        let claimSet = false;
        try {
          const userRecord = await adminObj.auth().getUser(authContext.uid);
          const existingClaims = userRecord.customClaims || {};
          await adminObj.auth().setCustomUserClaims(authContext.uid, {
            ...existingClaims,
            mfaVerified: true,
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

  /** Recent send attempts, newest first. In-memory and intentionally small. */
  const emailHistory: Array<{
    id: string; to: string; subject: string; templateName: string;
    status: 'sent' | 'failed' | 'demo'; error?: string; sentBy: string; at: string;
  }> = [];
  const EMAIL_HISTORY_LIMIT = 100;

  /** Max 20 send requests per 10 minutes per account, so an authenticated
   *  session can't turn this into an open relay for our sending domain. */
  const emailRateLimit = new Map<string, { count: number; windowStart: number }>();
  function isEmailRateLimited(uid: string): boolean {
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const entry = emailRateLimit.get(uid);
    if (!entry || now - entry.windowStart > windowMs) {
      emailRateLimit.set(uid, { count: 1, windowStart: now });
      return false;
    }
    entry.count += 1;
    return entry.count > 20;
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
    if (mailUnavailable(res)) return;
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.uid || authContext.error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (isEmailRateLimited(authContext.uid)) {
        return res.status(429).json({ error: 'Too many emails requested. Please wait a few minutes.' });
      }

      const { to, subject, templateName, templateData } = req.body || {};

      const recipients = (Array.isArray(to) ? to : [to]).filter(isEmailAddress).map((e: string) => e.trim());
      if (recipients.length === 0) {
        return res.status(400).json({ error: 'A valid recipient email address is required.' });
      }
      if (recipients.length > 10) {
        return res.status(400).json({ error: 'Too many recipients in a single request (max 10).' });
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
      };

      // Demo sessions must never trigger real mail.
      if (authContext.isDemo) {
        record('demo');
        return res.json({ success: true, mode: 'demo', warning: 'Demo mode: email was simulated, not sent.' });
      }

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
      const devEmails = (process.env.VITE_DEVELOPER_EMAILS || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const callerEmail = (authContext.email || '').toLowerCase();
      const isDeveloper = authContext.isDemo
        ? authContext.role === 'developer'
        : devEmails.includes(callerEmail);

      if (!isDeveloper) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      res.json(emailHistory);
    } catch (err: any) {
      console.error('[email/history] Crash:', err);
      res.status(500).json({ error: 'Failed to load email history.' });
    }
  });

    // Secure feedback analyze endpoint using Gemini
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

    const { subject, message, type } = req.body;

    if (!subject || !message) {
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
async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const viteMod = 'vite';
    const { createServer: createViteServer } = await import(viteMod);
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

