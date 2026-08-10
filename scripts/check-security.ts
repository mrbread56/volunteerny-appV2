/**
 * Adversarial check: can a signed-in user reach data or capability that is not
 * theirs?
 *
 *   npm run check:security
 *
 * Everything else in scripts/ verifies that the happy path works. This one
 * tries to break it, because the failure mode is silent — nobody files a bug
 * saying "I could read another student's profile."
 *
 * Two halves:
 *
 *   1. The HTTP API. Boots the production bundle on a spare port with
 *      NODE_ENV=production (so demo tokens are rejected, as they are on the
 *      live site) and walks every /api route unauthenticated, then with a real
 *      student token.
 *
 *   2. Firestore rules, through the CLIENT SDK so the rules are actually
 *      enforced. The Admin SDK bypasses them entirely, which is why fixtures
 *      written by other scripts always "work" — that is the trap this avoids.
 *
 * Accounts are throwaway and deleted at the end.
 */
import './env';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  initializeFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, query, where, limit as fsLimit, serverTimestamp, addDoc,
} from 'firebase/firestore';
import * as admin from 'firebase-admin';
import { spawn, ChildProcess } from 'node:child_process';


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

const PASSWORD = 'checkSecurity!123';
const PORT = 3199;
// 127.0.0.1, never "localhost". On Linux CI runners localhost resolves to ::1
// first and Node's fetch honours that, so if the server happens to bind IPv4
// only, every probe fails and the suite reports "server did not come up" —
// which looks like a security failure and is really a DNS preference. Windows
// resolves localhost to 127.0.0.1 first, which is why this passed locally and
// failed in CI.
const BASE = `http://127.0.0.1:${PORT}`;
const uids: string[] = [];
let failures = 0;
let passes = 0;

function pass(msg: string) { passes++; console.log(`[PASS] ${msg}`); }
function fail(msg: string) {
  failures++;
  console.error(`[FAIL] ${msg}`);
  // GitHub Actions logs need authentication to read, so a failure that only
  // exists in the log is invisible to anyone triaging from the API or the
  // summary page. ::error:: surfaces it as an annotation on the run itself.
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error title=check:security::${msg.split('\n').join(' ')}`);
  }
}

/**
 * Every probe is time-boxed. The Firestore client retries some failures at the
 * gRPC layer instead of rejecting, so a denied read can hang rather than throw
 * — which stalls the whole suite instead of reporting anything. A check that
 * cannot answer in time is a failed check, not a reason to wait forever.
 */
function withTimeout<T>(label: string, ms: number, p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms}ms: ${label}`)), ms)),
  ]);
}

/** Asserts the operation is REFUSED. A success here is a security hole. */
async function mustDeny(label: string, fn: () => Promise<unknown>) {
  try {
    await withTimeout(label, 20000, Promise.resolve().then(fn));
    fail(`${label} — was ALLOWED, expected denial`);
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'permission-denied' || code === 'unauthenticated') pass(label);
    else fail(`${label} — denied, but with an unexpected error: ${code || err?.message}`);
  }
}

/** Asserts the operation SUCCEEDS, so the suite cannot pass by breaking everything. */
async function mustAllow(label: string, fn: () => Promise<unknown>) {
  try {
    await withTimeout(label, 20000, Promise.resolve().then(fn));
    pass(label);
  } catch (err: any) {
    fail(`${label} — was DENIED (${err?.code || err?.message}), expected success`);
  }
}

function expectStatus(label: string, actual: number, allowed: number[]) {
  if (allowed.includes(actual)) pass(`${label} → ${actual}`);
  else fail(`${label} → ${actual}, expected one of ${allowed.join('/')}`);
}

