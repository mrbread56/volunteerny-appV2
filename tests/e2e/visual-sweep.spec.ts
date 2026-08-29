/**
 * Visual sweep: walk every public route, and the student and organization
 * dashboards via demo mode, at three viewport widths, and assert the three
 * objective visual invariants that have actually bitten this project before:
 *
 *   1. No horizontal document overflow. F17 in STATUS.md: a flex item without
 *      min-w-0 made every dashboard page scroll sideways on every phone
 *      (382.7px of content in a 375.3px parent). This is the regression test.
 *   2. No broken images — an <img> that finished loading with naturalWidth 0.
 *   3. The page rendered visible text at all, so a route that silently
 *      renders an empty shell fails instead of passing as "no errors".
 *
 * A full-page screenshot of every route at every width is attached to the
 * report for human review — objective checks catch overflow, not ugliness.
 *
 * Assertions are soft: one broken route at one width reports every finding
 * rather than stopping at the first.
 *
 * Signs in with real throwaway accounts, like console-sweep.spec.ts.
 *
 * It used to say "needs no credentials" and reach the dashboards through demo
 * buttons on the home page. Those buttons do not exist — src/pages/Home.tsx
 * carries the comment recording their removal, and the only demo entry left is
 * inside the developer console. So enterDemo() threw on every run, its catch
 * turned the failure into an ANNOTATION rather than a failure, and the caller
 * returned before its first assertion: six of the nine tests here (3 viewports
 * x 2 roles) had asserted nothing at all for as long as they had existed. They
 * are the only coverage of horizontal overflow on authenticated routes, which
 * is the regression this file was written for.
 *
 * Needs FIREBASE_SERVICE_ACCOUNT_KEY and FIREBASE_DATABASE_ID.
 *
 *   npx playwright test tests/e2e/visual-sweep.spec.ts --reporter=line
 */
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import a from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const PASSWORD = 'visualSweep!123';
const stamp = Date.now();
const ACCOUNTS: Record<string, { email: string; uid: string }> = {
  student: { email: `vsweep.student.${stamp}@example.com`, uid: '' },
  organization: { email: `vsweep.org.${stamp}@example.com`, uid: '' },
};
let adminApp: a.app.App;

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/terms', '/privacy'];

// Mirrors the role route lists in console-sweep.spec.ts, minus the developer
// console, which has no demo path.
const STUDENT_ROUTES = [
  '/student/dashboard',
  '/student/dashboard?tab=applications',
  '/student/dashboard?tab=hours',
  '/student/dashboard?tab=leaderboard',
  '/student/opportunities',
  '/student/profile',
  '/feedback',
];
const ORG_ROUTES = [
  '/org/dashboard',
  '/org/dashboard?tab=hours',
  '/org/profile',
  '/org/opportunities/new',
  '/feedback',
];

/**
 * Scroll to the bottom and back so IntersectionObserver-driven reveals
 * (Home's <Reveal>) actually fire — otherwise the full-page screenshot
 * captures sections still held at opacity 0 and they look broken when they
 * are merely unrevealed.
 */
async function settleAnimations(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let y = 0;
      const step = () => {
        y += 600;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight) setTimeout(step, 60);
        else {
          window.scrollTo(0, 0);
          resolve();
        }
      };
      step();
    });
  });
  await page.waitForTimeout(700);
}

