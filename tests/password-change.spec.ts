import { test, expect } from '@playwright/test';
import { validatePasswordChange, FIREBASE_MIN_PASSWORD } from '../src/lib/passwordChange';

/**
 * The rules behind the change-password box.
 *
 * This validator is the only thing standing between a person and a round trip
 * to Firebase, so every rejection it gets wrong is either a confusing error
 * after a network wait or a password change that should not have been allowed.
 * The order of the checks is part of the contract and is pinned below: an empty
 * field must be reported as empty, never as too short.
 */

const OK = 'correct-horse-battery';

// ───────────── the happy path ─────────────

test.describe('accepting a good change', () => {
  test('returns null when everything is in order', () => {
    expect(validatePasswordChange('old-one', OK, OK)).toBeNull();
  });

  test('exactly the minimum length is accepted, not rejected', () => {
    // An off-by-one here rejects a password Firebase would have taken.
    const six = 'a'.repeat(FIREBASE_MIN_PASSWORD);
    expect(six).toHaveLength(6);
    expect(validatePasswordChange('old', six, six)).toBeNull();
  });

  test('a long password is not capped', () => {
    const long = 'z'.repeat(4096);
    expect(validatePasswordChange('old', long, long)).toBeNull();
  });

  test('spaces, unicode and punctuation are all allowed inside a password', () => {
    for (const p of [
      'two words here',
      '  leading and trailing  ',
      'mot de passe francais',
      'пароль пароль',
      'パスワードです',
      '🔐🔐🔐🔐🔐🔐',
      '!@#$%^&*()_+-=[]{}|;:,.<>?',
      'tab\tseparated',
      'new\nline',
      'quote and "double"',
      '\\backslash\\',
    ]) {
      expect(validatePasswordChange('different', p, p)).toBeNull();
    }
  });
});

// ───────────── empty fields, and the order they are reported in ─────────────

test.describe('missing fields', () => {
  test('an empty current password is named first', () => {
    expect(validatePasswordChange('', OK, OK)).toBe('Enter your current password.');
  });

  test('an empty new password is named before the confirmation', () => {
    expect(validatePasswordChange('old', '', '')).toBe('Enter a new password.');
  });

  test('an empty confirmation is named on its own', () => {
    expect(validatePasswordChange('old', OK, '')).toBe(
      'Type the new password a second time to confirm it.');
  });

  test('all three empty reports the current password, not a pile of errors', () => {
    expect(validatePasswordChange('', '', '')).toBe('Enter your current password.');
  });

  test('emptiness outranks shortness', () => {
    // "at least 6 characters" aimed at an empty box reads as a complaint about
    // something the person has not done yet.
    expect(validatePasswordChange('old', '', 'abc')).toBe('Enter a new password.');
    expect(validatePasswordChange('', 'ab', 'ab')).toBe('Enter your current password.');
  });
});

// ───────────── length ─────────────

test.describe('length', () => {
  test('every length below the minimum is rejected', () => {
    for (let n = 1; n < FIREBASE_MIN_PASSWORD; n++) {
      const short = 'a'.repeat(n);
      expect(validatePasswordChange('old', short, short))
        .toBe('Your new password needs to be at least 6 characters.');
    }
  });

  test('every length at or above the minimum passes the length check', () => {
    for (let n = FIREBASE_MIN_PASSWORD; n <= 40; n++) {
      const p = 'a'.repeat(n);
      expect(validatePasswordChange('old', p, p)).toBeNull();
    }
  });

  test('the message names the real number, so the two cannot drift apart', () => {
    const msg = validatePasswordChange('old', 'ab', 'ab');
    expect(msg).toContain(String(FIREBASE_MIN_PASSWORD));
  });

  test('length is measured the way Firebase measures it, in code units', () => {
    // Three astral emoji are six code units. Firebase accepts that, so we must
    // too — counting visible characters here would reject a password the
    // service is about to allow.
    const emoji = '😀😀😀';
    expect(emoji.length).toBe(6);
    expect(validatePasswordChange('old', emoji, emoji)).toBeNull();
  });

  test('whitespace counts toward the length rather than being trimmed away', () => {
    // Trimming would change the password behind the person's back: they would
    // set "abc   " and later be unable to sign in with it.
    expect(validatePasswordChange('old', 'abc   ', 'abc   ')).toBeNull();
  });
});

// ───────────── mismatch ─────────────

