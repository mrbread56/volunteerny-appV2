/**
 * End-to-end signup + login check, run against the real project.
 *
 *   npm run check:signup
 *
 * This exists because the failure it guards was invisible to every other test:
 * the Admin SDK bypasses security rules, so admin-written test fixtures always
 * succeeded while every real browser signup was denied. This uses the *client*
 * SDK, so the rules are enforced exactly as they are for a user.
 *
 * It walks the path that was broken end to end — create the account, write both
 * profile documents with the exact payload Signup.tsx sends, sign out, then sign
 * back in with the same credentials — and deletes the throwaway account after.
 * If the rules ever regress to `data.field == null` on an optional field, the
 * students/organizations write here fails and this exits non-zero.
 */
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { totalLoggedHours } from '../src/lib/hours';
import * as admin from 'firebase-admin';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config();

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

const PASSWORD = 'checkSignup!123';
const uids: string[] = [];

async function run(role: 'student' | 'organization'): Promise<string> {
  const email = `check_signup_${role}_${Date.now()}@example.com`;
  const { user } = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  uids.push(user.uid);
  const uid = user.uid;

  // Exactly what Signup.tsx writes — no extra fields. The bug was that the
  // fields it omits made the rule error out and deny.
  await setDoc(doc(db, 'users', uid), {
    uid,
    email,
    role,
    twoFactorEnabled: role === 'organization',
    createdAt: serverTimestamp(),
  });

  if (role === 'student') {
    await setDoc(doc(db, 'students', uid), {
      uid,
      fullName: 'Check Signup',
      school: '',
      grade: '10',
      neighborhood: '',
      interests: [],
      skills: [],
      availability: [],
      resumeUrl: '',
      passportUrl: '',
    });
  } else {
    await setDoc(doc(db, 'organizations', uid), {
      uid,
      organizationName: 'Check Signup Org',
      mission: 'Checking that organization signup works.',
      organizationType: 'Other',
      address: '123 Test St',
      coordinates: null,
      contactEmail: email,
      phone: '',
      northYorkConfirmed: false,
      websiteUrl: '',
      hasCra: null,
      craNumber: '',
      craVerified: false,
      verificationStatus: 'unverified',
    });
  }

  // The reported symptom: sign out, then sign back in with the same password.
  await signOut(auth);
  const back = await signInWithEmailAndPassword(auth, email, PASSWORD);
  assert.equal(back.user.uid, uid, 'signed back in as a different account');

  const profile = await getDoc(doc(db, 'users', uid));
  assert.ok(profile.exists(), `users/${uid} missing after signup`);
  assert.equal(profile.data()!.role, role);

  const detail = await getDoc(doc(db, role === 'student' ? 'students' : 'organizations', uid));
  assert.ok(detail.exists(), `${role} profile document missing after signup`);

  console.log(`[PASS] ${role}: signup wrote both documents, and sign-in with the same password works`);

  if (role === 'student') {
    // Onboarding is the step immediately after signup, and it is a students
    // UPDATE, which is a different rule from the create above. It was denied
    // for every student because the payload included `loggedHours: []` — a
    // field only an organization may write — so the diff tripped the guard.
    await setDoc(
      doc(db, 'students', uid),
      {
        uid,
        fullName: 'Check Signup',
        school: 'Earl Haig Secondary School',
        grade: '11',
        neighborhood: 'Willowdale',
        interests: ['Environment'],
        skills: ['Leadership'],
        availability: ['Flexible'],
        previousExperience: 'Some experience',
        resumeUrl: '',
        passportUrl: '',
        trackerEnabled: true,
        trackerAnonymous: false,
      },
      { merge: true }
    );
    const onboarded = await getDoc(doc(db, 'students', uid));
    assert.equal(onboarded.data()!.school, 'Earl Haig Secondary School');
    console.log('[PASS] student: onboarding update saved');

    // The other half of the same rule: a student must never be able to write
    // their own verified hours. This is what the onboarding payload was
    // accidentally tripping. If this ever stops throwing, students can credit
    // themselves volunteer hours.
    console.log(
      '[INFO] the next PERMISSION_DENIED line is EXPECTED — it is this check ' +
        'confirming a student cannot write their own hours.'
    );
    let denied = false;
    try {
      await setDoc(doc(db, 'students', uid), { loggedHours: [{ hours: 500 }] }, { merge: true });
    } catch (err: any) {
      denied = err.code === 'permission-denied';
    }
    assert.ok(denied, 'a student was able to write their own loggedHours');
    console.log('[PASS] student: self-crediting loggedHours is still rejected');

    // `hours` is the denormalised total the leaderboard ranks on. Blocking only
    // the array would have left the scalar writable, i.e. any student could set
    // themselves to the top of the board without a single approved hour.
    let scoreDenied = false;
    try {
      await setDoc(doc(db, 'students', uid), { hours: 9999 }, { merge: true });
    } catch (err: any) {
      scoreDenied = err.code === 'permission-denied';
    }
    assert.ok(scoreDenied, 'a student was able to write their own leaderboard score');
    console.log('[PASS] student: self-setting the leaderboard score is rejected');
  }

  return uid;
}

