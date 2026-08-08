import type { Opportunity } from '../types';

/**
 * How well an opportunity matches a student, used to order recommendations.
 *
 * Extracted from StudentDashboard, where it was redefined inside the data-
 * fetching effect on every run and closed over the profile. As a free function
 * taking its inputs explicitly it can be read, reasoned about and tested
 * without rendering a 2,400-line component.
 *
 * Weighting, unchanged from the original:
 *   +30  the category is one of the student's stated interests
 *   +15  per required skill the student has
 *   +5   per interest or skill appearing anywhere in the title/description
 */
export function getMatchScore(
  opp: Opportunity,
  myInterests: string[] = [],
  mySkills: string[] = [],
): number {
let score = 0;
// Primary Match: Category matches student's interests (cause categories)
if (opp.category && myInterests.some(interest => interest.toLowerCase() === opp.category.toLowerCase())) {
  score += 30;
}
// Secondary Match: Overlap of required skills vs student skills
if (opp.skillsNeeded && opp.skillsNeeded.length > 0) {
  const overlap = opp.skillsNeeded.filter(skill => 
    mySkills.some(s => s.toLowerCase() === skill.toLowerCase())
  );
  score += overlap.length * 15;
}
// Text keyword searches
const lowerText = `${opp.title} ${opp.description} ${opp.category || ""}`.toLowerCase();
myInterests.forEach(interest => {
  if (lowerText.includes(interest.toLowerCase())) {
    score += 5;
  }
});
mySkills.forEach(skill => {
  if (lowerText.includes(skill.toLowerCase())) {
    score += 5;
  }
});
return score;
}
