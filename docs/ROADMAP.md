# Technical roadmap

Where the engineering is, and what has to happen before each version ships.

**This document covers code only.** Whether anyone uses what the code produces
is tracked separately in [`PRODUCT-ROADMAP.md`](PRODUCT-ROADMAP.md), because the
two fail differently: engineering work is finished when a test passes, product
work is finished when a person who is not you does something they did not have
to do.

That split matters here specifically. Every item below could be closed and the
platform would still have zero organisations on it.

Ordered on one principle from the technical review: **stabilise the foundation
before adding anything to it.** Every architecture item below is placed ahead of
the features that would otherwise sit on top of it.

Issue references (`B1`, `F5`) point at [`STATUS.md`](STATUS.md).

---

## Where we are

*Re-measured 1 September 2026.*

The foundation is sound and does not need rewriting. Auth, role separation and
security rules were built intentionally and now survive 83 adversarial checks.
The full student↔organization journey works against real data. CI runs on every
push (`.github/workflows/ci.yml`), email delivery works (`check:email` 4/4), and
every route is exercised for every role by the Playwright suite — **206 tests in
32 files**, up from 51. Firebase Storage was enabled on 12 August 2026 and
`storage.rules` published to the bucket; uploads are verified end to end by
`check:storage` (5/5).

Two weeks of work sit between this line and the previous version of this
section, in three groups. **Security and correctness** closed a run of real
holes, several of them found in the fixes for earlier ones: the second factor
could be satisfied by having no second factor, a suspended organisation could
still accept and reject minors, a page reload credited a student's hours twice,
a reported adult could delete every report about themselves, and a minor's
resume was a permanent public link handed to every organisation.
**Interface** was rebuilt — see the note under *Explicitly out of scope*, which
this reverses. **Test infrastructure** stopped leaking: three separate fixture
leaks reached the production database, including a live applyable posting
visible to real students, and `tests/global-setup.ts` now sweeps before every
run rather than trusting an `afterAll` that a killed process skips.

The census, 1 September 2026: **4 students, 4 organisations, 2 opportunities
(1 open), 0 applications, 0 confirmed hours.** The organisations are Tirgan
Centre for Art & Culture, Trusted Medical Clinic, Flemingdon Food Bank and
Community Share Food Bank. The second row moved off zero since 17 August; the
last two have not. That remains the gap between "the code is right" and "the
service is worth arriving at", and no amount of engineering closes it. See
[`PRODUCT-ROADMAP.md`](PRODUCT-ROADMAP.md).

---

## v1.0. Production ready

**Goal:** real students and real organizations can use this without losing data,
being locked out, or seeing something untrue.

### Blockers

