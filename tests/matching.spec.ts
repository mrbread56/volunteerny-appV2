import { test, expect } from '@playwright/test';

/**
 * The matching engine: distance, availability, eligibility, and ranking.
 *
 * All pure, all offline. These are the functions that decide what a student
 * sees and in what order, so they are the ones worth pinning exactly — a
 * ranking bug is invisible in the UI (the page still renders a list) and
 * catastrophic in effect (the right opportunity is on page three).
 */

test.describe('neighbourhood coordinates', () => {
  test('every neighbourhood offered in the UI has coordinates', async () => {
    const { missingNeighborhoodCoords } = await import('../src/lib/neighborhoods');
    // The old if/else chain covered ten of twenty-one and silently defaulted
    // the rest to North York, so eleven neighbourhoods measured every distance
    // from the wrong place.
    expect(missingNeighborhoodCoords()).toEqual([]);
  });

  test('North York is not confused with York', async () => {
    const { coordsForNeighborhood } = await import('../src/lib/neighborhoods');
    // The exact bug in the retired code: `.includes("york")` was tested before
    // `.includes("north york")`, so "North York Center" matched the York branch
    // and landed about 8 km away.
    const northYork = coordsForNeighborhood('North York Center');
    const york = coordsForNeighborhood('York / Weston');
    expect(northYork).not.toEqual(york);
    expect(northYork.lat).toBeGreaterThan(york.lat);
  });

  test('an unknown or empty neighbourhood falls back rather than throwing', async () => {
    const { coordsForNeighborhood, DEFAULT_CENTRE } = await import('../src/lib/neighborhoods');
    expect(coordsForNeighborhood(undefined)).toEqual(DEFAULT_CENTRE);
    expect(coordsForNeighborhood('Narnia')).toEqual(DEFAULT_CENTRE);
  });
});

test.describe('distance', () => {
  test('a known Toronto distance comes out about right', async () => {
    const { haversineKm } = await import('../src/lib/distance');
    // North York centre to downtown is roughly 12 km straight-line.
    const km = haversineKm({ lat: 43.7615, lng: -79.4111 }, { lat: 43.6532, lng: -79.3832 });
    expect(km).toBeGreaterThan(11);
    expect(km).toBeLessThan(13);
  });

  test('the same point is zero, and the function is symmetric', async () => {
    const { haversineKm } = await import('../src/lib/distance');
    const a = { lat: 43.7, lng: -79.4 };
    const b = { lat: 43.8, lng: -79.3 };
    expect(haversineKm(a, a)).toBeCloseTo(0, 6);
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });

  test('a posting with no pin returns null rather than a wrong number', async () => {
    const { distanceToOpportunity } = await import('../src/lib/distance');
    const from = { lat: 43.7, lng: -79.4 };
    expect(distanceToOpportunity(from, undefined)).toBeNull();
    expect(distanceToOpportunity(from, { lat: 43.7 } as any)).toBeNull();
    expect(distanceToOpportunity(from, { lat: NaN, lng: -79.4 })).toBeNull();
    expect(distanceToOpportunity(null, { lat: 43.7, lng: -79.4 })).toBeNull();
  });
});

