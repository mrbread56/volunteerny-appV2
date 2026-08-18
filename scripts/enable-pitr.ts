/**
 * Turn on point-in-time recovery, and add a daily backup schedule.
 *
 *   npm run enable:pitr
 *
 * These are the only real recovery this project has. `npm run backup` writes a
 * JSON snapshot when a human remembers to run it; PITR lets Firestore itself
 * roll the database back to any microsecond in the retention window, which is
 * the difference between losing a day of graduation records and losing none.
 *
 * The data here is hour records that students need in order to graduate. A bad
 * write, a bad migration, or a mistaken bulk delete is currently unrecoverable
 * beyond the last manual snapshot.
 *
 * Needs `datastore.databases.update` and `datastore.backupSchedules.create`,
 * which the Firebase Admin service account does NOT have by default — it ships
 * with enough to read and write documents, not to reconfigure the database.
 * Grant `roles/datastore.owner` to
 * firebase-adminsdk-fbsvc@<project>.iam.gserviceaccount.com and this becomes a
 * one-command operation, repeatable for any future database.
 *
 * Idempotent: already-enabled and already-scheduled are reported as such.
 */
import './env';
import adminNs from 'firebase-admin';

const admin: any = (adminNs as any).default ?? adminNs;

const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!key) { console.error('FIREBASE_SERVICE_ACCOUNT_KEY is not set.'); process.exit(1); }
const sa = JSON.parse(key);
const databaseId = process.env.FIREBASE_DATABASE_ID;
if (!databaseId) { console.error('FIREBASE_DATABASE_ID is not set.'); process.exit(1); }

const app = admin.initializeApp({ credential: admin.credential.cert(sa) }, 'enable-pitr');
const BASE = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/${databaseId}`;

let failed = 0;

(async () => {
  const tok = (await app.options.credential.getAccessToken()).access_token;
  const headers = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

  console.log(`project  : ${sa.project_id}`);
  console.log(`database : ${databaseId}\n`);

  // ── 1. Point-in-time recovery ────────────────────────────────────────────
  const before: any = await (await fetch(BASE, { headers })).json();
  if (before.pointInTimeRecoveryEnablement === 'POINT_IN_TIME_RECOVERY_ENABLED') {
    console.log('[OK]   point-in-time recovery is already on');
  } else {
    const r = await fetch(`${BASE}?updateMask=pointInTimeRecoveryEnablement`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED' }),
    });
    if (r.ok) {
      console.log('[DONE] point-in-time recovery enabled (7-day window)');
    } else {
      const e: any = await r.json().catch(() => ({}));
      console.error(`[FAIL] could not enable PITR: ${e?.error?.message || r.status}`);
      failed++;
    }
  }

  // ── 2. A daily backup, kept for a week ───────────────────────────────────
  //
  // PITR and scheduled backups solve different failures. PITR rewinds THIS
  // database; a backup survives the database being deleted outright.
  const listRes = await fetch(`${BASE}/backupSchedules`, { headers });
  if (listRes.ok) {
    const existing: any = await listRes.json();
    if ((existing.backupSchedules || []).length > 0) {
      console.log(`[OK]   ${existing.backupSchedules.length} backup schedule(s) already configured`);
    } else {
      const r = await fetch(`${BASE}/backupSchedules`, {
        method: 'POST', headers,
        body: JSON.stringify({
          retention: '604800s', // 7 days, the maximum for a daily schedule
          dailyRecurrence: {},
        }),
      });
      if (r.ok) {
        console.log('[DONE] daily backup schedule created, kept 7 days');
      } else {
        const e: any = await r.json().catch(() => ({}));
        console.error(`[FAIL] could not create a backup schedule: ${e?.error?.message || r.status}`);
        failed++;
      }
    }
  } else {
    const e: any = await listRes.json().catch(() => ({}));
    console.error(`[FAIL] could not list backup schedules: ${e?.error?.message || listRes.status}`);
    failed++;
  }

  // ── 3. Report what is actually true now ──────────────────────────────────
  const after: any = await (await fetch(BASE, { headers })).json();
  console.log(`\nPITR now : ${after.pointInTimeRecoveryEnablement || 'unknown'}`);
  if (failed) {
    console.error('\nThe service account is missing permissions. Grant roles/datastore.owner to:');
    console.error(`  ${sa.client_email}`);
    console.error('at https://console.cloud.google.com/iam-admin/iam?project=' + sa.project_id);
  }
  process.exit(failed ? 1 : 0);
})();
