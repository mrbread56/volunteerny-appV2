/**
 * Changing your own password, end to end against real Firebase.
 *
 *   npm run check:password
 *
 * Until 27 Aug 2026 there was no way to change a password at all. The only
 * recovery route was "Forgot password?" on the sign-in screen, which asks
 * Firebase to email a reset link from its own domain rather than ours — and the
 * first organisation we onboarded used it, received nothing, and told us. A
 * recovery path that runs through the mailbox is worth nothing to the person
 * whose mailbox is the problem, which is most of the people who need one.
 *
 * The new box reauthenticates with the current password and then calls
 * updatePassword. None of what has to be true about that is provable by reading
 * the code, because all of it is enforced on Google's side:
 *
 *   - the new password actually signs in afterwards
 *   - the OLD password stops working, which is the entire point and the one
 *     thing a "success" toast can lie about
 *   - a wrong current password is refused, so an unlocked laptop is not a
 *     silent account takeover
 *   - one person's password cannot reauthenticate another person's account
 *   - Firebase's own minimum length is really 6, so the local check that spares
 *     a network round trip agrees with the service instead of guessing
 *   - the session survives, so nobody is signed out mid-change
 *
 * Runs against the live project and deletes the accounts it makes.
 */
import './env';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  reauthenticateWithCredential,
  updatePassword,
  EmailAuthProvider,
  signOut,
} from 'firebase/auth';
import adminNs from 'firebase-admin';
import { validatePasswordChange, FIREBASE_MIN_PASSWORD } from '../src/lib/passwordChange';

const admin: any = (adminNs as any).default ?? adminNs;

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

const stamp = Date.now();
const OLD = 'checkPwdOld!123';
const NEW = 'checkPwdNew!456';
const uids: string[] = [];

let adminApp: any = null;
function adminHandle() {
  if (adminApp) return adminApp;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is required');
  adminApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(key)) }, 'check-password');
  return adminApp;
}

/** The prefix is registered in server/testAccounts.ts so the janitor sweeps it. */
const addr = (tag: string) => `check_pwd_${tag}_${stamp}@volunteerny-check.invalid`;

async function makeAccount(tag: string, password = OLD) {
  const email = addr(tag);
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  uids.push(cred.user.uid);
  return email;
}

/** Sign-in as a yes/no question, so a wrong password is an answer not a crash. */
async function canSignIn(email: string, password: string): Promise<boolean> {
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return true;
  } catch {
    return false;
  }
}

(async () => {
  try {
    // ── the change itself ────────────────────────────────────────────────────
    const email = await makeAccount('main');
    await signInWithEmailAndPassword(auth, email, OLD);
    const user = auth.currentUser!;
    const uidBefore = user.uid;

    // A wrong current password must be refused BEFORE anything is written.
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, 'not-the-password'));
      fail('a wrong current password was accepted');
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        pass(`a wrong current password is refused (${code})`);
      } else {
        fail(`wrong password threw an unexpected code: ${code}`);
      }
    }

    // …and the refusal must not have changed anything.
    if (await canSignIn(email, OLD)) pass('a refused attempt leaves the old password working');
    else fail('a refused attempt broke the existing password');

    // The real change, exactly as the component performs it.
    await signInWithEmailAndPassword(auth, email, OLD);
    const live = auth.currentUser!;
    await reauthenticateWithCredential(live, EmailAuthProvider.credential(email, OLD));
    await updatePassword(live, NEW);
    pass('reauthenticate + updatePassword completed without throwing');

    // The session must survive: being signed out by your own password change is
    // the behaviour updatePassword has when it is called on a stale login.
    if (auth.currentUser?.uid === uidBefore) pass('the person stays signed in on this device');
    else fail('the password change signed the user out');

    await signOut(auth);

    // ── the two facts a success message cannot prove on its own ──────────────
    if (await canSignIn(email, NEW)) pass('the NEW password signs in');
    else fail('the new password does not work — the change did not take');

    await signOut(auth).catch(() => {});

    if (await canSignIn(email, OLD)) fail('the OLD password still signs in — it was never replaced');
    else pass('the OLD password no longer signs in');

    await signOut(auth).catch(() => {});

    // ── one account cannot reauthenticate another ────────────────────────────
    const other = await makeAccount('other', 'checkPwdOther!789');
    await signInWithEmailAndPassword(auth, email, NEW);
    try {
      await reauthenticateWithCredential(
        auth.currentUser!,
        EmailAuthProvider.credential(other, 'checkPwdOther!789'),
      );
      fail("another account's credentials reauthenticated this session");
    } catch (err: any) {
      pass(`another account's credentials are rejected (${err?.code || 'threw'})`);
    }

    // ── the local minimum agrees with the service ────────────────────────────
    // If Firebase ever raises its floor, the local check starts letting through
    // passwords the service rejects and the person waits for a round trip to
    // find out. This is the assertion that notices.
    await signInWithEmailAndPassword(auth, email, NEW);
    const tooShort = 'a'.repeat(FIREBASE_MIN_PASSWORD - 1);
    await reauthenticateWithCredential(auth.currentUser!, EmailAuthProvider.credential(email, NEW));
    try {
      await updatePassword(auth.currentUser!, tooShort);
      fail(`Firebase accepted a ${tooShort.length}-character password; the local minimum of ${FIREBASE_MIN_PASSWORD} is wrong`);
    } catch (err: any) {
      if (err?.code === 'auth/weak-password') {
        pass(`Firebase rejects ${tooShort.length} characters, so the local minimum of ${FIREBASE_MIN_PASSWORD} matches`);
      } else {
        fail(`short password threw an unexpected code: ${err?.code}`);
      }
    }

    // And the length the validator calls acceptable really is acceptable.
    const atMinimum = 'q7' + 'x'.repeat(FIREBASE_MIN_PASSWORD - 2);
    if (validatePasswordChange(NEW, atMinimum, atMinimum) !== null) {
      fail('the validator rejects a password of exactly the minimum length');
    } else {
      await reauthenticateWithCredential(auth.currentUser!, EmailAuthProvider.credential(email, NEW));
      await updatePassword(auth.currentUser!, atMinimum);
      await signOut(auth);
      if (await canSignIn(email, atMinimum)) {
        pass(`a password of exactly ${FIREBASE_MIN_PASSWORD} characters is accepted by both sides`);
      } else {
        fail('a minimum-length password was accepted locally but does not sign in');
      }
    }

    // ── the validator refuses what Firebase would also refuse ────────────────
    const agreed = validatePasswordChange(atMinimum, atMinimum, atMinimum);
    if (agreed === 'Your new password is the same as your current one.') {
      pass('reusing the current password is stopped before it reaches Firebase');
    } else {
      fail(`reuse check returned ${JSON.stringify(agreed)}`);
    }
  } catch (err: any) {
    fail(`suite crashed: ${err?.stack || err?.message || err}`);
  } finally {
    await signOut(auth).catch(() => {});
    try {
      for (const uid of uids) {
        await adminHandle().auth().deleteUser(uid).catch(() => {});
      }
      console.log(`\ncleaned up ${uids.length} test account(s)`);
    } catch { /* best effort */ }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
