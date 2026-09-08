# Volunteer North York — session handoff

The entry point for the next session, human or AI. This is a pointer document:
the details live in `docs/`, and every claim here must be checkable against the
code. The previous version of this file still instructed its reader to fix bugs
that had been closed for weeks — treat that as the cautionary tale it is, and
verify anything here that sounds load-bearing before acting on it.

**Repo:** https://github.com/mrbread56/volunteerny-appV2
**Local path:** `C:\Users\ASUS\Downloads\VNY_V14`
**Live:** https://volunteernorthyork.org
**Last full update of this file:** commit `6c4c6f6`, 1 Sep 2026

---

## 1. What the project is

A two-sided platform matching Ontario high school students with volunteer
opportunities at community organizations, and tracking the **40
community-involvement hours** students need to graduate.

Built by **one person**, a high school student, using AI development tools.
Started late 2025. No deadline.

**As of 1 Sep 2026: 4 students, 4 real verified organisations, 2 opportunities
(1 open), 0 applications, 0 confirmed hours.** The organisations are Tirgan
Centre for Art & Culture, Trusted Medical Clinic, Flemingdon Food Bank and
Community Share Food Bank. The bottleneck has moved: it is no longer "no
organisations", it is that three of the four have posted nothing and nobody has
applied to the one posting that exists. Still not an engineering problem.

Full background including the student survey and professor reviews is in
`docs/PROJECT.md`. The most recent professor review reset the mindset:
**stabilize → validate → measure → improve. No new features.** That review is
satisfied on the engineering side; its open items are acquisition, not code.

### Stack

React 19 + TypeScript + Vite SPA · Express API (`server.ts`, wrapped by
`api/index.ts` for Vercel) · Firebase Auth + Firestore (**named database
`volunteerny`**, Standard edition, `northamerica-northeast2` — NOT `(default)`,
NOT the old AI-Studio database) · Firebase Storage · Resend for email · Vercel
hosting · one Vercel cron (leaderboard rebuild, daily).

### The single most important architectural fact

**The browser talks to Firestore directly.** There is no API layer in front of
most reads and writes. `firestore.rules` **is** the authorization layer for the
majority of the app. The Express API exists only for operations rules cannot
express: anything needing a query (rules can only read exact document paths), a
secret, or a privileged cross-user read. `storage.rules` plays the same role
for files. Treat both rules files as production code of the highest tier.

Two hard-won corollaries:

- A rules `hasOnly` allowlist that omits a field the client writes fails at
  runtime with permission-denied and nothing catches it at compile time. The
  emulator suites exist to catch exactly this.
- CREATE paths and UPDATE paths are separate rules and drift independently.
  Both live exploits ever found here were create-path holes that every
  update-path test missed.

---

## 2. Current state — verified 1 Sep 2026

Production runs the current main, on the Toronto database, with real (small)
data. `docs/STATUS.md` holds the full verification table; the shape of it:

- **Rules:** firestore.rules 83+ emulator assertions, storage.rules 15, both
  mutation-tested (every deliberate weakening fails the suite). Live
  adversarial suite `check:security` 83/83.
- **Journeys:** `check:flows` (apply→accept→hours→leaderboard), 
  `check:lifecycle` (withdraw, waitlist capacity, both delete cascades),
  `check:recovery` (org MFA recovery codes end to end), org-entry browser
  journey including recovery-code redemption.
- **Browser:** 206 Playwright tests in 32 files, chromium + webkit, including
  network failure simulation, WCAG sweeps, and console-error assertions on
  every route. `tests/e2e/capture-pages.spec.ts` additionally photographs every
  route as each role at desktop and phone widths into `screens/` — 60 frames,
  for looking at rather than asserting on.
- **Fixtures cannot persist.** `tests/global-setup.ts` runs the janitor at the
  START of every run. This is not belt-and-braces: three fixture leaks reached
  production in late August, one of them a live applyable posting real students
  could see, because `afterAll` does not run when a process is killed.
- **Soak-proven:** the whole battery holds under 11 concurrent suite
  executions plus the full browser run simultaneously (~690 live assertions).
- **Ops:** point-in-time recovery ON, daily managed backup ON, deploy scripts
  for rules and indexes (`npm run deploy:rules` / `deploy:indexes` /
  `enable:pitr`), integrity scan (`check:integrity`, 8 invariants), janitor
  with orphan sweep (`cleanup:test-data --orphans`).
