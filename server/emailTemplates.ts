/**
 * Modern, responsive templates for Volunteer North York
 * Crafted with clean typography, elegant negative space, and a refined professional layout.
 */

interface BaseTemplateProps {
  title: string;
  previewText?: string;
  children: string;
}

/**
 * Escapes user-controlled strings before they're interpolated into HTML
 * email templates. Without this, a student's name, an org's mission text,
 * an application message, etc. could inject arbitrary HTML/links into an
 * email sent to someone else (stored HTML injection).
 */
function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BRAND_NAME = "Volunteer North York";
const BRAND_URL = process.env.APP_URL || "https://volunteernorthyork.indevs.in";
const BRAND_COLOR = "#2563eb"; // Modern Blue 600
const TEXT_COLOR = "#334155"; // Slate 700
const BG_COLOR = "#f8fafc"; // Slate 50

/**
 * Wraps HTML content in a pristine, responsive email wrapper with high-contrast layouts.
 */
function wrapBaseTemplate({ title, previewText = "", children }: BaseTemplateProps): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      background-color: ${BG_COLOR};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: ${TEXT_COLOR};
      -webkit-font-smoothing: antialiased;
    }
    table {
      border-collapse: collapse;
    }
    td {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    img {
      border: 0;
      outline: none;
      text-decoration: none;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: ${BG_COLOR};
      padding-top: 32px;
      padding-bottom: 48px;
    }
    .content-box {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03);
    }
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
      padding: 36px 32px;
      text-align: left;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.025em;
    }
    .header p {
      color: #93c5fd;
      margin: 6px 0 0 0;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.025em;
    }
    .body {
      padding: 40px 32px;
    }
    .h2 {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 16px;
      letter-spacing: -0.02em;
    }
    p {
      font-size: 15px;
      line-height: 1.625;
      margin-top: 0;
      margin-bottom: 20px;
      color: ${TEXT_COLOR};
    }
    .card {
      background-color: #f8fafc;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 24px;
      border: 1px solid #f1f5f9;
    }
    .card h3 {
      font-size: 13px;
      font-weight: 700;
      color: #475569;
      margin-top: 0;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .card p {
      font-size: 14px;
      margin-bottom: 8px;
      color: #334155;
    }
    .card p:last-child {
      margin-bottom: 0;
    }
    .btn {
      display: inline-block;
      background-color: ${BRAND_COLOR};
      color: #ffffff !important;
      font-weight: 600;
      font-size: 14px;
      padding: 12px 24px;
      border-radius: 6px;
      text-decoration: none;
      text-align: center;
      margin: 12px 0 24px 0;
    }
    .badge {
      display: inline-block;
      font-weight: 700;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .footer {
      max-width: 580px;
      margin: 0 auto;
      text-align: center;
      padding: 32px 16px;
    }
    .footer p {
      font-size: 12px;
      line-height: 1.5;
      color: #64748b;
      margin: 0 0 8px 0;
    }
    .footer a {
      color: #2563eb;
      text-decoration: none;
      font-weight: 500;
    }

    /* Meta classes for nested legacy inner elements */
    .italic-note {
      margin-top: 12px;
      font-style: italic;
      color: #475569;
    }
    .verified-card {
      border-left: 4px solid #16a34a !important;
      background-color: #f0fdf4 !important;
    }
    .hours-highlight {
      font-size: 18px;
      color: #16a34a;
    }
    .mono-badge {
      font-family: monospace;
      font-size: 11px;
      background-color: #e2e8f0;
      padding: 2px 6px;
      border-radius: 4px;
      color: #334155;
    }
    .applicant-message {
      margin-top: 12px;
      background-color: #ffffff;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #f1f5f9;
      font-style: italic;
      color: #334155;
    }
    .auth-subtitle {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #64748b;
      margin-bottom: 8px;
      font-weight: bold;
    }
    .auth-box {
      display: inline-block;
      font-family: monospace;
      font-size: 32px;
      font-weight: 800;
      color: #1e3a8a;
      background-color: #eff6ff;
      padding: 16px 36px;
      border-radius: 12px;
      border: 2px dashed #93c5fd;
      letter-spacing: 4px;
    }
    .alert-card {
      border-left: 4px solid #b91c1c !important;
      background-color: #fef2f2 !important;
    }

    /* Media query dark mode overrides */
    @media (prefers-color-scheme: dark) {
      body, .wrapper {
        background-color: #0f172a !important;
        color: #94a3b8 !important;
      }
      .content-box {
        background-color: #1e293b !important;
        border-color: #334155 !important;
      }
      .h2 {
        color: #f1f5f9 !important;
      }
      p, td {
        color: #cbd5e1 !important;
      }
      strong, h1, h2, h3, h4 {
        color: #f8fafc !important;
      }
      .card {
        background-color: #0f172a !important;
        border-color: #1e293b !important;
      }
      .card h3 {
        color: #94a3b8 !important;
      }
      .card p {
        color: #cbd5e1 !important;
      }
      .italic-note {
        color: #94a3b8 !important;
      }
      .verified-card {
        background-color: #064e3b !important;
        border-color: #059669 !important;
      }
      .hours-highlight {
        color: #34d399 !important;
      }
      .mono-badge {
        background-color: #1e293b !important;
        color: #cbd5e1 !important;
      }
      .applicant-message {
        background-color: #0f172a !important;
        border-color: #1e293b !important;
        color: #cbd5e1 !important;
      }
      .auth-subtitle {
        color: #94a3b8 !important;
      }
      .auth-box {
        color: #60a5fa !important;
        background-color: #1e3a8a !important;
        border-color: #3b82f6 !important;
      }
      .alert-card {
        background-color: #7f1d1d !important;
        border-color: #ef4444 !important;
      }
      .footer p {
        color: #475569 !important;
      }
      .footer a {
        color: #60a5fa !important;
      }
    }
  </style>
</head>
<body>
  ${previewText ? `<span style="display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; mso-hide:all;">${previewText}</span>` : ""}
  <div class="wrapper">
    <div class="content-box">
      <div class="header">
        <h1>${BRAND_NAME}</h1>
        <p>Connecting Students with Community Placements</p>
      </div>
      <div class="body">
        ${children}
      </div>
    </div>
    <div class="footer">
      <p>Sent with key credentials by <strong>${BRAND_NAME}</strong></p>
      <p>High School Community Involvement Portfolio &amp; Opportunities Directory</p>
      <p>
        <a href="${BRAND_URL}/student/profile">Notification Preferences</a> &nbsp;&bull;&nbsp; 
        <a href="${BRAND_URL}/about">Unsubscribe</a> &nbsp;&bull;&nbsp; 
        <a href="${BRAND_URL}/support">Contact Support</a>
      </p>
      <p style="font-size: 11px; margin-top: 12px; color: #94a3b8;">&copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Premium email templates (OSSD cleared)
 */
export const emailTemplates = {
  /**
   * 1. Student Welcome Email
   */
  welcome_student: (studentName: string) => {
    const title = "Welcome to your Volunteer Portfolio!";
    const children = `
      <h2 class="h2">Hey ${esc(studentName)}! 👋</h2>
      <p>We are absolutely thrilled to welcome you to <strong>${BRAND_NAME}</strong>. Your journey to complete your high school community involvement requirement starts here!</p>
      
      <div class="card">
        <h3>🚀 Get Started in 3 Steps:</h3>
        <p><strong>1. Complete Your Interests:</strong> Choose your favorite community causes on your dashboard so we can match you perfectly.</p>
        <p><strong>2. Apply to Placements:</strong> Apply directly to verified public organizations with a single tap.</p>
        <p><strong>3. Dynamic Hour Logbook:</strong> Submit claims after your volunteer service. Your site supervisors sign off Digitally—no paper forms to lose!</p>
      </div>

      <div style="text-align: center;">
        <a href="${BRAND_URL}/login" class="btn">Explore Volunteer Placements</a>
      </div>

      <p>If you have any questions or need helper tips on eligible shifts, reply directly to this email or read our guidelines at the Local High School Hub.</p>
      <p>Best regards,<br>The ${BRAND_NAME} Team</p>
    `;
    return wrapBaseTemplate({ title, children, previewText: "Kickstart your high school volunteering journey today!" });
  },

  /**
   * 2. Application Status Update (Accepted / Rejected)
   */
  application_status: (studentName: string, oppTitle: string, orgName: string, status: "accepted" | "rejected", note?: string) => {
    const title = status === "accepted" ? "🎉 Application Approved!" : "Opportunity Application Update";
    const statusBadge = status === "accepted" 
      ? `<span class="badge" style="background-color: #dcfce7; color: #15803d;">Accepted</span>`
      : `<span class="badge" style="background-color: #fee2e2; color: #991b1b;">Processed</span>`;

    const children = `
      <h2 class="h2">Hi ${esc(studentName)},</h2>
      <p>You have a new update regarding your application for <strong>${esc(oppTitle)}</strong> with <strong>${esc(orgName)}</strong>.</p>
      
      <div class="card">
        <h3>Application Status</h3>
        <p><strong>Opportunity:</strong> ${esc(oppTitle)}</p>
        <p><strong>Organization:</strong> ${esc(orgName)}</p>
        <p><strong>Status:</strong> ${statusBadge}</p>
        ${note ? `<p class="italic-note">" ${esc(note)} "</p>` : ""}
      </div>

      ${status === "accepted" ? `
        <p><strong>Next Steps:</strong> Please contact the supervisor immediately to coordinate your shift schedule and community hour sign-off tracking.</p>
        <div style="text-align: center;">
          <a href="${BRAND_URL}/student/dashboard" class="btn">View Dashboard Details</a>
        </div>
      ` : `
        <p>Don't worry! There are hundreds of other verified placements seeking passionate students around our community. Head back to the search dashboard to find your fit.</p>
        <div style="text-align: center;">
          <a href="${BRAND_URL}/student/opportunities" class="btn" style="background-color: #475569;">Find Other Opportunities</a>
        </div>
      `}

      <p>Keep up the great momentum!</p>
    `;
    return wrapBaseTemplate({ title, children, previewText: `Status update regarding your application to ${esc(oppTitle)} at ${esc(orgName)}` });
  },

  /**
   * 3. Hours Verified / Completion Confirmation
   */
  hours_confirmation: (studentName: string, hours: number, oppTitle: string, orgName: string, supervisorName: string) => {
    const title = "📝 Community Hours Logged & Signed!";
    const children = `
      <h2 class="h2">Splendid job, ${esc(studentName)}! 🌟</h2>
      <p>Congratulations! Your completed hours have been Digitally Signed and Verified by your host supervisor.</p>
      
      <div class="card verified-card">
        <h3>Verified Hours Entry</h3>
        <p><strong>Completed Hours:</strong> <strong class="hours-highlight">+ ${Number(hours) || 0} Volunteer Hours</strong></p>
        <p><strong>Opportunity:</strong> ${esc(oppTitle)}</p>
        <p><strong>Organization:</strong> ${esc(orgName)}</p>
        <p><strong>Authorized By:</strong> ${esc(supervisorName)}</p>
        <p><strong>Verification Code:</strong> <span class="mono-badge">VERIFIED-VNY-${Math.random().toString(36).substr(2, 6).toUpperCase()}</span></p>
      </div>

      <p>These hours have been automatically added to your dynamic progress dashboard. You can export your official community hours transcript PDF directly from your profile dashboard for graduation submission.</p>

      <div style="text-align: center;">
        <a href="${BRAND_URL}/student/dashboard" class="btn">View Hour Logbook</a>
      </div>

      <p>Thank you for making our community a better place through your service!</p>
    `;
    return wrapBaseTemplate({ title, children, previewText: `You successfully logged +${hours} verified volunteer hours!` });
  },

  /**
   * 4. New Applicant Alert (For Organization)
   */
  new_applicant: (orgName: string, applicantName: string, oppTitle: string, message?: string) => {
    const title = "📬 New Applicant for Your Placement";
    const children = `
      <h2 class="h2">Hello ${esc(orgName)},</h2>
      <p>A student has just submitted their application for your posting <strong>${esc(oppTitle)}</strong>!</p>
      
      <div class="card">
        <h3>Applicant File</h3>
        <p><strong>Student Name:</strong> ${esc(applicantName)}</p>
        <p><strong>Target Posting:</strong> ${esc(oppTitle)}</p>
        ${message ? `<p class="applicant-message">"${esc(message)}"</p>` : ""}
      </div>

      <p>Please review their application in your Admin Dashboard to either Accept their placement or decline with constructive feedback.</p>

      <div style="text-align: center;">
        <a href="${BRAND_URL}/org/dashboard" class="btn">Review Application</a>
      </div>

      <p>Thank you for supporting youth involvement in secondary schools!</p>
    `;
    return wrapBaseTemplate({ title, children, previewText: `New volunteer application from ${esc(applicantName)}` });
  },

  /**
   * 5. Auth / Security Codes (Verification/Reset)
   */
  auth_verification: (userName: string, code: string, purpose: "verification" | "reset") => {
    const title = purpose === "verification" ? "Verify your volunteer account" : "Reset your password";
    const headText = purpose === "verification" ? "Account Verification Code" : "Password Reset Code";
    const infoText = purpose === "verification" 
      ? "Please use the security code below to complete your registration."
      : "You recently requested to reset your account password. If you didn't make this request, please ignore this email.";

    const children = `
      <h2 class="h2">Hello ${esc(userName)},</h2>
      <p>${infoText}</p>
      
      <div style="text-align: center; margin: 32px 0;">
        <p class="auth-subtitle">${headText}</p>
        <div class="auth-box">${code}</div>
        <p style="font-size: 12px; color: #94a3b8; margin-top: 12px;">This security code is active for 15 minutes.</p>
      </div>

      <p>For your security, never share this code with anyone. Our support desk will never ask for your verification credentials.</p>
    `;
    return wrapBaseTemplate({ title, children, previewText: `${headText}: ${code}` });
  },

  /**
   * 6. Admin Security & Notification Alerts
   */
  admin_alert: (subject: string, details: string) => {
    const title = "⚠️ System Security Alert";
    const children = `
      <h2 class="h2">Admin System Bulletin 🚨</h2>
      <p>A triggered flag/security report requires review. The event details are documented below:</p>
      
      <div class="card alert-card">
        <h3>Incident Record</h3>
        <p><strong>Subject:</strong> ${esc(subject)}</p>
        <p><strong>Details:</strong> ${esc(details)}</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
      </div>

      <p>Please cross-reference the report within our administrative tools to apply immediate safety measures or approvals.</p>
    `;
    return wrapBaseTemplate({ title, children, previewText: `System Alert: ${esc(subject)}` });
  }
};
