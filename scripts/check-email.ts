/**
 * Read-only preflight for outbound email.
 *
 *   npm run check:email
 *
 * Sends nothing. It answers the two questions that decide whether every
 * transactional email in the app silently fails:
 *
 *   1. Is RESEND_API_KEY valid?
 *   2. Is the domain in MAIL_FROM actually verified in Resend?
 *
 * (2) is the dangerous one. Resend accepts the request and then refuses to
 * deliver from an unverified sender, and two-factor codes go through the same
 * path — an unverified MAIL_FROM means no organization can log in at all.
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import { emailTemplates } from '../server/emailTemplates';
import { CANONICAL_APP_ORIGIN, appOrigin } from '../server/appUrl';

dotenv.config();

const key = process.env.RESEND_API_KEY;
const from = process.env.MAIL_FROM;
let failed = false;

function fail(msg: string) {
  console.error(`[FAIL] ${msg}`);
  failed = true;
}

/**
 * A delivered email whose every button is a dead link is not a working email.
 *
 * Both causes of that are checked here, because neither is visible from the
 * inbox: the wrong origin baked into the templates, and the canonical origin
 * drifting away from the one index.html/sitemap.xml advertise.
 */
function checkLinks() {
  // Render a real template rather than inspecting the source, so this follows
  // whatever the code actually does at send time.
  const html = emailTemplates.welcome_student?.('Check') ?? '';
  const hrefs = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  if (hrefs.length === 0) {
    fail('rendered welcome_student contains no links at all — template may be broken.');
    return;
  }

  const expected = appOrigin();
  const wrong = [...new Set(hrefs.filter((h) => !h.startsWith(expected + '/') && h !== expected))];
  if (wrong.length) {
    fail(`email buttons point somewhere other than ${expected}: ${wrong.join(', ')}`);
  } else {
    console.log(`[PASS] email links all point at ${expected} (${hrefs.length} checked)`);
  }

  // The mail domain is for sending only and serves no website. This is the
  // exact regression that shipped dead buttons.
  const mailDomain = (from?.match(/<([^>]+)>/)?.[1] || from || '').split('@')[1]?.toLowerCase();
  if (mailDomain && hrefs.some((h) => h.toLowerCase().includes(mailDomain))) {
    fail(`email links point at the MAIL_FROM domain "${mailDomain}", which sends mail and serves no site.`);
  }

  // A link to a path App.tsx does not route is not a dead 404 — the catch-all
  // sends it to <Navigate to="/">, so the reader lands on the homepage with no
  // idea why. That is how "Unsubscribe" pointed at /about for so long.
  // Read wherever the route table actually lives. It moved from App.tsx to
  // src/routes/AppRoutes.tsx when routing and guards were separated, and this
  // check silently started seeing zero routes — which made it report every
  // link as dead. Scanning both, and refusing to pass when neither yields any
  // route, means a future move fails loudly instead of quietly.
  const routeSources = ['src/routes/AppRoutes.tsx', 'src/App.tsx']
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
  const routed = new Set(
    [...routeSources.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p.startsWith('/'))
  );
  if (routed.size === 0) {
    fail('found no <Route path="..."> anywhere — the route table has moved and this check needs updating.');
    return;
  }
  const paths = [...new Set(hrefs.map((h) => h.replace(expected, '')).filter(Boolean))];
  const unrouted = paths.filter((p) => {
    if (routed.has(p)) return false;
    // Allow a routed prefix with params, e.g. /opportunities/:id
    return ![...routed].some((r) => r.includes(':') && p.startsWith(r.split('/:')[0] + '/'));
  });
  if (unrouted.length) {
    fail(`email links point at paths App.tsx does not route (they silently redirect home): ${unrouted.join(', ')}`);
  } else {
    console.log(`[PASS] every email link targets a real route (${paths.length} distinct paths)`);
  }

  // index.html and sitemap.xml are static and cannot import the constant, so
  // assert they agree instead of trusting anyone to update all three.
  for (const file of ['index.html', 'public/sitemap.xml']) {
    const text = fs.readFileSync(file, 'utf8');
    const origins = [...new Set([...text.matchAll(/https?:\/\/[a-z0-9.-]+\.(?:vercel\.app|web\.app|onrender\.com|indevs\.in)/gi)].map((m) => m[0]))];
    const mismatched = origins.filter((o) => o !== CANONICAL_APP_ORIGIN);
    if (mismatched.length) {
      fail(`${file} advertises ${mismatched.join(', ')} but CANONICAL_APP_ORIGIN is ${CANONICAL_APP_ORIGIN}.`);
    }
  }
}

(async () => {
  checkLinks();

  // --links-only: verify the templates without touching Resend. CI runs this
  // on every push, including from forks that have no credentials, so a dead
  // button in an email is caught by the same gate as a type error.
  if (process.argv.includes('--links-only')) {
    console.log(failed ? '[FAIL] email link checks failed.' : '[OK] email link checks passed.');
    process.exit(failed ? 1 : 0);
  }

  if (!key) {
    fail('RESEND_API_KEY is not set — no email can be sent, including two-factor codes.');
    process.exit(1);
  }
  if (!from) {
    fail('MAIL_FROM is not set. The server falls back to a hardcoded sender that may not be verified.');
  }

  const res = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (res.status === 401) {
    fail(
      'RESEND_API_KEY was rejected (401) — the key is well-formed but revoked, rotated, or from another account.\n' +
      '       Consequence: no transactional email is delivered, and because two-factor is REQUIRED for\n' +
      '       organizations, no organization can complete sign-in at all. They reach /mfa, request a code,\n' +
      '       and the server correctly reports that it could not be delivered.\n' +
      '       Fix: issue a new key at https://resend.com/api-keys and set RESEND_API_KEY (locally in .env,\n' +
      '       and in the deployment environment).'
    );
    process.exit(1);
  }
  if (!res.ok) {
    fail(`Resend answered ${res.status} for the domain list — cannot verify sender configuration.`);
    process.exit(1);
  }
  console.log('[PASS] RESEND_API_KEY is accepted by Resend');

  const domains: any[] = (await res.json()).data || [];
  if (!from) process.exit(failed ? 1 : 0);

  // MAIL_FROM is either "addr@domain" or "Name <addr@domain>".
  const addr = (from.match(/<([^>]+)>/)?.[1] || from).trim();
  const domain = addr.split('@')[1]?.toLowerCase();
  if (!domain) {
    fail(`MAIL_FROM is not a usable address: ${from}`);
    process.exit(1);
  }

  const match = domains.find((d) => (d.name || '').toLowerCase() === domain);
  if (!match) {
    fail(
      `MAIL_FROM sends from "${domain}", which is not a domain in this Resend account ` +
      `(it has: ${domains.map((d) => d.name).join(', ') || 'none'}). Delivery will always fail.`
    );
  } else if (match.status !== 'verified') {
    fail(`The sender domain "${domain}" is in Resend but its status is "${match.status}", not "verified". Delivery will fail.`);
  } else {
    console.log(`[PASS] sender domain "${domain}" is verified in Resend (region ${match.region || 'n/a'})`);
  }

  process.exit(failed ? 1 : 0);
})();