test.describe('availability slots derived from a schedule', () => {
  const opp = (shifts: any[], extra: any = {}) => ({ shifts, ...extra } as any);

  test('weekday and weekend, morning afternoon and evening', async () => {
    const { slotsForOpportunity } = await import('../src/lib/availability');
    expect(slotsForOpportunity(opp([{ day: 'Mon', startTime: '09:00', endTime: '12:00' }])))
      .toEqual(['Weekday Mornings']);
    expect(slotsForOpportunity(opp([{ day: 'Wed', startTime: '14:00', endTime: '16:00' }])))
      .toEqual(['Weekday Afternoons']);
    expect(slotsForOpportunity(opp([{ day: 'Thu', startTime: '18:00', endTime: '20:00' }])))
      .toEqual(['Weekday Evenings']);
    expect(slotsForOpportunity(opp([{ day: 'Sat', startTime: '10:00', endTime: '12:00' }])))
      .toEqual(['Weekend Mornings']);
    expect(slotsForOpportunity(opp([{ day: 'Sun', startTime: '19:00', endTime: '21:00' }])))
      .toEqual(['Weekend Evenings']);
  });

  test('a multi-shift posting occupies several slots, without duplicates', async () => {
    const { slotsForOpportunity } = await import('../src/lib/availability');
    const slots = slotsForOpportunity(opp([
      { day: 'Sat', startTime: '09:00', endTime: '11:00' },
      { day: 'Sun', startTime: '10:00', endTime: '12:00' },
      { day: 'Mon', startTime: '18:30', endTime: '20:00' },
    ]));
    expect(slots).toContain('Weekend Mornings');
    expect(slots).toContain('Weekday Evenings');
    expect(new Set(slots).size).toBe(slots.length);
  });

  test('a one-off posting derives its slot from its date', async () => {
    const { slotsForOpportunity } = await import('../src/lib/availability');
    // 2026-09-05 is a Saturday. 10:00 local.
    const slots = slotsForOpportunity(opp([], { dateTime: new Date(2026, 8, 5, 10, 0) }));
    expect(slots).toEqual(['Weekend Mornings']);
  });
});

test.describe('availability overlap', () => {
  test('a shared slot overlaps; a disjoint one does not', async () => {
    const { availabilityOverlaps } = await import('../src/lib/availability');
    expect(availabilityOverlaps(['Weekend Mornings'], ['Weekend Mornings'])).toBe(true);
    expect(availabilityOverlaps(['Weekend Mornings'], ['Weekday Evenings'])).toBe(false);
  });

  test('Flexible matches anything, on either side', async () => {
    const { availabilityOverlaps } = await import('../src/lib/availability');
    expect(availabilityOverlaps(['Flexible'], ['Weekday Mornings'])).toBe(true);
  });

  test('a student who has said nothing is not filtered out', async () => {
    const { availabilityOverlaps } = await import('../src/lib/availability');
    // Silence is not a constraint. Excluding someone for not having filled in a
    // form yet is the opposite of useful.
    expect(availabilityOverlaps([], ['Weekday Mornings'])).toBe(true);
    expect(availabilityOverlaps(undefined, ['Weekday Mornings'])).toBe(true);
  });

  test('the retired vocabulary still matches', async () => {
    const { availabilityOverlaps } = await import('../src/lib/availability');
    // 'Weekends (Saturday/Sunday)' was written by the old profile screen.
    expect(availabilityOverlaps(['Weekends (Saturday/Sunday)'], ['Weekend Mornings'])).toBe(true);
  });
});

test.describe('eligibility', () => {
  test('grade gives an age floor, and the comparison respects it', async () => {
    const { checkAge } = await import('../src/lib/eligibility');
    expect(checkAge(14, '11')).toBe('eligible');        // floor 15 >= 14
    expect(checkAge(18, '9')).toBe('likely-ineligible'); // floor 13 < 18
    expect(checkAge(undefined, '9')).toBe('eligible');   // no rule, no problem
    expect(checkAge(16, undefined)).toBe('unknown');     // no grade to compare
  });

  test('the grade exclusives that were never enforced now are', async () => {
    const { checkGradeExclusives } = await import('../src/lib/eligibility');
    // OPPORTUNITY_EXCLUSIVES has carried these all along and nothing ever
    // compared them to a student's grade, so a Grade 12 student saw
    // "Grade 9 Only" postings with no indication they did not qualify.
    expect(checkGradeExclusives(['Grade 9 Only'], '12')).toBe('likely-ineligible');
    expect(checkGradeExclusives(['Grade 12 Only'], '12')).toBe('eligible');
    expect(checkGradeExclusives(['Bilingual'], '12')).toBe('eligible');
    expect(checkGradeExclusives(['Grade 9 Only'], undefined)).toBe('unknown');
  });

  test('the stricter verdict wins, and unknown never masks a real mismatch', async () => {
    const { checkEligibility } = await import('../src/lib/eligibility');
    expect(checkEligibility({ minAge: 18, exclusives: ['Grade 12 Only'] }, '12'))
      .toBe('likely-ineligible');
  });
});

