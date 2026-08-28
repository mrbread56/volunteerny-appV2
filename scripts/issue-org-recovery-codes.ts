/**
 * Issue recovery codes for the two onboarded organisations.
 *
 *   npx tsx scripts/issue-org-recovery-codes.ts
 *
 * Both organisations have two-step sign-in forced on, so every sign-in emails a
 * six digit code to their address. Neither had ever generated a recovery code,
 * which meant a single failure to deliver that email would lock them out of an
 * account they had only just been given — and we already know delivery to these
 * two is unproven, because our pipeline has never sent to either address.
 *
 * That is not a theoretical worry here. Community Share asked for a password
 * reset on 27 Aug 2026 and received nothing at all, because Firebase was
 * sending it from a domain nobody had authenticated. The reset path is fixed,
 * but the sign-in code travels a different route again, and the honest position
 * is that it has never been observed arriving.
 *
 * So: ten single-use codes each, held by us, to hand over if either of them
 * writes to say no code arrived. They are printed once, here, because only
 * hashes are stored and nobody can recover them afterwards.
 *
 * Run against PRODUCTION deliberately — the codes have to be valid on the site
 * the organisations actually sign in to, not on a local server.
 */
import './env';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';

const API_BASE = process.env.CODES_API_BASE || 'https://www.volunteernorthyork.org';

const ORGS = [
  { label: 'Community Share Food Bank', email: 'contact@communitysharefoodbank.ca', password: 'Lantern-Juniper-2865!' },
  { label: 'Tirgan Centre for Art & Culture', email: 'info@tirgan.ca', password: 'Kestrel-Falcon-5728!' },
];

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);

(async () => {
  console.log(`Issuing recovery codes against ${API_BASE}\n`);
  let failures = 0;

  for (const org of ORGS) {
    console.log(`═══ ${org.label} ═══`);
    try {
      const cred = await signInWithEmailAndPassword(auth, org.email, org.password);
      const token = await cred.user.getIdToken();

      const res = await fetch(`${API_BASE}/api/auth/backup-codes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body: any = await res.json().catch(() => ({}));

      if (!res.ok || !Array.isArray(body.codes)) {
        console.error(`  FAILED (${res.status}): ${body?.error || 'no codes returned'}`);
        failures++;
      } else {
        console.log(`  ${body.codes.length} codes, each usable ONCE, in place of the emailed code:\n`);
        body.codes.forEach((c: string, i: number) =>
          console.log(`    ${String(i + 1).padStart(2, ' ')}.  ${c}`));
        console.log('');

        // Prove the count landed, rather than trusting the response.
        const status = await fetch(`${API_BASE}/api/auth/backup-codes/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const s: any = await status.json().catch(() => ({}));
        if (s?.exists && s?.remaining === body.codes.length) {
          console.log(`  confirmed stored: ${s.remaining} of ${body.codes.length} unused\n`);
        } else {
          console.error(`  WARNING: status reported ${JSON.stringify(s)}\n`);
          failures++;
        }
      }
    } catch (err: any) {
      console.error(`  FAILED: ${err?.code || err?.message || err}`);
      failures++;
    } finally {
      await signOut(auth).catch(() => {});
    }
  }

  console.log('These are shown once. Only hashes are kept, so they cannot be printed again.');
  console.log('Re-running this replaces them, which invalidates whatever was printed before.');
  process.exit(failures ? 1 : 0);
})();
