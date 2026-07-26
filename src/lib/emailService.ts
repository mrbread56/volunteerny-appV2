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
    | 'auth_verification'
    | 'admin_alert';
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
    details?: string;
    [key: string]: any;
  };
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
