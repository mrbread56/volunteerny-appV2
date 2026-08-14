/**
 * Grant the mfaVerified custom claim to an account, by email.
 *
 *   npx tsx scripts/grant-mfa.ts someone@example.com
 *
 * Why this exists: two-factor is mandatory for organizations and the code is
 * delivered by email. When mail is misconfigured — which is its current state,
 * see B1 in STATUS.md — no organization can get past /mfa, so the organization
 * dashboard cannot be tested at all. This opens a time-boxed window in which
 * the gate can be crossed without a working mailbox.
 *
 * This is a LOCAL TESTING TOOL. It needs FIREBASE_SERVICE_ACCOUNT_KEY, which is
 * already full admin access to the project, so it grants nothing that the key
 * holder did not already have. It is not reachable from the app and there is no
 * endpoint behind it. Do not wire it into anything.
 */
import './env';
import * as admin from 'firebase-admin';


const email = process.argv[2];
const revoke = process.argv.includes('--revoke');
if (!email) {
  console.error('Usage: npx tsx scripts/grant-mfa.ts <email> [--revoke]');
  process.exit(1);
}

/** Long enough for a support email round-trip, short enough to not be a bypass. */
const GRACE_SECONDS = 60 * 60;

(async () => {
  const a: any = (admin as any).default || admin;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) {
    console.error('[FAIL] FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
    process.exit(1);
  }
  const app = a.initializeApp({ credential: a.credential.cert(JSON.parse(key)) }, 'grant-mfa');
  try {
    if (revoke) {
      const user = await app.auth().getUserByEmail(email);
      const { mfaGraceUntil, mfaGrantedAt, ...rest } = user.customClaims || {};
      await app.auth().setCustomUserClaims(user.uid, rest);
      console.log(`[OK] Grace revoked for ${email} (${user.uid}). Their next sign-in is challenged.`);
      process.exit(0);
    }
    const user = await app.auth().getUserByEmail(email);
    const existing = user.customClaims || {};

    // A bare mfaVerified is no longer enough, and granting one here would do
    // nothing: the gate pins that claim to the auth_time of the sign-in that
    // earned it (src/lib/mfa.ts), and this script cannot know the auth_time of
    // a sign-in that has not happened yet. So it grants a deadline instead —
    // any sign-in starting within the window is exempt for its whole session,
    // and the exemption lapses on its own rather than becoming the permanent
    // bypass this claim used to be.
    const graceUntil = Math.floor(Date.now() / 1000) + GRACE_SECONDS;
    await app.auth().setCustomUserClaims(user.uid, {
      ...existing,
      mfaGraceUntil: graceUntil,
      mfaGrantedAt: Date.now(),
    });
    console.log(`[OK] Two-factor grace granted to ${email} (${user.uid}).`);
    console.log(`     Valid for any sign-in before ${new Date(graceUntil * 1000).toISOString()} (${GRACE_SECONDS / 3600}h).`);
    console.log('     Tell them to sign out and back in now; after that deadline they are challenged again.');
    console.log('     To revoke early: npx tsx scripts/grant-mfa.ts <email> --revoke');
  } catch (err: any) {
    console.error(`[FAIL] ${err?.message || err}`);
    process.exit(1);
  }
  process.exit(0);
})();
