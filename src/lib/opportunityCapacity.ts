import { auth } from '../firebase/config';
import { API_BASE_URL } from './config';

/**
 * How many volunteers an opportunity has already accepted.
 *
 * This deliberately does not query Firestore. Counting accepted applications
 * means reading other students' application documents, and the security rules
 * refuse that — correctly, since those records carry names, messages and resume
 * links. The server counts with the Admin SDK and returns only the integer.
 *
 * Throws on failure so the caller can decide; the apply flow treats a failure
 * as "capacity unknown" and applies as pending rather than blocking.
 */
export async function fetchAcceptedCount(opportunityId: string): Promise<number> {
  const user = auth.currentUser;
  let token: string | null = user ? await user.getIdToken() : null;
  if (!token) {
    const demoRole = localStorage.getItem('demo_mode_role');
    if (demoRole) token = `demo-mode-token-${demoRole}`;
  }
  if (!token) throw new Error('Not signed in');

  const res = await fetch(
    `${API_BASE_URL}/api/opportunities/${encodeURIComponent(opportunityId)}/accepted-count`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`accepted-count failed: ${res.status}`);

  const body = await res.json();
  // A malformed body must not silently read as 0 and hand out a place that
  // isn't there.
  if (typeof body?.acceptedCount !== 'number') throw new Error('Malformed capacity response');
  return body.acceptedCount;
}

/**
 * Refuse an accept that would put the posting over its cap.
 *
 * Returns a message to show the coordinator, or null when there is room.
 *
 * maxVolunteers existed on the posting, was bounds-checked in firestore.rules,
 * was rendered as "3 of 5 places filled" on the applicants page -- and was
 * enforced NOWHERE. fetchAcceptedCount above had exactly one caller, the
 * student's apply page, where it only chooses between `pending` and `waitlist`.
 * Both places a human clicks Accept wrote the status with no count at all, and
 * the Accept button is rendered for waitlisted rows too, so the coordinator's
 * most natural action -- promoting someone by hand -- was also the one that
 * overfilled.
 *
 * Overfilling is not self-correcting. promoteWaitlistedApplicant refuses to
 * promote once accepted >= maxVolunteers, so going one over permanently freezes
 * the waitlist behind that posting: nobody is ever promoted again, silently.
 *
 * It therefore fails CLOSED. If the count cannot be fetched the accept is
 * refused, because handing out a place that may not exist costs a student a
 * wasted trip and costs the posting its waitlist, while a refusal costs one
 * retry. This is the opposite of the apply path, which treats an unknown count
 * as "apply as pending" -- correctly, since there the cost of failing closed
 * would be a student unable to apply at all.
 *
 * Firestore cannot do this in rules (it is a cross-document count) and there is
 * no server route for accept/reject, so the count comes from the server via
 * fetchAcceptedCount while the decision stays here. That leaves a narrow race
 * between two coordinators clicking at the same instant on the same posting;
 * closing it needs an accept endpoint with a transaction.
 */
export async function capacityRefusal(
  opportunityId: string,
  maxVolunteers: number | null | undefined,
): Promise<string | null> {
  // Blank or zero means uncapped, which is how the create form treats an empty
  // field and how waitlistService already reads it.
  const max = Number(maxVolunteers) || 0;
  if (max <= 0) return null;

  let accepted: number;
  try {
    accepted = await fetchAcceptedCount(opportunityId);
  } catch (err) {
    console.error('[capacity] could not check remaining places:', err);
    return 'We could not check how many places are left on this opportunity. Please try again in a moment.';
  }

  if (accepted >= max) {
    return `This opportunity is full. ${accepted} of ${max} place${max === 1 ? '' : 's'} ` +
      'are taken, so accepting another would put you over the limit you set. ' +
      'Terminate a placement first, or raise the volunteer limit on the posting.';
  }
  return null;
}
