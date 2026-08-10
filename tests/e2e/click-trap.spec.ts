/**
 * Every visible control must actually be clickable.
 *
 *   npx playwright test tests/e2e/click-trap.spec.ts --reporter=line
 *
 * This test exists because a transparent, full-viewport overlay once sat on top
 * of this entire app and swallowed every click. Nothing caught it. The JSX was
 * correct, the CSS was correct, tsc passed, the production build passed, 23
 * Playwright tests passed, the console sweep reported zero errors, and three
 * separate AI code reviews read the file without seeing it. Screenshots looked
 * perfect, because the overlay was invisible. The only symptom was a user
 * saying "the button does nothing".
 *
 * The reason every other check missed it: they all verify that an element
 * EXISTS and has the right handler attached. None of them verify that a click
 * at that element's position would actually reach it.
 *
 * So this walks every route as every role and, for each visible control, asks
 * the browser the one question that matters:
 *
 *     document.elementFromPoint(centreX, centreY)
 *
 * If that returns anything other than the control or something inside it, the
 * control is unreachable. A click there dispatches to whatever is on top, the
 * control's own handler never runs, and the UI is dead while looking healthy.
 * Note that an ANCESTOR being returned is also a failure: the event targets the
 * ancestor, and a handler bound to the descendant never fires.
 *
 * Elements deliberately made inert (disabled, aria-disabled, pointer-events:none)
 * are skipped — those are decisions, not defects.
 */
import { test, expect } from '@playwright/test';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const a: any = (admin as any).default || admin;
const PASSWORD = 'clickTrap!123';
const stamp = Date.now();
const ACCOUNTS = {
  student: { email: `trap_student_${stamp}@example.com`, uid: '' },
  organization: { email: `trap_org_${stamp}@example.com`, uid: '' },
  developer: { email: `trap_dev_${stamp}@example.com`, uid: '' },
};
let adminApp: any = null;

interface Blocked {
  route: string;
  label: string;
  selector: string;
  blockedBy: string;
}
const blocked: Blocked[] = [];
let checked = 0;

test.beforeAll(async () => {
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `trap-${Date.now()}`
  );
  const db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });
  for (const [role, acct] of Object.entries(ACCOUNTS)) {
    const u = await adminApp.auth().createUser({ email: acct.email, password: PASSWORD, emailVerified: true });
    acct.uid = u.uid;
    // The MFA gate trusts the signed claim only — same claim the server writes
    // after a real code check. Driving an emailed OTP here would test nothing.
    await adminApp.auth().setCustomUserClaims(u.uid, { mfaVerified: true });
    await db.collection('users').doc(u.uid).set({
      uid: u.uid, email: acct.email, role, twoFactorEnabled: role !== 'student',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
    });
    if (role === 'student') {
      await db.collection('students').doc(u.uid).set({
        uid: u.uid, fullName: 'Trap Student', school: 'Earl Haig Secondary School', grade: '11',
        neighborhood: 'Willowdale', interests: ['Environment'], skills: ['Leadership'],
        availability: ['Flexible'], resumeUrl: '', passportUrl: '',
      });
    } else if (role === 'organization') {
      await db.collection('organizations').doc(u.uid).set({
        uid: u.uid, organizationName: 'Trap Org', mission: 'Testing.', contactEmail: acct.email,
        northYorkConfirmed: true, organizationType: 'Other', address: '5100 Yonge St',
        phone: '', websiteUrl: '', craVerified: false, verificationStatus: 'unverified',
      });
    }
  }
});

test.afterAll(async () => {
  if (adminApp) {
    const db = adminApp.firestore();
    for (const acct of Object.values(ACCOUNTS)) {
      if (!acct.uid) continue;
      await adminApp.auth().deleteUser(acct.uid).catch(() => {});
      for (const c of ['users', 'students', 'organizations']) {
        await db.collection(c).doc(acct.uid).delete().catch(() => {});
      }
    }
  }
  console.log(`\n============ CLICK REACHABILITY ============`);
  console.log(`controls hit-tested: ${checked}`);
  console.log(`unreachable:         ${blocked.length}`);
  for (const b of blocked) {
    console.log(`\n  ${b.route}`);
    console.log(`    control : ${b.label} ${b.selector}`);
    console.log(`    blocked by: ${b.blockedBy}`);
  }
  if (!blocked.length) console.log('\n  every control is reachable.');
  console.log(`============================================\n`);
});

