import type { Opportunity } from '../types';

/**
 * Which postings a student is allowed to see.
 *
 * There are two student-facing lists — the browse page and the dashboard
 * recommendations — and they each carried their own copy of the closed-posting
 * filter. Two copies of a visibility rule is how one of them ends up a version
 * behind, which is exactly what happened here: on 28 Aug 2026 a live check
 * found a test fixture, "Journey Org 1787892905185", sitting in the public
 * opportunity list beside a real food bank's posting while an end-to-end suite
 * was mid-run.
 *
 * The suites seed real documents into the real project because that is the only
 * way to prove the real rules hold, and they clean up afterwards — but "after"
 * is the problem, and it is the same lesson server/testAccounts.ts records
 * about the public impact counter. A fixture is invisible to the people running
 * the tests and perfectly visible to a student browsing the site.
 *
 * `isFixture` is checked rather than filtered in the Firestore query for the
 * same reason `status` is: Firestore omits documents that lack the field
 * entirely, so a `where` clause would hide every posting created before the
 * field existed. Absent means real.
 */
export const isVisibleToStudents = (o: Opportunity): boolean =>
  o.status !== 'closed' && !o.isFixture;
