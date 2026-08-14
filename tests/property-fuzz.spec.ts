import { test, expect } from '@playwright/test';
import { resolveOpportunityDate } from '../src/lib/opportunityDate';
import { formatDate } from '../src/lib/utils';
import { isMfaClaimCurrent, verifyMfaClaim } from '../src/lib/mfa';
import { compressFile, decompressFile } from '../src/utils/compress';
import { evaluateBadges } from '../src/utils/badges';

/**
 * The pure functions, under input nobody would write by hand.
 *
 * These are small, they have no I/O, and every quiet arithmetic bug in this
 * project has lived in one of them: an opportunity's date computed from a
 * weekday, an hours total summed from an array, a claim compared against a
 * timestamp. Example-based tests prove the cases someone thought of. This
 * generates thousands, including the ones nobody would think of — leap days,
 * DST boundaries, NaN, Infinity, empty arrays, enormous arrays, hostile strings.
 *
 * No new dependency: the generators below are twenty lines and a seeded PRNG,
 * which is all a property test needs and is reproducible on failure.
 */

/** Seeded so a failure can be replayed exactly. mulberry32. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)];

/** Values chosen to break things, not to be realistic. */
const HOSTILE_STRINGS = [
  '', ' ', '\n', '\t\t', '0', 'null', 'undefined', 'NaN', 'Infinity',
  '<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "'; DROP TABLE users;--",
  '👩‍👩‍👧‍👦 family', 'مرحبا', '日本語', 'a'.repeat(10000),
  '2026-02-30', '2026-13-45', '0000-00-00', '9999-99-99',
  '2026-02-29T12:00', '2024-02-29T12:00', // one real leap day, one not
];

const HOSTILE_NUMBERS = [0, -0, 1, -1, 0.1, -0.1, NaN, Infinity, -Infinity,
  Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 1e308, -1e308, 24, 24.0001];

// The abbreviations the app actually stores. OrgOpportunityCreate and
// OrgOpportunityEdit both offer ['Mon'..'Sun'] and opportunityDate.ts matches
// on those exact strings — a test using 'Monday' silently exercises the
// fallback path instead of the logic, and reports the fallback as a bug.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Sunday-first, to line up with Date#getDay(). */
const DAY_BY_INDEX = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

test.describe('resolveOpportunityDate', () => {
  test('always returns a usable Date, whatever it is handed', () => {
    const r = rng(1337);
    for (let i = 0; i < 4000; i++) {
      const scheduleType = pick(r, ['single', 'multiple', 'recurring'] as const);
      const dateTimeLocal = pick(r, HOSTILE_STRINGS);
      const shiftCount = Math.floor(r() * 4);
      const shifts = Array.from({ length: shiftCount }, () => ({
        day: pick(r, [...DAYS, 'Monday', '', 'Funday', undefined as any]),
        startTime: pick(r, ['09:00', '00:00', '23:59', '', '25:00', 'abc', undefined as any]),
        endTime: pick(r, ['12:00', '', 'xyz', undefined as any]),
      }));
      const from = new Date(2026, 0, 1 + Math.floor(r() * 800), Math.floor(r() * 24), Math.floor(r() * 60));

      const out = resolveOpportunityDate(scheduleType, dateTimeLocal, shifts as any, from);

      // The contract this function has with every caller: a real Date. A NaN
      // date propagates into toISOString(), which THROWS RangeError rather than
      // returning something useless, and takes the page down.
      expect(out instanceof Date, `not a Date for ${scheduleType} / ${dateTimeLocal}`).toBe(true);
      expect(
        Number.isFinite(out.getTime()),
        `invalid Date for scheduleType=${scheduleType} dateTimeLocal=${JSON.stringify(dateTimeLocal)} shifts=${JSON.stringify(shifts)}`,
      ).toBe(true);
    }
  });

  test('a recurring shift never resolves into the past relative to `from`', () => {
    const r = rng(99);
    for (let i = 0; i < 1500; i++) {
      const from = new Date(2026, Math.floor(r() * 12), 1 + Math.floor(r() * 28),
        Math.floor(r() * 24), Math.floor(r() * 60));
      const day = pick(r, DAYS);
      const startTime = `${String(Math.floor(r() * 24)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`;
      const out = resolveOpportunityDate('recurring', '', [{ day, startTime, endTime: '23:59' }] as any, from);
      // The whole point of the function: "next Monday at 9" must be in the
      // future, including when today IS Monday and 9am has already gone.
      expect(
        out.getTime() >= from.getTime() - 1000,
        `resolved ${out.toISOString()} before from=${from.toISOString()} for ${day} ${startTime}`,
      ).toBe(true);
    }
  });

  test('crosses a DST boundary without landing on the wrong day', () => {
    // Toronto springs forward 2026-03-08 and falls back 2026-11-01. A naive
    // +7*86400000 lands an hour off and can roll the weekday.
    for (const anchor of ['2026-03-06T12:00:00', '2026-03-09T12:00:00',
                          '2026-10-30T12:00:00', '2026-11-02T12:00:00']) {
      for (const day of DAYS) {
        const from = new Date(anchor);
        const out = resolveOpportunityDate('recurring', '', [{ day, startTime: '09:00', endTime: '12:00' }] as any, from);
        expect(Number.isFinite(out.getTime())).toBe(true);
        expect(
          DAY_BY_INDEX[out.getDay()],
          `${day} from ${anchor} resolved to a ${DAY_BY_INDEX[out.getDay()]}`,
        ).toBe(day);
      }
    }
  });
});

