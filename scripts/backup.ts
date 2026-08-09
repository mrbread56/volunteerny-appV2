/**
 * Full database backup to a local JSON file. Free — no Blaze plan needed.
 *
 *   npm run backup
 *
 * Firestore's built-in scheduled backups require the Blaze plan. This does the
 * same job for a project of this size using ordinary reads, which are free
 * within the Spark quota (50,000/day; a full dump here costs a few dozen).
 *
 * What it is:  a point-in-time snapshot you can restore from.
 * What it is not: continuous point-in-time recovery. If you lose data an hour
 * after the last run, you lose that hour. Run it before anything risky —
 * a rules deploy, a migration, a bulk edit — and on a schedule once real
 * students depend on it.
 *
 * ── THE FILES CONTAIN STUDENT PERSONAL DATA ──
 * Names, emails, schools, grades, and base64 resume and passport uploads for
 * people who are mostly minors. backups/ is gitignored and must stay that way.
 * Do not commit one, do not put one in a public folder, and if you copy one to
 * cloud storage make sure that storage is private.
 */
import './env';
import * as admin from 'firebase-admin';
import fs from 'node:fs';
import path from 'node:path';


/** Every collection the app actually uses. Keep in sync with ARCHITECTURE.md. */
const COLLECTIONS = [
  'users',
  'students',
  'organizations',
  'opportunities',
  'applications',
  'hoursRequests',
  'savedOpportunities',
  'orgRatings',
  'feedbacks',
  'reports',
  'leaderboards',
  'interestRequests',
  'recommendations',
];

/** Firestore Timestamps and refs do not survive JSON.stringify usefully. */
function serialise(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value?.toDate === 'function') {
    return { __type: 'timestamp', value: value.toDate().toISOString() };
  }
  if (typeof value?.latitude === 'number' && typeof value?.longitude === 'number') {
    return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (Array.isArray(value)) return value.map(serialise);
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialise(v);
    return out;
  }
  return value;
}

(async () => {
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) {
    console.error('[FAIL] FIREBASE_SERVICE_ACCOUNT_KEY is not set — cannot read the database.');
    process.exit(1);
  }

  const a: any = (admin as any).default || admin;
  const app = a.initializeApp({ credential: a.credential.cert(JSON.parse(key)) }, 'backup');
  const db = app.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join('backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `firestore-${stamp}.json`);

  const dump: Record<string, Record<string, any>> = {};
  let totalDocs = 0;
  let failures = 0;

  for (const name of COLLECTIONS) {
    try {
      const snap = await db.collection(name).get();
      dump[name] = {};
      snap.forEach((doc: any) => {
        dump[name][doc.id] = serialise(doc.data());
      });
      totalDocs += snap.size;
      console.log(`  ${name.padEnd(20)} ${String(snap.size).padStart(5)} document(s)`);
    } catch (err: any) {
      failures++;
      console.error(`  ${name.padEnd(20)} FAILED: ${err?.message || err}`);
    }
  }

  // A backup that silently captured nothing is worse than no backup, because
  // it looks like protection. Refuse to write one.
  if (totalDocs === 0) {
    console.error('\n[FAIL] Read 0 documents across every collection. Not writing an empty backup — check the credentials and FIREBASE_DATABASE_ID.');
    process.exit(1);
  }

  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        databaseId: process.env.FIREBASE_DATABASE_ID || '(default)',
        totalDocuments: totalDocs,
        collectionsFailed: failures,
        data: dump,
      },
      null,
      2,
    ),
  );

  const sizeMb = (fs.statSync(file).size / 1024 / 1024).toFixed(2);
  console.log(`\n[OK] ${totalDocs} document(s) written to ${file} (${sizeMb} MB)`);
  if (failures) console.warn(`[WARN] ${failures} collection(s) could not be read — the backup is incomplete.`);
  console.log('     This file contains student personal data. Keep it private; backups/ is gitignored.');

  process.exit(failures ? 1 : 0);
})();
