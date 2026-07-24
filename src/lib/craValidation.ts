/**
 * Validation for CRA (Canada Revenue Agency) charity registration numbers.
 *
 * A registered charity's number looks like:  118833011RR0001
 *   - 9 digits   : the CRA Business Number (BN9)
 *   - 2 letters  : the program identifier. Registered charities are always "RR".
 *   - 4 digits   : the reference/account number for that program.
 *
 * WHAT THIS DOES
 * Rejects malformed input and obvious filler (all-same digits, sequential
 * runs, all zeroes). The previous check accepted any 2 letters, so
 * "000000000AA0000" passed and the org was stored as craVerified: true.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * There is no local checksum here. The CRA Business Number's check-digit
 * scheme could not be confirmed against known-good registration numbers during
 * implementation, and a checksum that rejects legitimate charities is worse
 * than no checksum at all - it locks real organizations out of the platform
 * while a determined bad actor simply types a number that passes.
 *
 * THIS IS NOT VERIFICATION. Passing this check means the input is well-formed.
 * It does not mean the number belongs to a real registered charity, and it
 * does not mean the person entering it represents that charity. Real
 * verification requires checking the number against the CRA's public charity
 * registry and confirming the applicant controls that organization. Never gate
 * trust UI on this function alone.
 */

/** Rejects filler patterns that are structurally valid but obviously not real. */
function isObviousFiller(bn9: string): boolean {
  if (/^(\d)\1{8}$/.test(bn9)) return true;        // 000000000, 111111111, ...
  if (bn9 === '123456789' || bn9 === '987654321') return true;
  return false;
}

/** True when the 9-digit CRA Business Number is well-formed and not filler. */
export function isValidBusinessNumber(bn9: string): boolean {
  if (!/^\d{9}$/.test(bn9)) return false;
  if (isObviousFiller(bn9)) return false;
  return true;
}

/**
 * Full charity registration number check: BN9 + "RR" + 4-digit reference.
 * Note "RR" specifically - registered charities always use the RR program
 * identifier, so accepting any two letters (as the old check did) let through
 * numbers that could not be charity registrations.
 */
export function isPlausibleCraNumber(raw: string): boolean {
  const clean = normalizeCraNumber(raw);
  const match = /^(\d{9})RR(\d{4})$/.exec(clean);
  if (!match) return false;
  return isValidBusinessNumber(match[1]);
}

/** Normalises user input into the canonical stored form. */
export function normalizeCraNumber(raw: string): string {
  return (raw || '').replace(/[\s-]/g, '').toUpperCase();
}
