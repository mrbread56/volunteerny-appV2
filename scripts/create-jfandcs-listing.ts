/**
 * One-off: post JF&CS's Online Homework Club tutor role.
 *
 * Andrea Pines, Coordinator of Volunteer Services, replied on 9 Sep 2026 with
 * the position description as a PDF and one line that is not in it:
 *
 *   "It is open for students in Grade 11 & 12 to apply."
 *
 * Everything below is from that PDF or that sentence. Nothing is invented.
 *
 * CREATED CLOSED, and not for KCCA's reason.
 *
 * KCCA's is closed because facts are missing. Everything here is known. This
 * one is closed because Andrea has not been ASKED yet. She sent a position
 * description in reply to an offer to build a listing; she did not say put it
 * in front of students today. Posting first and telling her afterwards is how
 * you end up explaining yourself to someone who was only being helpful, and
 * this week has already produced one organisation asking whether we are a
 * legitimate outfit.
 *
 * Open it from her dashboard, or with open-tirgan-listing.ts, once she says
 * yes.
 *
 * WHY THIS IS THE BEST LISTING ON THE SITE, and worth protecting:
 *
 *   It is online, so the travel problem that quietly kills most placements does
 *   not exist. A student in Scarborough can take it.
 *
 *   It runs weekly to June. One hour a week from October is roughly 35 hours,
 *   which is most of the 40 a student needs to graduate, in one placement. No
 *   other posting here comes close.
 *
 * minAge 16 is the honest reading of "Grade 11 & 12". Ontario Grade 11 students
 * are usually 16, and eligibility.ts derives an age floor from grade, so 16 is
 * the value that turns away the Grade 9s and 10s Andrea cannot accept. It will
 * also turn away a young Grade 11, which is the safer error: a student who is
 * refused by the filter can email her, while a student who is accepted and then
 * rejected has wasted her time and their own.
 *
 * maxVolunteers is the ONE number she did not give. Five is a guess and is
 * flagged as such in the reply to her. Under-setting is the safer direction
 * because the sixth applicant is waitlisted rather than declined, and the code
 * promotes automatically when a place frees up.
 *
 *   npx tsx scripts/create-jfandcs-listing.ts
 *   npx tsx scripts/create-jfandcs-listing.ts --write
 */
import a from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const EMAIL = 'apines@jfandcs.com';

/*
 * The school year, not a date. Weekly sessions run "throughout the school year
 * until June", and the actual slot is agreed between the tutor and the family,
 * so dateTime is the point from which the placement is live rather than a time
 * anyone should turn up. scheduleType 'flexible' is what stops the site
 * rendering a schedule that does not exist.
 */
const STARTS = new Date('2026-09-21T09:00:00-04:00');

const LISTING = {
  title: 'Online Homework Club tutor',
  description: [
    'Help elementary and secondary students with their homework, one hour a week on Zoom.',
    '',
    'You would work with the same children through the school year: helping with homework and projects, helping them prepare for tests, and keeping them going with educational activities and games once the work is done. You also pass on how they are getting on, to them and to the staff.',
    '',
    'You do not need teaching experience. What Jewish Family & Child Service asks for is knowledge of the school subjects, patience, the ability to hold back judgement, and reliability about showing up at the agreed time. An understanding of different learning styles helps. Hebrew is an asset but is not required.',
    '',
    'You are not left to work it out alone. Andrea Pines gives you an orientation to JF&CS, the Homework Club staff provide resources and training, and they supervise the club directly.',
    '',
    'Sessions are weekly and run until June. You and the family arrange the time between you, so it fits around school.',
  ].join('\n'),
  location: 'Online, on Zoom',
  isVirtual: true,
  category: 'Tutoring',
  requirements: [
    'Grade 11 or 12.',
    'Knowledge of elementary, middle and secondary school subjects.',
    'Patience, and the ability to reserve judgement.',
    'Able to commit to a set time each week on Zoom for the school year, until June.',
    'Hebrew is an asset, not a requirement.',
  ].join(' '),
  skillsNeeded: ['Tutoring', 'Patience', 'Reliability', 'Communication'],
  timeCommitment: 'One hour a week on Zoom, through to June',
  maxVolunteers: 5,
  minAge: 16,
  scheduleType: 'flexible' as const,
  status: 'closed' as const,
};

const line = (k: string, v: string) => console.log(`  ${k.padEnd(13)}${v}`);

async function main() {
  const write = process.argv.includes('--write');

  console.log('JEWISH FAMILY & CHILD SERVICE — Online Homework Club\n');
  line('title', LISTING.title);
  line('where', LISTING.location);
  line('commitment', LISTING.timeCommitment);
  line('minimum age', `${LISTING.minAge}, which is Grade 11 and 12`);
  line('volunteers', `${LISTING.maxVolunteers}  (GUESSED — she did not say)`);
  line('status', LISTING.status);
  line('hours', 'about 35 over the school year, at an hour a week');

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
    throw new Error(`${EMAIL} is not verified, so firestore.rules would reject the posting.`);
  }

  const existing = await db.collection('opportunities')
    .where('orgId', '==', uid).where('title', '==', LISTING.title).get();
  if (!existing.empty) {
    throw new Error(`Already posted as ${existing.docs[0].id}. Refusing to create a second.`);
  }

  const opp = await db.collection('opportunities').add({
    ...LISTING,
    orgId: uid,
    orgName: org.data()!.organizationName,
    dateTime: a.firestore.Timestamp.fromDate(STARTS),
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });

  console.log('\ncreated');
  line('org uid', uid);
  line('opportunity', opp.id);
  await app.delete();
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
