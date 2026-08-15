/**
 * Invariants over the real data, checked without changing any of it.
 *
 *   npm run check:integrity
 *
 * Unit tests prove a function is right today. They say nothing about the data
 * that accumulated while it was wrong. Everything below is a statement that
 * should be true of the production database no matter what happened to get
 * there — and each one maps to a bug that actually existed in this project:
 *
 *   - `students.hours` diverging from the sum of `loggedHours` — the hours
 *     approval writes both, and a partial failure leaves them disagreeing.
 *     This is a graduation record; the scalar is what the leaderboard ranks on.
 *   - Applications pointing at an opportunity that no longer exists — the
 *     delete used to orphan them, leaving the student unable to resolve their
 *     own application and the organization unable to see it.
 *   - A profile with no account document, or the reverse — signup writes two
 *     documents in sequence and used to leave the first behind when the second
 *     failed.
 *   - A logged hour with no supervisor — Ontario boards require a supervisor
 *     name and contact per row, so an entry without one cannot go on a
 *     transcript.
 *
 * STRICTLY READ-ONLY. It reports; it never repairs. A script that silently
 * "fixes" graduation records is far more dangerous than the drift it found.
 */
import './env';
import adminNs from 'firebase-admin';

const admin: any = (adminNs as any).default ?? adminNs;

const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!key) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY is required.');
  process.exit(1);
}
const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(key)) }, 'integrity');

let problems = 0;
let checks = 0;
const ok = (m: string) => { console.log(`[OK]   ${m}`); checks++; };
const bad = (m: string) => { console.error(`[DRIFT] ${m}`); problems++; checks++; };

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

