import { auth } from '../firebase/config';
import { API_BASE_URL } from './config';

/**
 * Credit a student with approved volunteer hours.
 *
 * This used to be an updateDoc straight from the browser, which meant the
 * security rules were the only thing standing between an organization account
 * and every student's record — and they could not do the job. hasOnly()
 * restricts which fields may be written, never whose document they are written
 * to, so any organization could credit or erase any student's hours. The
 * relationship check ("did this student actually volunteer with us?") needs a
 * query across applications and opportunities, which rules cannot express, so
 * the authority moved to the server's Admin SDK.
 *
 * Resolves with the student's new total. Rejects with a message safe to show
 * the organization — the caller is expected to surface it rather than swallow
 * it, which is the mistake this codebase kept making.
 */
export async function approveStudentHours(input: {
  studentId: string;
  hours: number;
  activity?: string;
  date?: string;
  /** Set when approving a pending hoursRequest, so the server can settle it in the same transaction. */
  requestId?: string;
}): Promise<{ hours: number; entryId?: string; demo?: boolean }> {
  const user = auth.currentUser;
  let token: string | null = user ? await user.getIdToken() : null;
  if (!token) {
    const demoRole = localStorage.getItem('demo_mode_role');
    if (demoRole) token = `demo-mode-token-${demoRole}`;
  }
  if (!token) throw new Error('You are signed out. Please sign in again.');

  const res = await fetch(`${API_BASE_URL}/api/hours/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    throw new Error(body?.error || 'Could not credit the hours. Please try again.');
  }
  return { hours: body.hours ?? 0, entryId: body.entryId, demo: body.demo };
}
