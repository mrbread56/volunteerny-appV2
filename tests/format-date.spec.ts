/**
 * formatDate must never throw.
 *
 * Intl.DateTimeFormat.format() raises RangeError on an Invalid Date instead of
 * degrading, and every caller of formatDate runs inside a React render. So one
 * opportunity saved without a `dateTime` — optional on the Opportunity type and
 * not required by firestore.rules — crashed the entire browse page for every
 * student. Not that one card: the whole page, blank.
 *
 * These are the inputs that reach it in practice: a missing field, a null from
 * Firestore, an empty string from a form, and a malformed string. None may
 * throw, and none may render the string "Invalid Date" at a student either.
 */
import { test, expect } from '@playwright/test';
import { formatDate } from '../src/lib/utils';

const BAD_INPUTS: [string, any][] = [
  ['undefined (field absent on the document)', undefined],
  ['null (field explicitly cleared)', null],
  ['empty string (blank form input)', ''],
  ['unparseable string', 'not a date'],
  ['NaN', NaN],
  ['Invalid Date object', new Date('nonsense')],
];

for (const [label, value] of BAD_INPUTS) {
  test(`formatDate does not throw on ${label}`, () => {
    let result: string | undefined;
    expect(() => {
      result = formatDate(value);
    }, `formatDate threw on ${label} — this blanks the page it renders in`).not.toThrow();
    expect(result, 'callers show a fallback when this is empty').toBe('');
  });
}

test('formatDate still formats a real date', () => {
  const out = formatDate(new Date('2026-08-15T14:30:00Z'));
  expect(out).not.toBe('');
  expect(out).toMatch(/2026/);
});

test('formatDate accepts the shapes Firestore hands back', () => {
  expect(formatDate(new Date(2026, 7, 15))).toMatch(/2026/);
  expect(formatDate('2026-08-15T14:30:00Z')).toMatch(/2026/);
  expect(formatDate(Date.UTC(2026, 7, 15))).toMatch(/2026/);
});
