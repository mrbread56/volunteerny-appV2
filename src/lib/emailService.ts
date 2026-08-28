/**
 * Client-side interface to coordinate transactional template-based email delivery
 * via our secure Express.js Resend backend.
 */
import { auth } from '../firebase/config';
import { API_BASE_URL } from '../lib/config';

export interface EmailPayload {
  to: string | string[];
  subject: string;
  templateName:
    | 'welcome_student'
    | 'application_status'
    | 'hours_confirmation'
    | 'new_applicant'
    | 'applicant_withdrew'
    // 'auth_verification' and 'admin_alert' are server-internal: the send
    // endpoint answers 403 for both, so listing them here would only let
    // TypeScript bless a call that always fails. See CLIENT_TEMPLATES in
    // server.ts for why they are not client-selectable.
    | 'notification';
  templateData: {
    studentName?: string;
    oppTitle?: string;
    orgName?: string;
    status?: 'accepted' | 'rejected' | 'pending';
    note?: string;
    hours?: number;
    supervisorName?: string;
    applicantName?: string;
    message?: string;
    userName?: string;
    code?: string;
    purpose?: 'verification' | 'reset';
    subject?: string;
    heading?: string;
    details?: string;
    actionLabel?: string;
    actionUrl?: string;
    [key: string]: any;
  };
}

/**
 * Tell an applicant what an organization decided about them.
 *
 * Use this instead of composing the mail here. The browser cannot resolve a
 * student's email address at all — firestore.rules allows reading
 * users/{studentId} only to that student or a developer — so the organization
 * screens that tried it got permission-denied, swallowed it, and mailed the
 * literal fallback string "student@example.com" while telling the organization
 * the applicant had been notified. The server looks the address up with the
 * Admin SDK, checks this caller owns the opportunity, sends the mail, and never
 * returns the address.
 */
export async function notifyApplicant(args: {
  applicationId: string;
  status: 'accepted' | 'rejected' | 'terminated' | 'waitlist_promoted';
  reason?: string;
  note?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    let token: string | null = null;
    const user = auth.currentUser;
    if (user) token = await user.getIdToken();
    if (!token) {
      const demoRole = localStorage.getItem('demo_mode_role');
      if (demoRole) token = `demo-mode-token-${demoRole}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/applications/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(args),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      return { success: false, error: result?.error || `Request failed (${response.status})` };
    }
    return { success: !!result?.success };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Dispatches a transaction email trigger request to the secure backend server.
 */
export async function sendTransactionalEmail(payload: EmailPayload): Promise<{ success: boolean; mode?: string; error?: string }> {
  try {
    let token = null;
    try {
      const user = auth.currentUser;
      if (user) {
        token = await user.getIdToken();
      }
    } catch (e) {
      console.warn('[EmailService] Failed to fetch active Firebase ID Token:', e);
    }

    if (!token) {
      const demoRole = localStorage.getItem('demo_mode_role');
      if (demoRole) {
        token = `demo-mode-token-${demoRole}`;
      }
    }

    const response = await fetch(`${API_BASE_URL}/api/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      console.warn('[EmailService Client] Express backend error response:', errorMsg);
      try {
        const parsed = JSON.parse(errorMsg);
        return { success: false, error: parsed.details || parsed.error || errorMsg };
      } catch (e) {
        return { success: false, error: errorMsg };
      }
    }

    const result = await response.json();
    return {
      success: !!result.success,
      mode: result.mode,
      error: result.details || result.warning
    };
  } catch (err: any) {
    console.warn('[EmailService Client] Failed to reach email API endpoint:', err);
    return {
      success: false,
      error: err?.message || String(err)
    };
  }
}

export interface ApplicantContact {
  applicationId: string;
  studentId: string;
  studentName: string;
  status: string;
  email: string | null;
}

/**
 * Contact details for everyone who applied to one of your opportunities.
 *
 * The browser cannot read `users/{uid}` for anyone but its owner, so these come
 * from the server, which checks the caller owns the opportunity first. Used to
 * build plain `mailto:` links — the organization writes the message in their own
 * mail client, so nothing here composes a subject or a body.
 */
export async function fetchApplicantContacts(opportunityId: string): Promise<ApplicantContact[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const token = await user.getIdToken();
  const response = await fetch(
    `${API_BASE_URL}/api/opportunities/${encodeURIComponent(opportunityId)}/applicant-contacts`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Could not load contact details (${response.status}).`);
  }
  const result = await response.json().catch(() => null);
  return Array.isArray(result?.contacts) ? result.contacts : [];
}
