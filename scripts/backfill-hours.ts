/**
 * One-off: give every student the denormalised `hours` total the leaderboard
 * orders by.
 *
 *   npm run backfill:hours -- --dry-run    (default: shows what would change)
 *   npm run backfill:hours -- --apply
 *
 * Hours only ever accumulated in the `loggedHours` array. `students/{uid}.hours`
 * was written by nothing, and Firestore's orderBy EXCLUDES documents that lack
 * the field entirely — so students who earned their hours before that was fixed
 * are missing from the board rather than sitting at the bottom of it, and stay
 * missing until someone approves more hours for them.
 *
 * Runs with the Admin SDK, which bypasses rules — that is required here, since
 * no client is allowed to write another student's total (and a student may not
 * write their own).
 *
 * Idempotent: a student whose stored total already matches is skipped, so this
 * is safe to run repeatedly.
 */
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';
import { totalLoggedHours } from '../src/lib/hours';

dotenv.config();

const apply = process.argv.includes('--apply');
const a: any = (admin as any).default || admin;
const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!key) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
  process.exit(1);
}
const app = a.initializeApp({ credential: a.credential.cert(JSON.parse(key)) }, 'backfill-hours');
const db = app.firestore();
db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

(async () => {
  const snap = await db.collection('students').get();
  let changed = 0;
  let alreadyCorrect = 0;
  // Firestore caps a batch at 500 writes.
  let batch = db.batch();
  let inBatch = 0;

  for (const d of snap.docs) {
    const data = d.data();
    const expected = totalLoggedHours(data.loggedHours);
    const stored = data.hours;

    if (typeof stored === 'number' && stored === expected) {
      alreadyCorrect++;
      continue;
    }

    changed++;
    console.log(
      `  ${d.id}  ${data.fullName || '(no name)'}  ${stored === undefined ? '(no hours field)' : stored} -> ${expected}`
    );

    if (apply) {
      batch.update(d.ref, { hours: expected });
      if (++inBatch === 500) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
    }
  }

  if (apply && inBatch > 0) await batch.commit();

  console.log(`\n${snap.size} student(s): ${alreadyCorrect} already correct, ${changed} ${apply ? 'updated' : 'would change'}.`);
  if (!apply && changed > 0) console.log('Re-run with --apply to write these.');
  process.exit(0);
})();
