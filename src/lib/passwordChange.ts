/**
 * The rules for changing a password, kept separate from the form that collects it.
 *
 * There was no way to change a password at all until now. The only recovery
 * path was "Forgot password?" on the sign-in screen, which emails a reset link
 * from Firebase's own domain rather than ours — and on 27 Aug 2026 an
 * organisation we had just onboarded used it, received nothing, and told us.
 * A recovery path that depends on the mailbox is worthless to the person whose
 * mailbox is the problem, which is most of the people who need it.
 *
 * So the check here is the current password, not a second emailed code. That
 * keeps the whole flow inside the session the person is already signed in to,
 * and it is the one proof of identity that does not route through email.
 *
 * FIREBASE_MIN_PASSWORD is Firebase's own floor. Duplicating it locally is not
 * belt-and-braces: without it the server rejects a 5-character password with
 * auth/weak-password AFTER the reauthentication round trip, so the person waits
 * for a network call to be told something we knew before we made it.
 */
export const FIREBASE_MIN_PASSWORD = 6;

/**
 * @returns the message to show, or null when the input is good.
 *
 * Order matters. Emptiness is reported before length, because "Enter your
 * current password" is useful and "at least 6 characters" aimed at an empty
 * box reads as a complaint about something the person has not done yet.
 */
export function validatePasswordChange(
  current: string,
  next: string,
  confirm: string,
): string | null {
  if (!current) return 'Enter your current password.';
  if (!next) return 'Enter a new password.';
  if (!confirm) return 'Type the new password a second time to confirm it.';

  // Length is measured in code units, the same way Firebase measures it, so a
  // password of six emoji is accepted here and accepted there. Counting
  // grapheme clusters would be more correct in the abstract and would put this
  // check out of step with the service that enforces it.
  if (next.length < FIREBASE_MIN_PASSWORD) {
    return `Your new password needs to be at least ${FIREBASE_MIN_PASSWORD} characters.`;
  }
  if (next !== confirm) return 'The two new passwords do not match.';
  if (next === current) return 'Your new password is the same as your current one.';
  return null;
}
