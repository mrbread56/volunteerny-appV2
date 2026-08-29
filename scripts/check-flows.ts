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
import './env';
import { isTestAddress } from '../server/testAccounts';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  initializeFirestore, doc, collection, addDoc, getDoc, getDocs, setDoc,
  updateDoc, query, where, serverTimestamp,
} from 'firebase/firestore';
import * as admin from 'firebase-admin';
import { grantMfaClaim } from './grantMfaClaim';

import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';


/**
 * Hours approval is a server call now, so this walk of the real flow needs a
 * real server. Booted from the production bundle on a spare port and killed
 * afterwards, same as scripts/check-security.ts.
 */
const API_PORT = 3198;
const apiBase = `http://localhost:${API_PORT}`;
let apiServer: ChildProcess | undefined;

async function bootApi() {
  let log = '';
  apiServer = spawn(process.execPath, ['build/server.cjs'], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'production', PORT: String(API_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  apiServer.stdout?.on('data', (d) => { log += d.toString(); });
  apiServer.stderr?.on('data', (d) => { log += d.toString(); });
  for (let i = 0; i < 80; i++) {
    if (apiServer.exitCode !== null) throw new Error(`server exited ${apiServer.exitCode}:\n${log}`);
    try {
      const r = await fetch(`${apiBase}/api/email/history`);
      if (r.status === 401) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not answer on ${apiBase}:\n${log}`);
}

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

/**
 * Approve an organization the way a developer does.
 *
 * Posting is gated on verificationStatus == 'verified', and the create rule
 * refuses that value from a client — an organization cannot verify itself. So
 * the fixture registers unverified and is promoted here through the Admin SDK,
 * which bypasses rules exactly as the developer console does.
 */
async function approveOrg(adb: any, uid: string) {
  await adb.collection('organizations').doc(uid).update({ verificationStatus: 'verified' });
}

async function signUpAs(role: 'student' | 'organization', tag = '') {
  const email = `check_flows_${role}${tag ? '_' + tag : ''}_${stamp}@example.com`;
  const { user } = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  uids.push(user.uid);

  // Mark the address verified, exactly as clicking the link in the signup email
  // does. Signup.tsx calls sendEmailVerification, so a real organization
  // reaches this state; a script account created through the client SDK does
  // not, and the hoursRequests coordinator rule now requires
  // email_verified — without this the check fails for a reason that says
  // nothing about the app. The token must be reissued for the claim to appear.
  const adb0 = adminFirestore();
  if (adb0?.__app) {
    await adb0.__app.auth().updateUser(user.uid, { emailVerified: true });
    await user.getIdToken(true);
  }
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid, email, role,
    twoFactorEnabled: role === 'organization',
    createdAt: serverTimestamp(),
  });
  if (role === 'student') {
    await setDoc(doc(db, 'students', user.uid), {
      uid: user.uid, fullName: 'Flow Student', school: 'Earl Haig Secondary School',
      grade: '11', neighborhood: 'Willowdale', interests: [], skills: [],
      availability: [], resumeUrl: '',
    });
  } else {
    await setDoc(doc(db, 'organizations', user.uid), {
      uid: user.uid, organizationName: 'Flow Org', mission: 'Checking the flows.',
      organizationType: 'Other', address: '5100 Yonge St', coordinates: null,
      contactEmail: email, phone: '', northYorkConfirmed: true, websiteUrl: '',
      hasCra: null, craNumber: '', craVerified: false, verificationStatus: 'unverified',
    });
    // Approved straight away: posting is gated on verification, and every
    // suite here is about something other than the approval queue.
    await approveOrg(adminFirestore(), user.uid);
  }
  return { uid: user.uid, email };
}

/**
 * Sign in, then take the second factor the way a real session does.
 *
 * firestore.rules enforces two-factor on writes now, and 2FA is mandatory for
 * organizations — so a harness that signs in with a password and starts writing
 * is refused, correctly. Real organizations pass a code and /api/auth/verify-otp
 * stamps the claim; this does the same thing with the Admin SDK.
 */
const as = async (email: string) => {
  const cred = await signInWithEmailAndPassword(auth, email, PASSWORD);
  const adb = adminFirestore();
  if (adb?.__app) await grantMfaClaim(adb.__app, cred.user);
  return cred;
};

(async () => {
  let failed = false;
  try {
    await bootApi();
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
      // A Date, not a string. This is the third client-SDK writer of
      // opportunities (the two in src/ both go through resolveOpportunityDate,
      // which returns a Date), and it is the one the rules comment forgot.
      dateTime: new Date(Date.now() + 86400000),
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

    // The organization must still be able to review its own applicant. The
    // direct read is denied now (it exposed every student's resume and
    // passport to any organization), so this goes through the endpoint that
    // proves the relationship first. check-security covers the refusal side;
    // this is the half that proves reviewing still works.
    {
      const orgToken = await auth.currentUser!.getIdToken();
      const r = await fetch(`${apiBase}/api/students/${student.uid}/review-profile`, {
        headers: { Authorization: `Bearer ${orgToken}` },
      });
      const body: any = await r.json().catch(() => ({}));
      assert.ok(r.ok, `the organization could not review its own applicant: ${r.status} ${body?.error || ''}`);
      assert.equal(body.profile?.fullName, 'Flow Student', 'the review profile came back without the applicant name');
      // passportUrl was removed from the product entirely — it collected an
      // identity document from a minor that no UI could even write. The check
      // stays as a tripwire: if the field is ever reintroduced, it must not be
      // the review endpoint that first exposes it.
      assert.ok(!('passportUrl' in (body.profile || {})), 'passportUrl must never reach an organization');
      console.log('[PASS] organization: can review its own applicant, and gets no identity document');
    }

    // ── the organization can actually notify its applicant ──────────────────
    // This is the half that was broken for every real organization. The
    // applicant screens resolved the student's address with
    // getDoc(users/{studentId}), which firestore.rules allows only to the
    // account owner or a developer — so it threw, the throw was caught, and the
    // address fell back to the literal string "student@example.com". Every
    // acceptance and rejection went there instead of to the student, while the
    // UI reported the applicant had been notified. The server now resolves the
    // address itself, and never returns it.
    {
      // Point the student's account at Resend's sandbox address for this one
      // step. Resend refuses @example.com outright ("Please use our testing
      // email address instead of domains like example.com"), so leaving the
      // fixture address in place would fail on the provider's validation rather
      // than on anything this app does — while quietly not proving that
      // delivery works at all. delivered@resend.dev is a real accepted
      // recipient, so this exercises the whole path including the send.
      const adb = adminFirestore();
      await adb.collection('users').doc(student.uid).update({ email: 'delivered@resend.dev' });

      const orgToken = await auth.currentUser!.getIdToken();
      const r = await fetch(`${apiBase}/api/applications/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgToken}` },
        body: JSON.stringify({ applicationId: appRef.id, status: 'accepted' }),
      });
      const body: any = await r.json().catch(() => ({}));
      assert.ok(r.ok && body.success, `the organization could not notify its own applicant: ${r.status} ${body?.error || ''}`);
      assert.ok(!JSON.stringify(body).includes('@'), 'the notify endpoint leaked an email address back to the organization');
      console.log('[PASS] organization: notified its own applicant, without learning their address');

      await adb.collection('users').doc(student.uid).update({ email: student.email });
    }

    // ...and an unrelated organization cannot. Ownership of the opportunity is
    // the authorization here — not merely "is an organization", which anyone
    // gets free at signup.
    {
      const outsider = await signUpAs('organization', 'outsider');
      docs.push({ col: 'users', id: outsider.uid }, { col: 'organizations', id: outsider.uid });
      const outsiderToken = await auth.currentUser!.getIdToken();
      const r = await fetch(`${apiBase}/api/applications/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${outsiderToken}` },
        body: JSON.stringify({ applicationId: appRef.id, status: 'rejected' }),
      });
      assert.equal(r.status, 403, `an unrelated organization was allowed to email someone else's applicant (${r.status})`);
      console.log('[PASS] an unrelated organization cannot notify that applicant');
    }

    // ── student rates the org ───────────────────────────────────────────────
    // Through the server, because the rules can no longer allow this from a
    // client. Anyone could previously rate any organization for any
    // opportunity, including ones that organization never posted, and ratings
    // are a trust signal other students use to choose where to volunteer.
    // Proving "this student actually volunteered here" is a query across
    // applications, which rules cannot run — so orgRatings create is closed and
    // POST /api/ratings/create is the only door. This step used to be an
    // addDoc; it is now the check that the endpoint works for a student who
    // really does hold an accepted application.
    await as(student.email);
    {
      const studentToken = await auth.currentUser!.getIdToken();
      const r = await fetch(`${apiBase}/api/ratings/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({ opportunityId: oppRef.id, stars: 5, comment: 'Flow check rating.' }),
      });
      const body: any = await r.json().catch(() => ({}));
      assert.ok(r.ok, `the student could not rate the organization: ${r.status} ${body?.error || ''}`);
      assert.equal(body.orgId, org.uid, 'the rating was filed against the wrong organization');
      docs.push({ col: 'orgRatings', id: body.id });
      console.log('[PASS] student: rated the organization through the server');
    }

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

    // Through the server, because no client may write hours any more. This is
    // the half of the change that matters most: check-security proves an
    // unrelated organization is refused, and this proves a legitimate one is
    // still allowed. A fix that only did the first would have quietly broken
    // hours approval for everybody.
    const orgIdToken = await auth.currentUser!.getIdToken();
    const approveRes = await fetch(`${apiBase}/api/hours/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgIdToken}` },
      body: JSON.stringify({
        studentId: student.uid,
        hours: 3.5,
        activity: 'Flow Check Opportunity',
        date: '2026-01-01',
        requestId: reqId,
      }),
    });
    const approveBody: any = await approveRes.json().catch(() => ({}));
    assert.ok(
      approveRes.ok,
      `the coordinator named on the request was refused: ${approveRes.status} ${approveBody?.error || ''}`
    );
    assert.equal(approveBody.hours, 3.5, 'the endpoint returned the wrong total');
    console.log('[PASS] organization: approved the hours through /api/hours/approve');

    // The endpoint settles the request in the same transaction, so this must
    // already be true without a second write.
    const settled = (await getDocs(query(
      collection(db, 'hoursRequests'),
      where('coordinatorContact', '==', org.email.toLowerCase()),
      where('status', '==', 'pending'),
    ))).size;
    assert.equal(settled, 0, 'the hours request was not settled by the approval');
    console.log('[PASS] the hours request was settled in the same transaction');

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

      // ── metrics ────────────────────────────────────────────────────────
      // The numbers the whole "measure instead of guess" argument rests on. If
      // this endpoint is wrong or unreachable, every figure quoted about the
      // platform is invented.
      {
        // What the public counter said before this pass, so the refresh can be
        // proven rather than assumed.
        const before: any = await fetch(`${apiBase}/api/metrics/public`)
          .then((x) => x.json())
          .catch(() => ({}));

        const devToken = await auth.currentUser!.getIdToken(true);
        const r = await fetch(`${apiBase}/api/metrics`, {
          headers: { Authorization: `Bearer ${devToken}` },
        });
        assert.ok(r.ok, `a developer could not read metrics (${r.status})`);
        const m: any = await r.json();
        assert.ok(m?.signal && m?.counts, 'metrics came back without signal and counts');
        // This suite has just created a student, an organization, an
        // opportunity and an accepted application, so these cannot be zero.
        assert.ok(m.counts.students >= 1, 'metrics report no students after creating one');
        assert.ok(m.counts.opportunities >= 1, 'metrics report no opportunities after posting one');
        assert.ok(m.signal.opportunitiesWithAnAccept >= 1,
          'metrics report no opportunity with an accepted applicant, after accepting one');
        assert.ok(m.signal.hoursConfirmed >= 3.5,
          `metrics report ${m.signal.hoursConfirmed} confirmed hours after approving 3.5`);
        assert.ok(typeof m.signal.placementRate === 'number' && m.signal.placementRate > 0,
          'placementRate is the headline indicator and came back zero or missing');
        console.log('[PASS] metrics: a developer reads real signal, not placeholders');

        // Reading the full set refreshes the public counters as a byproduct.
        // Two things must hold, and they pull in opposite directions: the
        // refresh has to happen, and the fixtures this suite just created must
        // NOT survive into it. These figures are rendered on the public home
        // page, and on 23 Aug 2026 a test run left the counter claiming three
        // verified organizations at a moment when there were none. The
        // dashboard above still sees every fixture, which is correct; only the
        // public copy is filtered. See server/testAccounts.ts.
        const pub = await fetch(`${apiBase}/api/metrics/public`);
        assert.ok(pub.ok, `public counters unavailable (${pub.status})`);
        const p: any = await pub.json();
        assert.ok(p.updatedAt && p.updatedAt !== before?.updatedAt,
          'the public counter was not refreshed by the developer read');
        // The counter must exclude this suite's fixtures WITHOUT being pinned to
        // an absolute number.
        //
        // The first version of this asserted verifiedOrganizations < 1, which
        // was true only because the platform had no verified organisations the
        // day it was written. Two real ones signed up on 27 Aug 2026 and the
        // assertion started failing on a counter that was perfectly correct —
        // a test that breaks when the business succeeds is a test nobody will
        // keep. What actually has to hold is that the public figure matches the
        // count of REAL verified organisations, whatever that count is.
        const realVerifiedOrgs = await (async () => {
          const [orgs, users] = await Promise.all([
            adb.collection('organizations').get(),
            adb.collection('users').get(),
          ]);
          const emailByUid = new Map<string, string>();
          users.docs.forEach((d: any) => emailByUid.set(d.id, d.data()?.email || ''));
          return orgs.docs.filter((d: any) => {
            const o = d.data();
            if (o?.verificationStatus !== 'verified') return false;
            return !isTestAddress(o?.contactEmail || emailByUid.get(d.id) || '');
          }).length;
        })();

        assert.strictEqual(p.verifiedOrganizations, realVerifiedOrgs,
          `the public counter says ${p.verifiedOrganizations} verified organisations, ` +
          `but ${realVerifiedOrgs} of them are real — the difference is fixtures`);

        // Hours are still pinned, because this suite confirms exactly 3.5 of
        // them on a fixture student and none of that may surface publicly.
        assert.ok(!(p.hoursConfirmed >= 3.5),
          `this suite's fixture hours reached the public counter (${p.hoursConfirmed})`);
        console.log(
          `[PASS] metrics: public counters refresh, fixtures stay out ` +
          `(${p.verifiedOrganizations} real verified organisation(s))`);
      }

      // Anyone signed out can read the public figure, and nobody can read the
      // full set without being a developer.
      {
        const anon = await fetch(`${apiBase}/api/metrics`);
        assert.equal(anon.status, 401, 'the full metric set was readable without signing in');
        const studentToken = await (async () => {
          await as(student.email);
          return auth.currentUser!.getIdToken(true);
        })();
        const asStudent = await fetch(`${apiBase}/api/metrics`, {
          headers: { Authorization: `Bearer ${studentToken}` },
        });
        assert.equal(asStudent.status, 403, 'a student could read the full metric set');
        console.log('[PASS] metrics: the full set is developers only');
      }

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
  apiServer?.kill();
  process.exit(failed ? 1 : 0);
})();
