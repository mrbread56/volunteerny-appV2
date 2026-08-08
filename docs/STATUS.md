# Project status — evidence-based audit

**Last updated:** 8 August 2026
**Method:** every claim below is backed by either a named check script that can
be re-run, or a hand-test performed against the real Firebase project through
the real UI. Nothing here is "we think it works".

This file replaces `TODO.md` and `AUDIT_REPORT.md`, which listed items that had
already been fixed and gave the impression the project was unfinished.

---

## How to reproduce this audit

```bash
npm run lint            # types + ESM resolution guard
npm run check:firebase  # credentials, named database, admin SDK
npm run check:security  # 51 adversarial tests: cross-tenant, privilege escalation, API authz
npm run check:flows     # full student↔organization journey against real data
npm run check:signup    # signup writes both documents; self-crediting refused
npm run check:queries   # every query has its index
npm run check:hours     # hour arithmetic, including non-numeric input
npm run check:email     # Resend credentials + every link in every template
npm run sweep:console   # every route as every role, console must be silent
```

---

## Summary

| Area | State | Evidence |
|---|---|---|
| Auth & roles | **Working** | `check:security` 51/51 |
| Permissions / rules | **Working** | audited with the official Firebase rules auditor; 51 adversarial tests |
| Student signup → onboarding → dashboard | **Working** | hand-tested, real account |
| Organization signup → MFA gate | **Working** | hand-tested, real account |
| Application flow | **Working** | `check:flows` 13/13 |
| Hours approval | **Working** | `check:flows`, plus self-approval attack refused |
| Leaderboard | **Working** | `check:flows` |
| Email delivery | **Blocked** | invalid `RESEND_API_KEY` locally — see B1 |
| Organization dashboard (hand-test) | **Not yet tested** | — |
| Developer console (hand-test) | **Not yet tested** | — |
| MFA code entry (hand-test) | **Not yet tested** | blocked by B1 |

---

## Open issues

Severity: **P0** blocks launch · **P1** fix before real students · **P2** should
fix · **P3** cosmetic or long-term.

### P0 — blocks launch

**B1. Email delivery is dead, and it locks organizations out.**
`check:email` returns 401: the `RESEND_API_KEY` in `.env` is revoked or from
another account. Two-factor is **mandatory** for organizations and the code is
delivered by email, so with mail down **no organization can ever sign in**. The
only controls on the MFA screen are "Resend" and "Sign out"; there is no
alternative route in.
*Verified:* hand-tested organization signup — reached `/mfa`, code never
arrived. *Fix:* set a valid key; then re-run `check:email`.

**B2. There is no way to recover a locked-out organization.**
Beyond B1: if a real organization's mail bounces, lands in spam, or Resend has
an outage, that account is permanently unreachable with no support path in the
product. *Fix:* an admin-triggered manual verification in the developer console,
or a documented support process.

### P1 — fix before real students use it

**B3. Firestore has no backups configured.**
Not verified either way — needs checking in the Firebase console. Student hour
records are graduation evidence; losing them is unrecoverable.

**B4. No CI.** Every check in `scripts/` is run by hand, so nothing prevents a
regression reaching `main`. *Fix:* run `lint`, `check:security` and
`check:flows` on push.

**B5. `hoursRequests.hours` has no upper bound in the rules.**
A student can submit a request for any number. The server caps a single
approval at 24, so this cannot be credited — but the queue can be filled with
absurd values. *Fix:* bound it in `isValidHoursRequest`.

**B6. Organization dashboard and developer console have never been hand-tested.**
Both are large (1,552 and 1,836 lines). Automated checks cover their data paths;
nothing covers their UI. *This is the largest remaining gap in this audit.*

### P2 — should fix

**B7. `chats` and `messages` have complete security rules and zero code.**
Unreachable permissions nobody tests. *Fix:* build them or delete the rules.

**B8. `CalendarView.tsx` is 827 lines and is never rendered.**

**B9. Developer identity is split** between `users/{uid}.role` and the
`VITE_DEVELOPER_EMAILS` allowlist, so adding a developer means an environment
change and a redeploy.

**B10. Uploads are base64 inside Firestore documents**, capped at 400 KB each by
the rules and bounded by the 1 MiB document limit. Belongs in Cloud Storage.

**B11. Rules unit tests cannot run here** — `test:rules` needs Java and the
Firebase emulator. Rules are currently proven by live adversarial tests instead.

### P3 — long-term

**B12. Oversized components.** `StudentDashboard.tsx` 2,428 lines,
`DeveloperDashboard.tsx` 1,836, `OrgDashboard.tsx` 1,552.

**B13. Routing and guards live inside `App.tsx`** rather than a reviewable
module of their own.

**B14. Error-message wording is inconsistent** across pages — some say
"Couldn't…", some "Failed to…", some show provider text.

---

## Fixed and verified during this audit

Each was reproduced first, then fixed, then re-verified.

| # | Issue | Severity | Proof |
|---|---|---|---|
| F1 | **A student could approve their own graduation hours.** The approval endpoint trusted `coordinatorContact`, a field the student writes. Register that address as an organization → self-credit. | Critical | `check:security` performs the attack; was HTTP 200 + 20 hours credited, now 403 |
| F2 | **Any organization could alter any student's hours** — add or erase. `hasOnly()` limits which fields, never whose document. | Critical | `check:security` |
| F3 | **Any organization could read any student's file**, including uploaded resume and passport documents. | Critical | `check:flows` asserts no `passportUrl` is returned |
| F4 | **Anyone with an account could send phishing from the verified mail domain** with an arbitrary button link. | Critical | `check:security` |
| F5 | **Real students were shown volunteer placements that do not exist** — the dashboard fell back to fabricated demo data when the database was empty, contradicting the Browse page. | High | hand-tested |
| F6 | Google sign-in permanently locked out new users. | High | hand-tested |
| F7 | Ratings were silently discarded (`orgId` was never stored). | High | `check:flows` |
| F8 | Leaderboard ranked every student at zero. | High | `check:flows` |
| F9 | Organizations were told applicants had been emailed when nothing was sent. | High | code + `check:email` |
| F10 | Every button in every email pointed at the mail domain, which serves no website. | High | `check:email` |
| F11 | An extensionless import took down the entire API in production. | Critical | `check:esm`, added to `lint` |
| F12 | Safety-report AI triage always 401'd; reports were filed with a placeholder summary. | Medium | code |
| F13 | Undo race could delete the wrong tracking entry and never settle its promise. | Medium | code |
| F14 | `.env.example` published a real personal email — the exact account to compromise for developer access. | Medium | fixed |
| F15 | `send-otp` leaked raw provider errors, the sending address and infrastructure hints to end users. | Medium | fixed, gated on `NODE_ENV` |
| F16 | Five user actions failed silently (2FA toggle, leaderboard visibility, saving, ban, report resolution). | Medium | code |
| F17 | Dashboard scrolled sideways on every phone (`flex` item without `min-w-0`). | Medium | measured 382.7px in a 375.3px parent |
| F18 | Onboarding validation errors were invisible to screen readers. | Medium | fixed |
| F19 | 40 leftover scripts and a 1.1 MB build artifact committed to the repo root. | Low | 6,695 lines removed |

---

## Deliberately not done

- **No redesign.** Owner's explicit instruction.
- **No new features** until the architecture work in `ROADMAP.md` is complete.
- **Design-hook findings on status-coloured borders** left as-is: the colour is
  bound to application status and carries real information.
