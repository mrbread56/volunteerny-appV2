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
  /*
   * Jewish Family & Child Service, from Andrea Pines's reply of 9 Sep 2026 and
   * her own signature block.
   *
   * hasCra is false because no registration number was found, not because
   * there isn't one. JF&CS is plainly a registered charity; the number was
   * simply never stated and is not worth guessing into a public profile.
   *
   * 4600 Bathurst geocodes to 43.7626650 / -79.4404523, and Nominatim returns
   * "Westminster-Branson, York Centre, North York", which is what
   * northYorkConfirmed is asserting.
   */
  jfandcs: {
    organizationName: 'Jewish Family & Child Service',
    organizationType: 'Social service agency',
    organizationTypeOther: '',
    mission:
      'Jewish Family & Child Service supports the healthy development of individuals, children, families and communities through prevention, protection, counselling, education and advocacy services, within the context of Jewish values. It runs an Online Homework Club pairing volunteer tutors with elementary and secondary students over Zoom through the school year.',
    address: '4600 Bathurst Street, Toronto, ON M2R 3V3',
    coordinates: { lat: 43.762665, lng: -79.4404523 },
    phone: '(416) 638-7800 ext 6266',
    contactEmail: 'apines@jfandcs.com',
    websiteUrl: 'https://www.jfandcs.com',
    craNumber: '',
    craVerified: false,
    hasCra: false,
    northYorkConfirmed: true,
    verificationStatus: 'verified',
  },
  /*
   * Wilson Branch 527, from the branch's own listings and the president's
   * email of 8 Sep 2026.
   *
   * Two postal codes are in circulation for 948 Sheppard Ave W: business
   * directories say M3H 2T6, and geocoding the street address returns
   * M3H 2T7. M3H 2T6 is used here because it comes from the branch's own
   * listing, but ask Terry to confirm it rather than trusting either.
   *
   * hasCra is false because no registration number was found, not because
   * there isn't one. The verification here rests on a named branch president
   * writing from the branch role address, which is the same standard the other
   * verified organisations were held to.
   */
  legion527: {
    organizationName: 'Royal Canadian Legion, Wilson Branch 527',
    organizationType: 'Veterans organization',
    organizationTypeOther: '',
    mission:
      'Wilson Branch 527 of the Royal Canadian Legion serves veterans, serving members and their families in North York, and raises money for them through the annual poppy campaign in the two weeks before Remembrance Day. Like every Legion branch it is also a community hall: the building on Sheppard Avenue West hosts events and brings the neighbourhood together around remembrance.',
    address: '948 Sheppard Ave W, North York, ON M3H 2T6',
    coordinates: { lat: 43.75283, lng: -79.46032 },
    phone: '(416) 633-0345',
    contactEmail: 'rcl527president@hotmail.com',
    websiteUrl: '',
    craNumber: '',
    craVerified: false,
    hasCra: false,
    northYorkConfirmed: true,
    verificationStatus: 'verified',
  },
  /*
   * Randall Linton, current club president, replied 8 Sep 2026 to the outreach
   * that went to Monica Walderman, the former president, and forwarded it on
   * himself. He asked directly for the Terry Fox Run to go into the portal.
   *
   * The club has no premises, which is normal for a service club, so `address`
   * is deliberately empty rather than filled with a member's business address.
   * The coordinates are Gibson Park, where they have run the Terry Fox Run for
   * years, so the map pin lands on something real.
   *
   * The phone is Randall's mobile, given in his own signature for this purpose.
   * His office number belongs to interiorcare.com, his business, and is not the
   * club's, so it is not recorded here.
   */
  rotarynorthyork: {
    organizationName: 'The Rotary Club of North York',
    organizationType: 'Service club',
    organizationTypeOther: '',
    mission:
      'The Rotary Club of North York is a service club in Rotary District 7070, made up of local members who fund and run community projects across North York. It organises the annual North York Terry Fox Run at Gibson Park, which has raised money for cancer research for many years, and supports other local causes through the club and its members.',
    address: '',
    coordinates: { lat: 43.7689676, lng: -79.4157842 },
    phone: '(416) 464-4007',
    contactEmail: 'randall@interiorcare.com',
    websiteUrl: 'https://www.rotarynorthyork.org',
    craNumber: '',
    craVerified: false,
    hasCra: false,
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
