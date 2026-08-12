# Project status, evidence-based audit

**Last updated:** 10 August 2026
**Method:** every claim below is backed by a named script that can be re-run, or
a hand-test performed against the real Firebase project through the real UI.
Nothing here is "we think it works".

This file replaces `TODO.md` and `AUDIT_REPORT.md`, which listed items that had
already been fixed and gave the impression the project was unfinished.

---

## Full verification, 9 August 2026

Every gate below was run on this commit and passed.

| Check | Result |
|---|---|
| `lint` (types + ESM guard) | 0 errors |
| `build` (SPA + server bundle) | succeeds |
| `check:firebase` | 13/13 |
| `check:security` (adversarial) | **51/51** |
| `check:flows` (full journey) | 13/13 |
| `check:signup` | 6/6 |
| `check:queries` | 0 failures |
| `check:hours` / `check:certificate` / `check:errors` | pass |
| `check:email` | 4/4, key valid, sender verified, links resolve |
| `sweep:console` (every route, every role) | **0 unexpected** |
| `visual-sweep` (Playwright layout checks) | 9 passed (desktop/tablet/mobile) |
| **GitHub Actions CI** | **green, live tier executing** |

The application was also driven by hand at `localhost:3000`: all five public
routes, all eight student routes, all six organization routes, and all six
developer console tabs render with content, no horizontal overflow and no
console errors. Automated Playwright visual sweeps assert no horizontal overflow
across breakpoints (375px, 768px, 1440px).

---

## Summary

| Area | State |
|---|---|
| Auth & roles | Working. 51 adversarial tests |
| Permissions / rules | Working, audited with the official Firebase auditor |
| Student journey | Working, hand-tested end to end |
| Organization journey | Working, hand-tested end to end |
| Developer console | Working, all six tabs walked |
| Email delivery | Working, key valid, sender domain verified |
| Application → hours → leaderboard | Working. `check:flows` |
| CI | Green, and fails loudly if the security suite cannot run |

---

## Closed 9 August 2026 (from the independent architecture review)

**G2. Nothing reported errors anywhere, and the crash screen said otherwise.**
`componentDidCatch` called `console.error` while the screen it rendered told the
user "our team has been notified". Nobody was. `reportError()` now forwards to
`POST /api/log/client-error`, which logs to the platform and records to a
`clientErrors` collection; the boundary calls it; the copy no longer claims
something untrue. The endpoint is unauthenticated on purpose, since the errors
most worth seeing happen during sign-in, so it is rate limited per address,
payload capped, and stores a fixed set of fields.

**G5. Real students were shown invented hours data.** Both dashboards fell back
to the demo fixture in `localStorage` whenever the hours query failed, so a
failed read rendered as a list of hour claims the database did not hold. These
are graduation records. Both fallbacks are gone; the failure is now reported.

**G6. Backups ran only when someone remembered.** A daily scheduled workflow now
takes one, and it is **encrypted with GPG before upload**, because a plain
artifact would put minors' names, emails and uploaded documents into CI storage.
Requires a `BACKUP_PASSPHRASE` secret and fails loudly without one.

**G1. `strict` is on.** It cost nine fixes, three of them real bugs rather than
missing annotations: `api/test.ts` was a dead unauthenticated debug endpoint
shipping to production, `requestRef` could be dereferenced null in the
hours-approval path, and `formatDate(undefined)` rendered "Invalid Date" on any
single-date opportunity whose shift had no date. ~167 `any`s remain in `src/`,
so strict is only as strong as the types beneath it, but it stops the next 167.

**G7/G8. Dead configuration and stale claims.** Deleted `supabase/` (an
abandoned stack) and `render.yaml` (a second, contradictory deployment story in
a project that deploys to Vercel). `test:rules` invoked `vitest`, which is not
installed, so it now explains itself instead of failing cryptically. The
README's "known gaps" still claimed there was no CI and that routing was not
separated from `App.tsx`; both had been done, and understating progress is the
same failure as the `TODO.md` problem, in the other direction.


## Closed 10 August 2026 (post-review hardening)

