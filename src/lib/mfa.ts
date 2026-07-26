/**
 * Returns true if the user should be treated as MFA-verified for this session.
 *
 * Precedence:
 *   1. No user  -> false.
 *   2. Profile present with twoFactorEnabled === false -> true (MFA disabled).
 *   3. Otherwise -> trust the `mfaVerified` flag from AuthContext, which is
 *      itself sourced from the ID token's `mfaVerified` custom claim (set by
 *      /api/auth/verify-otp) or the short-lived `mfaFallbackClaim` localStorage
 *      flag used when the server couldn't set the claim.
 *
 * When userProfile is null (fetch failed OR the profile document was deleted),
 * we deliberately fall through to the mfaVerified check rather than defaulting
 * to "MFA required" — the auth-token claim is the source of truth, and using
 * only that here means PrivateRoute's separate `profileMissing` branch is what
 * shows the recovery UI, not an infinite /mfa redirect.
 */
export function verifyMfaClaim(
  user: unknown,
  userProfile: { twoFactorEnabled?: boolean } | null | undefined,
  mfaVerified: boolean
): boolean {
  if (!user) return false;
  if (userProfile && userProfile.twoFactorEnabled === false) return true;
  return !!mfaVerified;
}
