import { Link, useNavigate } from 'react-router-dom';
import { Calendar, FileText, Globe, Mail, Phone, Sparkles, Star } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { formatDate } from '../../lib/utils';
import type { Application } from '../../types';

/**
 * The "Your Applications" tab of the student dashboard.
 *
 * Moved verbatim out of StudentDashboard, which rendered it inline as 180
 * lines in the middle of the page. The section stays MOUNTED and toggles
 * `hidden` rather than unmounting — that is how it behaved inline (the parent
 * animates the whole grid per tab, and unmounting would reset scroll and any
 * expanded rows), so the wrapper keeps that contract.
 *
 * Interactions stay with the page: withdrawing writes to Firestore and rating
 * and receipts open modals the page owns. This component only says what to
 * render and raises its hand.
 */
export default function ApplicationsTab({
  hidden,
  applications,
  orgContacts,
  existingRatings,
  withdrawingId,
  onWithdraw,
  onOpenReceipt,
  onStartRating,
}: {
  hidden: boolean;
  applications: Application[];
  orgContacts: Record<string, any>;
  /** orgId_opportunityId keys the student has already rated, to hide the button. */
  existingRatings: Record<string, boolean>;
  withdrawingId: string | null;
  onWithdraw: (app: Application) => void;
  onOpenReceipt: (app: Application) => void;
  onStartRating: (app: Application) => void;
}) {
  const navigate = useNavigate();
  return (
            <section className={hidden ? "hidden" : ""}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-ink flex items-center gap-2">
                  <Calendar className="text-blue-dark w-5 h-5" />
                  Your Applications
                </h2>
              </div>
              {applications.length > 0 ? (
                <div className="space-y-4">
                  {/* These cards carry no status-coloured left border. It
                      duplicated the <Badge> below, which already spells the
                      status out in words, and colour alone is not an accessible
                      way to carry meaning (WCAG 1.4.1) — a colourblind student,
                      or anyone using a screen reader, got nothing from the
                      stripe and everything from the badge. */}
                  {applications.map((app) => (
                    <Card
                      key={app.id}
                      className="p-6 overflow-hidden relative"
                    >
                      <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-ink text-lg break-words">
                            {app.opportunityTitle || "Opportunity"}
                          </h4>
                          <p className="text-xs text-ink-soft font-medium tracking-wide mt-1">
                            Applied{" "}
                            {formatDate(
                              app.appliedAt
                                ? (app.appliedAt.toDate ? app.appliedAt.toDate() : app.appliedAt)
                                : new Date()
                            )}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 self-start flex-shrink-0">
                          {app.status === "accepted" && (
                            <button
                              title="Placement receipt"
                              className="px-3 py-1.5 text-xs font-semibold tracking-wide bg-white hover:bg-paper-3 text-ink border border-line rounded-lg flex items-center gap-1 transition-all duration-200 whitespace-nowrap rounded-full shadow-sm"
                              onClick={() => onOpenReceipt(app)}
                            >
                              <FileText className="w-3.5 h-3.5 text-amber-dark animate-pulse" />
                              <span>Receipt</span>
                            </button>
                          )}
                          {/* Withdraw. firestore.rules has always permitted a student
                              to set their own application to 'terminated', and no UI
                              anywhere called it — a student who applied to the wrong
                              opportunity had no way to take it back, the detail page
                              said "You've Applied!" forever, and the organization kept
                              counting them as an applicant against its capacity. */}
                          {(app.status === "pending" || app.status === "reviewed" || app.status === "waitlist") && (
                            <button
                              title="Withdraw this application"
                              disabled={withdrawingId === app.id}
                              className="px-3 py-1.5 text-xs font-semibold tracking-wide bg-white hover:bg-rose-50 text-red-600 border border-red-200 rounded-full flex items-center gap-1 transition-all duration-200 whitespace-nowrap disabled:opacity-50"
                              onClick={() => onWithdraw(app)}
                            >
                              <span>{withdrawingId === app.id ? "Withdrawing…" : "Withdraw"}</span>
                            </button>
                          )}
                          {app.status === "accepted" && !existingRatings[`${app.orgId || app.organizationId}_${app.opportunityId}`] && (
                            <button
                              title="Rate this organization"
                              className="px-3 py-1.5 text-xs font-semibold tracking-wide bg-blue-dark/10 hover:bg-blue-dark/20 text-blue-dark border border-blue-dark/20 rounded-full flex items-center gap-1 transition-all duration-200 whitespace-nowrap"
                              onClick={() => onStartRating(app)}
                            >
                              <Star className="w-3.5 h-3.5" />
                              <span>Rate</span>
                            </button>
                          )}
                          <Badge
                            variant={
                              app.status === "accepted"
                                ? "success"
                                : app.status === "rejected" ||
                                    app.status === "terminated"
                                  ? "danger"
                                  : "warning"
                            }
                            className="whitespace-nowrap"
                          >
                            {app.status.toUpperCase()}
                          </Badge>
                        </div>
                      </div>

                      {/* What the badge MEANS. It rendered the raw enum and
                          nothing on the page defined any of the six values.
                          "REVIEWED" reads as a decision, "WAITLIST" reads as a
                          rejection, and "TERMINATED" is a red badge with no
                          explanation at all — on a placement the student had
                          already been accepted into. */}
                      <p className="text-xs text-ink-muted leading-relaxed mt-2">
                        {app.status === "pending" && "The organization has not opened your application yet."}
                        {app.status === "reviewed" && "The organization has read your application and has not decided yet."}
                        {app.status === "accepted" && "You have a place. Contact details are below."}
                        {app.status === "waitlist" && "This opportunity was full when you applied. You are on the waitlist. If the organization frees a place, it goes to whoever has waited longest and we email them."}
                        {app.status === "rejected" && "The organization was not able to offer you a place this time. You can apply again if they post another opportunity."}
                        {app.status === "terminated" && "This placement was ended. If you did not withdraw it yourself, contact the organization to ask why."}
                      </p>

                      {(app.status === "accepted" || app.status === "pending") &&
                        orgContacts[app.opportunityId] && (
                          <div className="mt-4 bg-paper-2 p-6 rounded-lg border border-line animate-in fade-in slide-in- duration-500">
                            <p className="text-xs font-bold text-ink tracking-wide mb-3">
                              Organization Contact Details
                            </p>
                            <div className="flex flex-wrap gap-6">
                              <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-ink-soft" />
                                <a
                                  href={`mailto:${orgContacts[app.opportunityId].email}`}
                                  className="text-sm font-bold text-ink hover:text-blue-dark transition-colors"
                                >
                                  {orgContacts[app.opportunityId].email}
                                </a>
                              </div>
                              {orgContacts[app.opportunityId].phone && (
                                <div className="flex items-center gap-2">
                                  <Phone className="w-4 h-4 text-ink-soft" />
                                  <span className="text-sm font-bold text-ink">
                                    {orgContacts[app.opportunityId].phone}
                                  </span>
                                </div>
                              )}
                              {orgContacts[app.opportunityId].website && (
                                <div className="flex items-center gap-2">
                                  <Globe className="w-4 h-4 text-ink-soft" />
                                  <a
                                    href={
                                      orgContacts[app.opportunityId].website
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-bold text-ink hover:text-blue-dark transition-colors"
                                  >
                                    Website
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                      {app.status === "rejected" &&
                        app.rejectionReason &&
                        app.rejectionReason !==
                          "No reason provided (Silent rejection)" && (
                          <div className="mt-4 bg-red-50 p-4 rounded-lg border border-red-100 flex gap-4 animate-in fade-in slide-in- duration-500">
                            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center text-red-600 flex-shrink-0">
                              <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-red-900 tracking-wide mb-1">
                                Feedback from Organization
                              </p>
                              <p className="text-sm text-red-700 font-bold">
                                {app.rejectionReason}
                              </p>
                              {app.rejectionNote && (
                                <p className="text-xs text-red-600/80 mt-1 leading-relaxed">
                                  "{app.rejectionNote}"
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="p-8 text-center bg-white border-dashed">
                  <p className="text-ink-soft">
                    No applications yet. Start exploring!
                  </p>
                  <Link to="/student/opportunities">
                    <Button variant="outline" className="mt-4">
                      Browse Opportunities
                    </Button>
                  </Link>
                </Card>
              )}
            </section>
  );
}
