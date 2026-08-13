/**
 * The bell shows the reader's own notifications and nobody else's.
 *
 *   npx playwright test tests/e2e/notification-isolation.spec.ts --reporter=line
 *
 * tests/e2e/notifications.spec.ts proves the derivation is CORRECT (an accepted
 * application produces an "accepted" item). This one proves it is ISOLATED:
 * every query in src/lib/notifications.ts carries a `where` clause naming the
 * reader, and a `where` clause is not a permission — the authorization is in
 * firestore.rules. So this seeds two students whose fixtures are identical in
 * shape and different in owner, signs in as A, and asserts B's strings are
 * nowhere in A's panel.
 *
 * A also gets their own accepted application and answered ticket. Without them
 * an empty panel — or a permission-denied that renders the error state — would
 * satisfy every absence assertion for the wrong reason.
 */
import { test, expect } from '@playwright/test';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const a: any = (admin as any).default || admin;
const PASSWORD = 'isoCheck!123';
const stamp = Date.now();
const A = { email: `iso_a_${stamp}@example.com`, uid: '' };
const B = { email: `iso_b_${stamp}@example.com`, uid: '' };
const ORG = { email: `iso_org_${stamp}@example.com`, uid: '' };

// Distinct enough that a match cannot be coincidence.
const A_OPP = 'Aardvark Shelter Shift';
const B_OPP = 'Bramblewood Hospice Shift';
const A_SUBJECT = 'Aardvark cannot upload resume';
const B_SUBJECT = 'Bramblewood private billing question';

const created: { col: string; id: string }[] = [];
let adminApp: any = null;
let db: any = null;

// Serial, and therefore one worker — same reason as notifications.spec.ts: the
// tests share seeded accounts, and two workers each running beforeAll doubles
// the Firebase round trips against the same fixtures and blows the hook timeout.
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  // Hooks get their own 30s budget regardless of the per-test timeout, and this
  // is ~20 sequential Auth and Firestore writes against the live project.
  test.setTimeout(180_000);
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `iso-${Date.now()}`,
  );
  db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  for (const [role, acct] of [['student', A], ['student', B], ['organization', ORG]] as const) {
    const u = await adminApp.auth().createUser({ email: acct.email, password: PASSWORD, emailVerified: true });
    acct.uid = u.uid;
    await adminApp.auth().setCustomUserClaims(u.uid, { mfaVerified: true });
    await db.collection('users').doc(u.uid).set({
      uid: u.uid, email: acct.email, role, twoFactorEnabled: role !== 'student',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
    });
    created.push({ col: 'users', id: u.uid });
  }

  for (const [acct, name] of [[A, 'Aardvark Student'], [B, 'Bramblewood Student']] as const) {
    await db.collection('students').doc(acct.uid).set({
      uid: acct.uid, fullName: name, school: 'Earl Haig Secondary School', grade: '11',
      neighborhood: 'Willowdale', interests: ['Environment'], skills: [], availability: [],
    });
    created.push({ col: 'students', id: acct.uid });
  }

  await db.collection('organizations').doc(ORG.uid).set({
    uid: ORG.uid, organizationName: 'Iso Org', mission: 'Testing.', contactEmail: ORG.email,
    northYorkConfirmed: true, organizationType: 'Other', address: '5100 Yonge St',
  });
  created.push({ col: 'organizations', id: ORG.uid });

  // One opportunity per student, so the two students' fixtures differ only in
  // who owns them — see notifications.spec.ts on why dateTime is always seeded.
  for (const [acct, title] of [[A, A_OPP], [B, B_OPP]] as const) {
    const oppRef = await db.collection('opportunities').add({
      orgId: ORG.uid, orgName: 'Iso Org', title,
      description: 'Testing notification isolation.', location: 'North York', category: 'Environment',
      dateTime: new Date(Date.now() + 86400000 * 7),
      createdAt: a.firestore.FieldValue.serverTimestamp(),
    });
    created.push({ col: 'opportunities', id: oppRef.id });

    const appRef = await db.collection('applications').add({
      opportunityId: oppRef.id, opportunityTitle: title,
      studentId: acct.uid, studentName: acct === A ? 'Aardvark Student' : 'Bramblewood Student',
      status: 'accepted', appliedAt: a.firestore.FieldValue.serverTimestamp(),
    });
    created.push({ col: 'applications', id: appRef.id });
  }

  for (const [acct, subject] of [[A, A_SUBJECT], [B, B_SUBJECT]] as const) {
    const fbRef = await db.collection('feedbacks').add({
      userId: acct.uid, userEmail: acct.email, subject,
      message: 'Seeded for the isolation test.', type: 'bug', status: 'resolved',
      developerReply: 'Answered.', repliedAt: new Date().toISOString(),
      createdAt: a.firestore.FieldValue.serverTimestamp(),
    });
    created.push({ col: 'feedbacks', id: fbRef.id });
  }
});

test.afterAll(async () => {
  if (!adminApp) return;
  for (const { col, id } of created) await db.collection(col).doc(id).delete().catch(() => {});
  for (const acct of [A, B, ORG]) {
    if (acct.uid) await adminApp.auth().deleteUser(acct.uid).catch(() => {});
  }
});

test("a student's bell contains nothing belonging to another student", async ({ page }) => {
  test.setTimeout(180000);

  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', A.email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);

  const bell = page.getByRole('button', { name: /Notifications/i });
  await expect(bell).toBeVisible();
  await bell.click();

  const panel = page.getByRole('region', { name: 'Notifications' });
  await expect(panel).toBeVisible();

  // A's own items must be there first. If the reads had failed, the panel would
  // show the error state and every absence check below would pass vacuously.
  await expect(panel.getByText('Application accepted')).toBeVisible();
  await expect(panel.getByText(new RegExp(A_OPP))).toBeVisible();
  await expect(panel.getByText('Reply to your feedback')).toBeVisible();
  await expect(panel.getByText(new RegExp(A_SUBJECT))).toBeVisible();

  // Nothing of B's — not the opportunity B was accepted for, not the subject of
  // B's ticket, not B's name or address anywhere in the panel.
  for (const secret of [B_OPP, B_SUBJECT, 'Bramblewood Student', B.email]) {
    await expect(panel.getByText(new RegExp(secret), { exact: false })).toHaveCount(0);
  }
  expect(await panel.textContent()).not.toContain('Bramblewood');
});
