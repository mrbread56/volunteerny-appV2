/**
 * Changing a password through the real form on the real profile page.
 *
 *   npx playwright test tests/e2e/change-password.spec.ts --reporter=line
 *
 * scripts/check-password-change.ts already proves the Firebase calls behave —
 * old password dies, new one works, wrong current password is refused. It does
 * that with the client SDK and never opens a page, so it would keep passing if
 * the box rendered nothing, sat behind a disabled button, or submitted the
 * profile form instead of itself.
 *
 * That last one is not hypothetical. Both profile pages wrap their entire body
 * in a single <form>, and HTML has no nested forms: a <form> inside one is
 * dropped by the parser, which turns a submit button into a submit button for
 * the OUTER form. Written the obvious way, clicking "Change password" would
 * have saved the profile and done nothing else. Only a real browser can catch
 * that, so this spec drives the actual widget and then proves the change by
 * signing in again with the new password on the real login screen.
 *
 * The account is seeded with the Admin SDK and deleted afterwards. Students are
 * used because two-step sign-in is off for them, so no OTP round trip is
 * needed; the widget itself is identical on both profile pages.
 */
import { test, expect, Page } from '@playwright/test';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const a: any = (admin as any).default || admin;
const stamp = Date.now();

const OLD_PASSWORD = 'uiOldPass!123';
const NEW_PASSWORD = 'uiNewPass!456';

// The check_pwd_ prefix is registered in server/testAccounts.ts, so the janitor
// sweeps this account and the public impact counter never counts it.
const STUDENT = { email: `check_pwd_ui_${stamp}@volunteerny-check.invalid`, uid: '' };

let adminApp: any = null;
let db: any = null;

test.beforeAll(async () => {
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `pwd-ui-${stamp}`,
  );
  db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const u = await adminApp.auth().createUser({
    email: STUDENT.email,
    password: OLD_PASSWORD,
    emailVerified: true,
  });
  STUDENT.uid = u.uid;

  await db.collection('users').doc(u.uid).set({
    uid: u.uid,
    email: STUDENT.email,
    role: 'student',
    twoFactorEnabled: false,
    firstName: 'Pwd',
    lastName: 'Check',
    createdAt: new Date().toISOString(),
  });
  // This shape is copied from tests/e2e/console-sweep.spec.ts rather than
  // invented. A first attempt seeded firstName/lastName and a numeric grade and
  // left out the array fields; the profile page maps over interests, skills and
  // availability, so it threw into the error boundary and the failure looked
  // like the new widget was missing when the page had not rendered at all.
  await db.collection('students').doc(u.uid).set({
    uid: u.uid,
    fullName: 'Pwd Check',
    school: 'Earl Haig Secondary School',
    grade: '10',
    neighborhood: 'Willowdale',
    interests: ['Environment'],
    skills: ['Leadership'],
    availability: ['Flexible'],
    resumeUrl: '',
  });
});

test.afterAll(async () => {
  if (!adminApp) return;
  await db.collection('students').doc(STUDENT.uid).delete().catch(() => {});
  await db.collection('users').doc(STUDENT.uid).delete().catch(() => {});
  await adminApp.auth().deleteUser(STUDENT.uid).catch(() => {});
});

async function signIn(page: Page, password: string) {
  await page.goto('/login');
  await page.evaluate(() => {
    indexedDB.deleteDatabase('firebaseLocalStorageDb');
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/login');
  await page.getByLabel('Email').fill(STUDENT.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(/\/(student|org|developer)\//, { timeout: 30000 });
}

async function fillChangeBox(page: Page, current: string, next: string, confirm: string) {
  await page.getByLabel('Current password').fill(current);
  await page.getByLabel('New password', { exact: true }).fill(next);
  await page.getByLabel('Confirm new password').fill(confirm);
  await page.getByRole('button', { name: 'Change password' }).click();
}

test('a student can change their password through the profile form', async ({ page }) => {
  test.setTimeout(180000);

  await signIn(page, OLD_PASSWORD);
  await page.goto('/student/profile');

  // The box has to actually be on the page. Before this feature existed the
  // only password control in the whole app was "Forgot password?" on the login
  // screen, so an absent widget is the regression this guards.
  await expect(page.getByRole('button', { name: 'Change password' })).toBeVisible();

  // ── it refuses a wrong current password ──────────────────────────────────
  await fillChangeBox(page, 'definitely-not-it', NEW_PASSWORD, NEW_PASSWORD);
  await expect(page.getByRole('alert')).toContainText('current password is not right', {
    timeout: 20000,
  });

  // ── it refuses a mismatch, without a network round trip ──────────────────
  await fillChangeBox(page, OLD_PASSWORD, NEW_PASSWORD, NEW_PASSWORD + 'typo');
  await expect(page.getByRole('alert')).toContainText('do not match');

  // ── it refuses a password shorter than Firebase would accept ─────────────
  await fillChangeBox(page, OLD_PASSWORD, 'abc', 'abc');
  await expect(page.getByRole('alert')).toContainText('at least 6 characters');

  // ── and the profile form was never submitted by any of that ──────────────
  // A nested <form> would have made this button save the profile instead. If
  // that happened we would be looking at the profile's own "Changes Saved!"
  // banner rather than a password error.
  await expect(page.getByText('Changes Saved!')).toHaveCount(0);

  // ── the real change ──────────────────────────────────────────────────────
  await fillChangeBox(page, OLD_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
  await expect(page.getByRole('status')).toContainText('Password changed', { timeout: 20000 });

  // Nothing is left in the boxes for the next person at this laptop.
  await expect(page.getByLabel('Current password')).toHaveValue('');
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue('');

  // The change must not have signed them out mid-edit.
  await expect(page).toHaveURL(/\/student\/profile/);

  // ── the proof: the new password signs in and the old one does not ────────
  await signIn(page, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/student\//);

  await page.goto('/login');
  await page.evaluate(() => {
    indexedDB.deleteDatabase('firebaseLocalStorageDb');
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/login');
  await page.getByLabel('Email').fill(STUDENT.email);
  await page.getByLabel('Password', { exact: true }).fill(OLD_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Still on the login screen, and told why.
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 20000 });
  await expect(page).toHaveURL(/\/login/);
});
