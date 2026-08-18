/**
 * The guards that only fail when two things happen at once.
 *
 *   npm run check:concurrency
 *
 * Three fixes in this codebase were reasoned about rather than proven:
 *
 *   1. The 2FA attempt cap was a read-modify-write. A batch of guesses fired
 *      together all read `attempts: 0`, all wrote `attempts: 1`, and a hundred
 *      tries cost ONE of the five. It was rewritten as a Firestore transaction
 *      — and a transaction that is never contended is indistinguishable from
 *      the bug it replaced.
 *   2. Approving hours credits a student inside a transaction that re-reads the
 *      request. Two coordinators clicking together must credit once, not twice;
 *      these are graduation records.
 *   3. Applications use a deterministic id (`${uid}_${oppId}`) so two tabs
 *      cannot produce two documents. Sequential tests prove the id is stable,
 *      not that the write is safe under a race.
 *
 * Sequential tests cannot see any of this. Everything below fires genuinely in
 * parallel with Promise.all and asserts on the aggregate outcome, then cleans
 * up whatever happened.
 */
import './env';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import * as admin from 'firebase-admin';
import { grantMfaClaim } from './grantMfaClaim';

import { spawn, ChildProcess } from 'node:child_process';

const API_PORT = 3197;
const apiBase = `http://localhost:${API_PORT}`;
let apiServer: ChildProcess | undefined;

let passed = 0;
let failed = 0;
const pass = (m: string) => { console.log(`[PASS] ${m}`); passed++; };
const fail = (m: string) => { console.error(`[FAIL] ${m}`); failed++; };

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

const PASSWORD = 'checkConc!123';
const stamp = Date.now();
const uids: string[] = [];