test.describe('ranking', () => {
  const base = {
    id: 'o1', title: 'Beach cleanup', description: 'Pick up litter',
    category: 'Environment', location: 'North York', skillsNeeded: [] as string[],
    exclusives: [] as string[], isVirtual: false, timeCommitment: 'One-time',
    coordinates: { lat: 43.7712, lng: -79.4090 },
    shifts: [{ day: 'Sat', startTime: '10:00', endTime: '12:00' }],
  } as any;

  const student = {
    neighborhood: 'Willowdale', interests: ['Environment'], skills: [],
    availability: ['Weekend Mornings'], grade: '11',
  } as any;

  test('a near, matching opportunity outranks a far, unrelated one', async () => {
    const { getMatchResult } = await import('../src/lib/matchScore');
    const near = getMatchResult(base, student);
    const far = getMatchResult(
      { ...base, category: 'Seniors', coordinates: { lat: 43.6532, lng: -79.3832 },
        shifts: [{ day: 'Tue', startTime: '09:00', endTime: '11:00' }] },
      student,
    );
    expect(near.score).toBeGreaterThan(far.score);
  });

  test('every reason given is one that actually contributed', async () => {
    const { getMatchResult } = await import('../src/lib/matchScore');
    const r = getMatchResult(base, student);
    // The whole point of computing score and explanation together.
    expect(r.reasons.some((x) => /Environment is one of your interests/.test(x))).toBe(true);
    expect(r.reasons.some((x) => /when you are free/.test(x))).toBe(true);
    expect(r.reasons.some((x) => /Willowdale/.test(x))).toBe(true);
  });

  test('the same inputs always produce the same score', async () => {
    const { getMatchResult } = await import('../src/lib/matchScore');
    // No randomness and no clock beyond the recency tiebreak, so "shown
    // because..." stays true between loads.
    const a = getMatchResult(base, student);
    const b = getMatchResult(base, student);
    expect(a.score).toBe(b.score);
    expect(a.reasons).toEqual(b.reasons);
  });

  test('a posting with no pin is neutral, not buried', async () => {
    const { getMatchResult } = await import('../src/lib/matchScore');
    const noPin = getMatchResult({ ...base, coordinates: undefined }, student);
    const far = getMatchResult({ ...base, coordinates: { lat: 44.5, lng: -79.0 } }, student);
    // An organisation leaving the map blank must not cost it more than being
    // genuinely far away.
    expect(noPin.score).toBeGreaterThan(far.score);
  });

  test('virtual work gets full marks for distance', async () => {
    const { getMatchResult } = await import('../src/lib/matchScore');
    const virtual = getMatchResult({ ...base, isVirtual: true, coordinates: undefined }, student);
    expect(virtual.reasons.some((x) => /from home/.test(x))).toBe(true);
  });

  test('the score stays within 0 and 100', async () => {
    const { getMatchResult } = await import('../src/lib/matchScore');
    const perfect = getMatchResult(
      { ...base, skillsNeeded: ['Teaching'] },
      { ...student, skills: ['Teaching'] },
    );
    expect(perfect.score).toBeGreaterThanOrEqual(0);
    expect(perfect.score).toBeLessThanOrEqual(100);
  });

  test('an ineligible posting still ranks, but says why', async () => {
    const { getMatchResult } = await import('../src/lib/matchScore');
    const r = getMatchResult({ ...base, exclusives: ['Grade 9 Only'] }, student);
    expect(r.eligibility).toBe('likely-ineligible');
    // Shown-but-marked, never hidden: grade→age is a floor, not a fact, and
    // hiding on a guess makes a posting permanently invisible to someone who
    // may actually qualify.
    expect(r.reasons[r.reasons.length - 1]).toMatch(/Grade 9 only/i);
  });
});
