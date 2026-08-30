import { test, expect } from '@playwright/test';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

/**
 * The whole organisation entry path, through the real interface.
 *
 * A coverage audit by role found this hole: registration, sign-in and recovery
 * had no browser test at all on the organisation side. check:recovery proves
 * the ENDPOINTS work; nothing proved a coordinator could actually use them.
 *
 * That is the review's gate 2 — organisation sign up, log in, MFA, recovery,
 * fully healthy — and it matters more than the student equivalent, because a
 * student who cannot get in tries again tomorrow while an organisation who
 * cannot get in never comes back.
 *
 * The sequence is the real one, including the chicken-and-egg it contains:
 * recovery codes can only be created from inside an authenticated session, so
 * an organisation has to pass the gate once before it has any way to recover.
 * Anyone who loses their mailbox before doing that is still dependent on
 * support, which is worth stating rather than glossing over.
 */
test.describe.configure({ mode: 'serial' });

const a: any = (admin as any).default || admin;
const stamp = Date.now();
const EMAIL = `orgentry_${stamp}@example.com`;
const PASSWORD = 'orgEntry!Check123';

let adminApp: any = null;
let db: any = null;
let uid = '';
let recoveryCodes: string[] = [];

test.beforeAll(async () => {
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `orgentry-${stamp}`,
  );
  db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });
});

test.afterAll(async () => {
  if (!uid) return;
  for (const c of ['users', 'organizations', 'mfaBackupCodes']) {
    await db.collection(c).doc(uid).delete().catch(() => {});
  }
  await adminApp.auth().deleteUser(uid).catch(() => {});
});

/**
 * Open the support grace window, which is what lets a fixture past the gate
 * without an inbox. The per-sign-in claim comparison itself is covered
 * exhaustively by check:mfa; this test is about the screens.
 */
async function openGraceWindow(): Promise<void> {
  const rec = await adminApp.auth().getUser(uid);
  await adminApp.auth().setCustomUserClaims(uid, {
    ...(rec.customClaims || {}),
    mfaGraceUntil: Math.floor(Date.now() / 1000) + 3600,
  });
}

test('an organisation can register through the real form', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto('/signup');
  await page.getByRole('button', { name: /organization/i }).first().click();
  await page.getByRole('button', { name: /^continue$/i }).click();

  await page.getByLabel(/^organization name/i).fill('Org Entry Test');
  const type = page.getByRole('combobox', { name: /organization type/i });
  await type.click();
  await type.fill('non-profit');
  await page.getByRole('option').first().click();
  await page.getByLabel(/^mission/i).fill('We test our own front door.');
  await page.getByRole('button', { name: /^no$/i }).first().click();
  /*
   * The address, which the form marks required and now enforces.
   *
   * It was labelled with an asterisk and validated nowhere, so an organisation
   * could register with a blank one and then reach a reviewer whose screen
   * instructs them to confirm the address is in or near North York. This test
   * skipped it, which is how the gap stayed invisible.
   */
  await page.getByRole('textbox', { name: /address/i }).first().fill('5100 Yonge St, North York');
  await page.getByLabel(/^email address/i).fill(EMAIL);
  await page.getByLabel(/^password/i).fill(PASSWORD);
  await page.locator('#consent').check();
  await page.getByRole('button', { name: /create account/i }).click();

  await expect.poll(async () => {
    const rec = await adminApp.auth().getUserByEmail(EMAIL).catch(() => null);
    if (rec) uid = rec.uid;
    return !!rec;
  }, { timeout: 45000, message: 'no organisation account was created' }).toBe(true);

  await expect.poll(async () =>
    (await db.collection('organizations').doc(uid).get()).exists,
    { timeout: 30000, message: 'the organisation profile was never written' }).toBe(true);

  const profile = (await db.collection('organizations').doc(uid).get()).data();
  expect(profile?.organizationName).toBe('Org Entry Test');

  // Two-factor has to be on from the first moment. An organisation that could
  // register without it would simply never be challenged.
  const account = (await db.collection('users').doc(uid).get()).data();
  expect(account?.role).toBe('organization');
  expect(account?.twoFactorEnabled, 'a new organisation was not given two-factor').toBe(true);
});

test('signing in puts an organisation through the two-factor gate', async ({ page }) => {
  test.setTimeout(180000);
  await adminApp.auth().updateUser(uid, { emailVerified: true });

  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');

  // The point of the gate: a password alone must not reach the dashboard.
  await page.waitForURL(/\/mfa/, { timeout: 40000 });
  await expect(page.getByRole('button', { name: /use a recovery code instead/i })).toBeVisible();
});

test('once inside, an organisation can create recovery codes', async ({ page }) => {
  test.setTimeout(180000);
  await openGraceWindow();

  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/org\//, { timeout: 40000 });

  await page.goto('/org/profile');
  await page.getByRole('button', { name: /create recovery codes/i }).click();

  // Shown once, and the screen has to say so, because only hashes are kept and
  // nobody — including us — can produce them again.
  await expect(page.getByText(/only time they are shown/i)).toBeVisible({ timeout: 30000 });

  await expect.poll(async () => {
    const doc = await db.collection('mfaBackupCodes').doc(uid).get();
    return doc.exists ? (doc.data()?.hashes || []).length : 0;
  }, { timeout: 20000 }).toBe(10);

  const listed = await page.locator('li').allInnerTexts().catch(() => []);
  recoveryCodes = listed
    .map((t) => t.trim())
    .filter((t) => /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(t));
  expect(recoveryCodes.length, 'the codes were not readable on screen').toBeGreaterThan(0);
});

test('a locked-out organisation gets back in with a recovery code', async ({ page }) => {
  test.setTimeout(180000);
  test.skip(recoveryCodes.length === 0, 'no codes were captured in the previous step');

  // Close the grace window and clear any claim, so it is unambiguously the
  // recovery code doing the work and not a leftover session.
  const rec = await adminApp.auth().getUser(uid);
  const claims: Record<string, unknown> = { ...(rec.customClaims || {}) };
  delete claims.mfaGraceUntil;
  delete claims.mfaVerified;
  delete claims.mfaVerifiedFor;
  await adminApp.auth().setCustomUserClaims(uid, claims);

  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/mfa/, { timeout: 40000 });

  await page.getByRole('button', { name: /use a recovery code instead/i }).click();
  await page.locator('#mfa-code').fill(recoveryCodes[0]);
  await page.getByRole('button', { name: /verify|continue|submit/i }).first().click();

  // The measure of success: the DASHBOARD, reached without the mailbox.
  //
  // Not merely "signed in". This test originally landed on the marketing home
  // page — authenticated, but looking at "Find where you belong" instead of the
  // applicants they had just recovered their account to reach. MfaChallenge sent
  // every role to "/" after verifying; it now routes by role, the way Login
  // always has.
  await page.waitForURL(/\/org\/dashboard/, { timeout: 45000 });
  expect(page.url()).toMatch(/\/org\/dashboard/);

  // ...and that code is spent, so a shared printout cannot be reused.
  const doc = await db.collection('mfaBackupCodes').doc(uid).get();
  const used = (doc.data()?.hashes || []).filter((h: any) => h.usedAt).length;
  expect(used, 'the redeemed code was not marked as used').toBe(1);
});
