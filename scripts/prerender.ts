/**
 * Write real HTML into dist/ for the public pages.
 *
 * This is a client-rendered app: `vite build` produces an index.html whose
 * body is an empty <div id="root">. Fetched as Googlebot with JavaScript off,
 * the live homepage returned 342 characters, all of it the "needs JavaScript
 * enabled" fallback. Google does execute JavaScript, but as a second pass that
 * gets queued and can lag for weeks, and it is least reliable for exactly this
 * case: a domain a fortnight old with no authority. Other crawlers, and every
 * link preview that is not Google, do not run it at all.
 *
 * So each public route is loaded in a real browser once at build time and its
 * rendered HTML is written to dist/<route>/index.html. Vercel checks the
 * filesystem before applying rewrites, so /about serves dist/about/index.html
 * and never reaches the SPA catch-all.
 *
 * Playwright rather than a prerender plugin, because Playwright is already a
 * dependency here and already drives the whole test suite. Nothing new to
 * install and nothing new to keep working.
 *
 * ONLY ANONYMOUS PUBLIC ROUTES. Everything behind auth is excluded: it would
 * render the signed-out redirect at best, and bake one account's data into a
 * static file at worst. robots.txt and sitemap.xml already list exactly this
 * set, and all three need to stay in step.
 *
 *   npm run build   (runs automatically)
 */
import { chromium } from '@playwright/test';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';

const DIST = path.join(process.cwd(), 'dist');
const PORT = 4178;

/** Keep in step with public/sitemap.xml and the PublicLayout routes. */
const ROUTES = ['/', '/about', '/signup', '/login', '/terms', '/privacy'];

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json',
  '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain',
};

/** Static file server over dist/, falling back to index.html like Vercel does. */
function serve() {
  return createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    let file = path.join(DIST, decodeURIComponent(url));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(DIST, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('[prerender] dist/index.html missing. Run vite build first.');
    process.exit(1);
  }

  const server = serve();
  await new Promise<void>((r) => server.listen(PORT, r));

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // The app writes to localStorage on first paint. A prerender must not carry
  // one visitor's dismissed banners into every visitor's HTML, so this runs
  // with storage cleared and the notice left in its default state.
  page.on('console', (m) => {
    if (m.type() === 'error') console.warn(`[prerender] console error: ${m.text().slice(0, 140)}`);
  });

  let written = 0;
  for (const route of ROUTES) {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' });
    // The heading is the last thing to settle on every public page, and its
    // presence is the signal that React has actually rendered rather than that
    // the network merely went quiet.
    await page.waitForSelector('h1, h2', { timeout: 15_000 }).catch(() => {
      console.warn(`[prerender] ${route}: no heading appeared, writing what rendered`);
    });

    const html = await page.content();
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());

    if (text.length < 200) {
      console.error(`[prerender] ${route}: only ${text.length} chars rendered. Refusing to write a blank page.`);
      await browser.close();
      server.close();
      process.exit(1);
    }

    const dir = route === '/' ? DIST : path.join(DIST, route);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    console.log(`[prerender] ${route.padEnd(10)} ${String(text.length).padStart(5)} chars of text`);
    written++;
  }

  await browser.close();
  server.close();
  console.log(`[prerender] wrote ${written} page(s)`);
}

main().catch((e) => { console.error('[prerender]', e); process.exit(1); });
