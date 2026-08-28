/**
 * The two real organisations, and the exact journey they are about to take.
 *
 *   npm run check:orgs
 *
 * Tirgan and Community Share were onboarded by hand and then emailed passwords
 * on 27 Aug 2026. Everything else in this repo tests fixtures; this tests the
 * two accounts that belong to actual people who are going to try to sign in.
 *
 * The order below follows their journey, because a failure early makes the rest
 * unreachable and the report should say so in that order:
 *
 *   1. the auth account exists, is enabled, and takes the emailed password
 *   2. the users/ document says organization, so the app routes them right
 *   3. two-step sign-in is on, and the address it mails can actually receive
 *      mail — this is the step that locked Eva out once already
 *   4. the organizations/ profile loads and is verified, which is what lets
 *      them post at all
 *   5. their listing exists, and is in the state we told them it was in
 *   6. nothing is quietly broken around them: no orphaned records, no
 *      applications pointing at a listing that moved
 *
 * Read-only apart from signing in. It sends no mail and changes no data.
 */
import './env';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import adminNs from 'firebase-admin';
import { resolve as resolveMx } from 'node:dns/promises';

const admin: any = (adminNs as any).default ?? adminNs;

let passed = 0;
let failed = 0;
let warned = 0;
const pass = (m: string) => { console.log(`  [PASS] ${m}`); passed++; };
const fail = (m: string) => { console.error(`  [FAIL] ${m}`); failed++; };
const warn = (m: string) => { console.warn(`  [WARN] ${m}`); warned++; };

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);

// The credentials that were actually emailed. If these stop matching, the two
// organisations are locked out and nothing else in this file matters.
const ORGS = [
  {
    label: 'Community Share Food Bank',
    email: 'contact@communitysharefoodbank.ca',
    password: 'Lantern-Juniper-2865!',
    expectListing: true,
    expectListingStatus: 'open',
  },
  {
    label: 'Tirgan Centre for Art & Culture',
    email: 'info@tirgan.ca',
    password: 'Kestrel-Falcon-5728!',
    expectListing: true,
    expectListingStatus: 'closed', // still a draft, awaiting their schedule
  },
];

let adminApp: any = null;
let adminDb: any = null;
function adminHandle() {
  if (adminApp) return adminApp;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is required');
  adminApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(key)) }, 'check-orgs');
  return adminApp;
}
async function db() {
  if (adminDb) return adminDb;
  const { getFirestore } = await import('firebase-admin/firestore');
  const dbId = process.env.FIREBASE_DATABASE_ID;
  adminDb = dbId ? getFirestore(adminHandle(), dbId) : getFirestore(adminHandle());
  return adminDb;
}

/**
 * Can the domain on this address receive mail at all?
 *
 * The 2FA code is emailed on every single sign-in, so an address that cannot
 * receive is an organisation that can never get in — the failure Eva already
 * hit once by a different route.
 *
 * The three-way return matters more than it looks. The first version returned
 * null for both "this domain has no MX" and "the lookup did not complete", and
 * reported the pair as a hard failure: it announced that neither organisation
 * could ever receive a sign-in code, on a machine whose DNS resolver simply
 * refuses connections. gmail.com failed the same probe. A check that cannot
 * tell a broken subject from a broken instrument is worse than no check,
 * because it spends the reader's attention on a fire that is not burning.
 */
type MxResult =
  | { kind: 'ok'; records: string[] }
  | { kind: 'none' }
  | { kind: 'unknown'; why: string };

async function lookupMx(email: string): Promise<MxResult> {
  const domain = email.split('@')[1];
  try {
    const records = await resolveMx(domain, 'MX');
    const list = (records as any[]).map((r) => `${r.exchange} (${r.priority})`);
    return list.length ? { kind: 'ok', records: list } : { kind: 'none' };
  } catch (err: any) {
    // NOTFOUND / NODATA are answers about the domain. Everything else —
    // ECONNREFUSED, ETIMEOUT, ESERVFAIL — is about the resolver.
    if (err?.code === 'ENOTFOUND' || err?.code === 'ENODATA') return { kind: 'none' };
    return { kind: 'unknown', why: err?.code || 'lookup failed' };
  }
}

/**
 * Has our own mail pipeline ever actually delivered to this address?
 *
 * Stronger evidence than DNS when it exists, because it is a real send that
 * really left, over the exact sender the 2FA code uses.
 */
async function pastSends(store: any, email: string): Promise<number> {
  try {
    const snap = await store.collection('emailLog').where('to', '==', email).limit(20).get();
    return snap.size;
  } catch {
    return -1;
  }
}

