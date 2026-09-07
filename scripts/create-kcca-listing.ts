/**
 * One-off: build KCCA's account, profile and Fall Festival listing.
 *
 * Daniel Park, Administrative Office at the Korean Canadian Cultural
 * Association, replied on 2 Sep from admin@kccatoronto.ca and said yes:
 *
 *   "The Korean Canadian Cultural Association (KCCA) will be hosting the
 *    Korean Fall Festival on Saturday, September 19, and we expect to need
 *    approximately 50 volunteers to help throughout the event. Volunteer
 *    opportunities will include event setup, registration, guest assistance,
 *    activity support, and cleanup after the festival."
 *
 * Six follow-up questions went back to him and have not been answered. This
 * builds the whole thing anyway, from his email and from kccatoronto.ca, so
 * that whenever he does reply he is correcting a finished listing rather than
 * starting one.
 *
 * THE LISTING IS CREATED CLOSED, AND THAT IS THE POINT.
 *
 * isVisibleToStudents is `status !== 'closed' && !isFixture`, so 'closed' means
 * no student can see or apply to it. Four details are still unknown: the start
 * and end time, whether the fifty are wanted in shifts, the minimum age, and
 * who students report to on the day. A start time is not a field worth
 * guessing when the consequence is a 15 year old standing outside a locked
 * building on a Saturday morning. Open it with open-tirgan-listing.ts once
 * Daniel confirms, or from the organisation dashboard.
 *
 * WHAT CAME FROM WHERE, nothing invented:
 *   date, volunteer count, roles   Daniel's email, 2 Sep 2026
 *   address, phone, contact        kccatoronto.ca, read 7 Sep 2026
 *   mission                        kccatoronto.ca, their own wording
 *   coordinates                    Nominatim, "1133 Leslie Street, North York,
 *                                  Toronto, Ontario" resolving to the building
 *                                  at 43.7263926 / -79.3483661
 *   19 Sep 2026 is a Saturday      checked; his date is internally consistent
 *
 * minAge is deliberately absent. He was asked and has not said, and an absent
 * value means no floor rather than a floor of zero. Setting one would either
 * turn away students KCCA would have taken or admit students it would not.
 *
 * hasCra is false. Their site refers to charitable status but does not publish
 * the number, and a registration number is not something to infer.
 *
 * NO PASSWORD IS GENERATED OR PRINTED. The account is created with a random
 * secret nobody ever sees; Daniel gets a password reset link when someone
 * decides to contact him. This is the pattern the Salvation Army script argues
 * for: passwords should not be generated and mailed around.
 *
 *   npx tsx scripts/create-kcca-listing.ts            # print it, write nothing
 *   npx tsx scripts/create-kcca-listing.ts --write
 */
import a from 'firebase-admin';
import dotenv from 'dotenv';
import { randomBytes } from 'crypto';

dotenv.config();

const EMAIL = 'admin@kccatoronto.ca';

const PROFILE = {
  organizationName: 'Korean Canadian Cultural Association',
  organizationType: 'Non-profit organization',
  organizationTypeOther: '',
  mission:
    'The Korean Canadian Cultural Association has been the centre of the Korean community in Toronto for sixty years. It supports the rights and interests of Korean residents, cultural inheritance and connection between generations, and runs cultural classes, youth programs, community events and welfare services from its building on Leslie Street in North York.',
  address: '1133 Leslie Street, North York, ON M3C 2J6',
  coordinates: { lat: 43.7263926, lng: -79.3483661 },
  phone: '(416) 383-0777',
  contactEmail: EMAIL,
  websiteUrl: 'https://www.kccatoronto.ca',
  craNumber: '',
  craVerified: false,
  hasCra: false,
  northYorkConfirmed: true,
  /*
   * Verified on the same standard as Tirgan: a named person replied from the
   * address the organisation publishes on its own site, signing with a job
   * title, office address and phone that all match that site. Nothing here is
   * self-asserted by a stranger who filled in a form.
   */
  verificationStatus: 'verified',
};

/*
 * 09:00 is a placeholder and the listing stays closed because of it. Toronto is
 * on EDT in September, so the offset is fixed at -04:00 rather than left to the
 * machine's local zone, which is what makes a date wrong on someone else's
 * laptop.
 */
const FESTIVAL_DATE = new Date('2026-09-19T09:00:00-04:00');

