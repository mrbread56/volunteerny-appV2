import { test, expect } from '@playwright/test';
import { emailTemplates } from '../server/emailTemplates';

/**
 * Every email, rendered with missing, null and hostile data.
 *
 * Email is the only part of this product that reaches a person who is not
 * looking at the app, and it is unrecallable — a broken one is broken in a
 * mailbox forever. It had no tests at all, which is how a "Verification Code"
 * reading `VERIFIED-VNY-${Math.random()}` survived in the hours confirmation:
 * generated at send time, stored nowhere, checkable by nobody, in the one
 * message a student is most likely to forward to a school as proof.
 *
 * The assertions are the four things that make an email embarrassing rather
 * than merely imperfect:
 *
 *   1. The literal string "undefined" or "null" in the body.
 *   2. Unescaped user text, which is an injection into someone's mail client.
 *   3. A relative link, which resolves to nothing outside a browser.
 *   4. A claim the system cannot back.
 */

/** Values a real caller can and does pass. */
const NASTY = [
  '', ' ', undefined as any, null as any,
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "O'Brien & Sons <admin@evil.test>",
  'a'.repeat(5000),
  '日本語のテキスト',
  '👩‍👩‍👧‍👦',
  'Line\nbreak\r\nhere',
];

/** Every template, with a renderer that supplies deliberately awful arguments. */
const RENDERERS: Record<string, (v: any) => string> = {
  welcome_student: (v) => emailTemplates.welcome_student(v),
  application_status: (v) => emailTemplates.application_status(v, v, v, 'accepted', v),
  application_status_rejected: (v) => emailTemplates.application_status(v, v, v, 'rejected', v),
  hours_confirmation: (v) => emailTemplates.hours_confirmation(v, v, v, v, v),
  new_applicant: (v) => emailTemplates.new_applicant(v, v, v, v),
  auth_verification: (v) => emailTemplates.auth_verification(v, v, 'verification'),
  auth_verification_reset: (v) => emailTemplates.auth_verification(v, v, 'reset'),
  notification: (v) => emailTemplates.notification(v, v, v, v),
  admin_alert: (v) => emailTemplates.admin_alert(v, v),
};

for (const [name, render] of Object.entries(RENDERERS)) {
  test(`${name} survives hostile input`, () => {
    for (const value of NASTY) {
      let html = '';
      expect(
        () => { html = render(value); },
        `${name} threw on ${JSON.stringify(String(value)).slice(0, 60)}`,
      ).not.toThrow();

      expect(typeof html, `${name} did not return a string`).toBe('string');
      expect(html.length, `${name} rendered nothing`).toBeGreaterThan(0);

      // 1. Nothing may leak the words "undefined" or "null" into a mailbox.
      expect(
        html,
        `${name} rendered the literal word "undefined" for input ${JSON.stringify(String(value))}`,
      ).not.toMatch(/>\s*undefined\s*</);
      expect(
        html,
        `${name} rendered the literal word "null" for input ${JSON.stringify(String(value))}`,
      ).not.toMatch(/>\s*null\s*</);

      // 2. User-supplied text must never arrive as live MARKUP.
      //
      // Checked on the angle bracket, not on the payload's words. esc() turns
      // '<' into '&lt;', so a correctly escaped '"><img src=x onerror=alert(1)>'
      // still CONTAINS the harmless substring "onerror=alert(1)" as inert text —
      // asserting on that reports every properly escaped template as a failure.
      // What matters is whether a tag can open.
      if (typeof value === 'string' && value.includes('<')) {
        expect(html, `${name} let a <script tag open`).not.toContain('<script');
        expect(html, `${name} let an <img tag open`).not.toContain('<img src=x');
      }
    }
  });
}

test('every link in every email is absolute', () => {
  // A relative href is meaningless in a mail client: it resolves against the
  // webmail origin, not ours.
  for (const [name, render] of Object.entries(RENDERERS)) {
    // A real absolute URL, because that is what reaches these functions: the
    // send endpoint runs isSafeActionUrl() first and rejects anything that is
    // not this app's origin, so a template never sees a relative one.
    const html = render('https://volunteernorthyork.indevs.in/student/dashboard');
    const hrefs = Array.from(html.matchAll(/href="([^"]*)"/g)).map((m) => m[1]);
    for (const href of hrefs) {
      if (href.startsWith('mailto:') || href.startsWith('#')) continue;
      expect(
        /^https?:\/\//i.test(href),
        `${name} contains a relative link: ${href}`,
      ).toBe(true);
    }
  }
});

test('no email invents a verification code it cannot check', () => {
  // The regression guard for the fabricated `VERIFIED-VNY-${Math.random()}`
  // badge. A code is a promise that something can be looked up; if nothing
  // stores it, the promise is a lie and it lands in the one email a student
  // forwards to their school.
  for (const [name, render] of Object.entries(RENDERERS)) {
    const a = render('https://volunteernorthyork.indevs.in/x');
    const b = render('https://volunteernorthyork.indevs.in/x');
    // Identical inputs must render identically. Anything that changes between
    // two renders of the same data is generated at send time and therefore
    // stored nowhere.
    const normalise = (s: string) => s.replace(/\d{4}-\d{2}-\d{2}/g, 'DATE');
    expect(
      normalise(a),
      `${name} renders differently on identical input — something in it is generated at send time`,
    ).toBe(normalise(b));
  }
});

test('the 2FA code appears in the body and the preheader, and in no link', () => {
  const html = emailTemplates.auth_verification('Alex', '482913', 'verification');
  const occurrences = (html.match(/482913/g) || []).length;

  // Two, deliberately: the visible box, and the hidden preheader span that mail
  // clients show as the inbox preview line. That is a real trade — it means the
  // code is readable from a lock-screen notification without opening the mail,
  // which is convenient and is also the one place a shoulder-surfer can get it.
  // Most services make the same choice. Pinned at two so that if a third copy
  // ever appears, someone has to decide about it on purpose.
  expect(occurrences, 'expected the code in the body and the preheader only').toBe(2);

  // A link containing the code would turn a second factor into a one-click
  // bypass, and links leak through referrers, previews and link scanners.
  expect(html, 'the code email must not carry a link containing the code').not.toMatch(/href="[^"]*482913/);
});
