/**
 * Break the code on purpose, and check the tests notice.
 *
 *   npm run test:mutation
 *
 * Every other suite answers "does the code work?". This one answers the
 * question underneath it: **are the tests actually load-bearing, or do they
 * pass because they assert nothing that matters?** A green suite over a
 * codebase where a guard can be deleted without complaint is worse than no
 * suite, because it manufactures confidence.
 *
 * Each mutation below is a single edit a careless refactor could plausibly
 * make: an off-by-one, a flipped comparison, a deleted guard, a widened bound.
 * The file is patched, the named tests run, and the mutation is reverted.
 *
 *   SURVIVED  the tests still passed with broken code — that is the finding.
 *   KILLED    at least one test failed, which is what should happen.
 *
 * Only offline suites are used: no browser session, no Firebase, no production
 * reads. That keeps this runnable on a laptop and, more importantly, keeps it
 * runnable when the production database is out of quota.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

type Mutation = {
  file: string;
  find: string;
  replace: string;
  what: string;
  /** Specs expected to catch it. */
  specs: string[];
};

const FUZZ = 'tests/property-fuzz.spec.ts';
const DATE = 'tests/opportunity-date.spec.ts';
const MAIL = 'tests/email-templates.spec.ts';

const MUTATIONS: Mutation[] = [
  {
    file: 'src/lib/mfa.ts',
    find: 'return Number.isFinite(stamped) && stamped === authTimeRaw;',
    replace: 'return Number.isFinite(stamped);',
    what: 'MFA: accept any stamped claim, ignoring which sign-in it belongs to',
    specs: [FUZZ],
  },
  {
    file: 'src/lib/mfa.ts',
    find: "  if (claims.mfaVerified !== true) return false;",
    replace: "  if (claims.mfaVerified === 'never') return false;",
    what: 'MFA: stop requiring the verified flag to be true',
    specs: [FUZZ],
  },
  {
    file: 'src/lib/mfa.ts',
    find: '  if (!user) return false;',
    replace: '  if (!user) return true;',
    what: 'MFA: treat a signed-out user as verified',
    specs: [FUZZ],
  },
  {
    file: 'src/lib/opportunityDate.ts',
    find: '      if (delta === 0 && next.getTime() <= from.getTime()) delta = 7;',
    replace: '      if (delta === 0 && next.getTime() < from.getTime()) delta = 7;',
    what: 'recurring dates: off-by-one on "the start time has already passed"',
    specs: [FUZZ, DATE],
  },
  {
    file: 'src/lib/opportunityDate.ts',
    find: '      let delta = (idx - next.getDay() + 7) % 7;',
    replace: '      let delta = (idx - next.getDay() + 6) % 7;',
    what: 'recurring dates: weekday arithmetic off by one day',
    specs: [FUZZ, DATE],
  },
  {
    file: 'src/lib/opportunityDate.ts',
    find: '    return Number.isNaN(d.getTime()) ? from : d;',
    replace: '    return d;',
    what: 'single dates: return an Invalid Date instead of falling back',
    specs: [FUZZ],
  },
  {
    file: 'server/emailTemplates.ts',
    find: '    .replace(/</g, "&lt;")',
    replace: '    .replace(/</g, "<")',
    what: 'email: stop escaping the opening angle bracket',
    specs: [MAIL],
  },
  {
    file: 'server/emailTemplates.ts',
    find: '  if (value === null || value === undefined) return "";',
    replace: '  if (value === null || value === undefined) return String(value);',
    what: 'email: render the literal words "null" and "undefined"',
    specs: [MAIL],
  },
];

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function runSpecs(specs: string[]): boolean {
  const r = spawnSync(npx, ['playwright', 'test', ...specs, '--project=chromium', '--reporter=line', '--workers=1'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return r.status === 0;
}

console.log('Mutation testing — breaking the code to see whether the tests object\n');

let survived = 0;
let killed = 0;

for (const m of MUTATIONS) {
  const original = readFileSync(m.file, 'utf8');
  if (!original.includes(m.find)) {
    console.error(`[ERROR ] ${m.what}\n         anchor not found in ${m.file} — the mutation could not be applied`);
    survived++; // Treat as a failure: an unapplied mutation proves nothing.
    continue;
  }

  writeFileSync(m.file, original.replace(m.find, m.replace), 'utf8');
  let passedWithBrokenCode: boolean;
  try {
    passedWithBrokenCode = runSpecs(m.specs);
  } finally {
    // Always restore, including on a crash — leaving a mutation in the tree
    // would be a far worse bug than the one being tested for.
    writeFileSync(m.file, original, 'utf8');
  }

  if (passedWithBrokenCode) {
    console.error(`[SURVIVED] ${m.what}`);
    console.error(`           ${m.file} — the suite passed with this broken, so nothing covers it`);
    survived++;
  } else {
    console.log(`[KILLED  ] ${m.what}`);
    killed++;
  }
}

console.log(`\n${killed} killed, ${survived} survived, out of ${MUTATIONS.length}`);
if (survived) {
  console.error('\nA surviving mutation means the code can be broken that way without any test noticing.');
}
process.exit(survived ? 1 : 0);
