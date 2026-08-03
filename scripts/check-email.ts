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

dotenv.config();

const key = process.env.RESEND_API_KEY;
const from = process.env.MAIL_FROM;
let failed = false;

function fail(msg: string) {
  console.error(`[FAIL] ${msg}`);
  failed = true;
}

(async () => {
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
