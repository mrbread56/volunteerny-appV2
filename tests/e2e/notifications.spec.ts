/**
 * The notification bell shows real events, and only the reader's own.
 *
 *   npx playwright test tests/e2e/notifications.spec.ts --reporter=line
 *
 * Notifications are DERIVED from documents the reader can already see (see
 * src/lib/notifications.ts) rather than stored in a collection, so the thing
 * worth testing is that the derivation matches reality: an accepted application
 * produces an "accepted" notification, an approved hours request produces one,
 * and a pending application — which is just what the student did themselves —
 * produces nothing.
 *
 * It seeds through the Admin SDK and cleans up in `finally`.
 */
import { test, expect } from '@playwright/test';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const a: any = (admin as any).default || admin;
const PASSWORD = 'notifCheck!123';
const stamp = Date.now();
const STUDENT = { email: `notif_student_${stamp}@example.com`, uid: '' };
const ORG = { email: `notif_org_${stamp}@example.com`, uid: '' };
const created: { col: string; id: string }[] = [];
let adminApp: any = null;
let db: any = null;

// Serial, and therefore one worker. These two tests share seeded accounts and
// the organization test adds to them, so running them in parallel means two
// workers each execute beforeAll — doubling the Firebase round trips against
// the same fixtures and blowing the hook timeout.
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  // Hooks get their own 30s budget regardless of the per-test timeout, and
  // seeding here is a dozen sequential Auth and Firestore writes to the live
  // project. Raise it for the hook specifically.
  test.setTimeout(180_000);
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `notif-${Date.now()}`
  );
  db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  for (const [role, acct] of [['student', STUDENT], ['organization', ORG]] as const) {
    const u = await adminApp.auth().createUser({ email: acct.email, password: PASSWORD, emailVerified: true });
    acct.uid = u.uid;
    await adminApp.auth().setCustomUserClaims(u.uid, { mfaGraceUntil: Math.floor(Date.now() / 1000) + 3600 });
    await db.collection('users').doc(u.uid).set({
      uid: u.uid, email: acct.email, role, twoFactorEnabled: role !== 'student',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
    });
    created.push({ col: 'users', id: u.uid });
  }

  await db.collection('students').doc(STUDENT.uid).set({
    uid: STUDENT.uid, fullName: 'Notif Student', school: 'Earl Haig Secondary School', grade: '11',
    neighborhood: 'Willowdale', interests: ['Environment'], skills: [], availability: [],
  });
  created.push({ col: 'students', id: STUDENT.uid });

  await db.collection('organizations').doc(ORG.uid).set({
    uid: ORG.uid, organizationName: 'Notif Org', mission: 'Testing.', contactEmail: ORG.email,
    northYorkConfirmed: true, organizationType: 'Other', address: '5100 Yonge St',
  });
  created.push({ col: 'organizations', id: ORG.uid });

  const oppRef = await db.collection('opportunities').add({
    isFixture: true, // never shown to students; see src/lib/visibleToStudents.ts
    orgId: ORG.uid, orgName: 'Notif Org', title: 'Park Cleanup Crew',
    description: 'Testing notifications.', location: 'North York', category: 'Environment',
    // dateTime matters. Seeding without it once put a dateless opportunity in
    // the live browse list while other specs were running, and formatDate threw
    // RangeError mid-render — a blank page for every student, from one record.
    // formatDate is guarded now (see src/lib/utils.ts and the regression test in
    // tests/format-date.spec.ts); this stays realistic so fixtures do not model
    // data the app would never write.
    dateTime: new Date(Date.now() + 86400000 * 7),
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });
  created.push({ col: 'opportunities', id: oppRef.id });

  // Accepted → should appear. Pending → should NOT (it is not news).
  const acceptedRef = await db.collection('applications').add({
    opportunityId: oppRef.id, opportunityTitle: 'Park Cleanup Crew',
    studentId: STUDENT.uid, studentName: 'Notif Student', status: 'accepted',
    appliedAt: a.firestore.FieldValue.serverTimestamp(),
  });
  created.push({ col: 'applications', id: acceptedRef.id });

  // The case this was asked for: you send feedback, a developer answers, and
  // nothing tells you to go back and read it.
  const fbRef = await db.collection('feedbacks').add({
    userId: STUDENT.uid, userEmail: STUDENT.email, subject: 'Cannot upload my resume',
    message: 'The upload spins forever.', type: 'bug', status: 'resolved',
    developerReply: 'Fixed — Storage was not enabled. Please try again.',
    repliedAt: new Date().toISOString(),
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });
  created.push({ col: 'feedbacks', id: fbRef.id });

  // Verification decision on the organization's own document.
  await db.collection('organizations').doc(ORG.uid).set(
    { verificationStatus: 'verified', craVerified: true, verifiedAt: a.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );

  const hoursRef = await db.collection('hoursRequests').add({
    studentId: STUDENT.uid, studentName: 'Notif Student', studentEmail: STUDENT.email,
    activity: 'Park Cleanup Crew', organization: 'Notif Org', hours: 4, date: '2026-08-01',
    coordinatorName: 'Notif Org', coordinatorContact: ORG.email, status: 'approved',
    requestedAt: new Date().toISOString(),
  });
  created.push({ col: 'hoursRequests', id: hoursRef.id });
});

