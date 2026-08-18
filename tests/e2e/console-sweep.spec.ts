/**
 * Diagnostic sweep: visit every reachable route as a real student and dump
 * EVERY console message and page error, deduplicated with counts.
 *
 * Not an assertion test — it is a report. Run it to see exactly what the
 * browser is complaining about and where.
 *
 *   npx playwright test tests/e2e/console-sweep.spec.ts --reporter=line
 */
import { test } from '@playwright/test';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const a: any = (admin as any).default || admin;
const PASSWORD = 'sweepCheck!123';
const stamp = Date.now();
const ACCOUNTS = {
  student: { email: `sweep_student_${stamp}@example.com`, uid: '' },
  organization: { email: `sweep_org_${stamp}@example.com`, uid: '' },
  developer: { email: `sweep_dev_${stamp}@example.com`, uid: '' },
};
let adminApp: any = null;

const seen = new Map<string, { count: number; routes: Set<string>; type: string }>();

/**
 * Known-benign console output, with the reason it is benign. Anything not
 * matched here is reported as a real finding — the point of this sweep is that
 * a clean run prints zero, so recurring noise has to be classified rather than
 * mentally filtered every time.
 */
const EXPECTED: { match: RegExp; why: string }[] = [
  {
    match: /403 \(Forbidden\)/,
    why:
      'the developer dashboard calls /api/email/history, which gates on the ' +
      'VITE_DEVELOPER_EMAILS allowlist rather than the Firestore role. The seeded ' +
      'test account is deliberately not on that allowlist, so 403 is correct.',
  },
  {
    match: /Geocoding error: TypeError: Failed to fetch/,
    why:
      'an artifact of this sweep, not of the app. The opportunity form debounces a ' +
      'geocode lookup and aborts it on unmount (an explicit abort raises AbortError, ' +
      'which the handler ignores). But this sweep moves between routes with ' +
      'page.goto(), a FULL document teardown — React cleanup never runs, so the ' +
      'browser kills the in-flight request itself and reports TypeError. Real users ' +
      'navigate client-side, where the abort path runs and this is silent. The tell ' +
      'is that it is always attributed to the route navigated TO, never to the ' +
      'opportunity form that owns the request. Flaky by nature: it only appears when ' +
      'a lookup happens to be in flight at teardown.',
  },
  {
    match: /ws:\/\/localhost:24678|\[vite\] failed to connect|WebSocket closed without opened/,
    why:
      "the Vite dev server HMR websocket, dying under load. Port 24678 is the " +
      "hot-reload channel; the production build contains no HMR client at all, " +
      "so this class of error cannot reach a user. It appears only when this " +
      "sweep runs alongside enough parallel work that the dev server cannot " +
      "service the socket - first seen in a soak round running the full browser " +
      "suite concurrently with five live check suites. Kept narrow: only the " +
      "HMR port and Vite-specific message text match, so a real application " +
      "websocket failure would still fail the sweep.",
  },
];

function expectedReason(text: string): string | null {
  return EXPECTED.find((e) => e.match.test(text))?.why ?? null;
}

function record(type: string, text: string, route: string) {
  // Collapse volatile ids so the same failure groups into one row.
  const key = `${type}|${text.replace(/[0-9a-f]{8,}/gi, '<id>').slice(0, 220)}`;
  const hit = seen.get(key) || { count: 0, routes: new Set<string>(), type };
  hit.count++;
  hit.routes.add(route);
  seen.set(key, hit);
}

