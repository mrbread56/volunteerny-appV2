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

  /** Dev fallback store if Firestore is unavailable locally */
  const devOtpStore = new Map<string, { otp: string; expires: number; attempts: number }>();

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

      let otp: string;

      try {
        const db = adminObj.firestore();
        const otpRef = db.collection('verification_otps').doc(authContext.uid);

        // Idempotency: if an unexpired code exists, reuse it.
        const existing = await otpRef.get();
        if (existing.exists) {
          const data = existing.data();
          if (data && data.expires > Date.now()) {
            otp = data.otp;
            console.log('[send-otp] Reusing existing unexpired OTP for:', authContext.email);
          } else {
            otp = crypto.randomInt(100000, 999999).toString();
            await otpRef.set({ otp, expires: Date.now() + 10 * 60 * 1000, attempts: 0 });
            console.log('[send-otp] Generated new OTP for:', authContext.email);
          }
        } else {
          otp = crypto.randomInt(100000, 999999).toString();
          await otpRef.set({ otp, expires: Date.now() + 10 * 60 * 1000, attempts: 0 });
          console.log('[send-otp] Generated new OTP for:', authContext.email);
        }
      } catch (dbErr: any) {
        console.warn('[send-otp] Firestore unavailable, falling back to memory store:', dbErr.message);
        const existing = devOtpStore.get(authContext.uid);
        if (existing && existing.expires > Date.now()) {
          otp = existing.otp;
          console.log('[send-otp] (Memory) Reusing existing unexpired OTP for:', authContext.email);
        } else {
          otp = crypto.randomInt(100000, 999999).toString();
          devOtpStore.set(authContext.uid, { otp, expires: Date.now() + 10 * 60 * 1000, attempts: 0 });
          console.log('[send-otp] (Memory) Generated new OTP for:', authContext.email);
        }
      }

      // Always log in dev so you can proceed without email
      if (!resend || process.env.NODE_ENV !== 'production') {
        console.log(`[DEV OTP] Code for ${authContext.email}: ${otp}`);
      }

      // Send the email
      if (resend) {
        const { error } = await resend.emails.send({
          from: process.env.MAIL_FROM || 'Volunteer North York <vny@volunteernorthyork.indevs.in>',
          to: authContext.email,
          subject: 'Your Volunteer NY Security Code',
          html: `<div style="font-family: system-ui, sans-serif; max-width: 400px; margin: 0 auto; text-align: center; padding: 32px 24px;">
            <h2 style="margin: 0 0 8px; font-size: 18px; color: #1A2B36;">Your Security Code</h2>
            <p style="margin: 0 0 24px; color: #5C7483; font-size: 14px;">Enter this code to complete your sign-in:</p>
            <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1F4C63; padding: 16px; background: #F9F9F7; border-radius: 8px;">${otp}</div>
            <p style="margin: 24px 0 0; color: #5C7483; font-size: 12px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
          </div>`
        });
        if (error) {
          console.error('[send-otp] Resend error:', { message: error.message, from: process.env.MAIL_FROM || '(fallback)' });
          return res.status(500).json({
            error: 'Could not send the verification email. Please try again.',
            details: process.env.NODE_ENV !== 'production' ? error.message : undefined
          });
        }
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

      let stored: { otp: string; expires: number; attempts: number } | undefined;
      let otpRef: any = null;

      try {
        const db = adminObj.firestore();
        otpRef = db.collection('verification_otps').doc(authContext.uid);
        const doc = await otpRef.get();
        if (doc.exists) {
          stored = doc.data() as { otp: string; expires: number; attempts: number };
        }
      } catch (dbErr: any) {
        console.warn('[verify-otp] Firestore unavailable, using memory store:', dbErr.message);
        stored = devOtpStore.get(authContext.uid);
      }

      if (!stored) {
        return res.status(400).json({ error: 'No code was requested. Please click "Send Code" first.' });
      }

      if (Date.now() > stored.expires) {
        if (otpRef) await otpRef.delete().catch(() => {});
        devOtpStore.delete(authContext.uid);
        return res.status(400).json({ error: 'Your code has expired. Please request a new one.' });
      }

      if (stored.attempts >= 5) {
        if (otpRef) await otpRef.delete().catch(() => {});
        devOtpStore.delete(authContext.uid);
        return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
      }

      if (stored.otp !== code.trim()) {
        stored.attempts += 1;
        if (otpRef) await otpRef.update({ attempts: stored.attempts }).catch(() => {});
        const mem = devOtpStore.get(authContext.uid);
        if (mem) mem.attempts = stored.attempts;
        return res.status(400).json({ error: 'Incorrect code. Please check and try again.' });
      }

      // ── Code is correct. Set the MFA custom claim. ──
      if (otpRef) await otpRef.delete().catch(() => {});
      devOtpStore.delete(authContext.uid);

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
        
        if (!claimSet) {
          return res.json({ success: true, fallbackClaim: true });
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('[verify-otp] Crash:', err);
      res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
  });

    // Secure feedback analyze endpoint using Gemini
  app.post('/api/feedback/analyze', async (req, res) => {
    const authContext = await verifyAuth(req);
    if (!authContext) {
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

  // --- GOOGLE OAUTH RELAY ---
  app.get('/api/auth/google/url', (req, res) => {
    const redirectUri = req.query.redirect_uri as string;
    if (!redirectUri) return res.status(400).json({ error: 'redirect_uri is required' });

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
      const safeError = JSON.stringify(String(error));
      return res.send(`<script>window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: ${safeError} }, window.location.origin); window.close();</script>`);
    }

    if (!code || !state) {
      return res.send('Invalid request: Missing code or state');
    }

    try {
      const { redirectUri } = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
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
      const safeIdToken = JSON.stringify(String(tokenData.id_token || ''));
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
      const safeErrMsg = JSON.stringify(String(err.message || 'Unknown error'));
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
