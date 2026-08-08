/**
 * Grant the mfaVerified custom claim to an account, by email.
 *
 *   npx tsx scripts/grant-mfa.ts someone@example.com
 *
 * Why this exists: two-factor is mandatory for organizations and the code is
 * delivered by email. When mail is misconfigured — which is its current state,
 * see B1 in STATUS.md — no organization can get past /mfa, so the organization
 * dashboard cannot be tested at all. This sets the same claim the server sets
 * after a correct code, so the gate can be crossed without a working mailbox.
 *
 * This is a LOCAL TESTING TOOL. It needs FIREBASE_SERVICE_ACCOUNT_KEY, which is
 * already full admin access to the project, so it grants nothing that the key
 * holder did not already have. It is not reachable from the app and there is no
 * endpoint behind it. Do not wire it into anything.
 */
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const email = process.argv[2];
if (!email) {
  console.error('Usage: npx tsx scripts/grant-mfa.ts <email>');
  process.exit(1);
}

(async () => {
  const a: any = (admin as any).default || admin;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) {
    console.error('[FAIL] FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
    process.exit(1);
  }
  const app = a.initializeApp({ credential: a.credential.cert(JSON.parse(key)) }, 'grant-mfa');
  try {
    const user = await app.auth().getUserByEmail(email);
    const existing = user.customClaims || {};
    await app.auth().setCustomUserClaims(user.uid, {
      ...existing,
      mfaVerified: true,
      mfaVerifiedAt: Date.now(),
    });
    console.log(`[OK] mfaVerified granted to ${email} (${user.uid}).`);
    console.log('     Sign out and back in, or force a token refresh, for it to take effect.');
  } catch (err: any) {
    console.error(`[FAIL] ${err?.message || err}`);
    process.exit(1);
  }
  process.exit(0);
})();
