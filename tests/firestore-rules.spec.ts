import { test } from '@playwright/test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp,
} from 'firebase/firestore';

/**
 * firestore.rules, tested offline and exhaustively.
 *
 * Every other rules check in this repo proves itself by writing to the REAL
 * project — `check:security` creates live accounts and attacks them. That works,
 * but it is slow, it litters production, and it can only afford to test the
 * paths someone thought to attack.
 *
 * This attaches to the Firestore emulator instead, so a rule can be exercised
 * per-field, in both directions, for free. That matters most on CREATE paths:
 * every self-promotion test in the live suite used updateDoc, so the update
 * rules were tight while the create rules — written once, at signup, and never
 * exercised again — were where BOTH confirmed live exploits actually lived (a
 * student self-granting `hours`, an organization self-granting `verified`).
 *
 * Requires a JDK, because the emulator is a Java process. Run it with:
 *
 *   npm run test:rules
 *
 * which boots the emulator, runs this file, and shuts it down again. This is
 * ROADMAP B11, and it is the difference between rules that are believed correct
 * and rules that are known to be.
 */

const PROJECT_ID = 'vny-rules-test';
let env: RulesTestEnvironment;

/**
 * A signed-in browser for `uid`.
 *
 * The `email` claim is not optional padding. isDeveloper() ends in
 * `request.auth.token.email in developerEmails()`, and reading a claim that is
 * absent is an EVALUATION ERROR in the rules language, not a false — so a token
 * without one makes that helper throw wherever it appears. Every real token
 * here carries an email (the app only offers email/password and Google), so
 * omitting it in a test would be testing a user that cannot exist.
 */
const asUser = (uid: string, claims: Record<string, unknown> = {}) =>
  env
    .authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...claims })
    .firestore() as any;
const asAnon = () => env.unauthenticatedContext().firestore() as any;

/** Write fixtures with the rules switched off, the way a seeded database looks. */
async function seed(fn: (db: any) => Promise<void>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as any);
  });
}

const STUDENT = 'student_uid_1';
const STUDENT2 = 'student_uid_2';
const ORG = 'org_uid_1';
const ORG2 = 'org_uid_2';
const DEV = 'dev_uid_1';

