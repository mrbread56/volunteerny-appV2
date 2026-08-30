import React from 'react';
import { Button } from '../../components/ui/Button';

/**
 * The hours tab of the organization dashboard: the queue of student-submitted
 * hour requests awaiting sign-off, and the form for crediting hours directly.
 *
 * Lifted out of OrgDashboard as part of splitting a 1,552-line component.
 *
 * The form state stays in the parent and arrives here as props. That is
 * deliberate: moving it in would reset every field whenever the organization
 * switched tabs, silently discarding a half-typed entry. This component
 * renders and reports; it owns nothing.
 *
 * Approval is not decided here either — onApproveHoursRequest posts to
 * /api/hours/approve, which verifies the organization actually has a
 * relationship with the student before crediting anything. See
 * docs/ARCHITECTURE.md.
 *
 * Moved verbatim. Behaviour is unchanged.
 */
export default function HoursTab({
  hoursRequests,
  isApprovingId,
  onApproveHoursRequest,
  studentsList,
  isSubmittingLog,
  selectedStudentId,
  setSelectedStudentId,
  logDate,
  setLogDate,
  logHours,
  setLogHours,
  logActivity,
  setLogActivity,
  logResultStatus,
  onLogSubmit,
}: {
  hoursRequests: any[];
  isApprovingId: string | null;
  onApproveHoursRequest: (req: any, approved: boolean) => void;
  studentsList: { id: string; fullName: string }[];
  isSubmittingLog: boolean;
  selectedStudentId: string;
  setSelectedStudentId: (v: string) => void;
  logDate: string;
  setLogDate: (v: string) => void;
  logHours: string;
  setLogHours: (v: string) => void;
  logActivity: string;
  setLogActivity: (v: string) => void;
  logResultStatus: string | null;
  onLogSubmit: (e: React.FormEvent) => void;
}) {
  // Local aliases so the moved markup needs no edits.
  const handleApproveHoursRequest = onApproveHoursRequest;
  const handleOrgLogSubmit = onLogSubmit;
  return (
    <section className="bg-white p-8 md:p-10 border border-line space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-ink tracking-tight flex items-center gap-2">
          <span>Student hours</span>
        </h2>
        <p className="text-xs font-bold text-ink-soft tracking-wide font-mono">
          Log hours you supervised, and approve hours students have sent you
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left side: Logging Form */}
        <div className="lg:col-span-7 bg-white p-6 md:p-8 rounded-lg border border-line space-y-6 ">
          <h3 className="text-base font-semibold uppercase text-ink tracking-wide">
            Record Volunteer Hours
          </h3>

          <form onSubmit={handleOrgLogSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-ink-soft tracking-wide block ml-1">
                Select Active Student *
              </label>
              <select
                required
                aria-label="Select active student"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full text-xs font-semibold bg-paper-2 p-3 h-12 rounded-lg border border-line outline-none focus:ring-1 focus:ring-blue-dark focus:bg-white transition-all"
              >
                <option value="">-- Choose active youth volunteer --</option>
                {studentsList.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.fullName} (ID: {st.id.substring(0, 8)}...)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-ink-soft tracking-wide block ml-1">
                  Exact Date of Shift *
                </label>
                <input
                  type="date"
                  required
                  aria-label="Exact date of shift"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  className="w-full text-xs font-semibold bg-paper-2 p-3 h-12 rounded-lg border border-line outline-none focus:ring-1 focus:ring-blue-dark focus:bg-white transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-ink-soft tracking-wide block ml-1">
                  Credits Earned (Hours) *
                </label>
                <input
                  type="number"
                  required
                  step="0.1"
                  aria-label="Credits earned in hours"
                  placeholder="e.g. 4.5"
                  value={logHours}
                  onChange={(e) => setLogHours(e.target.value)}
                  className="w-full text-xs font-semibold bg-paper-2 p-3 h-12 rounded-lg border border-line outline-none focus:ring-1 focus:ring-blue-dark focus:bg-white transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-ink-soft tracking-wide block ml-1">
                Volunteering Activity Name *
              </label>
              <input
                type="text"
                required
                aria-label="Volunteering activity name"
                placeholder="e.g. Toronto Haven Food Bank Sorting Shift"
                value={logActivity}
                onChange={(e) => setLogActivity(e.target.value)}
                className="w-full text-xs font-semibold bg-paper-2 p-3 h-12 rounded-lg border border-line outline-none focus:ring-1 focus:ring-blue-dark focus:bg-white transition-all"
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                isLoading={isSubmittingLog}
                className="w-full h-12 rounded-lg bg-blue-dark hover:bg-[#153343] text-white font-semibold text-xs tracking-wide hover:scale-[1.01] active:scale-[0.99] transition-all"
              >
                Log these hours
              </Button>
            </div>

            {logResultStatus === "success" && (
              <p className="text-xs font-semibold text-blue-dark uppercase text-center animate-pulse">
                ✓ Hours successfully recorded onto Student Hour Log!
              </p>
            )}
            {logResultStatus === "error_not_found" && (
              <p className="text-xs font-semibold text-red-600 uppercase text-center">
                ❌ Error: Student Profile was not found.
              </p>
            )}
            {logResultStatus === "error" && (
              <p className="text-xs font-semibold text-red-600 uppercase text-center">
                ❌ Failed to save hours log. Please try again.
              </p>
            )}
          </form>
        </div>

        {/* Right side: Disclaimer + Hour Request Approvals */}
        <div className="lg:col-span-5 space-y-6">
          {/* Disclaimer box */}
          <div className="bg-amber/10 border-2 border-dashed border-amber p-8 rounded-lg space-y-4">
            <h3 className="text-amber-950 font-semibold text-sm uppercase tracking-wider flex items-center gap-2">
              <span>⚠️</span> REQUIREMENT DISCLAIMER
            </h3>

            <p className="text-xs text-amber-900 leading-relaxed font-semibold">
              While logging hours on Volunteer NY updates the student's digital
              portal metrics instantly, <strong className="text-[14px]">students still need their school's own community involvement form, signed by you.</strong>
              <span className="block mt-1 font-semibold">What you confirm here is for their tracking and leaderboard on this site. It is not an official record, and no school board accepts it in place of their own form — so expect to sign a paper form as well.</span>
            </p>
          </div>

          {/* Verification Inquiries */}
          <div className="bg-white p-6 md:p-8 rounded-lg border border-line space-y-6 ">
            <div className="space-y-1">
              <h3 className="text-base font-semibold uppercase text-ink tracking-wide">
                Hours Claims Inbox
              </h3>
              <p className="text-xs uppercase font-semibold tracking-widest text-blue-dark font-mono">
                Pending Verification Requests ({hoursRequests.length})
              </p>
            </div>

            {hoursRequests.length === 0 ? (
              <div className="py-6 text-center border-2 border-dashed border-line rounded-lg text-xs font-semibold text-ink-soft">
                No pending verification claims found.
              </div>
            ) : (
              <div className="space-y-4">
                {hoursRequests.map((req) => (
                  <div key={req.id} className="p-4 bg-paper-2 rounded-lg border border-line space-y-3 hover:border-line transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-semibold text-ink">{req.studentName}</p>
                        <p className="text-xs text-ink-soft font-mono font-bold">{req.studentEmail}</p>
                      </div>
                      <span className="p-2 py-1 bg-blue-dark/5 text-blue-800 text-xs font-semibold tracking-wide rounded-lg font-mono border border-blue-dark/10 shrink-0">
                        {req.hours} hrs
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-ink-soft space-y-1 bg-white p-3 rounded-lg border border-line/60">
                      <p><strong className="text-ink-soft">Activity:</strong> {req.activity}</p>
                      <p><strong className="text-ink-soft">Org:</strong> {req.organization}</p>
                      <p><strong className="text-ink-soft">Date:</strong> {req.date}</p>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isApprovingId !== null}
                        onClick={() => handleApproveHoursRequest(req, false)}
                        className="w-1/2 h-9 text-xs font-semibold tracking-wide text-red-600 hover:bg-red-50 border border-line cursor-pointer"
                      >
                        Decline
                      </Button>
                      <Button
                        type="button"
                        disabled={isApprovingId !== null}
                        onClick={() => handleApproveHoursRequest(req, true)}
                        className="w-1/2 h-9 text-xs font-semibold tracking-wide bg-blue-dark hover:bg-[#153343] text-white cursor-pointer"
                      >
                        {isApprovingId === req.id ? "Approving..." : "Approve ✓"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
