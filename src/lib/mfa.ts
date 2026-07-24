export function verifyMfaClaim(
  user: any,
  userProfile: any,
  mfaVerified: boolean
): boolean {
  // 1. Strict Firebase Auth Status Check
  if (!user) return false;

  // 2. Strict User Profile Check
  if (!userProfile) return false;

  // 3. Multi-Factor Authentication (MFA / 2FA) Challenge flow verification
  if (userProfile.twoFactorEnabled === false) {
    return true; // Bypass/Banned/Disabled check
  }

  return !!mfaVerified;
}
