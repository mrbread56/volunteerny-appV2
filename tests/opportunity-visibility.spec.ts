import { test, expect } from '@playwright/test';
import { isVisibleToStudents } from '../src/lib/visibleToStudents';
import type { Opportunity } from '../src/types';

/**
 * What a student is allowed to see in the opportunity list.
 *
 * On 28 Aug 2026 a production read found a test fixture, "Journey Org
 * 1787892905185", sitting in the public opportunity list next to a real food
 * bank's posting, because an end-to-end suite was mid-run. The suites write to
 * the real project on purpose and clean up afterwards, and "afterwards" is a
 * window in which a real student sees invented organisations.
 *
 * Both rules below are load-bearing in opposite directions, which is why the
 * absent-field cases matter as much as the present ones: a posting created
 * before either field existed carries neither, and must still be shown.
 */

const opp = (over: Partial<Opportunity> = {}): Opportunity =>
  ({ id: 'o1', orgId: 'org1', title: 'Sorting food', ...over }) as Opportunity;

test.describe('what students see', () => {
  test('an ordinary open posting is shown', () => {
    expect(isVisibleToStudents(opp({ status: 'open' }))).toBe(true);
  });

  test('a closed posting is hidden', () => {
    // Tirgan's real listing sits in this state, waiting on their schedule.
    expect(isVisibleToStudents(opp({ status: 'closed' }))).toBe(false);
  });

  test('a fixture is hidden even when it is open', () => {
    expect(isVisibleToStudents(opp({ status: 'open', isFixture: true }))).toBe(false);
  });

  test('a fixture is hidden regardless of status', () => {
    for (const status of ['open', 'closed', undefined] as const) {
      expect(isVisibleToStudents(opp({ status, isFixture: true }))).toBe(false);
    }
  });
});

test.describe('postings that predate these fields', () => {
  test('a posting with no status at all is shown', () => {
    // Absent means open. Filtering on status === 'open' in the Firestore query
    // would have hidden every posting created before the field existed, which
    // is why the check lives in JavaScript.
    expect(isVisibleToStudents(opp())).toBe(true);
  });

  test('a posting with no isFixture is shown', () => {
    expect(isVisibleToStudents(opp({ status: 'open' }))).toBe(true);
  });

  test('neither field present is still shown', () => {
    const bare = { id: 'o2', orgId: 'org1', title: 'Old posting' } as Opportunity;
    expect(isVisibleToStudents(bare)).toBe(true);
  });

  test('isFixture false is treated as real, not as missing', () => {
    expect(isVisibleToStudents(opp({ status: 'open', isFixture: false }))).toBe(true);
  });
});

test.describe('the rule holds over every combination', () => {
  test('exactly the open non-fixture postings survive', () => {
    const statuses = ['open', 'closed', undefined] as const;
    const fixtures = [true, false, undefined] as const;
    let shown = 0;
    for (const status of statuses) {
      for (const isFixture of fixtures) {
        const visible = isVisibleToStudents(opp({ status, isFixture }));
        // The rule, restated independently of the implementation.
        const expected = status !== 'closed' && isFixture !== true;
        expect(visible, `status=${status} isFixture=${isFixture}`).toBe(expected);
        if (visible) shown++;
      }
    }
    // Two statuses count as open (open, absent) times two non-fixture values.
    expect(shown).toBe(4);
  });

  test('it never throws on a malformed document', () => {
    // Firestore hands back whatever is stored, including shapes no writer in
    // this codebase produces.
    for (const junk of [
      {}, { status: null }, { status: 'OPEN' }, { isFixture: 'yes' },
      { status: 123 }, { isFixture: 0 }, { isFixture: null },
    ]) {
      expect(() => isVisibleToStudents(junk as Opportunity)).not.toThrow();
    }
  });

  test('a truthy non-boolean isFixture still hides the posting', () => {
    // Better to hide a real posting than to show a fake organisation, if a
    // writer ever stores the wrong type.
    expect(isVisibleToStudents(opp({ isFixture: 'yes' as any }))).toBe(false);
  });
});