Fixes from the second independent review (criticals C2–C4) plus a live
no-dead-buttons pass. Every item was verified with `npm run lint`,
`npm run build`, and a running server (`npm run dev`, routes and demo API
exercised over HTTP).

**C2 closed. The upload migration to Firebase Storage is now complete.**
`FileUpload` already went to Storage; the remaining base64-in-Firestore write
paths did not. Now fixed:
- Safety-report attachments (`ReportModal.tsx`) upload to
  `reports/{uid}/…` in Storage; the Firestore document carries only the URL.
  `storage.rules` gained the matching `reports/{userId}` path
  (owner + developer read). The dead `chat_attachments` block was removed with
  the same sweep that deleted the `chats`/`messages` Firestore rules (B7).
- Feedback attachments (`FeedbackPage.tsx`) upload to `feedbacks/{uid}/…` with
  sanitised, collision-proof names; demo mode keeps the inline path because it
  never leaves the browser.
- `firestore.rules` validators for reports and feedbacks now accept
  `attachmentUrl`.
- The developer console's report and feedback panels render both generations
  through one shared `AttachmentPreview` component (legacy `lzs::` base64 and
  Storage URLs), and `ApplicationReviewDialog` previews Storage-URL resumes.
  Legacy documents already in Firestore still read correctly.

**A silent write-failure in reports and feedback was fixed along the way.**
Both documents were written with their optional fields set to `null`, and the
rules validate those as `absent(x) || x is string` — a present null is not a
string, so any report/feedback without an attachment was rejected by the rules
while the catch block said nothing. Absent fields are now omitted, and a
Firestore failure on a safety report is surfaced to the reporter instead of
being swallowed into a localStorage copy staff would never see.

**C3 verified closed.** `package.json` is `volunteerny-app` v0.9.0; no
`react-example` / `0.0.0` reference remains anywhere in the tree.

**C4 is now actionable.** `npm run repair:orphans`
(`scripts/repair-orphaned-accounts.ts`) lists every auth account with no
student/organization profile, can email each one a finish-signup link
(`--notify`), and deletes only data-less orphans with `--delete
--confirm-delete`. Documented in `RUNBOOK.md`. The nine known orphans still
need an operator run with real credentials — the script is the tool, the run is
the remaining manual step.

**The leaderboard no longer contains invented students.** `basePeers`
("Maya S.", "Devon K.", …) used to be merged into the REAL board on every load
and was also the error fallback, so a failed read was indistinguishable from a
healthy ranking of real students. Fabricated peers now exist only in demo
mode; real mode shows an honest error state or an honest empty board.

**Save and Share on the opportunity page no longer appear dead.** Their
feedback banner was rendered only inside the "opportunity not found" branch —
the one state where the buttons cannot be clicked — so every save, unsave,
copy and error produced zero visible response. The banner renders on the page,
Save reports success too (not just failure), Share uses the native share sheet
with clipboard fallback, and a permission-denied gets wording that points at
incomplete-profile accounts instead of "check your connection".

**The hours-approval email said the opposite of what happened.** The subject
switched between approved/declined but the body was hardcoded to the declined
wording, so a student whose hours were approved received "…was not able to
approve them". The copy now branches correctly. The student dashboard also
states, on submission and under Submitted Claims, that logged hours only count
once the coordinator approves them, and every "an email was sent" surface now
carries the shared spam-folder note (`EmailDeliveryNote`): the 2FA screen,
hours submission, submitted-claims panel, the developer console's email test,
and the applicant-acceptance receipt.

**Demo mode stopped reporting fake email failures.** `/api/email/send` refused
demo sessions with a 503 when mail was unconfigured — but demo mode is exactly
how the app runs without secrets, so every demo hours/application/signup flow
logged a spurious delivery failure. Demo sessions are now short-circuited to a
simulated send before the mail gate (and still never send real mail).

**Dead surface removed.** `OrgProfile.tsx` carried a Gmail toggle and a
send-test-email handler that no button ever rendered; both are gone (the real
email test lives in the developer console).

**Dev server works behind proxies.** Vite's Host-header allowlist answered
preview/tunnel hosts with 403 "Blocked request"; `allowedHosts: true` is now
set for the embedded dev middleware.



Severity: **P0** blocks launch · **P1** fix before real students · **P2** should
fix · **P3** cosmetic or long-term.

