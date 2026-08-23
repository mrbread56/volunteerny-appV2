/**
 * Sweep test accounts out of the live project.
 *
 *   npm run cleanup:test-data              # list what WOULD be deleted
 *   npm run cleanup:test-data -- --confirm # actually delete it
 *
 * Why this exists: .firebaserc names one Firebase project, so every check
 * script — check:security, check:flows, check:signup, check:storage, and the
 * Playwright suites — creates real Auth accounts and Firestore documents in the
 * SAME database real students use. Each cleans up in a `finally`, but a
 * cancelled run, a crash, or CI's cancel-in-progress leaves them behind. That is
 * where the check_sec_* accounts found in production came from.
 *
 * The proper fix is a second Firebase project for tests. Until that exists, this
 * is the janitor.
 *
 * It is deliberately conservative:
 *   - it matches only the fixed prefixes the test scripts generate, plus
 *     @example.com, which is a reserved domain that can never be a real student;
 *   - it NEVER touches an address outside those patterns;
 *   - it lists by default and deletes only with --confirm;
 *   - it deletes the Auth identity FIRST, so a failure leaves documents without
 *     a sign-in (recoverable) rather than a sign-in without a profile (a new
 *     orphan, which is the thing we are cleaning up).
 */
import './env';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { TEST_PATTERNS, isTestAddress } from '../server/testAccounts';

const a: any = (admin as any).default || admin;
const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!key) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
  process.exit(1);
}
const sa = JSON.parse(key);
const app = a.initializeApp({ credential: a.credential.cert(sa) });
const db = getFirestore(app.app ? app.app() : app, process.env.FIREBASE_DATABASE_ID!);

const CONFIRM = process.argv.includes('--confirm');
const FORCE = process.argv.includes('--force');

/**
 * Do not delete accounts a test is still using.
 *
 * Learned the hard way: this script was run while a Playwright suite was
 * mid-flight and deleted the accounts that suite had just seeded, failing a run
 * that was otherwise fine. A stranded account is harmless for another hour; a
 * cleanup that races the test suite makes runs flaky for reasons nobody will
 * connect back to here. Anything younger than this is left alone unless --force.
 */
const MIN_AGE_MINUTES = 30;
const tooYoung = (creationTime?: string) => {
  if (FORCE || !creationTime) return false;
  return Date.now() - new Date(creationTime).getTime() < MIN_AGE_MINUTES * 60_000;
};

/** The patterns and the matcher now live in server/testAccounts.ts, because
 *  the metrics code needs the same answer to "is this a fixture?" and two
 *  hand-synced copies of a list like this drift the moment someone is in a
 *  hurry. Add new check-script prefixes THERE, not here. */
void TEST_PATTERNS; // re-exported for callers that import it from this module

