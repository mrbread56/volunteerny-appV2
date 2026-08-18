/**
 * Migrate stored availability onto the single canonical vocabulary.
 *
 *   npm run backfill:availability            # dry run, changes nothing
 *   npm run backfill:availability -- --commit
 *
 * Why this exists: availability was written by two incompatible lists that
 * shared only two values. Signup and StudentOnboarding wrote 'Weekend
 * Mornings'; StudentProfile offered 'Weekends (Saturday/Sunday)'. A student who
 * onboarded and then opened their profile saw their answer disappear from the
 * UI, and saving from that screen wrote the second vocabulary over the first.
 *
 * src/lib/vocabularies.ts now defines one list, and the profile screen reads
 * through normalizeAvailability() so nothing is lost on screen either way. This
 * script makes the stored data match, so that anything filtering on
 * availability sees one vocabulary rather than two.
 *
 * Dry run by default, and it prints every change before making it. The mapping
 * is deliberately widening rather than narrowing: 'Weekends (Saturday/Sunday)'
 * becomes BOTH weekend slots, because narrowing it would quietly reduce what a
 * student told us they could do.
 */
import './env';
import adminNs from 'firebase-admin';
import { normalizeAvailability } from '../src/lib/vocabularies';

const admin: any = (adminNs as any).default ?? adminNs;

const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!key) {
  console.error('[FAIL] FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
  process.exit(1);
}

const commit = process.argv.includes('--commit');

(async () => {
  const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(key)) }, 'backfill-availability');
  const { getFirestore } = await import('firebase-admin/firestore');
  const dbId = process.env.FIREBASE_DATABASE_ID;
  const db: any = dbId ? getFirestore(app, dbId) : getFirestore(app);

  console.log(`database : ${dbId || '(default)'}`);
  console.log(commit ? 'MODE     : COMMIT — this will write.\n' : 'MODE     : DRY RUN — nothing will be written. Add --commit to apply.\n');

  const snap = await db.collection('students').get();
  let changed = 0;
  let already = 0;
  let empty = 0;

  for (const d of snap.docs) {
    const stored: string[] | undefined = d.data()?.availability;
    if (!Array.isArray(stored) || stored.length === 0) { empty++; continue; }

    const next = normalizeAvailability(stored);
    const same =
      next.length === stored.length && next.every((v, i) => v === stored[i]);
    if (same) { already++; continue; }

    console.log(`  ${d.id}`);
    console.log(`    from: ${JSON.stringify(stored)}`);
    console.log(`    to  : ${JSON.stringify(next)}`);
    changed++;

    if (commit) await d.ref.update({ availability: next });
  }

  console.log(`\n${snap.size} student(s): ${changed} ${commit ? 'updated' : 'would change'}, ${already} already canonical, ${empty} with none set.`);
  if (!commit && changed) console.log('Nothing was written. Re-run with --commit to apply.');
  process.exit(0);
})();
