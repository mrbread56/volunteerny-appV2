/**
 * Firebase / Firestore / email health check.
 *
 *   npm run check:firebase
 *
 * Answers, without touching the app: is the service account key still valid,
 * does a Firestore database actually exist and under what name, can the server
 * write the mfaVerified claim that two-factor sign-in depends on, and is
 * outbound email configured. Every check prints the concrete next step when it
 * fails, so a red line here maps to one action in the console.
 *
 * Read-only apart from one claim round-trip that writes a user's existing
 * claims straight back — that proves write permission without changing anyone's
 * access.
 */
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const adminObj: any = (admin as any).default || admin;

const PASS = 'PASS';
const FAIL = 'FAIL';
const WARN = 'WARN';
let failures = 0;
let warnings = 0;

function report(status: string, label: string, detail = '', fix = '') {
  if (status === FAIL) failures++;
  if (status === WARN) warnings++;
  console.log(`[${status}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (fix) console.log(`       fix: ${fix}`);
}

function section(title: string) {
  console.log('\n' + title);
  console.log('-'.repeat(title.length));
}

async function main() {
  console.log('Firebase / Firestore / email health check');
  console.log('=========================================');

  // ── 1. Service account key ────────────────────────────────────────────
  section('1. Service account key');

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    report(FAIL, 'FIREBASE_SERVICE_ACCOUNT_KEY', 'not set', 'Add it to .env (and to your host\'s environment variables).');
    return finish();
  }

  let sa: any;
  try {
    sa = JSON.parse(raw);
  } catch (e: any) {
    report(FAIL, 'key is valid JSON', e.message, 'Re-download the key and paste it as a single line.');
    return finish();
  }
  if (typeof sa.private_key === 'string') {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }

  report(PASS, 'key parses as JSON');
  report(
    String(sa.private_key || '').includes('-----BEGIN') ? PASS : FAIL,
    'private_key looks like a PEM block',
    '',
    'The key was mangled in transit. Re-download it from the Firebase console.'
  );
  console.log(`       project_id  : ${sa.project_id}`);
  console.log(`       client_email: ${sa.client_email}`);

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || sa.project_id || 'volunteer-ny';
  if (sa.project_id && projectId !== sa.project_id) {
    report(
      FAIL,
      'projectId matches the key',
      `server uses "${projectId}", key belongs to "${sa.project_id}"`,
      `Set GOOGLE_CLOUD_PROJECT=${sa.project_id} or use a key from "${projectId}".`
    );
  } else {
    report(PASS, 'projectId matches the key', projectId);
  }

  // ── 2. Is the key still active? ───────────────────────────────────────
  section('2. Is the key still active?');

  let accessToken = '';
  try {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      credentials: { client_email: sa.client_email, private_key: sa.private_key },
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    accessToken = (token as any)?.token || '';
    report(
      accessToken ? PASS : FAIL,
      'Google issued an access token',
      accessToken ? 'the key is valid and not revoked' : 'no token returned'
    );
  } catch (e: any) {
    report(
      FAIL,
      'Google issued an access token',
      e.message,
      'The key is revoked, deleted, or the clock is wrong. Generate a new private key ' +
        '(Firebase console -> Project settings -> Service accounts -> Generate new private key).'
    );
  }

  // ── 3. Which Firestore databases actually exist? ──────────────────────
  section('3. Which Firestore databases exist?');

  let liveDatabases: Array<{ id: string; type: string; location: string }> = [];
  if (accessToken) {
    try {
      const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body: any = await res.json();

      if (!res.ok) {
        const msg = body?.error?.message || `HTTP ${res.status}`;
        if (res.status === 403 && /SERVICE_DISABLED|has not been used/i.test(msg)) {
          report(
            FAIL,
            'Cloud Firestore API enabled',
            msg.split('.')[0],
            `Enable it: https://console.cloud.google.com/apis/library/firestore.googleapis.com?project=${projectId}`
          );
        } else if (res.status === 403) {
          report(
            WARN,
            'list databases',
            msg.split('.')[0],
            'The key cannot list databases. Grant "Cloud Datastore User" (or Owner) to ' +
              `${sa.client_email} at https://console.cloud.google.com/iam-admin/iam?project=${projectId}`
          );
        } else {
          report(FAIL, 'list databases', msg);
        }
      } else {
        liveDatabases = (body.databases || []).map((d: any) => ({
          id: String(d.name).split('/databases/')[1] || '(unknown)',
          type: d.type || '(unknown)',
          location: d.locationId || '(unknown)',
        }));

        if (liveDatabases.length === 0) {
          report(
            FAIL,
            'a Firestore database exists',
            'the project has none',
            `Create one: https://console.firebase.google.com/project/${projectId}/firestore`
          );
        } else {
          report(PASS, `found ${liveDatabases.length} database(s)`);
          for (const d of liveDatabases) {
            console.log(`       - "${d.id}"  type=${d.type}  location=${d.location}`);
          }

          // No "(default)" is only a problem when nothing has been told which
          // named database to use. That is checked properly in section 4.
          const hasDefault = liveDatabases.some((d) => d.id === '(default)');
          const configured = process.env.FIREBASE_DATABASE_ID || process.env.VITE_FIREBASE_DATABASE_ID;
          if (!hasDefault && !configured) {
            report(
              FAIL,
              'a "(default)" database exists',
              `only named database(s): ${liveDatabases.map((d) => `"${d.id}"`).join(', ')}`,
              'Both SDKs address "(default)" unless told otherwise, so every query 404s. ' +
                `Set FIREBASE_DATABASE_ID and VITE_FIREBASE_DATABASE_ID to ${liveDatabases[0].id}`
            );
          } else if (!hasDefault) {
            console.log('       note: no "(default)" database — the app is pointed at a named one (checked below).');
          }

          const datastoreMode = liveDatabases.filter((d) => /DATASTORE/i.test(d.type));
          if (datastoreMode.length && !liveDatabases.some((d) => /NATIVE/i.test(d.type))) {
            report(
              FAIL,
              'database is in Native mode',
              `it is in ${datastoreMode[0].type}`,
              'Firestore client libraries cannot talk to a Datastore-mode database. A new ' +
                'Native-mode database is required; the mode cannot be switched in place.'
            );
          }
        }
      }
    } catch (e: any) {
      report(FAIL, 'list databases', e.message);
    }
  } else {
    report(WARN, 'list databases', 'skipped — no access token');
  }

  // ── 4. Admin SDK operations ───────────────────────────────────────────
  section('4. Admin SDK operations');

  try {
    adminObj.initializeApp({ projectId, credential: adminObj.credential.cert(sa) });
    report(PASS, 'Admin SDK initialized with a credential');
  } catch (e: any) {
    if (!/already exists/.test(e.message)) {
      report(FAIL, 'Admin SDK initialized', e.message);
      return finish();
    }
  }

  let probeUid: string | null = null;
  try {
    const res = await adminObj.auth().listUsers(1);
    probeUid = res.users[0]?.uid ?? null;
    report(PASS, 'Auth: list users', `${res.users.length} returned`);
  } catch (e: any) {
    report(
      FAIL,
      'Auth: list users',
      `${e.code || ''} ${e.message}`,
      `Grant "Firebase Authentication Admin" to ${sa.client_email}.`
    );
  }

  if (probeUid) {
    try {
      const rec = await adminObj.auth().getUser(probeUid);
      await adminObj.auth().setCustomUserClaims(probeUid, { ...(rec.customClaims || {}) });
      report(PASS, 'Auth: write custom claims', 'two-factor sign-in can complete');
    } catch (e: any) {
      report(
        FAIL,
        'Auth: write custom claims',
        `${e.code || ''} ${e.message}`,
        'This is the exact call that fails when 2FA reports "your code was correct, but we ' +
          `could not complete verification". Grant "Firebase Authentication Admin" to ${sa.client_email}.`
      );
    }
  }

  // Probe the SAME database the server will use, so this reflects reality.
  const serverDbId = process.env.FIREBASE_DATABASE_ID;
  const clientDbId = process.env.VITE_FIREBASE_DATABASE_ID;

  if (!serverDbId) {
    report(
      WARN,
      'FIREBASE_DATABASE_ID set',
      'unset — server will use "(default)"',
      liveDatabases.length && !liveDatabases.some((d) => d.id === '(default)')
        ? `No (default) database exists. Set FIREBASE_DATABASE_ID=${liveDatabases[0].id}`
        : ''
    );
  } else if (liveDatabases.length && !liveDatabases.some((d) => d.id === serverDbId)) {
    report(
      FAIL,
      'FIREBASE_DATABASE_ID names a real database',
      `"${serverDbId}" is not in the project`,
      `Existing: ${liveDatabases.map((d) => d.id).join(', ')}`
    );
  } else {
    report(PASS, 'FIREBASE_DATABASE_ID', serverDbId);
  }

  if (clientDbId !== serverDbId) {
    report(
      FAIL,
      'browser and server agree on the database',
      `VITE_FIREBASE_DATABASE_ID="${clientDbId ?? '(unset)'}" vs FIREBASE_DATABASE_ID="${serverDbId ?? '(unset)'}"`,
      'They must match, or the app and the server will read different data.'
    );
  } else if (clientDbId) {
    report(PASS, 'browser and server agree on the database');
  }

  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const fs = serverDbId ? getFirestore(adminObj.app(), serverDbId) : adminObj.firestore();
    await fs.collection('verification_otps').limit(1).get();
    report(PASS, 'Firestore: admin read', 'OTP codes will survive restarts');
  } catch (e: any) {
    const named = liveDatabases.filter((d) => d.id !== '(default)').map((d) => `"${d.id}"`);
    report(
      FAIL,
      'Firestore: admin read',
      `code=${e.code} ${e.message || '(no message)'}`,
      !serverDbId && named.length
        ? `The project's databases are named ${named.join(', ')}, not "(default)". Set FIREBASE_DATABASE_ID.`
        : 'Grant "Cloud Datastore User" to ' +
          `${sa.client_email} at https://console.cloud.google.com/iam-admin/iam?project=${projectId}. ` +
          'Until then OTP codes live only in server memory and are lost on restart.'
    );
  }

  // ── 5. Outbound email ─────────────────────────────────────────────────
  section('5. Outbound email (2FA codes)');

  report(
    process.env.RESEND_API_KEY ? PASS : FAIL,
    'RESEND_API_KEY set',
    '',
    'Without it no verification code can be delivered.'
  );

  const from = process.env.MAIL_FROM;
  if (!from) {
    report(
      WARN,
      'MAIL_FROM set',
      'falling back to vny@volunteernorthyork.indevs.in',
      'If that domain is not verified in Resend every code is rejected. Set MAIL_FROM to a ' +
        'verified sender: https://resend.com/domains'
    );
  } else {
    report(PASS, 'MAIL_FROM set', from);
  }

  finish();
}

function finish() {
  console.log('\n' + '='.repeat(41));
  if (failures === 0 && warnings === 0) {
    console.log('All checks passed.');
  } else {
    console.log(`${failures} failure(s), ${warnings} warning(s). Address the "fix:" lines above.`);
  }
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('\nHealth check crashed:', e);
  process.exit(1);
});
