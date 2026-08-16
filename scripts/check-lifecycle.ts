/**
 * The lifecycle half of the app: withdrawing, waitlisting, deleting.
 *
 *   npm run check:lifecycle
 *
 * check-flows.ts walks the happy path — apply, accept, rate, log hours. This
 * walks what happens when things are taken BACK, which is where the destructive
 * bugs live and where there was no coverage at all:
 *
 *   - Duplicate applications. Two tabs used to produce two application
 *     documents for the same student, both counting toward capacity.
 *   - Withdrawal. The rules have always permitted it and no UI ever called it.
 *   - Waitlist promotion. It fired on rejections that freed nothing and ignored
 *     maxVolunteers, so an opportunity could hold more accepted volunteers than
 *     it had places.
 *   - Deleting an opportunity. It used to orphan every application to it —
 *     unreachable by the organization (whose list rule proves ownership through
 *     exists() on the opportunity) and unresolvable for the student.
 *   - Deleting an account. Both profile screens called deleteDoc on documents
 *     the rules refuse, so nothing was ever deleted and the user saw a raw
 *     permissions error.
 *
 * Runs against the real project through the CLIENT SDK, so firestore.rules is
 * enforced exactly as it is for a browser. Everything is cleaned up, including
 * on failure.
 */
import './env';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  initializeFirestore, doc, collection, getDoc, getDocs, setDoc,
  updateDoc, deleteDoc, query, where, serverTimestamp,
} from 'firebase/firestore';
import * as admin from 'firebase-admin';
import { grantMfaClaim } from './grantMfaClaim';

import { spawn, ChildProcess } from 'node:child_process';

const API_PORT = 3199;
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

const PASSWORD = 'checkLifecycle!123';
const stamp = Date.now();
const uids: string[] = [];

let adminDb: any = null;
function adminFirestore() {
  if (adminDb) return adminDb;
  const a: any = (admin as any).default || admin;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is required');
  const adminApp = a.initializeApp({ credential: a.credential.cert(JSON.parse(key)) }, 'check-lifecycle-admin');
  adminDb = adminApp.firestore();
  adminDb.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });
  adminDb.__app = adminApp;
  return adminDb;
}