### P0, blocks launch

**B1. Email delivery.** *Resolved 9 August 2026.*
A valid `RESEND_API_KEY` is in place and the sender domain
`volunteernorthyork.indevs.in` is verified. `check:email` passes 4/4 and a real
two-factor request was confirmed reaching Resend.

Kept here because of what it blocked: two-factor is mandatory for
organizations and the code arrives by email, so while the key was dead **no
organization could sign in at all**. They reached `/mfa`, requested a code, and
it never came. Any future email outage has the same effect, which is what B2 is
about.

**B2. Recovering a locked-out organization.** *Resolved 9 August 2026.*
Two-factor is mandatory for organizations and the code arrives by email, so any
delivery failure (a bounce, a school spam filter, a provider outage) locked the
account permanently. The screen offered only "Resend" and "Sign out", neither of
which helps when mail is the broken part.

There is now a support path on the screen itself, pre-filled with the account
email so the request arrives with what support needs, and
[`RUNBOOK.md`](RUNBOOK.md) documents how to verify an account by hand with
`scripts/grant-mfa.ts` after confirming the requester owns it.

*Not fully closed:* verification is still a manual operator step rather than
something the developer console can do. That is deliberate for now, because an
in-app button that bypasses two-factor on accounts holding minors' contact
details needs its own security review before it exists.

### P1, fix before real students use it

**B15. Nine accounts exist with no profile, and the screen they saw was a dead
end.** *(fixed; cleanup tool ready)*
The guard offers the finish-signup path, and `npm run repair:orphans` now
finds, notifies (`--notify`) and safely deletes (`--delete --confirm-delete`)
orphaned accounts. Running it against the real project still needs an operator
with credentials.
The 8 August backup found nine `users` documents with no matching `students` or
`organizations` record, signups that died between the auth account being
created and the profile being written. One is a `@tdsb.ca` school-board
student. They were shown "contact support so we can clear the incomplete
account", while `Login.tsx` had always redirected the same state to `/signup`,
which can finish the profile in one click. The guard now offers that instead.
*Still open:* those nine accounts have not yet been contacted or repaired.

**B3. Firestore backups.** *Resolved 9 August 2026.*
`npm run backup` runs nightly via `.github/workflows/backup.yml` and the
artifact is GPG-encrypted before upload, because these files hold names,
emails, schools and base64 passport and resume scans of minors. The job fails
loudly rather than quietly if credentials or the passphrase are missing.
`npm run restore` reads them back (dry run by default, never deletes), and
`npm run check:backup` proves the round trip including Timestamps and
GeoPoints. **Needs one secret: `BACKUP_PASSPHRASE`.**

Original entry:
Firestore's built-in scheduled backups require the Blaze plan. `npm run backup`
now takes a full snapshot to `backups/*.json` using ordinary reads, which are
free on Spark, verified against the real project, 39 documents, 0.48 MB.
*Remaining risk:* it is manual. Nobody is reminded to run it, and it is a
snapshot rather than point-in-time recovery. Schedule it, or move to Blaze,
before real students depend on the data.

**B4. No CI.** *Resolved.* `.github/workflows/ci.yml` runs types, the ESM
guard, the build and the credential-free checks on every push, plus the 56
adversarial security checks and the flow suite on `main`. A push to `main` with
missing secrets fails rather than reporting a green tick over zero tests. *Fix:* run `lint`, `check:security` and
`check:flows` on push.

**B5. `hoursRequests.hours` had no upper bound.** *Resolved 9 August 2026.*
Now `> 0 && <= 24` in `isValidHoursRequest`, matching the server's per-approval
cap. Covered by `check:security`.

**B16. A student could settle their own hours request through the rules.**
*Resolved 9 August 2026.* Found by an independent architecture review, not by
this engagement's own testing.

The rules let "the coordinator" set `status`, identifying them as
`existing().coordinatorContact == request.auth.token.email`. The student writes
`coordinatorContact` when creating the request, so naming their own address
satisfied it from their own session. It credited no hours (`students/{uid}.hours`
is server-only), which is why it survived the earlier fix to the same flaw in
the API. What it did do: the organization's queue filters on
`status == 'pending'`, so a self-settled request vanished from their list while
the student's dashboard displayed it as approved. A real request could be made
to disappear, and the interface reported a state the database did not hold.

