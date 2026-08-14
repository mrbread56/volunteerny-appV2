import { test, expect } from '@playwright/test';
import { resolveOpportunityDate } from '../src/lib/opportunityDate';

/**
 * Both opportunity forms used to store `serverTimestamp()` — the moment of
 * posting — as the event date for anything that was not a single event. A
 * weekly Monday-evening role posted on a Wednesday afternoon told students it
 * happened that Wednesday afternoon.
 */

// A fixed Wednesday 14:47 local, so "next Monday" is unambiguous.
const WED = new Date(2026, 7, 12, 14, 47, 0, 0); // Wed 12 Aug 2026

test('single event uses the entered date and time', () => {
  const d = resolveOpportunityDate('single', '2026-09-01T09:00', [], WED);
  expect(d.getFullYear()).toBe(2026);
  expect(d.getMonth()).toBe(8);
  expect(d.getDate()).toBe(1);
  expect(d.getHours()).toBe(9);
});

test('multiple shifts use the EARLIEST dated shift, not the posting time', () => {
  const d = resolveOpportunityDate('multiple', '', [
    { date: '2026-09-20', startTime: '13:00', endTime: '16:00' },
    { date: '2026-09-05', startTime: '10:30', endTime: '12:00' },
  ], WED);
  expect(d.getMonth()).toBe(8);
  expect(d.getDate()).toBe(5);
  expect(d.getHours()).toBe(10);
  expect(d.getMinutes()).toBe(30);
  expect(d.getTime()).not.toBe(WED.getTime());
});

test('recurring resolves to the next occurrence of the chosen weekday', () => {
  const d = resolveOpportunityDate('recurring', '', [
    { day: 'Mon', startTime: '18:00', endTime: '20:00' },
  ], WED);
  expect(d.getDay()).toBe(1);            // Monday
  expect(d.getDate()).toBe(17);          // the Monday after Wed 12 Aug 2026
  expect(d.getHours()).toBe(18);
  expect(d.getTime()).toBeGreaterThan(WED.getTime());
});

test('recurring picks the soonest weekday when several are selected', () => {
  const d = resolveOpportunityDate('recurring', '', [
    { day: 'Sat', startTime: '09:00', endTime: '11:00' },
    { day: 'Thu', startTime: '17:00', endTime: '19:00' },
  ], WED);
  expect(d.getDay()).toBe(4);            // Thursday comes first
  expect(d.getDate()).toBe(13);
});

test("today's weekday rolls to next week once its start time has passed", () => {
  // WED is 14:47; a Wednesday 09:00 session has already happened today.
  const d = resolveOpportunityDate('recurring', '', [
    { day: 'Wed', startTime: '09:00', endTime: '11:00' },
  ], WED);
  expect(d.getDay()).toBe(3);
  expect(d.getDate()).toBe(19);          // next Wednesday, not today
});

test("today's weekday is kept when its start time is still ahead", () => {
  const d = resolveOpportunityDate('recurring', '', [
    { day: 'Wed', startTime: '19:00', endTime: '21:00' },
  ], WED);
  expect(d.getDate()).toBe(12);          // still today
  expect(d.getHours()).toBe(19);
});

test('unusable shift data falls back to now rather than throwing', () => {
  expect(resolveOpportunityDate('multiple', '', [], WED).getTime()).toBe(WED.getTime());
  expect(resolveOpportunityDate('recurring', '', [{ day: 'Notaday', startTime: 'x', endTime: 'y' }], WED).getTime())
    .toBe(WED.getTime());
  expect(resolveOpportunityDate('single', 'not-a-date', [], WED).getTime()).toBe(WED.getTime());
});

test('a shift starting at this exact instant rolls to next week, not today', () => {
  // The `<=` boundary in resolveOpportunityDate. Mutation testing found that
  // flipping it to `<` changed nothing any test could see: the property suite
  // allows a one-second tolerance, and every example here is minutes away from
  // the boundary. So the one comparison that decides "has this week's session
  // already started?" was uncovered at the only value where it matters.
  //
  // Pinning the current behaviour deliberately: at exactly the start time the
  // session is no longer something a student can newly join, so the useful
  // answer is the next one. If that judgement is ever revisited, this test is
  // where the decision is recorded.
  const wed = new Date('2026-08-12T19:00:00');
  const out = resolveOpportunityDate('recurring', '', [
    { day: 'Wed', startTime: '19:00', endTime: '21:00' },
  ], wed);

  expect(out.getDate(), 'exactly at the start time should resolve to next week').toBe(19);
  expect(out.getHours()).toBe(19);

  // One millisecond BEFORE the start time is still today — the other side of
  // the same boundary, which is what makes the comparison load-bearing.
  const justBefore = new Date('2026-08-12T18:59:59.999');
  const stillToday = resolveOpportunityDate('recurring', '', [
    { day: 'Wed', startTime: '19:00', endTime: '21:00' },
  ], justBefore);
  expect(stillToday.getDate(), 'a millisecond before the start it is still today').toBe(12);
});
