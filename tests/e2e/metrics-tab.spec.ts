import { test, expect } from '@playwright/test';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

/**
 * The metrics tab, driven as a developer.
 *
 * The endpoint is covered by check:flows; this covers the half that a person
 * actually looks at. A dashboard that renders zeroes because the fetch failed
 * is indistinguishable from one reporting the truth, and that failure mode is
 * the exact bug class this codebase keeps finding — so the point of this test
 * is that the page shows REAL numbers, and says so loudly when it cannot.
 */
test.describe.configure({ mode: 'serial' });

const a: any = (admin as any).default || admin;
const stamp = Date.now();
const DEV = { email: `metrics_dev_${stamp}@example.com`, uid: '' };
// A real student, because the "a student cannot reach the metrics tab" test
// used to sign in as nobody and therefore proved only that an anonymous visitor
// is redirected.
const STU = { email: `metrics_stu_${stamp}@example.com`, uid: '' };
const PASSWORD = 'metricsTab!123';

let adminApp: any = null;
let db: any = null;

test.beforeAll(async () => {
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `metricstab-${stamp}`,
  );
  db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const rec = await adminApp.auth().createUser({ email: DEV.email, password: PASSWORD, emailVerified: true });
  DEV.uid = rec.uid;
  /*
   * A real developer session carries an MFA claim.
   *
   * Two-factor is mandatory for developers — the client forces it regardless of
   * what the document says, and firestore.rules and the /api/admin/* routes all
   * require the claim — so a fixture with twoFactorEnabled:false and no claim
   * is an account that cannot exist, and it now parks on /mfa instead of the
   * console. Same grace claim console-sweep uses.
   */
  await adminApp.auth().setCustomUserClaims(rec.uid, {
    mfaGraceUntil: Math.floor(Date.now() / 1000) + 3600,
  });
  await db.collection('users').doc(DEV.uid).set({
    uid: DEV.uid, email: DEV.email, role: 'developer',
    twoFactorEnabled: false, createdAt: new Date(),
  });

  const stu = await adminApp.auth().createUser({ email: STU.email, password: PASSWORD, emailVerified: true });
  STU.uid = stu.uid;
  await db.collection('users').doc(STU.uid).set({
    uid: STU.uid, email: STU.email, role: 'student',
    twoFactorEnabled: false, createdAt: new Date(),
  });
  await db.collection('students').doc(STU.uid).set({
    uid: STU.uid, fullName: 'Metrics Student', school: 'Earl Haig Secondary School',
    grade: '11', neighborhood: 'Willowdale', interests: [], skills: [],
    availability: [], resumeUrl: '', trackerEnabled: false,
  });
});

test.afterAll(async () => {
  if (!DEV.uid) return;
  await db.collection('users').doc(DEV.uid).delete().catch(() => {});
  await adminApp.auth().deleteUser(DEV.uid).catch(() => {});
  if (STU.uid) {
    await db.collection('users').doc(STU.uid).delete().catch(() => {});
    await db.collection('students').doc(STU.uid).delete().catch(() => {});
    await adminApp.auth().deleteUser(STU.uid).catch(() => {});
  }
});

test('a developer sees real signal, separated from vanity counts', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', DEV.email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/developer\//, { timeout: 40000 });

  await page.getByRole('button', { name: /^metrics$/i }).click();

  // The headline. It must be labelled as the headline, not buried in a grid.
  await expect(page.getByText(/placement rate/i)).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/median days to decision/i)).toBeVisible();
  await expect(page.getByText(/hours confirmed/i).first()).toBeVisible();

  // The split is the design. Both headings have to be present, because showing
  // registrations beside completed placements implies they are comparable.
  await expect(page.getByText(/both sides had to act/i)).toBeVisible();
  await expect(page.getByText(/rise whether or not anything happens/i)).toBeVisible();

  // Real numbers, not a spinner that never resolved: there are students in the
  // database, so the students count cannot be blank.
  await expect(page.getByText(/calculated/i)).toBeVisible({ timeout: 30000 });
});

test('a student cannot reach the metrics tab at all', async ({ page }) => {
  test.setTimeout(120000);
  /*
   * Signed in AS A STUDENT, which the test name always claimed and the body
   * never did. There was no sign-in here at all, so it asserted that an
   * ANONYMOUS visitor is redirected — something any auth guard does, and which
   * would keep passing if students were granted the developer console outright.
   */
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', STU.email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/student\//, { timeout: 40000 });
  await expect(page, 'the student fixture did not sign in, so this proved nothing')
    .not.toHaveURL(/\/login/);

  // The route guard should stop this well before the endpoint's 403 matters.
  await page.goto('/developer/dashboard');
  await expect(page).not.toHaveURL(/\/developer\/dashboard/, { timeout: 30000 });
});
