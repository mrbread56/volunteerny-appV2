/**
 * The date logic, run in timezones that break naive date code.
 *
 *   npm run test:tz
 *
 * Every date test in this project has only ever run in the machine's own
 * timezone. That is the one zone where a timezone bug is invisible — and this
 * app computes an opportunity's real date from a stored local string plus a
 * weekday, which is exactly the shape that goes wrong elsewhere. A UTC-offset
 * bug in opportunity editing was fixed on 13 Aug 2026 and would not have been
 * caught by any test here.
 *
 * The zones are chosen to be awkward on purpose:
 *
 *   UTC                  the baseline
 *   America/Toronto      the users' zone, and it observes DST
 *   Asia/Tokyo           ahead of UTC, no DST
 *   Pacific/Kiritimati   UTC+14, the furthest ahead any place is
 *   Australia/Lord_Howe  UTC+10:30, a HALF-HOUR offset with a 30-minute DST
 *                        shift — the case that breaks code assuming whole hours
 *
 * Each zone runs in its own child process with TZ set in that child's
 * environment. It is done this way rather than with `TZ=x npm test` because on
 * Windows an inline TZ from Git Bash does not reach Node's ICU for IANA names:
 * `TZ=Asia/Tokyo` silently reported the SYSTEM offset, so a matrix run that way
 * tests one zone five times and reports five passes. The offset is printed and
 * asserted below precisely so that failure can never be silent again.
 */
import { spawnSync } from 'node:child_process';

type Zone = { tz: string; expectedOffset: number; note: string };

// getTimezoneOffset() returns minutes BEHIND UTC, so UTC+9 is -540.
const ZONES: Zone[] = [
  { tz: 'UTC', expectedOffset: 0, note: 'baseline' },
  { tz: 'America/Toronto', expectedOffset: 240, note: "the users' zone, observes DST" },
  { tz: 'Asia/Tokyo', expectedOffset: -540, note: 'ahead of UTC, no DST' },
  { tz: 'Pacific/Kiritimati', expectedOffset: -840, note: 'UTC+14, furthest ahead on earth' },
  { tz: 'Australia/Lord_Howe', expectedOffset: -630, note: 'UTC+10:30, half-hour offset' },
];

const SPECS = [
  'tests/property-fuzz.spec.ts',
  'tests/opportunity-date.spec.ts',
  'tests/format-date.spec.ts',
];

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

let failed = 0;
console.log('Date logic across timezones\n');

for (const { tz, expectedOffset, note } of ZONES) {
  const env = { ...process.env, TZ: tz };

  // Prove the zone actually took effect before trusting anything that follows.
  const probe = spawnSync(
    process.execPath,
    ['-e', "process.stdout.write(String(new Date('2026-08-14T12:00:00Z').getTimezoneOffset()))"],
    { env, encoding: 'utf8' },
  );
  const actual = Number(probe.stdout);

  if (actual !== expectedOffset) {
    console.error(
      `[SKIP] ${tz.padEnd(20)} this platform reported offset ${actual}, expected ${expectedOffset} — ` +
      'the zone did not apply, so running the suite here would prove nothing',
    );
    failed++;
    continue;
  }

  const run = spawnSync(npx, ['playwright', 'test', ...SPECS, '--project=chromium', '--reporter=line', '--workers=1'], {
    env, encoding: 'utf8', shell: process.platform === 'win32',
  });
  const out = `${run.stdout || ''}${run.stderr || ''}`;
  const summary = (out.match(/\d+ (?:passed|failed)[^\n]*/g) || []).join(', ');

  if (run.status === 0) {
    console.log(`[PASS] ${tz.padEnd(20)} offset ${String(actual).padStart(5)}  ${summary}   (${note})`);
  } else {
    console.error(`[FAIL] ${tz.padEnd(20)} offset ${String(actual).padStart(5)}  ${summary}   (${note})`);
    const detail = out.split('\n').filter((l) => /Error|expect|✘/.test(l)).slice(0, 6);
    for (const line of detail) console.error(`         ${line.trim()}`);
    failed++;
  }
}

console.log(`\n${ZONES.length - failed} of ${ZONES.length} timezones clean`);
process.exit(failed ? 1 : 0);