let adminDb: any = null;
function adminFirestore() {
  if (adminDb) return adminDb;
  const a: any = (admin as any).default || admin;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is required');
  const adminApp = a.initializeApp({ credential: a.credential.cert(JSON.parse(key)) }, 'check-conc-admin');
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

async function bootApi() {
  let log = '';
  apiServer = spawn(process.execPath, ['dist/server.cjs'], {
    cwd: process.cwd(),
    // NODE_ENV stays out of production here: send-otp logs the code to stdout
    // in non-production, which is the only way to learn it without a mailbox.
    env: { ...process.env, PORT: String(API_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  apiServer.stdout?.on('data', (d) => { log += d.toString(); });
  apiServer.stderr?.on('data', (d) => { log += d.toString(); });
  for (let i = 0; i < 80; i++) {
    if (apiServer.exitCode !== null) throw new Error(`server exited ${apiServer.exitCode}:\n${log}`);
    try {
      const r = await fetch(`${apiBase}/api/email/history`);
      if (r.status === 401) return () => log;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not answer on ${apiBase}:\n${log}`);
}

async function makeUser(role: 'student' | 'organization', tag: string) {
  const email = `check_conc_${role}_${tag}_${stamp}@example.com`;
  const { user } = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  uids.push(user.uid);
  const adb = adminFirestore();
  await adb.__app.auth().updateUser(user.uid, { emailVerified: true });
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid, email, role, twoFactorEnabled: role === 'organization', createdAt: serverTimestamp(),
  });
  if (role === 'student') {
    await setDoc(doc(db, 'students', user.uid), {
      uid: user.uid, fullName: `Conc ${tag}`, school: '', grade: '11', neighborhood: '',
      interests: [], skills: [], availability: [], resumeUrl: '',
    });
  } else {
    await setDoc(doc(db, 'organizations', user.uid), {
      uid: user.uid, organizationName: `Conc Org ${tag}`, mission: 'm', organizationType: 'Other',
      address: 'a', coordinates: null, contactEmail: email, phone: '', northYorkConfirmed: true,
      websiteUrl: '', hasCra: 'no', craNumber: '', craVerified: false, verificationStatus: 'unverified',
    });
    // Approved straight away: posting is gated on verification, and every
    // suite here is about something other than the approval queue.
    await approveOrg(adminFirestore(), user.uid);
  }
  return { uid: user.uid, email };
}

const as = async (email: string) => {
  await signOut(auth);
  const cred = await signInWithEmailAndPassword(auth, email, PASSWORD);
  // The second factor, as a real session would carry it — see grantMfaClaim.
  // Without it every organization write is refused by mfaSatisfied().
  const adb = adminFirestore();
  if (adb?.__app) await grantMfaClaim(adb.__app, cred.user);
  return auth.currentUser!.getIdToken();
};

(async () => {
  const adb = adminFirestore();
  let getLog: () => string = () => '';

  try {
    getLog = await bootApi();

    // ── 1. the 2FA attempt cap under a burst ──────────────────────────────
    {
      const student = await makeUser('student', 'otp');
      const token = await as(student.email);

      // The code is seeded directly rather than requested through
      // /api/auth/send-otp. That endpoint has to DELIVER the mail, and Resend
      // rightly refuses an @example.com address, so requesting one here fails
      // with a 502 before the thing under test is ever reached. What is being
      // attacked is the attempt counter inside verify-otp, which only needs a
      // live record to exist — seeding it tests exactly that, spends no email
      // quota, and keeps the suite runnable offline from Resend.
      await adb.collection('verification_otps').doc(student.uid).set({
        otp: '123456',
        expires: Date.now() + 10 * 60 * 1000,
        attempts: 0,
        issuedAt: Date.now(),
      });
      {
        // 200 wrong guesses, all in flight together.
        const BURST = 200;
        // Counted by REASON, not by status code: "Incorrect code" and "No code
        // was requested" are both 400, and the difference is the whole point.
        // The second means the record was already TOMBSTONED — the cap was hit,
        // the code was killed, and every later guess correctly bounced off a
        // dead record. Reading those as consumed attempts makes a working
        // transaction look like a leaking one.
        const results = await Promise.all(
          Array.from({ length: BURST }, () =>
            fetch(`${apiBase}/api/auth/verify-otp`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ code: '000000' }),
            })
              .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
              .catch(() => ({ status: 0, body: {} as any })),
          ),
        );
        const reason = (r: any) => String(r.body?.error || '');
        const wrong = results.filter((r) => /incorrect code/i.test(reason(r))).length;
        const lockedOut = results.filter((r) => r.status === 429).length;
        const tombstoned = results.filter((r) => /no code was requested/i.test(reason(r))).length;
        const busy = results.filter((r) => r.status === 503).length;
        console.log(`       [detail] wrong=${wrong} locked=${lockedOut} tombstoned=${tombstoned} busy=${busy} other=${results.length - wrong - lockedOut - tombstoned - busy}`);

        // The cap is five. Anything that answers 400 consumed an attempt, so
        // more than five means the counter lost writes to the race.
        if (wrong <= 5) {
          pass(`${BURST} simultaneous wrong codes consumed ${wrong} of 5 attempts (${lockedOut} locked out)`);
        } else {
          fail(`the attempt cap leaked under load: ${wrong} guesses were accepted where 5 is the maximum`);
        }

        // And the account must actually be locked afterwards, not merely slow.
        const after = await fetch(`${apiBase}/api/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ code: '000000' }),
        });
        if (after.status === 429 || after.status === 400) {
          const body = await after.json().catch(() => ({}));
          const locked = after.status === 429 || /too many|no code was requested/i.test(body.error || '');
          if (locked) pass('after the burst the code is dead and a new one must be requested');
          else fail(`the code is still guessable after the burst: ${body.error}`);
        }
      }
    }

    // ── 2. approving the same hours twice, at once ────────────────────────
    {
      const org = await makeUser('organization', 'hours');
      const student = await makeUser('student', 'hours');

      // The org must have a real relationship with the student, which is what
      // /api/hours/approve checks before crediting anything.
      await as(org.email);
      const oppRef = doc(db, 'opportunities', `conc_opp_${stamp}`);
      await setDoc(oppRef, {
        orgId: org.uid, orgName: 'Conc Org hours', title: 'Concurrency Opportunity',
        description: 'd', location: 'l', category: 'Environment', requirements: '',
        maxVolunteers: 5, skillsNeeded: [], exclusives: [], timeCommitment: 'One-time',
        isVirtual: false, coordinates: { lat: 43.7, lng: -79.4 },
        dateTime: new Date(Date.now() + 86400000), createdAt: serverTimestamp(),
      });
      await as(student.email);
      await setDoc(doc(db, 'applications', `${student.uid}_${oppRef.id}`), {
        opportunityId: oppRef.id, orgId: org.uid, studentId: student.uid, status: 'pending',
        appliedAt: serverTimestamp(), message: '', opportunityTitle: 'Concurrency Opportunity',
        studentName: 'Conc hours', previousExperience: '', resumeUrl: '',
      });
      await as(org.email);
      await adb.collection('applications').doc(`${student.uid}_${oppRef.id}`).update({ status: 'accepted' });

      const reqId = `conc_hours_${stamp}`;
      await adb.collection('hoursRequests').doc(reqId).set({
        studentId: student.uid, studentName: 'Conc hours', studentEmail: student.email,
        activity: 'Cleanup', hours: 4, date: '2026-08-13', organization: 'Conc Org hours',
        coordinatorName: 'Coord', coordinatorContact: org.email,
        status: 'pending', requestedAt: new Date().toISOString(),
      });

      const orgToken = await as(org.email);
      const APPROVALS = 12;
      const outcomes = await Promise.all(
        Array.from({ length: APPROVALS }, () =>
          fetch(`${apiBase}/api/hours/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgToken}` },
            body: JSON.stringify({ studentId: student.uid, hours: 4, requestId: reqId, activity: 'Cleanup', date: '2026-08-13' }),
          })
            .then((r) => r.status)
            .catch(() => 0),
        ),
      );
      const ok = outcomes.filter((s) => s === 200).length;

      const profile = (await adb.collection('students').doc(student.uid).get()).data() || {};
      const entries = (profile.loggedHours || []).length;
      const total = (profile.loggedHours || []).reduce((s: number, l: any) => s + (Number(l.hours) || 0), 0);

      if (ok === 1 && entries === 1 && total === 4) {
        pass(`${APPROVALS} simultaneous approvals credited the student exactly once (4 hours, 1 entry)`);
      } else {
        fail(`double-credit under load: ${ok} approvals succeeded, ${entries} entries, ${total} hours (expected 1 / 1 / 4)`);
      }

      const settled = (await adb.collection('hoursRequests').doc(reqId).get()).data();
      if (settled?.status === 'approved') pass('the request was settled once, in the same transaction');
      else fail(`the request is still ${settled?.status} after a successful approval`);
    }

    // ── 3. two tabs applying at the same instant ──────────────────────────
    {
      const org = await makeUser('organization', 'apply');
      const student = await makeUser('student', 'apply');

      await as(org.email);
      const oppRef = doc(db, 'opportunities', `conc_apply_${stamp}`);
      await setDoc(oppRef, {
        orgId: org.uid, orgName: 'Conc Org apply', title: 'Race Opportunity',
        description: 'd', location: 'l', category: 'Environment', requirements: '',
        maxVolunteers: 3, skillsNeeded: [], exclusives: [], timeCommitment: 'One-time',
        isVirtual: false, coordinates: { lat: 43.7, lng: -79.4 },
        dateTime: new Date(Date.now() + 86400000), createdAt: serverTimestamp(),
      });

      await as(student.email);
      const payload = {
        opportunityId: oppRef.id, orgId: org.uid, studentId: student.uid, status: 'pending',
        appliedAt: serverTimestamp(), message: '', opportunityTitle: 'Race Opportunity',
        studentName: 'Conc apply', previousExperience: '', resumeUrl: '',
      };
      const TABS = 8;
      const writes = await Promise.allSettled(
        Array.from({ length: TABS }, () =>
          setDoc(doc(db, 'applications', `${student.uid}_${oppRef.id}`), payload),
        ),
      );
      const accepted = writes.filter((w) => w.status === 'fulfilled').length;

      const found = await adb.collection('applications')
        .where('studentId', '==', student.uid)
        .where('opportunityId', '==', oppRef.id)
        .get();

      // The deterministic id is the guard: whatever the races do, the address
      // is the same document, so capacity can never be double-counted.
      if (found.size === 1) {
        pass(`${TABS} simultaneous applications produced exactly 1 document (${accepted} writes landed on it)`);
      } else {
        fail(`the deterministic id did not hold: ${found.size} application documents exist`);
      }
    }
  } catch (err: any) {
    fail(`suite crashed: ${err?.message || err}`);
    const log = getLog();
    if (log) console.error(log.split('\n').slice(-15).join('\n'));
  } finally {
    apiServer?.kill();
    try {
      for (const uid of uids) {
        for (const col of ['users', 'students', 'organizations']) {
          await adb.collection(col).doc(uid).delete().catch(() => {});
        }
        for (const col of ['applications', 'hoursRequests', 'verification_otps', 'otp_rate_limits']) {
          const snap = await adb.collection(col).where('studentId', '==', uid).get().catch(() => ({ docs: [] }));
          await Promise.all(snap.docs.map((d: any) => d.ref.delete()));
          await adb.collection(col).doc(uid).delete().catch(() => {});
        }
        const opps = await adb.collection('opportunities').where('orgId', '==', uid).get().catch(() => ({ docs: [] }));
        await Promise.all(opps.docs.map((d: any) => d.ref.delete()));
        await adb.__app.auth().deleteUser(uid).catch(() => {});
      }
    } catch (cleanupErr: any) {
      console.warn('[cleanup] partial:', cleanupErr?.message || cleanupErr);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
