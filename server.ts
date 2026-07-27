import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';
import { Resend } from 'resend';
import { emailTemplates } from './server/emailTemplates.js';
import dotenv from 'dotenv';
import * as admin from 'firebase-admin';
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
if (!process.env.MAIL_FROM) {
  console.warn(
    '[Startup] WARNING: MAIL_FROM is not set. Falling back to ' +
      '"vny@volunteernorthyork.indevs.in". If that domain is not verified in ' +
      'Resend, every verification email will be rejected and 2FA will fail for everyone.'
  );
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

      // Try to use a service account key file if provided, otherwise fall
      // back to Application Default Credentials (works on Cloud Run, GCE,
      // and locally if GOOGLE_APPLICATION_CREDENTIALS is set).
      const initConfig: admin.AppOptions = { projectId };
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.log('[Firebase Admin] Using GOOGLE_APPLICATION_CREDENTIALS for auth.');
        // ADC will pick this up automatically
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        console.log('[Firebase Admin] FIREBASE_SERVICE_ACCOUNT_KEY found, attempting to parse...');
        try {
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
          // Vercel (and some other env-var UIs) mangle the private_key's real
          // newlines into literal backslash-n sequences when the value is
          // saved/round-tripped. After JSON.parse, a correctly-escaped key
          // already has real newlines here; a mangled one still has the two
          // literal characters "\" + "n", which breaks PEM parsing in
          // admin.credential.cert and makes Firebase Admin fail to boot
          // silently. Normalize just this field post-parse so the common
          // case (already-correct newlines) is left untouched.
          if (typeof serviceAccount.private_key === 'string') {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
          }
          initConfig.credential = admin.credential.cert(serviceAccount);
          console.log('[Firebase Admin] Successfully parsed service account key for:', serviceAccount.client_email);
        } catch (parseErr) {
          console.warn('[Firebase Admin] Could not parse FIREBASE_SERVICE_ACCOUNT_KEY:', parseErr);
        }
      } else {
        console.warn('[Firebase Admin] No service account key found. Will try Application Default Credentials.');
      }

      const adminObj = (admin as any).default || admin;
      adminApp = adminObj.initializeApp(initConfig);
      console.log('[Firebase Admin] Successfully initialized with project:', projectId);
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

/**
 * Serialize a value for embedding inside an inline <script> block.
 *
 * JSON.stringify alone is NOT safe here. The HTML parser ends a <script> at the
 * first literal "</script>" even when it sits inside a JavaScript string, so
 * JSON.stringify('</script><script>alert(1)</script>') — which passes the
 * sequence through untouched — let a query parameter close the tag and open its
 * own. That was a working reflected XSS on this origin via
 * /api/auth/google/callback?error=... Escaping < > & as unicode escapes keeps
 * the value a string to the JS parser while making it inert to the HTML parser.
 * U+2028/U+2029 are escaped too: they are literal line terminators in JS.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
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
    const allowedOrigin = process.env.NODE_ENV === 'production'
      ? (process.env.APP_URL || 'https://volunteernorthyork.indevs.in')
      : '*';
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
    if (process.env.NODE_ENV === 'production' && req.hostname !== 'localhost' && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.get('host')}${req.url}`);
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

  /** Simple rate limiter: max 5 OTP requests per 10-minute window per user. */
  const otpRateLimit = new Map<string, { count: number; windowStart: number }>();
  function isOtpRateLimited(uid: string): boolean {
    const now = Date.now();
    const entry = otpRateLimit.get(uid);
    if (!entry || now - entry.windowStart > 10 * 60 * 1000) {
      otpRateLimit.set(uid, { count: 1, windowStart: now });
      return false;
    }
    entry.count++;
    return entry.count > 5;
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
      return adminObj.firestore().collection('verification_otps').doc(uid);
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

  // ── SEND OTP ──
  app.post('/api/auth/send-otp', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.email) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (isOtpRateLimited(authContext.uid)) {
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
        suggestedFix: 'Standard review required. AI overview is pending configuration of Gemini API Key.',
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

  /**
   * Callback URLs this relay is willing to hand to Google.
   *
   * Google rejects a redirect_uri that is not registered in the Cloud console,
   * so an unvalidated value here is not immediately exploitable — but it makes
   * this endpoint a probe for whatever happens to be registered, and the value
   * is echoed straight back into the token exchange. Allowlisting locally means
   * the relay never emits a callback the operator did not intend.
   */
  const oauthRedirectAllowlist = (process.env.OAUTH_REDIRECT_ALLOWLIST || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  const isAllowedRedirect = (uri: string): boolean => {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return false;
    }
    // Unconfigured allowlist: permit only same-origin callbacks on this server.
    if (oauthRedirectAllowlist.length === 0) {
      return parsed.pathname === '/api/auth/google/callback';
    }
    return oauthRedirectAllowlist.includes(uri);
  };

  // --- GOOGLE OAUTH RELAY ---
  app.get('/api/auth/google/url', (req, res) => {
    const redirectUri = req.query.redirect_uri as string;
    if (!redirectUri) return res.status(400).json({ error: 'redirect_uri is required' });
    if (!isAllowedRedirect(redirectUri)) {
      console.warn('[oauth/url] Rejected redirect_uri:', redirectUri);
      return res.status(400).json({ error: 'redirect_uri is not permitted.' });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: 'GOOGLE_CLIENT_ID is not configured in the server environment.' });

    const state = Buffer.from(JSON.stringify({ redirectUri })).toString('base64');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      state: state
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.json({ url: authUrl });
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;
    if (error) {
      const safeError = jsonForScript(String(error));
      return res.send(`<script>window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: ${safeError} }, window.location.origin); window.close();</script>`);
    }

    if (!code || !state) {
      return res.send('Invalid request: Missing code or state');
    }

    try {
      // `state` is attacker-supplied (it round-trips through the browser), so
      // re-validate rather than trusting whatever redirect it carries.
      const { redirectUri } = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      if (typeof redirectUri !== 'string' || !isAllowedRedirect(redirectUri)) {
        throw new Error('Invalid redirect target.');
      }
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error('Google OAuth credentials not configured on server.');
      }

      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange token');
      }

      // We have the id_token! Pass it back to the opener window securely.
      const safeIdToken = jsonForScript(String(tokenData.id_token || ''));
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'GOOGLE_OAUTH_SUCCESS', 
                  idToken: ${safeIdToken}
                }, window.location.origin);
                window.close();
              } else {
                document.body.innerText = 'Authentication successful! Please close this window.';
              }
            </script>
            <p>Authentication successful. Redirecting...</p>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error('OAuth Callback Error:', err);
      const safeErrMsg = jsonForScript(String(err.message || 'Unknown error'));
      res.send(`<script>window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: ${safeErrMsg} }, window.location.origin); window.close();</script>`);
    }
  });

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

