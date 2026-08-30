/**
 * Capture every page in the product to disk, for human review.
 *
 * visual-sweep.spec.ts asserts three objective invariants and attaches its
 * screenshots to the Playwright report, which is the right shape for CI and
 * the wrong shape for actually looking at the design. This writes plain PNGs
 * into screens/ so they can be opened, compared and reviewed.
 *
 * It covers the routes visual-sweep does not: the developer console and its
 * tabs, the opportunity detail page, the applicants view, the edit form, and
 * the 404. It seeds a real organisation and a real opportunity so the pages
 * built around one are not captured empty.
 *
 *   npx playwright test tests/e2e/capture-pages.spec.ts --project=chromium
 *
 * Needs FIREBASE_SERVICE_ACCOUNT_KEY and FIREBASE_DATABASE_ID.
 */
import { test, expect, type Page } from '@playwright/test';
import a from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const OUT = path.join(process.cwd(), 'screens');
const PASSWORD = 'capturePages!123';
const stamp = Date.now();

const ACCOUNTS: Record<string, { email: string; uid: string }> = {
  student: { email: `cap.student.${stamp}@example.com`, uid: '' },
  organization: { email: `cap.org.${stamp}@example.com`, uid: '' },
  developer: { email: `cap.dev.${stamp}@example.com`, uid: '' },
};

let adminApp: a.app.App;
let oppId = '';

/** Desktop and mobile. Tablet adds little that these two do not show. */
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/terms', '/privacy', '/no-such-page'];

const STUDENT_ROUTES = [
  '/student/dashboard',
  '/student/dashboard?tab=applications',
  '/student/dashboard?tab=hours',
  '/student/dashboard?tab=leaderboard',
  '/student/dashboard?tab=settings',
  '/student/opportunities',
  '/student/profile',
  '/feedback',
];

const ORG_ROUTES = [
  '/org/dashboard',
  '/org/dashboard?tab=applications',
  '/org/dashboard?tab=hours',
  '/org/profile',
  '/org/opportunities/new',
];

const DEV_ROUTES = [
  '/developer/dashboard',
];

/**
 * Let scroll-reveal animations fire before capturing.
 *
 * Home holds sections at opacity 0 until an IntersectionObserver sees them, so
 * a screenshot taken without scrolling captures a page that looks broken when
 * it is merely unrevealed.
 */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let y = 0;
      const step = () => {
        y += 600;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight) setTimeout(step, 60);
        else { window.scrollTo(0, 0); resolve(); }
      };
      step();
    });
  });
  await page.waitForTimeout(600);
}

async function capture(page: Page, vp: string, label: string) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
  await settle(page);
  const name = `${vp}__${label.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'root'}.png`;
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
}

