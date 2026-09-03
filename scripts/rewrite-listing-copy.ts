/**
 * One-off: rewrite the two live listings in the organisation's own voice.
 *
 * Both were written for the organisations rather than by them, and it showed.
 * The Tirgan copy in particular pitched at the reader instead of describing the
 * job: "there is real work to do behind the scenes", "a good fit if you want
 * experience in an arts organization", and worst of all "a real organization,
 * real responsibilities, and skills that transfer" - a three-noun cadence that
 * carries no information at all.
 *
 * What replaces it is what a coordinator would actually type: first person
 * plural, what the work is, when, where, and who it helps. Nothing new is
 * claimed. Every fact here was already in the copy it replaces.
 *
 * The previous text is kept below so this is reversible.
 *
 *   npx tsx scripts/rewrite-listing-copy.ts          # show the diff
 *   npx tsx scripts/rewrite-listing-copy.ts --write  # apply
 */
import a from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

type Rewrite = { id: string; org: string; description: string; requirements?: string };

const REWRITES: Rewrite[] = [
  {
    id: '5QPNLGwsRqgDZWhXvP4b',
    org: 'Tirgan Centre for Art & Culture',
    description: `Tirgan runs an arts and culture festival, and most of the work for it happens in the year before it opens. That is what we need help with.

The work is in our office and it changes from week to week. Some of it is computer and digital work, some is admin and keeping things organised, some is marketing and social media. We will show you what needs doing when you come in.

Hours are arranged with the office, so tell us when you are free and we will work around school.

We are at 45 Sheppard Avenue East, just east of Yonge and a short walk from Sheppard-Yonge station.

You do not need any experience. If you are curious about how a festival actually gets put together, you will see all of it from the inside.`,
    requirements: `Be reliable, and let us know if your plans change.

No experience needed. An interest in arts, culture, marketing, admin or technology helps, but we are not expecting it.`,
  },
  {
    id: '6kXS3rDGu5QtLNaL38ky',
    org: 'Community Share Food Bank',
    description: `We are open one day a week, on Wednesdays, and we need one volunteer to help clients as they arrive and leave.

The job is carrying things up and down stairs. There is a flight of stairs into the food bank, and clients arrive with strollers and shopping carts. You would carry them up on the way in and back down to the parking lot on the way out. The strollers are empty, no children in them.

For the people we serve this is the hardest part of the visit. They are carrying a week of groceries.

We are in Don Mills near The Shops at Don Mills, a short walk from a bus stop.`,
    requirements: `You must be 16 or older. That is our own regulation and we cannot waive it.

This is heavy lifting for the whole shift. You need to be able to carry loaded shopping carts and strollers up and down a full flight of stairs, over and over, for up to four hours. Please do not apply if you are not sure you can.

We are open Wednesdays from 11am to 3pm, and the busiest stretch is 11am to 2pm, so you need to be free then.`,
  },
];

const head = (s: string, n = 3) => s.split('\n').filter(Boolean).slice(0, n).map((l) => `    ${l.slice(0, 92)}`).join('\n');

async function main() {
  const write = process.argv.includes('--write');
  const app = a.initializeApp({
    credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)),
  });
  const db = app.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  for (const r of REWRITES) {
    const ref = db.collection('opportunities').doc(r.id);
    const snap = await ref.get();
    if (!snap.exists) { console.error(`SKIP ${r.id}: not found`); continue; }
    const before = snap.data() as any;

    console.log(`\n===== ${r.org}`);
    console.log(`  BEFORE (${before.description.length} chars)\n${head(before.description)}`);
    console.log(`  AFTER  (${r.description.length} chars)\n${head(r.description)}`);

    if (!write) continue;

    const patch: any = { description: r.description, updatedAt: a.firestore.FieldValue.serverTimestamp() };
    if (r.requirements) patch.requirements = r.requirements;
    await ref.update(patch);
    console.log('  applied');
  }

  if (!write) console.log('\nDry run. Re-run with --write to apply.');
  await app.delete();
}

main().catch((e) => { console.error(e); process.exit(1); });
