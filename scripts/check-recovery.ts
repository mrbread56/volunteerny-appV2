/**
 * Recovery codes, end to end against a real server.
 *
 *   npm run check:recovery
 *
 * ROADMAP B2. Two-factor is mandatory for organisations and arrives by email, so
 * a bounced address or a departed staff member locked an organisation out of its
 * own dashboard permanently — the only route back was emailing us and a
 * developer running a script by hand. That is a support process, not recovery,
 * and it does not work at two in the morning.
 *
 * What has to be true, and none of it is provable by reading the code:
 *
 *   - a code actually lets someone in, granting the same claim the emailed one
 *     grants and pinned to the same sign-in
 *   - a code works exactly ONCE
 *   - a wrong code is refused
 *   - generating a new set invalidates the old one, so a leaked printout stops
 *     working
 *   - nobody else's code works on your account
 *
 * Runs against the live project through the Admin SDK and a real server, and
 * cleans up after itself.
 */
import './env';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import adminNs from 'firebase-admin';
import { spawn, ChildProcess } from 'node:child_process';

const admin: any = (adminNs as any).default ?? adminNs;

const API_PORT = 3203;
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
const auth = getAuth(app);

const PASSWORD = 'checkRecovery!123';
const stamp = Date.now();
const uids: string[] = [];

let adminApp: any = null;
let adminDb: any = null;

/**
 * Firestore against the NAMED database.
 *
 * `admin.firestore()` alone addresses "(default)", which this project does not
 * have — every read then comes back empty and any test that treats "not found"
 * as a finding reports a bug that is not there. Which is exactly what happened
 * the first time this suite ran.
 */
async function adminDbHandle() {
  if (adminDb) return adminDb;
  const { getFirestore } = await import('firebase-admin/firestore');
  const dbId = process.env.FIREBASE_DATABASE_ID;
  adminDb = dbId ? getFirestore(adminHandle(), dbId) : getFirestore(adminHandle());
  return adminDb;
}

function adminHandle() {
  if (adminApp) return adminApp;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is required');
  adminApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(key)) }, 'check-recovery');
  return adminApp;
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

async function makeOrg(tag: string) {
  const email = `check_rec_${tag}_${stamp}@example.com`;
  const { user } = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  uids.push(user.uid);
  await adminHandle().auth().updateUser(user.uid, { emailVerified: true });
  return { uid: user.uid, email };
}

const tokenFor = async (email: string) => {
  await signOut(auth);
  await signInWithEmailAndPassword(auth, email, PASSWORD);
  return auth.currentUser!.getIdToken(true);
};

const post = (path: string, token: string, body: unknown) =>
  fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

(async () => {
  try {
    await bootApi();

    const org = await makeOrg('a');
    const other = await makeOrg('b');

    // ── generate ────────────────────────────────────────────────────────────
    let token = await tokenFor(org.email);
    const genRes = await post('/api/auth/backup-codes', token, {});
    const gen: any = await genRes.json();
    if (genRes.ok && Array.isArray(gen.codes) && gen.codes.length === 10) {
      pass(`ten recovery codes issued (${gen.codes[0]})`);
    } else {
      fail(`code generation failed (${genRes.status}) ${JSON.stringify(gen).slice(0, 120)}`);
      throw new Error('cannot continue without codes');
    }

    // Only the hashes are stored. A database copy must not yield working codes.
    const db = await adminDbHandle();
    const stored = await db.collection('mfaBackupCodes').doc(org.uid).get().catch(() => null);
    const storedDoc = stored?.exists ? stored.data() : null;
    if (!storedDoc) {
      fail('the recovery codes document was not written at all');
    } else {
      const raw = JSON.stringify(storedDoc);
      const bare = String(gen.codes[0]).replace('-', '');
      const leaked = raw.includes(gen.codes[0]) || raw.includes(bare);
      if (leaked) fail('a recovery code was found in plaintext in the database');
      else pass('only hashes are stored, never the codes themselves');
    }

    // ── a wrong code is refused ─────────────────────────────────────────────
    const badRes = await post('/api/auth/backup-codes/redeem', token, { code: 'ZZZZZ-ZZZZZ' });
    if (badRes.status === 400) pass('a wrong code is refused');
    else fail(`a wrong code returned ${badRes.status}, expected 400`);

    // ── someone else's code does not work on your account ───────────────────
    const otherToken = await tokenFor(other.email);
    await post('/api/auth/backup-codes', otherToken, {});
    const crossRes = await post('/api/auth/backup-codes/redeem', otherToken, { code: gen.codes[1] });
    if (crossRes.status === 400) pass("another account's code does not work here");
    else fail(`a code from a different account returned ${crossRes.status}, expected 400`);

    // ── redeem, and check the claim it grants ───────────────────────────────
    token = await tokenFor(org.email);
    const authTime = Number((await auth.currentUser!.getIdTokenResult()).claims.auth_time);
    const okRes = await post('/api/auth/backup-codes/redeem', token, { code: gen.codes[0] });
    const ok: any = await okRes.json();
    if (okRes.ok && ok.success) pass(`a valid code is accepted (${ok.remaining} left)`);
    else fail(`a valid code was refused (${okRes.status}) ${JSON.stringify(ok).slice(0, 120)}`);

    const claims = (await adminHandle().auth().getUser(org.uid)).customClaims || {};
    if (claims.mfaVerified === true && Number(claims.mfaVerifiedFor) === authTime) {
      pass('it grants the same per-sign-in claim the emailed code grants');
    } else {
      fail(`the claim is wrong or not pinned to this sign-in: ${JSON.stringify(claims)}`);
    }

    // ── single use ──────────────────────────────────────────────────────────
    const replayRes = await post('/api/auth/backup-codes/redeem', token, { code: gen.codes[0] });
    if (replayRes.status === 400) pass('a spent code cannot be used again');
    else fail(`a spent code returned ${replayRes.status}, expected 400`);

    // ── regenerating invalidates the old set ────────────────────────────────
    const regenRes = await post('/api/auth/backup-codes', token, {});
    const regen: any = await regenRes.json();
    const oldStillWorks = await post('/api/auth/backup-codes/redeem', token, { code: gen.codes[2] });
    if (oldStillWorks.status === 400) pass('generating a new set invalidates the old one');
    else fail('a code from the previous set still worked — a leaked printout would never expire');

    const newWorks = await post('/api/auth/backup-codes/redeem', token, { code: regen.codes[0] });
    if (newWorks.ok) pass('a code from the new set works');
    else fail(`the new set does not work (${newWorks.status})`);

    // ── status ──────────────────────────────────────────────────────────────
    const statusRes = await fetch(`${apiBase}/api/auth/backup-codes/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const status: any = await statusRes.json();
    if (statusRes.ok && status.remaining === 9) pass(`status reports the right count (${status.remaining} of 10)`);
    else fail(`status reported ${JSON.stringify(status)}, expected 9 remaining`);

    // ── unauthenticated ─────────────────────────────────────────────────────
    const anon = await fetch(`${apiBase}/api/auth/backup-codes`, { method: 'POST' });
    if (anon.status === 401) pass('codes cannot be generated without signing in');
    else fail(`unauthenticated generation returned ${anon.status}, expected 401`);
  } catch (err: any) {
    fail(`suite crashed: ${err?.message || err}`);
  } finally {
    apiServer?.kill();
    try {
      const db = await adminDbHandle();
      for (const uid of uids) {
        await db.collection('mfaBackupCodes').doc(uid).delete().catch(() => {});
        await adminHandle().auth().deleteUser(uid).catch(() => {});
      }
    } catch { /* best effort */ }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