| # | Work | Why it blocks |
|---|---|---|
| ~~**B19**~~ | ~~**Move production off the AI-Studio database**~~ — **DONE 14 Aug 2026.** Production now runs on `volunteerny`: STANDARD edition, `northamerica-northeast2` (Toronto), billable rather than free-tier-capped, and data resident in Canada. Migrated by backup/restore, rules and the 7 composite indexes redeployed, verified by every live suite. `npm run deploy:indexes` is new — indexes are not part of rules and do NOT travel with a restore, which is exactly how the first attempt left `applications (mine)` failing `failed-precondition`. | **The hardest blocker on this list.** `FIREBASE_DATABASE_ID` points at `ai-studio-volunteerny-abfab7a5-…`, created by AI Studio, and Firestore answers reads against it with: *"This database cannot exceed free quota limits even when a billing instrument is enabled."* There is a hard daily read ceiling and **Blaze does not lift it**. Hit on 14 Aug 2026 by a day of test runs, which took production reads down until the quota reset — real traffic will do the same. The browse page alone reads up to 200 documents and the student dashboard fires six queries per visit, so a few dozen active students in one day is enough. The project has no `(default)` database; both existing ones are AI-Studio-created (us-west2 and us-east1, Enterprise edition). Create a database through the Firebase console instead, confirm it is not free-tier-capped, migrate with the existing `npm run backup` / `npm run restore`, then repoint `FIREBASE_DATABASE_ID` and `firebase.json`. Do this before any launch, and before B15 — a second project for tests is worth much more once reads are billable rather than rationed. |
| ~~B1~~ | ~~Valid `RESEND_API_KEY`, verified sender, `check:email` green~~ — **DONE.** `check:email` is 4/4: the key is accepted by Resend, the sending domain `volunteernorthyork.indevs.in` is verified (us-east-1), every link is absolute and resolves to a real route. |
| ~~B2~~ | ~~A recovery path for a locked-out organization~~ — **DONE 17 Aug 2026.** Ten single-use recovery codes, generated from the organization's own profile and shown once. Redeeming one grants the same per-sign-in claim the emailed code grants, through `/api/auth/backup-codes/redeem`. Only hashes are stored, the collection is unreadable by every client including a developer, generating a new set invalidates the old, and the same rate limiter applies so codes cannot be brute-forced. `check:recovery` 11/11. `grant-mfa.ts` stays as the last resort for an organization that saved none. | Partly done: `scripts/grant-mfa.ts` opens a time-boxed one-hour window (and `--revoke` closes it early), documented in RUNBOOK step 3. Still needs a path the organization can start themselves, without a developer running a script |
| B3 | **Point-in-time recovery and a daily backup schedule** | `npm run enable:pitr` does both and is idempotent. It needs `roles/datastore.owner` on the Firebase Admin service account — granted 16 Aug 2026, though Firestore's own IAM cache lagged Cloud Resource Manager's by several minutes, so the first attempts still returned 403 while `testIamPermissions` already reported the permission as held. A project owner can enable both from the console immediately instead: console.cloud.google.com/firestore/databases/volunteerny/backups. **Why it matters:** PITR rewinds THIS database to any microsecond in a 7-day window, which covers a bad write or a mistaken bulk delete; a scheduled backup survives the database being deleted outright. Until one of them is on, the only recovery is `npm run backup` when a human remembers, and these are hour records students need to graduate. |
| ~~B6~~ | ~~Hand-test the organization dashboard and developer console~~ — **DONE 1 Sep 2026.** `tests/e2e/capture-pages.spec.ts` signs in as each role and photographs every route at 1440×900 and 390×844, developer console tabs included, into `screens/`. Sixty frames per run, reviewable side by side, which is what "walked through" was asking for. It found a real list: both landing-page CTAs invisible, two maps rendering `API KEY REQUIRED`, the browse page showing ~1,005px of chrome before the first result on a phone, and the organisation dashboard landing on an empty tab at half width. One caveat worth keeping — an early version of the spec used wrong tab names and produced six identical developer screenshots, which read as an app defect and was not one. Check the spec before believing a capture. |
|, | Hand-test MFA code entry end to end | Blocked by B1 |
|, | Set `APP_URL` in Vercel | Currently relying on a hardcoded fallback |

### Should also land

| # | Work |
|---|---|
| B4 | CI running `lint`, `check:security`, `check:flows`, `check:lifecycle` and `visual-sweep` on every push |
| ~~B5~~ | ~~Bound `hoursRequests.hours` in the security rules~~ — done, capped at 24 in `isValidHoursRequest` |
| ~~B7~~ | ~~Delete the `chats`/`messages` rules, or build the feature~~ — rules deleted; the UI that promised a group chat was removed 13 Aug 2026 |
|, | Seed real opportunities before launch, an empty platform is a bad first impression, and F5 showed the temptation to fake them |

**Definition of done:** every check script green, both roles hand-tested end to
end, `STATUS.md` shows no open P0 or P1.

---

## Parked: inbound email at hello@volunteernorthyork.org (resumes ~16 Nov 2026)

