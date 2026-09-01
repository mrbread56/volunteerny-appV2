/**
 * The shared vocabularies. One definition each, because copies drift.
 *
 * Every list here was previously declared separately in three to five files,
 * and two of them had already diverged in ways that silently corrupted or
 * dropped user data:
 *
 * AVAILABILITY had TWO incompatible vocabularies with only two values in
 * common. Signup and StudentOnboarding wrote 'Weekend Mornings'; StudentProfile
 * offered 'Weekends (Saturday/Sunday)' instead. A student who onboarded and
 * then opened their profile found their answer simply gone from the UI — and
 * saving from that screen wrote the profile's vocabulary over the onboarding
 * one. Nothing consumed the field yet, so it was invisible; it becomes visible
 * the moment anything filters on availability.
 *
 * COMMITMENTS disagreed on the stored value. The organisation form saved
 * 'Short-term (1-3 months)' while the student filter looked for 'Short-term',
 * and it only appeared to work because the filter used `.includes()`. A
 * substring match papering over a schema mismatch is a bug waiting for someone
 * to switch to `===`.
 *
 * SKILLS was copied five times and INTERESTS three, both still identical — but
 * only by luck, and INTERESTS was already a verbatim duplicate of
 * OPPORTUNITY_CATEGORIES in constants.ts.
 */

/**
 * When a student can volunteer.
 *
 * Eight slots: a weekday/weekend × morning/afternoon/evening grid, plus school
 * breaks and a catch-all. Deliberately coarse — this is matched by set
 * intersection against an opportunity's schedule, and a finer grid produces
 * combinations nobody will tick.
 *
 * 'School Breaks' is kept from the old profile vocabulary because it is
 * genuinely distinct: a student with no term-time availability may still be
 * free for a week in March, and that is exactly the placement a camp wants.
 */
export const AVAILABILITY: string[] = [
  'Weekday Mornings',
  'Weekday Afternoons',
  'Weekday Evenings',
  'Weekend Mornings',
  'Weekend Afternoons',
  'Weekend Evenings',
  'School Breaks',
  'Flexible',
];

/**
 * Values written by the retired StudentProfile vocabulary, mapped onto the
 * canonical ones above.
 *
 * Used by `scripts/backfill-availability.ts` and, defensively, when reading a
 * profile — a value written before the merge must not disappear from a
 * student's own screen just because the list it came from is gone.
 *
 * 'Weekends (Saturday/Sunday)' expands to BOTH weekend slots because it
 * genuinely meant both, and narrowing it to one would quietly reduce what a
 * student had told us they could do.
 */
export const LEGACY_AVAILABILITY: Record<string, string[]> = {
  'Weekdays After School': ['Weekday Afternoons'],
  'Weekends (Saturday/Sunday)': ['Weekend Mornings', 'Weekend Afternoons'],
  'Summer Break': ['School Breaks'],
  'Winter/Spring Breaks': ['School Breaks'],
  'Flexible / On-Call': ['Flexible'],
};

/** Normalise any stored availability array to the canonical vocabulary. */
export function normalizeAvailability(stored: string[] | undefined | null): string[] {
  if (!Array.isArray(stored)) return [];
  const out = new Set<string>();
  for (const value of stored) {
    const mapped = LEGACY_AVAILABILITY[value];
    if (mapped) mapped.forEach((m) => out.add(m));
    else if ((AVAILABILITY as readonly string[]).includes(value)) out.add(value);
    // Anything else is dropped: it came from neither vocabulary and cannot be
    // matched against an opportunity.
  }
  return [...out];
}

/** What a student can offer, and what an opportunity asks for. Same list both ways. */
export const SKILLS: string[] = [
  'Communication',
  'Computer & Tech',
  'Creative & Design',
  'Event Support',
  'Language Skills',
  'Leadership',
  'Organization',
  'Physical Work',
  'Research & Writing',
  'Teaching',
];

/**
 * How long a placement runs.
 *
 * The `value` is what gets stored, so both sides must use these exact strings —
 * that is the whole point of this list existing. Do not shorten them for
 * display; put the short form in the label if it is ever needed.
 */
export const COMMITMENTS: { value: string; label: string }[] = [
  { value: 'One-time', label: 'One-time' },
  { value: 'Short-term (1-3 months)', label: 'Short-term (1-3 months)' },
  { value: 'Long-term (6+ months)', label: 'Long-term (6+ months)' },
  /*
   * For a role where the length is settled between the student and the office
   * rather than fixed in advance. Every other option here commits the
   * organization to a duration it may not know yet, and the only way to post
   * without one was to guess — which is a worse answer than saying so.
   */
  { value: 'Arranged with the office', label: 'Arranged with the office' },
];