// One admin handle, shared by the read-back below and by cleanup.
let adminDb: any = null;
function adminFirestore() {
  if (adminDb) return adminDb;
  const a: any = (admin as any).default || admin;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) return null;
  const adminApp = a.initializeApp({ credential: a.credential.cert(JSON.parse(key)) }, 'check-signup-admin');
  adminDb = adminApp.firestore();
  adminDb.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });
  adminDb.__app = adminApp;
  return adminDb;
}

async function cleanup() {
  const adb = adminFirestore();
  if (!adb) {
    console.log(`[WARN] no service account key — leaving throwaway accounts: ${uids.join(', ')}`);
    return;
  }
  const adminApp = adb.__app;
  for (const uid of uids) {
    await adminApp.auth().deleteUser(uid).catch(() => {});
    for (const c of ['users', 'students', 'organizations']) {
      await adb.collection(c).doc(uid).delete().catch(() => {});
    }
  }
  console.log(`[INFO] cleaned up ${uids.length} throwaway account(s)`);
}

/**
 * The other side of the same rule: an organization approving hours writes
 * loggedHours AND the denormalised `hours` total in ONE updateDoc, because the
 * leaderboard orders on that scalar. While the rule said
 * hasOnly(['loggedHours']) that combined write was rejected outright — so
 * widening it is the difference between approvals working and every approval
 * failing. That cannot be checked by reading the rule; it has to be run.
 */
async function checkOrgCreditsHours(studentUid: string) {
  const email = `check_credit_org_${Date.now()}@example.com`;
  const { user } = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  uids.push(user.uid);
  try {
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email,
      role: 'organization',
      twoFactorEnabled: true,
      createdAt: serverTimestamp(),
    });
  } catch (e: any) {
    console.error('   step that failed: org users setDoc', e.code, 'currentUser', auth.currentUser?.uid, 'target', user.uid);
    throw e;
  }

  const loggedHours = [{ id: 'log-check-1', activity: 'Check', hours: 2.5, date: '2026-01-01', approved: true }];
  // The write under test: rejected outright while the rule said
  // hasOnly(['loggedHours']).
  await updateDoc(doc(db, 'students', studentUid), {
    loggedHours,
    hours: totalLoggedHours(loggedHours),
  });

  // Read back with the Admin SDK, not the client. This one process has been
  // three different users in turn, and the client's cached listen on
  // students/{studentUid} is still the student's — reading it back as the org
  // fails here for that reason alone, which says nothing about the app (where
  // an org session is never also a student session). What we need to confirm
  // is what was persisted.
  const adb = adminFirestore();
  if (!adb) {
    console.log('[WARN] no service account key — skipping the credited-total read-back');
    return;
  }
  const credited = await adb.collection('students').doc(studentUid).get();
  assert.equal(credited.data()!.hours, 2.5, 'the org wrote loggedHours but not the ranked total');
  assert.equal(credited.data()!.loggedHours.length, 1, 'the org write did not land');
  console.log('[PASS] organization: approving hours writes loggedHours and the ranked total together');
}

(async () => {
  let failed = false;
  try {
    const studentUid = await run('student');
    await run('organization');
    await checkOrgCreditsHours(studentUid);
  } catch (err: any) {
    failed = true;
    console.error(`[FAIL] ${err?.code || ''} ${err?.message || err}`);
    if (err?.code === 'permission-denied') {
      console.error(
        '       fix: a firestore.rules validator is reading a field the client ' +
          'does not send. Use absent(data, "field"), never data.field == null. ' +
          'Then redeploy the rules.'
      );
    }
  }
  await cleanup();
  process.exit(failed ? 1 : 0);
})();
