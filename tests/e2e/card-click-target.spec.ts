/**
 * The whole opportunity card opens the posting, not just the title.
 *
 * Only the <h3> was wrapped in a Link, so a student tapping the location, the
 * distance line, the skills chips or any of the whitespace — most of a card
 * that is styled to look like one big button, and nearly all of its area on a
 * phone — got nothing at all.
 *
 * The fix is a stretched link: the title's ::after is absolutely positioned
 * over the whole card. That keeps exactly one real anchor per card, so the
 * accessibility tree is unchanged and there is no duplicate tab stop, while the
 * hit area becomes the card. This asserts the part that is easy to break: a
 * click well away from the title still navigates, and Save still works despite
 * now sitting under an overlay.
 */
import { test, expect } from '@playwright/test';
import a from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const PASSWORD = 'cardClick!123';
const stamp = Date.now();
const EMAIL = `cardclick.${stamp}@example.com`;

let adminApp: a.app.App;
let uid = '';

test.beforeAll(async () => {
  test.setTimeout(120_000);
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `cardclick-${stamp}`,
  );
  const db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const u = await adminApp.auth().createUser({ email: EMAIL, password: PASSWORD, emailVerified: true });
  uid = u.uid;
  await db.collection('users').doc(uid).set({
    uid, email: EMAIL, role: 'student', twoFactorEnabled: false,
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('students').doc(uid).set({
    uid, fullName: 'Card Click', school: 'Earl Haig Secondary School', grade: '11',
    neighborhood: 'Willowdale', interests: [], skills: [], availability: [],
    resumeUrl: '', trackerEnabled: false, isFixture: true,
  });
});

test.afterAll(async () => {
  if (!adminApp) return;
  const db = adminApp.firestore();
  if (uid) {
    await adminApp.auth().deleteUser(uid).catch(() => {});
    for (const c of ['users', 'students']) await db.collection(c).doc(uid).delete().catch(() => {});
  }
  await adminApp.delete().catch(() => {});
});

test('a click anywhere on a card opens the posting', async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto('/login');
  await page.evaluate(() => { try { localStorage.setItem('storage_notice_seen', 'true'); } catch { /* blocked */ } });
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

  await page.goto('/student/opportunities');
  const card = page.locator('a[href^="/student/opportunities/"]').first().locator('xpath=ancestor::*[contains(@class,"rounded-xl")][1]');
  await expect(card).toBeVisible({ timeout: 30_000 });

  // The overlay must actually cover the card, not just exist.
  const geom = await card.evaluate((el) => {
    const link = el.querySelector('a[href^="/student/opportunities/"]')!;
    const o = getComputedStyle(link, '::after');
    const cardBox = el.getBoundingClientRect();
    const linkBox = link.getBoundingClientRect();
    return {
      position: o.position, content: o.content,
      top: o.top, left: o.left, right: o.right, bottom: o.bottom,
      width: o.width, height: o.height,
      cardH: Math.round(cardBox.height), linkH: Math.round(linkBox.height),
      cardPos: getComputedStyle(el).position,
    };
  });
  expect(geom.position, 'overlay should be absolutely positioned').toBe('absolute');

  expect(Number.parseFloat(geom.height), 'overlay should span the card, not just the title')
    .toBeGreaterThan(geom.linkH * 2);

  /*
   * Element-relative click, NOT page.mouse.click at a bounding-box coordinate.
   *
   * The card is ~422px tall and the browse chrome puts its top around y=355,
   * so its bottom edge sits below a 720px viewport. page.mouse takes viewport
   * coordinates and does not scroll, so the first version of this test clicked
   * empty space under the fold and reported a passing overlay with a failing
   * click — a bug in the test that read exactly like a bug in the app.
   */
  await card.click({ position: { x: 40, y: geom.cardH - 14 } });
  await expect(page).toHaveURL(/\/student\/opportunities\/[A-Za-z0-9]+/, { timeout: 20_000 });
});

test('Save still works now that an overlay sits over the card', async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto('/login');
  await page.evaluate(() => { try { localStorage.setItem('storage_notice_seen', 'true'); } catch { /* blocked */ } });
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

  await page.goto('/student/opportunities');
  const save = page.getByRole('button', { name: 'Save to favorites' }).first();
  await expect(save).toBeVisible({ timeout: 30_000 });

  await save.click();
  // The point: Save must not navigate. Its z-index puts it above the overlay
  // and its handler stops the event.
  await page.waitForTimeout(1200);
  await expect(page).toHaveURL(/\/student\/opportunities\/?(\?.*)?$/);
});
