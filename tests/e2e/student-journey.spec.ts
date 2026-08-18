/**
 * The journey a real student actually takes, driven through the real UI.
 *
 *   npx playwright test tests/e2e/student-journey.spec.ts --reporter=line
 *
 * scripts/check-flows.ts already walks this data path with the client SDK, and
 * it will keep passing even if every button on the site is broken — it never
 * opens a page. This spec is the other half: sign in on the real form, find a
 * real opportunity, apply through the real modal, accept it as the
 * organization through the real dialog, and confirm the student sees the
 * result. That covers the wiring between UI and data, which is where the bugs
 * found in this codebase have actually lived.
 *
 * Accounts and the opportunity are seeded with the Admin SDK (so no email
 * verification or OTP round trip is needed) and deleted afterwards. The MFA
 * custom claim is set directly, exactly as the server sets it after a real
 * code check.
 */
import { test, expect, Page } from '@playwright/test';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const a: any = (admin as any).default || admin;
const PASSWORD = 'journey!Check123';
const stamp = Date.now();

const STUDENT = { email: `journey_student_${stamp}@example.com`, uid: '' };
const ORG = { email: `journey_org_${stamp}@example.com`, uid: '' };
const OPP = { id: '', title: `Journey Test Opportunity ${stamp}` };
const createdApplicationIds: string[] = [];

let adminApp: any = null;
let db: any = null;

test.beforeAll(async () => {
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `journey-${stamp}`
  );
  db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  for (const [role, acct] of [['student', STUDENT], ['organization', ORG]] as const) {
    const u = await adminApp.auth().createUser({ email: acct.email, password: PASSWORD, emailVerified: true });
    acct.uid = u.uid;
    // Skip the OTP round trip with the same time-boxed grace scripts/grant-mfa.ts
    // grants. A bare { mfaVerified: true } does NOT work and must not be used
    // here: the gate pins that claim to the auth_time of the sign-in that
    // earned it (src/lib/mfa.ts), and a seed cannot know the auth_time of a
    // sign-in that has not happened yet. Seeding it leaves every spec stranded
    // on /mfa, where the page auto-requests a code and the run then dies on the
    // OTP rate limiter instead — which reads like a broken app, not a bad seed.
    await adminApp.auth().setCustomUserClaims(u.uid, { mfaGraceUntil: Math.floor(Date.now() / 1000) + 3600 });
    await db.collection('users').doc(u.uid).set({
      uid: u.uid, email: acct.email, role,
      twoFactorEnabled: role !== 'student',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
    });
  }

  await db.collection('students').doc(STUDENT.uid).set({
    uid: STUDENT.uid, fullName: 'Journey Student', school: 'Earl Haig Secondary School',
    grade: '11', neighborhood: 'Willowdale', interests: ['Environment'], skills: ['Leadership'],
    availability: ['Flexible'], resumeUrl: '',
  });

  await db.collection('organizations').doc(ORG.uid).set({
    uid: ORG.uid, organizationName: 'Journey Test Org', mission: 'Testing the journey.',
    contactEmail: ORG.email, northYorkConfirmed: true, organizationType: 'Other',
    address: '5100 Yonge St', phone: '', websiteUrl: '',
    craVerified: false, verificationStatus: 'verified',
  });

  const oppRef = await db.collection('opportunities').add({
    orgId: ORG.uid,
    orgName: 'Journey Test Org',
    title: OPP.title,
    description: 'Seeded by the end-to-end journey spec.',
    location: '5100 Yonge St, North York',
    category: 'Environment',
    dateTime: new Date(Date.now() + 7 * 864e5).toISOString(),
    timeCommitment: 'one-time',
    maxVolunteers: 5,
    requirements: '',
    skillsNeeded: [],
    isVirtual: false,
    coordinates: { lat: 43.7615, lng: -79.4111 },
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });
  OPP.id = oppRef.id;
});

test.afterAll(async () => {
  if (!adminApp) return;
  for (const id of createdApplicationIds) {
    await db.collection('applications').doc(id).delete().catch(() => {});
  }
  // Catch anything the UI created that we did not record.
  const strays = await db.collection('applications').where('opportunityId', '==', OPP.id).get().catch(() => null);
  if (strays) for (const d of strays.docs) await d.ref.delete().catch(() => {});
  if (OPP.id) await db.collection('opportunities').doc(OPP.id).delete().catch(() => {});
  for (const acct of [STUDENT, ORG]) {
    if (!acct.uid) continue;
    await adminApp.auth().deleteUser(acct.uid).catch(() => {});
    for (const c of ['users', 'students', 'organizations']) {
      await db.collection(c).doc(acct.uid).delete().catch(() => {});
    }
  }
});

/** Sign in through the actual form, not by injecting a token. */
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
  // Landing anywhere under a dashboard means auth + profile + MFA all resolved.
  await page.waitForURL(/\/(student|org|developer)\//, { timeout: 30000 });
}

test('a student can apply through the UI, and the organization can accept it', async ({ page }) => {
  test.setTimeout(180000);

  // ── Student applies ──────────────────────────────────────────────────────
  await signIn(page, STUDENT.email);

  await page.goto(`/student/opportunities/${OPP.id}`);
  await expect(page.getByRole('heading', { name: OPP.title })).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Apply Now' }).click();
  await page.getByRole('button', { name: 'Send Application' }).click();

  // The UI must confirm it, not just appear to submit.
  await expect(page.getByText("You've Applied!")).toBeVisible({ timeout: 30000 });

  // And the record must actually exist, with the orgId the rating flow needs.
  const apps = await db.collection('applications')
    .where('opportunityId', '==', OPP.id)
    .where('studentId', '==', STUDENT.uid)
    .get();
  expect(apps.size, 'exactly one application should be written').toBe(1);
  createdApplicationIds.push(apps.docs[0].id);
  const appData = apps.docs[0].data();
  expect(appData.orgId, 'application must record orgId or rating is impossible').toBe(ORG.uid);
  expect(appData.status).toBe('pending');

  // Re-opening the page must not offer to apply again.
  await page.reload();
  await expect(page.getByText("You've Applied!")).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Apply Now' })).toHaveCount(0);

  // ── Organization accepts ─────────────────────────────────────────────────
  await signIn(page, ORG.email);

  await page.goto(`/org/opportunities/${OPP.id}/applicants`);
  await expect(page.getByText('Journey Student')).toBeVisible({ timeout: 30000 });

  await page.getByRole('button', { name: /Review Application|Review/ }).first().click();
  await page.getByRole('button', { name: /Confirm & Accept Volunteer/ }).click();

  // The write is deferred behind a 5s undo window, so poll rather than assume.
  await expect
    .poll(async () => (await db.collection('applications').doc(createdApplicationIds[0]).get()).data()?.status,
      { timeout: 45000, message: 'application should reach accepted after the undo window' })
    .toBe('accepted');

  // ── Student sees the result ──────────────────────────────────────────────
  await signIn(page, STUDENT.email);
  await page.goto('/student/dashboard?tab=applications');
  await expect(page.getByText(OPP.title).first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/accepted/i).first()).toBeVisible({ timeout: 30000 });
});
