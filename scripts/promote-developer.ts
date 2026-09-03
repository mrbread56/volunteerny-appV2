/**
 * Promote an account to developer.
 *
 * There are two ways to be a developer and they are not equivalent.
 *
 *   VITE_DEVELOPER_EMAILS  is read at BUILD time by import.meta.env, so adding
 *   an address there means editing .env, setting the same variable in Vercel,
 *   and redeploying. That is roadmap item B9, and it is the wrong tool for
 *   adding a person.
 *
 *   role == 'developer' on users/{uid} is read at runtime by isDeveloperUser
 *   and by isDeveloper() in firestore.rules. It takes effect on the next sign
 *   in, with no redeploy. This script uses that.
 *
 * twoFactorEnabled is set at the same time and that is not optional.
 * mfaSatisfied() in the rules exempts `twoFactorEnabled != true && role ==
 * 'student'`, an exemption that exists so students who never turned 2FA on are
 * not locked out. An account promoted to developer with 2FA still off does not
 * get that exemption and would simply be unable to use the console - and the
 * rules file already documents the inverse of this as a real hole that was
 * closed, where an allowlisted address whose stored role was 'student' reached
 * `allow list` on /users from a password-only session.
 *
 *   npx tsx scripts/promote-developer.ts <email>          # show what would change
 *   npx tsx scripts/promote-developer.ts <email> --write  # apply
 */
import a from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const email = process.argv[2];
  const write = process.argv.includes('--write');
  if (!email || email.startsWith('--')) {
    console.error('usage: npx tsx scripts/promote-developer.ts <email> [--write]');
    process.exit(1);
  }

  const app = a.initializeApp({
    credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)),
  });
  const db = app.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const authUser = await app.auth().getUserByEmail(email).catch(() => null);
  if (!authUser) throw new Error(`no account exists for ${email}. They must sign up first.`);

  const ref = db.collection('users').doc(authUser.uid);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`no users/${authUser.uid} document. Account is half-created.`);
  const before = snap.data() as any;

  console.log(`${email}`);
  console.log(`  uid              ${authUser.uid}`);
  console.log(`  role             ${before.role}  ->  developer`);
  console.log(`  twoFactorEnabled ${before.twoFactorEnabled === true}  ->  true`);
  console.log('\n  Grants the developer console: every account\'s uid, email and role,');
  console.log('  every feedback and safety report, verification decisions, and metrics.');

  if (!write) {
    console.log('\nDry run. Re-run with --write to apply.');
    await app.delete();
    return;
  }

  await ref.update({
    role: 'developer',
    twoFactorEnabled: true,
    updatedAt: a.firestore.FieldValue.serverTimestamp(),
  });

  const after = (await ref.get()).data() as any;
  console.log(`\napplied. role=${after.role} twoFactorEnabled=${after.twoFactorEnabled}`);
  console.log('Takes effect on their next sign in. They will be emailed a 6 digit code.');
  console.log('The students/ profile is left in place; nothing is deleted by this script.');
  await app.delete();
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