async function makeUser(role: 'student' | 'organization') {
  const email = `check_sec_${role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
  const { user } = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  uids.push(user.uid);
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid, email, role,
    twoFactorEnabled: role === 'organization',
    createdAt: serverTimestamp(),
  });
  if (role === 'student') {
    await setDoc(doc(db, 'students', user.uid), {
      uid: user.uid, fullName: 'Sec Check', school: '', grade: '11', neighborhood: '',
      interests: [], skills: [], availability: [], resumeUrl: '', passportUrl: '',
    });
  } else {
    await setDoc(doc(db, 'organizations', user.uid), {
      uid: user.uid, organizationName: 'Sec Check Org', mission: 'm', organizationType: 'Other',
      address: 'a', coordinates: null, contactEmail: email, phone: '', northYorkConfirmed: false,
      websiteUrl: '', hasCra: null, craNumber: '', craVerified: false, verificationStatus: 'unverified',
    });
  }
  return { uid: user.uid, email };
}

// ── 1. HTTP API ────────────────────────────────────────────────────────────

let server: ChildProcess | undefined;

async function bootServer() {
  // Piped, not ignored. The first version swallowed the child's output, so a
  // server that refused to start reported only "did not come up" with no clue
  // why — the harness has to be able to explain its own failure.
  let log = '';
  server = spawn(process.execPath, ['dist/server.cjs'], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (d) => { log += d.toString(); });
  server.stderr?.on('data', (d) => { log += d.toString(); });
  server.on('error', (e) => { log += `\nspawn error: ${e.message}`; });

  // Probe an API route rather than '/'. In production the SPA fallback needs
  // built client assets, so '/' can answer 500 for reasons unrelated to
  // whether the API — the thing under test — is listening.
  // 180s, not 40s. A CI runner is slower than a laptop and the server does real
  // work before it listens: Firebase Admin init, then a full leaderboard
  // rebuild. Forty seconds was enough locally and is not a safe margin there.
  const attempts = 360;
  for (let i = 0; i < attempts; i++) {
    if (server.exitCode !== null) {
      throw new Error(`server exited early with code ${server.exitCode}. Output:\n${log}`);
    }
    try {
      const r = await fetch(`${BASE}/api/email/history`, { method: 'GET' });
      if (r.status === 401) return; // listening, and rejecting anonymous callers
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `server did not answer on ${BASE} within ${(attempts * 500) / 1000}s. Output:\n${log || '(the server printed nothing)'}`,
  );
}

const ROUTES: Array<{ method: string; path: string; body?: unknown }> = [
  { method: 'POST', path: '/api/leaderboard/refresh' },
  { method: 'GET', path: '/api/opportunities/abc123/accepted-count' },
  { method: 'POST', path: '/api/auth/send-otp' },
  { method: 'POST', path: '/api/auth/verify-otp', body: { code: '000000' } },
  { method: 'POST', path: '/api/email/send', body: { to: 'x@example.com', subject: 's', templateName: 'welcome_student' } },
  { method: 'GET', path: '/api/email/history' },
  { method: 'POST', path: '/api/feedback/analyze', body: { subject: 's', message: 'm' } },
  { method: 'POST', path: '/api/hours/approve', body: { studentId: 'x', hours: 1 } },
];

async function apiChecks(studentToken: string, orgToken: string, victimStudentId: string) {
  console.log('\n── HTTP API ──');

  // (a) No credentials at all.
  for (const r of ROUTES) {
    const res = await fetch(BASE + r.path, {
      method: r.method,
      headers: { 'Content-Type': 'application/json' },
      body: r.method === 'POST' ? JSON.stringify(r.body || {}) : undefined,
    });
    expectStatus(`unauthenticated ${r.method} ${r.path}`, res.status, [401]);
  }

  // (b) Self-asserted demo token — anyone can type this one.
  for (const path of ['/api/email/send', '/api/email/history', '/api/feedback/analyze']) {
    const res = await fetch(BASE + path, {
      method: path === '/api/email/history' ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer demo-mode-token-developer' },
      body: path === '/api/email/history' ? undefined : JSON.stringify({ to: 'x@example.com', subject: 's', templateName: 'welcome_student', message: 'm' }),
    });
    expectStatus(`forged demo token in production ${path}`, res.status, [401]);
  }

  // (c) A real student reaching for the developer-only console.
  const hist = await fetch(`${BASE}/api/email/history`, { headers: { Authorization: `Bearer ${studentToken}` } });
  expectStatus('student GET /api/email/history (developer-only)', hist.status, [403]);

  // (d) THE PHISHING VECTOR.
  //
  // Any account can send mail through our Resend domain. The `notification`
  // template renders an arbitrary button, and `actionUrl` came straight from
  // the request body — so a signed-up student could send mail that passes
  // SPF/DKIM for the real domain, looks identical to a genuine notice, and
  // links anywhere. Rate limiting caps the volume; it does not make the mail
  // less convincing.
  const phish = await fetch(`${BASE}/api/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({
      to: 'security-probe@example.com',
      subject: 'Action required',
      templateName: 'notification',
      templateData: {
        heading: 'Verify your account',
        details: 'Click below.',
        actionLabel: 'Verify now',
        actionUrl: 'https://evil.example.com/harvest',
      },
    }),
  });
  const phishBody = await phish.json().catch(() => ({} as any));
  if (phish.status === 400 && /url|origin|link/i.test(JSON.stringify(phishBody))) {
    pass('off-site actionUrl in a notification email is rejected');
  } else if (phish.ok) {
    fail('off-site actionUrl was ACCEPTED — the send endpoint can emit phishing links from our domain');
  } else {
    // 502/503 means mail is unconfigured here; the URL check runs before send,
    // so reaching the mailer at all means the payload was accepted.
    fail(`off-site actionUrl was not rejected before sending (status ${phish.status})`);
  }

  // (e) A same-origin actionUrl must still be accepted — a fix that blocks
  //     genuine mail is worse than the hole it closes.
  //
  //     Addressed to Resend's sink so a run with a working key does not put a
  //     bounce against the sending domain every time. What matters is only
  //     whether the URL check let it through, so any answer other than the
  //     400 above counts: 200 sent, 502/503 mean it reached the mailer.
  const legit = await fetch(`${BASE}/api/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({
      to: 'delivered@resend.dev',
      subject: 'Security check — same-origin link',
      templateName: 'notification',
      templateData: {
        heading: 'Welcome', details: 'All set.', actionLabel: 'Open',
        actionUrl: (process.env.APP_URL || 'https://volunteerny-app-v2.vercel.app') + '/org/profile',
      },
    }),
  });
  if (legit.status === 400) fail('same-origin actionUrl was REJECTED — the fix breaks genuine mail');
  else pass(`same-origin actionUrl still accepted → ${legit.status}`);

  // (e2) THE OTHER HALF OF THE PHISHING VECTOR.
  //
  // Constraining actionUrl only covered the `notification` template. Any
  // account could still name `auth_verification` or `admin_alert` and get a
  // pixel-identical two-factor code notice or security bulletin, SPF- and
  // DKIM-signed by the real domain, sent to any address, with the subject line
  // under its control. Both are server-internal now; the endpoint must refuse
  // them by name.
  for (const templateName of ['auth_verification', 'admin_alert']) {
    const res = await fetch(`${BASE}/api/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        to: 'security-probe@example.com',
        subject: 'Your verification code',
        templateName,
        templateData: { userName: 'Student', code: '184920', subject: 'Alert', details: 'Act now.' },
      }),
    });
    expectStatus(`student requesting server-internal template '${templateName}'`, res.status, [403]);
  }

  // (f) HOURS APPROVAL — the authority that moved off the client.
  //
  // Rules can no longer be the check here, so these are the check. Before the
  // move, every one of these was a successful write straight from a browser.
  const hoursCall = (token: string, body: unknown) =>
    fetch(`${BASE}/api/hours/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  const asStudent = await hoursCall(studentToken, { studentId: victimStudentId, hours: 5 });
  expectStatus('student calls /api/hours/approve (not an organization)', asStudent.status, [403]);

  const unrelated = await hoursCall(orgToken, { studentId: victimStudentId, hours: 5 });
  expectStatus('UNRELATED org credits a student it never worked with', unrelated.status, [403]);

  const forged = await hoursCall(orgToken, { studentId: victimStudentId, hours: 99999 });
  expectStatus('org submits an out-of-range hours value', forged.status, [400]);

  const negative = await hoursCall(orgToken, { studentId: victimStudentId, hours: -5 });
  expectStatus('org submits negative hours', negative.status, [400]);

  const noStudent = await hoursCall(orgToken, { hours: 5 });
  expectStatus('org omits studentId', noStudent.status, [400]);

  const forgedRequest = await hoursCall(orgToken, {
    studentId: victimStudentId, hours: 5, requestId: 'does-not-exist',
  });
  expectStatus('org cites a non-existent hoursRequest', forgedRequest.status, [403]);

  // (g) READING a student's record — the same relationship problem as writing.
  const reviewCall = (token: string, id: string) =>
    fetch(`${BASE}/api/students/${encodeURIComponent(id)}/review-profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });

  const unrelatedRead = await reviewCall(orgToken, victimStudentId);
  expectStatus('UNRELATED org reads a student profile', unrelatedRead.status, [403]);

  const studentRead = await reviewCall(studentToken, victimStudentId);
  expectStatus('student reads another student via the review endpoint', studentRead.status, [403]);

  const anonRead = await fetch(`${BASE}/api/students/${victimStudentId}/review-profile`);
  expectStatus('anonymous reads the review endpoint', anonRead.status, [401]);
}

