import { useEffect, useState } from 'react';
import { RefreshCw, TrendingUp, Hash } from 'lucide-react';
import { API_BASE_URL } from '../../lib/config';
import { auth } from '../../firebase/config';
import { reportError } from '../../lib/errors';
import { cn } from '../../lib/utils';

/**
 * The numbers, split into what means something and what does not.
 *
 * The split is the whole design. Presenting registrations beside completed
 * placements invites the conclusion that they are comparable, and they are not:
 * every Ontario student needs 40 hours to graduate, so registrations are
 * mandate-driven and cost nothing, postings are free and unlimited, and an
 * application is one click. All of those can climb while nothing real happens.
 *
 * Signal is what required BOTH sides to act — an organization decided, a
 * student attended, a supervisor confirmed. Those are the rows worth watching,
 * so they are shown first, larger, and with the vanity counts collapsed
 * underneath rather than alongside.
 *
 * Loaded on demand rather than on mount: it reads every collection, and a
 * developer opening a different tab should not pay for that.
 */

interface Metrics {
  generatedAt: string;
  signal: {
    placementRate: number;
    opportunitiesWithAnAccept: number;
    completedPlacements: number;
    hoursConfirmed: number;
    studentsWithAnyHours: number;
    studentsAt40: number;
    acceptanceRate: number;
    medianDaysToDecision: number | null;
    decisionsMeasured: number;
  };
  counts: {
    students: number;
    organizations: number;
    orgsByStatus: Record<string, number>;
    opportunities: number;
    openOpportunities: number;
    applications: number;
    applicationsByStatus: Record<string, number>;
    hoursRequests: number;
    openReports: number;
    totalReports: number;
  };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Figure({
  label, value, hint, emphasis,
}: { label: string; value: string; hint?: string; emphasis?: boolean }) {
  return (
    <div className={cn(
      'rounded-lg border p-5',
      emphasis ? 'border-blue-dark/20 bg-blue-dark/5' : 'border-line bg-white',
    )}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={cn(
        'mt-1.5 font-semibold tabular-nums text-ink',
        emphasis ? 'text-3xl' : 'text-2xl',
      )}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-muted leading-relaxed">{hint}</p>}
    </div>
  );
}

export default function MetricsTab() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/metrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
      setMetrics(body);
    } catch (err: any) {
      // A failed read must not render as "everything is zero" — that is the bug
      // class this whole codebase has been hunting.
      setError(reportError('load metrics', err, 'Could not calculate the metrics just now.'));
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const s = metrics?.signal;
  const c = metrics?.counts;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-ink">How it is actually going</h2>
          <p className="text-sm text-ink-soft mt-1 max-w-2xl leading-relaxed">
            Opening this tab also refreshes the public figures shown on the home page.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-line bg-white text-sm font-semibold text-ink hover:border-blue-dark/40 disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          {loading ? 'Calculating…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {loading && !metrics && (
        <p className="text-sm text-ink-muted">Reading every collection — this takes a moment.</p>
      )}

      {s && c && (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-dark" />
              Signal — both sides had to act for these to move
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Figure
                emphasis
                label="Placement rate"
                value={pct(s.placementRate)}
                hint={`${s.opportunitiesWithAnAccept} of ${c.opportunities} postings got at least one accepted applicant. The headline: this is whether matching beats listing, and the graduation mandate cannot inflate it.`}
              />
              <Figure
                emphasis
                label="Median days to decision"
                value={s.medianDaysToDecision === null ? '—' : String(s.medianDaysToDecision)}
                hint={s.decisionsMeasured === 0
                  ? 'No application has been decided yet. Measurable from the very first one.'
                  : `Across ${s.decisionsMeasured} decided application${s.decisionsMeasured === 1 ? '' : 's'}. What a listings board structurally cannot improve.`}
              />
              <Figure
                emphasis
                label="Hours confirmed"
                value={String(s.hoursConfirmed)}
                hint="Signed off by the organisation that supervised them. The thing a student actually needed."
              />
              <Figure
                label="Completed placements"
                value={String(s.completedPlacements)}
                hint="A student and an organisation with confirmed hours between them."
              />
              <Figure
                label="Acceptance rate"
                value={pct(s.acceptanceRate)}
                hint="Of applications that got a decision either way."
              />
              <Figure
                label="Students with any hours"
                value={`${s.studentsWithAnyHours}${s.studentsAt40 ? ` · ${s.studentsAt40} at 40` : ''}`}
                hint="Reached the graduation requirement through this platform."
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
              <Hash className="w-4 h-4 text-ink-muted" />
              Counts — these rise whether or not anything happens
            </h3>
            <p className="text-xs text-ink-muted max-w-2xl leading-relaxed">
              Registrations are mandate-driven and cost nothing. Postings are free and
              unlimited. An application is one click. Useful for context, misleading as
              a measure of progress.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <Figure label="Students" value={String(c.students)} />
              <Figure label="Organisations" value={String(c.organizations)} />
              <Figure
                label="Verified orgs"
                value={String(c.orgsByStatus.verified || 0)}
                hint={`${c.orgsByStatus.pending || 0} awaiting review`}
              />
              <Figure label="Opportunities" value={`${c.openOpportunities} open / ${c.opportunities}`} />
              <Figure label="Applications" value={String(c.applications)} />
              <Figure label="Hours requests" value={String(c.hoursRequests)} />
              <Figure
                label="Open reports"
                value={String(c.openReports)}
                hint={c.totalReports ? `${c.totalReports} in total` : undefined}
              />
            </div>
          </section>

          <p className="text-xs text-ink-muted">
            Calculated {new Date(metrics.generatedAt).toLocaleString()}.
          </p>
        </>
      )}
    </div>
  );
}