const LISTING = {
  title: 'Korean Fall Festival volunteers',
  category: 'Event Planning',
  location: '1133 Leslie Street, North York, ON M3C 2J6',
  coordinates: PROFILE.coordinates,
  maxVolunteers: 50,
  isVirtual: false,
  scheduleType: 'single' as const,
  timeCommitment: 'One-time',
  skillsNeeded: ['Event Support', 'Communication', 'Organization', 'Physical Work'],
  status: 'closed' as const,
  description: `The Korean Canadian Cultural Association runs the Korean Fall Festival at its building on Leslie Street, and it needs about fifty students to help the day run.

The work is spread across the festival. Some of it is setting up before the doors open, some is working the registration desk, some is helping guests find their way and supporting the activities, and some is cleaning up at the end. You will be told which part you are on before the day.

This is one Saturday, not an ongoing placement. If you need hours and you would rather do them all at once than an hour at a time for a term, this is the kind of event that gets you there.

You do not need experience and you do not need to speak Korean.

KCCA is at 1133 Leslie Street, in the Banbury and Don Mills area of North York, and has been the centre of the Korean community in Toronto for sixty years.

Start and end times are being confirmed with the office and will be shown here before applications open.`,
  requirements: `Turn up on time, and tell the office if your plans change.

No experience needed. No language requirement.

Wear something you do not mind working in, since setup and cleanup involve carrying and moving things.`,
};

function line(k: string, v: unknown) {
  console.log(`  ${k.padEnd(20)}${typeof v === 'string' ? v : JSON.stringify(v)}`);
}

async function main() {
  const write = process.argv.includes('--write');

  console.log('ORGANISATION');
  for (const k of ['organizationName', 'organizationType', 'address', 'phone',
                   'contactEmail', 'websiteUrl', 'hasCra', 'verificationStatus']) {
    line(k, (PROFILE as Record<string, unknown>)[k]);
  }
  line('coordinates', PROFILE.coordinates);
  console.log(`\n  mission\n    ${PROFILE.mission}`);

  console.log('\nLISTING');
  for (const k of ['title', 'category', 'location', 'maxVolunteers',
                   'scheduleType', 'timeCommitment', 'status']) {
    line(k, (LISTING as Record<string, unknown>)[k]);
  }
  line('dateTime', FESTIVAL_DATE.toISOString());
  line('', `${FESTIVAL_DATE.toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'full', timeStyle: 'short' })} Toronto`);
  line('minAge', '(absent: not stated by KCCA)');
  line('skillsNeeded', LISTING.skillsNeeded);
  console.log(`\n--- description ---\n${LISTING.description}`);
  console.log(`\n--- requirements ---\n${LISTING.requirements}`);

  console.log('\nSTILL UNCONFIRMED BY KCCA');
  for (const q of [
    'start and end time, and whether the 50 are wanted in shifts',
    'minimum age',
    'one listing or split by role',
    'who students report to on the day, and where at 1133 Leslie',
    'what to bring or wear',
    'CRA registration number',
  ]) console.log(`  - ${q}`);

  if (!write) {
    console.log('\nDry run. Nothing created. Re-run with --write.');
    return;
  }

  const app = a.initializeApp({
    credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)),
  });
  const db = app.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const existing = await app.auth().getUserByEmail(EMAIL).catch(() => null);
  if (existing) throw new Error(`${EMAIL} already has an account (${existing.uid}). Refusing to overwrite.`);

  // Never displayed and never sent. Daniel sets his own via a reset link.
  const user = await app.auth().createUser({
    email: EMAIL,
    password: randomBytes(24).toString('base64url'),
    emailVerified: true,
  });
  const uid = user.uid;

  await db.collection('users').doc(uid).set({
    uid, email: EMAIL, role: 'organization', twoFactorEnabled: true,
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('organizations').doc(uid).set({
    uid, ...PROFILE, createdAt: a.firestore.FieldValue.serverTimestamp(),
  });
  const opp = await db.collection('opportunities').add({
    ...LISTING,
    orgId: uid,
    orgName: PROFILE.organizationName,
    dateTime: a.firestore.Timestamp.fromDate(FESTIVAL_DATE),
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`\ncreated`);
  console.log(`  org uid        ${uid}`);
  console.log(`  opportunity    ${opp.id}`);
  console.log(`  status         closed, so no student can see it yet`);
  console.log(`\nTo open it once Daniel confirms the times:`);
  console.log(`  db.collection('opportunities').doc('${opp.id}').update({ status: 'open' })`);
  await app.delete();
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
