import { test, expect } from '@playwright/test';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

/**
 * A settings toggle must not blank the dashboard.
 *
 * This is the invariant `hasLoadedOnce` exists to protect, and it is exactly
 * what a tidy-looking refactor destroys. The data hook depends on
 * `studentProfile`, and every settings toggle calls refreshProfile(), which
 * yields a new object identity — so without the ref, flipping "Participate in
 * Rankings" re-runs the fetch, sets loading true, and replaces the entire
 * dashboard (sidebar, tabs, and the switch just touched) with a loading state
 * for the duration of six Firestore queries.
 *
 * The type checker cannot see this, and neither can any other test in the
 * suite: everything still renders, just not while you are looking at it. So it
 * gets its own test, written the day the effect moved into a hook.
 */
test.describe.configure({ mode: 'serial' });

const a: any = (admin as any).default || admin;
const stamp = Date.now();
const STUDENT = { email: `refetch_${stamp}@example.com`, uid: '' };
const PASSWORD = 'refetch!Check123';

let adminApp: any = null;
let db: any = null;

test.beforeAll(async () => {
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `refetch-${stamp}`,
  );
  db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const rec = await adminApp.auth().createUser({
    email: STUDENT.email, password: PASSWORD, emailVerified: true,
  });
  STUDENT.uid = rec.uid;
  await db.collection('users').doc(STUDENT.uid).set({
    uid: STUDENT.uid, email: STUDENT.email, role: 'student',
    twoFactorEnabled: false, createdAt: new Date(),
  });
  await db.collection('students').doc(STUDENT.uid).set({
    uid: STUDENT.uid, fullName: 'Refetch Student', school: 'Earl Haig Secondary School',
    grade: '11', neighborhood: 'Willowdale', interests: ['Environment'],
    skills: [], availability: [], loggedHours: [], trackerEnabled: true,
  });
});

test.afterAll(async () => {
  if (!STUDENT.uid) return;
  for (const c of ['users', 'students']) {
    await db.collection(c).doc(STUDENT.uid).delete().catch(() => {});
  }
  await adminApp.auth().deleteUser(STUDENT.uid).catch(() => {});
});

test('toggling a setting refetches quietly, without blanking the page', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', STUDENT.email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/student\/dashboard/, { timeout: 40000 });

  await page.goto('/student/dashboard?tab=settings');
  const toggle = page.getByRole('switch', { name: /peers see your hours/i });
  await expect(toggle).toBeVisible({ timeout: 30000 });

  // Watch for the full-page loader appearing at any point during the toggle.
  // It is the thing that must NOT happen.
  let blanked = false;
  const watcher = setInterval(async () => {
    try {
      const loading = await page.getByText(/loading your dashboard/i).count();
      if (loading > 0) blanked = true;
    } catch { /* navigating */ }
  }, 120);

  await toggle.click();
  await page.waitForTimeout(4000);
  clearInterval(watcher);

  expect(blanked, 'the dashboard blanked to a loading state when a setting was toggled').toBe(false);

  // ...and the control the user just touched is still there and still usable.
  await expect(toggle).toBeVisible();
  const settled = await toggle.getAttribute('aria-checked');
  expect(settled, 'the toggle did not record the new value').toBe('false');
});
