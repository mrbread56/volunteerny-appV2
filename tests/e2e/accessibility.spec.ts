import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

/**
 * WCAG 2.1 AA, asserted rather than reviewed.
 *
 * The contrast failures fixed earlier were found by an agent resolving Tailwind
 * tokens by hand. That is not repeatable and it does not survive the next edit:
 * `placeholder:text-ink-muted/50` was 1.98:1 across every form in the app and
 * nothing caught it for months.
 *
 * This runs axe-core over every route, signed in as a real student, at three
 * breakpoints. Ontario's AODA expects WCAG 2.0 AA of public-sector bodies and
 * school boards are public-sector, so this is plausibly a condition of board
 * adoption, not a nicety.
 *
 * Scope is deliberately the serious rules only — colour-contrast, names, roles,
 * labels, landmarks. Best-practice rules are excluded because they fail on
 * things that are not defects and would train everyone to ignore the suite.
 */
const a: any = (admin as any).default || admin;
const stamp = Date.now();
const EMAIL = `a11y_${stamp}@example.com`;
const PASSWORD = 'a11yCheck!123';

let adminApp: any = null;
let uid = '';
let orgUid = '';
let oppId = '';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const BREAKPOINTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

test.beforeAll(async () => {
  adminApp = a.initializeApp(
    { credential: a.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)) },
    `a11y-${stamp}`,
  );
  const db = adminApp.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const rec = await adminApp.auth().createUser({ email: EMAIL, password: PASSWORD, emailVerified: true });
  uid = rec.uid;
  await db.collection('users').doc(uid).set({
    uid, email: EMAIL, role: 'student', twoFactorEnabled: false,
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });
  // A COMPLETE profile. StudentDashboard bounces to /student/onboarding
  // whenever `school` is empty, so an incomplete fixture never reaches the
  // pages this test exists to audit.
  await db.collection('students').doc(uid).set({
    uid, fullName: 'A11y Student', school: 'A.Y. Jackson Secondary School',
    grade: '11', gender: 'other', neighborhood: 'Bayview Village',
    interests: ['Environment'], skills: ['Communication'], availability: ['Weekends'],
    resumeUrl: '',
    /*
     * Credited hours, because an EMPTY fixture audits empty states.
     *
     * This student had no hours, no applications and no notifications, so every
     * populated surface in the app rendered its "nothing here yet" placeholder
     * and axe never saw the real thing. That is how a 3.67:1 contrast failure
     * on the confirmed-hours row survived a suite whose whole purpose is
     * catching contrast: the row it fails on was never rendered.
     *
     * Two entries, one confirmed and one pending, so both status styles are
     * measured. 12.5 rather than a round number so the total is a real sum.
     */
    loggedHours: [
      {
        id: `a11y_h1_${stamp}`, activity: 'Park cleanup', organization: 'A11y Partner',
        hours: 12.5, date: '2026-05-02', status: 'confirmed',
        confirmedAt: new Date('2026-05-03T15:00:00Z').toISOString(),
      },
      {
        id: `a11y_h2_${stamp}`, activity: 'Food bank sorting', organization: 'A11y Partner',
        hours: 3, date: '2026-06-14', status: 'pending',
      },
    ],
  });

  /*
   * An organisation and a live posting, because the safety report dialog is
   * only reachable from an opportunity detail page.
   *
   * That dialog is the highest-stakes surface in the product — it is what a
   * minor uses to report an adult — and no audit had ever opened it, because
   * reaching it needs a posting to exist and the fixture had none.
   */
  orgUid = `a11y_org_${stamp}`;
  await db.collection('users').doc(orgUid).set({
    uid: orgUid, email: `a11y_org_${stamp}@example.com`, role: 'organization',
    twoFactorEnabled: true, createdAt: a.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('organizations').doc(orgUid).set({
    uid: orgUid, organizationName: 'A11y Partner', contactEmail: `a11y_org_${stamp}@example.com`,
    northYorkConfirmed: true, craVerified: false, verificationStatus: 'verified',
    mission: 'Fixture organisation for the accessibility audit.',
    address: '5100 Yonge St', organizationType: 'Community group',
  });
  const opp = await db.collection('opportunities').add({
    orgId: orgUid, orgName: 'A11y Partner', title: 'Fixture: park cleanup',
    description: 'A posting that exists so the audit can open the pages built around one.',
    location: 'Bayview Village', category: 'Environment', requirements: '',
    maxVolunteers: 5, skillsNeeded: ['Communication'], exclusives: [],
    timeCommitment: 'One-time', isVirtual: false, status: 'open',
    coordinates: { lat: 43.77, lng: -79.38 },
    dateTime: new Date(Date.now() + 7 * 86400000),
    createdAt: a.firestore.FieldValue.serverTimestamp(),
  });
  oppId = opp.id;
});

