import { test, expect } from '@playwright/test';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

/**
 * What a user sees when the network lets them down.
 *
 * The single most repeated bug in this project is a failed READ rendering as an
 * EMPTY STATE. It was found and fixed on the organization dashboard, the
 * developer verification queue, the feedback page and the browse page — four
 * times, in four files, because nothing tested it. "No results" and "we could
 * not load your results" look identical to a user and mean opposite things: one
 * says stop looking, the other says try again.
 *
 * This fails requests deliberately and asserts the UI says something true. It
 * is the regression guard for a whole class of bug rather than for one line.
 */
const a: any = (admin as any).default || admin;
const stamp = Date.now();
const EMAIL = `netfail_${stamp}@example.com`;
const PASSWORD = 'netFail!123';

test.describe.configure({ mode: 'serial' });

let adminApp: any = null;
let uid = '';

test.beforeAll(async () => {
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `netfail-${stamp}`,
  );
  const db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const rec = await adminApp.auth().createUser({ email: EMAIL, password: PASSWORD, emailVerified: true });
  uid = rec.uid;
  await db.collection('users').doc(uid).set({
    uid, email: EMAIL, role: 'student', twoFactorEnabled: false,
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('students').doc(uid).set({
    uid, fullName: 'Netfail Student', school: 'A.Y. Jackson Secondary School',
    grade: '11', gender: 'other', neighborhood: 'Bayview Village',
    interests: ['Environment'], skills: ['Communication'], availability: ['Weekends'],
    resumeUrl: '', passportUrl: '',
  });
});

test.afterAll(async () => {
  if (!adminApp || !uid) return;
  const db = adminApp.firestore();
  for (const c of ['users', 'students']) await db.collection(c).doc(uid).delete().catch(() => {});
  await adminApp.auth().deleteUser(uid).catch(() => {});
});

async function signIn(page: any) {
  await page.addInitScript(() => {
    try { localStorage.setItem('cookie_consent', 'essential'); } catch { /* blocked */ }
  });
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#login-email').waitFor({ timeout: 20000 });
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText(/Hi, Netfail Student/i)).toBeVisible({ timeout: 30000 });
}

/** Words that mean "nothing here", as opposed to "we could not look". */
const EMPTINESS = /no (volunteer )?(opportunities|results|applications|postings|records|hours)|nothing (here|yet)|none yet|all clear|you have not/i;
/** Words that admit a failure. */
const HONESTY = /couldn't|could not|unable|failed|try again|something went wrong|check your connection|problem|error/i;

test('a failed opportunities read says so, instead of showing an empty list', async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);

  // Kill the Firestore transport. The SDK talks over WebChannel/gRPC-web to
  // firestore.googleapis.com, so failing that host is the honest simulation of
  // a student on school wifi that blocks it, or simply losing signal.
  await page.route('**://firestore.googleapis.com/**', (route) => route.abort('failed'));

  await page.goto('/student/opportunities');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(9000);

  const text = await page.locator('body').innerText();

  // The failure mode being guarded: a read that failed, rendered as "there is
  // nothing", with no hint that anything went wrong.
  const claimsEmpty = EMPTINESS.test(text);
  const admitsFailure = HONESTY.test(text);
  expect(
    !claimsEmpty || admitsFailure,
    'the page reported emptiness after a failed read, with no sign anything broke:\n' +
      text.slice(0, 600),
  ).toBe(true);
});

test('a failed dashboard read does not leave a spinner running forever', async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);

  await page.route('**://firestore.googleapis.com/**', (route) => route.abort('failed'));
  await page.goto('/student/dashboard');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(12000);

  const text = await page.locator('body').innerText();
  // Something has to resolve: content, or an honest message. A page still
  // saying "Loading" after twelve seconds is a dead end with no way forward.
  expect(
    !/^\s*loading/i.test(text.trim()) || HONESTY.test(text),
    'the dashboard was still loading with nothing to act on:\n' + text.slice(0, 400),
  ).toBe(true);
});

test('a submission that never lands is not reported as sent', async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);

  // Load the page FIRST, with the network working. Blocking before navigation
  // just yields a blank page and proves nothing about the submit path. The
  // realistic sequence is: the page loads, the connection drops, the user
  // presses send.
  await page.goto('/feedback');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(4000);

  const form = page.locator('textarea').first();
  if (!(await form.count())) {
    test.skip(true, 'no feedback form rendered for this account');
    return;
  }

  // Now cut both transports. Feedback is written with setDoc straight to
  // Firestore (FeedbackPage.tsx:239) and only calls /api/feedback/analyze for
  // AI triage — so blocking the API alone leaves the submission working, and
  // the success banner it then shows is TRUE. Testing the wrong transport
  // reports an honest UI as a liar.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"simulated"}' }));
  await page.route('**://firestore.googleapis.com/**', (route) => route.abort('failed'));

  const subject = page.locator('input[type="text"]').first();
  if (await subject.count()) await subject.fill('Network failure probe');
  await form.fill('Submitted while the connection is down.');

  const send = page.getByRole('button', { name: /send|submit/i }).first();
  if (!(await send.count())) {
    test.skip(true, 'no submit control found');
    return;
  }
  await send.click();
  await page.waitForTimeout(8000);

  const after = await page.locator('body').innerText();
  const claimsSuccess = /submitted successfully|thank you|we received|message sent/i.test(after);
  expect(
    !claimsSuccess || HONESTY.test(after),
    `the UI confirmed a submission that never reached the database:\n${after.slice(0, 500)}`,
  ).toBe(true);
});

test('going fully offline never white-screens the app', async ({ page, context }) => {
  test.setTimeout(120000);
  await signIn(page);

  const fatal: string[] = [];
  page.on('pageerror', (e) => fatal.push(e.message));

  await context.setOffline(true);
  await page.goto('/student/dashboard').catch(() => { /* navigation may fail offline; that is fine */ });
  await page.waitForTimeout(6000);

  // The shell must survive. An unhandled rejection that unmounts the tree
  // leaves a blank page with no way back, which is the worst outcome of all.
  const stillThere = await page.locator('main#main, body').first().isVisible();
  expect(stillThere, 'the app disappeared when offline').toBe(true);
  expect(
    fatal.join('\n'),
    'an unhandled error escaped while offline:\n' + fatal.join('\n'),
  ).not.toMatch(/is not a function|undefined is not an object|Cannot read propert/i);

  await context.setOffline(false);
});
