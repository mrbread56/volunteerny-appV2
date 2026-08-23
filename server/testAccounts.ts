/**
 * Which addresses belong to a test fixture rather than a real person.
 *
 * The live check scripts seed real documents into the real project, because
 * that is the only way to prove the real rules hold. They clean up after
 * themselves, but "after" is the problem: anything that reads the database
 * while a check is mid-flight sees fixtures and cannot tell them from people.
 *
 * That is not hypothetical. The public impact counter on the home page is
 * written as a side effect of a developer opening the metrics dashboard, and
 * on 23 Aug 2026 a test run left it claiming three verified organizations at a
 * moment when the organizations collection held none. The counter is only
 * rendered above 25 hours and 2 organizations, so nobody saw a fabricated
 * number that day, but the only thing standing between a fixture and the
 * public home page was a threshold.
 *
 * So the patterns live here, in one place, and both the janitor that deletes
 * fixtures and the metrics that count them read the same list. Keeping two
 * copies in sync by hand is exactly the kind of promise that gets broken.
 *
 * When a new check script starts seeding accounts, add its prefix HERE.
 */
export const TEST_PATTERNS: RegExp[] = [
  /^check_sec_/i,        // scripts/check-security.ts
  /^check_storage_/i,    // scripts/check-storage.ts
  /^check_credit_org_/i, // scripts/check-signup.ts
  /^check_flow/i,        // scripts/check-flows.ts
  /^sweep_(student|org|dev)_/i,  // tests/e2e/console-sweep.spec.ts
  /^trap_(student|org|dev)_/i,   // tests/e2e/click-trap.spec.ts
  /^testuser_\d+@/i,
  /^check_lc_/i,         // scripts/check-lifecycle.ts
  /^check_conc_/i,       // scripts/check-concurrency.ts
  /^vf-[so]-/i,          // scripts/check-security.ts adversarial fixtures
  /@example\.com$/i,     // reserved by RFC 2606 — never a real address
  // .invalid is reserved by the SAME RFC and is just as safe to sweep. Missing
  // it is why the adversarial fixture "Forged Total" — a students document
  // carrying hours: 999999 at vf-s-…@volunteerny-check.invalid — survived every
  // cleanup run. The leaderboard builder reads
  // `students.orderBy('hours','desc')` and filters only on trackerEnabled, so
  // that row was one cron rebuild away from sitting at #1 in front of every
  // student on the platform.
  /\.invalid$/i,
];

/** True when this address was minted by a check script, not by a person. */
export const isTestAddress = (email: string | null | undefined): boolean =>
  !!email && TEST_PATTERNS.some((p) => p.test(email));