async function signIn(page: Page, role: keyof typeof ACCOUNTS) {
  await page.goto('/login');
  await page.evaluate(() => {
    indexedDB.deleteDatabase('firebaseLocalStorageDb');
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/login');
  await page.evaluate(() => { try { localStorage.setItem('storage_notice_seen', 'true'); } catch { /* blocked */ } });
  await page.getByLabel('Email').fill(ACCOUNTS[role].email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForTimeout(6000);
  // Assert it worked, or every route below silently captures the login form.
  await expect(page, `${role} could not sign in`).not.toHaveURL(/\/login/);
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fs.mkdirSync(OUT, { recursive: true });
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `capture-${stamp}`,
  );
  const db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  for (const [role, acct] of Object.entries(ACCOUNTS)) {
    const u = await adminApp.auth().createUser({ email: acct.email, password: PASSWORD, emailVerified: true });
    acct.uid = u.uid;
    // The gate trusts only the signed claim, so grant the same support window
    // the runbook uses rather than driving a real emailed code.
    await adminApp.auth().setCustomUserClaims(u.uid, { mfaGraceUntil: Math.floor(Date.now() / 1000) + 7200 });
    await db.collection('users').doc(u.uid).set({
      uid: u.uid, email: acct.email, role,
      twoFactorEnabled: role !== 'student',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
    });
    if (role === 'student') {
      await db.collection('students').doc(u.uid).set({
        uid: u.uid, fullName: 'Capture Student', school: 'Earl Haig Secondary School', grade: '11',
        neighborhood: 'Willowdale', interests: ['Environment'], skills: ['Leadership'],
        availability: ['Weekends'], resumeUrl: '', trackerEnabled: false,
        // Real rows, so the hours table is captured populated rather than empty.
        loggedHours: [
          { id: `cap_h1_${stamp}`, activity: 'Park cleanup', organization: 'Capture Partner', hours: 12.5, date: '2026-05-02', status: 'confirmed', approved: true },
          { id: `cap_h2_${stamp}`, activity: 'Food sorting', organization: 'Capture Partner', hours: 3, date: '2026-06-14', status: 'pending' },
        ],
      });
    }
    if (role === 'organization') {
      await db.collection('organizations').doc(u.uid).set({
        uid: u.uid, organizationName: 'Capture Org (test fixture)', mission: 'Capturing the interface for review.',
        description: 'A fixture organisation used to photograph the organisation-facing pages.',
        contactEmail: acct.email, northYorkConfirmed: true, organizationType: 'Community group',
        address: '5100 Yonge St', phone: '', websiteUrl: '', craVerified: false, verificationStatus: 'verified',
      });
    }
  }

  const opp = await db.collection('opportunities').add({
    orgId: ACCOUNTS.organization.uid,
    orgName: 'Capture Org (test fixture)',
    title: 'Saturday food bank sorting',
    description: 'Sorting and shelving donations with the Saturday morning team. No experience needed, and someone will show you the ropes when you arrive.',
    location: '5100 Yonge St, North York', category: 'Community', requirements: '',
    maxVolunteers: 6, skillsNeeded: ['Teamwork'], exclusives: [], timeCommitment: 'One-time',
    isVirtual: false, status: 'open', coordinates: { lat: 43.77, lng: -79.41 },
    dateTime: new Date(Date.now() + 9 * 86400000),
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });
  oppId = opp.id;
});

test.afterAll(async () => {
  test.setTimeout(180_000);
  if (!adminApp) return;
  const db = adminApp.firestore();
  if (oppId) await db.collection('opportunities').doc(oppId).delete().catch(() => {});
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
  test.describe(`capture @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`public @ ${vp.name}`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.goto('/');
      await page.evaluate(() => { try { localStorage.setItem('storage_notice_seen', 'true'); } catch { /* blocked */ } });
      for (const route of PUBLIC_ROUTES) {
        await page.goto(route);
        await capture(page, vp.name, route);
      }
      // The storage notice is the first thing every new visitor sees, so it is
      // worth one frame of its own rather than being dismissed everywhere.
      await page.goto('/');
      await page.evaluate(() => { try { localStorage.clear(); } catch { /* blocked */ } });
      await page.reload();
      await capture(page, vp.name, 'home-with-storage-notice');
    });

    test(`student @ ${vp.name}`, async ({ page }) => {
      test.setTimeout(420_000);
      await signIn(page, 'student');
      for (const route of STUDENT_ROUTES) {
        await page.goto(route);
        await capture(page, vp.name, route);
      }
      await page.goto(`/student/opportunities/${oppId}`);
      await capture(page, vp.name, 'student-opportunity-detail');
      // The apply dialog, which no capture has ever included.
      const apply = page.getByRole('button', { name: /apply/i }).first();
      if (await apply.isVisible().catch(() => false)) {
        await apply.click();
        await page.waitForTimeout(1200);
        await capture(page, vp.name, 'student-apply-dialog');
      }
    });

    test(`organization @ ${vp.name}`, async ({ page }) => {
      test.setTimeout(420_000);
      await signIn(page, 'organization');
      for (const route of ORG_ROUTES) {
        await page.goto(route);
        await capture(page, vp.name, route);
      }
      await page.goto(`/org/opportunities/${oppId}/applicants`);
      await capture(page, vp.name, 'org-applicants');
      await page.goto(`/org/opportunities/${oppId}/edit`);
      await capture(page, vp.name, 'org-opportunity-edit');
    });

    test(`developer @ ${vp.name}`, async ({ page }) => {
      test.setTimeout(420_000);
      await signIn(page, 'developer');
      for (const route of DEV_ROUTES) {
        await page.goto(route);
        await capture(page, vp.name, route);
      }
      // Each console tab, which is where the least-reviewed screens live.
      for (const tab of ['users', 'reports', 'orgs', 'metrics', 'settings']) {
        await page.goto(`/developer/dashboard?tab=${tab}`);
        await capture(page, vp.name, `developer-${tab}`);
      }
    });
  });
}
