# Runbook

What to do when something breaks in production. Written for whoever is on the
other end of a support email, which today is one person.

Each entry says how to recognise the problem, how to confirm it, and how to fix
it. Confirm before fixing. Most of these look alike from a user's description.

---

## Running the test suites

Grouped by what they need, because that determines when you can run them.

**Offline — no network, no database, run these freely and often**

    npm run lint            types, plus the ESM guard for the server entry points
    npm run test:offline    pure logic: dates, email templates, MFA claims, fuzz
    npm run test:tz         the date logic in 5 timezones, incl. UTC+14
    npm run test:mutation   breaks the code on purpose to check the tests notice
    npm run test:rules      firestore.rules on the emulator, per-field

`test:rules` needs a JDK on PATH, because the Firestore emulator is a Java
process. If `java -version` fails, install Temurin 21 and set JAVA_HOME.

**Browser — needs the dev server, which Playwright starts for you**

    npx playwright test                     everything, chromium + webkit
    npx playwright test --project=webkit    Safari only; this is what iOS runs

**Live — these READ AND WRITE THE PRODUCTION DATABASE**

    npm run check:security check:flows check:lifecycle check:signup
    npm run check:concurrency check:integrity

Run these SPARINGLY, and never in a loop. The production database is an
AI-Studio one with a hard daily read ceiling that billing does not lift (see
ROADMAP B19). A day of repeated test runs on 14 Aug 2026 exhausted it and took
production reads down until the quota reset. Until B19 is done, treat every live
run as spending a limited budget that real students also need.

If a live check fails with `RESOURCE_EXHAUSTED`, nothing is broken — the quota
is gone for the day. Wait for the reset rather than retrying.

## An organization cannot get past the verification code screen

**They will say:** "I signed up but the code never arrives", or "I keep getting
sent back to the security check".

This is the most likely support request, because two-factor is mandatory for
organizations and the code arrives by email. Anything that stops delivery locks
the account completely.

### 1. Confirm email is working at all

```bash
npm run check:email
```

If this fails, it is not their account, it is the whole system, and every
organization is locked out. Skip to
[Email delivery is down](#email-delivery-is-down).

### 2. Check it is not simply in their spam folder

The sender is `volunteernorthyork.indevs.in`. Ask them to search for that
domain, not for the word "Volunteer". Codes expire, so have them request a fresh
one after checking.

### 3. Verify the account by hand

If mail is working for everyone else and theirs still does not arrive (a
bouncing address, an aggressive school mail filter), grant the verification
directly:

```bash
npx tsx scripts/grant-mfa.ts them@theirdomain.org
```

This opens a **one-hour window**: any sign-in they start before the deadline is
exempt for that whole session. Tell them to sign out and back in straight away.
After the deadline they are challenged normally again — the grant is not a
permanent bypass and does not need undoing, though you can end it early:

```bash
npx tsx scripts/grant-mfa.ts them@theirdomain.org --revoke
```

The window is measured against Firebase's own record of when they signed in, not
their browser clock, so it cannot be stretched from their end.

**Confirm you are talking to the account owner before doing this.** It bypasses
two-factor on an account that holds contact details for students, most of whom
are minors. Ask them to email from the address on the account.

---

## Email delivery is down

**Symptom:** `npm run check:email` fails, or organizations report codes never
arriving across the board.

**Impact, in order of severity:**
1. **No organization can sign in.** Two-factor is mandatory for them.
2. Students are not told when their application is accepted or rejected.
3. Welcome and hours-confirmation emails are lost.

Students can still sign in. This is an organization-side outage.

### If the key was rejected (401)

The key has been revoked, rotated, or belongs to another account. Issue a new
one at <https://resend.com/api-keys>, then set `RESEND_API_KEY` in **both**:

- `.env` locally
- the Vercel project's environment variables

Then confirm:

```bash
npm run check:email     # expect 4 passes
```

### If the sender domain is not verified

Resend accepts the request and then refuses to deliver. Check the domain's
status at <https://resend.com/domains>. `MAIL_FROM` must use a domain listed
there with status `verified`.

---

## The whole API returns 500

**Symptom:** every `/api/*` route fails at once, including ones that should
return 401.

Almost always a module that failed to load rather than a broken route, because
one bad import takes the entire Express app down. The usual cause is a relative
import missing its `.js` extension: the app's TypeScript config allows it, but
Vercel runs the server as real ESM where it throws at load time.

```bash
npm run check:esm       # catches exactly this
npm run lint            # runs it too
```

---

## A student says their hours are wrong

### They are missing

Hours are stored in `students/{uid}.loggedHours[]`, and the leaderboard ranks on
a separate `hours` total derived from it. If the array looks right but the total
does not:

```bash
npm run backfill:hours
```

### They have hours they should not

Only an organization with a genuine relationship to the student can credit
hours, and `POST /api/hours/approve` enforces that. If hours appear that nobody
approved, treat it as a security incident:

```bash
npm run check:security   # expect 67/67
npm run backup          # snapshot before touching anything
```

`loggedHours` entries record `approvedBy` and `approvedAt`, so the organization
that credited them can be identified.

---

## Someone signed up but cannot get in ("account setup didn't finish")

Their auth account exists but their profile document does not, usually because a
signup was interrupted between the two writes.

They can fix it themselves: signing in shows a screen with **"Finish setting up
my account"**, which completes the profile without needing a new email address.
Point them at that.

To find everyone in this state, and optionally notify or remove them, use the
repair script rather than comparing backups by hand:

```bash
npm run repair:orphans                       # dry run: list every orphan
npm run repair:orphans -- --notify           # email each orphan a finish-signup link
npm run repair:orphans -- --delete --confirm-delete
                                             # remove orphans that hold no platform data
```

An orphan is an auth account with no matching `students` or `organizations`
profile. `--notify` needs `RESEND_API_KEY` and `MAIL_FROM`; `--delete` refuses
any account that owns applications, hours, reports or feedback so it cannot
destroy data another user depends on. See `scripts/repair-orphaned-accounts.ts`.

---

## Restoring data

Backups are manual. Take one before anything risky.

```bash
npm run backup                                    # snapshot to backups/
npm run restore -- backups/<file>.json            # DRY RUN, writes nothing
npm run restore -- backups/<file>.json --commit   # actually restore
```

`restore` does not delete. Documents created after the backup are left alone, so
restoring during an incident cannot wipe newer data. It takes a fresh backup
first unless you pass `--no-pre-backup`.

**Backup files contain student personal data**, including names, emails, schools
and uploaded documents for people who are mostly minors. Keep them off shared
drives and out of the repository. `backups/` is gitignored.

---

## Before deploying security rules

Rules and application code must move together. Deploying tighter rules before
the matching code, or the reverse, breaks writes in production.

```bash
npm run backup
npx firebase-tools deploy --only firestore:rules --project volunteer-ny
npm run check:security   # expect 67/67
npm run check:flows      # expect 15/15
npm run check:lifecycle  # expect 13/13 (withdraw, waitlist, deletes)
```

If the rules are wrong, redeploy the previous version from git history
immediately. Firestore has no staged rollout.

---

## Before merging a layout change

Always run the visual sweep to verify that UI changes haven't introduced horizontal scrolling (like the iOS sidebar bug) or broken imagery across breakpoints.

```bash
npx playwright test tests/e2e/visual-sweep.spec.ts --reporter=line
```

Check the generated `playwright-report/` or `test-results/` screenshots for desktop, tablet, and mobile layouts.
