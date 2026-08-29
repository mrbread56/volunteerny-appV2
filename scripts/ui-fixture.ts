/**
 * Throwaway accounts for a manual browser walkthrough.
 *
 * Creates one student, one organisation and one developer with populated data,
 * prints the credentials, and deletes everything on `--down`. Kept out of the
 * check:* family because it is driven by a human (or an agent) looking at the
 * screen rather than by assertions.
 *
 *   npx tsx scripts/ui-fixture.ts up
 *   npx tsx scripts/ui-fixture.ts down
 *
 * Every document it writes carries isFixture where the collection permits it,
 * and the organisation's name says so, because `organizations` is listable by
 * any signed-in account and a run that dies half-way would otherwise leave a
 * fake charity in the directory in front of real students.
 */
import './env';
import a from 'firebase-admin';

const PASSWORD = 'uiWalk!12345';
const STAMP = 'uiwalk';
const ACCOUNTS = {
  student: `${STAMP}.student@example.com`,
  organization: `${STAMP}.org@example.com`,
  developer: `${STAMP}.dev@example.com`,
};

// Memoised: settings() may be called once per Firestore instance, and up()
// calls down() first.
let cached: { app: a.app.App; db: FirebaseFirestore.Firestore } | null = null;
function admin() {
  if (cached) return cached;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
  const app = a.apps.length
    ? a.apps[0]!
    : a.initializeApp({ credential: a.credential.cert(JSON.parse(key)) }, `uifix-${Date.now()}`);
  const db = app.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });
  cached = { app, db };
  return cached;
}

async function uidFor(app: a.app.App, email: string): Promise<string | null> {
  try {
    return (await app.auth().getUserByEmail(email)).uid;
  } catch {
    return null;
  }
}

async function down() {
  const { app, db } = admin();
  for (const email of Object.values(ACCOUNTS)) {
    const uid = await uidFor(app, email);
    if (!uid) continue;
    for (const c of ['users', 'students', 'organizations']) {
      await db.collection(c).doc(uid).delete().catch(() => {});
    }
    for (const c of ['opportunities', 'applications', 'hoursRequests']) {
      const snap = await db.collection(c).where('orgId', '==', uid).get().catch(() => null);
      if (snap) for (const d of snap.docs) await d.ref.delete().catch(() => {});
      const snap2 = await db.collection(c).where('studentId', '==', uid).get().catch(() => null);
      if (snap2) for (const d of snap2.docs) await d.ref.delete().catch(() => {});
    }
    await app.auth().deleteUser(uid).catch(() => {});
    console.log(`[down] removed ${email}`);
  }
}

