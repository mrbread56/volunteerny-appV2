import type { StudentProfile } from '../../types';

/**
 * Builds the printable Ontario community-involvement transcript.
 *
 * Extracted from StudentDashboard, where 105 lines of HTML string-building sat
 * inside the component between two state handlers. It is a pure function of the
 * profile and the hour total, so it does not belong in a React component at all
 * — and keeping it there meant every read of the dashboard had to scroll past a
 * full HTML document.
 *
 * Values are escaped on the way in. This document is opened in a new window and
 * printed, so an unescaped student name or activity description would be live
 * HTML in a page the student is about to hand to their school.
 */
export function buildCertificateHtml(
  studentProfile: Partial<StudentProfile> | null | undefined,
  totalCompletedHours: number | string,
): string {

  const escapeHTML = (str: any) => {
    if (typeof str !== 'string') return String(str || '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const tableRows =
    (studentProfile?.loggedHours || [])
      .map(
        (lh, idx) => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 12px; font-weight: bold; color: #1e293b;">${escapeHTML(lh.activity)}</td>
      <td style="padding: 12px; font-weight: bold; color: #2563eb;">${escapeHTML(lh.hours)} hrs</td>
      <td style="padding: 12px; color: #475569;">${escapeHTML(lh.date)}</td>
      <td style="padding: 12px; color: #475569;">${escapeHTML(lh.coordinatorName)} (${escapeHTML(lh.coordinatorContact)})</td>
      <td style="padding: 12px; color: #1F4C63; font-weight: bold;">Verified Profile Check</td>
    </tr>
  `,
      )
      .join("") ||
    `<tr><td colSpan="5" style="padding: 24px; text-align: center; color: #94a3b8; font-style: italic;">No volunteer hours logged in your tracking list yet.</td></tr>`;

  return (`
    <html>
      <head>
        <title>Ontario High School Community Involvement Hour Document - Export</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Outfit', system-ui, sans-serif; padding: 40px; color: #0f172a; line-height: 1.5; }
          .header { border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
          .title { font-size: 24px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; }
          .student-info { background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
          th { background: #0f172a; color: white; text-align: left; padding: 12px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
          .totals { font-size: 18px; font-weight: 800; text-align: right; margin-bottom: 50px; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; }
          .sig-box { border-top: 1px solid #94a3b8; padding-top: 12px; text-align: center; font-size: 12px; color: #475569; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">Toronto Community Involvement Hours Transcript</div>
          <p style="font-size: 12px; color: #64748b; margin-top: 4px;">Ontario High School Graduation (40-Hours Requirement Tracker Document)</p>
        </div>

        <div class="student-info">
          <div><strong>Student Name:</strong> ${escapeHTML(studentProfile?.fullName || "Anonymous Student")}</div>
          <div><strong>Academic School:</strong> ${escapeHTML(studentProfile?.school || "Secondary School")}</div>
          <div><strong>Grade:</strong> Grade ${escapeHTML(studentProfile?.grade || "N/A")}</div>
          <div><strong>Toronto Neighborhood:</strong> ${escapeHTML(studentProfile?.neighborhood || "N/A")}</div>
        </div>

        <table border="0">
          <thead>
            <tr>
              <th>Activity Description</th>
              <th>Hours</th>
              <th>Completion Date</th>
              <th>Coordinator Supervisor Details</th>
              <th>Verification Hook</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="totals">
           Total Ontario Involvement Hours Logged: <span style="color: #2563eb; font-size: 24px;">${escapeHTML(totalCompletedHours)} / 40</span>
        </div>

        <p style="font-size: 11.5px; color: #64748b; font-style: italic; border-left: 2px solid #cbd5e1; padding-left: 12px; margin-bottom: 40px;">
           Disclaimer: These community involvement hours are logged on Volunteer NY for community tracking. Legal school pre-approval and physical verification forms should be authenticated in agreement with your local school board guidelines.
        </p>

        <div class="signatures">
          <div class="sig-box">
            Supervisor Signature & Stamp
          </div>
          <div class="sig-box">
            School Principal / Guidance Counselor Approval Date
          </div>
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
    </html>
  `);

}
