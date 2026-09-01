import { Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/utils';
import type { Application } from '../../types';

/**
 * The applications tab of the organization dashboard: search box, status
 * filter, and the list of recent applicants.
 *
 * Moved verbatim from OrgDashboard. Filtering state stays in the page — the
 * search memo (filteredApplications) reads recentApplications, which the page
 * owns and mutates optimistically when a decision is made.
 */
export default function OrgApplicationsTab({
  filteredApplications,
  appSearchTerm,
  onSearchChange,
  filterTab,
  onFilterChange,
  onOpenReview,
}: {
  filteredApplications: Application[];
  appSearchTerm: string;
  onSearchChange: (value: string) => void;
  filterTab: 'all' | 'pending' | 'accepted';
  onFilterChange: (tab: 'all' | 'pending' | 'accepted') => void;
  /** Opens the review dialog; the page owns the server-side profile fetch. */
  onOpenReview: (app: Application) => void;
}) {
  // lg:col-span-3 was left over from a grid that no longer wraps this tab, so
  // on a wide screen the applicant list rendered at about half the available
  // width with the rest of the page empty.
  return (
        <section className="space-y-6">


          {/* The search input that was never rendered. appSearchTerm, its setter
              and the filteredApplications memo were all written; only the control
              was missing, so the feature existed in the bundle and nowhere on
              screen. */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
              Recent Applications
            </h2>
            <div className="relative flex-1 sm:max-w-xs">
              <label htmlFor="app-search" className="sr-only">Search applications</label>
              <input
                id="app-search"
                type="text"
                placeholder="Search by name, opportunity, or status…"
                value={appSearchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full text-xs font-semibold bg-paper-2 px-4 py-3 h-11 rounded-lg border border-line outline-none focus:ring-1 focus:ring-blue-dark focus:bg-white transition-all"
              />
              {appSearchTerm && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  aria-label="Clear application search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink text-lg leading-none"
                >
                  ×
                </button>
              )}
            </div>
            <div className="flex bg-paper-3 p-1 rounded-lg">
              {(["all", "pending", "accepted"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => onFilterChange(tab)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all",
                    filterTab === tab
                      ? "bg-white text-blue-dark"
                      : "text-ink-soft hover:text-ink",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <Card className="overflow-hidden border-none rounded-lg bg-white shadow-card">
            <div className="divide-y divide-line-light">
              {/* filteredApplications, not recentApplications. The memo and its
                  search state were fully written and consumed by nothing, so the
                  search box below fed a list nobody rendered. */}
              {filteredApplications.filter(
                (a) => filterTab === "all" || a.status === filterTab,
              ).length > 0 ? (
                filteredApplications
                  .filter((a) => filterTab === "all" || a.status === filterTab)
                  .map((app) => (
                    <div
                      key={app.id}
                      className="p-8 hover:bg-paper-2 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row justify-between md:items-center gap-6 mb-4">
                        <div className="flex gap-4 items-center">
                          <div className="w-14 h-14 rounded-lg bg-blue-dark/5 flex items-center justify-center text-blue-dark font-semibold text-xl">
                            {app.studentName?.[0] || "S"}
                          </div>
                          <div>
                            <h4 className="font-bold text-ink text-lg leading-tight">
                              {app.studentName || "Student"}
                            </h4>
                            <p className="text-xs font-semibold text-ink-soft tracking-wide mt-1">
                              For{" "}
                              <span className="text-blue-dark">
                                {app.opportunityTitle}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={
                              app.status === "accepted"
                                ? "success"
                                : app.status === "rejected"
                                  ? "danger"
                                  : "warning"
                            }
                            className="font-bold border-none px-3 py-1"
                          >
                            {app.status.toUpperCase()}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-10 h-10 p-0 rounded-lg hover:bg-white transition-all"
                            onClick={() => onOpenReview(app)}
                          >
                            <Eye className="w-4 h-4 text-ink-soft" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs font-semibold tracking-wide h-11 rounded-lg border-blue-dark/10 text-blue-dark hover:bg-blue-dark/5 transition-all gap-2"
                          onClick={() => onOpenReview(app)}
                        >
                          <Eye className="w-4 h-4" />{" "}
                          {app.status === "pending"
                            ? "Review Application"
                            : "View Details"}
                        </Button>
                      </div>
                    </div>
                  ))
              ) : (
                /*
                 * This is the coordinator's landing screen now, so it has to do
                 * more than report nothing. NN/g's requirement for an empty
                 * state is three parts: say what the state IS, say what would
                 * appear here and how, and offer the action that resolves it.
                 * A bare "No applications" satisfies one of the three and reads
                 * as a broken account rather than a new one.
                 */
                <EmptyState
                  title="No applications yet"
                  body="When a student applies to one of your postings, they appear here with their school, availability and resume so you can decide."
                  action={{ label: 'Post an opportunity', to: '/org/opportunities/new' }}
                />
              )}
            </div>
          </Card>
        </section>
        
  );
}
