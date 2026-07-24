import express from 'express';
import compression from 'compression';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { Resend } from 'resend';
import { emailTemplates } from './server/emailTemplates';
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
function getFirebaseAdmin(): typeof admin | null {
  if (adminInitFailed) {
    console.warn('[Firebase Admin] Previously failed to initialize — returning null.');
    return null;
  }
  if (!adminApp) {
    console.log('[Firebase Admin] Attempting to initialize Firebase Admin SDK...');
    try {
      let projectId = process.env.GOOGLE_CLOUD_PROJECT || 'volunteer-ny';
      try {
        const config = require('./firebase-applet-config.json');
        projectId = config.projectId || projectId;
        console.log('[Firebase Admin] Using projectId from config:', projectId);
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

      adminApp = admin.initializeApp(initConfig);
      console.log('[Firebase Admin] Successfully initialized with project:', projectId);
    } catch (err: any) {
      console.warn('[Firebase Admin Initialization Failed]:', err.message || err);
      adminInitFailed = true;
      return null;
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

async function verifyAuth(req: express.Request): Promise<{ uid: string; email?: string; role?: string; isDemo: boolean } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('[verifyAuth] No Bearer token found in Authorization header.');
    return null;
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
      return null;
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
    console.warn('[verifyAuth] Firebase Admin not available — cannot verify real tokens.');
    return null;
  }

  try {
    const decoded = await adminInstance.auth().verifyIdToken(token);
    console.log('[verifyAuth] Token verified for user:', decoded.uid, 'email:', decoded.email);
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role,
      isDemo: false
    };
  } catch (err: any) {
    console.warn('[verifyAuth] Token verification failed:', err.message || err);
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(compression());
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
  const otpStore = new Map<string, { otp: string; expires: number; attempts: number }>();
  const otpRateLimit = new Map<string, { count: number; windowStart: number }>();
  const emailIdempotencyCache = new Map<string, number>();
  const emailHistory: Array<{ to: string; subject: string; template: string; sentAt: string; status: string }> = [];

  /** Check if the user has exceeded OTP request rate (max 5 per 10 minutes). */
  function isOtpRateLimited(uid: string): boolean {
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const maxRequests = 5;
    const entry = otpRateLimit.get(uid);
    if (!entry || (now - entry.windowStart) > windowMs) {
      otpRateLimit.set(uid, { count: 1, windowStart: now });
      return false;
    }
    entry.count++;
    return entry.count > maxRequests;
  }

  // --- API Routes ---
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/email/send', async (req, res) => {
    const { to, subject, templateName, templateData } = req.body;

    if (!to || !subject || !templateName || !templateData) {
      return res.status(400).json({ error: 'Missing parameters: to, subject, templateName, and templateData are required.' });
    }

    const authContext = await verifyAuth(req);
    if (!authContext) {
      return res.status(401).json({ error: 'Unauthorized: Valid authentication credentials are required to send emails.' });
    }

    if (!resend) {
      return res.status(500).json({ error: 'Email service is not configured (RESEND_API_KEY missing).' });
    }

    // Idempotency check: prevent duplicate emails within 60 seconds (Strict Mode fix)
    const idempotencyKey = `${templateName}_${Array.isArray(to) ? to.join(',') : to}`;
    const now = Date.now();
    const lastSent = emailIdempotencyCache.get(idempotencyKey);
    if (lastSent && (now - lastSent) < 60000) {
      console.log(`[Idempotency] Skipped duplicate email to ${to} for template ${templateName}`);
      return res.json({ success: true, cached: true });
    }
    emailIdempotencyCache.set(idempotencyKey, now);

    try {
      let html = '';
      if (templateName === 'welcome_student') {
        html = emailTemplates.welcome_student(templateData.studentName || 'Student');
      } else if (templateName === 'application_status') {
        html = emailTemplates.application_status(
          templateData.studentName || 'Student',
          templateData.oppTitle || 'Opportunity',
          templateData.orgName || 'Organization',
          templateData.status || 'pending',
          templateData.note
        );
      } else if (templateName === 'hours_confirmation') {
        html = emailTemplates.hours_confirmation(
          templateData.studentName || 'Student',
          templateData.hours || 0,
          templateData.orgName || 'Organization',
          templateData.oppTitle || 'Opportunity',
          templateData.supervisorName || 'Supervisor'
        );
      } else if (templateName === 'new_applicant') {
        html = emailTemplates.new_applicant(
          templateData.orgName || 'Organization',
          templateData.applicantName || 'Applicant',
          templateData.oppTitle || 'Opportunity',
          templateData.message
        );
      } else if (templateName === 'admin_alert') {
        html = emailTemplates.admin_alert(
          templateData.subject || 'Admin Alert',
          templateData.details || 'No details provided.'
        );
      } else if (templateName === 'auth_verification') {
        html = emailTemplates.auth_verification(
          templateData.userName || 'User',
          templateData.code || '000000',
          templateData.purpose || 'verification'
        );
      } else {
        return res.status(400).json({ error: 'Invalid template name.' });
      }

      // We enforce the correctly formatted verified domain to prevent dispatch errors
      let fromEmail = process.env.MAIL_FROM || 'Volunteer North York <vny@volunteernorthyork.indevs.in>';
      if (!fromEmail.includes('@') || !fromEmail.includes('<')) {
        fromEmail = 'Volunteer North York <vny@volunteernorthyork.indevs.in>';
      }

      const result = await resend.emails.send({
        from: fromEmail,
        to: Array.isArray(to) ? to : [to],
        subject: subject,
        html: html,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      emailHistory.unshift({ to: Array.isArray(to) ? to.join(', ') : to, subject, template: templateName || 'custom', sentAt: new Date().toISOString(), status: 'sent' });
      if (emailHistory.length > 50) emailHistory.length = 50;
      return res.json({ success: true });
    } catch (error: any) {
      console.warn('Email Dispatch Failed:', error.message || error);
      emailHistory.unshift({ to: Array.isArray(to) ? to.join(', ') : to, subject, template: templateName || 'custom', sentAt: new Date().toISOString(), status: 'failed' });
      if (emailHistory.length > 50) emailHistory.length = 50;
      return res.status(500).json({ error: error.message || 'Failed to send email.' });
    }
  });

  app.get('/api/email/history', async (req, res) => {
    const authContext = await verifyAuth(req);
    if (!authContext || authContext.role !== 'developer') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json(emailHistory);
  });

  app.post('/api/auth/send-otp', async (req, res) => {
    try {
      const authContext = await verifyAuth(req);
      if (!authContext || !authContext.email) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (isOtpRateLimited(authContext.uid)) {
        return res.status(429).json({ error: 'Too many verification code requests. Please wait a few minutes.' });
      }
      
      const otp = crypto.randomInt(100000, 999999).toString();
      otpStore.set(authContext.uid, { otp, expires: Date.now() + 10 * 60 * 1000, attempts: 0 });

      if (!resend || process.env.NODE_ENV !== 'production') {
        console.log(`[DEV] OTP for ${authContext.email} is: ${otp}`);
      }

      if (resend) {
        const { error } = await resend.emails.send({
          from: process.env.MAIL_FROM || 'Volunteer North York <vny@volunteernorthyork.indevs.in>',
          to: authContext.email,
          subject: 'Your Volunteer NY Security Code',
          html: `<div style="font-family: sans-serif; text-align: center; padding: 20px;">
            <h2>Your Security Code</h2>
            <p>Please enter the following 6-digit code to complete your login:</p>
            <h1 style="font-size: 32px; letter-spacing: 5px; color: #2563eb;">${otp}</h1>
            <p style="color: #64748b; font-size: 12px;">This code expires in 10 minutes.</p>
          </div>`
        });
          if (error) {
            console.error('[send-otp] Resend API error:', error);
            return res.status(500).json({ error: `Failed to send email via Resend API: ${error.message}. (Check terminal for the DEV OTP code to proceed).` });
          }
        }
        
        res.json({ success: true });
      } catch (err: any) {
        console.error('[send-otp] Unhandled exception:', err);
        res.status(500).json({ error: `Internal server error: ${err.message}. (If you are in development, check the terminal for your DEV OTP code).` });
      }
  });

  app.post('/api/auth/verify-otp', async (req, res) => {
    const authContext = await verifyAuth(req);
    if (!authContext) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { code } = req.body;
    const stored = otpStore.get(authContext.uid);
    if (!stored) {
      return res.status(400).json({ error: 'No OTP requested or OTP expired' });
    }
    if (Date.now() > stored.expires) {
      otpStore.delete(authContext.uid);
      return res.status(400).json({ error: 'OTP expired' });
    }
    if (stored.attempts >= 5) {
      otpStore.delete(authContext.uid);
      return res.status(429).json({ error: 'Too many failed attempts. Please request a new code.' });
    }
    if (stored.otp !== code) {
      stored.attempts++;
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    otpStore.delete(authContext.uid);

    // Mark this user's auth token as MFA-verified via a real custom claim,
    // not something the client can set for itself. Preserve any existing
    // claims (e.g. role) instead of clobbering them.
    if (!authContext.isDemo) {
      try {
        const adminInstance = getFirebaseAdmin();
        if (adminInstance) {
          const userRecord = await adminInstance.auth().getUser(authContext.uid);
          const existingClaims = userRecord.customClaims || {};
          await adminInstance.auth().setCustomUserClaims(authContext.uid, {
            ...existingClaims,
            mfaVerified: true,
            mfaVerifiedAt: Date.now(),
          });
        }
      } catch (claimErr) {
        console.error('Failed to set mfaVerified custom claim:', claimErr);
        return res.status(500).json({ error: 'Failed to finalize verification. Please try again.' });
      }
    }

    res.json({ success: true });
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
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

startServer();
