/**
 * One-off: open Tirgan's posting to students.
 *
 * The listing was written and the organisation verified, but `status` stayed
 * 'closed', so it was invisible. isVisibleToStudents is only
 * `status !== 'closed' && !isFixture` — no date filter — so flipping status is
 * the whole change and it takes effect on the next page load.
 *
 * Prints the full listing first. This goes in front of 14 to 16 year olds, so
 * the text is read before it is published, not after.
 *
 *   npx tsx scripts/open-tirgan-listing.ts          # show it, change nothing
 *   npx tsx scripts/open-tirgan-listing.ts --write  # open it
 */
import a from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const OPP_ID = '5QPNLGwsRqgDZWhXvP4b';

async function main() {
  const write = process.argv.includes('--write');
  const app = a.initializeApp({
    credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)),
  });
  const db = app.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const ref = db.collection('opportunities').doc(OPP_ID);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`opportunity ${OPP_ID} not found`);
  const v = snap.data() as any;

  for (const k of ['orgName', 'title', 'category', 'location', 'status', 'scheduleType',
                   'timeCommitment', 'maxVolunteers', 'minAge', 'isVirtual']) {
    if (v[k] !== undefined) console.log(`${k.padEnd(16)} ${JSON.stringify(v[k])}`);
  }
  console.log(`coordinates      ${JSON.stringify(v.coordinates)}`);
  console.log(`skillsNeeded     ${JSON.stringify(v.skillsNeeded)}`);
  console.log(`\n--- description ---\n${v.description}`);
  console.log(`\n--- requirements ---\n${v.requirements || '(none)'}`);

  if (!write) {
    console.log(`\nDry run. status is '${v.status}'. Re-run with --write to set it to 'open'.`);
    await app.delete();
    return;
  }
  if (v.status === 'open') {
    console.log('\nAlready open. Nothing to do.');
    await app.delete();
    return;
  }

  await ref.update({ status: 'open', updatedAt: a.firestore.FieldValue.serverTimestamp() });
  console.log(`\nstatus: '${v.status}' -> 'open'. Live to students now.`);
  await app.delete();
}

main().catch((e) => { console.error(e); process.exit(1); });
