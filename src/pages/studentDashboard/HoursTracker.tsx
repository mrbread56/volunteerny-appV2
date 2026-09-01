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
                  <div className="flex justify-between items-center text-sm font-bold">
                    <span className="text-ink font-bold tracking-wide ">
                      Volunteering Progress
                    </span>
                    <span className="text-blue-dark font-bold text-lg ">
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
                </div>

                {/*
                  * Order: what you have, what to do next, the caveat, then the
                  * secondary action.
                  *
                  * This card used to run gauge, Print, an 85-word dashed
                  * disclaimer in three font sizes, a second bordered box whose
                  * heading was orange-800 on orange-700 body, and a third
                  * amber box about spam folders. Request Hours Verification —
                  * the single action this product exists to enable — was the
                  * small uppercase button inside the SECOND box, set smaller
                  * than the disclaimer directly above it telling the student
                  * the hours do not officially count. Roughly 165 words of
                  * caveat wrapped around two buttons.
                  *
                  * Three nested bordered boxes also defeat the grouping they
                  * were meant to create: common region is stronger than
                  * proximity (Palmer 1992), so the innermost box owns the
                  * grouping and the card stops reading as one thing.
                  *
                  * The disclaimer is not softened, only shortened. A student
                  * who believes this page replaces their board's form finds out
                  * in their graduating year.
                  */}
                <Button
                  onClick={() => onOpenLogForm()}
                  size="lg"
                  className="w-full mt-5"
                >
                  Request hours verification
                </Button>

                <p className="mt-3 text-[13px] text-ink-soft leading-relaxed">
                  Your coordinator confirms these hours here, so you can see your
                  progress. <strong className="text-ink">It is not an official record.</strong> You
                  still need your school&apos;s own community involvement form, signed
                  by your supervisor. Print your hours to help you fill it in.
                </p>

                <Button
                  onClick={onPrintCertificate}
                  variant="outline"
                  size="sm"
                  className="w-full mt-3 gap-1.5"
                >
                  <Printer className="w-4 h-4 shrink-0" />
                  Print my hours
                </Button>

                {hoursRequests.length > 0 && (
                  <div className="pt-6 border-t border-line space-y-4">
                    <p className="text-xs font-semibold uppercase text-ink-soft tracking-wider ml-1">
                      Submitted Claims ({hoursRequests.length})
                    </p>
                    {/* One line, not a bordered amber panel with an emoji. The
                        advice is real and worth keeping; the packaging was the
                        third warning box on one card. */}
                    <p className="text-[13px] text-ink-soft leading-relaxed">
                      Pending claims do not count toward your total until the
                      coordinator approves them. If they say the email never
                      arrived, ask them to check spam, then use Remind.
                    </p>
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

                          {/* Why it was declined, when there is a stated reason.
                              A bare "Declined" reads as the coordinator having
                              turned the hours down, which is not what happened
                              when the organisation simply closed its account.
                              The student needs the real cause to know the hours
                              are still theirs to claim another way. */}
                          {/* Always say something, because nothing on the
                              coordinator path writes a reason: /api/hours/approve
                              stores status, decidedAt, declinedBy and declinedAt
                              and no explanation. The only writer of
                              declinedReason is the account-deletion sweep. So a
                              bare red "Declined" was the whole message on the
                              graduation-critical path, while the explanation and
                              the "you can submit it again" instruction existed
                              only inside an email. Applications already do this
                              properly. */}
                          {req.status === "declined" && (
                            <p className="text-xs text-ink-muted leading-relaxed pt-2">
                              {(req as any).declinedReason
                                || 'Your coordinator did not approve this one. Talk to them and then submit the hours again from this page. A declined request cannot be reopened, so it has to be a new submission.'}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </section>
  );
}
