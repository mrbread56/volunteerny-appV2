import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../lib/config';

/**
 * What this platform has actually done, stated in public.
 *
 * The figures come from `GET /api/metrics/public`, which reads a small cached
 * document rather than counting anything — it is reachable without signing in,
 * so a scan per visitor would be both a cost and an amplification vector. That
 * document is refreshed whenever a developer opens the metrics tab.
 *
 * THE THRESHOLD IS THE POINT.
 *
 * This renders nothing until there is something true and worth saying. Right
 * now the honest figure is zero hours and zero verified organisations, and
 * "helped students complete 0 hours" is not a modest claim — it is an
 * advertisement for emptiness, and it would sit on the first screen a
 * fifteen-year-old sees. A number that has to be explained away is worse than
 * no number.
 *
 * So the component is written and wired and stays invisible until the platform
 * has something to show. No code change is needed when that happens; it simply
 * appears. That is deliberate: the alternative is remembering to add it later,
 * which is the same as never.
 */

interface PublicMetrics {
  hoursConfirmed: number;
  verifiedOrganizations: number;
  studentsWithAnyHours: number;
}

/** Below this, the sentence would be weaker than silence. */
const MIN_HOURS = 25;
const MIN_ORGS = 2;

export default function ImpactCounter() {
  const [metrics, setMetrics] = useState<PublicMetrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/metrics/public`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setMetrics(d);
      })
      // Silent on purpose: this is a decoration on a landing page, and a
      // visitor does not need to know our metrics endpoint is unhappy. Every
      // other failure in this app is surfaced; this is the one that genuinely
      // should not be.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!metrics) return null;
  if (metrics.hoursConfirmed < MIN_HOURS || metrics.verifiedOrganizations < MIN_ORGS) return null;

  const hours = Math.round(metrics.hoursConfirmed);

  return (
    <div className="border-t border-line pt-8 mt-2">
      <p className="text-lg sm:text-xl text-ink leading-relaxed max-w-2xl">
        Students have completed{' '}
        <strong className="font-semibold text-blue-dark tabular-nums">{hours.toLocaleString()}</strong>{' '}
        volunteer {hours === 1 ? 'hour' : 'hours'} through Volunteer North York, with{' '}
        <strong className="font-semibold text-blue-dark tabular-nums">{metrics.verifiedOrganizations}</strong>{' '}
        verified {metrics.verifiedOrganizations === 1 ? 'organisation' : 'organisations'}.
      </p>
      <p className="text-sm text-ink-muted mt-2">
        Every hour here was confirmed by the organisation that supervised it.
      </p>
    </div>
  );
}
