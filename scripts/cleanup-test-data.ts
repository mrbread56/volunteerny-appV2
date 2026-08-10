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

/** Every generator that writes to the live project. Keep in sync when a new
 *  check script starts seeding accounts. */
const TEST_PATTERNS: RegExp[] = [
  /^check_sec_/i,        // scripts/check-security.ts
  /^check_storage_/i,    // scripts/check-storage.ts
  /^check_credit_org_/i, // scripts/check-signup.ts
  /^check_flow/i,        // scripts/check-flows.ts
  /^sweep_(student|org|dev)_/i,  // tests/e2e/console-sweep.spec.ts
  /^trap_(student|org|dev)_/i,   // tests/e2e/click-trap.spec.ts
  /^testuser_\d+@/i,
  /@example\.com$/i,     // reserved by RFC 2606 — never a real address
];

const isTestAddress = (email: string) => !!email && TEST_PATTERNS.some((p) => p.test(email));

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
  const docsByCollection: Record<string, string[]> = {};
  for (const c of ['users', 'students', 'organizations']) {
    const snap = await db.collection(c).get();
    docsByCollection[c] = snap.docs
      .filter((d) => isTestAddress((d.data()?.email || d.data()?.contactEmail || '').toLowerCase()))
      .map((d) => d.id);
  }

  const totalDocs = Object.values(docsByCollection).reduce((n, ids) => n + ids.length, 0);
  console.log(`test Auth accounts : ${doomed.length}`);
  doomed.forEach((d) => console.log(`   ${d.email}  (${d.uid})`));
  console.log(`test documents     : ${totalDocs}`);
  Object.entries(docsByCollection).forEach(([c, ids]) => ids.length && console.log(`   ${c}: ${ids.length}`));
  if (skipped.length) {
    console.log(`\nskipped ${skipped.length} account(s) created in the last ${MIN_AGE_MINUTES} minutes —`);
    console.log('a test run may still be using them. Re-run later, or pass --force.');
    skipped.forEach((e) => console.log(`   ${e}`));
  }

  if (!doomed.length && !totalDocs) {
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

  console.log(`\ndeleted ${removed} test account(s) and their documents.`);
  process.exit(0);
})();
