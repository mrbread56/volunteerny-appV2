import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-20 sm:py-28">
        <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#1F4C63]/60 mb-4">Legal</p>
        <h1 className="text-[2rem] sm:text-[2.5rem] font-semibold text-slate-900 tracking-[-0.035em] leading-tight mb-3">
          Privacy Policy
        </h1>
        <p className="text-sm text-slate-400 font-medium mb-16">Last updated July 20, 2026</p>

        <div className="space-y-12 text-[15px] leading-[1.8] text-slate-600">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 tracking-[-0.02em] mb-3">1. Information We Collect</h2>
            <p>
              When you create an account, we collect your name, email address, school (for students), organization name (for organizations), neighbourhood, grade level, and volunteer interests. When you use the Platform, we also collect application data, volunteer hours, messages sent through in-app chat, uploaded files and images, feedback submissions, and basic usage data such as login timestamps.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 tracking-[-0.02em] mb-3">2. How We Use Your Information</h2>
            <p>
              We use your information to: operate and maintain the Platform; match students with volunteer opportunities; facilitate communication between students and organizations; track and verify volunteer hours; send transactional emails (application updates, hour confirmations, security codes); generate leaderboard rankings; analyze platform usage to improve our services; and enforce our Terms of Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 tracking-[-0.02em] mb-3">3. Data Storage and Security</h2>
            <p>
              Your data is stored in Google Firebase (Firestore and Firebase Authentication) and processed through our server infrastructure. File uploads (profile images, chat attachments, resumes) are stored in Firebase Storage. We implement access controls, security rules, and encryption in transit (HTTPS) to protect your data. However, no system is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 tracking-[-0.02em] mb-3">4. Third-Party Services</h2>
            <p>
              We use the following third-party services to operate the Platform: <strong>Google Firebase</strong> for authentication, database, and file storage; <strong>Resend</strong> for transactional email delivery; <strong>Google Gemini AI</strong> for automated feedback analysis (feedback text only, not personal data); and <strong>Google reCAPTCHA</strong> for bot protection. Each of these services has its own privacy policy governing their use of data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 tracking-[-0.02em] mb-3">5. Data Sharing</h2>
            <p>
              We do not sell your personal information. We share your data only as follows: your student profile information is visible to organizations you apply to; your organization profile is visible to students browsing opportunities; messages are visible to chat participants; leaderboard rankings (name and hours) are visible to other logged-in users. We may disclose data if required by law or to protect the rights and safety of our users.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 tracking-[-0.02em] mb-3">6. Cookies and Local Storage</h2>
            <p>
              We use browser local storage to maintain your login session, store UI preferences, and support offline functionality. We use Google reCAPTCHA which may set cookies for bot detection. We do not use advertising cookies or third-party tracking cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 tracking-[-0.02em] mb-3">7. Your Rights</h2>
            <p>
              You may access, update, or delete your personal information through your profile settings at any time. You may request a copy of the data we hold about you by contacting us through the Feedback page. You may delete your account, which will remove your profile data. Note that some data (such as applications you submitted or hours logged by organizations) may be retained as part of other users' records.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 tracking-[-0.02em] mb-3">8. Children's Privacy</h2>
            <p>
              The Platform is designed for use by high school students aged 13 and older. Users under 18 must have parental or guardian consent. We do not knowingly collect information from children under 13 without verifiable parental consent. If we learn that we have collected information from a child under 13 without consent, we will delete that information promptly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 tracking-[-0.02em] mb-3">9. Data Retention</h2>
            <p>
              We retain your account data for as long as your account is active. If you delete your account, we will remove your personal profile data within 30 days. Aggregated, anonymized data may be retained indefinitely for analytics purposes. Volunteer hour records confirmed by organizations may be retained as part of organizational records even after account deletion.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 tracking-[-0.02em] mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify users of material changes by posting a notice on the Platform. Your continued use of the Platform after changes are posted constitutes acceptance of the updated policy.
            </p>
          </section>

          <div className="pt-10 border-t border-slate-100">
            <p className="text-sm text-slate-400">
              If you have questions about this policy, reach out via the Feedback page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