(async () => {
  // ── Auth identities ──
  const doomed: { uid: string; email: string }[] = [];
  const skipped: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await app.auth().listUsers(1000, pageToken);
    for (const u of page.users) {
      const email = (u.email || '').toLowerCase();
      if (!isTestAddress(email)) continue;
      if (tooYoung(u.metadata?.creationTime)) {
        skipped.push(email);
        continue;
      }
      doomed.push({ uid: u.uid, email });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  // ── Firestore documents, including any whose Auth account is already gone ──
  //
  // A students/{uid} document has NO email field — the address lives on
  // users/{uid}. So matching each document against its own email, as this used
  // to, meant student profiles never matched and were never swept. Two
  // consequences, both caught by check:integrity:
  //
  //   * A profile whose account was already gone stayed forever. The adversarial
  //     fixture "Forged Total", carrying hours: 999999, outlived every run.
  //   * Deleting the users document first ORPHANED the profile, so the janitor
  //     manufactured exactly the drift it exists to remove.
  //
  // The address is therefore resolved through the sibling users document, and
  // the sweep is computed BEFORE anything is deleted so the join still resolves.
  const usersSnap = await db.collection('users').get();
  const emailByUid = new Map<string, string>(
    usersSnap.docs.map((d) => [d.id, String(d.data()?.email || '').toLowerCase()]),
  );

  const docsByCollection: Record<string, string[]> = {};
  for (const c of ['users', 'students', 'organizations']) {
    const snap = await db.collection(c).get();
    docsByCollection[c] = snap.docs
      .filter((d) => {
        const own = String(d.data()?.email || d.data()?.contactEmail || '').toLowerCase();
        return isTestAddress(own) || isTestAddress(emailByUid.get(d.id) || '');
      })
      .map((d) => d.id);
  }

  // Whatever is being removed from one collection is removed from all three, so
  // a cleanup can never leave half an identity behind.
  const doomedUids = new Set<string>([
    ...doomed.map((d) => d.uid),
    ...Object.values(docsByCollection).flat(),
  ]);
  for (const c of ['users', 'students', 'organizations']) {
    docsByCollection[c] = [...doomedUids];
  }

  const totalDocs = doomedUids.size;
  console.log(`test Auth accounts : ${doomed.length}`);
  doomed.forEach((d) => console.log(`   ${d.email}  (${d.uid})`));
  console.log(`test documents     : ${totalDocs}`);
  console.log(`   identities swept across users/students/organizations: ${doomedUids.size}`);
  if (skipped.length) {
    console.log(`\nskipped ${skipped.length} account(s) created in the last ${MIN_AGE_MINUTES} minutes —`);
    console.log('a test run may still be using them. Re-run later, or pass --force.');
    skipped.forEach((e) => console.log(`   ${e}`));
  }

  // --orphans is a separate sweep with its own findings, so an empty test sweep
  // must not exit before it has run.
  if (!doomed.length && !totalDocs && !process.argv.includes('--orphans')) {
    console.log('\nnothing to clean up.');
    process.exit(0);
  }
  if (!CONFIRM) {
    console.log('\nDRY RUN — nothing was deleted. Re-run with --confirm to delete the above.');
    process.exit(0);
  }

  let removed = 0;
  for (const { uid, email } of doomed) {
    try {
      await app.auth().deleteUser(uid);
    } catch (e: any) {
      if (e?.code !== 'auth/user-not-found') {
        console.error(`  FAILED to delete auth for ${email}: ${e?.code}`);
        continue; // leave the documents alone rather than orphan the identity
      }
    }
    for (const c of ['users', 'students', 'organizations']) {
      await db.collection(c).doc(uid).delete().catch(() => {});
    }
    removed++;
  }
  // Documents whose Auth account had already vanished.
  for (const [c, ids] of Object.entries(docsByCollection)) {
    for (const id of ids) await db.collection(c).doc(id).delete().catch(() => {});
  }

  // ── Unreachable documents, behind --orphans ──
  //
  // A profile with no users document AND no Auth identity cannot be signed in
  // to by anyone, ever. Its origin does not matter: it is not recoverable and
  // it is not addressable. The email-matching sweep above cannot see these,
  // because the address it would match on lived in the users document that is
  // already gone — which is exactly how six fixtures from console-sweep,
  // click-trap and check-security accumulated.
  //
  // Behind a flag rather than automatic, because "cannot be signed in to" is an
  // inference and this deletes real documents. It prints what it will remove.
  if (process.argv.includes('--orphans')) {
    const liveUsers = new Set((await db.collection('users').get()).docs.map((d: any) => d.id));
    const unreachable: { col: string; id: string; label: string }[] = [];

    for (const col of ['students', 'organizations']) {
      const snap = await db.collection(col).get();
      for (const d of snap.docs) {
        if (liveUsers.has(d.id)) continue;
        const hasAuth = await app.auth().getUser(d.id).then(() => true).catch(() => false);
        if (hasAuth) continue;
        const x = d.data();
        unreachable.push({
          col, id: d.id,
          label: `${x?.fullName || x?.organizationName || '(unnamed)'} — ${(x?.loggedHours || []).length} logged entr(ies)`,
        });
      }
    }

    // An opportunity whose organization no longer exists.
    //
    // The account-deletion cascade removes these, but a test that deletes an
    // org straight through the Admin SDK bypasses it — and two such postings
    // survived every sweep here, still carrying accepted applications from
    // students who were themselves deleted. check:integrity now names this
    // class explicitly (invariant 2b); this is what actually removes it.
    //
    // These are not merely untidy. The applications `list` rule proves
    // ownership by reading the parent opportunity, and the applicants screen
    // resolves the organization for its header — so an ownerless posting stays
    // visible to students, cannot be managed by anyone, and cannot be withdrawn.
    const liveOrgs = new Set((await db.collection('organizations').get()).docs.map((d: any) => d.id));
    for (const d of (await db.collection('opportunities').get()).docs) {
      const orgId = d.data()?.orgId;
      if (orgId && liveOrgs.has(orgId)) continue;
      unreachable.push({
        col: 'opportunities', id: d.id,
        label: `"${d.data()?.title ?? '(untitled)'}" — organization ${orgId} no longer exists`,
      });
    }

    // Applications pointing at an opportunity that is gone, for the same reason.
    const liveOpps = new Set((await db.collection('opportunities').get()).docs.map((d: any) => d.id));
    for (const d of (await db.collection('applications').get()).docs) {
      const oppId = d.data()?.opportunityId;
      if (oppId && liveOpps.has(oppId)) continue;
      unreachable.push({
        col: 'applications', id: d.id,
        label: `application to a deleted opportunity ${oppId}`,
      });
    }

    // The reverse: an account document whose identity is gone and which has no
    // profile. Same reasoning, same irrecoverability.
    for (const d of (await db.collection('users').get()).docs) {
      const hasAuth = await app.auth().getUser(d.id).then(() => true).catch(() => false);
      if (hasAuth) continue;
      const role = d.data()?.role;
      const profileCol = role === 'organization' ? 'organizations' : 'students';
      const hasProfile = (await db.collection(profileCol).doc(d.id).get()).exists;
      if (hasProfile) continue;
      unreachable.push({ col: 'users', id: d.id, label: `${d.data()?.email || '(no email)'} (${role})` });
    }

    if (!unreachable.length) {
      console.log('\nno unreachable documents.');
    } else {
      console.log(`\nunreachable documents (no account, no sign-in identity): ${unreachable.length}`);
      unreachable.forEach((u) => console.log(`   ${u.col}/${u.id}  ${u.label}`));
      for (const u of unreachable) await db.collection(u.col).doc(u.id).delete().catch(() => {});
      console.log(`deleted ${unreachable.length} unreachable document(s).`);
    }

    // Dependent rows pointing at an identity that no longer exists. Same
    // reasoning again: an hours request belonging to a deleted student can
    // never be approved, viewed or acted on by anybody, and it keeps
    // check:integrity reporting an approved request that credited nothing.
    const survivingStudents = new Set((await db.collection('students').get()).docs.map((d: any) => d.id));
    const survivingOrgs = new Set((await db.collection('organizations').get()).docs.map((d: any) => d.id));
    const danglers: string[] = [];

    for (const [col, key, alive] of [
      ['hoursRequests', 'studentId', survivingStudents],
      ['applications', 'studentId', survivingStudents],
      ['savedOpportunities', 'studentId', survivingStudents],
      ['interestRequests', 'studentId', survivingStudents],
      ['opportunities', 'orgId', survivingOrgs],
    ] as [string, string, Set<string>][]) {
      const snap = await db.collection(col).get().catch(() => null);
      if (!snap) continue;
      for (const d of snap.docs) {
        const owner = d.data()?.[key];
        if (!owner || alive.has(owner)) continue;
        const hasAuth = await app.auth().getUser(owner).then(() => true).catch(() => false);
        if (hasAuth) continue; // the identity survives; leave the row alone
        danglers.push(`${col}/${d.id}`);
        await db.collection(col).doc(d.id).delete().catch(() => {});
      }
    }
    if (danglers.length) {
      console.log(`
dangling rows whose owner no longer exists: ${danglers.length}`);
      danglers.forEach((x) => console.log(`   ${x}`));
    }
  }

  console.log(`\ndeleted ${removed} test account(s) and their documents.`);
  process.exit(0);
})();