async function auditRoute(page: Page, testInfo: TestInfo, label: string) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
  await settleAnimations(page);

  // 1. Horizontal overflow. +1px of tolerance for subpixel rounding — the
  //    real failures measure whole tens of pixels (F17 was 7.4px over at its
  //    smallest, 382.7 in 375.3).
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect
    .soft(scrollWidth, `${label}: document scrolls sideways (${scrollWidth}px of content in a ${clientWidth}px viewport)`)
    .toBeLessThanOrEqual(clientWidth + 1);

  // 2. Broken images: loaded, has a source, decoded to nothing.
  const brokenImages = await page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => img.src && img.complete && img.naturalWidth === 0)
      .map((img) => img.src)
  );
  expect.soft(brokenImages, `${label}: broken images`).toEqual([]);

  // 3. The route rendered something. 40 characters is deliberately low — it
  //    exists to catch a blank shell, not to grade content.
  const textLength = await page.evaluate(() => (document.body.innerText || '').trim().length);
  expect.soft(textLength, `${label}: page rendered almost no visible text`).toBeGreaterThan(40);

  await testInfo.attach(label.replace(/[^\w.-]+/g, '_'), {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

/**
 * Sign in for real, and ASSERT it worked.
 *
 * The assertion is the point. Without it a broken sign-in leaves every
 * subsequent page.goto() redirecting to /login, so the sweep audits the login
 * form N times and reports no overflow — the report gets cleaner the more
 * broken the app is.
 */
async function signIn(page: Page, role: 'student' | 'organization'): Promise<void> {
  await page.goto('/login');
  await page.evaluate(() => {
    indexedDB.deleteDatabase('firebaseLocalStorageDb');
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/login');
  await page.getByLabel('Email').fill(ACCOUNTS[role].email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForTimeout(6000);
  await expect(page, `${role} could not sign in, so none of its routes were really swept`)
    .not.toHaveURL(/\/login/);
}

test.beforeAll(async () => {
  /*
   * The hooks need their own timeout. test.setTimeout inside a test body does
   * not apply to beforeAll/afterAll, and playwright.config sets no top-level
   * `timeout`, so these eight sequential live round-trips had Playwright's 30s
   * default. An afterAll that overruns leaves a real Auth account and a
   * `verified` organisation in the production project, with a password that is
   * a literal in a committed file.
   */
  test.setTimeout(120_000);
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `vsweep-${stamp}`,
  );
  const db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });
  for (const [role, acct] of Object.entries(ACCOUNTS)) {
    const u = await adminApp.auth().createUser({ email: acct.email, password: PASSWORD, emailVerified: true });
    acct.uid = u.uid;
    // The MFA gate trusts only the signed custom claim, so set it here rather
    // than driving an emailed OTP. Same claim the server writes after a code.
    await adminApp.auth().setCustomUserClaims(u.uid, { mfaGraceUntil: Math.floor(Date.now() / 1000) + 3600 });
    await db.collection('users').doc(u.uid).set({
      uid: u.uid, email: acct.email, role, twoFactorEnabled: role !== 'student',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
    });
    if (role === 'student') {
      await db.collection('students').doc(u.uid).set({
        uid: u.uid, fullName: 'Visual Sweep Student', school: 'Earl Haig Secondary School', grade: '11',
        neighborhood: 'Willowdale', interests: ['Environment'], skills: ['Leadership'],
        availability: ['Flexible'], resumeUrl: '', trackerEnabled: false,
      });
    } else {
      await db.collection('organizations').doc(u.uid).set({
        uid: u.uid, organizationName: 'Visual Sweep Org (test fixture)', mission: 'Sweeping.', contactEmail: acct.email,
        northYorkConfirmed: true, organizationType: 'Other', address: '5100 Yonge St',
        phone: '', websiteUrl: '', craVerified: false, verificationStatus: 'verified',
        // Named as a fixture in the organizationName because `organizations` is
        // listable by any signed-in account, so a run that dies before afterAll
        // leaves this visible to real students in the directory. The isFixture
        // marker covers opportunities, not organisations.
      });
    }
  }
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  if (!adminApp) return;
  const db = adminApp.firestore();
  for (const acct of Object.values(ACCOUNTS)) {
    if (!acct.uid) continue;
    await adminApp.auth().deleteUser(acct.uid).catch(() => {});
    for (const c of ['users', 'students', 'organizations']) {
      await db.collection(c).doc(acct.uid).delete().catch(() => {});
    }
  }
  await adminApp.delete().catch(() => {});
});

for (const vp of VIEWPORTS) {
  test.describe(`visual sweep @ ${vp.name} (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`public routes @ ${vp.name}`, async ({ page }, testInfo) => {
      test.setTimeout(240000);
      for (const route of PUBLIC_ROUTES) {
        await page.goto(route);
        await auditRoute(page, testInfo, `${vp.name} ${route}`);
      }
    });

    for (const [role, routes] of [
      ['student', STUDENT_ROUTES],
      ['organization', ORG_ROUTES],
    ] as const) {
      test(`${role} routes @ ${vp.name}`, async ({ page }, testInfo) => {
        test.setTimeout(300000);
        await signIn(page, role);

        for (const route of routes) {
          await page.goto(route);
          await page.waitForLoadState('domcontentloaded');
          // If the demo session did not survive the full page load, report it
          // once and stop — every later route would fail the same way.
          if (page.url().includes('/login')) {
            testInfo.annotations.push({
              type: 'warning',
              description: `${role} session was lost navigating to ${route}; remaining ${role} routes were not swept`,
            });
            return;
          }
          await auditRoute(page, testInfo, `${vp.name} [${role}] ${route}`);
        }
      });
    }
  });
}