Outgoing mail from the domain works and is verified. INBOUND is deliberately
parked: forwardemail.net's free tier blocks domains younger than 90 days (their
abuse rule, learned by live test — it appears in no docs, only in the rejection
email), and the ImprovMX attempt stalled in dashboard friction. Until then,
outreach is sent from the founder's Gmail signed with the domain, and nothing
printed carries an email address — the posters and PA scripts always pointed at
the site.

**On ~16 Nov 2026 (domain turns 90 days old), do this — 5 minutes, DNS only,
no accounts:** in Vercel DNS for volunteernorthyork.org, DELETE the two
improvmx.com MX records, ADD `MX @ mx1.forwardemail.net prio 10`,
`MX @ mx2.forwardemail.net prio 10`, and
`TXT @ forward-email=kiamehrmetanat@gmail.com`, then send a test to
hello@volunteernorthyork.org and confirm it lands in Gmail. Two standing
warnings: Resend's "Receiving / Enable" panel must NEVER be enabled (its
priority-9 MX would hijack all inbound), and Resend showing "partially
verified" is the correct permanent state, not an unfinished setup.

## v1.1. Maintainability

**Goal:** a second developer can work on this without breaking it. Nothing here
is user-visible; all of it is what the review meant by *technical depth*.

| # | Work | Why |
|---|---|---|
| B13 | Extract routing and route guards out of `App.tsx` into their own module | Authorization should be reviewable in one place, not read out of JSX |
| B12 | Split the oversized pages into data hooks + presentational components. Re-measured 1 Sep 2026: `StudentDashboard.tsx` 1,938, `DeveloperDashboard.tsx` 1,468, `OrgDashboard.tsx` 1,431, `OrgOpportunityApplicants.tsx` 1,217, `StudentOpportunityDetail.tsx` 991 | These are where every hard-to-find bug in this audit lived. Note the numbers barely moved across two weeks of edits: the design work extracted shared components (`EmptyState`, `usePageTitle`, the mobile nav in `DashboardShell`) but never touched the data layer, which is where the bugs are |
| B14 | One shared error-presentation pattern | Wording and behaviour currently differ per page; silent failures kept appearing because there was no standard |
| ~~B11~~ | ~~Get `test:rules` running (Java + emulator)~~ — **DONE 14 Aug 2026.** A JDK is installed, `firebase.json` gained an emulators block, and `npm run test:rules` boots the emulator, runs **56** per-field assertions against the real rules file offline, and shuts down. The old `tests/firestore.rules.test.js` was CommonJS-vitest and could never run here; it was replaced by `tests/firestore-rules.spec.ts` on the Playwright runner that already exists. Create paths are covered deliberately — that is where both live exploits were. |
| B15 | A second Firebase project for tests | `.firebaserc` names one project, so `check:security`, `check:flows`, `check:signup`, `check:storage` and the Playwright suites all create real accounts in the database real students use. **This kept costing.** Nine stranded accounts on 13 Aug; then on 31 Aug three more leaks reached production, including a live applyable posting real students could see and a fixture student breaking two of the eight `check:integrity` invariants. Two mitigations shipped since: every fixture carries `isFixture: true` and is filtered out of student-facing queries, and `tests/global-setup.ts` runs the janitor at the START of every suite — the one point a killed process cannot skip. Those cut the blast radius; a separate project is still the actual fix |
| B9 | Single source of truth for developer identity | Adding a developer should not require an environment change and redeploy |
| ~~B16~~ | ~~Enforce 2FA in `firestore.rules`, not only in the client~~ — **done 14 Aug 2026.** `mfaSatisfied()` gates every write through `isVerifiedStudent`/`isVerifiedOrg` plus the owner-update paths on students and organizations, comparing `mfaVerifiedFor` against `auth_time` from the same signed token. NOT applied to create (organization signup writes its profile before any code has been sent) and NOT to the applications `list` rule, which already spends all ten of Firestore's document accesses per query — an eleventh breaks every organization's applicant list at their fifth posting. So reads remain scoped by ownership alone: a stolen password can still READ what that account owns. Closing that needs the read paths restructured rather than one more `get()`. | The MFA claim is checked in `src/routes/guards.tsx` and nowhere else. Someone holding a stolen password but not the mailbox never loads the React app — they use the Firebase SDK directly and get everything their role permits. Add `request.auth.token.mfaVerifiedFor == request.auth.token.auth_time` to `isVerifiedOrg()` / `isDeveloper()`, and to `verifyAuth()` |
| ~~B17~~ | ~~Constrain `/api/email/send` recipients~~ — **DONE 14 Aug 2026.** You may email yourself; a student may email an organization they applied to and any coordinator they named; an organization may email a student who applied to it; developers are unrestricted. Refusals never say which address was rejected — that would make the endpoint a membership oracle for a platform used by minors. Two assertions in `check:security`. | Any signed-in account can send 10 arbitrary addresses per request, 20 requests per 10 minutes, with an attacker-chosen subject and body, from the SPF/DKIM-signed sending domain. Templates are escaped and `actionUrl` is origin-locked, so this is impersonation and domain-reputation risk rather than link injection — but the same relationship query `hasAcceptedApplication()` already runs would close it |
| B18 | Make `exclusives` editable after an opportunity is posted | `OPPORTUNITY_EXCLUSIVES` is imported by the edit page and never rendered, so eligibility set at create can never be changed |