/** The account documents the rules resolve roles from, via get(). */
async function seedAccounts() {
  await seed(async (db) => {
    const account = (uid: string, role: string) => ({
      uid, email: `${uid}@example.com`, role, createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    await setDoc(doc(db, 'users', STUDENT), account(STUDENT, 'student'));
    await setDoc(doc(db, 'users', STUDENT2), account(STUDENT2, 'student'));
    await setDoc(doc(db, 'users', ORG), account(ORG, 'organization'));
    await setDoc(doc(db, 'users', ORG2), account(ORG2, 'organization'));
    await setDoc(doc(db, 'users', DEV), account(DEV, 'developer'));
    await setDoc(doc(db, 'students', STUDENT), { uid: STUDENT, fullName: 'S One', loggedHours: [] });
    await setDoc(doc(db, 'organizations', ORG), {
      uid: ORG, organizationName: 'Org One', contactEmail: 'o1@example.com',
      northYorkConfirmed: true, craVerified: false, verificationStatus: 'verified',
    });
    await setDoc(doc(db, 'opportunities', 'opp_1'), {
      orgId: ORG, orgName: 'Org One', title: 'Opp', description: 'd', location: 'l',
      category: 'Environment', requirements: '', maxVolunteers: 5, skillsNeeded: [],
      exclusives: [], timeCommitment: 'One-time', isVirtual: false,
      dateTime: new Date('2026-09-01T13:00:00Z'), createdAt: new Date('2026-01-01T00:00:00Z'),
    });
  });
}

test.beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

test.afterAll(async () => {
  await env?.cleanup();
});

test.beforeEach(async () => {
  await env.clearFirestore();
  await seedAccounts();
});

// ───────────────────────── users ─────────────────────────

test.describe('users/{uid}', () => {
  test('an account is readable by its owner and by a developer, and by nobody else', async () => {
    await assertSucceeds(getDoc(doc(asUser(STUDENT), 'users', STUDENT)));
    await assertSucceeds(getDoc(doc(asUser(DEV), 'users', STUDENT)));
    await assertFails(getDoc(doc(asUser(STUDENT2), 'users', STUDENT)));
    await assertFails(getDoc(doc(asUser(ORG), 'users', STUDENT)));
    await assertFails(getDoc(doc(asAnon(), 'users', STUDENT)));
  });

  test('an account can only be created for yourself', async () => {
    await assertFails(setDoc(doc(asUser(STUDENT), 'users', 'somebody_else'), {
      uid: 'somebody_else', email: 'x@example.com', role: 'student',
    }));
  });

  test('a new account cannot claim the developer role', async () => {
    await assertFails(setDoc(doc(asUser('fresh_uid'), 'users', 'fresh_uid'), {
      uid: 'fresh_uid', email: 'f@example.com', role: 'developer',
    }));
  });

  test('a student may switch two-factor off; an organization may not', async () => {
    await seed(async (db) => {
      await updateDoc(doc(db, 'users', STUDENT), { twoFactorEnabled: true });
      await updateDoc(doc(db, 'users', ORG), { twoFactorEnabled: true });
    });
    await assertSucceeds(updateDoc(doc(asUser(STUDENT), 'users', STUDENT), { twoFactorEnabled: false }));
    // The whole point of the rule: an org opting out of 2FA is a privilege
    // downgrade on the highest-value accounts on the platform.
    await assertFails(updateDoc(doc(asUser(ORG), 'users', ORG), { twoFactorEnabled: false }));
    await assertSucceeds(updateDoc(doc(asUser(ORG), 'users', ORG), { twoFactorEnabled: true }));
  });

  test('an organization cannot opt out of two-factor at CREATION', async () => {
    // The create/update asymmetry this file exists to catch. The update rule
    // spends four lines stopping an org setting this to false; the create rule
    // accepted any bool from any role, so an org could simply be BORN exempt —
    // and verifyMfaClaim short-circuits to true whenever the field is false, so
    // no challenge is ever issued. The update rule then helpfully prevents
    // anyone turning back on what was never on.
    await assertFails(setDoc(doc(asUser('new_org2'), 'users', 'new_org2'), {
      uid: 'new_org2', email: 'new_org2@example.com', role: 'organization',
      twoFactorEnabled: false, createdAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(asUser('new_org3'), 'users', 'new_org3'), {
      uid: 'new_org3', email: 'new_org3@example.com', role: 'organization',
      twoFactorEnabled: true, createdAt: serverTimestamp(),
    }));
    // A student may still be created with it off — it is optional for them.
    await assertSucceeds(setDoc(doc(asUser('new_stu'), 'users', 'new_stu'), {
      uid: 'new_stu', email: 'new_stu@example.com', role: 'student',
      twoFactorEnabled: false, createdAt: serverTimestamp(),
    }));
  });

  test('an account cannot be created as free storage either', async () => {
    await assertFails(setDoc(doc(asUser('padder'), 'users', 'padder'), {
      uid: 'padder', email: 'padder@example.com', role: 'student',
      createdAt: serverTimestamp(), padding: 'x'.repeat(900000),
    }));
  });

  test('no account may change its own role', async () => {
    await assertFails(updateDoc(doc(asUser(STUDENT), 'users', STUDENT), { role: 'developer' }));
    await assertFails(updateDoc(doc(asUser(ORG), 'users', ORG), { role: 'developer' }));
  });

  test('an account cannot be used as free storage', async () => {
    // hasOnly is the bound. Pinning role/uid/createdAt/email stops those being
    // CHANGED and does nothing about keys that were never named.
    await assertFails(updateDoc(doc(asUser(STUDENT), 'users', STUDENT), {
      arbitraryPayload: 'x'.repeat(10000),
    }));
  });

  test('accounts cannot be deleted from a browser, or enumerated', async () => {
    await assertFails(deleteDoc(doc(asUser(STUDENT), 'users', STUDENT)));
    await assertFails(getDocs(collection(asUser(STUDENT), 'users')));
    await assertSucceeds(getDocs(collection(asUser(DEV), 'users')));
  });
});

// ─────────────────────── students ────────────────────────

test.describe('students/{uid}', () => {
  test('a profile is private to its owner — an organization cannot read it', async () => {
    await assertSucceeds(getDoc(doc(asUser(STUDENT), 'students', STUDENT)));
    // These documents carry resumeUrl and passportUrl. An org reading any
    // student by uid was a whole-identity leak.
    await assertFails(getDoc(doc(asUser(ORG), 'students', STUDENT)));
    await assertFails(getDoc(doc(asUser(STUDENT2), 'students', STUDENT)));
  });

  test('a student cannot grant themselves hours at creation', async () => {
    // Confirmed live against production before it was fixed: this was the
    // permanent #1 leaderboard exploit, and it worked because every existing
    // test used updateDoc and the create path was never exercised.
    await assertFails(setDoc(doc(asUser('new_student'), 'students', 'new_student'), {
      uid: 'new_student', fullName: 'Cheater', hours: 999999,
    }));
    await assertFails(setDoc(doc(asUser('new_student'), 'students', 'new_student'), {
      uid: 'new_student', fullName: 'Cheater',
      loggedHours: [{ hours: 999999, activity: 'nothing', date: '2026-01-01' }],
    }));
  });

  test('a student cannot grant themselves hours by update either', async () => {
    await assertFails(updateDoc(doc(asUser(STUDENT), 'students', STUDENT), { hours: 500 }));
    await assertFails(updateDoc(doc(asUser(STUDENT), 'students', STUDENT), {
      loggedHours: [{ hours: 500, activity: 'x', date: '2026-01-01' }],
    }));
  });

  test('an oversized upload is refused rather than corrupting the profile', async () => {
    // Firestore rejects any document over 1 MiB, so an unbounded base64 upload
    // made the student's ENTIRE profile unsaveable rather than just refusing
    // the file. 400_000 keeps both files plus the rest under the ceiling.
    await assertFails(updateDoc(doc(asUser(STUDENT), 'students', STUDENT), {
      resumeUrl: 'd'.repeat(400001),
    }));
    await assertSucceeds(updateDoc(doc(asUser(STUDENT), 'students', STUDENT), {
      resumeUrl: 'd'.repeat(1000),
    }));
  });

  test('a student who never set a gender can still save their profile', async () => {
    // Onboarding never writes `gender`, and StudentProfile initialises it to ''
    // and sends it on EVERY save. So for every student who predates the field,
    // '' is present-and-not-null: absent() is false, the enum rejects it, and
    // the whole profile save returns permission-denied with nothing naming the
    // culprit. The `grade` clause directly above admits '' for exactly this
    // reason; gender must match it.
    await assertSucceeds(updateDoc(doc(asUser(STUDENT), 'students', STUDENT), {
      fullName: 'S One', gender: '',
    }));
    await assertSucceeds(updateDoc(doc(asUser(STUDENT), 'students', STUDENT), { gender: 'female' }));
    await assertFails(updateDoc(doc(asUser(STUDENT), 'students', STUDENT), { gender: 'anything else' }));
  });

  test('the tracker flags are bounded, like every other field on the profile', async () => {
    // Both keys are in the create AND update allowlists, and isValidStudent
    // never mentions either — so they accepted any type at any size, walking
    // straight around the 400 KB caps that exist to keep this document under
    // Firestore's 1 MiB ceiling.
    await assertFails(updateDoc(doc(asUser(STUDENT), 'students', STUDENT), {
      trackerEnabled: 'x'.repeat(900000),
    }));
    await assertSucceeds(updateDoc(doc(asUser(STUDENT), 'students', STUDENT), {
      trackerEnabled: false, trackerAnonymous: true,
    }));
  });

  test('a student cannot ban or unban themselves', async () => {
    await seed(async (db) => { await updateDoc(doc(db, 'students', STUDENT), { isBanned: true }); });
    await assertFails(updateDoc(doc(asUser(STUDENT), 'students', STUDENT), { isBanned: false }));
  });
});

// ────────────────────── organizations ─────────────────────

test.describe('organizations/{uid}', () => {
  test('an organization cannot self-verify at creation', async () => {
    // The second exploit confirmed live: self-granting 'verified' skipped human
    // review entirely, and verified status is what students trust.
    await assertFails(setDoc(doc(asUser('new_org'), 'organizations', 'new_org'), {
      uid: 'new_org', organizationName: 'Fake', contactEmail: 'f@example.com',
      northYorkConfirmed: true, verificationStatus: 'verified',
    }));
    await assertFails(setDoc(doc(asUser('new_org'), 'organizations', 'new_org'), {
      uid: 'new_org', organizationName: 'Fake', contactEmail: 'f@example.com',
      northYorkConfirmed: true, craVerified: true,
    }));
  });

  test('an organization may put itself IN the review queue', async () => {
    await assertSucceeds(updateDoc(doc(asUser(ORG), 'organizations', ORG), {
      verificationStatus: 'pending',
    }));
  });

  test('an organization cannot promote itself out of the queue', async () => {
    // Start from unverified. The seed is 'verified' so that the rest of the
    // suite can post opportunities — but writing 'verified' onto a document
    // that already says 'verified' changes nothing, and the rule correctly
    // permits a no-op. That would make this pass for the wrong reason.
    await seed(async (db) => {
      await updateDoc(doc(db, 'organizations', ORG), { verificationStatus: 'unverified' });
    });
    await assertFails(updateDoc(doc(asUser(ORG), 'organizations', ORG), {
      verificationStatus: 'verified',
    }));
    await assertFails(updateDoc(doc(asUser(ORG), 'organizations', ORG), { craVerified: true }));
  });

  test('a developer can decide a verification', async () => {
    await assertSucceeds(updateDoc(doc(asUser(DEV), 'organizations', ORG), {
      verificationStatus: 'verified',
    }));
  });

  test("an organization cannot edit another organization", async () => {
    await assertFails(updateDoc(doc(asUser(ORG2), 'organizations', ORG), {
      organizationName: 'Hijacked',
    }));
  });
});

// ────────────────────── opportunities ─────────────────────

test.describe('opportunities/{id}', () => {
  const validOpp = (orgId: string) => ({
    orgId, orgName: 'Org One', title: 'Beach cleanup', description: 'Pick up litter',
    location: 'North York', category: 'Environment', requirements: '', maxVolunteers: 5,
    skillsNeeded: [], exclusives: [], timeCommitment: 'One-time', isVirtual: false,
    dateTime: new Date('2026-09-01T13:00:00Z'), createdAt: serverTimestamp(),
  });

  test('browsing is deliberately public, and that publicity stops at listings', async () => {
    // `allow read: if true` is intentional — a shared link to an opportunity
    // should open for someone without an account. These documents carry no
    // personal data: an org name, a title, a location, a capacity.
    await assertSucceeds(getDocs(collection(asUser(STUDENT), 'opportunities')));
    await assertSucceeds(getDocs(collection(asAnon(), 'opportunities')));

    // The important half of that decision: nothing ELSE is public. If public
    // browse ever leaks past listings, it fails here.
    await assertFails(getDoc(doc(asAnon(), 'students', STUDENT)));
    await assertFails(getDoc(doc(asAnon(), 'users', STUDENT)));
    await assertFails(getDocs(collection(asAnon(), 'applications')));
    await assertFails(getDocs(collection(asAnon(), 'hoursRequests')));
    await assertFails(getDocs(collection(asAnon(), 'organizations')));
  });

  test('an organization can post only under its own id', async () => {
    await assertSucceeds(setDoc(doc(asUser(ORG), 'opportunities', 'new_opp'), validOpp(ORG)));
    await assertFails(setDoc(doc(asUser(ORG2), 'opportunities', 'forged'), validOpp(ORG)));
  });

  test('a student cannot post an opportunity', async () => {
    await assertFails(setDoc(doc(asUser(STUDENT), 'opportunities', 'student_opp'), validOpp(STUDENT)));
  });

  test('field limits and the status enum are enforced', async () => {
    await assertFails(setDoc(doc(asUser(ORG), 'opportunities', 'too_long'), {
      ...validOpp(ORG), title: 'x'.repeat(101),
    }));
    await assertFails(setDoc(doc(asUser(ORG), 'opportunities', 'bad_status'), {
      ...validOpp(ORG), status: 'whatever',
    }));
    await assertSucceeds(setDoc(doc(asUser(ORG), 'opportunities', 'closed_ok'), {
      ...validOpp(ORG), status: 'closed',
    }));
  });

  test('unknown fields are refused, so a posting cannot become free storage', async () => {
    await assertFails(setDoc(doc(asUser(ORG), 'opportunities', 'padded'), {
      ...validOpp(ORG), junk: 'x'.repeat(5000),
    }));
  });

  test('only the owner can edit or delete a posting', async () => {
    await assertSucceeds(updateDoc(doc(asUser(ORG), 'opportunities', 'opp_1'), { title: 'Renamed' }));
    await assertFails(updateDoc(doc(asUser(ORG2), 'opportunities', 'opp_1'), { title: 'Hijacked' }));
    await assertFails(updateDoc(doc(asUser(STUDENT), 'opportunities', 'opp_1'), { title: 'Hijacked' }));
    await assertFails(deleteDoc(doc(asUser(ORG2), 'opportunities', 'opp_1')));
    await assertSucceeds(deleteDoc(doc(asUser(ORG), 'opportunities', 'opp_1')));
  });

  test('an owner cannot hand a posting to someone else', async () => {
    await assertFails(updateDoc(doc(asUser(ORG), 'opportunities', 'opp_1'), { orgId: ORG2 }));
  });
});

// ────────────────────── applications ──────────────────────

test.describe('applications/{id}', () => {
  const appId = `${STUDENT}_opp_1`;
  const validApp = (studentId: string) => ({
    opportunityId: 'opp_1', orgId: ORG, studentId, status: 'pending',
    appliedAt: serverTimestamp(), message: '', opportunityTitle: 'Opp', studentName: 'S One',
    previousExperience: '', resumeUrl: '',
  });

  test('a student applies as themselves, and cannot apply as anyone else', async () => {
    await assertSucceeds(setDoc(doc(asUser(STUDENT), 'applications', appId), validApp(STUDENT)));
    await assertFails(setDoc(doc(asUser(STUDENT2), 'applications', 'forged'), validApp(STUDENT)));
  });

  test('an application cannot be born accepted', async () => {
    await assertFails(setDoc(doc(asUser(STUDENT), 'applications', appId), {
      ...validApp(STUDENT), status: 'accepted',
    }));
  });

  test('a student may withdraw, but not accept themselves', async () => {
    await seed(async (db) => { await setDoc(doc(db, 'applications', appId), validApp(STUDENT)); });
    await assertFails(updateDoc(doc(asUser(STUDENT), 'applications', appId), { status: 'accepted' }));
    await assertSucceeds(updateDoc(doc(asUser(STUDENT), 'applications', appId), { status: 'terminated' }));
  });

  test("a student cannot touch another student's application", async () => {
    await seed(async (db) => { await setDoc(doc(db, 'applications', appId), validApp(STUDENT)); });
    await assertFails(updateDoc(doc(asUser(STUDENT2), 'applications', appId), { status: 'terminated' }));
    await assertFails(getDoc(doc(asUser(STUDENT2), 'applications', appId)));
  });

  test('the owning organization decides; an unrelated one cannot', async () => {
    await seed(async (db) => { await setDoc(doc(db, 'applications', appId), validApp(STUDENT)); });
    await assertSucceeds(updateDoc(doc(asUser(ORG), 'applications', appId), { status: 'accepted' }));
    await assertFails(updateDoc(doc(asUser(ORG2), 'applications', appId), { status: 'accepted' }));
  });

  test('free-text fields on an application are bounded', async () => {
    await assertFails(setDoc(doc(asUser(STUDENT), 'applications', appId), {
      ...validApp(STUDENT), message: 'x'.repeat(100000),
    }));
  });
});

// ───────────────────── hoursRequests ──────────────────────

test.describe('hoursRequests/{id}', () => {
  const req = (studentId: string, hours: number) => ({
    id: `req-${studentId}-${Date.now()}`,
    studentId, studentName: 'S One', studentEmail: 's1@example.com',
    activity: 'Cleanup', hours, date: '2026-08-13', organization: 'Org One',
    coordinatorName: 'Coord', coordinatorContact: 'o1@example.com',
    status: 'pending', requestedAt: new Date().toISOString(),
  });

  test('a student files their own request, pending, within the cap', async () => {
    await assertSucceeds(setDoc(doc(asUser(STUDENT), 'hoursRequests', 'r1'), req(STUDENT, 3)));
    await assertFails(setDoc(doc(asUser(STUDENT2), 'hoursRequests', 'r2'), req(STUDENT, 3)));
  });

  test('an absurd claim is refused at the rules layer', async () => {
    // The server caps a single approval at 24 anyway, so this could never be
    // credited — but without the bound it could still flood a coordinator's
    // queue with nonsense.
    await assertFails(setDoc(doc(asUser(STUDENT), 'hoursRequests', 'r3'), req(STUDENT, 100000)));
    await assertFails(setDoc(doc(asUser(STUDENT), 'hoursRequests', 'r4'), req(STUDENT, 0)));
    await assertFails(setDoc(doc(asUser(STUDENT), 'hoursRequests', 'r5'), req(STUDENT, -5)));
  });

  test('a request cannot be born approved', async () => {
    await assertFails(setDoc(doc(asUser(STUDENT), 'hoursRequests', 'r6'), {
      ...req(STUDENT, 3), status: 'approved',
    }));
  });

  test('a student cannot approve their own request', async () => {
    await seed(async (db) => { await setDoc(doc(db, 'hoursRequests', 'r7'), req(STUDENT, 3)); });
    await assertFails(updateDoc(doc(asUser(STUDENT), 'hoursRequests', 'r7'), { status: 'approved' }));
  });
});

// ───────────────── suspended accounts ─────────────────

test.describe('a suspended account', () => {
  test('cannot keep writing just because it still holds a token', async () => {
    // isBanned was enforced ONLY by src/routes/guards.tsx — React code the
    // banned party controls. A student banned after a safety report kept a
    // valid ID token and could carry on through the SDK: applying, filing
    // hours, submitting reports. The suspension screen was a suggestion.
    await seed(async (db) => {
      await updateDoc(doc(db, 'users', STUDENT), { isBanned: true });
    });
    await assertFails(setDoc(doc(asUser(STUDENT), 'applications', STUDENT + '_opp_1'), {
      opportunityId: 'opp_1', orgId: ORG, studentId: STUDENT, status: 'pending',
      appliedAt: serverTimestamp(), message: '', opportunityTitle: 'Opp',
      studentName: 'S One', previousExperience: '', resumeUrl: '',
    }));
    await assertFails(setDoc(doc(asUser(STUDENT), 'hoursRequests', 'banned_req'), {
      studentId: STUDENT, studentName: 'S One', studentEmail: 's1@example.com',
      activity: 'Cleanup', hours: 3, date: '2026-08-13', organization: 'Org One',
      coordinatorName: 'C', coordinatorContact: 'o1@example.com',
      status: 'pending', requestedAt: new Date().toISOString(),
    }));
  });

  test('a suspended organization cannot keep posting', async () => {
    await seed(async (db) => {
      await updateDoc(doc(db, 'users', ORG), { isBanned: true });
    });
    await assertFails(setDoc(doc(asUser(ORG), 'opportunities', 'banned_opp'), {
      orgId: ORG, orgName: 'Org One', title: 'Still posting', description: 'd',
      location: 'l', category: 'Environment', requirements: '', maxVolunteers: 5,
      skillsNeeded: [], exclusives: [], timeCommitment: 'One-time', isVirtual: false,
      dateTime: new Date('2026-09-01T13:00:00Z'), createdAt: serverTimestamp(),
    }));
  });
});

// ─────────────── unbounded free text ───────────────

test.describe('free text is bounded everywhere it is accepted', () => {
  // Mirrors what StudentDashboard actually writes, `id` included. A fixture
  // that omits a field the app sends will pass here and fail in production.
  const hoursBase = () => ({
    id: `req-${STUDENT}-${Date.now()}`,
    studentId: STUDENT, studentName: 'S One', studentEmail: 's1@example.com',
    activity: 'Cleanup', hours: 3, date: '2026-08-13', organization: 'Org One',
    coordinatorName: 'C', coordinatorContact: 'o1@example.com',
    status: 'pending', requestedAt: new Date().toISOString(),
  });

  test('an hours request cannot carry a megabyte of prose, or unknown keys', async () => {
    await assertFails(setDoc(doc(asUser(STUDENT), 'hoursRequests', 'fat1'), {
      ...hoursBase(), activity: 'x'.repeat(900000),
    }));
    await assertFails(setDoc(doc(asUser(STUDENT), 'hoursRequests', 'fat2'), {
      ...hoursBase(), junkKey: 'x'.repeat(500000),
    }));
    await assertSucceeds(setDoc(doc(asUser(STUDENT), 'hoursRequests', 'ok1'), hoursBase()));
  });

  test('a report cannot carry a megabyte of prose', async () => {
    // attachmentData was capped at 400 000 precisely to keep one report under
    // 1 MiB. `description` reached the same ceiling in a single field.
    await assertFails(setDoc(doc(asUser(STUDENT), 'reports', 'fat_report'), {
      reportingUserId: STUDENT, reportedUserId: ORG, reason: 'Other',
      description: 'x'.repeat(900000), status: 'pending', createdAt: serverTimestamp(),
    }));
  });

  const oppBase = () => ({
    orgId: ORG, orgName: 'Org One', title: 'T', description: 'd', location: 'l',
    category: 'Environment', requirements: '', maxVolunteers: 5, skillsNeeded: [],
    exclusives: [], timeCommitment: 'One-time', isVirtual: false,
    dateTime: new Date('2026-09-01T13:00:00Z'), createdAt: serverTimestamp(),
  });

  test('an opportunity cannot carry unbounded text to every public visitor', async () => {
    // This collection is world-readable, so an unbounded field here is served
    // to unauthenticated browsers.
    await assertFails(setDoc(doc(asUser(ORG), 'opportunities', 'fat_opp'), {
      ...oppBase(), location: 'x'.repeat(900000),
    }));
  });

  test('capacity cannot be negative', async () => {
    await assertFails(setDoc(doc(asUser(ORG), 'opportunities', 'neg_opp'), {
      ...oppBase(), maxVolunteers: -5,
    }));
  });
});

// ───────────── server-only collections ─────────────

test.describe('collections only the server may write', () => {
  test('a reference cannot be forged from a browser', async () => {
    await assertFails(setDoc(doc(asUser(ORG), 'recommendations', 'rec1'), {
      studentId: STUDENT, orgId: ORG, text: 'Excellent', createdAt: new Date().toISOString(),
    }));
    await assertFails(setDoc(doc(asUser(STUDENT), 'recommendations', 'rec2'), {
      studentId: STUDENT, orgId: ORG, text: 'I am great', createdAt: new Date().toISOString(),
    }));
  });

  test('a rating cannot be forged from a browser', async () => {
    await assertFails(setDoc(doc(asUser(STUDENT), 'orgRatings', 'rate1'), {
      studentId: STUDENT, orgId: ORG, rating: 5,
    }));
  });

  test('the default-deny catch-all holds for a collection nobody defined', async () => {
    await assertFails(setDoc(doc(asUser(STUDENT), 'chats', 'c1'), { text: 'hi' }));
    await assertFails(getDocs(collection(asUser(STUDENT), 'messages')));
    await assertFails(setDoc(doc(asUser(DEV), 'somethingInvented', 'x'), { a: 1 }));
  });
});

// ───────────── the developer allowlist ─────────────

test.describe('the developer bootstrap allowlist', () => {
  test('an allowlisted address with an UNVERIFIED email is not a developer', async () => {
    // Firebase does not require ownership proof to create an account with a
    // given address, so without email_verified anyone could register an
    // unclaimed allowlisted address and be handed the console.
    const unverified = env
      .authenticatedContext('imposter', { email: 'kiamehrmetanat@gmail.com', email_verified: false })
      .firestore() as any;
    await assertFails(getDocs(collection(unverified, 'users')));
  });

  test('an allowlisted address WITH a verified email is a developer', async () => {
    const real = env
      .authenticatedContext('real_dev', { email: 'kiamehrmetanat@gmail.com', email_verified: true })
      .firestore() as any;
    await assertSucceeds(getDocs(collection(real, 'users')));
  });
});

// ─────────────── two-factor, enforced by the database ───────────────

test.describe('two-factor is enforced in the rules, not only in React', () => {
  test('the auth_time claim is visible to rules at all', async () => {
    // Everything below depends on this. If auth_time is not exposed to the
    // rules language, per-sign-in enforcement cannot live here and the whole
    // approach has to change — so it is asserted first, on its own.
    const ctx = env.authenticatedContext(STUDENT, {
      email: `${STUDENT}@example.com`, email_verified: true,
      auth_time: 1786700000, mfaVerifiedFor: 1786700000, mfaVerified: true,
    });
    await assertSucceeds(getDoc(doc(ctx.firestore() as any, 'users', STUDENT)));
  });

  test('an organization with 2FA on cannot write without a matching claim', async () => {
    await seed(async (db) => {
      await updateDoc(doc(db, 'users', ORG), { twoFactorEnabled: true });
    });
    // A stolen password gets a valid ID token. Without the MFA claim, the React
    // app would route them to /mfa — but the SDK does not run the React app.
    const noClaim = env.authenticatedContext(ORG, {
      email: `${ORG}@example.com`, email_verified: true, auth_time: 1786700000,
    }).firestore() as any;
    await assertFails(setDoc(doc(noClaim, 'opportunities', 'stolen_pw_opp'), {
      orgId: ORG, orgName: 'Org One', title: 'Posted with a stolen password',
      description: 'd', location: 'l', category: 'Environment', requirements: '',
      maxVolunteers: 5, skillsNeeded: [], exclusives: [], timeCommitment: 'One-time',
      isVirtual: false, dateTime: new Date('2026-09-01T13:00:00Z'), createdAt: serverTimestamp(),
    }));
  });

  test('a claim from a PREVIOUS sign-in does not count', async () => {
    await seed(async (db) => {
      await updateDoc(doc(db, 'users', ORG), { twoFactorEnabled: true });
    });
    const stale = env.authenticatedContext(ORG, {
      email: `${ORG}@example.com`, email_verified: true,
      auth_time: 1786700000,
      mfaVerified: true, mfaVerifiedFor: 1786600000, // yesterday's session
    }).firestore() as any;
    await assertFails(updateDoc(doc(stale, 'organizations', ORG), { mission: 'changed' }));
  });

  test('a matching claim works normally', async () => {
    await seed(async (db) => {
      await updateDoc(doc(db, 'users', ORG), { twoFactorEnabled: true });
    });
    const good = env.authenticatedContext(ORG, {
      email: `${ORG}@example.com`, email_verified: true,
      auth_time: 1786700000, mfaVerified: true, mfaVerifiedFor: 1786700000,
    }).firestore() as any;
    await assertSucceeds(updateDoc(doc(good, 'organizations', ORG), { mission: 'changed' }));
  });

  test('a student with two-factor OFF is never asked for a claim', async () => {
    // The reason this was not done sooner: students may switch 2FA off, and
    // those tokens carry no claim at all. A naive rule locks every one of them
    // out of the database.
    const plain = env.authenticatedContext(STUDENT, {
      email: `${STUDENT}@example.com`, email_verified: true, auth_time: 1786700000,
    }).firestore() as any;
    await assertSucceeds(updateDoc(doc(plain, 'students', STUDENT), { fullName: 'Still Works' }));
  });
});

test.describe('the support grace window', () => {
  test('a granted grace window lets an organization write, as the runbook promises', async () => {
    // scripts/grant-mfa.ts exists so an organization whose code cannot reach
    // them is not locked out permanently. The client honours the window; if the
    // rules did not, the tool would let them into the UI and refuse every write
    // — a recovery path that recovers nothing. Both gates have to agree.
    await seed(async (db) => {
      await updateDoc(doc(db, 'users', ORG), { twoFactorEnabled: true });
    });
    const granted = env.authenticatedContext(ORG, {
      email: `${ORG}@example.com`, email_verified: true,
      auth_time: 1786700000,
      mfaGraceUntil: 1786700000 + 3600,
    }).firestore() as any;
    await assertSucceeds(updateDoc(doc(granted, 'organizations', ORG), { mission: 'recovered' }));
  });

  test('an EXPIRED grace window does not', async () => {
    await seed(async (db) => {
      await updateDoc(doc(db, 'users', ORG), { twoFactorEnabled: true });
    });
    const expired = env.authenticatedContext(ORG, {
      email: `${ORG}@example.com`, email_verified: true,
      auth_time: 1786700000,
      mfaGraceUntil: 1786600000, // the window closed before this sign-in began
    }).firestore() as any;
    await assertFails(updateDoc(doc(expired, 'organizations', ORG), { mission: 'too late' }));
  });
});

// ───────────── free text is bounded, replies are not forgeable ─────────────

test.describe('reports and feedback', () => {
  const report = (over: Record<string, unknown> = {}) => ({
    reportingUserId: STUDENT, reportingUserEmail: `${STUDENT}@example.com`,
    reportedUserId: ORG, reason: 'Inappropriate behaviour',
    description: 'Something happened.', status: 'pending',
    createdAt: serverTimestamp(), ...over,
  });

  test('a safety report cannot be inflated to the document ceiling', async () => {
    // attachmentData was capped and every other string was not, so the hole
    // simply moved: description alone could carry a megabyte, unlimited times,
    // straight into the queue a human reads.
    await assertSucceeds(setDoc(doc(asUser(STUDENT), 'reports', 'r_ok'), report()));
    await assertFails(setDoc(doc(asUser(STUDENT), 'reports', 'r_big'), report({
      description: 'x'.repeat(5001),
    })));
    await assertFails(setDoc(doc(asUser(STUDENT), 'reports', 'r_reason'), report({
      reason: 'x'.repeat(201),
    })));
    await assertFails(setDoc(doc(asUser(STUDENT), 'reports', 'r_name'), report({
      reportedUserName: 'x'.repeat(101),
    })));
  });

  test('a user cannot file feedback that already contains our reply', async () => {
    // developerReply was in the create allowlist, and the notification bell
    // reads exactly that field to announce "we answered your feedback" — so a
    // user could manufacture a reply from us, to themselves.
    const base = {
      userId: STUDENT, userEmail: `${STUDENT}@example.com`, type: 'bug',
      subject: 'Something is broken', message: 'It does not work.',
      createdAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(asUser(STUDENT), 'feedbacks', 'f_ok'), base));
    await assertFails(setDoc(doc(asUser(STUDENT), 'feedbacks', 'f_forged'), {
      ...base, developerReply: 'We have fixed this, well done.',
    }));
    await assertFails(setDoc(doc(asUser(STUDENT), 'feedbacks', 'f_replied'), {
      ...base, repliedAt: new Date().toISOString(),
    }));
  });

  test('feedback free text is bounded', async () => {
    const base = {
      userId: STUDENT, userEmail: `${STUDENT}@example.com`, type: 'bug',
      subject: 'Subject', message: 'Message', createdAt: serverTimestamp(),
    };
    await assertFails(setDoc(doc(asUser(STUDENT), 'feedbacks', 'f_long'), {
      ...base, message: 'x'.repeat(10001),
    }));
    await assertFails(setDoc(doc(asUser(STUDENT), 'feedbacks', 'f_email'), {
      ...base, userEmail: 'x'.repeat(255),
    }));
  });
});

// ───────────────── boundaries, pinned exactly ─────────────────

test.describe('caps are pinned at their boundary, not merely "somewhere"', () => {
  /**
   * Mutation testing found these.
   *
   * The existing assertions used values so extreme (100000 hours, a megabyte of
   * text) that widening a cap tenfold still left them failing — so the tests
   * passed against a rule that had been substantially loosened. A cap is only
   * really tested by the pair either side of it.
   */
  test('hours are capped at 24, exactly', async () => {
    const req = (hours: number) => ({
      studentId: STUDENT, studentName: 'S One', studentEmail: `${STUDENT}@example.com`,
      activity: 'Cleanup', hours, date: '2026-08-13', organization: 'Org One',
      coordinatorName: 'Coord', coordinatorContact: 'o1@example.com',
      status: 'pending', requestedAt: new Date().toISOString(),
    });
    await assertSucceeds(setDoc(doc(asUser(STUDENT), 'hoursRequests', 'b_24'), req(24)));
    await assertFails(setDoc(doc(asUser(STUDENT), 'hoursRequests', 'b_25'), req(25)));
    await assertFails(setDoc(doc(asUser(STUDENT), 'hoursRequests', 'b_24_1'), req(24.5)));
  });

  test('an opportunity description is capped at 5000, exactly', async () => {
    const opp = (description: string) => ({
      orgId: ORG, orgName: 'Org One', title: 'Boundary probe', description,
      location: 'North York', category: 'Environment', requirements: '',
      maxVolunteers: 5, skillsNeeded: [], exclusives: [],
      timeCommitment: 'One-time', isVirtual: false,
      dateTime: new Date('2026-09-01T13:00:00Z'), createdAt: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(asUser(ORG), 'opportunities', 'b_desc_ok'), opp('x'.repeat(5000))));
    await assertFails(setDoc(doc(asUser(ORG), 'opportunities', 'b_desc_over'), opp('x'.repeat(5001))));
  });

  test('an opportunity title is capped at 100, exactly', async () => {
    const opp = (title: string) => ({
      orgId: ORG, orgName: 'Org One', title, description: 'd',
      location: 'North York', category: 'Environment', requirements: '',
      maxVolunteers: 5, skillsNeeded: [], exclusives: [],
      timeCommitment: 'One-time', isVirtual: false,
      dateTime: new Date('2026-09-01T13:00:00Z'), createdAt: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(asUser(ORG), 'opportunities', 'b_title_ok'), opp('x'.repeat(100))));
    await assertFails(setDoc(doc(asUser(ORG), 'opportunities', 'b_title_over'), opp('x'.repeat(101))));
  });

  test('a report description is capped at 5000, exactly', async () => {
    const report = (description: string) => ({
      reportingUserId: STUDENT, reportingUserEmail: `${STUDENT}@example.com`,
      reportedUserId: ORG, reason: 'Concern', description, status: 'pending',
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(asUser(STUDENT), 'reports', 'b_rep_ok'), report('x'.repeat(5000))));
    await assertFails(setDoc(doc(asUser(STUDENT), 'reports', 'b_rep_over'), report('x'.repeat(5001))));
  });

  test('a resume is capped at 400000, exactly', async () => {
    await assertSucceeds(updateDoc(doc(asUser(STUDENT), 'students', STUDENT), {
      resumeUrl: 'd'.repeat(400000),
    }));
    await assertFails(updateDoc(doc(asUser(STUDENT), 'students', STUDENT), {
      resumeUrl: 'd'.repeat(400001),
    }));
  });
});

// ───────────── organization type, including the free-text answer ─────────────

test.describe('organizationType and its "Other" free text', () => {
  const org = (extra: Record<string, unknown>) => ({
    uid: 'new_typed_org', organizationName: 'Typed Org', contactEmail: 't@example.com',
    northYorkConfirmed: true, ...extra,
  });

  test('a type and its free-text specification are both accepted', async () => {
    await assertSucceeds(setDoc(doc(asUser('new_typed_org'), 'organizations', 'new_typed_org'),
      org({ organizationType: 'Other', organizationTypeOther: 'Student-run repair café' })));
  });

  test('a for-profit organization can register', async () => {
    // Ontario boards disagree about commercial settings, and that is a matter
    // for a student's principal, not for the database. The platform records
    // what an organization IS; it does not adjudicate eligibility.
    await assertSucceeds(setDoc(doc(asUser('fp_org'), 'organizations', 'fp_org'),
      { ...org({ organizationType: 'For-profit organization' }), uid: 'fp_org' }));
  });

  test('the free-text answer is capped like every other free-text field', async () => {
    await assertSucceeds(setDoc(doc(asUser('cap_ok'), 'organizations', 'cap_ok'),
      { ...org({ organizationType: 'Other', organizationTypeOther: 'x'.repeat(80) }), uid: 'cap_ok' }));
    await assertFails(setDoc(doc(asUser('cap_over'), 'organizations', 'cap_over'),
      { ...org({ organizationType: 'Other', organizationTypeOther: 'x'.repeat(81) }), uid: 'cap_over' }));
  });

  test('the type itself is capped, so the field cannot become free storage', async () => {
    await assertFails(setDoc(doc(asUser('type_over'), 'organizations', 'type_over'),
      { ...org({ organizationType: 'x'.repeat(81) }), uid: 'type_over' }));
  });

  test('an organization can change its type later', async () => {
    await assertSucceeds(updateDoc(doc(asUser(ORG), 'organizations', ORG), {
      organizationType: 'Other', organizationTypeOther: 'Neighbourhood tool library',
    }));
  });
});

// ───────── an organization must be approved before it can publish ─────────

test.describe('opportunity posting is gated on real verification', () => {
  const opp = (orgId: string) => ({
    orgId, orgName: 'Org One', title: 'Beach cleanup', description: 'Pick up litter',
    location: 'North York', category: 'Environment', requirements: '', maxVolunteers: 5,
    skillsNeeded: [], exclusives: [], timeCommitment: 'One-time', isVirtual: false,
    dateTime: new Date('2026-09-01T13:00:00Z'), createdAt: serverTimestamp(),
  });

  const setStatus = (status: string) =>
    seed(async (db) => { await updateDoc(doc(db, 'organizations', ORG), { verificationStatus: status }); });

  test('an UNVERIFIED organization cannot publish', async () => {
    // The hole this closes. isVerifiedOrg() checked role, ban status and MFA and
    // never looked at verificationStatus, so anyone who registered as an
    // organization could put an opportunity in front of minors within a minute
    // of signing up, with no person ever reviewing it.
    await setStatus('unverified');
    await assertFails(setDoc(doc(asUser(ORG), 'opportunities', 'unver_opp'), opp(ORG)));
  });

  test('an organization AWAITING review cannot publish yet', async () => {
    await setStatus('pending');
    await assertFails(setDoc(doc(asUser(ORG), 'opportunities', 'pending_opp'), opp(ORG)));
  });

  test('a REJECTED organization cannot publish', async () => {
    await setStatus('rejected');
    await assertFails(setDoc(doc(asUser(ORG), 'opportunities', 'rejected_opp'), opp(ORG)));
  });

  test('a VERIFIED organization can publish', async () => {
    await setStatus('verified');
    await assertSucceeds(setDoc(doc(asUser(ORG), 'opportunities', 'verified_opp'), opp(ORG)));
  });

  test('an organization that loses verification cannot keep editing a live posting', async () => {
    await setStatus('verified');
    await assertSucceeds(setDoc(doc(asUser(ORG), 'opportunities', 'live_opp'), opp(ORG)));
    await setStatus('rejected');
    await assertFails(updateDoc(doc(asUser(ORG), 'opportunities', 'live_opp'), { title: 'Edited after rejection' }));
  });

  test('...but it can still withdraw its own posting', async () => {
    // Deleting is the one thing a rejected organization SHOULD be able to do:
    // it removes their listing from in front of students, which is the outcome
    // everyone wants. Blocking it would strand the posting.
    await setStatus('verified');
    await assertSucceeds(setDoc(doc(asUser(ORG), 'opportunities', 'withdraw_opp'), opp(ORG)));
    await setStatus('rejected');
    await assertSucceeds(deleteDoc(doc(asUser(ORG), 'opportunities', 'withdraw_opp')));
  });

});

// ───────────────── minAge, the new eligibility field ─────────────────

test.describe('minAge on an opportunity', () => {
  const opp = (extra: Record<string, unknown>) => ({
    orgId: ORG, orgName: 'Org One', title: 'Age gated', description: 'd',
    location: 'l', category: 'Environment', requirements: '', maxVolunteers: 5,
    skillsNeeded: [], exclusives: [], timeCommitment: 'One-time', isVirtual: false,
    dateTime: new Date('2026-09-01T13:00:00Z'), createdAt: serverTimestamp(), ...extra,
  });

  test('a sensible minimum age is accepted, and absent is fine', async () => {
    await assertSucceeds(setDoc(doc(asUser(ORG), 'opportunities', 'age_16'), opp({ minAge: 16 })));
    await assertSucceeds(setDoc(doc(asUser(ORG), 'opportunities', 'age_none'), opp({})));
  });

  test('it must be a whole number in a sane range', async () => {
    await assertFails(setDoc(doc(asUser(ORG), 'opportunities', 'age_neg'), opp({ minAge: -1 })));
    await assertFails(setDoc(doc(asUser(ORG), 'opportunities', 'age_huge'), opp({ minAge: 999 })));
    await assertFails(setDoc(doc(asUser(ORG), 'opportunities', 'age_str'), opp({ minAge: '16' })));
    await assertFails(setDoc(doc(asUser(ORG), 'opportunities', 'age_frac'), opp({ minAge: 16.5 })));
  });

  test('it can be changed later', async () => {
    // The failure this guards against: a field added to the form but not to the
    // update allowlist makes every edit fail with permission-denied. That has
    // already happened twice in this file — with updatedAt, and with the
    // 'reviewed' status — and both times it passed locally because demo mode
    // never reaches Firestore.
    await assertSucceeds(setDoc(doc(asUser(ORG), 'opportunities', 'age_edit'), opp({ minAge: 14 })));
    await assertSucceeds(updateDoc(doc(asUser(ORG), 'opportunities', 'age_edit'), { minAge: 18 }));
  });
});

// ───────────────── the public counters ─────────────────

test.describe('metrics/public', () => {
  test('anyone can read the public counters, including a signed-out visitor', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'metrics', 'public'), { hoursConfirmed: 120, verifiedOrganizations: 3 });
    });
    // The landing page states this figure about itself, so it has to be
    // readable before anyone signs in.
    await assertSucceeds(getDoc(doc(asAnon(), 'metrics', 'public')));
    await assertSucceeds(getDoc(doc(asUser(STUDENT), 'metrics', 'public')));
  });

  test('nobody can write them from a browser', async () => {
    await assertFails(setDoc(doc(asUser(STUDENT), 'metrics', 'public'), { hoursConfirmed: 999999 }));
    await assertFails(setDoc(doc(asUser(ORG), 'metrics', 'public'), { hoursConfirmed: 999999 }));
    // Not even a developer: this is a server-computed aggregate, and a
    // hand-edited counter is worse than no counter.
    await assertFails(setDoc(doc(asUser(DEV), 'metrics', 'public'), { hoursConfirmed: 999999 }));
  });

  test('no other document in the collection is readable', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'metrics', 'internal'), { secret: true });
    });
    await assertFails(getDoc(doc(asAnon(), 'metrics', 'internal')));
    await assertFails(getDoc(doc(asUser(STUDENT), 'metrics', 'internal')));
  });
});

// ───────────── recovery codes are server-only ─────────────

test.describe('mfaBackupCodes', () => {
  test('nobody can read the hashes — not even their owner', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'mfaBackupCodes', STUDENT), { hashes: [{ hash: 'abc', usedAt: null }] });
    });
    // Reading your own document would leak the hashes, and hashes are the only
    // thing standing between a database copy and a working second factor.
    await assertFails(getDoc(doc(asUser(STUDENT), 'mfaBackupCodes', STUDENT)));
    await assertFails(getDoc(doc(asUser(DEV), 'mfaBackupCodes', STUDENT)));
    await assertFails(getDoc(doc(asAnon(), 'mfaBackupCodes', STUDENT)));
  });

  test('nobody can write them either', async () => {
    // A write would let someone mark a spent code unused and replay it.
    await assertFails(setDoc(doc(asUser(STUDENT), 'mfaBackupCodes', STUDENT), { hashes: [] }));
    await assertFails(setDoc(doc(asUser(DEV), 'mfaBackupCodes', STUDENT), { hashes: [] }));
  });
});
