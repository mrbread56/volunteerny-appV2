export function verifyMfaClaim(
  user: any,
  userProfile: any,
  mfaVerified: boolean
): boolean {
  if (!user) return false;
  // If userProfile is missing (e.g., fetch failed), still trust mfaVerified
  if (!userProfile) return !!mfaVerified;

  /*
   * Only a STUDENT may be exempt, and only explicitly.
   *
   * This returned true for any role carrying twoFactorEnabled === false, while
   * firestore.rules now requires a current claim from every non-student. Two
   * layers disagreeing about who needs a code is how someone gets challenged by
   * neither, or by one and refused by the other — so this mirrors the rule
   * exactly: organisations and developers always need the claim, whatever their
   * document says, because the rules refuse to let them turn it off anyway.
   */
  if (userProfile.twoFactorEnabled === false && userProfile.role === 'student') {
    return true;
  }
  return !!mfaVerified;
}

/**
 * Is the MFA claim on this token good for the sign-in that produced it?
 *
 * Custom claims are stored on the Firebase Auth user record, not on a session,
 * so `mfaVerified: true` alone is permanent — pass one code and you are never
 * challenged again, on any device. That made the settings screen's promise of
 * a code "every time you log back in" false in production.
 *
 * /api/auth/verify-otp therefore stamps the claim with `mfaVerifiedFor`, the
 * `auth_time` of the token that passed the challenge. Both values below are
 * read from the SAME signed token, so this is an exact equality test with no
 * clock involved — nothing to skew, no grace window to tune, and no way to
 * widen it by nudging a client clock.
 *
 * auth_time changes only when the user genuinely authenticates. It survives the
 * silent hourly token refresh, so a long session is not interrupted, and it
 * survives Firebase's default `local` persistence, so closing the tab and
 * returning to a live session is not a new sign-in and is not re-challenged.
 * Signing out and back in mints a new auth_time and closes the gate.
 *
 * Accounts verified before this shipped carry `mfaVerified` with no
 * `mfaVerifiedFor`. They fail here, which is the point: they were never
 * actually challenged per sign-in, and now they will be.
 */
export function isMfaClaimCurrent(tokenResult: { claims: Record<string, any> } | null | undefined): boolean {
  const claims = tokenResult?.claims;
  if (!claims) return false;

  // The support escape hatch, granted only by scripts/grant-mfa.ts with the
  // service account key in hand. Two-factor is mandatory for organizations and
  // the code arrives by email, so a bouncing address or an aggressive school
  // filter locks an organization out of its own dashboard with no self-service
  // way back. RUNBOOK step 3 covers that case.
  //
  // The window is measured against auth_time — when Firebase says the sign-in
  // happened — and NOT against the browser's clock, which the person being let
  // in controls. Any sign-in that BEGINS before the deadline is exempt for its
  // whole session; the next one after the deadline is challenged again. So the
  // grant survives the "sign out and back in" the runbook asks for, and still
  // expires on its own.
  const authTimeRaw = Number(claims.auth_time);
  if (!Number.isFinite(authTimeRaw)) return false;
  const grace = Number(claims.mfaGraceUntil);
  if (Number.isFinite(grace) && authTimeRaw < grace) return true;

  if (claims.mfaVerified !== true) return false;
  // Both stamps are compared as numbers rather than by identity.
  //
  // auth_time is a number at runtime, but the Firebase SDK's ParsedToken type
  // declares it as a string, so the two disagree and either could be what
  // arrives. A strict typeof check would be correct today and, the moment that
  // representation changed, would reject every token and pin every account on
  // /mfa permanently. There is no matching risk in the other direction: this
  // claim is inside a token signed by Google, so its value is not attacker-
  // controlled and widening the accepted spelling grants nothing.
  const stamped = Number(claims.mfaVerifiedFor);
  return Number.isFinite(stamped) && stamped === authTimeRaw;
}
