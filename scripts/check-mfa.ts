/**
 * Prove the 2FA gate actually closes when a session ends.
 *
 *   npm run check:mfa
 *
 * This check exists because it did not. `mfaVerified` was a plain custom claim,
 * and custom claims live on the Firebase Auth user record rather than on a
 * session — so one passed code verified an account permanently, on every device.
 * The settings screen promised a code "every time you log back in" and a real
 * production account signed in 3.8 days after its claim was written without
 * receiving one. Nothing in tsc, the build, or the security suite could see it,
 * because none of them sign in twice.
 *
 * Part 1 tests the predicate directly. Part 2 signs a throwaway account in
 * TWICE against the live project and asserts auth_time actually moves, which is
 * the fact the whole design rests on and the one thing a unit test cannot show.
 */
import './env';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, signInWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { isMfaClaimCurrent } from '../src/lib/mfa';

let passed = 0;
let failed = 0;
const pass = (m: string) => { console.log(`[PASS] ${m}`); passed++; };
const fail = (m: string) => { console.error(`[FAIL] ${m}`); failed++; };
const claims = (c: Record<string, any>) => ({ claims: c });

// ── Part 1: the predicate ───────────────────────────────────────────────────
if (isMfaClaimCurrent(claims({ mfaVerified: true, mfaVerifiedFor: 1000, auth_time: 1000 })) === true)
  pass('claim minted for this sign-in is accepted');
else fail('claim minted for this sign-in was REJECTED — users cannot get past /mfa');

if (isMfaClaimCurrent(claims({ mfaVerified: true, mfaVerifiedFor: 1000, auth_time: 2000 })) === false)
  pass('claim from an earlier sign-in is rejected (the actual bug)');
else fail('claim from an earlier sign-in was ACCEPTED — 2FA never challenges again');

if (isMfaClaimCurrent(claims({ mfaVerified: true, auth_time: 2000 })) === false)
  pass('legacy claim with no mfaVerifiedFor is rejected');
else fail('legacy permanent claim was ACCEPTED');

if (isMfaClaimCurrent(claims({ mfaVerified: false, mfaVerifiedFor: 1000, auth_time: 1000 })) === false)
  pass('mfaVerified:false is rejected even when the stamps agree');
else fail('mfaVerified:false was ACCEPTED');

if (isMfaClaimCurrent(claims({ auth_time: 1000 })) === false) pass('no claim is rejected');
else fail('a token with no MFA claim was ACCEPTED');

if (isMfaClaimCurrent(null) === false && isMfaClaimCurrent(undefined) === false)
  pass('null/undefined token is rejected');
else fail('null/undefined token was ACCEPTED');

// The SDK types auth_time as a string while returning a number. Whichever
// arrives, an equal stamp must be accepted — rejecting one spelling would pin
// every account on /mfa with no way off it.
if (isMfaClaimCurrent(claims({ mfaVerified: true, mfaVerifiedFor: 1000, auth_time: '1000' })) === true)
  pass('string auth_time with an equal stamp is accepted (no mass lockout)');
else fail('string auth_time was REJECTED — every account would be stuck on /mfa');

if (isMfaClaimCurrent(claims({ mfaVerified: true, mfaVerifiedFor: 1000, auth_time: '2000' })) === false)
  pass('string auth_time from an earlier sign-in is still rejected');
else fail('string auth_time bypassed the sign-in check');

if (isMfaClaimCurrent(claims({ mfaVerified: true, mfaVerifiedFor: 'abc', auth_time: 'abc' })) === false)
  pass('two equal non-numeric stamps are rejected');
else fail('non-numeric stamps were ACCEPTED — identity alone must not pass');

// ── Part 1b: the admin grace window (scripts/grant-mfa.ts) ──────────────────
const now = Math.floor(Date.now() / 1000);

if (isMfaClaimCurrent(claims({ mfaGraceUntil: now + 3600, auth_time: now })) === true)
  pass('grace: a sign-in inside the window is let in with no code');
else fail('grace: RUNBOOK step 3 cannot unlock a mail-locked organization');

if (isMfaClaimCurrent(claims({ mfaGraceUntil: now - 1, auth_time: now })) === false)
  pass('grace: a sign-in after the deadline is challenged again');
else fail('grace: an expired window still let the account in');

// The window is measured against auth_time, which Firebase stamps, so the
// person being let in cannot widen it by moving their own clock.
if (isMfaClaimCurrent(claims({ mfaGraceUntil: now - 1, auth_time: now + 999999 })) === false)
  pass('grace: a far-future auth_time cannot reopen an expired window');
else fail('grace: window could be extended from the client side');

if (isMfaClaimCurrent(claims({ mfaGraceUntil: 'forever', auth_time: now })) === false)
  pass('grace: a non-numeric deadline is ignored');
else fail('grace: a junk deadline granted access');

// ── Part 2: auth_time really does move on a second sign-in ──────────────────
const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const email = `check-mfa-${Date.now()}@volunteerny-check.invalid`;
const password = 'CheckMfa!' + Math.random().toString(36).slice(2, 10);

(async () => {
  let created = false;
  try {
    const first = await createUserWithEmailAndPassword(auth, email, password);
    created = true;
    const t1 = (await first.user.getIdTokenResult()).claims.auth_time as unknown as number;

    // Firebase stamps auth_time in whole seconds, so two sign-ins inside the
    // same second are indistinguishable. Wait past the boundary — this is a
    // property of the clock's resolution, not a flaky test.
    await new Promise((r) => setTimeout(r, 1500));

    await signOut(auth);
    const second = await signInWithEmailAndPassword(auth, email, password);
    const t2 = (await second.user.getIdTokenResult()).claims.auth_time as unknown as number;

    if (typeof t1 === 'number' && typeof t2 === 'number' && t2 > t1)
      pass(`auth_time advances on a new sign-in (${t1} -> ${t2})`);
    else fail(`auth_time did NOT advance (${t1} -> ${t2}) — the gate would never re-challenge`);

    // The end-to-end statement: a claim stamped for sign-in 1 fails at sign-in 2.
    if (isMfaClaimCurrent(claims({ mfaVerified: true, mfaVerifiedFor: t1, auth_time: t2 })) === false)
      pass('a real first-session claim is rejected by a real second session');
    else fail('a real first-session claim survived into a second session');

    // ...and stays valid while that session is merely refreshed.
    const refreshed = (await second.user.getIdTokenResult(true)).claims.auth_time as unknown as number;
    if (isMfaClaimCurrent(claims({ mfaVerified: true, mfaVerifiedFor: t2, auth_time: refreshed })) === true)
      pass('forced token refresh does not re-challenge an active session');
    else fail('a token refresh re-challenged an active session — users would loop on /mfa');
  } catch (err: any) {
    fail(`live sign-in check could not run: ${err?.message || err}`);
  } finally {
    // Never leave a test account behind in the real project.
    try { if (created && auth.currentUser) await deleteUser(auth.currentUser); } catch { /* reported below */ }
    if (created && auth.currentUser) console.warn(`[warn] leftover test account: ${email}`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
