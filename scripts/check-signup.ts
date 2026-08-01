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
import { initializeFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
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

async function run(role: 'student' | 'organization') {
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
}

async function cleanup() {
  const a: any = (admin as any).default || admin;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) {
    console.log(`[WARN] no service account key — leaving throwaway accounts: ${uids.join(', ')}`);
    return;
  }
  const adminApp = a.initializeApp({ credential: a.credential.cert(JSON.parse(key)) }, 'cleanup');
  const adb = adminApp.firestore();
  adb.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });
  for (const uid of uids) {
    await adminApp.auth().deleteUser(uid).catch(() => {});
    for (const c of ['users', 'students', 'organizations']) {
      await adb.collection(c).doc(uid).delete().catch(() => {});
    }
  }
  console.log(`[INFO] cleaned up ${uids.length} throwaway account(s)`);
}

(async () => {
  let failed = false;
  try {
    await run('student');
    await run('organization');
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
