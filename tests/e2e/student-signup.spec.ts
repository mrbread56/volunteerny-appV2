import { test, expect } from '@playwright/test';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

/**
 * A student registering, all the way through the real form.
 *
 * There was no coverage of this at all. `signup.spec.ts` only checks that the
 * submit button disables on a double click — it never completes a signup — so
 * the whole suite could be green while nobody could create an account. That is
 * the one flow where a regression makes every other feature irrelevant, and it
 * is exactly the risk of adding a REQUIRED field to the form: the gender select
 * is new, and a required control that a student cannot satisfy silently ends
 * registration.
 *
 * So this fills the form the way a person does, submits, and then asserts
 * against Firestore that both documents were written with the values entered —
 * including the new field, and including that the rules accepted them.
 */
const a: any = (admin as any).default || admin;
const stamp = Date.now();
const EMAIL = `signup_ui_${stamp}@example.com`;
const PASSWORD = 'signupUi!Check123';

let adminApp: any = null;
let db: any = null;
let createdUid = '';

test.beforeAll(async () => {
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `signupui-${stamp}`,
  );
  db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });
});

test.afterAll(async () => {
  if (!db || !createdUid) return;
  for (const c of ['users', 'students']) {
    await db.collection(c).doc(createdUid).delete().catch(() => {});
  }
  await adminApp.auth().deleteUser(createdUid).catch(() => {});
});

test('a student can register through the form, gender included', async ({ page }) => {
  test.setTimeout(180000);

  // No storage clearing: Playwright gives every test a fresh browser context,
  // so it is already empty — and navigating twice reset the form back to the
  // role-select stage after the role had been chosen.
  await page.goto('/signup');
  await page.getByRole('button', { name: /i'm a student/i }).click();
  await page.getByRole('button', { name: /^continue$/i }).click();

  // Regex labels. Every label here carries a trailing required marker, and the
  // name input has no `type` ATTRIBUTE at all (the DOM property defaults to
  // "text", which is why an attribute selector silently matched nothing).
  await page.getByLabel(/^full name/i).fill('Signup UI Student');
  await page.getByLabel(/^grade/i).selectOption('11');

  // The new required control. If it were missing or unsatisfiable, submitting
  // below would never produce a Firestore document — and this fails loudly
  // rather than letting that reach a real student.
  const gender = page.getByLabel(/^gender/i);
  await expect(gender).toBeVisible();
  await expect(gender).toHaveAttribute('required', '');
  await gender.selectOption('female');

  await page.getByLabel(/^email address/i).fill(EMAIL);
  await page.getByLabel(/^password/i).fill(PASSWORD);
  await page.locator('#consent').check();
  await page.getByRole('button', { name: /create account/i }).click();

  // The account and BOTH documents must exist, and carry what was typed.
  await expect
    .poll(async () => {
      const rec = await adminApp.auth().getUserByEmail(EMAIL).catch(() => null);
      if (rec) createdUid = rec.uid;
      return !!rec;
    }, { timeout: 45000, message: 'no auth account was created' })
    .toBe(true);

  await expect
    .poll(async () => (await db.collection('students').doc(createdUid).get()).exists,
      { timeout: 30000, message: 'the students profile document was never written' })
    .toBe(true);

  const profile = (await db.collection('students').doc(createdUid).get()).data();
  expect(profile.fullName).toBe('Signup UI Student');
  expect(profile.grade).toBe('11');
  // The point of the test: the new field round-trips, and firestore.rules
  // accepted a document containing it.
  expect(profile.gender).toBe('female');

  const account = (await db.collection('users').doc(createdUid).get()).data();
  expect(account.role).toBe('student');
  expect(account.email).toBe(EMAIL);
});

test('the gender select refuses to submit until it is answered', async ({ page }) => {
  test.setTimeout(120000);

  await page.goto('/signup');
  await page.getByRole('button', { name: /i'm a student/i }).click();
  await page.getByRole('button', { name: /^continue$/i }).click();

  await page.getByLabel(/^full name/i).fill('No Gender Student');
  await page.getByLabel(/^grade/i).selectOption('11');
  await page.getByLabel(/^email address/i).fill(`nogender_${stamp}@example.com`);
  await page.getByLabel(/^password/i).fill(PASSWORD);
  await page.locator('#consent').check();
  await page.getByRole('button', { name: /create account/i }).click();

  // Still on the form — nothing was created. Either the native `required`
  // blocks it or the explicit guard in handleSignup does; both are acceptable,
  // silently creating a genderless account is not.
  await expect(page).toHaveURL(/\/signup/);
  const leaked = await adminApp.auth().getUserByEmail(`nogender_${stamp}@example.com`).catch(() => null);
  expect(leaked, 'an account was created despite the required field being empty').toBeNull();
});
