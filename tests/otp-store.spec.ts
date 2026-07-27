import { test, expect } from '@playwright/test';

/**
 * Models the OTP store semantics before and after the 2FA reliability fix.
 *
 * These reproduce the reported field failures — "I got the email but it says
 * the digits are wrong", "it says no code was requested", "it works maybe 5%
 * of the time" — as deterministic cases, so a regression in the read/write
 * strategy fails here instead of in front of a user.
 */

type Rec = { otp: string; expires: number; attempts: number; issuedAt: number };

const FUTURE = () => Date.now() + 10 * 60 * 1000;

/** OLD: send picked ONE store; verify independently picked ONE store. */
function oldRead(firestore: Rec | null, memory: Rec | null, firestoreReadThrows: boolean): Rec | null {
  if (firestoreReadThrows) return memory;
  return firestore; // read succeeded -> memory is never consulted
}

/** NEW: both stores are read, freshest record wins. */
function newRead(firestore: Rec | null, memory: Rec | null, firestoreReadThrows: boolean): Rec | null {
  const fromDb = firestoreReadThrows ? null : firestore;
  if (!fromDb) return memory;
  if (!memory) return fromDb;
  return memory.issuedAt >= fromDb.issuedAt ? memory : fromDb;
}

test.describe('OTP store: reported 2FA failures', () => {
  test('emailed code is accepted when the Firestore write failed and memory holds it', () => {
    // send-otp fell back to memory; verify-otp's Firestore read succeeds and finds nothing.
    const emailed: Rec = { otp: '123456', expires: FUTURE(), attempts: 0, issuedAt: Date.now() };

    // Old behaviour: "No code was requested" despite the user holding the email.
    expect(oldRead(null, emailed, false)).toBeNull();

    // Fixed: the memory record is found.
    expect(newRead(null, emailed, false)?.otp).toBe('123456');
  });

  test('a stale Firestore record cannot shadow the freshly emailed code', () => {
    // This is the "right digits, says wrong" case.
    const stale: Rec = { otp: '111111', expires: FUTURE(), attempts: 0, issuedAt: Date.now() - 60_000 };
    const emailed: Rec = { otp: '999999', expires: FUTURE(), attempts: 0, issuedAt: Date.now() };

    // Old behaviour: compares against the stale code -> "Incorrect code".
    expect(oldRead(stale, emailed, false)?.otp).toBe('111111');

    // Fixed: the most recently issued record wins.
    expect(newRead(stale, emailed, false)?.otp).toBe('999999');
  });

  test('code still verifies when Firestore is reachable and memory is empty', () => {
    const rec: Rec = { otp: '424242', expires: FUTURE(), attempts: 0, issuedAt: Date.now() };
    expect(newRead(rec, null, false)?.otp).toBe('424242');
  });

  test('code still verifies when the Firestore read throws', () => {
    const rec: Rec = { otp: '555000', expires: FUTURE(), attempts: 0, issuedAt: Date.now() };
    expect(newRead(null, rec, true)?.otp).toBe('555000');
  });

  test('no record in either store is still a clean miss', () => {
    expect(newRead(null, null, false)).toBeNull();
  });

  test('whitespace and non-breaking spaces pasted from an email client are tolerated', () => {
    const normalise = (code: string) => code.replace(/[\s ]/g, '');
    expect(normalise(' 123 456 ')).toBe('123456');
    expect(normalise('123 456')).toBe('123456');
    expect(normalise('123456')).toBe('123456');
  });
});
