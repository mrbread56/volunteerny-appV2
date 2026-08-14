/**
 * Signs in as a REAL student (not demo mode) and asserts that every
 * authenticated route renders without a console error.
 *
 * The pre-existing suite only ever exercised demo mode, which short-circuits
 * every Firestore call — so a rule that denied every query still passed all 20
 * tests. This is the test that would have caught it.
 */
import { test, expect, type ConsoleMessage } from '@playwright/test';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const a: any = (admin as any).default || admin;
const EMAIL = `e2e_student_${Date.now()}@example.com`;
const PASSWORD = 'e2eStudent!123';
let uid = '';
// Held directly rather than looked up from admin.apps at teardown: this spec
// runs against the real project, so a cleanup that resolves the wrong app (or
// none) leaves a live account behind in the database real users sign in to.
let adminApp: any = null;

// Firestore's transport logs benign noise (WebChannel retries, deprecation
// notices). Only genuine application failures should fail the run.
const IGNORED = [
  /favicon/i,
  /Failed to load resource/i,
  /net::ERR_/i,
  /Download the React DevTools/i,
  /WebChannelConnection/i,
];

function isRealError(msg: ConsoleMessage) {
  if (msg.type() !== 'error') return false;
  return !IGNORED.some((re) => re.test(msg.text()));
}

test.beforeAll(async () => {
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `e2e-${Date.now()}`
  );
  const db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const user = await adminApp.auth().createUser({ email: EMAIL, password: PASSWORD, emailVerified: true });
  uid = user.uid;
  await db.collection('users').doc(uid).set({
    uid, email: EMAIL, role: 'student', twoFactorEnabled: false,
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('students').doc(uid).set({
    uid, fullName: 'E2E Student', school: 'Earl Haig Secondary School', grade: '11',
    neighborhood: 'Willowdale', interests: ['Environment'], skills: ['Leadership'],
    availability: ['Flexible'], resumeUrl: '',
  });
});

test.afterAll(async () => {
  if (!uid || !adminApp) return;
  const db = adminApp.firestore();
  await adminApp.auth().deleteUser(uid).catch(() => {});
  for (const c of ['users', 'students']) await db.collection(c).doc(uid).delete().catch(() => {});
});

const ROUTES = [
  '/student/dashboard',
  '/student/opportunities',
  '/student/profile',
  '/feedback',
];

test('a real student can sign in and every route loads without console errors', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (isRealError(msg)) errors.push(`${page.url()} :: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`${page.url()} :: ${err.message}`));

  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Landing on the dashboard is itself the proof that sign-in succeeded.
  await expect(page.getByText(/Hi, E2E Student/i)).toBeVisible({ timeout: 20000 });

  for (const route of ROUTES) {
    await page.goto(route);
    // Not networkidle: Firestore holds a long-lived WebChannel open, so the
    // network is never idle and the wait always times out.
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 15000 });
    // Give the route's async Firestore reads a chance to reject.
    await page.waitForTimeout(2500);
    // A route that bounced back to /login means the guard rejected the session.
    expect(page.url(), `${route} redirected away`).toContain(route);
  }

  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
});