test.afterAll(async () => {
  if (!adminApp || !uid) return;
  const db = adminApp.firestore();
  for (const c of ['users', 'students']) await db.collection(c).doc(uid).delete().catch(() => {});
  if (oppId) await db.collection('opportunities').doc(oppId).delete().catch(() => {});
  if (orgUid) {
    for (const c of ['users', 'organizations']) await db.collection(c).doc(orgUid).delete().catch(() => {});
  }
  await adminApp.auth().deleteUser(uid).catch(() => {});
});

/**
 * Wait for entrance animations to finish before measuring anything.
 *
 * Several panels mount with `animate-in fade-in duration-500`. Sampled
 * mid-flight, a fully-opaque colour reads as a partly transparent one — which
 * surfaced as two phantom contrast failures at 4.03:1 and 4.43:1 that resolve
 * to well over 4.5:1 once the animation lands. Measuring a frame nobody sees is
 * how a suite earns a reputation for crying wolf.
 */
async function settle(page: any) {
  await page.waitForFunction(
    () => document.getAnimations().every((an) => an.playState !== 'running'),
    null,
    { timeout: 10000 },
  ).catch(() => { /* an infinite decorative loop is fine; the wait below covers it */ });
  await page.waitForTimeout(400);
}

/** Readable failure text: axe's own output is a wall of JSON otherwise. */
function describe(violations: any[]): string {
  return violations
    .map((v) => {
      const where = v.nodes.slice(0, 3).map((n: any) => n.target.join(' ')).join('\n        ');
      return `  [${v.impact}] ${v.id}: ${v.help}\n     ${v.nodes.length} element(s)\n        ${where}`;
    })
    .join('\n');
}

/**
 * Pre-set the seen flag so the storage notice does not render during a page
 * audit.
 *
 * Not a way of dodging the banner's own accessibility — it gets a dedicated
 * test below. The problem is that it is a framer-motion spring, driven from
 * requestAnimationFrame rather than the Web Animations API, so it is invisible
 * to `document.getAnimations()` and axe samples it mid-slide. That produced
 * background colours like #838892 which exist in no stylesheet: they are the
 * half-faded panel over the page beneath. This is fixture setup in a throwaway
 * browser profile, and it matches what every returning visitor sees.
 */
async function skipConsentBanner(page: any) {
  await page.addInitScript(() => {
    try { localStorage.setItem('storage_notice_seen', 'true'); } catch { /* storage blocked */ }
  });
}

const PUBLIC_ROUTES = ['/', '/login', '/signup'];

for (const bp of BREAKPOINTS) {
  test(`public pages meet WCAG 2.1 AA at ${bp.name} (${bp.width}px)`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await skipConsentBanner(page);

    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1200);
      await settle(page);

      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(violations, `${route} at ${bp.name}:\n${describe(violations)}`).toEqual([]);
    }
  });
}

test('signed-in student pages meet WCAG 2.1 AA', async ({ page }) => {
  test.setTimeout(180000);
  await skipConsentBanner(page);

  await page.goto('/login');
  // The form is client-rendered; without this the fills race hydration and
  // find nothing, which reads as a broken login rather than a fast test.
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#login-email').waitFor({ timeout: 20000 });
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText(/Hi, A11y Student/i)).toBeVisible({ timeout: 30000 });

  /*
   * Tabs included, not just landing routes.
   *
   * The dashboard's default tab was the only one audited, so the hours table
   * and the Log Hours form — eight fields whose labels named nothing — were
   * never in the tree axe walked. A route list that stops at the first screen
   * of a tabbed page audits a fraction of it and reports on all of it.
   */
  const ROUTES = [
    '/student/dashboard',
    '/student/dashboard?tab=applications',
    '/student/dashboard?tab=hours',
    '/student/opportunities',
    '/student/profile',
    '/feedback',
  ];
  for (const route of ROUTES) {
    await page.goto(route);
    await page.waitForLoadState('domcontentloaded');
    // Let the route's Firestore reads paint before auditing what is on screen.
    await page.waitForTimeout(2500);
    await settle(page);

    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(violations, `${route}:\n${describe(violations)}`).toEqual([]);
  }
});

