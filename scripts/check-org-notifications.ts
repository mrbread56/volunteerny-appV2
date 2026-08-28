/**
 * The two messages an organisation gets about its own applicants.
 *
 *   npm run check:orgmail
 *
 * Tirgan asked on 28 Aug 2026 whether info@tirgan.ca would hear about a new
 * application, and what happens if a student pulls out. Answering meant finding
 * out that one of the two existed and the other did not, and that the existing
 * one had never been proven to work.
 *
 * Both are sent BY A STUDENT'S SESSION, which is the part worth testing. The
 * student is the one applying and the one withdrawing, so their token is what
 * reaches /api/email/send. If that endpoint refused a student — or refused the
 * template name — the organisation would simply never hear anything, and
 * nothing in the UI would say so, because both calls are deliberately
 * non-blocking: an application must not fail because a mailbox is unreachable.
 *
 * That is exactly the shape of the password-reset bug: a send that reports
 * success while delivering nothing. So this asserts the provider ACCEPTED the
 * message, not merely that the request returned.
 *
 * Mail goes to Resend's delivery sink, so nothing bounces and nobody is
 * written to.
 */
import './env';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import adminNs from 'firebase-admin';
import { spawn, ChildProcess } from 'node:child_process';

const admin: any = (adminNs as any).default ?? adminNs;

const API_PORT = 3209;
const apiBase = `http://localhost:${API_PORT}`;
let apiServer: ChildProcess | undefined;

let passed = 0;
let failed = 0;
const pass = (m: string) => { console.log(`[PASS] ${m}`); passed++; };
const fail = (m: string) => { console.error(`[FAIL] ${m}`); failed++; };

const stamp = Date.now();
const STUDENT_EMAIL = `check_orgmail_student_${stamp}@example.com`;
const PASSWORD = 'orgMail!123';
/** Resend's sink: accepted, recorded as delivered, reaches no one. */
const ORG_INBOX = 'delivered@resend.dev';
const OPP_TITLE = `Wednesday client assistant ${stamp}`;

const uids: string[] = [];
let oppId = '';

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);

