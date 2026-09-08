/**
 * One-off: post the Rotary Club of North York's Terry Fox Run.
 *
 * Randall Linton, current club president, wrote on 8 Sep 2026. The outreach
 * had gone to Monica Walderman, the previous president, and she passed it on.
 * He asked for exactly one thing:
 *
 *   "I tried to get into your website but it was a blank page with just
 *    'return to website'. It there any way you can put this into your portal
 *    to see if we get any traction. We need about ten more student volunteers."
 *
 * (The blank page was not the site. The link in the outreach email had been
 * rewritten into a google.com/url wrapper with a literal 0x17 control character
 * inside it, so Google served its redirect notice instead of forwarding him.
 * See docs/outreach-email.md.)
 *
 * THIS LISTING IS CREATED OPEN, and that is the difference from KCCA.
 *
 * The KCCA listing stayed closed because four things were unknown and a start
 * time is not worth guessing. Here nothing is unknown: Randall gave the date,
 * the times, the place, the job, what to bring, how long it counts for, and
 * how many people he needs. There is nothing left to confirm, and the run is
 * twelve days away, so a closed listing would just be a slower no.
 *
 * WHAT CAME FROM WHERE, nothing invented:
 *   date, time, place, duties      Randall's email, 8 Sep 2026, quoted below
 *   ten volunteers                 his words, "we need about ten more"
 *   five guaranteed hours          his words. It is his organisation and his
 *                                  signature on the hours, so it is stated as
 *                                  he stated it, not adjusted to the 3.5 hours
 *                                  actually worked
 *   coordinates                    Nominatim, "Gibson Park, North York,
 *                                  Toronto, Ontario" -> 43.7689676 /
 *                                  -79.4157842, which is the park itself
 *   20 Sep 2026 is a Sunday        checked; his date is internally consistent
 *   the club runs this annually    rotarynorthyork.org and District 7070
 *
 * minAge is deliberately absent. He said "high schoolers" and nothing more, and
 * an absent value means no floor rather than a floor of zero.
 *
 * The account already exists: provision-org-account.ts built it under
 * --profile=rotarynorthyork. This script only adds the posting, and refuses to
 * run twice.
 *
 *   npx tsx scripts/create-terryfox-listing.ts            # print it, write nothing
 *   npx tsx scripts/create-terryfox-listing.ts --write
 */
import a from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const EMAIL = 'randall@interiorcare.com';

/*
 * Toronto is on EDT on 20 September, so the offset is written as -04:00 rather
 * than left to the machine's local zone. Without it this script produces a
 * different time on a laptop in another country.
 */
const RUN_START = new Date('2026-09-20T08:00:00-04:00');

const LISTING = {
  title: 'Terry Fox Run route marshal',
  category: 'Event Planning',
  location: 'Gibson Park, Beecroft Road and Park Home Avenue, North York',
  coordinates: { lat: 43.7689676, lng: -79.4157842 },
  maxVolunteers: 10,
  isVirtual: false,
  scheduleType: 'single' as const,
  timeCommitment: 'One-time, 8:00 am to 11:30 am',
  skillsNeeded: ['Event Support', 'Communication'],
  status: 'open' as const,
  shifts: [{ date: '2026-09-20', startTime: '08:00', endTime: '11:30' }],
  description: `The Rotary Club of North York runs the Terry Fox Run at Gibson Park every year, and needs about ten students to help on the day.

You sit at a station along the 5 km route, keep participants going the right way, and cheer them on. That is the whole job. No experience, no training, and nothing to prepare.

The run starts at 9 am. Volunteers are there from 8:00 am to 11:30 am, so about three and a half hours of actual work. The Rotary Club guarantees five volunteer hours for the day.

Lunch is provided afterwards at Rose Garden Park.

Bring a cell phone, a lawn chair, snacks, clothes for whatever the weather does, and a friend if you have one who also needs hours.

Gibson Park is at Beecroft and Park Home Avenue, a few minutes from North York Centre station.`,
  requirements: `Be at the park by 8:00 am and tell the organisers if your plans change, because a missing marshal means a gap on the route.

Bring: a cell phone, a lawn chair, snacks, and clothing appropriate for the day.

No experience needed. You will be shown your station when you arrive.`,
};

function line(k: string, v: string) {
  console.log(`  ${k.padEnd(16)}${v}`);
}

async function main() {
  const write = process.argv.includes('--write');

  console.log('THE ROTARY CLUB OF NORTH YORK — Terry Fox Run\n');
  line('title', LISTING.title);
  line('when', `${RUN_START.toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'full', timeStyle: 'short' })} Toronto`);
  line('where', LISTING.location);
  line('volunteers', String(LISTING.maxVolunteers));
  line('status', LISTING.status);
  line('hours', 'five guaranteed, for a 3.5 hour shift');

  if (!write) {
    console.log('\nDry run. Nothing written. Re-run with --write.');
    return;
  }

  const app = a.initializeApp({
    credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)),
  });
  const db = app.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const user = await app.auth().getUserByEmail(EMAIL);
  const uid = user.uid;
  const org = await db.collection('organizations').doc(uid).get();
  if (!org.exists) throw new Error(`${EMAIL} has no organization profile. Run provision-org-account.ts first.`);
  if (org.data()!.verificationStatus !== 'verified') {
    throw new Error(`${EMAIL} is not verified, so the posting would be rejected by the rules.`);
  }

  // Refusing to run twice matters more than usual here: a duplicate listing
  // would split ten places across two postings and let twenty students apply.
  const existing = await db.collection('opportunities')
    .where('orgId', '==', uid).where('title', '==', LISTING.title).get();
  if (!existing.empty) {
    throw new Error(`Already posted as ${existing.docs[0].id}. Refusing to create a second.`);
  }

  const opp = await db.collection('opportunities').add({
    ...LISTING,
    orgId: uid,
    orgName: org.data()!.organizationName,
    dateTime: a.firestore.Timestamp.fromDate(RUN_START),
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`\ncreated`);
  line('org uid', uid);
  line('opportunity', opp.id);
  line('status', 'open, so students can see and apply to it now');
  await app.delete();
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