test.beforeAll(async () => {
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `sweep-${Date.now()}`
  );
  const db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });
  for (const [role, acct] of Object.entries(ACCOUNTS)) {
    const u = await adminApp.auth().createUser({ email: acct.email, password: PASSWORD, emailVerified: true });
    acct.uid = u.uid;
    // The MFA gate trusts only the signed custom claim, so set it here rather
    // than trying to drive an emailed OTP. This is the same claim the server
    // writes after a real code check.
    await adminApp.auth().setCustomUserClaims(u.uid, { mfaGraceUntil: Math.floor(Date.now() / 1000) + 3600 });
    await db.collection('users').doc(u.uid).set({
      uid: u.uid, email: acct.email, role, twoFactorEnabled: role !== 'student',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
    });
    if (role === 'student') {
      await db.collection('students').doc(u.uid).set({
        uid: u.uid, fullName: 'Sweep Student', school: 'Earl Haig Secondary School', grade: '11',
        neighborhood: 'Willowdale', interests: ['Environment'], skills: ['Leadership'],
        availability: ['Flexible'], resumeUrl: '',
      });
    } else if (role === 'organization') {
      await db.collection('organizations').doc(u.uid).set({
        uid: u.uid, organizationName: 'Sweep Org', mission: 'Sweeping.', contactEmail: acct.email,
        northYorkConfirmed: true, organizationType: 'Other', address: '5100 Yonge St',
        phone: '', websiteUrl: '', craVerified: false, verificationStatus: 'verified',
      });
    }
  }
});

test.afterAll(async () => {
  if (adminApp) {
    const db = adminApp.firestore();
    for (const acct of Object.values(ACCOUNTS)) {
      if (!acct.uid) continue;
      await adminApp.auth().deleteUser(acct.uid).catch(() => {});
      for (const c of ['users', 'students', 'organizations']) {
        await db.collection(c).doc(acct.uid).delete().catch(() => {});
      }
    }
  }

  const rows = [...seen.entries()].sort((x, y) => y[1].count - x[1].count);
  const classified = rows.map(([key, v]) => {
    const [type, text] = key.split('|');
    return { text, ...v, type, why: expectedReason(text) };
  });
  const unexpected = classified.filter((r) => !r.why);
  const expected = classified.filter((r) => r.why);

  console.log(`\n================ CONSOLE SWEEP ================`);
  console.log(`UNEXPECTED: ${unexpected.length} distinct (${unexpected.reduce((n, r) => n + r.count, 0)} events)`);
  console.log(`expected/benign: ${expected.length} distinct`);

  for (const r of unexpected) {
    console.log(`\n  [${r.type}] x${r.count}  routes: ${[...r.routes].join(', ')}`);
    console.log(`    ${r.text}`);
  }
  if (!unexpected.length) console.log('\n  nothing unexpected.');

  for (const r of expected) {
    console.log(`\n  (expected) [${r.type}] x${r.count}  routes: ${[...r.routes].join(', ')}`);
    console.log(`    ${r.text}`);
    console.log(`    why: ${r.why}`);
  }
  console.log(`\n===============================================\n`);
});

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/terms', '/privacy'];
const ROLE_ROUTES: Record<string, string[]> = {
  student: [
    '/student/dashboard',
    '/student/dashboard?tab=applications',
    '/student/dashboard?tab=hours',
    '/student/dashboard?tab=leaderboard',
    '/student/opportunities',
    '/student/profile',
    '/feedback',
  ],
  organization: [
    '/org/dashboard',
    '/org/dashboard?tab=hours',
    '/org/profile',
    '/org/opportunities/new',
    '/feedback',
  ],
  developer: ['/developer/dashboard', '/feedback'],
};

let route = '(startup)';

test('sweep every route as every role and report console output', async ({ page }) => {
  test.setTimeout(600000);
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') record(t, m.text(), route);
  });
  page.on('pageerror', (e) => record('pageerror', e.message, route));

  for (const r of PUBLIC_ROUTES) {
    route = r;
    await page.goto(r);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
  }

  for (const [role, routes] of Object.entries(ROLE_ROUTES)) {
    route = `${role} (sign in)`;
    await page.goto('/login');
    // Clear any prior session so each role starts clean.
    await page.evaluate(() => {
      indexedDB.deleteDatabase('firebaseLocalStorageDb');
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/login');
    await page.getByLabel('Email').fill(ACCOUNTS[role as keyof typeof ACCOUNTS].email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(6000);

    for (const r of routes) {
      route = `[${role}] ${r}`;
      await page.goto(r);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(3000);
    }
  }
});
