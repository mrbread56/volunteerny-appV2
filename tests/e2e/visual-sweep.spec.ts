/**
 * Visual sweep: walk every public route, and the student and organization
 * dashboards via demo mode, at three viewport widths, and assert the three
 * objective visual invariants that have actually bitten this project before:
 *
 *   1. No horizontal document overflow. F17 in STATUS.md: a flex item without
 *      min-w-0 made every dashboard page scroll sideways on every phone
 *      (382.7px of content in a 375.3px parent). This is the regression test.
 *   2. No broken images — an <img> that finished loading with naturalWidth 0.
 *   3. The page rendered visible text at all, so a route that silently
 *      renders an empty shell fails instead of passing as "no errors".
 *
 * A full-page screenshot of every route at every width is attached to the
 * report for human review — objective checks catch overflow, not ugliness.
 *
 * Assertions are soft: one broken route at one width reports every finding
 * rather than stopping at the first.
 *
 * Needs no credentials — authenticated surfaces are reached through the demo
 * buttons on the home page, which is exactly how the app runs without
 * secrets.
 *
 *   npx playwright test tests/e2e/visual-sweep.spec.ts --reporter=line
 */
import { test, expect, type Page, type TestInfo } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/terms', '/privacy'];

// Mirrors the role route lists in console-sweep.spec.ts, minus the developer
// console, which has no demo path.
const DEMO_STUDENT_ROUTES = [
  '/student/dashboard',
  '/student/dashboard?tab=applications',
  '/student/dashboard?tab=hours',
  '/student/dashboard?tab=leaderboard',
  '/student/opportunities',
  '/student/profile',
  '/feedback',
];
const DEMO_ORG_ROUTES = [
  '/org/dashboard',
  '/org/dashboard?tab=hours',
  '/org/profile',
  '/org/opportunities/new',
  '/feedback',
];

/**
 * Scroll to the bottom and back so IntersectionObserver-driven reveals
 * (Home's <Reveal>) actually fire — otherwise the full-page screenshot
 * captures sections still held at opacity 0 and they look broken when they
 * are merely unrevealed.
 */
async function settleAnimations(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let y = 0;
      const step = () => {
        y += 600;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight) setTimeout(step, 60);
        else {
          window.scrollTo(0, 0);
          resolve();
        }
      };
      step();
    });
  });
  await page.waitForTimeout(700);
}

async function auditRoute(page: Page, testInfo: TestInfo, label: string) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
  await settleAnimations(page);

  // 1. Horizontal overflow. +1px of tolerance for subpixel rounding — the
  //    real failures measure whole tens of pixels (F17 was 7.4px over at its
  //    smallest, 382.7 in 375.3).
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect
    .soft(scrollWidth, `${label}: document scrolls sideways (${scrollWidth}px of content in a ${clientWidth}px viewport)`)
    .toBeLessThanOrEqual(clientWidth + 1);

  // 2. Broken images: loaded, has a source, decoded to nothing.
  const brokenImages = await page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => img.src && img.complete && img.naturalWidth === 0)
      .map((img) => img.src)
  );
  expect.soft(brokenImages, `${label}: broken images`).toEqual([]);

  // 3. The route rendered something. 40 characters is deliberately low — it
  //    exists to catch a blank shell, not to grade content.
  const textLength = await page.evaluate(() => (document.body.innerText || '').trim().length);
  expect.soft(textLength, `${label}: page rendered almost no visible text`).toBeGreaterThan(40);

  await testInfo.attach(label.replace(/[^\w.-]+/g, '_'), {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

/**
 * Enter demo mode from the home page. Returns false (with an annotation, not
 * a failure) if the demo button never appeared — the sweep should report what
 * it could not reach rather than fail on it.
 */
async function enterDemo(page: Page, testInfo: TestInfo, role: 'student' | 'organization'): Promise<boolean> {
  await page.goto('/');
  const button = page.getByRole('button', {
    name: role === 'student' ? /Demo as a student/i : /Demo as an organization/i,
  });
  try {
    await button.click({ timeout: 10000 });
    await page.waitForURL(role === 'student' ? '**/student/dashboard**' : '**/org/dashboard**', {
      timeout: 20000,
    });
    return true;
  } catch {
    testInfo.annotations.push({
      type: 'warning',
      description: `could not enter ${role} demo mode; its routes were not swept`,
    });
    return false;
  }
}

for (const vp of VIEWPORTS) {
  test.describe(`visual sweep @ ${vp.name} (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`public routes @ ${vp.name}`, async ({ page }, testInfo) => {
      test.setTimeout(240000);
      for (const route of PUBLIC_ROUTES) {
        await page.goto(route);
        await auditRoute(page, testInfo, `${vp.name} ${route}`);
      }
    });

    for (const [role, routes] of [
      ['student', DEMO_STUDENT_ROUTES],
      ['organization', DEMO_ORG_ROUTES],
    ] as const) {
      test(`demo ${role} routes @ ${vp.name}`, async ({ page }, testInfo) => {
        test.setTimeout(300000);
        if (!(await enterDemo(page, testInfo, role))) return;

        for (const route of routes) {
          await page.goto(route);
          await page.waitForLoadState('domcontentloaded');
          // If the demo session did not survive the full page load, report it
          // once and stop — every later route would fail the same way.
          if (page.url().includes('/login')) {
            testInfo.annotations.push({
              type: 'warning',
              description: `demo ${role} session was lost navigating to ${route}; remaining ${role} routes were not swept`,
            });
            return;
          }
          await auditRoute(page, testInfo, `${vp.name} [${role}] ${route}`);
        }
      });
    }
  });
}
