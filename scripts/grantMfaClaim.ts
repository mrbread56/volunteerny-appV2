/**
 * Give a signed-in test account the MFA claim a real session would carry.
 *
 * firestore.rules now enforces two-factor on writes (mfaSatisfied()), so an
 * account with twoFactorEnabled — which every organization has, because 2FA is
 * mandatory for them — cannot write until it has passed a code. Real
 * organizations do: the guard routes them to /mfa and /api/auth/verify-otp
 * stamps the claim. The check harnesses signed in with a password and went
 * straight to writing, which the rules correctly refuse.
 *
 * Rather than weaken the rule or exempt the fixtures, this makes the harness
 * model the real thing: read auth_time out of the token that was just minted,
 * stamp the claim to exactly that sign-in, then force a refresh so the new
 * token carries it. That is precisely what verify-otp does in production.
 */
export async function grantMfaClaim(adminApp: any, user: any): Promise<void> {
  // auth_time comes from the token Firebase just issued for THIS sign-in, so
  // the claim is pinned to the session rather than to a wall clock.
  const before = await user.getIdTokenResult();
  const authTime = Number(before.claims.auth_time);
  if (!Number.isFinite(authTime)) {
    throw new Error('grantMfaClaim: the token carried no usable auth_time');
  }

  const existing = (await adminApp.auth().getUser(user.uid)).customClaims || {};
  await adminApp.auth().setCustomUserClaims(user.uid, {
    ...existing,
    mfaVerified: true,
    mfaVerifiedFor: authTime,
    mfaVerifiedAt: Date.now(),
  });

  // Force a refresh so the very next write carries the claim. Without this the
  // client keeps the old token for up to an hour and every write is denied for
  // a reason that looks nothing like the cause.
  await user.getIdToken(true);
}
