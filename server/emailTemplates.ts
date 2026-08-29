/**
 * Modern, responsive templates for Volunteer North York
 * Crafted with clean typography, elegant negative space, and a refined professional layout.
 */
// The .js extension is required, not cosmetic: package.json is
// "type": "module", so Vercel resolves this file as real ESM, where an
// extensionless relative import throws ERR_MODULE_NOT_FOUND at load time and
// takes the entire API down with it. tsx and esbuild --bundle both resolve it
// either way, which is why it passes locally and fails only when deployed.
import { appOrigin } from "./appUrl.js";

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
// Was a const: `process.env.APP_URL || "https://volunteernorthyork.indevs.in"`.
// The default was the MAIL_FROM domain, which sends mail and serves no website,
// so every button below was a dead link — and being a const, it was evaluated
// at import time, before server.ts had run dotenv.config(), so setting APP_URL
// could not have fixed it either. Must stay a call. See server/appUrl.ts.
const BRAND_URL = () => appOrigin();
const BRAND_COLOR = "#2563eb"; // Modern Blue 600
const TEXT_COLOR = "#334155"; // Slate 700
const BG_COLOR = "#f8fafc"; // Slate 50

/**
 * Wraps HTML content in a pristine, responsive email wrapper with high-contrast layouts.
 *
 * The footer used to carry a "Notification Preferences / Unsubscribe / Contact
 * Support" row. Removed by request, and none of it worked anyway: /about and
 * /support are not routes, and App.tsx sends unmatched paths to
 * <Navigate to="/">, so those links silently dropped the reader on the
 * homepage. There is still no self-serve unsubscribe to link to — don't
 * reinstate any of them without a route that actually handles it.
 *
 * (This note lives here rather than as an HTML comment on purpose: anything
 * inside the template string is transmitted in every email.)
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
      background: #ffffff;
      padding: 36px 32px 24px 32px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    .header h1 {
      color: #0f172a;
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.025em;
    }
    .header p {
      color: #64748b;
      margin: 6px 0 0 0;
      font-size: 13px;
      font-weight: 600;
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
      border: 1px solid #e2e8f0;
    }
    .card h3 {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
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

    /* Clean email layouts without forcing dark mode overrides */
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
   * 0. Password reset.
   *
   * Firebase can send this itself, and for a long time it did — which is why
   * nobody noticed it was not arriving. sendPasswordResetEmail hands delivery to
   * Google's mailer on a noreply@<project>.firebaseapp.com sender that this
   * project never authenticated, a completely separate pipeline from the Resend
   * domain that carries every other message the site sends. On 27 Aug 2026 an
   * organisation reported the reset email never came, and the same request from
   * our own account never arrived either.
   *
   * So the link is generated with the Admin SDK and delivered here instead, over
   * the sender that is actually verified. One pipeline, one place to check.
   */
  password_reset: (link: string) => {
    const title = "Reset your password";
    const children = `
      <h2 class="h2">Reset your password</h2>
      <p>Someone asked to reset the password for this ${BRAND_NAME} account. If that was you, use the button below.</p>

      <div style="text-align: center;">
        <a href="${esc(link)}" class="btn">Choose a new password</a>
      </div>

      <div class="card">
        <p><strong>This link works once and expires in about an hour.</strong></p>
        <p>If the button does not work, copy this address into your browser:</p>
        <p style="word-break: break-all; font-size: 12px;">${esc(link)}</p>
      </div>

      <p>If you did not ask for this, you can ignore this email. Your password will not change unless you use the link above.</p>
      <p>Already signed in? You can change your password from your profile page instead, without needing this email at all.</p>
      <p>The ${BRAND_NAME} Team</p>
    `;
    return wrapBaseTemplate({ title, children, previewText: "A link to choose a new password." });
  },

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
        <p><strong>2. Apply to Placements:</strong> Apply directly to organizations from your dashboard.</p>
        <p><strong>3. Hour logbook:</strong> Submit your hours after each shift and the organization confirms them here, so you always have a running record. You will still need your school board's own form signed as well.</p>
      </div>

      <div style="text-align: center;">
        <a href="${BRAND_URL()}/login" class="btn">Sign in to your account</a>
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
          <a href="${BRAND_URL()}/student/dashboard" class="btn">View Dashboard Details</a>
        </div>
      ` : `
        <p>Other opportunities are listed on the site whenever you want to look.</p>
        <div style="text-align: center;">
          <a href="${BRAND_URL()}/student/opportunities" class="btn" style="background-color: #475569;">Find Other Opportunities</a>
        </div>
      `}

      <p>Keep up the great momentum!</p>
    `;
    return wrapBaseTemplate({ title, children, previewText: `Status update regarding your application to ${esc(oppTitle)} at ${esc(orgName)}` });
  },

  /**
   * 3. Hours Verified / Completion Confirmation
   */
  /*
   * What this email may and may not claim about a student's hours.
   *
   * It used to say the hours were "Digitally Signed and Verified" and that the
   * student could export an "official community hours transcript PDF ... for
   * graduation submission". No signing exists — the note further down records
   * that a fabricated VERIFIED-VNY-… code was removed for that reason, and the
   * sentence claiming the same thing in words survived the removal. And the
   * document the app prints says the opposite in its own footer: "This is not
   * an official school document. You still need your school board's own
   * community involvement form, signed by your supervisor."
   *
   * The app disclaims this correctly in four places in the interface. The email
   * overrode all four, and the email is the artefact a student forwards to a
   * parent or a guidance office. A student who believes it stops chasing the
   * paper form, and by then the hours cannot be recovered.
   */
  hours_confirmation: (studentName: string, hours: number, oppTitle: string, orgName: string, supervisorName: string) => {
    const title = "📝 Community Hours Logged & Signed!";
    const children = `
      <h2 class="h2">Splendid job, ${esc(studentName)}! 🌟</h2>
      <p>Your supervisor has confirmed these hours.</p>
      
      <div class="card verified-card">
        <h3>Verified Hours Entry</h3>
        <p><strong>Completed Hours:</strong> <strong class="hours-highlight">+ ${Number(hours) || 0} Volunteer Hours</strong></p>
        <p><strong>Opportunity:</strong> ${esc(oppTitle)}</p>
        <p><strong>Organization:</strong> ${esc(orgName)}</p>
        <p><strong>Authorized By:</strong> ${esc(supervisorName)}</p>
        <!-- There was a "Verification Code" here reading
             VERIFIED-VNY-${'$'}{Math.random()...}, generated fresh at send time,
             stored nowhere and checkable by nobody. It appeared in the one
             email a student is most likely to forward to a school as proof —
             a trust claim the system could not back, which is worse than no
             claim at all. The confirmation date below is real: it is written
             onto the logged entry when a coordinator confirms the hours. -->
        <p><strong>Confirmed on:</strong> ${esc(new Date().toISOString().slice(0, 10))}</p>
      </div>

      <p>These hours are now on your dashboard, and you can print a summary of them
         from the hours tracker. That summary is a record to work from. It is not
         an official school document, so you still need your school board's own
         community involvement form, signed by your supervisor.</p>

      <div style="text-align: center;">
        <a href="${BRAND_URL()}/student/dashboard" class="btn">View Hour Logbook</a>
      </div>

      <p>Thank you for making our community a better place through your service!</p>
    `;
    return wrapBaseTemplate({ title, children, previewText: `You successfully logged +${Number(hours) || 0} verified volunteer hours!` });
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
        <a href="${BRAND_URL()}/org/dashboard" class="btn">Review Application</a>
      </div>

      <p>Thank you for supporting youth involvement in secondary schools!</p>
    `;
    return wrapBaseTemplate({ title, children, previewText: `New volunteer application from ${esc(applicantName)}` });
  },

  /**
   * A student pulled out before a decision was made.
   *
   * Withdrawal DELETES the application, because the document id is
   * `${studentId}_${opportunityId}` and a tombstone would block the student
   * from ever applying again. That is the right call for the record, but it
   * meant the application simply vanished from the organisation's list with no
   * word — they kept a place open for somebody who had already gone.
   *
   * Tirgan asked what happens in exactly this case on 28 Aug 2026, which is how
   * it was found. The reason is optional and included only when given: a
   * student is not obliged to explain, and an empty quotation mark block reads
   * worse than no reason at all.
   */
  applicant_withdrew: (orgName: string, applicantName: string, oppTitle: string, reason?: string) => {
    const title = "An applicant withdrew";
    const children = `
      <h2 class="h2">Hello ${esc(orgName)},</h2>
      <p><strong>${esc(applicantName)}</strong> has withdrawn their application for
         <strong>${esc(oppTitle)}</strong>. No decision had been made yet, so nothing is
         needed from you.</p>

      <div class="card">
        <h3>What this means</h3>
        <p>Their place is open again, and the posting is still live and taking applications.</p>
        ${reason ? `<p class="applicant-message">"${esc(reason)}"</p>` : ""}
      </div>

      <div style="text-align: center;">
        <a href="${BRAND_URL()}/org/dashboard" class="btn">Open your dashboard</a>
      </div>

      <p>The ${BRAND_NAME} Team</p>
    `;
    return wrapBaseTemplate({ title, children, previewText: `${esc(applicantName)} withdrew their application.` });
  },

  /**
   * The decision on an organisation's application to join.
   *
   * Three screens told organisations "We will email you the moment it is done",
   * and the rejection banner went further: "reply to the email we sent". No such
   * message existed. Approving wrote four fields to Firestore and returned; the
   * only signal was an in-app notification, visible solely to someone who
   * happened to log back in and look at a bell.
   *
   * The people on the other side of this are volunteer coordinators who check
   * the site once a fortnight. Told to wait for an email, they waited. That is
   * the most likely way a real organisation was lost, and it looked like
   * disinterest rather than a missing send.
   */
  organization_verification: (orgName: string, decision: "verified" | "rejected") => {
    const approved = decision === "verified";
    const title = approved ? "Your organization is approved" : "About your organization's application";
    const children = approved
      ? `
      <h2 class="h2">You're approved, ${esc(orgName)}</h2>
      <p>A person has reviewed your organization and you can now post volunteer
         positions on <strong>${BRAND_NAME}</strong>. Students will be able to find
         them and apply straight away.</p>

      <div class="card">
        <h3>What happens next</h3>
        <p><strong>1. Post a position.</strong> Say what students would be doing, the
           days and hours, how many you can take, and any minimum age.</p>
        <p><strong>2. Review who applies.</strong> You will get an email each time a
           student applies, with a link straight to their application.</p>
        <p><strong>3. Confirm their hours.</strong> After they volunteer, they log
           their hours and you confirm them. Students still need their school
           board's own form signed, so please sign that too if they ask — what
           you confirm here is the running record you both work from.</p>
      </div>

      <div style="text-align: center;">
        <a href="${BRAND_URL()}/org/opportunities/new" class="btn">Post your first position</a>
      </div>

      <p>If anything is unclear, reply to this email and a person will read it.</p>
      <p>The ${BRAND_NAME} Team</p>
    `
      : `
      <h2 class="h2">Hello ${esc(orgName)},</h2>
      <p>Thank you for applying to join <strong>${BRAND_NAME}</strong>. We are not able
         to approve your organization at this time, so you will not be able to post
         volunteer positions.</p>

      <div class="card">
        <p>This is often something straightforward, such as details we could not
           confirm from a website or a public listing. If you think we have this
           wrong, or you can point us to something that would help, please reply to
           this email. A person reads every reply.</p>
      </div>

      <p>The ${BRAND_NAME} Team</p>
    `;
    return wrapBaseTemplate({
      title,
      children,
      previewText: approved
        ? "You can now post volunteer positions."
        : "About your application to join.",
    });
  },

  /**
   * Confirm the address on the account.
   *
   * Signup used Firebase's own sendEmailVerification, which delivers from
   * noreply@<project>.firebaseapp.com — the same unauthenticated sender whose
   * silence was already found and fixed for password reset. That mattered more
   * here than it looks: firestore.rules requires email_verified before an
   * organisation may list hoursRequests, so an organisation whose link never
   * arrived could not read the hours its own volunteers had submitted, and
   * nothing anywhere offered to send another one.
   */
  email_verification: (link: string) => {
    const title = "Confirm your email address";
    const children = `
      <h2 class="h2">One quick step</h2>
      <p>Confirm this is your address so we know we can reach you. Organisations
         need this before they can see the hours their volunteers submit.</p>

      <div style="text-align: center;">
        <a href="${esc(link)}" class="btn">Confirm my email</a>
      </div>

      <div class="card">
        <p>If the button does not work, copy this address into your browser:</p>
        <p style="word-break: break-all; font-size: 12px;">${esc(link)}</p>
      </div>

      <p>If you did not create an account with us, you can ignore this email.</p>
      <p>The ${BRAND_NAME} Team</p>
    `;
    return wrapBaseTemplate({ title, children, previewText: "Confirm your email address." });
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
        <div class="auth-box">${esc(code)}</div>
        <p style="font-size: 12px; color: #94a3b8; margin-top: 12px;">This security code is active for 15 minutes.</p>
      </div>

      <p>For your security, never share this code with anyone. Our support desk will never ask for your verification credentials.</p>
    `;
    return wrapBaseTemplate({ title, children, previewText: `${headText}: ${esc(code)}` });
  },

  /**
   * 6. Admin Security & Notification Alerts
   */
  /**
   * 6a. Ordinary person-to-person notifications.
   *
   * Everything routine used to be sent through `admin_alert` below, so a
   * volunteer coordinator being asked to confirm a student's hours received an
   * email headed "System Security Alert" containing an "Incident Record". That
   * reads as phishing to anyone who does not already know us, and it is the
   * step the whole hours-verification loop depends on. Routine mail now uses
   * this template; `admin_alert` is reserved for genuine security events.
   */
  notification: (heading: string, details: string, actionLabel?: string, actionUrl?: string) => {
    const title = esc(heading) || "Volunteer North York";
    const cta = actionLabel && actionUrl
      ? `<p style="margin:28px 0 0"><a class="btn" href="${esc(actionUrl)}">${esc(actionLabel)}</a></p>`
      : "";
    const children = `
      <h2 class="h2">${esc(heading)}</h2>
      <div class="card">
        <p style="margin:0">${esc(details)}</p>
      </div>
      ${cta}
      <p style="margin-top:28px">Thank you for supporting students in our community.</p>
    `;
    return wrapBaseTemplate({ title, children, previewText: esc(details).slice(0, 120) });
  },

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