**Do not start v2 features before this is done.** These files are already the
reason bugs hid; adding to them compounds it.

---

## v2.0. Product depth

Only on a stable foundation. Priority is a judgement call for the owner; this is
a suggested order.

| Work | Notes |
|---|---|
| Live updates between student and organization | Currently each side sees the other's changes on next load. `onSnapshot` on applications and hours would make acceptance appear instantly |
| ~~Move uploads to Cloud Storage (B10)~~ **done, 12 Aug 2026** | Storage enabled, `storage.rules` deployed, uploads verified by `check:storage`. Before this the bucket did not exist and every upload hung silently |
| Messaging (B7) | Rules already exist; the UI does not |
| Calendar (B8) | `CalendarView.tsx` is written and unrendered |
| Bulk actions for organizations | Accept/reject many applicants at once |
| School-administrator role | Teachers verifying their own students' hours |

---

## v3.0. Scale

Relevant at thousands of students, not before.

| Work | Notes |
|---|---|
| Pagination everywhere | Several queries use a fixed `limit(50)` and simply stop there |
| Leaderboard sharding | One materialised document is fine for hundreds, not tens of thousands |
| Search | Firestore cannot do text search; needs an external index |
| Email volume | Resend limits and per-account rate limiting will need revisiting |
| Analytics | Which opportunities convert, where students drop out |

---

## Explicitly out of scope

- **Rewriting from scratch.** The review was clear: the foundation is good and
 continuable.
- ~~**Redesign.**~~ **Reversed by the owner in late August 2026, and carried
 out.** The instruction became the opposite one: reduce how much the interface
 asks of a person. Roughly twenty commits between 30 Aug and 1 Sep. Font sizes
 34 → 22; the second colour palette deleted; five different empty-state
 treatments replaced by one component; a persistent bottom nav on mobile; a real
 `<title>` per route; 33 indefinitely animating elements removed, which was a
 WCAG 2.2.2 Level A failure rather than a taste question; body text raised off
 12px, first globally and then, on 1 Sep, for the 71 remaining paragraphs that
 were actual prose; the student profile cut from 8.8 phone screens to 5.0.
 Decisions were argued from measurement where one existed — Reinecke's
 β=.344 for number of text groups, Spool's 72%-vs-6% on label consistency,
 NN/g's 57%-vs-86% on hidden navigation — and against the folklore where it
 does not replicate, which is why navigation was not trimmed to seven items on
 the strength of Miller. **The leaderboard was excluded by owner's instruction
 and not touched.**
- **New features before v1.1.** The whole point of this ordering.