async function up() {
  await down();
  const { app, db } = admin();
  const grace = Math.floor(Date.now() / 1000) + 3600;
  const uids: Record<string, string> = {};

  for (const [role, email] of Object.entries(ACCOUNTS)) {
    const rec = await app.auth().createUser({ email, password: PASSWORD, emailVerified: true });
    uids[role] = rec.uid;
    // The support grace window, so the walkthrough is not blocked on an emailed
    // code. Same claim scripts/grant-mfa.ts writes, and it expires in an hour.
    await app.auth().setCustomUserClaims(rec.uid, { mfaGraceUntil: grace });
    await db.collection('users').doc(rec.uid).set({
      uid: rec.uid, email, role,
      twoFactorEnabled: role !== 'student',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
    });
  }

  await db.collection('students').doc(uids.student).set({
    uid: uids.student,
    fullName: 'Priya Raghunathan',
    school: 'Earl Haig Secondary School',
    grade: '11',
    gender: 'female',
    neighborhood: 'Willowdale',
    interests: ['Environment', 'Education'],
    skills: ['Leadership', 'Communication'],
    availability: ['Weekends', 'Weekday evenings'],
    previousExperience: 'Two summers helping at a neighbourhood food drive.',
    resumeUrl: '',
    trackerEnabled: true,
    trackerAnonymous: false,
    hours: 12,
    loggedHours: [
      {
        id: 'uiwalk_lh_1', activity: 'Shoreline cleanup', hours: 6, date: '2026-07-12',
        approved: true, approvedAt: '2026-07-13T15:00:00.000Z',
        coordinatorName: 'Dana Whitfield', coordinatorContact: ACCOUNTS.organization,
        organization: 'Don River Stewards (test fixture)',
      },
      {
        id: 'uiwalk_lh_2', activity: 'Tutoring drop-in', hours: 6, date: '2026-08-02',
        approved: true, approvedAt: '2026-08-03T15:00:00.000Z',
        coordinatorName: 'Dana Whitfield', coordinatorContact: ACCOUNTS.organization,
        organization: 'Don River Stewards (test fixture)',
      },
    ],
  });

  await db.collection('organizations').doc(uids.organization).set({
    uid: uids.organization,
    organizationName: 'Don River Stewards (test fixture)',
    mission: 'Keeping the ravine trails clear and the riverbank planted.',
    description: 'A volunteer-run stewardship group working along the East Don.',
    hasCra: false,
    craNumber: '',
    organizationType: 'Environment',
    contactEmail: ACCOUNTS.organization,
    phone: '416-555-0182',
    address: '5100 Yonge St, North York',
    coordinates: { lat: 43.7701, lng: -79.4136 },
    northYorkConfirmed: true,
    websiteUrl: 'https://example.org',
    craVerified: false,
    verificationStatus: 'verified',
  });

  const oppRef = db.collection('opportunities').doc('uiwalk_opp_1');
  await oppRef.set({
    orgId: uids.organization,
    orgName: 'Don River Stewards (test fixture)',
    title: 'Saturday ravine cleanup',
    description: 'Meet at the trailhead, gloves and bags provided. Three hours along the riverbank.',
    location: 'Betty Sutherland Trail, North York',
    dateTime: new Date(Date.now() + 9 * 86400000),
    category: 'Environment',
    requirements: 'Closed shoes. Dress for the weather.',
    maxVolunteers: 8,
    minAge: 14,
    skillsNeeded: ['Teamwork'],
    exclusives: [],
    timeCommitment: 'One-time',
    isVirtual: false,
    status: 'open',
    coordinates: { lat: 43.7701, lng: -79.4136 },
    scheduleType: 'single',
    shifts: [],
    createdAt: a.firestore.FieldValue.serverTimestamp(),
    isFixture: true,
  });

  await db.collection('applications').doc(`${uids.student}_uiwalk_opp_1`).set({
    opportunityId: 'uiwalk_opp_1',
    orgId: uids.organization,
    studentId: uids.student,
    status: 'pending',
    appliedAt: a.firestore.FieldValue.serverTimestamp(),
    message: 'I have done two of these before and can bring a friend.',
    opportunityTitle: 'Saturday ravine cleanup',
    studentName: 'Priya Raghunathan',
    previousExperience: 'Two summers helping at a neighbourhood food drive.',
    resumeUrl: '',
  });

  await db.collection('hoursRequests').doc('uiwalk_hr_1').set({
    id: 'uiwalk_hr_1',
    studentId: uids.student,
    studentName: 'Priya Raghunathan',
    studentEmail: ACCOUNTS.student,
    activity: 'Weekend planting',
    organization: 'Don River Stewards (test fixture)',
    hours: 4,
    date: '2026-08-22',
    coordinatorName: 'Dana Whitfield',
    coordinatorContact: ACCOUNTS.organization,
    orgId: uids.organization,
    status: 'pending',
    requestedAt: new Date().toISOString(),
  });

  console.log('\nUI walkthrough accounts (password for all three):', PASSWORD);
  for (const [role, email] of Object.entries(ACCOUNTS)) {
    console.log(`  ${role.padEnd(13)} ${email}   uid=${uids[role]}`);
  }
  console.log('\nRun `npx tsx scripts/ui-fixture.ts down` when finished.\n');
}

const mode = process.argv[2];
(mode === 'down' ? down() : up())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