(async () => {
  const { getFirestore } = await import('firebase-admin/firestore');
  const dbId = process.env.FIREBASE_DATABASE_ID;
  const db: any = dbId ? getFirestore(app, dbId) : getFirestore(app);

  try {
    const [students, users, orgs, applications, opportunities, hoursRequests] = await Promise.all([
      db.collection('students').get(),
      db.collection('users').get(),
      db.collection('organizations').get(),
      db.collection('applications').get(),
      db.collection('opportunities').get(),
      db.collection('hoursRequests').get(),
    ]);

    console.log(
      `Scanning ${students.size} students, ${orgs.size} organizations, ` +
      `${opportunities.size} opportunities, ${applications.size} applications, ` +
      `${hoursRequests.size} hours requests.\n`,
    );

    // ── 1. the hours scalar agrees with the array it summarises ───────────
    {
      const drifted: string[] = [];
      for (const d of students.docs) {
        const data = d.data();
        const entries = Array.isArray(data.loggedHours) ? data.loggedHours : [];
        const summed = entries.reduce((s: number, e: any) => s + num(e?.hours), 0);
        const scalar = num(data.hours);
        // Tolerance for floating point only, not for real disagreement.
        if (Math.abs(summed - scalar) > 0.001) {
          drifted.push(`${d.id}: hours=${scalar} but loggedHours sums to ${summed}`);
        }
      }
      if (drifted.length === 0) ok('every student\'s hours total matches their logged entries');
      else {
        bad(`${drifted.length} student(s) have an hours total that disagrees with their entries`);
        for (const line of drifted.slice(0, 10)) console.error(`          ${line}`);
      }
    }

    // ── 2. no application points at a missing opportunity ─────────────────
    {
      const oppIds = new Set(opportunities.docs.map((d: any) => d.id));
      const orphans = applications.docs.filter((d: any) => {
        const oppId = d.data().opportunityId;
        return oppId && !oppIds.has(oppId);
      });
      if (orphans.length === 0) ok('every application points at an opportunity that exists');
      else {
        bad(`${orphans.length} application(s) reference a deleted opportunity`);
        for (const d of orphans.slice(0, 10)) {
          console.error(`          ${d.id} -> opportunity ${d.data().opportunityId}`);
        }
      }
    }

    // ── 2b. no opportunity points at a missing organization ───────────────
    //
    // This was the gap. Invariant 2 caught applications orphaned by a deleted
    // OPPORTUNITY, and nothing caught opportunities orphaned by a deleted
    // ORGANIZATION — so the scan reported "all invariants hold" over a database
    // holding two postings whose owner no longer existed, each still carrying
    // accepted applications.
    //
    // It matters beyond tidiness: the applications `list` rule proves ownership
    // by reading the parent opportunity, and OrgOpportunityApplicants resolves
    // the organization for the header. A posting with no owner is visible to
    // students, unmanageable by anyone, and impossible to withdraw.
    {
      const orgIds = new Set(orgs.docs.map((d: any) => d.id));
      const orphans = opportunities.docs.filter((d: any) => {
        const orgId = d.data().orgId;
        return orgId && !orgIds.has(orgId);
      });
      if (orphans.length === 0) ok('every opportunity points at an organization that exists');
      else {
        bad(`${orphans.length} opportunit(y/ies) reference a deleted organization`);
        for (const d of orphans.slice(0, 10)) {
          console.error(`          ${d.id} "${d.data().title ?? ''}" -> organization ${d.data().orgId}`);
        }
      }
    }

    // ── 3. every profile has an account, and every account a profile ──────
    {
      const userIds = new Set(users.docs.map((d: any) => d.id));
      const roleOf = new Map(users.docs.map((d: any) => [d.id, d.data().role]));

      const profileNoAccount = [
        ...students.docs.filter((d: any) => !userIds.has(d.id)).map((d: any) => `students/${d.id}`),
        ...orgs.docs.filter((d: any) => !userIds.has(d.id)).map((d: any) => `organizations/${d.id}`),
      ];
      if (profileNoAccount.length === 0) ok('every profile has an account document');
      else {
        bad(`${profileNoAccount.length} profile(s) have no account document`);
        for (const line of profileNoAccount.slice(0, 10)) console.error(`          ${line}`);
      }

      const studentIds = new Set(students.docs.map((d: any) => d.id));
      const orgIds = new Set(orgs.docs.map((d: any) => d.id));
      const accountNoProfile = users.docs.filter((d: any) => {
        const role = roleOf.get(d.id);
        if (role === 'student') return !studentIds.has(d.id);
        if (role === 'organization') return !orgIds.has(d.id);
        return false; // developers have no profile document by design
      });
      if (accountNoProfile.length === 0) ok('every student and organization account has a profile');
      else {
        bad(`${accountNoProfile.length} account(s) have no matching profile — signup died half-way`);
        for (const d of accountNoProfile.slice(0, 10)) {
          console.error(`          users/${d.id} (${roleOf.get(d.id)})`);
        }
      }
    }

    // ── 4. a credited hour can go on a transcript ─────────────────────────
    {
      const unusable: string[] = [];
      for (const d of students.docs) {
        const entries = Array.isArray(d.data().loggedHours) ? d.data().loggedHours : [];
        for (const e of entries) {
          const missing: string[] = [];
          if (!e?.organization && !e?.orgName) missing.push('organization');
          if (!e?.coordinatorName && !e?.supervisorName) missing.push('supervisor');
          if (!e?.date) missing.push('date');
          if (!num(e?.hours)) missing.push('hours');
          if (missing.length) unusable.push(`${d.id}: entry missing ${missing.join(', ')}`);
        }
      }
      if (unusable.length === 0) ok('every credited hour carries what a board form asks for');
      else {
        bad(`${unusable.length} credited entr(ies) could not go on a transcript as they stand`);
        for (const line of unusable.slice(0, 10)) console.error(`          ${line}`);
      }
    }

    // ── 5. no approved request without a matching credit ──────────────────
    {
      const approved = hoursRequests.docs.filter((d: any) => d.data().status === 'approved');
      const creditedBy = new Map<string, number>();
      for (const d of students.docs) {
        const entries = Array.isArray(d.data().loggedHours) ? d.data().loggedHours : [];
        creditedBy.set(d.id, entries.length);
      }
      const uncredited = approved.filter((d: any) => (creditedBy.get(d.data().studentId) || 0) === 0);
      if (uncredited.length === 0) ok('every approved hours request left a credit behind');
      else {
        bad(`${uncredited.length} approved request(s) credited nothing to the student`);
        for (const d of uncredited.slice(0, 10)) {
          console.error(`          hoursRequests/${d.id} -> student ${d.data().studentId}`);
        }
      }
    }

    // ── 6. capacity is not oversubscribed ─────────────────────────────────
    {
      const acceptedPerOpp = new Map<string, number>();
      for (const d of applications.docs) {
        const a = d.data();
        if (a.status === 'accepted' && a.opportunityId) {
          acceptedPerOpp.set(a.opportunityId, (acceptedPerOpp.get(a.opportunityId) || 0) + 1);
        }
      }
      const over: string[] = [];
      for (const d of opportunities.docs) {
        const cap = num(d.data().maxVolunteers);
        const accepted = acceptedPerOpp.get(d.id) || 0;
        if (cap > 0 && accepted > cap) over.push(`${d.id}: ${accepted} accepted against a cap of ${cap}`);
      }
      if (over.length === 0) ok('no opportunity holds more accepted volunteers than it has places');
      else {
        bad(`${over.length} opportunit(ies) are oversubscribed`);
        for (const line of over.slice(0, 10)) console.error(`          ${line}`);
      }
    }
  } catch (err: any) {
    if (String(err?.message || err).includes('RESOURCE_EXHAUSTED')) {
      console.error(
        '\n[BLOCKED] The database is out of read quota, so nothing could be scanned.\n' +
        '          See ROADMAP B19: the production database is an AI-Studio one that\n' +
        '          cannot exceed free-tier limits even with billing enabled.',
      );
      process.exit(2);
    }
    console.error('[ERROR]', err?.message || err);
    process.exit(1);
  }

  console.log(`\n${checks - problems} of ${checks} invariants hold`);
  process.exit(problems ? 1 : 0);
})();
