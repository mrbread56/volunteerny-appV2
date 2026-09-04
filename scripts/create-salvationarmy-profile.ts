/**
 * One-off: create the organisation profile for The Salvation Army Yorkwoods.
 *
 * Seung Lee replied on 4 Sep asking to be registered and offering three
 * programs: the food bank, Christmas toy distribution, and the Christmas
 * Kettle campaign. This builds the profile from public records so his reply
 * only has to fill the gaps rather than supply everything.
 *
 * SOURCES, all checked on 4 Sep 2026, none invented:
 *   address, phone, contact  torontocentralhealthline.ca record 133036
 *   coordinates              Nominatim, "20 Yorkwoods Gate, Toronto, Ontario",
 *                            43.7514944 / -79.5141476, which resolves to
 *                            "Yorkwoods Gate Community Church" rather than
 *                            merely the street number
 *   services, catchment      same 211 record
 *
 * craNumber is 107951618RR0001, taken from ywccsa.ca itself rather than
 * guessed. That is the Governing Council's number, and The Salvation Army
 * registers locations under one business number with different account
 * suffixes (RR0067, RR0272 and RR0487 are three other churches). Yorkwoods
 * publishes RR0001 as its own registration, so that is what is recorded:
 * the number the organisation states, not one inferred for it. craVerified
 * stays false because nobody has checked it against the CRA registry.
 *
 * verificationStatus is 'pending', not 'verified'. Seung has said yes by email
 * but nobody has yet confirmed he speaks for the location, which is the whole
 * point of the review step. Set it to verified from the developer console
 * after the usual check.
 *
 * NO ACCOUNT IS CREATED HERE. Writing a profile needs a uid, and a uid needs a
 * Firebase Auth user with a password. Passwords should not be generated and
 * emailed around, so run this with the uid of an account Seung created himself,
 * or create one and send him a password reset link rather than a password.
 *
 *   npx tsx scripts/create-salvationarmy-profile.ts            # print it
 *   npx tsx scripts/create-salvationarmy-profile.ts <uid> --write
 */
import a from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const PROFILE = {
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
  verificationStatus: 'pending',
};

/** What Seung still has to answer before any listing can go live. */
const OUTSTANDING = [
  'Food bank: days, hours, how many volunteers at once, minimum age',
  'Toy Mountain: dates this year, same three answers',
  'Kettle campaign: dates, whether to list it as shifts, minimum age',
  'Santa Shuffle: is it wanted as a listing too? It is on their volunteer page and was not in his email',
  'Who students report to on arrival, and where',
  'Anything students should bring or wear',
  'Whether a student who applies here must ALSO complete The Salvation Army volunteer application, and whether any screening applies at their age',
];

async function main() {
  const uid = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
  const write = process.argv.includes('--write');

  console.log('PROFILE');
  for (const [k, v] of Object.entries(PROFILE)) {
    console.log(`  ${k.padEnd(22)} ${typeof v === 'object' ? JSON.stringify(v) : `'${v}'`}`);
  }
  console.log('\nSTILL NEEDED FROM SEUNG');
  OUTSTANDING.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

  if (!write) {
    console.log('\nDry run. To apply:  npx tsx scripts/create-salvationarmy-profile.ts <uid> --write');
    return;
  }
  if (!uid) throw new Error('--write needs a uid as the first argument');

  const app = a.initializeApp({
    credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)),
  });
  const db = app.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const authUser = await app.auth().getUser(uid).catch(() => null);
  if (!authUser) throw new Error(`no auth account for uid ${uid}`);

  const ref = db.collection('organizations').doc(uid);
  if ((await ref.get()).exists) throw new Error(`organizations/${uid} already exists, refusing to overwrite`);

  await ref.set({ uid, ...PROFILE, createdAt: a.firestore.FieldValue.serverTimestamp() });
  await db.collection('users').doc(uid).set(
    { uid, email: authUser.email, role: 'organization', twoFactorEnabled: true },
    { merge: true },
  );
  console.log(`\nwritten. organizations/${uid}, verificationStatus 'pending'.`);
  await app.delete();
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
