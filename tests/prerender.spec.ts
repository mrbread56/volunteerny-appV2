/**
 * The built site must contain readable HTML before any JavaScript runs, and
 * must still work once it does.
 *
 * Fetched as Googlebot with JS off, the live homepage returned 342 characters,
 * all of it the "needs JavaScript enabled" fallback. scripts/prerender.ts now
 * writes each public route's rendered HTML into dist/ at build time. This
 * guards both halves of that: the file has to hold real text, and React has to
 * take over cleanly on top of it rather than leaving a dead page or throwing.
 *
 * Runs against dist/, not the dev server, because the dev server never has the
 * prerendered files. If dist/ is missing the test skips rather than fails: a
 * developer who has not built yet is not a regression.
 */
import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'http';
import fs from 'fs';
import path from 'path';

const DIST = path.join(process.cwd(), 'dist');
/*
 * Per worker, not a fixed number. Playwright runs these two tests in separate
 * workers, each of which runs beforeAll and tries to listen. With one shared
 * port the second worker fails to bind and the test reads as a prerender bug
 * rather than a port collision, which is exactly how it first failed here.
 */
const PORT = 4179 + Number(process.env.TEST_PARALLEL_INDEX ?? 0);
const ROUTES = ['/', '/about', '/terms', '/privacy'];

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json',
  '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain',
};

let server: Server | undefined;

test.beforeAll(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) return;
  server = createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    let file = path.join(DIST, decodeURIComponent(url));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const idx = path.join(file, 'index.html');
      file = fs.existsSync(idx) ? idx : path.join(DIST, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server!.listen(PORT, r));
});

test.afterAll(() => server?.close());

test('every public route ships readable HTML with JavaScript disabled', async ({ browser }) => {
  test.skip(!fs.existsSync(path.join(DIST, 'index.html')), 'no dist/, run npm run build');

  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();

  for (const route of ROUTES) {
    await page.goto(`http://localhost:${PORT}${route}`);
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();

    // 342 was the whole of the old homepage, and it was the noscript notice.
    expect(text.length, `${route} should carry real content without JS`).toBeGreaterThan(800);
    // The heading has to be in the HTML, not painted on later.
    await expect(page.locator('h1').first(), `${route} needs an h1 in the markup`).toBeVisible();
  }
  await ctx.close();
});

test('React takes over the prerendered markup without breaking it', async ({ page }) => {
  test.skip(!fs.existsSync(path.join(DIST, 'index.html')), 'no dist/, run npm run build');

  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`http://localhost:${PORT}/about`);
  await page.waitForLoadState('networkidle');

  // Still the right page, and the client router is live rather than the page
  // being a frozen snapshot.
  await expect(page.getByRole('heading', { name: /we built this because we needed it/i })).toBeVisible();
  await expect(page.locator('a[href="/feedback"]').first()).toBeVisible();

  const fatal = errors.filter((e) => !/favicon|manifest|Failed to load resource/i.test(e));
  expect(fatal, `console errors after hydration:\n${fatal.join('\n')}`).toEqual([]);
});
