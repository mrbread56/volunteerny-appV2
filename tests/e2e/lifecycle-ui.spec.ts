/**
 * The controls added on 13 Aug 2026, driven through the real UI.
 *
 *   npx playwright test tests/e2e/lifecycle-ui.spec.ts --reporter=line
 *
 * check-lifecycle.ts proves the DATA layer: a waitlisted applicant can be
 * promoted, a student can withdraw, capacity is respected. It will keep passing
 * even if no button on the site is wired to any of it — which is exactly the
 * gap this covers, and exactly how the bugs found today survived:
 *
 *   - Waitlisted applicants appeared under no filter tab and had no action
 *     buttons at all, so an organization could see them and do nothing.
 *   - `errorMessage` was set in six places on the applicants page and rendered
 *     in none of them, so failures were invisible.
 *   - Students had no way to withdraw, though firestore.rules always allowed it.
 *
 * Accounts are seeded with the Admin SDK and deleted afterwards. The MFA grace
 * claim skips the OTP round trip, the same one scripts/grant-mfa.ts grants.
 */
import { test, expect, Page } from '@playwright/test';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Serial, deliberately. playwright.config.ts sets fullyParallel, which runs
// tests WITHIN a file concurrently — and these three share one seeded
// opportunity and one seeded application. Run in parallel, the bulk-reject test
// rejects the application the withdraw test is about to use, and both fail
// intermittently for reasons that have nothing to do with the app.
test.describe.configure({ mode: 'serial' });

const a: any = (admin as any).default || admin;
const PASSWORD = 'lifecycleUi!Check123';
const stamp = Date.now();

const STUDENT = { email: `lcui_student_${stamp}@example.com`, uid: '' };
const ORG = { email: `lcui_org_${stamp}@example.com`, uid: '' };
const OPP = { id: '', title: `Lifecycle UI Opportunity ${stamp}` };

let adminApp: any = null;
let db: any = null;

test.beforeAll(async () => {
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `lcui-${stamp}`,
  );
  db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  for (const [role, acct] of [['student', STUDENT], ['organization', ORG]] as const) {
    const u = await adminApp.auth().createUser({ email: acct.email, password: PASSWORD, emailVerified: true });
    acct.uid = u.uid;
    await adminApp.auth().setCustomUserClaims(u.uid, {
      mfaGraceUntil: Math.floor(Date.now() / 1000) + 3600,
    });
    await db.collection('users').doc(u.uid).set({
      uid: u.uid, email: acct.email, role,
      twoFactorEnabled: role !== 'student',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
    });
  }

  await db.collection('students').doc(STUDENT.uid).set({
    uid: STUDENT.uid, fullName: 'Lifecycle Student', school: 'Earl Haig Secondary School',
    grade: '11', neighborhood: 'Willowdale', interests: ['Environment'], skills: ['Leadership'],
    availability: [], previousExperience: '', resumeUrl: '',
  });
  await db.collection('organizations').doc(ORG.uid).set({
    uid: ORG.uid, organizationName: 'Lifecycle UI Org', mission: 'm', organizationType: 'Other',
    address: 'North York', coordinates: { lat: 43.76, lng: -79.41 }, contactEmail: ORG.email,
    phone: '', northYorkConfirmed: true, websiteUrl: '', hasCra: 'no', craNumber: '',
    craVerified: false, verificationStatus: 'unverified',
  });

  const oppRef = await db.collection('opportunities').add({
    orgId: ORG.uid, orgName: 'Lifecycle UI Org', title: OPP.title,
    description: 'Seeded for the lifecycle UI spec.', location: 'North York',
    category: 'Environment', requirements: 'None', maxVolunteers: 1,
    skillsNeeded: [], exclusives: [], timeCommitment: 'One-time', isVirtual: false,
    coordinates: { lat: 43.76, lng: -79.41 },
    dateTime: new Date(Date.now() + 7 * 86400000),
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });
  OPP.id = oppRef.id;

  // One pending, one waitlisted — the waitlisted one is the whole point.
  await db.collection('applications').doc(`${STUDENT.uid}_${OPP.id}`).set({
    opportunityId: OPP.id, orgId: ORG.uid, studentId: STUDENT.uid, status: 'pending',
    appliedAt: a.firestore.FieldValue.serverTimestamp(), message: 'Seeded pending.',
    opportunityTitle: OPP.title, studentName: 'Lifecycle Student',
    previousExperience: '', resumeUrl: '',
  });
  await db.collection('applications').doc(`waitlisted_${OPP.id}`).set({
    opportunityId: OPP.id, orgId: ORG.uid, studentId: 'seeded-waitlisted-student',
    status: 'waitlist', appliedAt: a.firestore.FieldValue.serverTimestamp(),
    message: 'Seeded waitlist.', opportunityTitle: OPP.title, studentName: 'Waitlisted Person',
    previousExperience: '', resumeUrl: '',
  });
});

