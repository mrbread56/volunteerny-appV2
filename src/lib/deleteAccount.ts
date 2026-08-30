import { auth } from '../firebase/config';
import { API_BASE_URL } from './config';

/**
 * Delete the signed-in user's own account, profile, and everything hanging off
 * it.
 *
 * This has to be a server call. Both profile screens used to do it from the
 * browser with deleteDoc(users/{uid}) followed by
 * deleteDoc(students|organizations/{uid}), and firestore.rules refuses both:
 * `allow delete: if false` on /users, developer-only on the two profile
 * collections. The first call threw, the auth-record delete on the next line
 * never ran, and the user was shown a raw "Missing or insufficient permissions"
 * having deleted nothing — including, for students, an uploaded passport scan.
 *
 * The server also removes the records the client never even tried to: a
 * student's applications, saved opportunities and hours requests, and an
 * organization's opportunities plus the applications to them.
 *
 * `confirmEmail` is re-checked server-side; passing it is not a formality.
 */
export async function deleteOwnAccount(confirmEmail: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('You are not signed in.');

  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}/api/account/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ confirmEmail }),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    /*
     * "Not finished" rather than "not deleted", because a timeout is the
     * likeliest failure here and it is not a no-op.
     *
     * purgeAccount removes documents first and the sign-in identity last, so a
     * killed invocation leaves an account that is partly cleared and still
     * signed-in-able — and it is deliberately re-entrant, so pressing Delete
     * again finishes the job. "Your account was not deleted" told the one
     * person who could finish it that there was nothing to finish.
     */
    const partial = response.status === 504 || response.status === 502 || response.status === 500;
    throw new Error(
      result?.error ||
      (partial
        ? 'We could not finish deleting your account. Some of it may already be removed — please press Delete again to complete it.'
        : `Your account was not deleted (${response.status}).`),
    );
  }
}

/**
 * Delete an opportunity and everything that points at it.
 *
 * Server-side because the rules do not let an organization touch the
 * dependents: only the student who owns an application (or a developer) may
 * delete it, and an organization cannot even list savedOpportunities. A
 * client-side delete therefore removed the posting and left every application
 * to it stranded — unreachable by the organization and unresolvable for the
 * student. The endpoint also emails anyone whose live application it closes.
 */
export async function deleteOpportunityWithDependents(opportunityId: string): Promise<{ deleteFailures: number; uncontacted: number }> {
  const user = auth.currentUser;
  if (!user) throw new Error('You are not signed in.');

  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}/api/opportunities/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ opportunityId }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || `The opportunity was not deleted (${response.status}).`);
  }
  // deleteFailures is returned by the route and was thrown away here, so an
  // organisation was navigated back to the dashboard reading "Deleted" while
  // some applications survived the batch — pointing at an opportunity that no
  // longer exists. That is precisely the orphan state check:integrity was
  // written to DETECT, and that script is explicitly read-only.
  // uncontacted for the same reason: the route can only email a bounded number
  // of applicants inside one serverless invocation, and the organisation is the
  // only party who can reach the rest.
  return {
    deleteFailures: Number(result?.deleteFailures) || 0,
    uncontacted: Number(result?.uncontacted) || 0,
  };
}
