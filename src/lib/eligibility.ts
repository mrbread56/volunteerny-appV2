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
  if (floor >= minAge) return 'eligible';
  /*
   * A band, not a cliff.
   *
   * The header above promises the answer "errs toward 'we are not sure' rather
   * than toward wrongly excluding someone", and the code had no such path:
   * anything above the grade's floor was flatly likely-ineligible, so a 16+
   * posting excluded Grade 9, 10 AND 11 — and Ontario Grade 11 students are
   * 15 to 17, most commonly 16. 'unknown' was reachable only when the grade was
   * missing entirely.
   *
   * ONE year, not two. The floors here are the youngest a grade is likely to
   * be, so the typical age is floor+1: Grade 11 is usually 16, Grade 12 usually
   * 17. Anything up to that typical age is a genuine maybe; beyond it is a real
   * mismatch.
   *
   * Two years would have swallowed the case that matters most in Toronto —
   * Daily Bread, the Humane Society and Second Harvest are 18+ or 19+, and a
   * Grade 12 student is typically 17, so an 18+ posting must still read as
   * likely-ineligible rather than "not sure". One year keeps that while fixing
   * the 16+ posting that wrongly excluded every Grade 11 student.
   *
   * This matters because hideIneligible turns the verdict into a filter: a
   * badge on a posting is a hint, a hidden posting is a decision made for the
   * student on a guess.
   */
  const ceiling = floor + 1;
  return minAge <= ceiling ? 'unknown' : 'likely-ineligible';
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

  /*
   * The reason has to come from the check that FAILED.
   *
   * This picked its message by which rule EXISTS, not by which one the student
   * fell foul of — so a Grade 12 student looking at
   * { minAge: 18, exclusives: ['Grade 12 Only'] } was told "This one is Grade
   * 12 only", a statement that is self-evidently false about them, while the
   * real 18+ blocker went unmentioned. It reads as a platform bug and buries
   * the actual reason.
   */
  const ageVerdict = checkAge(opp.minAge, grade);
  const gradeVerdict = checkGradeExclusives(opp.exclusives, grade);

  // All of them, not the first. `find` reported only "Grade 11 only" on a
  // posting open to both Grade 11 and 12.
  const gradeRules = (opp.exclusives || []).filter((e) => /^Grade \d+ Only$/.test(e));
  const gradeText = gradeRules.length
    ? `This one is ${gradeRules.map((r) => r.replace(' Only', '')).join(' and ')} only`
    : '';
  const ageText = typeof opp.minAge === 'number'
    ? `This one asks for volunteers aged ${opp.minAge}+`
    : '';

  if (gradeVerdict === 'likely-ineligible' && gradeText) return gradeText;
  if (ageVerdict === 'likely-ineligible' && ageText) return ageText;
  // Neither is a definite mismatch, so the verdict is 'unknown' — say the thing
  // that is actually uncertain rather than picking whichever rule exists.
  if (ageVerdict === 'unknown' && ageText) return ageText;
  if (gradeVerdict === 'unknown' && gradeText) return gradeText;
  return gradeText || ageText;
}