/**
 * Self-approval of graduation hours.
 *
 * The student writes coordinatorContact when they submit an hours request, so
 * if the approval endpoint treats "your email matches coordinatorContact" as
 * proof of a relationship, the student is naming their own approver. Signing up
 * costs nothing and Firebase does not require ownership proof of an address, so
 * the same person can hold both accounts.
 *
 * Ontario requires 40 community-involvement hours to graduate. This must fail.
 */
/**
 * The same self-approval attack as below, but through the SECURITY RULES
 * instead of the API.
 *
 * The rules let "the coordinator" flip an hoursRequest to approved, identifying
 * the coordinator as `existing().coordinatorContact == request.auth.token.email`.
 * The student writes coordinatorContact when they create the request, so a
 * student who names their own address satisfies that check from their own
 * session.
 *
 * It does not credit hours (students/{uid}.hours is server-only), which is why
 * this survived the API fix. What it does is worse than it looks: the
 * organization's queue filters on status == 'pending', so a self-flipped
 * request silently disappears from their list, while the student's dashboard
 * renders it as approved. A real request can be made to vanish and the UI
 * reports a state the database does not agree with.
 *
 * Also checks that an absurd hours value is refused at create time.
 */
async function hoursRequestRuleChecks(student: { uid: string; email: string }) {
  console.log('\n── hoursRequests rules ──');
  await signOut(auth);
  await signInWithEmailAndPassword(auth, student.email, PASSWORD);

  const base = {
    studentId: student.uid,
    studentName: 'Sec Check',
    studentEmail: student.email,
    activity: 'Rule probe',
    organization: 'Somewhere',
    date: '2026-01-01',
    coordinatorName: 'Me',
    status: 'pending',
    requestedAt: new Date().toISOString(),
  };

  // A student naming themselves as the coordinator, then approving it.
  const mine = await addDoc(collection(db, 'hoursRequests'), {
    ...base, hours: 5, coordinatorContact: student.email,
  });
  await mustDeny('student approves their own hours request via the rules', () =>
    updateDoc(doc(db, 'hoursRequests', mine.id), { status: 'approved' }));
  await mustDeny('student declines their own hours request via the rules', () =>
    updateDoc(doc(db, 'hoursRequests', mine.id), { status: 'declined' }));

  // An unbounded hours value.
  await mustDeny('student submits an absurd number of hours', () =>
    addDoc(collection(db, 'hoursRequests'), {
      ...base, hours: 100000, coordinatorContact: 'someone@example.org',
    }));
  await mustDeny('student submits negative hours', () =>
    addDoc(collection(db, 'hoursRequests'), {
      ...base, hours: -5, coordinatorContact: 'someone@example.org',
    }));

  // A plausible request must still be creatable, so the bound cannot pass by
  // rejecting everything.
  await mustAllow('a normal hours request is still accepted', () =>
    addDoc(collection(db, 'hoursRequests'), {
      ...base, hours: 4, coordinatorContact: 'someone@example.org',
    }));

  const adb = adminFirestore();
  if (adb) {
    const stale = await adb.collection('hoursRequests').where('studentId', '==', student.uid).get();
    for (const d of stale.docs) await d.ref.delete().catch(() => {});
  }
}

