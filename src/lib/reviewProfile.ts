import { auth } from '../firebase/config';
import { API_BASE_URL } from './config';
import type { StudentProfile } from '../types';

/**
 * Load the slice of a student's profile an organization may see while
 * reviewing their application.
 *
 * This used to be a getDoc straight from the browser, guarded only by a rule
 * that let ANY account with role == 'organization' read ANY student document —
 * and those documents carry resumeUrl and passportUrl, whole identity
 * documents inline, for students who are mostly minors. The relationship check
 * ("has this student applied to one of our opportunities?") is a query, which
 * rules cannot express, so it moved to the server.
 *
 * The response is an allow-list and passportUrl is not in it: no
 * organization-facing screen ever showed it.
 *
 * Returns null when the caller is not entitled to the profile, so a refusal
 * degrades to "no extra detail" rather than breaking the review screen — the
 * application itself already carries the applicant's name.
 */
export async function fetchReviewProfile(studentId: string): Promise<StudentProfile | null> {
  const user = auth.currentUser;
  let token: string | null = user ? await user.getIdToken() : null;
  if (!token) {
    const demoRole = localStorage.getItem('demo_mode_role');
    if (demoRole) token = `demo-mode-token-${demoRole}`;
  }
  if (!token) return null;

  const res = await fetch(
    `${API_BASE_URL}/api/students/${encodeURIComponent(studentId)}/review-profile`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    console.warn(`[reviewProfile] ${studentId} → ${res.status}`);
    return null;
  }
  const body = await res.json().catch(() => ({} as any));
  return (body?.profile as StudentProfile) ?? null;
}
