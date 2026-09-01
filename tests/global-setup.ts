/**
 * Sweep stale test fixtures before the suite runs.
 *
 * Every spec here cleans up in an `afterAll`, which is the right thing and is
 * not enough: `afterAll` does not run when the process is killed. A cancelled
 * run, a crash, a closed laptop or CI's cancel-in-progress leaves the fixture
 * behind — and because `.firebaserc` names one Firebase project, "behind"
 * means in the same database real students use.
 *
 * That is not hypothetical. Three separate leaks were found in production this
 * way: an organisation with a live, applyable opportunity visible to real
 * students; a "Capture Student" whose seeded hours broke two of the eight
 * invariants in check:integrity; and a stranded password-check account.
 *
 * Running the janitor at the START rather than the end is the part that
 * matters: teardown is exactly what a killed process skips, so a leak from the
 * previous run is cleared by the next one regardless of how the previous one
 * died.
 *
 * scripts/cleanup-test-data.ts is deliberately conservative — it matches only
 * the fixed prefixes the specs generate plus @example.com, it never touches an
 * address outside those patterns, and it leaves anything younger than 30
 * minutes alone so it cannot race a suite that is still running. That last
 * guard is why this is safe to run unconditionally here.
 *
 * A failure is logged and ignored: the janitor must never be the reason the
 * suite cannot start.
 */
import { spawnSync } from 'child_process';

export default function globalSetup() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return;

  const res = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsx', 'scripts/cleanup-test-data.ts', '--confirm'],
    { encoding: 'utf8', timeout: 120_000 },
  );

  const out = `${res.stdout || ''}${res.stderr || ''}`;
  const line = out.split('\n').find((l) => /deleted \d+ test account/.test(l));
  if (line) console.log(`[global-setup] ${line.trim()}`);
  else if (res.status !== 0) console.warn('[global-setup] fixture sweep did not complete; continuing.');
}