(async () => {
  const store = await db();

  for (const org of ORGS) {
    console.log(`\n═══ ${org.label} ═══`);

    // ── 1. the auth account ──────────────────────────────────────────────────
    let uid = '';
    try {
      const rec = await adminHandle().auth().getUserByEmail(org.email);
      uid = rec.uid;
      if (rec.disabled) fail('the account is DISABLED and cannot sign in');
      else pass('auth account exists and is enabled');

      const providers = rec.providerData.map((p: any) => p.providerId);
      if (providers.includes('password')) pass(`password sign-in is available (${providers.join(', ')})`);
      else fail(`no password provider — they cannot use the password we emailed (${providers.join(', ')})`);
    } catch (err: any) {
      fail(`no auth account for ${org.email} (${err.code}) — everything below is unreachable`);
      continue;
    }

    // ── 2. the emailed password actually works ───────────────────────────────
    try {
      const cred = await signInWithEmailAndPassword(auth, org.email, org.password);
      if (cred.user.uid === uid) pass('the emailed password signs in');
      else fail('signed in but landed on a different uid');
    } catch (err: any) {
      fail(`the emailed password does NOT work (${err.code}) — they are locked out`);
      await signOut(auth).catch(() => {});
      continue;
    }

    // ── 3. the users/ record decides where the app sends them ────────────────
    const userDoc = await store.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      fail('no users/ document — the app cannot tell what role they are');
    } else {
      const u = userDoc.data();
      if (u.role === 'organization') pass('role is organization, so they land on the org dashboard');
      else fail(`role is "${u.role}", they will be routed to the wrong dashboard`);

      // ── 4. two-step sign-in, and whether the code can reach them ───────────
      if (u.twoFactorEnabled) {
        const domain = org.email.split('@')[1];
        const mx = await lookupMx(org.email);
        if (mx.kind === 'ok') {
          pass(`2FA is on, and ${domain} accepts mail (${mx.records[0]})`);
        } else if (mx.kind === 'none') {
          fail(`2FA is on but ${domain} has NO MX record — the code can never arrive`);
        } else {
          warn(`2FA is on; could not check ${domain}'s MX from here (${mx.why}), not a finding about them`);
        }

        const sends = await pastSends(store, org.email);
        if (sends > 0) pass(`our mail pipeline has sent to this address before (${sends} logged)`);
        else if (sends === 0) warn('our pipeline has never sent to this address, so delivery is unproven');
      } else {
        warn('2FA is off for this org — they sign in with the password alone');
      }
    }

    // ── 5. the organisation profile ──────────────────────────────────────────
    const orgDoc = await store.collection('organizations').doc(uid).get();
    if (!orgDoc.exists) {
      fail('no organizations/ profile — the dashboard will have nothing to show');
    } else {
      const o = orgDoc.data();
      pass(`profile loads: ${o.organizationName}`);
      if (o.verificationStatus === 'verified') pass('verified, so their postings are visible to students');
      else fail(`verificationStatus is "${o.verificationStatus}" — postings may be hidden`);
      if (o.contactEmail) pass(`contact email set (${o.contactEmail})`);
      else warn('no contactEmail on the profile');
      for (const field of ['organizationName', 'mission', 'address', 'organizationType']) {
        if (!o[field]) warn(`profile field "${field}" is empty and will render blank`);
      }
    }

    // ── 6. their listing ─────────────────────────────────────────────────────
    const opps = await store.collection('opportunities').where('orgId', '==', uid).get();
    if (opps.empty) {
      if (org.expectListing) fail('no opportunity found, but one was promised to them');
      else pass('no listing, as expected');
    } else {
      pass(`${opps.size} listing(s) found`);
      for (const d of opps.docs) {
        const o = d.data();
        const statusNote = o.status === org.expectListingStatus
          ? `status "${o.status}" is what we told them`
          : `status is "${o.status}", we told them "${org.expectListingStatus}"`;
        if (o.status === org.expectListingStatus) pass(`  "${o.title}": ${statusNote}`);
        else fail(`  "${o.title}": ${statusNote}`);

        // The fields a student sees before deciding to apply.
        for (const field of ['title', 'description', 'location', 'category']) {
          if (!o[field]) fail(`  "${o.title}" is missing ${field}, which students see`);
        }
        if (typeof o.maxVolunteers === 'number' && o.maxVolunteers > 0) {
          pass(`  capacity set (${o.maxVolunteers})`);
        } else {
          warn(`  maxVolunteers is ${o.maxVolunteers} — capacity may not gate applications`);
        }

        // A recurring listing whose day cannot be parsed silently resolves to
        // "now", which shows students a date in the past.
        if (o.scheduleType === 'recurring') {
          const { resolveOpportunityDate } = await import('../src/lib/opportunityDate.js');
          const when = resolveOpportunityDate(o.scheduleType, o.dateTime, o.shifts);
          const ahead = when.getTime() > Date.now();
          if (ahead) {
            pass(`  next occurrence resolves ahead: ${when.toDateString()}`);
          } else if (o.status === 'closed') {
            // resolveOpportunityDate falls back to `now` when the shift days are
            // unusable, which a draft's are: this listing is waiting on the
            // organisation to tell us when they actually want students. It has
            // to be fixed BEFORE the listing opens, not while it is hidden.
            warn(`  date falls back to today (${when.toDateString()}) — fix the shift days before opening this listing`);
          } else {
            fail(`  next occurrence resolved to ${when.toDateString()}, which is not in the future`);
          }
        }
      }
    }

    await signOut(auth).catch(() => {});
  }

  console.log(`\n${passed} passed, ${failed} failed, ${warned} warnings`);
  process.exit(failed ? 1 : 0);
})();
