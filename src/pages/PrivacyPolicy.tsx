import { usePageTitle } from '../hooks/usePageTitle';


export default function PrivacyPolicy() {
  usePageTitle('Privacy policy');
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-20 sm:py-28">
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-blue-dark/60 mb-4">Legal</p>
        <h1 className="text-[2rem] sm:text-[2.5rem] font-semibold text-ink tracking-[-0.035em] leading-tight mb-3">
          Privacy Policy
        </h1>
        <p className="text-sm text-ink-muted font-medium mb-16">Last updated July 20, 2026</p>

        <div className="space-y-12 text-base leading-[1.8] text-ink-muted">
          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">1. Information We Collect</h2>
            <p>
              When you create an account, we collect your name, email address, school (for students), organization name (for organizations), neighbourhood, grade level, and volunteer interests. When you use the Platform, we also collect application data, volunteer hours, messages sent through in-app chat, uploaded files and images, feedback submissions, and basic usage data such as login timestamps.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">2. How We Use Your Information</h2>
            <p>
              We use your information to: operate and maintain the Platform; match students with volunteer opportunities; facilitate communication between students and organizations; track and verify volunteer hours; send transactional emails (application updates, hour confirmations, security codes); generate leaderboard rankings; analyze platform usage to improve our services; and enforce our Terms of Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">3. Data Storage and Security</h2>
            <p>
              Your data is stored in Google Firebase (Firestore and Firebase Authentication) and processed through our server infrastructure. File uploads (profile images, chat attachments, resumes) are stored in Firebase Storage. We implement access controls, security rules, and encryption in transit (HTTPS) to protect your data. However, no system is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">4. Third-Party Services</h2>
            <p>
              We use the following third-party services to operate the Platform: <strong>Google Firebase</strong> for authentication, database, and file storage; <strong>Resend</strong> for transactional email delivery; <strong>Google Gemini AI</strong> for automated triage of feedback and safety reports, which means the text you write in one is sent to it; <strong>OpenStreetMap</strong> to turn a typed address into map coordinates; and <strong>CARTO</strong> to serve the map tiles themselves. Opening any map sends your IP address to those last two. Each of these services has its own privacy policy governing their use of data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">5. Data Sharing</h2>
            <p>
              We do not sell your personal information. We share your data only as follows: your student profile information is visible to organizations you apply to; your organization profile is visible to students browsing opportunities; leaderboard rankings (name and hours) are visible to other logged-in users. We may disclose data if required by law or to protect the rights and safety of our users.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">6. Cookies and Local Storage</h2>
            <p>
              We use browser local storage to maintain your login session and store UI preferences. We do not use advertising cookies or third-party tracking cookies, and we do not use any analytics or tracking service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">7. Your Rights</h2>
            <p>
              You may access, update, or delete your personal information through your profile settings at any time. You may request a copy of the data we hold about you by contacting us through the Feedback page. You may delete your account, which will remove your profile data. Note that some data (such as applications you submitted or hours logged by organizations) may be retained as part of other users' records.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">8. Children's Privacy</h2>
            <p>
              The Platform is built for Ontario high school students, who are
              typically 14 to 18. Most of our users are under 18.
            </p>
            <p className="mt-3">
              We do not currently ask for your age, and we do not ask for a
              parent or guardian's permission before you sign up. We are saying
              that plainly because a privacy policy that describes checks we do
              not perform is worse than one that admits we do not perform them.
            </p>
            <p className="mt-3">
              If you are under 13, please do not create an account. If we learn
              that an account belongs to someone under 13, we will delete it and
              its data.
            </p>
            <p className="mt-3">
              If you are a parent or guardian and you want your child's account
              and data removed, email us and we will do it — you do not need to
              give a reason.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">9. Data Retention</h2>
            <p>
              We keep your account data for as long as your account exists.
            </p>
            <p className="mt-3">
              When you delete your account we delete it immediately, not within
              30 days: your profile, applications, saved opportunities, logged
              hours, feedback, ratings, and your sign-in itself. Your name comes
              off the leaderboard at the same time.
            </p>
            <p className="mt-3">
              Safety reports are the one thing we keep. A report is another
              person's account of what happened to them, so we do not let the
              person it is about erase it by closing their account. We remove
              the names and email addresses from it and keep the rest. If you
              filed a report and then delete your account, your name comes off
              it too, and what you wrote stays.
            </p>
            <p className="mt-3">
              We also keep backups for a short period, so a copy of your data
              can persist there briefly after deletion before it ages out.
            </p>
            <p className="mt-3">
              <strong>Print or save your hours record before you delete your
              account.</strong> We do not keep a copy for you and cannot restore
              one afterwards. Your school holds the record that counts toward
              graduation — this site is only your own tracking copy.
            </p>
            <p className="mt-3">
              An organisation keeps its own record of the hours it confirmed, in
              its own files. That is theirs and sits outside this Platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify users of material changes by posting a notice on the Platform. Your continued use of the Platform after changes are posted constitutes acceptance of the updated policy.
            </p>
          </section>

          <div className="pt-10 border-t border-line-light">
            <p className="text-sm text-ink-muted">
              If you have questions about this policy, reach out via the Feedback page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
