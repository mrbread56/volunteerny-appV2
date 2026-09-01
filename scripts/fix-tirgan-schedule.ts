/**
 * One-off: move Tirgan's listing onto the flexible schedule type.
 *
 * The organization confirmed hours are arranged directly with their office.
 * The listing was filed as 'recurring' with no shifts because no other type
 * fitted, which pinned it to a Weekday Evenings availability slot derived from
 * the moment it was saved. See tests/matching.spec.ts for the regression.
 *
 * `status` is deliberately not touched. The listing is closed and stays
 * closed; opening it puts a live posting in front of students and is a
 * separate decision.
 *
 *   npx tsx scripts/fix-tirgan-schedule.ts          # show what would change
 *   npx tsx scripts/fix-tirgan-schedule.ts --write  # apply it
 */
import a from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const OPP_ID = '5QPNLGwsRqgDZWhXvP4b';

const summarize = (d: any) => ({
  title: d.title,
  scheduleType: d.scheduleType,
  shifts: d.shifts,
  dateTime: d.dateTime?.toDate?.().toISOString(),
  status: d.status,
});

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

  const before = snap.data() as any;
  console.log('BEFORE', JSON.stringify(summarize(before), null, 1));

  const { slotsForOpportunity } = await import('../src/lib/availability');
  console.log('slots before:', JSON.stringify(slotsForOpportunity(before)));

  if (!write) {
    console.log('\nDry run. Re-run with --write to apply:');
    console.log("  scheduleType -> 'flexible', shifts -> [], dateTime -> now, status unchanged");
    await app.delete();
    return;
  }

  await ref.update({
    scheduleType: 'flexible',
    shifts: [],
    dateTime: a.firestore.Timestamp.now(),
    updatedAt: a.firestore.FieldValue.serverTimestamp(),
  });

  const after = (await ref.get()).data() as any;
  console.log('AFTER ', JSON.stringify(summarize(after), null, 1));
  console.log('slots after: ', JSON.stringify(slotsForOpportunity(after)), '(empty = matches every student)');
  await app.delete();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