test.afterAll(async () => {
  if (!adminApp) return;
  for (const { col, id } of created) await db.collection(col).doc(id).delete().catch(() => {});
  for (const acct of [STUDENT, ORG]) {
    if (acct.uid) await adminApp.auth().deleteUser(acct.uid).catch(() => {});
  }
});

async function signIn(page: any, email: string) {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
}

test('a student sees their accepted application and approved hours in the bell', async ({ page }) => {
  test.setTimeout(180000);
  await signIn(page, STUDENT.email);

  const bell = page.getByRole('button', { name: /Notifications/i });
  await expect(bell, 'the bell should render for a signed-in student').toBeVisible();

  // The unread count must be in the accessible name — a badge that only exists
  // visually tells a screen-reader user nothing.
  await expect(bell).toHaveAttribute('aria-label', /\d+ unread/);

  await bell.click();
  const panel = page.getByRole('region', { name: 'Notifications' });
  await expect(panel).toBeVisible();

  await expect(panel.getByText('Application accepted')).toBeVisible();
  await expect(panel.getByText('Hours approved')).toBeVisible();
  // A developer answered their feedback ticket.
  await expect(panel.getByText('Reply to your feedback')).toBeVisible();
  // Both notifications name the opportunity — the accepted application and the
  // approved hours for it — so this deliberately asserts "at least one", not
  // "exactly one". Two matches is correct here, not a duplicate.
  await expect(panel.getByText(/Park Cleanup Crew/).first()).toBeVisible();
  expect(await panel.getByText(/Park Cleanup Crew/).count()).toBeGreaterThan(0);

  // Opening marks everything seen, so the badge clears.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(bell).toHaveAttribute('aria-label', 'Notifications');
});

test('an organization sees a pending applicant, and not another org\'s', async ({ page }) => {
  test.setTimeout(180000);
  // A pending application on the org's own opportunity is what it needs to act on.
  const opp = created.find((c) => c.col === 'opportunities')!;
  const pendingRef = await db.collection('applications').add({
    opportunityId: opp.id, opportunityTitle: 'Park Cleanup Crew',
    studentId: STUDENT.uid, studentName: 'Notif Student', status: 'pending',
    appliedAt: a.firestore.FieldValue.serverTimestamp(),
  });
  created.push({ col: 'applications', id: pendingRef.id });

  await signIn(page, ORG.email);
  const bell = page.getByRole('button', { name: /Notifications/i });
  await expect(bell).toBeVisible();
  await bell.click();

  const panel = page.getByRole('region', { name: 'Notifications' });
  await expect(panel.getByText('New applicant')).toBeVisible();
  await expect(panel.getByText(/Notif Student/).first()).toBeVisible();
  await expect(panel.getByText('Your organization is verified')).toBeVisible();
});