async function selfApprovalCheck(student: { uid: string; email: string }) {
  console.log('\n── Self-approval of hours ──');

  // 1. As the student: submit a request naming an address we control.
  await signOut(auth);
  await signInWithEmailAndPassword(auth, student.email, PASSWORD);
  const accompliceEmail = `check_sec_accomplice_${Date.now()}@example.com`;
  const reqRef = await addDoc(collection(db, 'hoursRequests'), {
    studentId: student.uid,
    studentName: 'Sec Check',
    studentEmail: student.email,
    activity: 'Self-approval probe',
    organization: 'Totally Real Charity',
    hours: 20,
    date: '2026-01-01',
    coordinatorName: 'Me Again',
    coordinatorContact: accompliceEmail,
    status: 'pending',
    requestedAt: new Date().toISOString(),
  });

  // 2. Register that same address as an organization.
  await signOut(auth);
  const { user: accomplice } = await createUserWithEmailAndPassword(auth, accompliceEmail, PASSWORD);
  uids.push(accomplice.uid);
  await setDoc(doc(db, 'users', accomplice.uid), {
    uid: accomplice.uid, email: accompliceEmail, role: 'organization',
    twoFactorEnabled: true, createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'organizations', accomplice.uid), {
    uid: accomplice.uid, organizationName: 'Totally Real Charity', mission: 'm',
    organizationType: 'Other', address: 'a', coordinates: null, contactEmail: accompliceEmail,
    phone: '', northYorkConfirmed: false, websiteUrl: '', hasCra: null, craNumber: '',
    craVerified: false, verificationStatus: 'unverified',
  });
  const token = await accomplice.getIdToken();

  // 3. Approve our own 40 hours.
  const res = await fetch(`${BASE}/api/hours/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ studentId: student.uid, requestId: reqRef.id, hours: 20, activity: 'Self-approval probe', date: '2026-01-01' }),
  });

  if (res.status === 403) {
    pass('a student cannot approve their own hours via a self-named coordinator');
  } else {
    fail(`SELF-APPROVAL SUCCEEDED (status ${res.status}) — a student can grant themselves graduation hours`);
  }

  // Whatever the endpoint decided, the student must not have been credited.
  const adb = adminFirestore();
  if (adb) {
    const after = await adb.collection('students').doc(student.uid).get();
    const credited = Number(after.data()?.hours || 0);
    if (credited === 0) pass('no hours were written by the self-approval attempt');
    else fail(`student was credited ${credited} hours by a self-approval`);
    await adb.collection('hoursRequests').doc(reqRef.id).delete().catch(() => {});
  }
}

// ── 2. Firestore rules, via the client SDK ─────────────────────────────────

async function firestoreChecks(
  studentA: { uid: string; email: string },
  studentB: { uid: string; email: string },
  org: { uid: string; email: string },
) {
  console.log('\n── Firestore rules ──');

  // Emails come from makeUser, never from a re-read: looking them up in
  // Firestore would itself need permission we are about to prove we lack.
  await signInWithEmailAndPassword(auth, studentA.email, PASSWORD);

  await mustAllow('student reads their own profile', () => getDoc(doc(db, 'students', studentA.uid)));
  await mustDeny("student reads ANOTHER student's profile", () => getDoc(doc(db, 'students', studentB.uid)));
  await mustDeny("student reads another user's account doc", () => getDoc(doc(db, 'users', studentB.uid)));
  await mustDeny('student enumerates the whole students collection', () =>
    getDocs(query(collection(db, 'students'), fsLimit(5))));
  await mustDeny('student enumerates the users collection', () =>
    getDocs(query(collection(db, 'users'), fsLimit(5))));
  await mustDeny('student promotes themselves to developer', () =>
    updateDoc(doc(db, 'users', studentA.uid), { role: 'developer' }));
  await mustDeny('student credits themselves hours', () =>
    updateDoc(doc(db, 'students', studentA.uid), { loggedHours: [{ id: 'x', hours: 99, approved: true }] }));
  await mustDeny('student sets their own leaderboard total', () =>
    updateDoc(doc(db, 'students', studentA.uid), { hours: 9999 }));
  await mustDeny('student writes the materialised leaderboard', () =>
    setDoc(doc(db, 'leaderboards', 'global_top'), { entries: [{ userId: studentA.uid, name: 'me', score: 99999 }] }));
  await mustDeny("student edits another student's profile", () =>
    updateDoc(doc(db, 'students', studentB.uid), { fullName: 'hacked' }));
  await mustDeny('student self-verifies an organization', () =>
    updateDoc(doc(db, 'organizations', org.uid), { craVerified: true, verificationStatus: 'verified' }));
  await mustDeny('student deletes another account', () => deleteDoc(doc(db, 'users', studentB.uid)));

  // Signed in as the organization.
  await signOut(auth);
  await signInWithEmailAndPassword(auth, org.email, PASSWORD);

  await mustDeny('org self-issues a verified badge', () =>
    updateDoc(doc(db, 'organizations', org.uid), { craVerified: true }));
  await mustDeny('org marks itself verificationStatus=verified', () =>
    updateDoc(doc(db, 'organizations', org.uid), { verificationStatus: 'verified' }));
  await mustDeny('org opts itself out of two-factor', () =>
    updateDoc(doc(db, 'users', org.uid), { twoFactorEnabled: false }));
  await mustDeny('org reads a student profile directly (resume + passport)', () =>
    getDoc(doc(db, 'students', studentA.uid)));
  await mustDeny('org enumerates every student', () =>
    getDocs(query(collection(db, 'students'), fsLimit(5))));
  await mustDeny('org lists applications it does not own', () =>
    getDocs(query(collection(db, 'applications'), where('studentId', '==', studentB.uid), fsLimit(5))));

  // The organization branch is gone from students/{uid}. No client writes
  // hours now — the server does, after proving the relationship. Each of these
  // was possible before that change.
  await mustDeny('org credits a student directly from the client', () =>
    updateDoc(doc(db, 'students', studentA.uid), { hours: 1 }));
  await mustDeny('org forges an absurd hours total', () =>
    updateDoc(doc(db, 'students', studentA.uid), { hours: 999999 }));
  await mustDeny('org ERASES a student\'s logged hours', () =>
    updateDoc(doc(db, 'students', studentA.uid), { loggedHours: [], hours: 0 }));
  await mustDeny('org escalates beyond loggedHours/hours', () =>
    updateDoc(doc(db, 'students', studentA.uid), { hours: 5, fullName: 'hijacked' }));

  // References and ratings moved to the server for the same reason hours did:
  // "did this student actually volunteer here" is a query, and rules can only
  // read an exact document path. Before that, this organization — which has no
  // relationship to studentA whatsoever — could author a reference about them,
  // and any student could manufacture a rating against any organization.
  // Both client creates must now be refused outright.
  await mustDeny('org forges a reference about an unrelated student', () =>
    setDoc(doc(db, 'recommendations', `${org.uid}_${studentA.uid}_forged-opp`), {
      orgId: org.uid,
      studentId: studentA.uid,
      opportunityId: 'forged-opp',
      text: 'Fabricated reference for a student we never worked with.',
      rating: 5,
    }));

  // Signed out entirely.
  await signOut(auth);
  await mustDeny('anonymous reads a student profile', () => getDoc(doc(db, 'students', studentA.uid)));
  await mustDeny('anonymous reads an account doc', () => getDoc(doc(db, 'users', studentA.uid)));
  await mustDeny('anonymous lists organizations', () =>
    getDocs(query(collection(db, 'organizations'), fsLimit(5))));
  await mustAllow('anonymous CAN browse public opportunities', () =>
    getDocs(query(collection(db, 'opportunities'), fsLimit(1))));
}

let _adb: any = null;
function adminFirestore() {
  if (_adb) return _adb;
  const a: any = (admin as any).default || admin;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) return null;
  const app2 = a.initializeApp({ credential: a.credential.cert(JSON.parse(key)) }, 'sec-admin-' + Date.now());
  _adb = app2.firestore();
  _adb.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });
  return _adb;
}

async function cleanup() {
  const a: any = (admin as any).default || admin;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) { console.log(`[WARN] no service account key — leaving ${uids.join(', ')}`); return; }
  const adminApp = a.initializeApp({ credential: a.credential.cert(JSON.parse(key)) }, 'sec-cleanup');
  const adb = adminApp.firestore();
  adb.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });
  for (const uid of uids) {
    await adminApp.auth().deleteUser(uid).catch(() => {});
    for (const c of ['users', 'students', 'organizations']) await adb.collection(c).doc(uid).delete().catch(() => {});
  }
  console.log(`[INFO] cleaned up ${uids.length} throwaway account(s)`);
}

(async () => {
  try {
    console.log('STAGE: creating throwaway accounts');
    const studentA = await makeUser('student');
    const studentB = await makeUser('student');
    const org = await makeUser('organization');

    // Real, signed ID tokens — the same thing the browser sends.
    await signOut(auth);
    const studentToken = await (await signInWithEmailAndPassword(auth, studentA.email, PASSWORD)).user.getIdToken();
    await signOut(auth);
    const orgToken = await (await signInWithEmailAndPassword(auth, org.email, PASSWORD)).user.getIdToken();

    console.log('STAGE: booting server');
    await bootServer();
    // studentB is the victim: the org has no opportunity, application or hours
    // request connecting it to them.
    console.log('STAGE: server up, running API checks');
    await apiChecks(studentToken, orgToken, studentB.uid);
    // Runs before the Firestore half because it needs studentB's hours to still
    // be zero, and it uses studentB so a credit here cannot be confused with
    // the legitimate approval exercised in check:flows.
    console.log('STAGE: self-approval check');
    await hoursRequestRuleChecks(studentA);
    await selfApprovalCheck(studentB);
    console.log('STAGE: firestore rules checks');
    await firestoreChecks(studentA, studentB, org);
  } catch (err: any) {
    fail(`suite crashed: ${err?.message || err}`);
  } finally {
    server?.kill();
    await cleanup();
  }

  console.log(`\n${passes} passed, ${failures} failed.`);
  process.exit(failures ? 1 : 0);
})();
