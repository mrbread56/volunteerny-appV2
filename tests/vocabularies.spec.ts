import { test, expect } from '@playwright/test';

/**
 * The shared vocabularies, and the migration off the split one.
 *
 * Availability was written by two incompatible lists that shared only two
 * values, so a student's answer could silently disappear when they opened their
 * own profile. normalizeAvailability is what makes the old data readable, and
 * scripts/backfill-availability.ts is what makes it consistent — both need to be
 * right, so both are pinned here.
 */
// ───────────── the availability vocabulary merge ─────────────

test.describe('normalizeAvailability', () => {
  test('maps every retired value onto the canonical list', async () => {
    const { normalizeAvailability } = await import('../src/lib/vocabularies');
    expect(normalizeAvailability(['Weekdays After School'])).toEqual(['Weekday Afternoons']);
    expect(normalizeAvailability(['Summer Break'])).toEqual(['School Breaks']);
    expect(normalizeAvailability(['Winter/Spring Breaks'])).toEqual(['School Breaks']);
    expect(normalizeAvailability(['Flexible / On-Call'])).toEqual(['Flexible']);
  });

  test('widens rather than narrows: a weekend answer keeps both slots', async () => {
    const { normalizeAvailability } = await import('../src/lib/vocabularies');
    // Narrowing this to one slot would quietly reduce what a student told us.
    expect(normalizeAvailability(['Weekends (Saturday/Sunday)']))
      .toEqual(['Weekend Mornings', 'Weekend Afternoons']);
  });

  test('leaves canonical values alone and de-duplicates the overlap', async () => {
    const { normalizeAvailability } = await import('../src/lib/vocabularies');
    expect(normalizeAvailability(['Weekday Mornings'])).toEqual(['Weekday Mornings']);
    // Both vocabularies could produce 'School Breaks' from two different inputs.
    expect(normalizeAvailability(['Summer Break', 'Winter/Spring Breaks'])).toEqual(['School Breaks']);
  });

  test('survives the shapes real data actually arrives in', async () => {
    const { normalizeAvailability } = await import('../src/lib/vocabularies');
    expect(normalizeAvailability(undefined)).toEqual([]);
    expect(normalizeAvailability(null)).toEqual([]);
    expect(normalizeAvailability([])).toEqual([]);
    // A value from neither vocabulary cannot be matched against an opportunity,
    // so it is dropped rather than carried forward as noise.
    expect(normalizeAvailability(['Whenever I feel like it'])).toEqual([]);
  });
});