test('the storage notice itself meets WCAG 2.1 AA', async ({ page }) => {
  // Audited on its own, settled, because it is the first thing every new
  // visitor sees and it carries the only link to the privacy policy shown
  // before sign-up.
  await page.goto('/');
  // The banner renders once and remembers: CookieBanner reads
  // storage_notice_seen and stays hidden after the first dismissal. A shared
  // browser context therefore hides it from this test, which is why asserting
  // its presence needs a clean slate rather than a longer wait.
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* blocked */ } });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  /*
   * The notice has to BE THERE, and the audit has to be scoped TO IT.
   *
   * This waited for the banner with `.catch(() => {})`, which swallowed its
   * absence, then audited `body` — the whole home page, which the test above
   * already covers. So deleting the storage notice entirely left this test
   * green, still named "the storage notice itself meets WCAG 2.1 AA".
   */
  // Matches the real heading, "What this site stores". The old regex looked
  // for cookie/consent/storage and this banner says none of those words.
  const notice = page.getByRole('region', { name: /what this site stores/i });
  await expect(notice, 'no storage notice rendered, so nothing was audited').toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500);

  const { violations } = await new AxeBuilder({ page })
    .withTags(TAGS)
    .include('body')
    .analyze();
  expect(violations, `storage notice:
${describe(violations)}`).toEqual([]);
});

test('every page offers a way to skip the navigation', async ({ page }) => {
  // WCAG 2.4.1, Level A. The dashboard shell puts a nav of 5-8 links, a bell, a
  // user card and Sign out ahead of <main> on every page, so without this a
  // keyboard user tabs the whole sidebar again on every navigation.
  await page.goto('/');
  // Wait for React to hydrate before tabbing. Pressing Tab against the raw
  // server HTML reads the <noscript> fallback and reports a failure that is
  // purely a race in the test.
  await page.waitForLoadState('domcontentloaded');
  await page.locator('main#main').waitFor({ state: 'attached', timeout: 15000 });
  await page.keyboard.press('Tab');
  const firstFocus = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return { text: (el?.textContent || '').trim().toLowerCase(), href: el?.getAttribute('href') || '' };
  });
  expect(
    /skip/.test(firstFocus.text) || firstFocus.href.startsWith('#'),
    `the first tab stop was "${firstFocus.text}" — expected a skip link`,
  ).toBe(true);

  // And it must actually move focus, not merely exist. A skip link that does
  // not land on <main> is decoration.
  await page.keyboard.press('Enter');
  const landed = await page.evaluate(() => document.activeElement?.id || '');
  expect(landed, 'activating the skip link did not move focus to <main>').toBe('main');
});


test('every page has one h1 and no skipped heading levels', async ({ page }) => {
  /*
   * Two best-practice rules, named individually rather than by enabling the
   * whole best-practice tag.
   *
   * TAGS above deliberately excludes best-practice, because most of it fails on
   * things that are not defects and a noisy suite gets ignored. But heading
   * structure is how a screen-reader user navigates a page they cannot see, and
   * excluding the tag wholesale also excluded these two — which is why three
   * pages shipped with no h1 at all, their titles rendered as the CardTitle
   * default of h3, on routes this file already audits.
   */
  await skipConsentBanner(page);
  for (const route of ['/', '/login', '/signup']) {
    await page.goto(route);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);
    await settle(page);

    const { violations } = await new AxeBuilder({ page })
      .withRules(['page-has-heading-one', 'heading-order'])
      .analyze();
    expect(violations, `${route} heading structure:
${describe(violations)}`).toEqual([]);
  }
});

test('the safety report form is usable without sight', async ({ page }) => {
  /*
   * A dialog axe had never opened.
   *
   * Every audit above walks the page with all six dialogs closed, so none of
   * their contents were ever in the tree. The safety report is the one that
   * matters most: it is what a minor uses to report an adult, and its two main
   * fields carried sibling <label> elements with no htmlFor, naming nothing. A
   * screen reader announced "combo box" and "edit text, blank".
   *
   * Reached from the feedback page, which any signed-in student can open
   * without needing an organisation or a posting to exist.
   */
  await skipConsentBanner(page);
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#login-email').waitFor({ timeout: 20000 });
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText(/Hi, A11y Student/i)).toBeVisible({ timeout: 30000 });

  await page.goto(`/student/opportunities/${oppId}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2500);

  const opener = page.getByRole('button', { name: /report/i }).first();
  await expect(opener, 'no way to open the safety report from an opportunity page').toBeVisible({ timeout: 15000 });
  await opener.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog, 'the safety report dialog did not open').toBeVisible({ timeout: 15000 });
  await settle(page);

  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations, `safety report dialog:
${describe(violations)}`).toEqual([]);
});
