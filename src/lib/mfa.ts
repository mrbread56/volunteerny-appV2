export function verifyMfaClaim(
  user: any,
  userProfile: any,
  mfaVerified: boolean
): boolean {
  if (!user) return false;
  // If userProfile is missing (e.g., fetch failed), still trust mfaVerified
  if (!userProfile) return !!mfaVerified;
  
  if (userProfile.twoFactorEnabled === false) {
    return true; // Bypass/Banned/Disabled check
  }
  return !!mfaVerified;
}