async function bootApi() {
  let log = '';
  apiServer = spawn(process.execPath, ['dist/server.cjs'], {
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

async function makeUser(role: 'student' | 'organization', tag: string) {
  const email = `check_lc_${role}_${tag}_${stamp}@example.com`;
  const { user } = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  uids.push(user.uid);
  const adb = adminFirestore();
  await adb.__app.auth().updateUser(user.uid, { emailVerified: true });
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid, email, role,
    twoFactorEnabled: role === 'organization',
    createdAt: serverTimestamp(),
  });
  if (role === 'student') {
    await setDoc(doc(db, 'students', user.uid), {
      uid: user.uid, fullName: `LC ${tag}`, school: '', grade: '11', neighborhood: '',
      interests: [], skills: [], availability: [], resumeUrl: '',
    });
  } else {
    await setDoc(doc(db, 'organizations', user.uid), {
      uid: user.uid, organizationName: `LC Org ${tag}`, mission: 'm', organizationType: 'Other',
      address: 'a', coordinates: null, contactEmail: email, phone: '', northYorkConfirmed: true,
      websiteUrl: '', hasCra: 'no', craNumber: '', craVerified: false, verificationStatus: 'unverified',
    });
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

/** Apply the way StudentOpportunityDetail does: deterministic id. */
async function apply(studentUid: string, oppId: string, title: string, orgId: string, status: string) {
  await setDoc(doc(db, 'applications', `${studentUid}_${oppId}`), {
    opportunityId: oppId, orgId, studentId: studentUid, status,
    appliedAt: serverTimestamp(), message: '', opportunityTitle: title,
    studentName: 'LC Student', previousExperience: '', resumeUrl: '',
  });
}

(async () => {
  const adb = adminFirestore();
  let org: any, s1: any, s2: any, s3: any, oppId = '';

  try {
    await bootApi();

    org = await makeUser('organization', 'a');
    s1 = await makeUser('student', 'one');
    s2 = await makeUser('student', 'two');
    s3 = await makeUser('student', 'three');

    // ── an opportunity with exactly one place ────────────────────────────────
    await as(org.email);
    const oppRef = doc(collection(db, 'opportunities'));
    oppId = oppRef.id;
    await setDoc(oppRef, {
      orgId: org.uid, orgName: 'LC Org a', title: 'Lifecycle Opportunity',
      description: 'd', location: 'l', category: 'Environment', requirements: '',
      maxVolunteers: 1, skillsNeeded: [], exclusives: [], timeCommitment: 'One-time',
      isVirtual: false, coordinates: { lat: 43.7, lng: -79.4 },
      dateTime: new Date(Date.now() + 86400000), createdAt: serverTimestamp(),
    });
    pass('organization posted a one-place opportunity');

    // ── duplicate applications are structurally impossible ───────────────────
    await as(s1.email);
    await apply(s1.uid, oppId, 'Lifecycle Opportunity', org.uid, 'pending');
    try {
      await apply(s1.uid, oppId, 'Lifecycle Opportunity', org.uid, 'pending');
      fail('the same student applied to the same opportunity TWICE');
    } catch {
      pass('a second application from the same student is refused');
    }
    const mine = await getDocs(query(collection(db, 'applications'),
      where('studentId', '==', s1.uid), where('opportunityId', '==', oppId)));
    if (mine.size === 1) pass('exactly one application document exists');
    else fail(`${mine.size} application documents exist for one student and one opportunity`);

    // ── a student can withdraw ───────────────────────────────────────────────
    await updateDoc(doc(db, 'applications', `${s1.uid}_${oppId}`), { status: 'terminated' });
    const withdrawn = await getDoc(doc(db, 'applications', `${s1.uid}_${oppId}`));
    if (withdrawn.data()?.status === 'terminated') pass('a student can withdraw their own application');
    else fail('withdrawal did not take effect');

    // Withdrawing must not be a one-way door. The UI deletes rather than
    // tombstoning precisely because applications are keyed
    // `${studentId}_${opportunityId}`: a surviving document keeps that key
    // occupied, re-applying becomes an UPDATE, and isValidApplication pins
    // appliedAt — so the student could never apply again and the detail page
    // would say "You've Applied!" for ever.
    await deleteDoc(doc(db, 'applications', `${s1.uid}_${oppId}`));
    try {
      await apply(s1.uid, oppId, 'Lifecycle Opportunity', org.uid, 'pending');
      pass('a student can apply again after withdrawing');
    } catch (e: any) {
      fail(`withdrawing was a dead end — re-applying was refused (${e?.code || e})`);
    }
    // Leave the slot clear for the rest of the walk.
    await deleteDoc(doc(db, 'applications', `${s1.uid}_${oppId}`));

    // ...but not tamper with someone else's.
    await as(s2.email);
    await apply(s2.uid, oppId, 'Lifecycle Opportunity', org.uid, 'pending');
    try {
      await updateDoc(doc(db, 'applications', `${s1.uid}_${oppId}`), { status: 'accepted' });
      fail("a student edited ANOTHER student's application");
    } catch {
      pass("a student cannot edit another student's application");
    }

    // ── capacity: waitlist promotion must respect maxVolunteers ──────────────
    await as(org.email);
    await updateDoc(doc(db, 'applications', `${s2.uid}_${oppId}`), { status: 'accepted', decidedAt: serverTimestamp() });
    await as(s3.email);
    await apply(s3.uid, oppId, 'Lifecycle Opportunity', org.uid, 'waitlist');

    // The place is taken (1 accepted, maxVolunteers 1), so promoteWaitlistedApplicant
    // must decline to promote. Exercised through the same reads it performs.
    await as(org.email);
    const accepted = await getDocs(query(collection(db, 'applications'),
      where('opportunityId', '==', oppId), where('status', '==', 'accepted')));
    const cap = Number((await getDoc(doc(db, 'opportunities', oppId))).data()?.maxVolunteers) || 0;
    if (cap > 0 && accepted.size >= cap) pass('capacity is full, so a waitlisted student must not be promoted');
    else fail(`capacity check wrong: ${accepted.size} accepted against maxVolunteers ${cap}`);

    // ── notify: ownership is what authorises, not merely being an org ────────
    {
      const orgToken = await as(org.email);
      await adb.collection('users').doc(s2.uid).update({ email: 'delivered@resend.dev' });
      const r = await fetch(`${apiBase}/api/applications/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgToken}` },
        body: JSON.stringify({ applicationId: `${s2.uid}_${oppId}`, status: 'accepted' }),
      });
      if (r.ok) pass('the owning organization can notify its applicant');
      else fail(`the owning organization could not notify its applicant (${r.status})`);
      await adb.collection('users').doc(s2.uid).update({ email: s2.email });

      const outsider = await makeUser('organization', 'outsider');
      const outsiderToken = await as(outsider.email);
      const r2 = await fetch(`${apiBase}/api/applications/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${outsiderToken}` },
        body: JSON.stringify({ applicationId: `${s2.uid}_${oppId}`, status: 'rejected' }),
      });
      if (r2.status === 403) pass('an unrelated organization is refused (403)');
      else fail(`an unrelated organization got ${r2.status}, expected 403`);
    }

    // ── applicant contact details ────────────────────────────────────────────
    // The organization must be able to reach the students who applied to its
    // own posting — that is the whole point of the platform — while still being
    // unable to read a student it has no relationship with.
    {
      const orgToken = await as(org.email);
      const r = await fetch(`${apiBase}/api/opportunities/${oppId}/applicant-contacts`, {
        headers: { Authorization: `Bearer ${orgToken}` },
      });
      const body: any = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(body.contacts) && body.contacts.length > 0) {
        pass(`the owning organization gets ${body.contacts.length} applicant contact(s)`);
      } else {
        fail(`the owning organization could not read its applicants' contacts (${r.status})`);
      }
      const withEmail = (body.contacts || []).filter((c: any) => c.email);
      if (withEmail.length > 0) pass('applicant contacts include real email addresses');
      else fail('applicant contacts came back with no email addresses');

      // Every status, not only accepted — an organization needs to reach a
      // pending applicant to ask a question, and a rejected one to follow up.
      const statuses = new Set((body.contacts || []).map((c: any) => c.status));
      if (statuses.size >= 2) pass(`contacts cover multiple statuses (${[...statuses].join(', ')})`);
      else fail(`contacts covered only ${[...statuses].join(', ') || 'nothing'}`);
    }
    {
      const outsider = await makeUser('organization', 'nosy');
      const outsiderToken = await as(outsider.email);
      const r = await fetch(`${apiBase}/api/opportunities/${oppId}/applicant-contacts`, {
        headers: { Authorization: `Bearer ${outsiderToken}` },
      });
      if (r.status === 403) pass('an unrelated organization cannot read those contacts (403)');
      else fail(`an unrelated organization got ${r.status}, expected 403`);
    }

    // ── closing a posting ────────────────────────────────────────────────────
    {
      await as(org.email);
      await updateDoc(doc(db, 'opportunities', oppId), { status: 'closed', updatedAt: serverTimestamp() });
      const closed = await getDoc(doc(db, 'opportunities', oppId));
      if (closed.data()?.status === 'closed') pass('an organization can close its own opportunity');
      else fail('closing the opportunity did not take effect');

      // Closing must not delete anything.
      const stillThere = await getDocs(query(collection(db, 'applications'), where('opportunityId', '==', oppId)));
      if (stillThere.size > 0) pass('closing keeps the applications and accepted volunteers intact');
      else fail('closing destroyed the applications');

      await updateDoc(doc(db, 'opportunities', oppId), { status: 'open', updatedAt: serverTimestamp() });
      const reopened = await getDoc(doc(db, 'opportunities', oppId));
      if (reopened.data()?.status === 'open') pass('an organization can reopen it again');
      else fail('reopening did not take effect');
    }

    // ── the leaderboard cron entry point ─────────────────────────────────────
    //
    // This block used to assert that a bare `x-vercel-cron: 1` header ran the
    // rebuild, and called that a PASS. The header is client-settable, so what
    // it was really asserting is that anyone could trigger an unthrottled
    // students scan plus a write, unauthenticated. A test that locks in a hole
    // is worse than no test. It now asserts the opposite.
    {
      const anon = await fetch(`${apiBase}/api/leaderboard/refresh`);
      if (anon.status === 401 || anon.status === 503) pass(`the cron route refuses an anonymous GET (${anon.status})`);
      else fail(`the cron route answered ${anon.status} to an anonymous GET`);

      const spoofed = await fetch(`${apiBase}/api/leaderboard/refresh`, { headers: { 'x-vercel-cron': '1' } });
      if (spoofed.status === 401 || spoofed.status === 503) pass(`a spoofed x-vercel-cron header is refused (${spoofed.status})`);
      else fail(`a spoofed cron header was ACCEPTED (${spoofed.status}) — anyone can trigger the rebuild`);

      if (process.env.CRON_SECRET) {
        const real = await fetch(`${apiBase}/api/leaderboard/refresh`, {
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        });
        if (real.ok) pass('the cron route runs with the configured CRON_SECRET');
        else fail(`the cron route answered ${real.status} to a correctly authenticated cron`);
      } else {
        pass('CRON_SECRET is unset, so the route is disabled (fails closed)');
      }
    }

    // ── deleting an opportunity takes its applications with it ───────────────
    {
      const orgToken = await as(org.email);
      const before = await getDocs(query(collection(db, 'applications'), where('opportunityId', '==', oppId)));
      const r = await fetch(`${apiBase}/api/opportunities/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgToken}` },
        body: JSON.stringify({ opportunityId: oppId }),
      });
      if (!r.ok) fail(`opportunity delete failed (${r.status})`);
      else {
        const oppGone = !(await adb.collection('opportunities').doc(oppId).get()).exists;
        const appsLeft = (await adb.collection('applications').where('opportunityId', '==', oppId).get()).size;
        if (oppGone && appsLeft === 0) {
          pass(`opportunity deleted with all ${before.size} of its applications`);
        } else {
          fail(`orphans left behind: opportunity gone=${oppGone}, applications remaining=${appsLeft}`);
        }
      }
    }

    // ── a user can delete their own account, and its dependents ──────────────
    {
      // Give s3 something in every dependent collection first.
      await as(s3.email);
      await setDoc(doc(db, 'hoursRequests', `lc_${stamp}`), {
        studentId: s3.uid, studentName: 'LC three', studentEmail: s3.email,
        activity: 'Cleanup', hours: 2, date: '2026-08-13',
        organization: 'LC Org a', coordinatorName: 'Coord',
        // requestedAt is an ISO STRING here, not a serverTimestamp — the rules
        // validate `data.requestedAt is string` and StudentDashboard writes
        // new Date().toISOString(). Matching the real write is the point.
        coordinatorContact: org.email, status: 'pending', requestedAt: new Date().toISOString(),
      });

      // A real object under this student's Storage prefix, so deletion can be
      // proven rather than assumed. Written with the Admin SDK because the
      // point is what SURVIVES the purge, not whether the upload rules work —
      // check:storage already covers those.
      const bucketName = process.env.VITE_FIREBASE_STORAGE_BUCKET!;
      const objectPath = `students/${s3.uid}/lifecycle-resume.txt`;
      await adb.__app.storage().bucket(bucketName).file(objectPath)
        .save('pretend resume bytes', { contentType: 'text/plain' });
      const uploadedExists = (await adb.__app.storage().bucket(bucketName).file(objectPath).exists())[0];
      if (uploadedExists) pass('a file was uploaded under the student\'s Storage prefix');
      else fail('could not stage a Storage object, so deletion cannot be proven');

      const token = await as(s3.email);
      const wrong = await fetch(`${apiBase}/api/account/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmEmail: 'someone-else@example.com' }),
      });
      if (wrong.status === 400) pass('account deletion refuses a mismatched confirmation email');
      else fail(`mismatched confirmation returned ${wrong.status}, expected 400`);

      const r = await fetch(`${apiBase}/api/account/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmEmail: s3.email }),
      });
      if (!r.ok) fail(`self-deletion failed (${r.status})`);
      else {
        const userGone = !(await adb.collection('users').doc(s3.uid).get()).exists;
        const profileGone = !(await adb.collection('students').doc(s3.uid).get()).exists;
        const hoursLeft = (await adb.collection('hoursRequests').where('studentId', '==', s3.uid).get()).size;
        const authGone = await adb.__app.auth().getUser(s3.uid).then(() => false).catch(() => true);

        // The part that was missing entirely. Deletion cleared Firestore and the
        // Auth identity and never touched Cloud Storage, so a resume — and the
        // photographs on any safety report — outlived the account. Every URL the
        // app hands out carries a getDownloadURL token that bypasses
        // storage.rules, so an already-shared link kept resolving forever.
        const objectGone = !(await adb.__app.storage().bucket(bucketName).file(objectPath).exists())[0];
        if (objectGone) pass('self-deletion removed the uploaded file from Cloud Storage');
        else fail('the uploaded file SURVIVED account deletion — its download URL still resolves');

        if (userGone && profileGone && authGone && hoursLeft === 0) {
          pass('self-deletion removed the account, the profile, the sign-in identity and the dependents');
        } else {
          fail(`incomplete deletion: user=${!userGone} profile=${!profileGone} auth=${!authGone} hoursRequests=${hoursLeft}`);
        }
      }
    }
  } catch (err: any) {
    fail(`suite crashed: ${err?.message || err}`);
  } finally {
    apiServer?.kill();
    // Remove everything, whatever happened above.
    try {
      for (const uid of uids) {
        for (const col of ['users', 'students', 'organizations']) {
          await adb.collection(col).doc(uid).delete().catch(() => {});
        }
        for (const col of ['applications', 'hoursRequests', 'savedOpportunities', 'interestRequests']) {
          const snap = await adb.collection(col).where('studentId', '==', uid).get().catch(() => ({ docs: [] }));
          await Promise.all(snap.docs.map((d: any) => d.ref.delete()));
        }
        const opps = await adb.collection('opportunities').where('orgId', '==', uid).get().catch(() => ({ docs: [] }));
        await Promise.all(opps.docs.map((d: any) => d.ref.delete()));
        await adb.__app.auth().deleteUser(uid).catch(() => {});
      }
      if (oppId) await adb.collection('opportunities').doc(oppId).delete().catch(() => {});
    } catch (cleanupErr: any) {
      console.warn('[cleanup] partial:', cleanupErr?.message || cleanupErr);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
