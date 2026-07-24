/**
 * Google Gmail REST API integrations & formatting utilities
 */

export interface SentEmailLog {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
}

/**
 * Encodes string to Base64URL (RFC 4648 Section 5) format required by Gmail API
 */
function base64urlEncode(str: string): string {
  // Use UTF-8 and base64 escaping for safety with special chars
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < utf8Bytes.byteLength; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  const base64 = btoa(binary);
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Sends an email using the Gmail REST API with permission of the authenticated user.
 */
export async function sendGmailNotification(
  accessToken: string,
  to: string,
  subject: string,
  bodyHtml: string
): Promise<{ success: boolean; error?: string }> {
  // If in demo mode or using dummy tokens, simulate and append to sent logs
  const isDemo = accessToken === "demo-gmail-token-123456" || accessToken.startsWith("demo-");
  
  if (isDemo) {
    const logs: SentEmailLog[] = JSON.parse(localStorage.getItem('demo_sent_emails') || '[]');
    const newLog: SentEmailLog = {
      id: "email-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
      to,
      subject,
      body: bodyHtml,
      sentAt: new Date().toISOString()
    };
    logs.unshift(newLog);
    localStorage.setItem('demo_sent_emails', JSON.stringify(logs));
    return { success: true };
  }

  try {
    const emailParts = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      bodyHtml
    ];
    const emailContent = emailParts.join('\r\n');
    const raw = base64urlEncode(emailContent);

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gmail API Error response:', errText);
      return { success: false, error: errText };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Failed to send mail via Gmail API:', error);
    return { success: false, error: error?.message || String(error) };
  }
}
