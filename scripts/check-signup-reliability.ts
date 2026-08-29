/**
 * Register ten students and ten organisations in a row. Every one must work.
 *
 *   npm run check:reliability
 *   npm run check:reliability -- --rounds 25
 *
 * The review asked for this directly: create accounts ten times without a
 * single error, and only then call signup done. It is a different question from
 * the one check:signup answers. That proves a signup CAN succeed; this proves it
 * succeeds EVERY time — which is the question that matters when thirty students
 * arrive from one classroom in the same ten minutes.
 *
 * Repetition finds a specific family of bug that a single pass cannot:
 *
 *   - anything that collides because two accounts were made in the same
 *     millisecond, or in the same second
 *   - a rate limit nobody knew was there
 *   - a race between creating the auth record and writing the profile
 *   - state left behind by the previous run that the next one trips over
 *   - a quota that a single test never approaches
 *
 * Every account goes through the CLIENT SDK, so firestore.rules is enforced
 * exactly as it is for a browser. Everything is deleted afterwards, including on
 * failure.
 */
import './env';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeFirestore, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import adminNs from 'firebase-admin';

const admin: any = (adminNs as any).default ?? adminNs;

const roundsArg = process.argv.indexOf('--rounds');
const ROUNDS = roundsArg !== -1 ? Math.max(1, Number(process.argv[roundsArg + 1]) || 10) : 10;

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});
const db = initializeFirestore(app, {}, process.env.VITE_FIREBASE_DATABASE_ID!);
const auth = getAuth(app);

const PASSWORD = 'reliability!Check123';
const stamp = Date.now();
const uids: string[] = [];

let adminApp: any = null;
let adminDb: any = null;
function adminHandle() {
  if (adminApp) return adminApp;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is required');
  adminApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(key)) }, 'check-reliability');
  return adminApp;
}
async function adminDbHandle() {
  if (adminDb) return adminDb;
  const { getFirestore } = await import('firebase-admin/firestore');
  const dbId = process.env.FIREBASE_DATABASE_ID;
  adminDb = dbId ? getFirestore(adminHandle(), dbId) : getFirestore(adminHandle());
  return adminDb;
}

interface Failure { round: number; role: string; step: string; message: string }
const failures: Failure[] = [];
const timings: number[] = [];

/** One registration, exactly as Signup.tsx performs it. */
async function register(role: 'student' | 'organization', round: number) {
  const started = Date.now();
  const email = `reliab_${role}_${round}_${stamp}@example.com`;
  let step = 'create auth account';
  try {
    await signOut(auth).catch(() => {});
    const { user } = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    uids.push(user.uid);

    step = 'write users document';
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid, email, role,
      twoFactorEnabled: role === 'organization',
      createdAt: serverTimestamp(),
    });

    step = 'write profile document';
    if (role === 'student') {
      await setDoc(doc(db, 'students', user.uid), {
        uid: user.uid, fullName: `Reliability ${round}`, school: '', grade: '11',
        gender: 'other', neighborhood: 'Willowdale',
        interests: [], skills: [], availability: [], resumeUrl: '',
      });
    } else {
      await setDoc(doc(db, 'organizations', user.uid), {
        uid: user.uid, organizationName: `Reliability Org ${round}`, mission: 'm',
        organizationType: 'Non-profit organization', address: 'a', coordinates: null,
        contactEmail: email, phone: '', northYorkConfirmed: true, websiteUrl: '',
        hasCra: false, craNumber: '', craVerified: false, verificationStatus: 'unverified',
      });
    }

    // Read it back. A write that the rules accepted but that did not land is
    // the failure this whole script exists to catch, and it is invisible
    // without a read.
    step = 'read the profile back';
    const back = await getDoc(doc(db, role === 'student' ? 'students' : 'organizations', user.uid));
    if (!back.exists()) throw new Error('the profile document was not there when read back');

    timings.push(Date.now() - started);
  } catch (err: any) {
    failures.push({
      round, role, step,
      message: `${err?.code ? err.code + ' ' : ''}${err?.message || err}`,
    });
  }
}

(async () => {
  console.log(`Registering ${ROUNDS} students and ${ROUNDS} organisations, one after another.\n`);

  for (let round = 1; round <= ROUNDS; round++) {
    await register('student', round);
    await register('organization', round);
    const done = round * 2;
    const bad = failures.length;
    process.stdout.write(`\r  ${done}/${ROUNDS * 2} accounts — ${bad} failure${bad === 1 ? '' : 's'}   `);
  }
  process.stdout.write('\n\n');

  if (timings.length) {
    const sorted = [...timings].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const slowest = sorted[sorted.length - 1];
    console.log(`[INFO] median ${median} ms per registration, slowest ${slowest} ms`);
  }

  // Cleanup runs whatever happened. A reliability check that leaves twenty
  // accounts behind has made the next run less reliable.
  try {
    const adb = await adminDbHandle();
    for (const uid of uids) {
      for (const c of ['users', 'students', 'organizations']) {
        await adb.collection(c).doc(uid).delete().catch(() => {});
      }
      await adminHandle().auth().deleteUser(uid).catch(() => {});
    }
    console.log(`[INFO] cleaned up ${uids.length} account(s)`);
  } catch (err: any) {
    console.warn(`[WARN] cleanup incomplete: ${err?.message || err}`);
  }

  if (failures.length === 0) {
    console.log(`\n[PASS] ${ROUNDS * 2} consecutive registrations, 0 failures`);
    process.exit(0);
  }

  console.error(`\n[FAIL] ${failures.length} of ${ROUNDS * 2} registrations failed:`);
  for (const f of failures) {
    console.error(`   round ${f.round} ${f.role} — during "${f.step}": ${f.message}`);
  }
  process.exit(1);
})();
