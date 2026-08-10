/**
 * Find, notify, and (optionally) remove orphaned accounts.
 *
 *   npm run repair:orphans                  # dry run: list orphans, change nothing
 *   npm run repair:orphans -- --notify      # also email each orphan a finish-signup link
 *   npm run repair:orphans -- --delete --confirm-delete
 *                                           # delete orphans that hold no platform data
 *
 * What counts as orphaned (STATUS.md B15): an auth account — with or without a
 * `users/{uid}` role document — that has neither a `students/{uid}` nor an
 * `organizations/{uid}` profile. These are signups that died between the auth
 * account being created and the profile being written. The app's route guard
 * already offers such accounts a one-click path to finish signup (they are
 * sent to /signup instead of a dead end), so the fix for a LIVE orphan is
 * usually just telling them to sign in again. This script is the operator half
 * of that story: find them, contact them, and — only when explicitly confirmed
 * — remove the ones that hold nothing.
 *
 * Safety rails:
 *  - Dry run is the default; nothing is written unless a flag is passed.
 *  - `--delete` refuses any account that owns applications, hours requests,
 *    feedback, reports, saved opportunities or ratings — deleting those would
 *    orphan OTHER users' data that references them.
 *  - `--delete` additionally requires `--confirm-delete`.
 *  - Every action is logged with the account email and uid.
 *
 * Needs FIREBASE_SERVICE_ACCOUNT_KEY and FIREBASE_DATABASE_ID (the project has
 * no (default) database). `--notify` additionally needs RESEND_API_KEY and
 * MAIL_FROM.
 */
import './env';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { appOrigin } from '../server/appUrl';

const args = process.argv.slice(2);
const notify = args.includes('--notify');
const del = args.includes('--delete');
const confirmed = args.includes('--confirm-delete');

interface Orphan {
  uid: string;
  email: string;
  role: string | null;
  hasUsersDoc: boolean;
  createdAt: string | null;
  hasData: boolean;
}

(async () => {
  const a: any = (admin as any).default || admin;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) {
    console.error('[FAIL] FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
    process.exit(1);
  }
  const databaseId = process.env.FIREBASE_DATABASE_ID;
  if (!databaseId) {
    console.error('[FAIL] FIREBASE_DATABASE_ID is not set — this project has no (default) database.');
    process.exit(1);
  }
  if (del && !confirmed) {
    console.error('[FAIL] --delete requires --confirm-delete. Run a dry pass first.');
    process.exit(1);
  }

  const app = a.initializeApp({ credential: a.credential.cert(JSON.parse(key)) }, 'repair-orphans');
  const db = app.firestore();
  db.settings({ databaseId });
  const auth = app.auth();

  // ── Collect every auth account ─────────────────────────────────────────
  const users: admin.auth.UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(500, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  console.log(`Scanned ${users.length} auth account(s) in project ${app.options.projectId}, database ${databaseId}.\n`);

  // Collections whose documents reference a student/organization uid. An
  // orphan that owns any of these must NOT be deleted: the counterpart side
  // (an organization's queue, a student's dashboard) reads them by uid.
  const referenceChecks: Array<{ collection: string; field: string }> = [
    { collection: 'applications', field: 'studentId' },
    { collection: 'hoursRequests', field: 'studentId' },
    { collection: 'savedOpportunities', field: 'studentId' },
    { collection: 'ratings', field: 'studentId' },
    { collection: 'feedbacks', field: 'userId' },
    { collection: 'reports', field: 'reportingUserId' },
    { collection: 'opportunities', field: 'orgId' },
  ];

  const orphans: Orphan[] = [];
  for (const u of users) {
    const [studentDoc, orgDoc, usersDoc] = await Promise.all([
      db.collection('students').doc(u.uid).get(),
      db.collection('organizations').doc(u.uid).get(),
      db.collection('users').doc(u.uid).get(),
    ]);
    if (studentDoc.exists || orgDoc.exists) continue;

    let hasData = false;
    for (const { collection, field } of referenceChecks) {
      const snap = await db.collection(collection).where(field, '==', u.uid).limit(1).get();
      if (!snap.empty) {
        hasData = true;
        break;
      }
    }

    orphans.push({
      uid: u.uid,
      email: u.email || '(no email)',
      role: usersDoc.exists ? (usersDoc.data()?.role ?? '(users doc without role)') : null,
      hasUsersDoc: usersDoc.exists,
      createdAt: u.metadata.creationTime || null,
      hasData,
    });
  }

  if (orphans.length === 0) {
    console.log('No orphaned accounts found. Nothing to do.');
    process.exit(0);
  }

  console.log(`Found ${orphans.length} orphaned account(s):\n`);
  for (const o of orphans) {
    console.log(
      `  ${o.email.padEnd(40)} uid=${o.uid}  role=${o.role ?? '(no users doc)'}  created=${o.createdAt ?? '?'}  ` +
        `platform-data=${o.hasData ? 'YES' : 'no'}`,
    );
  }

  // ── Notify ─────────────────────────────────────────────────────────────
  if (notify) {
    const resendKey = process.env.RESEND_API_KEY;
    const mailFrom = process.env.MAIL_FROM;
    if (!resendKey || !mailFrom) {
      console.error('\n[FAIL] --notify needs RESEND_API_KEY and MAIL_FROM.');
      process.exit(1);
    }
    const resend = new Resend(resendKey);
    const origin = appOrigin();
    let sent = 0;
    for (const o of orphans) {
      if (!o.email || o.email === '(no email)') {
        console.log(`  [skip] ${o.uid}: no email address on the account.`);
        continue;
      }
      const result = await resend.emails.send({
        from: mailFrom,
        to: o.email,
        subject: 'Finish setting up your Volunteer North York account',
        html:
          `<p>Hello,</p>` +
          `<p>You recently created a Volunteer North York account, but the final setup step didn't complete, ` +
          `so your profile is missing. Your account is safe — you just need to finish the setup.</p>` +
          `<p><a href="${origin}/login">Sign in here</a> and you'll be guided through the one remaining step.</p>` +
          `<p>If you did not create this account, you can ignore this email or reply and we'll remove it.</p>` +
          `<p>— Volunteer North York</p>`,
      });
      if (result.error) {
        console.error(`  [FAIL] email to ${o.email}: ${result.error.message}`);
      } else {
        sent++;
        console.log(`  [sent] finish-signup email to ${o.email}`);
      }
    }
    console.log(`\n${sent} notification email(s) sent.`);
  }

  // ── Delete ─────────────────────────────────────────────────────────────
  if (del) {
    let deleted = 0;
    for (const o of orphans) {
      if (o.hasData) {
        console.log(`  [skip] ${o.email}: owns platform data; resolve by hand instead of deleting.`);
        continue;
      }
      if (o.hasUsersDoc) await db.collection('users').doc(o.uid).delete();
      await auth.deleteUser(o.uid);
      deleted++;
      console.log(`  [deleted] ${o.email} (${o.uid})`);
    }
    console.log(`\n${deleted} orphaned account(s) deleted.`);
  }

  if (!notify && !del) {
    console.log(
      '\nDry run only — nothing was changed.\n' +
        '  npm run repair:orphans -- --notify            email each orphan a finish-signup link\n' +
        '  npm run repair:orphans -- --delete --confirm-delete\n' +
        '                                                remove orphans that hold no platform data',
    );
  }

  process.exit(0);
})().catch((err) => {
  console.error('[FAIL]', err?.message || err);
  process.exit(1);
});