The coordinator branch is gone. Declining now goes through
`POST /api/hours/approve` alongside approving, so both transitions run the same
relationship check. This is the third appearance of the same root cause, and it
is why [`ARCHITECTURE-PRINCIPLES.md`](ARCHITECTURE-PRINCIPLES.md) §2 exists.

**B6. Organization dashboard and developer console hand-test.** *(done)*
Both walked through the real UI with real accounts. The developer console's six
tabs, feedback, safety reports, user audit, suspended list, settings,
verification, all render with no blank panels, no horizontal overflow and no
console errors. Confirmed at the same time that an account promoted to
`developer` in Firestore but absent from `VITE_DEVELOPER_EMAILS` now reaches the
console; that combination previously showed "Access Denied" while the navbar
called them a Developer.

**B16. The platform has no organizations and nine orphaned accounts.**
An 9 August backup, after removing every throwaway test account, shows 19 users,
9 students and **0 organizations**. So nothing can currently be applied to, and
the leaderboard and browse pages have nothing real to show. Ten of those users
have no profile document (see B15); they are all real sign-ups, none left by
testing. *Not a code defect, recorded because "the app works" and "the app has
users" are different claims, and only the first is currently true.*

**B16. Nothing reported errors anywhere.** *Resolved 9 August 2026.*
Every caught error reached `console.error` and stopped. With one developer and
no log drain, the only way to learn a student's hours submission had failed was
for that student to write in. The crash screen meanwhile said "our team has been
notified", which was true of nobody. `reportError()` now forwards to
`POST /api/log/client-error`, the React error boundary calls it, and the copy
says what actually happens.

**B17. Demo data leaked into real hours reads.** *Resolved 9 August 2026.*
Both dashboards fell back to the `demo_hours_requests` fixture whenever the
Firestore query failed, so a student could be shown hour claims that were not in
the database, and an organization could see an empty approval queue that was
really a failed read. Both now report the failure and show nothing.

**B18. TypeScript `strict` was off.** *Resolved 9 August 2026.*
Enabling it cost nine fixes, three of them real bugs: a dead unauthenticated
debug endpoint at `api/test.ts` shipping to production, a null dereference in
the hours-approval path, and `formatDate(undefined)` rendering "Invalid Date" on
any single-date opportunity whose shift had no date. ~167 `any`s remain in
`src/`, so strict is on but only as strong as the types beneath it.

### P2, should fix

**B7. `chats` and `messages` have complete security rules and zero code.**
Unreachable permissions nobody tests. *Fix:* build them or delete the rules.
*Partially closed:* the Firestore rules were already deleted; the matching
`chat_attachments` block in `storage.rules` (which read a `chats` collection
that does not exist) was removed on 10 August 2026. What remains is the
decision to build the feature or leave it out.

**B8. `CalendarView.tsx` is 827 lines and is never rendered.**

**B9. Developer identity is split** between `users/{uid}.role` and the
`VITE_DEVELOPER_EMAILS` allowlist, so adding a developer means an environment
change and a redeploy.

**B10. Uploads are base64 inside Firestore documents**, capped at 400 KB each by
the rules and bounded by the 1 MiB document limit. Belongs in Cloud Storage.
*Mostly closed 10 August 2026:* every NEW upload (resumes, report and feedback
attachments) now goes to Firebase Storage; documents carry only URLs. Legacy
documents still hold their base64 and read through the same components; they
shrink naturally as students re-upload.

**B11. Rules unit tests cannot run here**, `test:rules` needs Java and the
Firebase emulator. Rules are currently proven by live adversarial tests instead.

### P3, long-term

**B12. Oversized components.** `StudentDashboard.tsx` 2,428 lines,
`DeveloperDashboard.tsx` 1,836, `OrgDashboard.tsx` 1,552.

**B13. Routing and guards live inside `App.tsx`** rather than a reviewable
module of their own.

**B14. Error-message wording is inconsistent** across pages, some say
"Couldn't…", some "Failed to…", some show provider text.

