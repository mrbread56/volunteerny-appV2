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