/** Runs in the page: hit-test every visible control and return the blocked ones. */
async function hitTest(page: any, route: string) {
  const result = await page.evaluate(() => {
    const describe = (el: Element | null): string => {
      if (!el) return '(nothing — point is outside the viewport)';
      const e = el as HTMLElement;
      const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).slice(0, 4).join('.') : '';
      const id = e.id ? `#${e.id}` : '';
      return `<${e.tagName.toLowerCase()}${id}${cls ? '.' + cls : ''}>`;
    };

    const controls = Array.from(
      document.querySelectorAll('button, a[href], [role="button"], input:not([type="hidden"]), select, textarea')
    );
    const out: { label: string; selector: string; blockedBy: string }[] = [];
    let seen = 0;

    for (const el of controls) {
      const e = el as HTMLElement;
      const r = e.getBoundingClientRect();
      // Not rendered, off-screen, or scrolled out — nothing to say about it.
      if (r.width < 2 || r.height < 2) continue;
      if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      // Deliberately inert controls are decisions, not defects.
      if (cs.pointerEvents === 'none') continue;
      if ((e as HTMLButtonElement).disabled) continue;
      if (e.getAttribute('aria-disabled') === 'true') continue;

      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      const hit = document.elementFromPoint(x, y);
      seen++;

      // Pass only if the click lands on this element or inside it. An ancestor
      // is a FAILURE: the event would target the ancestor, and a handler bound
      // to this element never runs.
      if (hit === e || e.contains(hit)) continue;

      out.push({
        label: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 60) || '(no label)',
        selector: describe(e),
        blockedBy: describe(hit),
      });
    }
    return { blocked: out, seen };
  });

  checked += result.seen;
  for (const b of result.blocked) blocked.push({ route, ...b });
}

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/terms', '/privacy'];
const ROLE_ROUTES: Record<string, string[]> = {
  student: [
    '/student/dashboard',
    '/student/dashboard?tab=applications',
    '/student/dashboard?tab=hours',
    '/student/dashboard?tab=leaderboard',
    '/student/dashboard?tab=settings',
    '/student/opportunities',
    '/student/profile',
    '/feedback',
  ],
  organization: ['/org/dashboard', '/org/dashboard?tab=hours', '/org/profile', '/org/opportunities/new', '/feedback'],
  developer: ['/developer/dashboard', '/feedback'],
};

async function signIn(page: any, email: string) {
  await page.goto('/login');
  // Firebase persists the session in IndexedDB, so a stale sign-in makes
  // /login redirect straight to the dashboard and there is no email field to
  // fill. Each role gets a fresh browser context instead, but assert the form
  // is really here rather than hanging for the full test timeout if it is not.
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
}

test('every visible control is actually clickable, on every route, for every role', async ({ browser }) => {
  test.setTimeout(900000);

  const pub = await browser.newContext();
  const pubPage = await pub.newPage();
  for (const r of PUBLIC_ROUTES) {
    await pubPage.goto(r);
    await pubPage.waitForTimeout(1200);
    await hitTest(pubPage, `(public) ${r}`);
  }
  await pub.close();

  for (const [role, routes] of Object.entries(ROLE_ROUTES)) {
    // A fresh context per role: no cookies, no IndexedDB, no leftover session.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await signIn(page, ACCOUNTS[role as keyof typeof ACCOUNTS].email);
      for (const r of routes) {
        await page.goto(r);
        await page.waitForTimeout(1500);
        await hitTest(page, `(${role}) ${r}`);
      }
    } finally {
      await ctx.close();
    }
  }

  // Something must have been tested, or a silent selector change turns this
  // into a check that cannot fail.
  expect(checked, 'no controls were hit-tested — the selectors or sign-in broke').toBeGreaterThan(30);

  expect(
    blocked,
    `${blocked.length} control(s) are covered by something else and cannot be clicked:\n` +
      blocked.map((b) => `  ${b.route}\n    ${b.label} ${b.selector}\n    blocked by ${b.blockedBy}`).join('\n')
  ).toEqual([]);
});
