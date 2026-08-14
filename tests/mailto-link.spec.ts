import { test, expect } from '@playwright/test';
import { buildMailtoLink } from '../src/lib/mailto';

/**
 * The link that opens the organization's own mail client.
 *
 * Two properties matter and neither is obvious from reading the call site:
 * it must never compose a subject or a body (the organization writes the
 * message themselves), and several recipients must go in BCC — these are
 * volunteers, most of them minors, and a visible To field would disclose every
 * one of them to all the others.
 */

test('a single recipient uses a plain to: address', () => {
  const href = buildMailtoLink(['ada@example.com']);
  expect(href).toBe('mailto:ada%40example.com');
  expect(href).not.toContain('bcc=');
});

test('several recipients go in BCC, never in the visible To field', () => {
  const href = buildMailtoLink(['ada@example.com', 'grace@example.com', 'alan@example.com'])!;
  expect(href.startsWith('mailto:?bcc=')).toBe(true);
  // Nothing before the '?' — no address is exposed to the other recipients.
  expect(href.slice('mailto:'.length, href.indexOf('?'))).toBe('');
  for (const who of ['ada', 'grace', 'alan']) expect(href).toContain(who);
});

test('never composes a subject or a body', () => {
  for (const list of [['a@example.com'], ['a@example.com', 'b@example.com']]) {
    const href = buildMailtoLink(list)!;
    expect(href).not.toContain('subject=');
    expect(href).not.toContain('body=');
  }
});

test('junk entries are dropped, and an empty result yields no link', () => {
  expect(buildMailtoLink([])).toBeNull();
  expect(buildMailtoLink(['', 'not-an-address', null as any])).toBeNull();
  expect(buildMailtoLink(['not-an-address', 'real@example.com'])).toBe('mailto:real%40example.com');
});

test('addresses are encoded, so a stray character cannot inject a header', () => {
  const href = buildMailtoLink(['a@example.com', 'b@example.com?subject=hijacked'])!;
  expect(href).not.toContain('?subject=hijacked');
  expect(href).toContain('%3Fsubject%3Dhijacked');
});
