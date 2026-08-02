/**
 * Check for the hours total helper. Run: npm run check:hours
 *
 * This exists because the scalar it feeds (students/{uid}.hours) is the value
 * the leaderboard sorts on and is written by an org, not by the student — a
 * silently wrong total here is not visible anywhere until the board is wrong.
 */
import assert from 'node:assert/strict';
import { totalLoggedHours } from '../src/lib/hours';

assert.equal(totalLoggedHours([{ hours: 3 }, { hours: 2 }]), 5);
assert.equal(totalLoggedHours([]), 0);
assert.equal(totalLoggedHours(undefined), 0);
assert.equal(totalLoggedHours(null), 0);
// Firestore hands back whatever was written; the org form parses from a text
// input, so string numbers are real.
assert.equal(totalLoggedHours([{ hours: '2.5' }, { hours: 1 }]), 3.5);
// The defect this check caught: Number('' || 0) is 0, but Number('n/a') and
// Number(undefined) are NaN, and NaN would have been persisted as the score.
assert.equal(totalLoggedHours([{ hours: 4 }, { hours: 'n/a' }]), 4);
assert.equal(totalLoggedHours([{ hours: 4 }, {}]), 4);
assert.equal(totalLoggedHours([{ hours: 4 }, null as any]), 4);
assert.equal(totalLoggedHours([{ hours: '' }, { hours: 1 }]), 1);
// Binary floating point: 0.1 + 0.2 must not surface as 0.30000000000000004.
assert.equal(totalLoggedHours([{ hours: 0.1 }, { hours: 0.2 }]), 0.3);
assert.equal(totalLoggedHours('nonsense' as any), 0);

console.log('[PASS] totalLoggedHours: sums, coerces strings, skips unparseable entries, never returns NaN');
