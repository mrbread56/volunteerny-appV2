import { test, expect } from '@playwright/test';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

/**
 * The organization-type picker, driven the way a coordinator drives it.
 *
 * The field existed before with eight options in a plain <select>. It is now a
 * searchable list of thirty-odd, drawn from what Ontario boards actually
 * publish, with a free-text answer behind "Other" — and a required control that
 * a user cannot satisfy silently ends registration, which is the one regression
 * that makes every other feature irrelevant.
 */
test.describe.configure({ mode: 'serial' });

const a: any = (admin as any).default || admin;
const stamp = Date.now();
const PASSWORD = 'orgType!Check123';
let adminApp: any = null;
let db: any = null;
const created: string[] = [];

test.beforeAll(async () => {
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `orgtype-${stamp}`,
  );
  db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });
});

test.afterAll(async () => {
  for (const uid of created) {
    for (const c of ['users', 'organizations']) {
      await db.collection(c).doc(uid).delete().catch(() => {});
    }
    await adminApp.auth().deleteUser(uid).catch(() => {});
  }
});

async function openOrgForm(page: any) {
  await page.goto('/signup');
  await page.getByRole('button', { name: /organization/i }).first().click();
  await page.getByRole('button', { name: /^continue$/i }).click();
}

/**
 * Everything the org form requires EXCEPT the organization type.
 *
 * The CRA question is a pair of buttons with aria-pressed, not a form control,
 * so it does not appear in the DOM as an input and is easy to miss — leaving it
 * unanswered blocks submission with a message, which made an earlier version of
 * the "Other must be specified" test pass for entirely the wrong reason.
 */
async function fillOrgFormExceptType(page: any, name: string, email: string) {
  await page.getByLabel(/^organization name/i).fill(name);
  await page.getByLabel(/^mission/i).fill('We fix things together.');
  await page.getByRole('button', { name: /^no$/i }).first().click();
  // The address is required and now enforced, so a helper that omits it makes
  // every test using it fail on validation rather than on what it is testing.
  await page.getByRole('textbox', { name: /address/i }).first().fill('5100 Yonge St, North York');
  await page.getByLabel(/^email address/i).fill(email);
  await page.getByLabel(/^password/i).fill(PASSWORD);
  await page.locator('#consent').check();
}

test('typing filters the list, and a choice is recorded', async ({ page }) => {
  test.setTimeout(180000);
  await openOrgForm(page);

  const combo = page.getByRole('combobox', { name: /organization type/i });
  await expect(combo).toBeVisible();

  // Filtering: "libr" should reduce the list to the library entry.
  await combo.click();
  await combo.fill('libr');
  const options = page.getByRole('option');
  await expect(options.first()).toContainText(/library/i);
  expect(await options.count()).toBeLessThan(5);

  // An accent must not hide a real answer: "metis" finds "Métis".
  await combo.fill('metis');
  await expect(page.getByRole('option').first()).toContainText(/Métis/i);

  // Keyboard selection, not just clicking.
  await combo.fill('food');
  await combo.press('ArrowDown');
  await combo.press('Enter');
  await expect(combo).toHaveValue(/food/i);
});

test('choosing Other reveals a specify box, and both values are saved', async ({ page }) => {
  test.setTimeout(180000);
  const email = `orgtype_other_${stamp}@example.com`;
  await openOrgForm(page);

  const combo = page.getByRole('combobox', { name: /organization type/i });
  await combo.click();
  await combo.fill('other');
  await page.getByRole('option', { name: /^other$/i }).first().click();

  // The free-text field only exists once Other is chosen.
  const specify = page.getByLabel(/please specify/i);
  await expect(specify).toBeVisible();
  await specify.fill('Student-run repair cafe');

  await fillOrgFormExceptType(page, 'Repair Cafe Collective', email);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect.poll(async () => {
    const rec = await adminApp.auth().getUserByEmail(email).catch(() => null);
    if (rec) created.push(rec.uid);
    return !!rec;
  }, { timeout: 45000, message: 'no organization account was created' }).toBe(true);

  const uid = created[created.length - 1];
  await expect.poll(async () =>
    (await db.collection('organizations').doc(uid).get()).exists,
    { timeout: 30000 }).toBe(true);

  const profile = (await db.collection('organizations').doc(uid).get()).data();
  expect(profile.organizationType).toBe('Other');
  // The point: the specific answer is kept ALONGSIDE the coarse category, so
  // the category stays queryable and the detail is not lost.
  expect(profile.organizationTypeOther).toBe('Student-run repair cafe');
});

test('Other with an empty box does not create an account', async ({ page }) => {
  test.setTimeout(120000);
  const email = `orgtype_blank_${stamp}@example.com`;
  await openOrgForm(page);

  const combo = page.getByRole('combobox', { name: /organization type/i });
  await combo.click();
  await combo.fill('other');
  await page.getByRole('option', { name: /^other$/i }).first().click();

  // Everything else is valid, so the ONLY thing that can stop this submission
  // is the empty specification. Without that, this test would pass merely
  // because some unrelated required field was blank.
  await fillOrgFormExceptType(page, 'Nameless Type', email);
  await page.getByRole('button', { name: /create account/i }).click();

  // Either guard is acceptable — what matters is that nothing was created.
  // In practice the browser's own validation fires first, because the specify
  // field carries `required`, so handleSignup never runs and the app's message
  // never renders. Asserting on that message would be asserting on which of the
  // two guards happened to win.
  const specifyInvalid = await page.getByLabel(/please specify/i)
    .evaluate((el: HTMLInputElement) => !el.validity.valid);
  expect(specifyInvalid, 'the specify field should be reported invalid when empty').toBe(true);

  await expect(page).toHaveURL(/\/signup/);
  const leaked = await adminApp.auth().getUserByEmail(email).catch(() => null);
  expect(leaked, 'an account was created with "Other" and no specification').toBeNull();
});