test.afterAll(async () => {
  if (!db) return;
  const apps = await db.collection('applications').where('opportunityId', '==', OPP.id).get().catch(() => null);
  if (apps) for (const d of apps.docs) await d.ref.delete().catch(() => {});
  if (OPP.id) await db.collection('opportunities').doc(OPP.id).delete().catch(() => {});
  for (const acct of [STUDENT, ORG]) {
    if (!acct.uid) continue;
    await adminApp.auth().deleteUser(acct.uid).catch(() => {});
    for (const c of ['users', 'students', 'organizations']) {
      await db.collection(c).doc(acct.uid).delete().catch(() => {});
    }
  }
});

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.evaluate(() => {
    indexedDB.deleteDatabase('firebaseLocalStorageDb');
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(/\/(student|org|developer)\//, { timeout: 30000 });
}

test('an organization can see and act on a waitlisted applicant', async ({ page }) => {
  test.setTimeout(180000);
  await signIn(page, ORG.email);
  await page.goto(`/org/opportunities/${OPP.id}/applicants`);

  // The tab existed for every other status and not for this one, so waitlisted
  // applicants were reachable only through "all".
  // Matched on TEXT CONTENT rather than the accessible name: the tab renders
  // its count in a child span, so the two diverge.
  const waitlistTab = page.getByRole('button').filter({ hasText: /waitlist/i }).first();
  await expect(waitlistTab).toBeVisible({ timeout: 20000 });
  await waitlistTab.click();

  await expect(page.getByText('Waitlisted Person')).toBeVisible();

  // The row must offer a decision. Before this, it offered nothing at all.
  await expect(page.getByRole('button', { name: /offer a place/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^decline$/i })).toBeVisible();
});

test('a failed applicant notification is shown, not swallowed', async ({ page }) => {
  test.setTimeout(180000);
  await signIn(page, ORG.email);

  // Block the notify endpoint so the send genuinely fails. errorMessage was set
  // in six places on this page and rendered in NONE of them, so exactly this —
  // the status saved, the applicant never emailed — was invisible.
  await page.route('**/api/applications/notify', (route) => route.abort());

  await page.goto(`/org/opportunities/${OPP.id}/applicants`);

  // Bulk reject is the shortest path to that failure: one button, one confirm,
  // and it goes through notifyApplicant for every applicant it rejects.
  page.once('dialog', (d) => d.accept());
  const bulk = page.getByRole('button', { name: /bulk reject/i });
  await expect(bulk).toBeVisible({ timeout: 20000 });
  await bulk.click();

  await expect(page.getByRole('alert')).toContainText(/not emailed|could not be updated/i, {
    timeout: 30000,
  });
});

test('an organization can email applicants and close the posting', async ({ page }) => {
  test.setTimeout(180000);

  // An accepted volunteer to email, on top of whatever the earlier tests left.
  await db.collection('applications').doc(`accepted_${OPP.id}`).set({
    opportunityId: OPP.id, orgId: ORG.uid, studentId: STUDENT.uid, status: 'accepted',
    appliedAt: a.firestore.FieldValue.serverTimestamp(), message: 'Seeded accepted.',
    opportunityTitle: OPP.title, studentName: 'Accepted Person',
    previousExperience: '', resumeUrl: '',
  });

  await signIn(page, ORG.email);
  await page.goto(`/org/opportunities/${OPP.id}/applicants`);
  await page.getByRole('button', { name: /^all/i }).click();

  // Per-applicant mailto. The address comes from the server, so this asserts
  // the whole chain: ownership check, Admin-SDK lookup, and a link that carries
  // ONLY a recipient — no subject, no body.
  const emailLink = page.locator(`a[href^="mailto:"]`).first();
  await expect(emailLink).toBeVisible({ timeout: 25000 });
  const href = await emailLink.getAttribute('href');
  expect(href).toContain('%40');            // a real encoded address
  expect(href).not.toContain('subject=');
  expect(href).not.toContain('body=');

  // Email-all uses BCC, so volunteers are not disclosed to each other.
  // "Email all accepted" is present and carries a real address. With a single
  // accepted volunteer the link is correctly the plain to: form — BCC only
  // matters once there is more than one recipient, and that case is covered
  // directly in tests/mailto-link.spec.ts.
  const emailAll = page.getByRole('link', { name: /email all \d+ accepted/i });
  await expect(emailAll).toBeVisible();
  const allHref = await emailAll.getAttribute('href');
  expect(allHref).toContain('%40');
  expect(allHref).not.toContain('subject=');
  expect(allHref).not.toContain('body=');

  // Close, and confirm it is recorded.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /close applications/i }).click();
  await expect
    .poll(async () => (await db.collection('opportunities').doc(OPP.id).get()).data()?.status,
      { timeout: 20000 })
    .toBe('closed');

  // ...and that it can be reopened.
  await expect(page.getByRole('button', { name: /reopen applications/i })).toBeVisible({ timeout: 15000 });
});

test('a student can withdraw an application from their dashboard', async ({ page }) => {
  test.setTimeout(180000);

  // Re-seed: the bulk-reject test above rejects every pending application on
  // this opportunity, so this test cannot rely on the beforeAll fixture
  // surviving. Tests in a file share seeded data and run in order.
  await db.collection('applications').doc(`${STUDENT.uid}_${OPP.id}`).set({
    opportunityId: OPP.id, orgId: ORG.uid, studentId: STUDENT.uid, status: 'pending',
    appliedAt: a.firestore.FieldValue.serverTimestamp(), message: 'Re-seeded pending.',
    opportunityTitle: OPP.title, studentName: 'Lifecycle Student',
    previousExperience: '', resumeUrl: '',
  });

  await signIn(page, STUDENT.email);
  await page.goto('/student/dashboard?tab=applications');

  // firestore.rules has always permitted a student to remove their own
  // application. No UI ever called it until now.
  const withdraw = page.getByRole('button', { name: /^withdraw$/i }).first();
  await expect(withdraw).toBeVisible({ timeout: 25000 });

  page.once('dialog', (d) => d.accept());
  await withdraw.click();

  // DELETED, not tombstoned. A surviving document would keep the deterministic
  // id occupied and make re-applying impossible — see the note on
  // handleWithdrawApplication.
  await expect
    .poll(async () => {
      const snap = await db.collection('applications').doc(`${STUDENT.uid}_${OPP.id}`).get();
      return snap.exists;
    }, { timeout: 20000 })
    .toBe(false);
});
