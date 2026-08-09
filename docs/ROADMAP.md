# Roadmap

Where the project is, and what has to happen before each version ships.

Ordered on one principle from the technical review: **stabilise the foundation
before adding anything to it.** Every architecture item below is placed ahead of
the features that would otherwise sit on top of it.

Issue references (`B1`, `F5`) point at [`STATUS.md`](STATUS.md).

---

## Where we are

The foundation is sound and does not need rewriting. Auth, role separation and
security rules were built intentionally and now survive 51 adversarial tests. The
full student↔organization journey works against real data. Documentation and
repository hygiene were the weakest areas and are now addressed.

What is *not* yet true: the product has not been driven end to end by hand for
the organization or developer roles, email delivery is broken, and there is no
CI. Those are the gap between "the code is right" and "the service is ready".

---

## v1.0. Production ready

**Goal:** real students and real organizations can use this without losing data,
being locked out, or seeing something untrue.

### Blockers

| # | Work | Why it blocks |
|---|---|---|
| B1 | Valid `RESEND_API_KEY`, verified sender, `check:email` green | Two-factor is mandatory for organizations and arrives by email. With mail down **no organization can sign in at all** |
| B2 | A recovery path for a locked-out organization | Otherwise one bounced email permanently removes an organization from the platform |
| B3 | Confirm Firestore backups are enabled | Hour records are graduation evidence. Unrecoverable if lost |
| B6 | Hand-test the organization dashboard and developer console | 3,388 lines of UI that no human has walked through |
|, | Hand-test MFA code entry end to end | Blocked by B1 |
|, | Set `APP_URL` in Vercel | Currently relying on a hardcoded fallback |

### Should also land

| # | Work |
|---|---|
| B4 | CI running `lint`, `check:security`, `check:flows` on every push |
| B5 | Bound `hoursRequests.hours` in the security rules |
| B7 | Delete the `chats`/`messages` rules, or build the feature |
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
| B12 | Split the three oversized pages (2,428 / 1,836 / 1,552 lines) into data hooks + presentational components | These are where every hard-to-find bug in this audit lived |
| B14 | One shared error-presentation pattern | Wording and behaviour currently differ per page; silent failures kept appearing because there was no standard |
| B11 | Get `test:rules` running (Java + emulator) | Rules are proven live today; unit tests make them provable in CI |
| B9 | Single source of truth for developer identity | Adding a developer should not require an environment change and redeploy |

**Do not start v2 features before this is done.** These files are already the
reason bugs hid; adding to them compounds it.

---

## v2.0. Product depth

Only on a stable foundation. Priority is a judgement call for the owner; this is
a suggested order.

| Work | Notes |
|---|---|
| Live updates between student and organization | Currently each side sees the other's changes on next load. `onSnapshot` on applications and hours would make acceptance appear instantly |
| Move uploads to Cloud Storage (B10) | Removes the 1 MiB document ceiling and makes resumes cheaper to serve |
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
