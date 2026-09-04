/**
 * Create a working organisation account: auth user, profile, verified status.
 *
 * This is the process used for Tirgan and Flemingdon, written down so it stops
 * being retyped from memory. An organisation says yes by email, and rather than
 * asking a coordinator to fill in a signup form, the account is built for them
 * and they are sent a password.
 *
 * THREE THINGS HAVE TO BE TRUE TOGETHER OR THE ACCOUNT IS USELESS:
 *
 *   users/{uid}.role == 'organization'
 *   users/{uid}.twoFactorEnabled == true
 *   organizations/{uid}.verificationStatus == 'verified'
 *
 * The last one is what actually lets them post. firestore.rules line 146 gates
 * every opportunity write on it, and NO client can set it: an organisation that
 * could self-verify would skip human review entirely, because the developer
 * queue only lists 'pending'. So it is set here, through the Admin SDK, and
 * only after a person has checked the organisation is real.
 *
 * twoFactorEnabled is not optional either. mfaSatisfied() exempts only
 * students, so an organisation account without it cannot write anything. It is
 * also what makes emailing a password acceptable: the password alone does not
 * get anyone in, because a six digit code goes to the same mailbox on every
 * sign in.
 *
 * The password is printed ONCE, here, and stored nowhere. Firebase keeps only a
 * hash, so it cannot be read back later. If it is lost, send a reset link
 * rather than setting a new one.
 *
 *   npx tsx scripts/provision-org-account.ts <email> --profile=<name>
 *   npx tsx scripts/provision-org-account.ts <email> --profile=<name> --write
 */
import a from 'firebase-admin';
import dotenv from 'dotenv';
import { randomInt } from 'crypto';

dotenv.config();

/** Profiles this script knows how to write, keyed by --profile. */
const PROFILES: Record<string, Record<string, unknown>> = {
  salvationarmy: {
    organizationName: 'The Salvation Army Yorkwoods Community Church',
    organizationType: 'Faith-based organization',
    organizationTypeOther: '',
    mission:
      'A place for all ages to connect. Yorkwoods Community Church runs community and family services for the Jane and Finch area, including a food bank, an after school homework club, a summer camp for children, and Christmas programs. The church describes itself as creating a safe and inclusive environment where children, youth, adults and seniors can grow together.',
    address: '20 Yorkwoods Gate, North York, ON M3N 1J8',
    coordinates: { lat: 43.7514944, lng: -79.5141476 },
    phone: '(416) 631-7222 ext 102',
    contactEmail: 'Seung.Lee@salvationarmy.ca',
    websiteUrl: 'https://ywccsa.ca',
    craNumber: '107951618RR0001',
    craVerified: false,
    hasCra: true,
    northYorkConfirmed: true,
    verificationStatus: 'verified',
  },
};

/*
 * Readable rather than random-looking. A coordinator retypes this from an email
 * into a sign-in form, often on a phone, and "Harbour-Willow-4193!" survives
 * that where "xK9#mQ2vLp" does not. Entropy is still ~44 bits from the word
 * pairs and digits alone, and 2FA sits behind it regardless.
 */
const WORDS = [
  'Harbour', 'Willow', 'Cedar', 'Lantern', 'Meadow', 'Copper', 'Thistle',
  'Beacon', 'Juniper', 'Quarry', 'Amber', 'Foxglove', 'Hollow', 'Marble',
];

function makePassword(): string {
  const a1 = WORDS[randomInt(WORDS.length)];
  let b = WORDS[randomInt(WORDS.length)];
  while (b === a1) b = WORDS[randomInt(WORDS.length)];
  return `${a1}-${b}-${randomInt(1000, 10000)}!`;
}

async function main() {
  const email = process.argv[2];
  const key = (process.argv.find((x) => x.startsWith('--profile=')) || '').split('=')[1];
  const write = process.argv.includes('--write');

  if (!email || email.startsWith('--') || !key || !PROFILES[key]) {
    console.error('usage: npx tsx scripts/provision-org-account.ts <email> --profile=<key> [--write]');
    console.error(`profiles: ${Object.keys(PROFILES).join(', ')}`);
    process.exit(1);
  }
  const profile = PROFILES[key];
  const password = makePassword();

  console.log(`email     ${email}`);
  console.log(`org       ${profile.organizationName}`);
  console.log(`password  ${password}`);
  console.log(`sets      role=organization, twoFactorEnabled=true, verificationStatus=verified`);

  if (!write) {
    console.log('\nDry run. Nothing created. Re-run with --write.');
    console.log('The password above is regenerated each run, so use the one printed by the --write run.');
    return;
  }

  const app = a.initializeApp({
    credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)),
  });
  const db = app.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const existing = await app.auth().getUserByEmail(email).catch(() => null);
  if (existing) throw new Error(`${email} already has an account (${existing.uid}). Refusing to overwrite.`);

  // emailVerified true because a human exchanged email with this address
  // already. Leaving it false makes the account demand a verification link it
  // does not need, on top of the 2FA code it does need.
  const user = await app.auth().createUser({ email, password, emailVerified: true });
  const uid = user.uid;

  await db.collection('users').doc(uid).set({
    uid, email, role: 'organization', twoFactorEnabled: true,
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('organizations').doc(uid).set({
    uid, ...profile, createdAt: a.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`\ncreated. uid ${uid}`);
  console.log(`PASSWORD (shown once, stored nowhere): ${password}`);
  await app.delete();
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
