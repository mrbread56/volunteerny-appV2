import { ShieldAlert, ShieldCheck, Sparkles, Paperclip } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import AttachmentPreview from '../../components/AttachmentPreview';

/**
 * The safety-reports tab of the developer console.
 *
 * Lifted out of DeveloperDashboard as part of splitting an 1,836-line
 * component. At 232 lines it was the largest of the six branches.
 *
 * Unlike the other dashboards, this file's tabs are branches of one ternary
 * chain rather than independent `&&` guards, so only the branch BODY moves —
 * the chain itself is untouched. Restructuring the chain is a separate change
 * and a riskier one; doing both at once would make a regression impossible to
 * attribute.
 *
 * These are safety reports about people, frequently involving minors, so the
 * one behaviour worth stating: resolving a report writes to Firestore and the
 * caller surfaces any failure. A report that silently stays open while the UI
 * says it was handled is the worst outcome this screen can produce, and it did
 * exactly that before the write result was checked.
 *
 * Moved verbatim. Behaviour is unchanged.
 */
export default function ReportsTab({
  reports,
  students,
  orgs,
  onUpdateReportStatus,
  onToggleBan,
}: {
  reports: any[];
  /** Used to resolve a reported party's name from their uid. */
  students: any[];
  orgs: any[];
  onUpdateReportStatus: (reportId: string, newStatus: 'resolved' | 'dismissed') => void;
  /** Suspending a reported account straight from the report. */
  onToggleBan: (userId: string, isCurrentlyBanned: boolean) => void;
}) {
  // Local alias so the moved markup needs no edits.
  const handleUpdateReportStatus = onUpdateReportStatus;
  const handleToggleBan = onToggleBan;
  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pb-4 border-b border-line-light">
          <div>
            <h2 className="text-xl font-bold text-ink uppercase tracking-tight flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-600 animate-pulse" /> Inbound Violations Queue
            </h2>
            <p className="text-xs text-ink-muted font-semibold mt-1">
              Review and act on reported safe space violations from our students and organizations.
            </p>
          </div>
        </div>

        {reports.length === 0 ? (
          <Card className="p-16 text-center border-2 border-dashed border-line-light rounded-lg bg-white space-y-4">
            <ShieldCheck className="w-12 h-12 text-blue-dark mx-auto" />
            <h3 className="text-base font-semibold text-ink uppercase">Secure Safe Space Guaranteed</h3>
            <p className="text-ink-muted text-xs font-semibold max-w-sm mx-auto leading-relaxed">
              Zero safety reports or violations submitted in the system. The volunteering network remains highly secure.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {reports.map((report) => {
              const statusBadge = report.status === 'resolved' 
                ? 'bg-blue-dark/5 text-blue-dark border-blue-dark/10' 
                : report.status === 'dismissed'
                  ? 'bg-paper-2 text-ink-muted border-line'
                  : 'bg-red-50 text-red-600 border-red-100 animate-pulse';

              const isUserBanned = report.reportedUserRole === 'student'
                ? students.find(s => s.uid === report.reportedUserId)?.isBanned || false
                : orgs.find(o => o.uid === report.reportedUserId)?.isBanned || false;

              return (
                <Card key={report.id} className="rounded-lg border border-red-100 bg-white overflow-hidden relative animate-fadeIn">
                  <div className="absolute top-0 left-0 w-2 h-full bg-red-500" />
                  <CardContent className="p-6 md:p-8 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-xs font-bold uppercase text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3" /> Safe Space Report
                          </span>
                          <span className={`inline-block text-xs font-semibold uppercase px-2 py-0.5 rounded border ${statusBadge}`}>
                            {report.status?.toUpperCase() || 'PENDING'}
                          </span>
                          <span className="text-xs text-ink-muted font-semibold font-mono">REPORT ID: {report.id}</span>
                        </div>

                        <h3 className="text-lg font-bold text-ink leading-tight">Reason: {report.reason}</h3>

                        <div className="bg-paper-2 p-4 border border-line-light rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs font-semibold text-ink-muted">
                          <div>
                            <span className="text-xs text-ink-muted uppercase tracking-widest block font-semibold">Reporter (Initiator)</span>
                            <p className="text-ink-soft font-bold">{report.reportingUserName || 'User'}</p>
                            <p className="text-xs font-mono font-medium text-ink-muted">{report.reportingUserEmail || 'N/A'}</p>
                          </div>
                          <div className="hidden md:block text-ink-muted">→</div>
                          <div>
                            <span className="text-xs text-ink-muted uppercase tracking-widest block font-semibold">Reported Target User</span>
                            <span className="text-red-600 text-xs uppercase font-bold mr-1">[{report.reportedUserRole}]</span>
                            <span className="text-ink-soft font-bold">{report.reportedUserName}</span>
                            <p className="text-xs font-mono font-medium text-ink-muted">UID: {report.reportedUserId}</p>
                          </div>
                        </div>
                      </div>

                      <div className="text-ink-muted text-xs font-semibold shrink-0 font-mono">
                        {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>

                    <div className="prose">
                      <span className="text-xs text-ink-muted uppercase tracking-widest block font-semibold">Description of Violation</span>
                      <p className="text-ink-muted text-xs leading-relaxed font-semibold bg-rose-50/10 p-4 border border-red-50 rounded-lg italic">
                        "{report.description}"
                      </p>
                    </div>

                    {/* Display file attachment if present */}
                    {report.attachmentName && (
                      <div className="bg-paper-2 border border-line/80 rounded-lg p-4 text-xs space-y-3 animate-fadeIn font-semibold">
                        <div className="flex items-center gap-2 text-ink-soft">
                          <Paperclip className="w-4 h-4 text-red-600" />
                          <span>Attached Safe Space Proof/Screenshot: <strong className="font-semibold text-[#FF6B35]">{report.attachmentName}</strong> ({report.attachmentSize || 'Unknown size'})</span>
                        </div>
                        {report.attachmentDescription && (
                          <div className="pl-6 border-l-2 border-slate-300 italic text-ink-muted">
                            "Attachment Description: {report.attachmentDescription}"
                          </div>
                        )}
                        {(report.attachmentUrl || report.attachmentData) && (
                          <AttachmentPreview
                            value={report.attachmentUrl || report.attachmentData}
                            name={report.attachmentName}
                          />
                        )}
                      </div>
                    )}

                    {/* Gemini AI Violation audit Frame */}
                    {report.aiOverview && (
                      <div className="border border-red-100 bg-red-50/5 p-5 rounded-lg space-y-3 relative overflow-hidden animate-fadeIn">
                        <div className="flex items-center gap-2 text-red-950 border-b border-red-100/40 pb-2">
                          <Sparkles className="w-4 h-4 text-red-600" />
                          <span className="text-xs uppercase tracking-widest font-bold text-ink-soft">AI Trust & Safety Analysis</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold leading-relaxed">
                          <div className="space-y-1">
                            <span className="text-xs text-ink-muted uppercase tracking-widest block font-bold">AI Urgency Risk Assessment</span>
                            <span className={`inline-block text-xs font-bold uppercase px-2 py-0.5 rounded ${
                              report.aiOverview.urgency === 'critical' || report.aiOverview.urgency === 'high'
                                ? 'bg-red-500/10 text-red-600 border border-red-200'
                                : 'bg-blue-dark/10 text-blue-dark border border-blue-dark/20'
                            }`}>
                              {report.aiOverview.urgency || 'HIGH RISK'}
                            </span>
                          </div>

                          <div className="space-y-1 md:col-span-2">
                            <span className="text-xs text-ink-muted uppercase tracking-widest block font-bold">Safety threat summary</span>
                            <p className="text-ink-soft font-bold leading-relaxed">{report.aiOverview.summary}</p>
                          </div>

                          {report.aiOverview.suggestedFix && (
                            <div className="space-y-1 md:col-span-2 bg-paper-2 p-4 border border-line rounded-lg">
                              <span className="text-xs text-ink-muted uppercase tracking-widest block font-bold">AI Safety Action recommendations</span>
                              <p className="text-ink-muted font-mono text-[10.5px] leading-relaxed italic">
                                {report.aiOverview.suggestedFix}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action buttons (Resolve/Dismiss & Block/Unblock offender) */}
                    <div className="pt-4 border-t border-line-light flex flex-wrap gap-3 items-center justify-between">
                      <div className="flex gap-2">
                        {report.status !== 'resolved' && (
                          <Button 
                            size="sm" 
                            className="bg-blue-dark hover:bg-[#0F1E29] text-white font-bold uppercase text-xs tracking-wider"
                            onClick={() => handleUpdateReportStatus(report.id, 'resolved')}
                          >
                            Resolve Issue
                          </Button>
                        )}
                        {report.status !== 'dismissed' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="font-bold uppercase text-xs tracking-wider"
                            onClick={() => handleUpdateReportStatus(report.id, 'dismissed')}
                          >
                            Dismiss Report
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isUserBanned ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase text-red-600 bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> SUSPENDED</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="font-bold uppercase text-xs tracking-wider"
                              onClick={() => handleToggleBan(report.reportedUserId, true)}
                            >
                              Restore User Account
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-red-50 hover:bg-red-100 border-red-100 text-red-600 font-bold uppercase text-xs tracking-wider"
                            onClick={() => handleToggleBan(report.reportedUserId, false)}
                          >
                            LOCK/SUSPEND OFFENDER
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
