/**
 * Every list/query the signed-in app performs, run through the *client* SDK so
 * security rules are enforced exactly as they are in a browser.
 *
 *   npm run check:queries
 *
 * This exists because a rule can pass every single-document test and still deny
 * every query. `isValidId(<path wildcard>)` in a read rule is the trap: on a
 * list operation the wildcard has no value, matches() errors, and the query is
 * denied — which silently emptied the student dashboard, the organization
 * directory and the hours list. Nothing else in the suite exercises a list.
 *
 * Creates a throwaway student with the Admin SDK, queries as that student, and
 * deletes it afterwards.
 */
import './env';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  initializeFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import * as admin from 'firebase-admin';


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

const a: any = (admin as any).default || admin;
const EMAIL = `check_queries_${Date.now()}@example.com`;
const PASSWORD = 'checkQueries!123';

(async () => {
  const adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    'check-queries'
  );
  const adb = adminApp.firestore();
  adb.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const created = await adminApp.auth().createUser({ email: EMAIL, password: PASSWORD });
  const uid = created.uid;
  await adb.collection('users').doc(uid).set({
    uid, email: EMAIL, role: 'student', twoFactorEnabled: false,
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });
  await adb.collection('students').doc(uid).set({
    uid, fullName: 'Check Queries', school: '', grade: '11', neighborhood: '',
    interests: [], skills: [], availability: [], resumeUrl: '',
  });

  await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);

  // Mirrors the queries in StudentDashboard, StudentOpportunities, FeedbackPage
  // and the hours-logging form.
  const queries: [string, any][] = [
    ['applications (mine)', query(collection(db, 'applications'), where('studentId', '==', uid), orderBy('appliedAt', 'desc'), limit(50))],
    ['organizations (directory)', collection(db, 'organizations')],
    ['hoursRequests (mine)', query(collection(db, 'hoursRequests'), where('studentId', '==', uid))],
    ['savedOpportunities (mine)', query(collection(db, 'savedOpportunities'), where('studentId', '==', uid), limit(5))],
    ['opportunities (browse)', query(collection(db, 'opportunities'), orderBy('createdAt', 'desc'), limit(50))],
    ['feedbacks (mine)', query(collection(db, 'feedbacks'), where('userId', '==', uid))],
    ['leaderboards', collection(db, 'leaderboards')],
  ];

  let failures = 0;
  for (const [label, q] of queries) {
    try {
      const snap = await getDocs(q);
      console.log(`[PASS] ${label} — ${snap.size} doc(s)`);
    } catch (err: any) {
      failures++;
      console.log(`[FAIL] ${label} — ${err.code}`);
      if (err.code === 'permission-denied') {
        console.log('       fix: the read rule for this collection is not list-safe. Split it into');
        console.log('            `allow get` (may use isValidId) and `allow list` (must not).');
      }
    }
  }

  await adminApp.auth().deleteUser(uid).catch(() => {});
  for (const c of ['users', 'students']) await adb.collection(c).doc(uid).delete().catch(() => {});

  console.log(`\n${failures} failure(s).`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('FATAL', err?.code || '', err?.message || err);
  process.exit(1);
});
