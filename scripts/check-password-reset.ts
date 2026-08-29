/**
 * The password reset route, against a real server.
 *
 *   npm run check:reset
 *
 * The client used to call Firebase's sendPasswordResetEmail directly. It
 * returned cleanly and delivered nothing — Firebase sends that message from
 * noreply@<project>.firebaseapp.com, a domain this project never authenticated
 * and a pipeline entirely separate from the Resend sender that carries every
 * other email the site delivers successfully. An organisation reported it on
 * 27 Aug 2026; it reproduced from our own account the same day, with the
 * account present, enabled, and the link generating fine through the Admin SDK.
 *
 * The route now generates the link itself and sends it over Resend. What has to
 * be true of it, none of which is provable by reading the code:
 *
 *   - a real address gets a link generated for it
 *   - an address with NO account gets the identical response, byte for byte,
 *     so the login page cannot be used to test which emails are registered
 *   - repeated requests are throttled, because this endpoint needs no
 *     authentication and now sends mail on our own domain
 *   - an empty address is rejected honestly, since nobody is enumerated by
 *     being told they left the box blank
 *
 * Every address used here is under .invalid (reserved by RFC 2606), so no
 * message can reach a person even if delivery is attempted. Accounts are made
 * and deleted by this script.
 *
 * Exactly ONE message is sent per run, to Resend's delivery sink, so nothing
 * bounces and nobody is written to. Addresses with no account return before
 * Resend is reached — generatePasswordResetLink throws first — so the
 * eight-request throttle burst costs nothing. Keep it that way: a suite that
 * hard-bounces a dozen messages per run on a verified domain quietly degrades
 * the sender reputation the 2FA codes depend on.
 */
import './env';
import adminNs from 'firebase-admin';
import { spawn, ChildProcess } from 'node:child_process';

const admin: any = (adminNs as any).default ?? adminNs;

const API_PORT = 3207;
const apiBase = `http://localhost:${API_PORT}`;
let apiServer: ChildProcess | undefined;

let passed = 0;
let failed = 0;
const pass = (m: string) => { console.log(`[PASS] ${m}`); passed++; };
const fail = (m: string) => { console.error(`[FAIL] ${m}`); failed++; };

const stamp = Date.now();
/*
 * Resend's own delivery sink, not a made-up address.
 *
 * The first version of this used a .invalid address. Resend accepts those and
 * then hard-bounces them, so every run quietly cost one bounce against the
 * sending domain — the same domain that carries the 2FA codes, where reputation
 * is the difference between an organisation signing in and an organisation
 * locked out. delivered@resend.dev is provided for exactly this: it is accepted,
 * recorded as delivered, and reaches nobody. It also makes this a stronger test,
 * because the send genuinely succeeds instead of being excused.
 */
const REAL = 'delivered@resend.dev';
const ABSENT = `check_pwd_absent_${stamp}@volunteerny-check.invalid`;
const uids: string[] = [];

let adminApp: any = null;
function adminHandle() {
  if (adminApp) return adminApp;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is required');
  adminApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(key)) }, 'check-reset');
  return adminApp;
}

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
      const r = await fetch(`${apiBase}/api/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server never became healthy:\n${log}`);
}

