/**
 * Restore Firestore from a backup written by `npm run backup`.
 *
 *   npm run restore -- backups/firestore-2026-08-08T20-31-04.json          # dry run
 *   npm run restore -- backups/firestore-2026-08-08T20-31-04.json --commit # actually write
 *
 * This exists because a backup nobody has restored from is not a backup — it
 * is an untested assumption with a filename. `npm run check:backup` proves the
 * round trip works against throwaway documents, so the day this is needed is
 * not the first time it has run.
 *
 * Safety, in order of how badly each could go wrong:
 *
 *   - DRY RUN BY DEFAULT. Without --commit it reports exactly what it would do
 *     and writes nothing. Restoring is the most destructive operation in this
 *     repository and must never be one typo away.
 *   - It does NOT delete. Documents created after the backup are left alone;
 *     `restore` means "put these documents back", not "make the database look
 *     like this file". Wiping newer data during an incident is how a bad day
 *     becomes an unrecoverable one.
 *   - It refuses a file it cannot fully parse, rather than restoring the part
 *     it understood and leaving the database half-old and half-new.
 *   - It takes a fresh backup first, unless --no-pre-backup is passed. If the
 *     restore is itself a mistake, you can undo it.
 */
import './env';
import * as admin from 'firebase-admin';

// firebase-admin ships CJS; under ESM the namespace import does not expose
// `.firestore`, so Timestamp/GeoPoint are undefined on it. Every other script
// resolves the real module the same way.
const fb: any = (admin as any).default || admin;
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Undo the serialisation `backup.ts` applies to Firestore's special types. */
function deserialise(value: any): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(deserialise);
  if (typeof value === 'object') {
    if (value.__type === 'timestamp' && typeof value.value === 'string') {
      return fb.firestore.Timestamp.fromDate(new Date(value.value));
    }
    if (value.__type === 'geopoint') {
      return new fb.firestore.GeoPoint(value.latitude, value.longitude);
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deserialise(v);
    return out;
  }
  return value;
}

(async () => {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const commit = args.includes('--commit');
  const skipPreBackup = args.includes('--no-pre-backup');

  if (!file) {
    console.error('Usage: npm run restore -- <backup.json> [--commit] [--no-pre-backup]');
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`[FAIL] No such file: ${file}`);
    process.exit(1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err: any) {
    console.error(`[FAIL] ${file} is not valid JSON — refusing to restore from it. ${err?.message || ''}`);
    process.exit(1);
  }
  if (!parsed?.data || typeof parsed.data !== 'object') {
    console.error('[FAIL] That file has no "data" section — it was not written by npm run backup.');
    process.exit(1);
  }

  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) {
    console.error('[FAIL] FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
    process.exit(1);
  }

  console.log(`Backup taken:  ${parsed.takenAt}`);
  console.log(`Database:      ${parsed.databaseId}`);
  console.log(`Documents:     ${parsed.totalDocuments}`);
  console.log(commit ? '\nMODE: COMMIT — this will write to the database.\n' : '\nMODE: DRY RUN — nothing will be written. Add --commit to apply.\n');

  // Take a fresh snapshot before overwriting anything, so the restore itself
  // can be undone.
  if (commit && !skipPreBackup) {
    console.log('Taking a pre-restore backup first...');
    try {
      execFileSync('npx', ['tsx', 'scripts/backup.ts'], { stdio: 'inherit', shell: process.platform === 'win32' });
    } catch {
      console.error('[FAIL] The pre-restore backup failed. Refusing to continue — pass --no-pre-backup to override.');
      process.exit(1);
    }
    console.log('');
  }

  const app = fb.initializeApp({ credential: fb.credential.cert(JSON.parse(key)) }, 'restore');
  const db = app.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  let written = 0;
  let failed = 0;

  for (const [collection, docs] of Object.entries(parsed.data as Record<string, Record<string, any>>)) {
    const ids = Object.keys(docs);
    if (ids.length === 0) continue;

    if (!commit) {
      console.log(`  ${collection.padEnd(20)} would restore ${String(ids.length).padStart(5)} document(s)`);
      written += ids.length;
      continue;
    }

    // Batched, because a per-document write of a large collection is slow and
    // partially-applied. 500 is Firestore's limit.
    for (let i = 0; i < ids.length; i += 400) {
      const batch = db.batch();
      for (const id of ids.slice(i, i + 400)) {
        batch.set(db.collection(collection).doc(id), deserialise(docs[id]));
      }
      try {
        await batch.commit();
        written += Math.min(400, ids.length - i);
      } catch (err: any) {
        failed++;
        console.error(`  ${collection.padEnd(20)} batch failed: ${err?.message || err}`);
      }
    }
    console.log(`  ${collection.padEnd(20)} restored ${String(ids.length).padStart(5)} document(s)`);
  }

  console.log(
    commit
      ? `\n[OK] ${written} document(s) restored${failed ? `, ${failed} batch(es) failed` : ''}.`
      : `\n[DRY RUN] ${written} document(s) would be restored. Nothing was written. Add --commit to apply.`,
  );
  process.exit(failed ? 1 : 0);
})();