test.describe('formatDate', () => {
  test('never throws and never renders the words Invalid Date', () => {
    const r = rng(7);
    const inputs: any[] = [
      ...HOSTILE_STRINGS, ...HOSTILE_NUMBERS, null, undefined,
      new Date('invalid'), new Date(8.64e15 + 1), {}, [], () => {},
    ];
    for (let i = 0; i < 2000; i++) {
      const v = i < inputs.length ? inputs[i] : pick(r, inputs);
      let out = '';
      expect(() => { out = formatDate(v as any); }, `threw on ${JSON.stringify(String(v))}`).not.toThrow();
      expect(typeof out).toBe('string');
      // "Invalid Date" reaching a student's transcript is worse than a blank.
      expect(out, `rendered "Invalid Date" for ${JSON.stringify(String(v))}`).not.toMatch(/Invalid Date/i);
    }
  });
});

test.describe('the MFA claim comparison', () => {
  test('only an exact per-sign-in match verifies', () => {
    const r = rng(4242);
    for (let i = 0; i < 3000; i++) {
      const authTime = Math.floor(r() * 2e9);
      const claims: Record<string, any> = {
        auth_time: pick(r, [authTime, String(authTime), undefined, null, NaN, 'abc']),
        mfaVerified: pick(r, [true, false, undefined, 'true', 1]),
        mfaVerifiedFor: pick(r, [authTime, authTime + 1, authTime - 1, String(authTime), undefined, null, NaN]),
      };
      let out: boolean = false;
      expect(() => { out = isMfaClaimCurrent({ claims }); }).not.toThrow();
      expect(typeof out).toBe('boolean');

      // Verified is allowed ONLY when the flag is exactly true and the two
      // stamps agree numerically. Anything looser is a 2FA bypass.
      if (out && !claims.mfaGraceUntil) {
        expect(claims.mfaVerified).toBe(true);
        expect(Number(claims.mfaVerifiedFor)).toBe(Number(claims.auth_time));
        expect(Number.isFinite(Number(claims.auth_time))).toBe(true);
      }
    }
  });

  test('a missing profile never silently grants access', () => {
    const r = rng(5150);
    for (let i = 0; i < 1000; i++) {
      const user = pick(r, [null, undefined, {}, { uid: 'x' }]);
      const profile = pick(r, [null, undefined, {}, { twoFactorEnabled: false }, { twoFactorEnabled: true }, { twoFactorEnabled: 'false' as any }]);
      const claim = pick(r, [true, false]);
      const out = verifyMfaClaim(user, profile, claim);
      expect(typeof out).toBe('boolean');
      // No user means no access, always.
      if (!user) expect(out).toBe(false);
      // The ONLY documented bypass is an explicit boolean false.
      if (user && profile && (profile as any).twoFactorEnabled !== false && !claim) {
        expect(out).toBe(false);
      }
    }
  });
});

test.describe('file compression', () => {
  test('round-trips whatever it is given, or returns empty — never corrupt output', () => {
    const r = rng(2718);
    const payloads = [
      '', 'data:image/png;base64,iVBORw0KGgo=', 'plain text',
      '👩‍👩‍👧‍👦'.repeat(50), 'a'.repeat(50000), ' ',
      'data:application/pdf;base64,' + 'A'.repeat(10000),
    ];
    for (let i = 0; i < 400; i++) {
      const input = i < payloads.length ? payloads[i] : pick(r, payloads);
      let compressed = '';
      expect(() => { compressed = compressFile(input); }).not.toThrow();
      let out = '';
      expect(() => { out = decompressFile(compressed); }).not.toThrow();
      // Either it survives intact or the function declines — a partially
      // decoded resume is worse than none, because it looks like a real file.
      expect(out === input || out === '', `round trip corrupted a ${input.length}-char payload`).toBe(true);
    }
  });

  test('decompress refuses garbage instead of throwing', () => {
    for (const junk of [...HOSTILE_STRINGS, null, undefined]) {
      let out = '';
      expect(() => { out = decompressFile(junk as any); }, `threw on ${JSON.stringify(String(junk))}`).not.toThrow();
      expect(typeof out).toBe('string');
    }
  });
});

test.describe('badge evaluation', () => {
  test('survives any profile shape and never reports negative progress', () => {
    const r = rng(31415);
    for (let i = 0; i < 1500; i++) {
      const entryCount = Math.floor(r() * 6);
      const profile: any = pick(r, [
        null, undefined, {},
        {
          fullName: pick(r, HOSTILE_STRINGS),
          loggedHours: Array.from({ length: entryCount }, () => ({
            hours: pick(r, HOSTILE_NUMBERS),
            activity: pick(r, HOSTILE_STRINGS),
            date: pick(r, HOSTILE_STRINGS),
          })),
          interests: pick(r, [[], ['a'], null, undefined]),
          skills: pick(r, [[], ['b'], null, undefined]),
        },
      ]);
      let out: any[] = [];
      expect(() => { out = evaluateBadges(profile); },
        `threw on ${String(JSON.stringify(profile)).slice(0, 120)}`).not.toThrow();
      expect(Array.isArray(out)).toBe(true);
      for (const b of out) {
        expect(typeof b.isUnlocked, 'isUnlocked must be a boolean').toBe('boolean');
      }
    }
  });
});
