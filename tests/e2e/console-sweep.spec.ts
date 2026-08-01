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
    await adminApp.auth().setCustomUserClaims(u.uid, { mfaVerified: true });
    await db.collection('users').doc(u.uid).set({
      uid: u.uid, email: acct.email, role, twoFactorEnabled: role !== 'student',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
    });
    if (role === 'student') {
      await db.collection('students').doc(u.uid).set({
        uid: u.uid, fullName: 'Sweep Student', school: 'Earl Haig Secondary School', grade: '11',
        neighborhood: 'Willowdale', interests: ['Environment'], skills: ['Leadership'],
        availability: ['Flexible'], resumeUrl: '', passportUrl: '',
      });
    } else if (role === 'organization') {
      await db.collection('organizations').doc(u.uid).set({
        uid: u.uid, organizationName: 'Sweep Org', mission: 'Sweeping.', contactEmail: acct.email,
        northYorkConfirmed: true, organizationType: 'Other', address: '5100 Yonge St',
        phone: '', websiteUrl: '', craVerified: false, verificationStatus: 'unverified',
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
  const errors = rows.filter(([k]) => k.startsWith('error') || k.startsWith('pageerror'));
  const warnings = rows.filter(([k]) => k.startsWith('warning'));

  console.log(`\n================ CONSOLE SWEEP ================`);
  console.log(`distinct errors: ${errors.length}   distinct warnings: ${warnings.length}`);
  console.log(`total error events: ${errors.reduce((n, [, v]) => n + v.count, 0)}`);
  for (const [key, v] of [...errors, ...warnings]) {
    const [type, text] = key.split('|');
    console.log(`\n[${type}] x${v.count}  routes: ${[...v.routes].join(', ')}`);
    console.log(`  ${text}`);
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
