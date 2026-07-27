/**
 * Single source of truth for "is this email an authorized developer?".
 *
 * This check used to be copy-pasted across App.tsx, Navbar.tsx, AuthContext.tsx
 * and DeveloperDashboard.tsx in two different flavours:
 *
 *   (env || '').includes(user.email)              // substring match on the raw CSV
 *   (env || '').split(',').map(trim).includes(e)  // exact, case-sensitive
 *
 * Both were wrong in ways that produced the "logged in but the navbar is stuck
 * on Security Verification" bug:
 *
 *   - Substring matching means "a@b.com" also matches the entry "aa@b.com",
 *     and an empty VITE_DEVELOPER_EMAILS makes ''.includes('') return true.
 *   - Both were case-sensitive. Google returns the address as the provider has
 *     it, so "Kia@gmail.com" in .env never matched "kia@gmail.com" from the
 *     token, and the developer silently lost their role.
 *
 * IMPORTANT DEPLOYMENT NOTE: VITE_* variables are inlined at BUILD time, not
 * read at runtime. VITE_DEVELOPER_EMAILS must be present in the build
 * environment (e.g. the Vercel project's Environment Variables) or every call
 * below returns false in production even though it works locally from .env.
 */

/** Parsed, normalized allowlist. Empty when the env var is unset. */
export const AUTHORIZED_DEV_EMAILS: string[] = (import.meta.env.VITE_DEVELOPER_EMAILS || '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

/** True when `email` is an exact (case-insensitive) match for an allowlisted developer. */
export function isDeveloperEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return AUTHORIZED_DEV_EMAILS.includes(email.trim().toLowerCase());
}

/** True when the developer allowlist is missing entirely (usually a deploy misconfiguration). */
export function isDevAllowlistMissing(): boolean {
  return AUTHORIZED_DEV_EMAILS.length === 0;
}
