# Roadmap

Where the project is, and what has to happen before each version ships.

Ordered on one principle from the technical review: **stabilise the foundation
before adding anything to it.** Every architecture item below is placed ahead of
the features that would otherwise sit on top of it.

Issue references (`B1`, `F5`) point at [`STATUS.md`](STATUS.md).

---

## Where we are

The foundation is sound and does not need rewriting. Auth, role separation and
security rules were built intentionally and now survive 67 adversarial tests. The
full student↔organization journey works against real data. Documentation and
repository hygiene were the weakest areas and are now addressed.

Three things listed here as missing have since shipped: CI runs on every push
(`.github/workflows/ci.yml`), email delivery works (`check:email` 4/4), and every
route is exercised for every role by the Playwright suite (51/51) rather than by
hand. Firebase Storage was enabled on 12 August 2026 and `storage.rules` was
published to the bucket for the first time; uploads are verified end to end by
`check:storage` (5/5).

What is *not* yet true: the site has almost no content — one organization and a
handful of students — and no photography. That is now the gap between "the code
is right" and "the service is worth arriving at". No amount of engineering
closes it.

---

## v1.0. Production ready

**Goal:** real students and real organizations can use this without losing data,
being locked out, or seeing something untrue.

### Blockers

| # | Work | Why it blocks |
|---|---|---|
| **B19** | **Move production off the AI-Studio database onto one that can be paid for** | **The hardest blocker on this list.** `FIREBASE_DATABASE_ID` points at `ai-studio-volunteerny-abfab7a5-…`, created by AI Studio, and Firestore answers reads against it with: *"This database cannot exceed free quota limits even when a billing instrument is enabled."* There is a hard daily read ceiling and **Blaze does not lift it**. Hit on 14 Aug 2026 by a day of test runs, which took production reads down until the quota reset — real traffic will do the same. The browse page alone reads up to 200 documents and the student dashboard fires six queries per visit, so a few dozen active students in one day is enough. The project has no `(default)` database; both existing ones are AI-Studio-created (us-west2 and us-east1, Enterprise edition). Create a database through the Firebase console instead, confirm it is not free-tier-capped, migrate with the existing `npm run backup` / `npm run restore`, then repoint `FIREBASE_DATABASE_ID` and `firebase.json`. Do this before any launch, and before B15 — a second project for tests is worth much more once reads are billable rather than rationed. |
| B1 | Valid `RESEND_API_KEY`, verified sender, `check:email` green | Two-factor is mandatory for organizations and arrives by email. With mail down **no organization can sign in at all** |
| B2 | A recovery path for a locked-out organization | Partly done: `scripts/grant-mfa.ts` opens a time-boxed one-hour window (and `--revoke` closes it early), documented in RUNBOOK step 3. Still needs a path the organization can start themselves, without a developer running a script |
| B3 | Confirm Firestore backups are enabled | Hour records are graduation evidence. Unrecoverable if lost |
| B6 | Hand-test the organization dashboard and developer console | 3,388 lines of UI that no human has walked through |
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

## v1.1. Maintainability

**Goal:** a second developer can work on this without breaking it. Nothing here
is user-visible; all of it is what the review meant by *technical depth*.

| # | Work | Why |
|---|---|---|
| B13 | Extract routing and route guards out of `App.tsx` into their own module | Authorization should be reviewable in one place, not read out of JSX |
| B12 | Split the three oversized pages (1,984 / 1,684 / 1,353 lines, re-measured 13 Aug 2026) into data hooks + presentational components | These are where every hard-to-find bug in this audit lived |
| B14 | One shared error-presentation pattern | Wording and behaviour currently differ per page; silent failures kept appearing because there was no standard |
| B11 | Get `test:rules` running (Java + emulator) | Rules are proven live today by 67 adversarial tests; unit tests make them provable in CI without touching the real project. `tests/firestore.rules.test.js` exists with 6 tests but cannot run: it requires `vitest`, which is not a dependency |
| B15 | A second Firebase project for tests | `.firebaserc` names one project, so `check:security`, `check:flows`, `check:signup`, `check:storage` and the Playwright suites all create real accounts in the database real students use. They clean up in a `finally`, which a cancelled run or a crash skips — nine stranded accounts were found and removed on 13 Aug 2026. `npm run cleanup:test-data` is the stopgap, not the fix |
| B9 | Single source of truth for developer identity | Adding a developer should not require an environment change and redeploy |
| B16 | Enforce 2FA in `firestore.rules`, not only in the client | The MFA claim is checked in `src/routes/guards.tsx` and nowhere else. Someone holding a stolen password but not the mailbox never loads the React app — they use the Firebase SDK directly and get everything their role permits. Add `request.auth.token.mfaVerifiedFor == request.auth.token.auth_time` to `isVerifiedOrg()` / `isDeveloper()`, and to `verifyAuth()` |
| B17 | Constrain `/api/email/send` recipients to people the caller has a relationship with | Any signed-in account can send 10 arbitrary addresses per request, 20 requests per 10 minutes, with an attacker-chosen subject and body, from the SPF/DKIM-signed sending domain. Templates are escaped and `actionUrl` is origin-locked, so this is impersonation and domain-reputation risk rather than link injection — but the same relationship query `hasAcceptedApplication()` already runs would close it |
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
- **Redesign.** Owner's instruction. The UI is rated medium-to-high and is not
 the problem.
- **New features before v1.1.** The whole point of this ordering.