test.describe('confirmation mismatch', () => {
  test('a plain mismatch is caught', () => {
    expect(validatePasswordChange('old', 'abcdef', 'abcdeg'))
      .toBe('The two new passwords do not match.');
  });

  test('the comparison is case sensitive', () => {
    expect(validatePasswordChange('old', 'Password1', 'password1'))
      .toBe('The two new passwords do not match.');
  });

  test('a trailing space is a mismatch, not a near miss', () => {
    expect(validatePasswordChange('old', 'abcdef', 'abcdef '))
      .toBe('The two new passwords do not match.');
  });

  test('unicode that looks alike but is not is still a mismatch', () => {
    // Cyrillic а vs Latin a.
    expect(validatePasswordChange('old', 'pаssword', 'password'))
      .toBe('The two new passwords do not match.');
  });

  test('length is checked before the mismatch', () => {
    // Otherwise someone fixing a typo is told about the typo, fixes it, and is
    // only then told the password was too short all along.
    expect(validatePasswordChange('old', 'ab', 'xy'))
      .toBe('Your new password needs to be at least 6 characters.');
  });
});

// ───────────── reuse ─────────────

test.describe('reusing the current password', () => {
  test('setting the same password again is rejected', () => {
    expect(validatePasswordChange(OK, OK, OK))
      .toBe('Your new password is the same as your current one.');
  });

  test('a one character difference is enough to count as a change', () => {
    expect(validatePasswordChange('abcdef', 'abcdeg', 'abcdeg')).toBeNull();
  });

  test('reuse is checked last, after length and matching', () => {
    // A short reused password should be reported as short: that is the problem
    // the person has to fix first.
    expect(validatePasswordChange('abc', 'abc', 'abc'))
      .toBe('Your new password needs to be at least 6 characters.');
  });

  test('case makes it a different password', () => {
    expect(validatePasswordChange('abcdef', 'ABCDEF', 'ABCDEF')).toBeNull();
  });
});

// ───────────── properties that must hold for any input ─────────────

test.describe('properties over generated input', () => {
  // A tiny deterministic PRNG. Random test data that changes between runs gives
  // failures nobody can reproduce.
  const rnd = (seed: number) => {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  };

  test('never throws, whatever it is handed (400 cases)', () => {
    const next = rnd(20260827);
    const alphabet = 'abcXYZ019 !é😀\t\n\\"';
    const pick = () => {
      const n = Math.floor(next() * 12);
      let out = '';
      for (let i = 0; i < n; i++) out += alphabet[Math.floor(next() * alphabet.length)];
      return out;
    };
    for (let i = 0; i < 400; i++) {
      const a = pick(), b = pick(), c = pick();
      expect(() => validatePasswordChange(a, b, c)).not.toThrow();
    }
  });

  test('the result is always null or a non-empty sentence (400 cases)', () => {
    const next = rnd(7);
    const alphabet = 'ab😀 ';
    const pick = () => {
      const n = Math.floor(next() * 10);
      let out = '';
      for (let i = 0; i < n; i++) out += alphabet[Math.floor(next() * alphabet.length)];
      return out;
    };
    for (let i = 0; i < 400; i++) {
      const r = validatePasswordChange(pick(), pick(), pick());
      if (r !== null) {
        expect(typeof r).toBe('string');
        expect(r.length).toBeGreaterThan(0);
        // A message shown to a person ends like a sentence.
        expect(r.endsWith('.')).toBe(true);
        // It must never echo the password back into the UI.
        expect(r).not.toContain('😀');
      }
    }
  });

  test('accepting implies all four conditions held (300 cases)', () => {
    const next = rnd(99);
    const pick = () => 'abcdefgh'.slice(0, Math.floor(next() * 9));
    for (let i = 0; i < 300; i++) {
      const cur = pick(), nw = pick(), cf = pick();
      if (validatePasswordChange(cur, nw, cf) === null) {
        expect(cur).not.toBe('');
        expect(nw.length).toBeGreaterThanOrEqual(FIREBASE_MIN_PASSWORD);
        expect(nw).toBe(cf);
        expect(nw).not.toBe(cur);
      }
    }
  });

  test('it is a pure function: same input, same answer', () => {
    const cases: Array<[string, string, string]> = [
      ['a', 'bbbbbb', 'bbbbbb'],
      ['', '', ''],
      ['x', 'y', 'z'],
    ];
    for (const [a, b, c] of cases) {
      const first = validatePasswordChange(a, b, c);
      for (let i = 0; i < 50; i++) {
        expect(validatePasswordChange(a, b, c)).toBe(first);
      }
    }
  });

  test('it does not mutate or depend on anything outside its arguments', () => {
    const before = validatePasswordChange('old', 'abcdef', 'abcdef');
    validatePasswordChange('', '', '');
    validatePasswordChange('zzz', 'a', 'b');
    expect(validatePasswordChange('old', 'abcdef', 'abcdef')).toBe(before);
  });
});
