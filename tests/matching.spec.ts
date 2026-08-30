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

  test('the age comparison is pinned AT the boundary, not near it', async () => {
    const { checkAge } = await import('../src/lib/eligibility');
    // Found by mutation: `floor >= minAge` could be loosened to
    // `floor >= minAge - 1` and every other test here still passed, because
    // none of them sat on the boundary. A comparison is only really tested by
    // the pair either side of it.
    //
    /*
     * There are now TWO boundaries, and both are pinned.
     *
     * The floors are the YOUNGEST a grade is likely to be, so the typical age
     * is floor+1. A flat `floor >= minAge` therefore called every Grade 11
     * student ineligible for a 16+ posting, when a Grade 11 student is
     * typically exactly 16 — the file's own header promises the answer errs
     * toward "not sure" rather than toward wrongly excluding someone, and it
     * did the opposite. Up to the typical age is 'unknown'; past it is a real
     * mismatch.
     */
    // Grade 11: floor 15, typical 16.
    expect(checkAge(15, '11')).toBe('eligible');           // meets the floor
    expect(checkAge(16, '11')).toBe('unknown');            // typical age — a real maybe
    expect(checkAge(17, '11')).toBe('likely-ineligible');  // past it
    // Grade 9: floor 13, typical 14.
    expect(checkAge(13, '9')).toBe('eligible');
    expect(checkAge(14, '9')).toBe('unknown');
    expect(checkAge(15, '9')).toBe('likely-ineligible');
    // Grade 12: floor 16, typical 17. The 18+ case is the one that matters most
    // in Toronto — Daily Bread, the Humane Society and Second Harvest are 18+
    // or 19+ — and it must still be caught rather than softened to "not sure".
    expect(checkAge(16, '12')).toBe('eligible');
    expect(checkAge(17, '12')).toBe('unknown');
    expect(checkAge(18, '12')).toBe('likely-ineligible');
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

  test('the reason names the rule the student actually failed', async () => {
    const { describeEligibility } = await import('../src/lib/eligibility');
    /*
     * This picked its message by which rule EXISTED rather than which one
     * failed, so a Grade 12 student looking at a Grade-12-only posting with an
     * 18+ floor was told "This one is Grade 12 only" — self-evidently false
     * about them — while the real blocker went unmentioned.
     */
    expect(describeEligibility({ minAge: 18, exclusives: ['Grade 12 Only'] }, '12'))
      .toMatch(/18\+/);
    // And `find` reported only the first of several grade rules.
    expect(describeEligibility({ exclusives: ['Grade 11 Only', 'Grade 12 Only'] }, '9'))
      .toMatch(/Grade 11 and Grade 12/);
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

test.describe('regressions the ranking tests did not previously reach', () => {
  const posting = (over: any = {}) => ({
    id: 'o1', title: 'Beach cleanup', description: 'd', location: 'l',
    category: 'Environment', skillsNeeded: [], exclusives: [],
    coordinates: { lat: 43.7615, lng: -79.4111 }, isVirtual: false,
    createdAt: new Date(), ...over,
  }) as any;

  test('a one-off Saturday posting is a weekend posting, not a weekday one', async () => {
    const { slotsForOpportunity } = await import('../src/lib/availability');
    /*
     * The create form seeds a default shift row { startTime: '09:00',
     * endTime: '12:00' } and writes it for EVERY schedule type, so a
     * single-date posting arrives with one dayless shift alongside the real
     * time in dateTime. slotFor treated an absent day as a weekday, the set was
     * therefore non-empty, and the dateTime fallback never ran — so every
     * one-off posting, the most common kind, advertised itself as Weekday
     * Mornings whatever day it actually was.
     *
     * The old test used an EMPTY shifts array, the one shape the form never
     * writes, which is why it passed throughout.
     */
    const saturdayAfternoon = posting({
      scheduleType: 'single',
      dateTime: new Date(2026, 8, 5, 14, 0), // Sat 5 Sep 2026, 2pm, local
      shifts: [{ startTime: '09:00', endTime: '12:00', date: null, day: null }],
    });
    expect(slotsForOpportunity(saturdayAfternoon)).toEqual(['Weekend Afternoons']);
  });

  test('a student free on the day outranks one who is not', async () => {
    const { getMatchResult } = await import('../src/lib/matchScore');
    const saturdayAfternoon = posting({
      scheduleType: 'single',
      dateTime: new Date(2026, 8, 5, 14, 0),
      shifts: [{ startTime: '09:00', endTime: '12:00', date: null, day: null }],
    });
    const canAttend = getMatchResult(saturdayAfternoon, {
      availability: ['Weekend Afternoons'], neighborhood: 'Bayview Village', interests: [], skills: [],
    } as any).score;
    const cannotAttend = getMatchResult(saturdayAfternoon, {
      availability: ['Weekday Mornings'], neighborhood: 'Bayview Village', interests: [], skills: [],
    } as any).score;
    expect(canAttend).toBeGreaterThan(cannotAttend);
  });

  test("'Flexible' scores partial marks, not full", async () => {
    const { getMatchResult } = await import('../src/lib/matchScore');
    // The file header says so and the code did the opposite: the branch tested
    // describeOverlap's STRING, which is non-empty for Flexible ("You said your
    // availability is flexible"), so Flexible took the full-marks branch and
    // tied with an exact slot match on every posting.
    const opp = posting({ scheduleType: 'recurring', shifts: [{ day: 'Sat', startTime: '09:00' }] });
    const who = (availability: string[]) => getMatchResult(opp, {
      availability, neighborhood: 'Bayview Village', interests: [], skills: [],
    } as any).score;
    expect(who(['Flexible'])).toBeLessThan(who(['Weekend Mornings']));
    // ...and still better than saying nothing at all.
    expect(who(['Flexible'])).toBeGreaterThan(who([]));
  });

  test("'School Breaks' is not a penalty for answering the question", async () => {
    const { availabilityOverlaps } = await import('../src/lib/availability');
    // It is offered in the UI and is not in slotsForOpportunity's codomain
    // ([Weekday|Weekend] x [Mornings|Afternoons|Evenings]), so it overlapped
    // nothing and left the student worse off than leaving the field blank —
    // which is exempted. Two retired values are backfilled into it.
    expect(availabilityOverlaps(['School Breaks'], ['Weekend Mornings'])).toBe(true);
  });

  test('a student with no neighbourhood is not measured from North York', async () => {
    const { getMatchResult } = await import('../src/lib/matchScore');
    // coordsForNeighborhood falls back to the North York civic centre, which is
    // right for centring the map and wrong for scoring: the heaviest weight was
    // applied against a place the student never named, and the card asserted
    // "0 m" as a flat fact.
    const nearby = posting({ coordinates: { lat: 43.7615, lng: -79.4111 } });
    const faraway = posting({ coordinates: { lat: 43.6205, lng: -79.5132 } });
    const p = { availability: ['Flexible'], interests: [], skills: [] } as any;
    const a = getMatchResult(nearby, p);
    const b = getMatchResult(faraway, p);
    expect(a.score).toBe(b.score);
    expect(a.reasons.join(' ')).not.toMatch(/m|km/);
  });
});
