/**
 * End-to-end journey check against the real project, through the CLIENT SDK so
 * firestore.rules is enforced exactly as it is for a browser.
 *
 *   npm run check:flows
 *
 * check-signup.ts proves an account can be created. This proves the app can
 * then be USED: post an opportunity, apply to it, accept the applicant, rate
 * the organization, request hours, approve them. Every one of those is a write
 * whose payload the rules validate field by field, and none of them were
 * covered — the orgId-on-applications bug (which broke ratings outright) and
 * the hasOnly(['loggedHours']) rule (which would have broken every hours
 * approval) both lived in exactly this gap.
 *
 * Everything is created fresh and deleted afterwards, including on failure.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  initializeFirestore, doc, collection, addDoc, getDoc, getDocs, setDoc,
  updateDoc, query, where, serverTimestamp,
} from 'firebase/firestore';
import * as admin from 'firebase-admin';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { totalLoggedHours } from '../src/lib/hours';

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

const PASSWORD = 'checkFlows!123';
const stamp = Date.now();
const uids: string[] = [];
const docs: { col: string; id: string }[] = [];

let adminDb: any = null;
function adminFirestore() {
  if (adminDb) return adminDb;
  const a: any = (admin as any).default || admin;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) return null;
  const adminApp = a.initializeApp({ credential: a.credential.cert(JSON.parse(key)) }, 'check-flows-admin');
  adminDb = adminApp.firestore();
  adminDb.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });
  adminDb.__app = adminApp;
  return adminDb;
}

async function signUpAs(role: 'student' | 'organization', tag = '') {
  const email = `check_flows_${role}${tag ? '_' + tag : ''}_${stamp}@example.com`;
  const { user } = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  uids.push(user.uid);
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid, email, role,
    twoFactorEnabled: role === 'organization',
    createdAt: serverTimestamp(),
  });
  if (role === 'student') {
    await setDoc(doc(db, 'students', user.uid), {
      uid: user.uid, fullName: 'Flow Student', school: 'Earl Haig Secondary School',
      grade: '11', neighborhood: 'Willowdale', interests: [], skills: [],
      availability: [], resumeUrl: '', passportUrl: '',
    });
  } else {
    await setDoc(doc(db, 'organizations', user.uid), {
      uid: user.uid, organizationName: 'Flow Org', mission: 'Checking the flows.',
      organizationType: 'Other', address: '5100 Yonge St', coordinates: null,
      contactEmail: email, phone: '', northYorkConfirmed: true, websiteUrl: '',
      hasCra: null, craNumber: '', craVerified: false, verificationStatus: 'unverified',
    });
  }
  return { uid: user.uid, email };
}

const as = (email: string) => signInWithEmailAndPassword(auth, email, PASSWORD);

(async () => {
  let failed = false;
  try {
    const org = await signUpAs('organization');
    const student = await signUpAs('student');
    console.log('[PASS] both accounts created through the client SDK');

    // ── org posts an opportunity ────────────────────────────────────────────
    await as(org.email);
    // The payload OrgOpportunityCreate sends. orgName carries the `|| ''` that
    // stops an unresolved orgProfile from writing undefined and failing the
    // whole addDoc.
    const oppRef = await addDoc(collection(db, 'opportunities'), {
      orgId: org.uid,
      orgName: '',
      title: 'Flow Check Opportunity',
      description: 'Created by npm run check:flows.',
      location: '5100 Yonge St',
      dateTime: new Date(Date.now() + 86400000).toISOString(),
      category: 'Community Services',
      requirements: '',
      maxVolunteers: 5,
      skillsNeeded: [],
      timeCommitment: 'Short-term',
      isVirtual: false,
      coordinates: { lat: 43.7615, lng: -79.4111 },
      createdAt: serverTimestamp(),
    });
    docs.push({ col: 'opportunities', id: oppRef.id });
    console.log('[PASS] organization: posted an opportunity');

    // ── student applies ─────────────────────────────────────────────────────
    await as(student.email);
    const appRef = await addDoc(collection(db, 'applications'), {
      opportunityId: oppRef.id,
      orgId: org.uid,
      studentId: student.uid,
      status: 'pending',
      appliedAt: serverTimestamp(),
      message: 'Flow check.',
      opportunityTitle: 'Flow Check Opportunity',
      studentName: 'Flow Student',
      previousExperience: '',
      resumeUrl: '',
    });
    docs.push({ col: 'applications', id: appRef.id });
    const applied = await getDoc(doc(db, 'applications', appRef.id));
    assert.equal(applied.data()!.orgId, org.uid, 'the application did not record which org it was for');
    console.log('[PASS] student: applied, and the application records orgId');

    // ── org sees it and accepts ─────────────────────────────────────────────
    await as(org.email);
    const inbox = await getDocs(query(collection(db, 'applications'), where('opportunityId', '==', oppRef.id)));
    assert.equal(inbox.size, 1, 'the organization cannot list applications to its own opportunity');
    await updateDoc(doc(db, 'applications', appRef.id), { status: 'accepted' });
    console.log('[PASS] organization: listed and accepted the application');

    // ── student rates the org ───────────────────────────────────────────────
    // This is the write that was silently discarded: orgId came back undefined,
    // which both the SDK and `incoming().orgId is string` reject.
    await as(student.email);
    const ratingRef = await addDoc(collection(db, 'orgRatings'), {
      orgId: org.uid,
      opportunityId: oppRef.id,
      studentId: student.uid,
      studentName: 'Flow Student',
      stars: 5,
      comment: 'Flow check rating.',
      createdAt: serverTimestamp(),
    });
    docs.push({ col: 'orgRatings', id: ratingRef.id });
    console.log('[PASS] student: rated the organization');

    // ── student requests hours ──────────────────────────────────────────────
    const reqId = `req-${student.uid}-${stamp}`;
    await setDoc(doc(db, 'hoursRequests', reqId), {
      id: reqId,
      studentId: student.uid,
      studentName: 'Flow Student',
      studentEmail: student.email,
      activity: 'Flow Check Opportunity',
      organization: 'Flow Org',
      hours: 3.5,
      date: '2026-01-01',
      coordinatorName: 'Flow Org',
      coordinatorContact: org.email.toLowerCase(),
      status: 'pending',
      requestedAt: new Date().toISOString(),
    });
    docs.push({ col: 'hoursRequests', id: reqId });
    console.log('[PASS] student: submitted an hours request');

    // ── org finds it and approves ───────────────────────────────────────────
    await as(org.email);
    const pending = await getDocs(query(
      collection(db, 'hoursRequests'),
      where('coordinatorContact', '==', org.email.toLowerCase()),
      where('status', '==', 'pending'),
    ));
    assert.equal(pending.size, 1, 'the coordinator cannot see the hours request addressed to them');

    const logged = [{
      id: `log-${stamp}`, activity: 'Flow Check Opportunity', hours: 3.5,
      date: '2026-01-01', coordinatorName: 'Flow Org',
      coordinatorContact: org.email, approved: true,
    }];
    await updateDoc(doc(db, 'students', student.uid), {
      loggedHours: logged,
      hours: totalLoggedHours(logged),
    });
    await updateDoc(doc(db, 'hoursRequests', reqId), { status: 'approved' });
    console.log('[PASS] organization: approved the hours');

    const adb = adminFirestore();
    if (adb) {
      const credited = (await adb.collection('students').doc(student.uid).get()).data();
      assert.equal(credited.hours, 3.5, 'the ranked total was not credited');
      assert.equal(credited.loggedHours.length, 1, 'the logged hours were not credited');
      console.log('[PASS] the student is credited 3.5 hours, ranked total included');
    } else {
      console.log('[WARN] no service account key — skipping the credited-total read-back');
    }

    // ── a second developer account ──────────────────────────────────────────
    // firestore.rules decides on the STORED role. AuthContext used to grant the
    // developer role in memory only, so a second developer saw the whole
    // Control Room and was denied by every privileged operation inside it.
    // Two things have to hold: an existing developer can promote someone, and
    // nobody else can promote themselves.
    if (adb) {
      const existingDev = await signUpAs('student', 'dev1');
      // Simulates an already-established developer. Written with the Admin SDK
      // because isValidUser deliberately refuses 'developer' on the
      // self-service paths — that refusal is the security property.
      await adb.collection('users').doc(existingDev.uid).update({ role: 'developer' });

      const promoted = await signUpAs('student', 'dev2');

      await as(existingDev.email);
      await updateDoc(doc(db, 'users', promoted.uid), { role: 'developer' });
      console.log('[PASS] developer: promoted a second account');

      await as(promoted.email);
      const enumerated = await getDocs(query(collection(db, 'users'), where('role', '==', 'developer')));
      assert.ok(enumerated.size >= 2, 'the promoted developer cannot enumerate accounts');
      console.log('[PASS] the promoted developer has real privileges, not just the UI');

      await as(student.email);
      let selfPromoteDenied = false;
      try {
        await updateDoc(doc(db, 'users', student.uid), { role: 'developer' });
      } catch (e: any) {
        selfPromoteDenied = e?.code === 'permission-denied';
      }
      assert.ok(selfPromoteDenied, 'a student was able to make themselves a developer');
      console.log('[PASS] a non-developer still cannot promote themselves');
    }
  } catch (err: any) {
    failed = true;
    console.error(`[FAIL] ${err?.code || ''} ${err?.message || err}`);
  }

  // ── cleanup ───────────────────────────────────────────────────────────────
  await signOut(auth).catch(() => {});
  const adb = adminFirestore();
  if (!adb) {
    console.log(`[WARN] no service account key — leaving throwaway data: ${uids.join(', ')}`);
  } else {
    for (const d of docs) await adb.collection(d.col).doc(d.id).delete().catch(() => {});
    for (const uid of uids) {
      await adb.__app.auth().deleteUser(uid).catch(() => {});
      for (const c of ['users', 'students', 'organizations']) {
        await adb.collection(c).doc(uid).delete().catch(() => {});
      }
    }
    console.log(`[INFO] cleaned up ${uids.length} account(s) and ${docs.length} document(s)`);
  }
  process.exit(failed ? 1 : 0);
})();
