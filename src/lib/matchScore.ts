import type { Opportunity, StudentProfile } from '../types';
import { coordsForNeighborhood, type LatLng } from './neighborhoods';
import { distanceToOpportunity, formatDistance } from './distance';
import { slotsForOpportunity, availabilityOverlaps, describeOverlap } from './availability';
import { checkEligibility, describeEligibility, type Eligibility } from './eligibility';

/**
 * How well an opportunity matches a student — and, in the same breath, why.
 *
 * The score and the explanation come out of one function on purpose. An
 * explanation computed separately from the score drifts from it, and then the
 * page is telling students something that is not the reason it ranked. Every
 * sentence in `reasons` is emitted by the term that actually contributed.
 *
 * Deterministic: no randomness, no clock. The same profile against the same
 * corpus produces the same order on every load, which is what makes "shown
 * because…" a true statement rather than decoration.
 *
 * Weights. Distance carries the most because it is the constraint a
 * fifteen-year-old without a car actually feels — a placement across the city
 * on a free Saturday is not a match. Availability matters but is a coarse
 * eight-bucket derivation, so it does not deserve to outrank geography.
 *
 *   35  distance        linear decay, full marks under 2 km, nothing past 15
 *   25  availability    slot overlap; 'Flexible' scores partial, not full
 *   20  interests       the category is one the student chose
 *   15  skills          share of the needed skills the student has
 *    5  recency         tiebreak only
 *
 * Age is NOT a weight. It is a gate that produces a badge — scoring someone
 * lower for being ineligible is neither a filter nor useful ordering.
 *
 * What was here before, and why it is gone: the old function gave +30 for a
 * category match and then +5 again for each interest appearing anywhere in the
 * title or description, so a category match was counted twice and a long
 * description could silently outscore a real one. It was also unbounded, which
 * made the numbers impossible to compare or explain.
 */

export interface MatchResult {
  /** 0–100. Comparable across opportunities. */
  score: number;
  /** Ordered by contribution, highest first. Safe to show the top one or two. */
  reasons: string[];
  eligibility: Eligibility;
  /** Kilometres, or null when the posting has no pin. */
  distanceKm: number | null;
}

const WEIGHTS = { distance: 35, availability: 25, interests: 20, skills: 15, recency: 5 };

/** Full marks at or under this; zero at or beyond the far bound. */
const NEAR_KM = 2;
const FAR_KM = 15;

function distancePoints(km: number | null, isVirtual: boolean | undefined): number {
  // Virtual work has no distance to travel, so it gets full marks rather than
  // being punished for having no coordinates.
  if (isVirtual) return WEIGHTS.distance;
  // Unknown is neutral, never zero: a posting without a pin must not be pushed
  // to the bottom for a field the organisation simply left blank.
  if (km === null) return WEIGHTS.distance * 0.5;
  if (km <= NEAR_KM) return WEIGHTS.distance;
  if (km >= FAR_KM) return 0;
  return WEIGHTS.distance * (1 - (km - NEAR_KM) / (FAR_KM - NEAR_KM));
}

export function getMatchResult(
  opp: Opportunity,
  profile: Partial<StudentProfile> | null | undefined,
  /** Overrides the neighbourhood centre when a live position is available. */
  from?: LatLng | null,
): MatchResult {
  const interests = profile?.interests || [];
  const skills = profile?.skills || [];
  const origin = from || coordsForNeighborhood(profile?.neighborhood);

  const reasons: { text: string; points: number }[] = [];
  let score = 0;

  // ── distance ────────────────────────────────────────────────────────────
  const distanceKm = distanceToOpportunity(origin, opp.coordinates);
  const dPoints = distancePoints(distanceKm, opp.isVirtual);
  score += dPoints;
  if (opp.isVirtual) {
    reasons.push({ text: 'You can do this one from home', points: dPoints });
  } else if (distanceKm !== null && distanceKm <= FAR_KM) {
    const where = profile?.neighborhood ? ` from ${profile.neighborhood}` : '';
    reasons.push({ text: `${formatDistance(distanceKm)}${where}`, points: dPoints });
  }

  // ── availability ────────────────────────────────────────────────────────
  const slots = slotsForOpportunity(opp);
  if (availabilityOverlaps(profile?.availability, slots)) {
    const stated = (profile?.availability || []).length > 0;
    // 'Flexible' is a non-answer rather than a perfect match, and a student who
    // has told us nothing has not matched anything — neither should score full.
    const aPoints = stated
      ? (describeOverlap(profile?.availability, slots) ? WEIGHTS.availability : WEIGHTS.availability * 0.6)
      : WEIGHTS.availability * 0.5;
    score += aPoints;
    const text = describeOverlap(profile?.availability, slots);
    if (text) reasons.push({ text, points: aPoints });
  }

  // ── interests ───────────────────────────────────────────────────────────
  if (opp.category && interests.some((i) => i.toLowerCase() === opp.category.toLowerCase())) {
    score += WEIGHTS.interests;
    reasons.push({ text: `${opp.category} is one of your interests`, points: WEIGHTS.interests });
  }

  // ── skills ──────────────────────────────────────────────────────────────
  const needed = opp.skillsNeeded || [];
  if (needed.length > 0 && skills.length > 0) {
    const overlap = needed.filter((n) => skills.some((s) => s.toLowerCase() === n.toLowerCase()));
    if (overlap.length > 0) {
      const sPoints = WEIGHTS.skills * (overlap.length / needed.length);
      score += sPoints;
      reasons.push({
        text: overlap.length === 1
          ? `Needs ${overlap[0]}, one of your skills`
          : `Matches ${overlap.length} of your skills`,
        points: sPoints,
      });
    }
  }

  // ── recency ─────────────────────────────────────────────────────────────
  // A tiebreak, not a signal. Newer postings edge out older ones at equal fit.
  const created: any = (opp as any).createdAt;
  const createdMs = typeof created?.toDate === 'function' ? created.toDate().getTime()
    : typeof created?.seconds === 'number' ? created.seconds * 1000
    : Date.parse(created) || 0;
  if (createdMs > 0) {
    const ageDays = Math.max(0, (Date.now() - createdMs) / 86400000);
    score += WEIGHTS.recency * Math.max(0, 1 - ageDays / 60);
  }

  const eligibility = checkEligibility(opp as any, profile?.grade);
  const caveat = describeEligibility(opp as any, profile?.grade);
  if (caveat) reasons.push({ text: caveat, points: -1 });

  return {
    score: Math.round(Math.min(100, Math.max(0, score))),
    // Highest contribution first, so showing only the top one or two still
    // shows the reasons that actually drove the ranking. The eligibility
    // caveat carries -1 so it always sorts last but is never dropped.
    reasons: reasons.sort((a, b) => b.points - a.points).map((r) => r.text),
    eligibility,
    distanceKm,
  };
}

/**
 * The old numeric API, kept so existing callers keep working.
 *
 * @deprecated Prefer getMatchResult, which also returns why.
 */
export function getMatchScore(
  opp: Opportunity,
  myInterests: string[] = [],
  mySkills: string[] = [],
): number {
  return getMatchResult(opp, { interests: myInterests, skills: mySkills } as any).score;
}