- **Email:** all seven transactional templates sent live through Resend by
  `check:delivery`, with per-message IDs.

Run everything the way CI does: `npm run lint`, `npm run build`, `npx
playwright test`, then the `check:*` scripts (each boots what it needs).

---

## 3. Constraints the next session must not relearn

- **Do not bump `firebase` past 12.13** without reading the `//deps:firebase`
  note in `package.json`. 12.17 made five failure-simulation specs fail
  deterministically under full parallel load while passing alone. Rolled back
  on evidence.
- **Rules read the LIVE database name.** `storage.rules`'s `callerRole()` does
  a cross-service `firestore.get` against `/databases/volunteerny/...`. If the
  database is ever renamed or migrated again, that literal must move with it —
  it silently failed in both directions last time.
- **Indexes do not travel.** Restoring a backup into a fresh database copies
  documents, not composite indexes. `npm run deploy:indexes` publishes them and
  waits for READY.
- **Playwright + shared emulators need serial mode.** `fullyParallel` splits a
  file across workers; each worker runs beforeAll/afterAll on the same
  emulator, and one worker's cleanup revokes the environment under another.
  Three specs carry the comment; new emulator specs need it too.
- **Suite runs killed by timeouts skip `afterAll`** and strand fixtures.
  `cleanup:test-data --orphans --confirm` sweeps what that leaves behind; run
  it after any interrupted session.
- **The dev server pins env at startup.** After changing `.env`, kill the
  server Playwright reuses, or the client silently runs against the old values.

## 4. Open items — none of them code

| Item | Owner | Notes |
|---|---|---|
| Get the 3 silent organisations to post | Owner | THE bottleneck, restated. Four organisations are registered and verified; three have posted nothing. Acquisition worked; activation has not been attempted. |
| Decide whether to open Tirgan's posting | Owner | `Festival preparation and office support` is complete and correct but `status: closed`, so no student can see it. Opening it is one field. |
| Vercel env: set `MAIL_FROM`, remove `VITE_APPCHECK_SITE_KEY` | Owner | Both flagged repeatedly and still outstanding. |
| Budget alert in GCP Billing | Owner | ~5 minutes; the safe version of a billing kill-switch. |
| App Check | Next session | When real traffic exists; not before. |
| Firebase major/minor bump | Next session | Only with the full-parallel double-run the package.json note demands. |
| Second Firebase project for tests (ROADMAP B15) | Next session | Suites still write to the production project. Mitigated since — `isFixture: true` on every fixture plus the global-setup janitor — but not fixed. |

`docs/ROADMAP.md` (technical) and `docs/PRODUCT-ROADMAP.md` (phases, metrics)
are the living lists; STATUS is the evidence ledger; RUNBOOK is operations.

## 5. Marketplace architecture research — now adopted

The LinkedIn/Meta/Airbnb/Handshake research this file used to carry as
recommendations has been implemented where it mattered: applications use
deterministic ids (`${uid}_${oppId}` — a double-click cannot create
duplicates), `orgId` is required and materialised on applications, and the
matching engine is deterministic and explainable (`src/lib/matchScore.ts`
composing distance, availability, eligibility — see `getMatchResult`). The
scoring-weight recommendation system stays deliberately unbuilt until there is
real data to validate weights against.

## 6. If you are the next AI picking this up

1. Read `docs/STATUS.md` first — it is the evidence of what works.
2. Run `npm run lint && npm run build` before believing anything else.
3. **The "no new features" instruction has been superseded by the owner — do
   not quote it back at them.** The professor's advice (stabilize → validate →
   measure → improve) was sound and largely discharged; then in late August the
   owner directed a full interface redesign and it was carried out, along with
   real features where a real organisation needed one. What still holds from
   that advice is the discipline, not the prohibition: measure before changing,
   and do not add a second thing while the first is unverified.

   Two standing owner instructions that DO bind you, and are not negotiable:
   **never send an email on the owner's behalf without showing the draft and
   waiting for approval** — approval never carries from one message to the
   next — and **do not touch the leaderboard.**
4. When a check fails, characterise it before fixing it — this codebase's
   history is full of failures that were the harness, the environment, or a
   stale server, and "fixes" to healthy code are how regressions arrive.
5. Update this file when your session materially changes the state. The
   previous version's staleness sent its reader chasing closed bugs.
