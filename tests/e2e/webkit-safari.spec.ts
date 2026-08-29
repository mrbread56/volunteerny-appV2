import { test, expect } from '@playwright/test';
import { resolveOpportunityDate } from '../../src/lib/opportunityDate';

/**
 * The behaviours that differ on Safari, tested on Safari.
 *
 * playwright.config.ts ran chromium only. The users are Ontario high schoolers,
 * which in practice means iOS — and on iOS every browser, including "Chrome",
 * is WebKit. So the single most-used engine for this product had no coverage at
 * all, and the places engines actually diverge are exactly the places this app
 * leans on:
 *
 *   - `window.open` for the printable transcript, which Safari's popup blocker
 *     treats far more strictly than Chrome.
 *   - `@media print` and `:has()` in the print stylesheet.
 *   - Date parsing. Safari has historically rejected date strings Chrome
 *     accepts, and this app computes an opportunity's real date from a stored
 *     string plus a weekday.
 *   - localStorage throwing outright rather than failing soft when the user
 *     blocks site data — the case src/lib/storageFallback.ts exists for.
 *   - 100vh and dynamic viewport units under the iOS toolbar.
 *
 * These run under the `webkit` project only (see playwright.config.ts).
 */

test.describe('WebKit / Safari', () => {
  test('the marketing page renders and its fonts actually load', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('main#main')).toBeVisible();

    // Outfit and Fraunces are variable fonts. A silently failed load falls back
    // to system sans, which is how the whole app looked before the font bug was
    // found — and that would be invisible to any assertion about text content.
    const loaded = await page.evaluate(async () => {
      await (document as any).fonts.ready;
      return Array.from((document as any).fonts as Set<any>)
        .filter((f: any) => f.status === 'loaded')
        .map((f: any) => f.family);
    });
    expect(loaded.join(','), 'no custom font loaded under WebKit').toMatch(/Outfit|Fraunces/i);
  });

  test('date parsing agrees with Chromium', async () => {
    // Safari is the strict one here. If it disagrees, students see the wrong
    // day for an opportunity — which is worse than an error, because nothing
    // looks broken.
    const iso = '2026-09-01T13:00:00Z';
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false);

    // The exact shape the app stores and re-reads.
    const local = '2026-09-01T13:00';
    expect(Number.isNaN(new Date(local).getTime())).toBe(false);

    const from = new Date('2026-08-14T09:00:00Z');
    const single = resolveOpportunityDate('single', local, [], from);
    expect(Number.isNaN(single.getTime()), 'WebKit could not parse the stored date').toBe(false);

    // The recurring path is the timezone-sensitive one: a weekday plus a start
    // time, resolved against "now".
    const recurring = resolveOpportunityDate(
      'recurring', '', [{ day: 'Monday', startTime: '09:00', endTime: '12:00' } as any], from,
    );
    expect(Number.isNaN(recurring.getTime()), 'WebKit could not resolve a recurring shift').toBe(false);
  });

  test('a blocked localStorage does not white-screen the app', async ({ page }) => {
    // Safari throws on localStorage access in some privacy modes, and this app
    // reads it in ~135 unguarded places, several before React mounts. The shim
    // in src/lib/storageFallback.ts replaces the object; this proves it holds
    // under the engine that provoked the problem.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
      });
    });

    const fatal: string[] = [];
    page.on('pageerror', (e) => fatal.push(e.message));

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    await expect(page.locator('main#main'), 'the app did not render with storage blocked').toBeVisible();
    expect(fatal.join('\n'), 'an unhandled error escaped with storage blocked').not.toMatch(/SecurityError/i);
  });

  test('nothing scrolls sideways at iPhone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ['/', '/login', '/signup']) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1200);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} scrolls sideways by ${overflow}px on WebKit`).toBeLessThanOrEqual(1);
    }
  });

  test('the print stylesheet is understood, :has() included', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Safari has supported :has() since 15.4, but a parse failure would drop the
    // whole rule silently and the printed transcript would lose its layout with
    // no error anywhere.
    const hasSupport = await page.evaluate(() => CSS.supports('selector(:has(p))'));
    expect(hasSupport, 'WebKit did not parse :has(), so the print rules are dropped').toBe(true);

    // And the print rules must actually exist in the loaded stylesheet.
    const printRules = await page.evaluate(() => {
      let n = 0;
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from((sheet as CSSStyleSheet).cssRules)) {
            if (rule instanceof CSSMediaRule && rule.conditionText.includes('print')) n += rule.cssRules.length;
          }
        } catch { /* cross-origin sheet, skip */ }
      }
      return n;
    });
    expect(printRules, 'no @media print rules reached WebKit').toBeGreaterThan(0);
  });

  test('sticky positioning works, which it did not when an ancestor scrolled', async ({ page }) => {
    // position: sticky is disabled by any ancestor scroll container, and an
    // `overflow-x-hidden` on the public layout once broke the navbar app-wide.
    // WebKit computes containing blocks differently enough to be worth pinning.
    await page.goto('/');
    // Wait for the navbar to exist rather than for a fixed second. This is a
    // React SPA, so domcontentloaded fires before anything is mounted, and the
    // old `waitForTimeout(1000)` was a bet that React would finish inside that
    // second. Under a loaded machine it sometimes did not, and the test failed
    // with "no <nav> found" against a page whose navbar was perfectly fine.
    await page.waitForSelector('nav', { state: 'attached' });
    const nav = await page.evaluate(() => {
      const el = document.querySelector('nav');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { position: cs.position, top: cs.top };
    });
    expect(nav, 'no <nav> found').not.toBeNull();
    expect(nav!.position, 'the navbar is not sticky under WebKit').toBe('sticky');
  });
});
