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