---

## Fixed and verified during this audit

Each was reproduced first, then fixed, then re-verified.

| # | Issue | Severity | Proof |
|---|---|---|---|
| F1 | **A student could approve their own graduation hours.** The approval endpoint trusted `coordinatorContact`, a field the student writes. Register that address as an organization → self-credit. | Critical | `check:security` performs the attack; was HTTP 200 + 20 hours credited, now 403 |
| F2 | **Any organization could alter any student's hours**, add or erase. `hasOnly()` limits which fields, never whose document. | Critical | `check:security` |
| F3 | **Any organization could read any student's file**, including uploaded resume and passport documents. | Critical | `check:flows` asserts no `passportUrl` is returned |
| F4 | **Anyone with an account could send phishing from the verified mail domain** with an arbitrary button link. | Critical | `check:security` |
| F5 | **Real students were shown volunteer placements that do not exist**, the dashboard fell back to fabricated demo data when the database was empty, contradicting the Browse page. | High | hand-tested |
| F6 | Google sign-in permanently locked out new users. | High | hand-tested |
| F7 | Ratings were silently discarded (`orgId` was never stored). | High | `check:flows` |
| F8 | Leaderboard ranked every student at zero. | High | `check:flows` |
| F9 | Organizations were told applicants had been emailed when nothing was sent. | High | code + `check:email` |
| F10 | Every button in every email pointed at the mail domain, which serves no website. | High | `check:email` |
| F11 | An extensionless import took down the entire API in production. | Critical | `check:esm`, added to `lint` |
| F12 | Safety-report AI triage always 401'd; reports were filed with a placeholder summary. | Medium | code |
| F13 | Undo race could delete the wrong tracking entry and never settle its promise. | Medium | code |
| F14 | `.env.example` published a real personal email, the exact account to compromise for developer access. | Medium | fixed |
| F15 | `send-otp` leaked raw provider errors, the sending address and infrastructure hints to end users. | Medium | fixed, gated on `NODE_ENV` |
| F16 | Five user actions failed silently (2FA toggle, leaderboard visibility, saving, ban, report resolution). | Medium | code |
| F17 | Dashboard scrolled sideways on every phone (`flex` item without `min-w-0`). | Medium | measured 382.7px in a 375.3px parent |
| F18 | Onboarding validation errors were invisible to screen readers. | Medium | fixed |
| F19 | 40 leftover scripts and a 1.1 MB build artifact committed to the repo root. | Low | 6,695 lines removed |
| F20 | **Any user could inject up to 1MB of arbitrary data into 6 core collections.** The `!hasAny` trick left an outer hole allowing arbitrary unvalidated fields in `students, organizations, opportunities, interestRequests, recommendations, orgRatings`. | Critical | `hasOnly` bounds applied |
| F21 | **Silent failure disguised as success.** Dashboard components caught production Firestore errors and silently wrote to `localStorage` (`demo_reports`, `demo_hours_requests`), showing real users fake data instead of errors. | High | fallbacks removed |
| F22 | **Email rate limiter bypassed by serverless cold starts.** The 20-per-10-min limit was an in-memory Map, meaning attackers got 20 new sends every time Vercel spun up a new instance. | Medium | ported to Firestore transaction |
| F23 | **Leaderboard timer was hanging serverless.** `rebuildGlobalLeaderboard` ran a `setInterval` that never fired reliably on Vercel because instances freeze between requests. | Medium | gated on `!process.env.VERCEL`, replaced with Vercel Cron |
| F24 | `puppeteer` bloated CI and serverless deploys by downloading a ~300MB Chromium binary on every install despite being dead code. | Low | uninstalled |
| F25 | `ReceiptModal` used an external Tailwind CDN script at runtime, breaking offline receipts and violating production best practices. | Low | inlined styles |
| F26 | Hero headline was white text on a missing background if the image failed to load, rendering it invisible. | Low | `bg-blue-dark` fallback added |

---

## Deliberately not done

- **No redesign.** Already decided against.
- **No new features** until the architecture work in `ROADMAP.md` is complete.
- **Design-hook findings on status-coloured borders** left as-is: the colour is
 bound to application status and carries real information.