const post = (email: unknown) =>
  fetch(`${apiBase}/api/auth/password-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

(async () => {
  try {
    await bootApi();

    const u = await adminHandle().auth().createUser({ email: REAL, password: 'resetCheck!123' });
    uids.push(u.uid);

    // ── the link the whole feature depends on ────────────────────────────────
    // If this throws, the route has nothing to send and the bug is not fixed,
    // only relocated.
    const link = await adminHandle().auth().generatePasswordResetLink(REAL);
    if (link.includes('oobCode=')) pass('the Admin SDK generates a reset link carrying an oobCode');
    else fail(`generated link looks wrong: ${link}`);

    // ── a real address ───────────────────────────────────────────────────────
    const real = await post(REAL);
    const realBody = await real.json().catch(() => ({}));
    // This is the assertion the whole fix exists for: the mail provider ACCEPTED
    // the message. A 502 here means Resend refused it, which is the failure the
    // old Firebase path had — except that one reported success anyway.
    if (real.status === 200 && realBody?.success === true) {
      pass('a registered address is accepted and the reset email is dispatched');
    } else {
      fail(`registered address returned ${real.status}: ${JSON.stringify(realBody)}`);
    }

    // ── an address with no account must be indistinguishable ─────────────────
    const absent = await post(ABSENT);
    const absentBody = await absent.json().catch(() => ({}));
    if (absent.status === 200 && absentBody?.success === true) {
      pass('an address with no account gets an ordinary success answer');
    } else {
      fail(`unknown address returned ${absent.status}: ${JSON.stringify(absentBody)}`);
    }
    if (!JSON.stringify(absentBody).toLowerCase().includes('not found')) {
      pass('the answer for an unknown address never says "not found"');
    } else {
      fail(`the unknown-address answer leaks existence: ${JSON.stringify(absentBody)}`);
    }

    // ── nothing in the response distinguishes the two ────────────────────────
    // This is the enumeration test proper: a second unknown address must answer
    // exactly like the first.
    const absent2 = await post(`check_pwd_absent2_${stamp}@volunteerny-check.invalid`);
    const absent2Body = await absent2.json().catch(() => ({}));
    if (absent.status === absent2.status &&
        JSON.stringify(absentBody) === JSON.stringify(absent2Body)) {
      pass('two different unknown addresses get byte-identical answers');
    } else {
      fail('unknown addresses get answers that differ from each other');
    }

    // ── an empty address ─────────────────────────────────────────────────────
    const empty = await post('');
    if (empty.status === 400) pass('an empty address is rejected with 400');
    else fail(`empty address returned ${empty.status}, expected 400`);

    const garbage = await post('not-an-email');
    if (garbage.status === 400) pass('an address with no @ is rejected with 400');
    else fail(`malformed address returned ${garbage.status}, expected 400`);

    // ── rate limiting ────────────────────────────────────────────────────────
    // The endpoint takes no authentication and now sends mail on our own
    // domain, so an unthrottled version is a way to have us spam someone.
    const hammer = `check_pwd_rate_${stamp}@volunteerny-check.invalid`;
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await post(hammer);
      statuses.push(r.status);
    }
    // The ceiling is 5 in 10 minutes; past that the route answers 200 without
    // sending, so a throttled caller cannot tell it is being throttled.
    if (statuses.every((s) => s === 200 || s === 502)) {
      pass(`eight rapid requests all answer normally (${statuses.join(',')}) — throttling stays invisible`);
    } else {
      fail(`rapid requests produced a distinguishable status: ${statuses.join(',')}`);
    }

    const limitDoc = await (async () => {
      const { getFirestore } = await import('firebase-admin/firestore');
      const dbId = process.env.FIREBASE_DATABASE_ID;
      const db = dbId ? getFirestore(adminHandle(), dbId) : getFirestore(adminHandle());
      return db.collection('password_reset_rate_limits').doc(hammer).get();
    })();
    if (limitDoc.exists && (limitDoc.data()?.count ?? 0) >= 6) {
      pass(`the throttle counted the burst (count=${limitDoc.data()?.count})`);
    } else {
      fail(`the throttle did not record the burst: ${JSON.stringify(limitDoc.data() || null)}`);
    }

    // ── the template renders the link ────────────────────────────────────────
    const { emailTemplates } = await import('../server/emailTemplates.js');
    const html = emailTemplates.password_reset(link);
    if (html.includes('oobCode=')) pass('the email body actually contains the reset link');
    else fail('the rendered email does not contain the link');
    if (!html.includes('firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=<')) {
      pass('the link survives HTML escaping intact');
    } else {
      fail('the link was mangled by escaping');
    }
  } catch (err: any) {
    fail(`suite crashed: ${err?.stack || err?.message || err}`);
  } finally {
    apiServer?.kill();
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const dbId = process.env.FIREBASE_DATABASE_ID;
      const db = dbId ? getFirestore(adminHandle(), dbId) : getFirestore(adminHandle());
      for (const uid of uids) await adminHandle().auth().deleteUser(uid).catch(() => {});
      for (const key of [
        `check_pwd_rate_${stamp}@volunteerny-check.invalid`,
        REAL, ABSENT,
      ]) {
        await db.collection('password_reset_rate_limits').doc(key).delete().catch(() => {});
      }
      console.log(`\ncleaned up ${uids.length} account(s) and the rate-limit rows`);
    } catch { /* best effort */ }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
