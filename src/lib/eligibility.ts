/**
 * Whether a student is likely to be eligible for an opportunity.
 *
 * Toronto organisations set real age floors and they genuinely vary: City of
 * Toronto community recreation takes 14+, Toronto History Museums runs a 14–18
 * programme, Daily Bread and Toronto Humane Society are 18+, Second Harvest is
 * 19+. A student who applies into a wall finds out days later, if at all.
 *
 * We do not hold a date of birth, and deliberately so — collecting one from a
 * minor widens what we store for a value we can approximate. Grade gives an age
 * FLOOR, which is all a floor comparison needs.
 *
 * The floors are conservative on purpose. A Grade 9 student is usually 14 but
 * may have turned 13; using the low end means the answer errs toward "we are
 * not sure" rather than toward wrongly excluding someone.
 */
export type Eligibility = 'eligible' | 'likely-ineligible' | 'unknown';

const GRADE_MIN_AGE: Record<string, number> = {
  '9': 13,
  '10': 14,
  '11': 15,
  '12': 16,
};

/** The youngest a student in this grade is likely to be. */
export function minAgeForGrade(grade: string | undefined | null): number | null {
  if (!grade) return null;
  return GRADE_MIN_AGE[String(grade).trim()] ?? null;
}

/**
 * Age check.
 *
 * Returns 'likely-ineligible', never a flat 'ineligible', because grade→age is
 * a floor rather than a fact — a seventeen-year-old repeating Grade 10 exists,
 * and so does a student who skipped a year.
 */
export function checkAge(
  minAge: number | undefined | null,
  grade: string | undefined | null,
): Eligibility {
  if (typeof minAge !== 'number' || !Number.isFinite(minAge)) return 'eligible';
  const floor = minAgeForGrade(grade);
  if (floor === null) return 'unknown';
  return floor >= minAge ? 'eligible' : 'likely-ineligible';
}

/**
 * The grade restrictions an organisation can already put on a posting.
 *
 * OPPORTUNITY_EXCLUSIVES has carried 'Grade 9 Only' … 'Grade 12 Only' all
 * along, and nothing anywhere ever compared them to a student's grade. They
 * rendered as badges and filtered only when a student opted in. So a Grade 12
 * student browsing today sees "Grade 9 Only" postings with no indication they
 * are not eligible — a hard statement by the organisation, enforced nowhere.
 *
 * This is the bug worth fixing first: it needs no new field and no schema
 * change, only somebody reading the value that is already there.
 */
export function checkGradeExclusives(
  exclusives: string[] | undefined | null,
  grade: string | undefined | null,
): Eligibility {
  const gradeRules = (exclusives || []).filter((e) => /^Grade \d+ Only$/.test(e));
  if (gradeRules.length === 0) return 'eligible';
  if (!grade) return 'unknown';
  const mine = `Grade ${String(grade).trim()} Only`;
  return gradeRules.includes(mine) ? 'eligible' : 'likely-ineligible';
}

/** Both checks. The stricter answer wins; 'unknown' never masks a real mismatch. */
export function checkEligibility(
  opp: { minAge?: number; exclusives?: string[] },
  grade: string | undefined | null,
): Eligibility {
  const results = [checkAge(opp.minAge, grade), checkGradeExclusives(opp.exclusives, grade)];
  if (results.includes('likely-ineligible')) return 'likely-ineligible';
  if (results.includes('unknown')) return 'unknown';
  return 'eligible';
}

/** What to tell the student. Empty when there is nothing to say. */
export function describeEligibility(
  opp: { minAge?: number; exclusives?: string[] },
  grade: string | undefined | null,
): string {
  const verdict = checkEligibility(opp, grade);
  if (verdict === 'eligible') return '';
  const gradeRule = (opp.exclusives || []).find((e) => /^Grade \d+ Only$/.test(e));
  if (gradeRule) return `This one is ${gradeRule.replace(' Only', '')} only`;
  if (typeof opp.minAge === 'number') return `This one asks for volunteers aged ${opp.minAge}+`;
  return '';
}