let adminApp: any = null;
function adminHandle() {
  if (adminApp) return adminApp;
  adminApp = admin.initializeApp(
    { credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    'check-orgmail',
  );
  return adminApp;
}
async function db() {
  const { getFirestore } = await import('firebase-admin/firestore');
  return getFirestore(adminHandle(), process.env.FIREBASE_DATABASE_ID!);
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
    try { if ((await fetch(`${apiBase}/api/health`)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server never became healthy:\n${log}`);
}

const send = (token: string, body: unknown) =>
  fetch(`${apiBase}/api/email/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

(async () => {
  try {
    await bootApi();
    const store = await db();

    const student = await adminHandle().auth().createUser({
      email: STUDENT_EMAIL, password: PASSWORD, emailVerified: true,
    });
    uids.push(student.uid);
    await store.collection('users').doc(student.uid).set({
      uid: student.uid, email: STUDENT_EMAIL, role: 'student', twoFactorEnabled: false,
    });
    await store.collection('students').doc(student.uid).set({
      uid: student.uid, fullName: 'Journey Student', school: 'Earl Haig Secondary School',
      grade: '10', neighborhood: 'Willowdale', interests: [], skills: [], availability: [],
    });

    /*
     * A real organisation, posting and application, because /api/email/send
     * refuses recipients a caller has no relationship with. That guard reads
     * `applications where studentId == uid`, resolves each orgId, and allows
     * only those organisations' contactEmail. A student with no application
     * cannot mail anybody, which is correct and is what the first version of
     * this suite fell over on.
     */
    const org = await adminHandle().auth().createUser({
      email: `check_orgmail_org_${stamp}@example.com`, password: PASSWORD, emailVerified: true,
    });
    uids.push(org.uid);
    await store.collection('users').doc(org.uid).set({
      uid: org.uid, email: `check_orgmail_org_${stamp}@example.com`,
      role: 'organization', twoFactorEnabled: true,
    });
    await store.collection('organizations').doc(org.uid).set({
      uid: org.uid, organizationName: 'Journey Org', contactEmail: ORG_INBOX,
      verificationStatus: 'verified', craVerified: false,
    });
    const oppRef = await store.collection('opportunities').add({
      isFixture: true,
      orgId: org.uid, orgName: 'Journey Org', title: OPP_TITLE,
      description: 'd', location: 'l', category: 'Food Security',
      maxVolunteers: 1, status: 'open',
    });
    oppId = oppRef.id;
    const appId = `${student.uid}_${oppId}`;
    await store.collection('applications').doc(appId).set({
      opportunityId: oppId, orgId: org.uid, studentId: student.uid,
      status: 'pending', opportunityTitle: OPP_TITLE, studentName: 'Journey Student',
    });

    const cred = await signInWithEmailAndPassword(auth, STUDENT_EMAIL, PASSWORD);
    const token = await cred.user.getIdToken();
    pass('a student session is established, with a real application to this organisation');

    // ── the message sent when a student applies ─────────────────────────────
    const applied = await send(token, {
      to: ORG_INBOX,
      subject: `New applicant for "${OPP_TITLE}"`,
      templateName: 'new_applicant',
      templateData: {
        orgName: 'Journey Org', applicantName: 'Journey Student',
        oppTitle: OPP_TITLE, message: 'I can do Wednesdays.',
        actionLabel: 'Review the application',
        actionUrl: 'https://www.volunteernorthyork.org/org/dashboard',
      },
    });
    const appliedBody: any = await applied.json().catch(() => ({}));
    if (applied.status === 200 && appliedBody?.success) {
      pass('a STUDENT may send the new-applicant notification, and it was accepted');
    } else {
      fail(`new_applicant from a student returned ${applied.status}: ${JSON.stringify(appliedBody)}`);
    }

    // ── the message sent when a student withdraws ───────────────────────────
    const withdrew = await send(token, {
      to: ORG_INBOX,
      subject: `An applicant withdrew from "${OPP_TITLE}"`,
      templateName: 'applicant_withdrew',
      templateData: {
        orgName: 'Journey Org', applicantName: 'Journey Student',
        oppTitle: OPP_TITLE, reason: 'My schedule changed.',
      },
    });
    const withdrewBody: any = await withdrew.json().catch(() => ({}));
    if (withdrew.status === 200 && withdrewBody?.success) {
      pass('a STUDENT may send the withdrawal notification, and it was accepted');
    } else {
      fail(`applicant_withdrew from a student returned ${withdrew.status}: ${JSON.stringify(withdrewBody)}`);
    }

    // ── the withdrawal message without a reason ─────────────────────────────
    // A student is not obliged to explain, and the template must not render an
    // empty quotation block when they decline to.
    const noReason = await send(token, {
      to: ORG_INBOX,
      subject: 'An applicant withdrew',
      templateName: 'applicant_withdrew',
      templateData: { orgName: 'Journey Org', applicantName: 'Journey Student', oppTitle: OPP_TITLE },
    });
    if (noReason.status === 200) pass('withdrawal with no reason given is accepted');
    else fail(`reasonless withdrawal returned ${noReason.status}`);

    // ── what the organisation actually reads ────────────────────────────────
    const { emailTemplates } = await import('../server/emailTemplates.js');
    const withReason = emailTemplates.applicant_withdrew('Journey Org', 'Journey Student', OPP_TITLE, 'My schedule changed.');
    if (withReason.includes('Journey Student') && withReason.includes(OPP_TITLE)) {
      pass('the withdrawal email names the student and the posting');
    } else {
      fail('the withdrawal email is missing the student or the posting');
    }
    if (withReason.includes('My schedule changed.')) pass('the reason is included when given');
    else fail('the reason was dropped');
    if (withReason.includes('open again')) pass('it says the place is open again');
    else fail('it does not tell the organisation their place reopened');

    const without = emailTemplates.applicant_withdrew('Journey Org', 'Journey Student', OPP_TITLE);
    // The class name itself is always present: wrapBaseTemplate defines
    // .applicant-message in the shared stylesheet. What must not appear is the
    // rendered paragraph holding an empty pair of quotation marks.
    if (!/<p class="applicant-message">/.test(without)) {
      pass('no empty quotation block when no reason was given');
    } else {
      fail('an empty quotation block is rendered when the student gave no reason');
    }
    if (!without.includes('undefined')) pass('a missing reason never renders as "undefined"');
    else fail('the word "undefined" leaked into the email');

    // ── escaping ────────────────────────────────────────────────────────────
    // The reason is free text a student typed. It must not be able to inject
    // markup into a message an organisation opens in their mail client.
    const nasty = emailTemplates.applicant_withdrew(
      'Journey Org', 'Journey Student', OPP_TITLE, '<script>alert(1)</script>',
    );
    if (!nasty.includes('<script>')) pass('a student cannot inject markup through the reason field');
    else fail('the reason field is not escaped');

    // ── a student must not be able to send anything they like ───────────────
    const forbidden = await send(token, {
      to: ORG_INBOX, subject: 'nope', templateName: 'auth_verification',
      templateData: { userName: 'x', code: '123456', purpose: 'reset' },
    });
    if (forbidden.status >= 400) {
      pass(`server-internal templates stay unreachable from a client (${forbidden.status})`);
    } else {
      fail('a student was able to send a server-internal auth template');
    }
    /*
     * Why the withdrawal email is sent BEFORE the application is deleted.
     *
     * The relationship guard reads the applications collection. Once the
     * document is gone the student has no connection to that organisation any
     * more, and the very message telling them so is refused — a 403 the student
     * never sees, on a call that is deliberately non-blocking, so the
     * organisation is simply never told. Deleting first would have shipped a
     * feature that silently did nothing.
     */
    await store.collection('applications').doc(appId).delete();
    const afterDelete = await send(await cred.user.getIdToken(true), {
      to: ORG_INBOX, subject: 'too late',
      templateName: 'applicant_withdrew',
      templateData: { orgName: 'Journey Org', applicantName: 'Journey Student', oppTitle: OPP_TITLE },
    });
    if (afterDelete.status === 403) {
      pass('once the application is deleted the same send is refused — order matters, and it is right');
    } else {
      fail(`after deleting the application the send returned ${afterDelete.status}, expected 403`);
    }
  } catch (err: any) {
    fail(`suite crashed: ${err?.stack || err?.message || err}`);
  } finally {
    apiServer?.kill();
    await signOut(auth).catch(() => {});
    try {
      const store = await db();
      if (oppId) {
        await store.collection('opportunities').doc(oppId).delete().catch(() => {});
        await store.collection('applications').doc(`${uids[0]}_${oppId}`).delete().catch(() => {});
      }
      for (const uid of uids) await store.collection('organizations').doc(uid).delete().catch(() => {});
      for (const uid of uids) {
        for (const c of ['users', 'students']) await store.collection(c).doc(uid).delete().catch(() => {});
        await adminHandle().auth().deleteUser(uid).catch(() => {});
      }
      console.log(`\ncleaned up ${uids.length} account(s)`);
    } catch { /* best effort */ }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
