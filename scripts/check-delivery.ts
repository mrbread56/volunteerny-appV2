/**
 * Every transactional email, actually sent.
 *
 *   npm run check:delivery
 *
 * check-email.ts proves the templates RENDER and that their links point at
 * routes that exist. It never sends anything. So the whole mail path could be
 * broken — a revoked key, an unverified sender, a domain that stopped resolving
 * — and every check in this repo would stay green while no organisation could
 * sign in, because two-factor codes arrive by email and there is no other way
 * in.
 *
 * This sends all seven templates through the real Resend account and asserts
 * each one was accepted with a message id. Delivery goes to `delivered@resend.dev`,
 * Resend's own sink address, which always accepts and never reaches a person —
 * so this can run as often as you like without mailing anybody.
 *
 * What it cannot prove: that a message reaches a real inbox rather than a spam
 * folder. Nothing automated can. That needs one hand-sent message to a real
 * address, and RUNBOOK says so.
 */
import './env';
import { emailTemplates } from '../server/emailTemplates';

const SINK = 'delivered@resend.dev';

let passed = 0;
let failed = 0;
const pass = (m: string) => { console.log(`[PASS] ${m}`); passed++; };
const fail = (m: string) => { console.error(`[FAIL] ${m}`); failed++; };

(async () => {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key) { fail('RESEND_API_KEY is not set — no email can be sent at all.'); process.exit(1); }
  if (!from) { fail('MAIL_FROM is not set.'); process.exit(1); }

  const { Resend } = await import('resend');
  const resend = new Resend(key);

  // One per template, with the arguments a real send uses. Named for what a
  // person would call them, so a failure says which FEATURE is broken rather
  // than which function.
  const cases: { name: string; subject: string; html: string }[] = [
    {
      name: 'two-factor code (organisations cannot sign in without this)',
      subject: 'Your verification code',
      html: emailTemplates.auth_verification('Test Coordinator', '123456', 'verification'),
    },
    {
      name: 'welcome, on student signup',
      subject: 'Welcome to Volunteer North York',
      html: emailTemplates.welcome_student('Test Student'),
    },
    {
      name: 'application ACCEPTED',
      subject: 'Your application was accepted',
      html: emailTemplates.application_status('Test Student', 'Beach Cleanup', 'Test Org', 'accepted'),
    },
    {
      name: 'application REJECTED',
      subject: 'An update on your application',
      html: emailTemplates.application_status('Test Student', 'Beach Cleanup', 'Test Org', 'rejected', 'The position was filled.'),
    },
    {
      name: 'hours confirmed',
      subject: 'Your hours were confirmed',
      html: emailTemplates.hours_confirmation('Test Student', 4, 'Beach Cleanup', 'Test Org', 'Test Supervisor'),
    },
    {
      name: 'new applicant, to the organisation',
      subject: 'New applicant',
      html: emailTemplates.new_applicant('Test Org', 'Test Student', 'Beach Cleanup', 'I would like to help.'),
    },
    {
      name: 'generic notification',
      subject: 'A notification',
      html: emailTemplates.notification('Something happened', 'Here are the details.', 'Open', 'https://volunteerny-app-v2.vercel.app/student/dashboard'),
    },
  ];

  for (const c of cases) {
    // A template that renders to nothing would still "send" — assert there is
    // a body before spending a request on it.
    if (!c.html || c.html.length < 200) {
      fail(`${c.name} — rendered to ${c.html?.length ?? 0} characters, which is not a real email.`);
      continue;
    }
    try {
      const { data, error } = await resend.emails.send({
        from, to: [SINK], subject: c.subject, html: c.html,
      });
      if (error) {
        fail(`${c.name} — Resend refused it: ${error.message}`);
      } else if (!data?.id) {
        fail(`${c.name} — accepted but returned no message id, so nothing can be traced.`);
      } else {
        pass(`${c.name} — sent (${data.id.slice(0, 8)}…)`);
      }
    } catch (err: any) {
      fail(`${c.name} — threw: ${err?.message || err}`);
    }
    // Resend's default limit is 2 requests/second; stay under it.
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('Every transactional email was accepted by the provider.');
    console.log('Not proven here: that they land in an inbox rather than spam.');
    console.log('That needs one hand-sent message to a real address — see docs/RUNBOOK.md.');
  }
  process.exit(failed ? 1 : 0);
})();
