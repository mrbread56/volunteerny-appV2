import { Printer, Send, Trophy } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { cn } from '../../lib/utils';

/**
 * The hour tracker: the 40-hour progress bar, submitted claims, and the
 * buttons that drive the whole product — log hours, chase a coordinator,
 * print the record.
 *
 * Moved verbatim from StudentDashboard. Stays mounted and toggles `hidden`,
 * matching how it behaved inline. The goal is Ontario's community involvement
 * requirement, which is why it is a constant and not a prop: there is no
 * student for whom it is a different number.
 */
const HOUR_GOAL = 40;

export default function HoursTracker({
  hidden,
  totalCompletedHours,
  pendingHourCount,
  hoursRequests,
  sendingReminderId,
  reminderSuccessId,
  onOpenLogForm,
  onSendReminder,
  onPrintCertificate,
}: {
  hidden: boolean;
  totalCompletedHours: number;
  pendingHourCount: number;
  hoursRequests: any[];
  /** Which claim's reminder is being sent, and which just succeeded. */
  sendingReminderId: string | null;
  reminderSuccessId: string | null;
  onOpenLogForm: () => void;
  onSendReminder: (request: any) => void;
  onPrintCertificate: () => void;
}) {
  const hourGoal = HOUR_GOAL;
  return (
              <section className={hidden ? "hidden" : ""}>
              <h2 className="text-xl font-bold text-ink flex items-center gap-2 uppercase tracking-tight">
                <Trophy className="text-blue-dark w-5 h-5" />
                Hour Tracker
              </h2>
              <Card className="p-8 border border-line/50 rounded-lg bg-white space-y-6">
                {/* Hours Gauge */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm font-extrabold">
                    <span className="text-ink font-black tracking-wide ">
                      Volunteering Progress
                    </span>
                    <span className="text-blue-dark font-black text-lg ">
                      {totalCompletedHours} / {hourGoal} hrs
                    </span>
                  </div>
                  {/* bg-blue-dark is load-bearing. The fill carried NO background
                      utility at all — just " h-full rounded-lg transition-all" —
                      so the width was computed correctly and then painted with
                      nothing. The one visual showing a student how close they are
                      to the 40 hours they need to graduate was an empty grey
                      track at every value, including 39/40. */}
                  <div
                    className="w-full bg-paper-3 h-2.5 rounded-lg overflow-hidden"
                    role="progressbar"
                    aria-valuenow={Math.round(totalCompletedHours)}
                    aria-valuemin={0}
                    aria-valuemax={hourGoal}
                    aria-label={`${totalCompletedHours} of ${hourGoal} volunteer hours completed`}
                  >
                    <div
                      className="h-full rounded-lg bg-blue-dark transition-all"
                      style={{
                        width: `${Math.min((totalCompletedHours / hourGoal) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  {/* The number that actually motivates: what is LEFT. Pending
                      claims are shown separately so a student who submitted
                      hours understands why the bar has not moved. */}
                  <p className="text-xs text-ink-muted text-center">
                    {totalCompletedHours >= hourGoal
                      ? `You've completed all ${hourGoal} hours.`
                      : `${Math.max(0, Math.round((hourGoal - totalCompletedHours) * 10) / 10)} hours to go`}
                    {pendingHourCount > 0 && (
                      <span className="text-amber-dark">
                        {' '}· {pendingHourCount} hr{pendingHourCount === 1 ? '' : 's'} awaiting confirmation
                      </span>
                    )}
                  </p>
                  <div className="pt-1 flex items-center justify-center">
                    <Button
                      onClick={onPrintCertificate}
                      variant="outline"
                      className="w-full h-10 border-blue-dark/20 text-blue-dark hover:bg-blue-dark/5 hover:text-[#153343] font-semibold text-xs uppercase tracking-wider rounded-lg transition-all gap-1.5 cursor-pointer flex items-center justify-center"
                    >
                      <Printer className="w-4 h-4 shrink-0 text-blue-dark" />
                      Print Hours Transcript
                    </Button>
                  </div>
                </div>

                {/* Disclaimer box */}
                <div className="bg-amber/10 border-2 border-dashed border-amber p-6 rounded-lg space-y-3">
                  <h3 className="text-amber-950 font-semibold text-xs uppercase tracking-wider flex items-center gap-2">
                    <span>⚠️</span> REQUIREMENT DISCLAIMER
                  </h3>

                  {/* Deliberately larger than the copy around it, and phrased
                      without hedging. "may still require" reads as "probably
                      not" — and a student who believes this page replaces their
                      board's form finds out in their graduating year, when it is
                      far too late to go back and collect signatures. */}
                  <p className="text-[13px] text-amber-950 leading-relaxed font-bold">
                    <strong className="text-[15px]">You still need your school's own community involvement form, signed by your supervisor.</strong>
                  </p>
                  <p className="text-[12px] text-amber-900 leading-relaxed font-semibold mt-2">
                    Volunteer North York tracks your hours here so you can see your
                    progress and your leaderboard position. It is <strong>not</strong> an
                    official record and no school board accepts it in place of their
                    own form. Print your hours from here to help you fill that form
                    in — then get it signed.
                  </p>
                </div>

                 {/* Unofficial Disclaimer Warning Box */}
                <div className="bg-white border border-line rounded-lg p-5 text-center space-y-3 shadow-sm">
                  <div>
                    <p className="text-orange-800 font-semibold text-xs uppercase tracking-wide">
                      Hour Verification Info
                    </p>
                    <p className="text-xs text-orange-700 leading-relaxed font-semibold mt-1">
                      Volunteer hours must be verified and logged directly by your
                      coordinators or supervisors. Only they can verify and approve your hours online.
                    </p>
                  </div>
                  <div className="pt-1.5 border-t border-amber/20">
                    <Button
                      onClick={() => onOpenLogForm()}
                      className="w-full h-10 bg-blue-dark hover:bg-blue-dark hover:scale-[1.02] text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all gap-1.5 cursor-pointer"
                    >
                      Request Hours Verification
                    </Button>
                  </div>
                </div>

                {hoursRequests.length > 0 && (
                  <div className="pt-6 border-t border-line space-y-4">
                    <p className="text-xs font-semibold uppercase text-ink-soft tracking-wider ml-1">
                      Submitted Claims ({hoursRequests.length})
                    </p>
                    <div className="flex items-start gap-2 p-3 bg-amber/10 border border-amber/40 rounded-lg">
                      <span aria-hidden="true" className="text-sm leading-none mt-px">⚠️</span>
                      <p className="text-[11px] text-amber-900 font-semibold leading-relaxed">
                        Pending claims do not count toward your hour total until
                        the coordinator approves them. If your coordinator says
                        they never received the verification email, ask them to
                        check their spam or junk folder, then use Remind.
                      </p>
                    </div>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                      {hoursRequests.map((req) => (
                        <div
                          key={req.id}
                          className="p-4 rounded-lg border border-line bg-paper-2/50 space-y-3 transition-all hover:bg-paper-2"
                        >
                          <div className="flex justify-between items-start">
                            <div className="space-y-0.5">
                              <p className="font-bold text-ink text-sm leading-tight">
                                {req.activity}
                              </p>
                              <p className="text-xs text-ink-soft font-semibold tracking-wide uppercase">
                                {req.organization} • {req.date}
                              </p>
                            </div>
                            <span className="font-semibold text-xs text-blue-dark bg-blue-dark/5 px-2 py-0.5 rounded-lg shrink-0">
                              {req.hours} hrs
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-line/50">
                            <span
                              className={cn(
                                "text-xs font-semibold tracking-wide px-2 py-1 rounded-lg",
                                req.status === "approved"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : req.status === "declined"
                                    ? "bg-red-50 text-red-700"
                                    : "bg-amber/10 text-amber-700"
                              )}
                            >
                              {req.status === "approved"
                                ? "Approved"
                                : req.status === "declined"
                                  ? "Declined"
                                  : "Pending"}
                            </span>

                            {req.status === "pending" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={sendingReminderId === req.id || reminderSuccessId === req.id}
                                onClick={() => onSendReminder(req)}
                                className="h-7 text-xs px-2 font-semibold tracking-wide hover:bg-paper-3 text-ink-soft cursor-pointer text-right flex items-center gap-1 shrink-0"
                              >
                                {sendingReminderId === req.id ? (
                                  "Sending..."
                                ) : reminderSuccessId === req.id ? (
                                  "✓ Sent!"
                                ) : (
                                  <>
                                    <Send className="w-2.5 h-2.5" /> Remind
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </section>
  );
}
