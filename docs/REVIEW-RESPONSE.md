# Response to the external technical review

Every point from the reviewer's assessment, given an ID, a status, and the
evidence for that status. Nothing is marked done without something you can
re-run or read.

**Legend** — ✅ done · 🔄 in progress · ⬜ not started · 📌 needs the project
owner · ➖ noted, no action needed

| Status | Count |
|---|---|
| ✅ Done | 23 |
| 🔄 In progress | 1 |
| ⬜ Not started | 4 |
| 📌 Owner action | 2 |
| ➖ Acknowledged | 3 |

---

## 1. Repository hygiene and technical debt

| ID | His point | Status | Evidence |
|---|---|---|---|
| R1 | Repo needs cleanup — `revert`, `script-grep`, temp scripts left everywhere | ✅ | `633855d` — 49 files, 6,695 lines removed. `.gitignore` patterns added so they cannot return |
| R2 | Committed build artifacts and stray files | ✅ | 1.1 MB `index.js` bundle, `Home_Overwritten.tsx`, scratch HTML, a `.patch`, a server log — all removed in `633855d` |
| R3 | Documentation not organised | ✅ | `docs/` created; `ARCHITECTURE.md`, `STATUS.md`, `ROADMAP.md`, `security_spec.md` moved out of the root. Only `README.md` stays at top level |
| R4 | No README — a new team cannot onboard | ✅ | The old one was a 1-line UTF-16 stub reading "OpenHands Initializing". Replaced in `7b1ae6d`: stack, setup, every env var marked public or secret, all 17 scripts, deploy, pre-ship checklist |
| R5 | `TODO.md` and `AUDIT_REPORT.md` suggest unfinished work | ✅ | Deleted in `76eb047`. Every item in `TODO.md` was in fact already ticked, but a file headed "🔴 CRITICAL" tells a reviewer the project is unfinished regardless. Replaced by `STATUS.md` |

## 2. Step 1 — technical stabilisation

| ID | His point | Status | Evidence |
|---|---|---|---|
| R6 | Bring up the development environment | ✅ | Runs on `npm run dev`; documented in the README |
| R7 | Examine Firebase | ✅ | `npm run check:firebase` — 13/13. Credentials, named database, Admin SDK, custom claims, Firestore reads |
| R8 | Test the auth of the roles | ✅ | `npm run check:security` — 51 adversarial tests: cross-tenant reads, privilege escalation, API authorization |
| R9 | Test the main roles by hand — do not just rely on the code | ✅ | All three roles walked end to end through the real UI with real accounts. Developer console: all six tabs render, no blanks, no overflow, no console errors. Also confirmed a Firestore-promoted developer outside the build-time allowlist now gets in |
| R10 | Test every bit: MFA, opportunities, orgs, tabs | ✅ | Signup → MFA gate → post opportunity → student sees it → applies → org reviews: all verified through the UI. Every tab on all three dashboards walked. Email delivery restored, so the MFA path was confirmed reaching Resend |
| R11 | Map the architecture | ✅ | `docs/ARCHITECTURE.md` — data model, live vs dead collections, authorization design, why each server route exists |
| R12 | Show what needs fixing rather than "we think it's ready" | ✅ | `docs/STATUS.md` — every claim backed by a named script or a hand-test, and it names what has **not** been tested |

## 3. Step 2 — roadmap, then features

| ID | His point | Status | Evidence |
|---|---|---|---|
| R13 | Produce a development roadmap | ✅ | `docs/ROADMAP.md` — v1.0 / v1.1 / v2.0 / v3.0 |
| R14 | Prioritise new features by version | ✅ | Same file. Architecture work is deliberately placed **ahead** of every feature |
| R15 | Add features only on a stable foundation | ✅ | No new feature has been added this entire engagement. Only fixes, tests and documentation |
| R16 | Do not rewrite from scratch | ✅ | Agreed and followed |

## 4. Documentation and discipline

| ID | His point | Status | Evidence |
|---|---|---|---|
| R17 | Take documentation seriously — reduce single-developer dependency | ✅ | README + ARCHITECTURE + STATUS + ROADMAP + this file |
| R18 | Discipline and organisation in the workflow | ✅ | Docs organised under `docs/`, commits explain the *why*, and CI (`e8cc64d`) runs every check on push so none of it depends on memory |
| R19 | Explain the project: origin, goal, market, team size, deadline | ✅ | Answered by the owner. Summary in the README, full background in [`PROJECT.md`](PROJECT.md): origin, the 40-hour requirement, a 20-student survey (75% confirm the problem), reviews from Professors Chechik, Zhao and Avery, sole developer, no deadline |

## 5. Testing

| ID | His point | Status | Evidence |
|---|---|---|---|
| R20 | Detailed tests for permissions | ✅ | `check:security` — 51 tests |
| R21 | Detailed tests for auth | ✅ | `check:signup`, `check:security` |
| R22 | Detailed tests for the application flow | ✅ | `check:flows` — apply → accept → hours → approve → leaderboard → rate, 13/13 |
| R23 | Detailed tests for the org flow | ✅ | `check:flows` + hand-tested through the UI |
| R24 | Cheaper long-term maintenance through tests | ✅ | 9 check scripts, now run automatically by CI on every push. It caught a regression within minutes of existing |

## 6. Security review before production

| ID | His point | Status | Evidence |
|---|---|---|---|
| R25 | Review environment variables | ✅ | `.env` never committed; no secret carries a `VITE_` prefix. **Found:** `.env.example` published a real personal email — the exact account to compromise for developer access. Fixed |
| R26 | Review auth | ✅ | **Found and fixed a critical hole:** a student could approve their own graduation hours by naming an address they controlled as "coordinator" and registering it as an organization |
| R27 | Review Firebase rules | ✅ | Audited with the official Firebase rules auditor. `email_verified` is checked on the admin bootstrap, 26 size limits, type safety, `get`/`list` correctly separated |
| R28 | Review APIs to outside services | ✅ | **Found and fixed:** any account could send phishing from the verified mail domain with an arbitrary button link. Also three routes leaking raw provider errors to end users |
| R29 | Integrations need real credentials (Resend, Google) | 📌 | **Owner.** `RESEND_API_KEY` is currently revoked — this is blocker B1 |

## 7. Architecture and code structure

| ID | His point | Status | Evidence |
|---|---|---|---|
| R30 | **Separate the routing and the guard** | ✅ | `a34f96f`. `App.tsx` 409 → 85 lines. Guards now live in `src/routes/guards.tsx`, the route table in `src/routes/AppRoutes.tsx`. Pure move, verified by `sweep:console` |
| R31 | Some files are far too big (~1,700 lines) | 🔄 | **All three reduced.** `StudentDashboard.tsx` 2,428 → 1,841 (−24%), `OrgDashboard.tsx` 1,552 → 1,382 (−11%), `DeveloperDashboard.tsx` 1,836 → 1,606 (−13%). Seven modules extracted, each verified after the move; the process surfaced **eight** dependencies that were invisible while the code sat inside its parent. More could come out, but every file is now smaller and no longer the single place a bug can hide |
| R32 | Error handling needs normalising | ✅ | `src/lib/errors.ts` is the single mapping — `toUserMessage()` for Firebase Auth and Firestore codes, `reportError()` to log the original and return a safe sentence. Both duplicated maps delegate to it. **All 12 `alert()` calls converted to in-page messages.** Pinned by `check:errors` in CI; convention written up in [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| R33 | Component structure is acceptable — Calendar, ApplicationReview, Referral separated | ➖ | Agreed, no action. Note: `CalendarView.tsx` (827 lines) is never rendered |
| R34 | Stack is standard and sensible | ➖ | Agreed, no action |

## 8. His remaining concerns

| ID | His point | Status | Evidence |
|---|---|---|---|
| R35 | TODO lists open errors for email, tasks, Google Calendar, MFA | ➖ | Every item in that file was already ticked; he read the titles as open work. The file is gone, which removes the confusion |
| R36 | "The audit is not 100% — more errors I have not checked" | 🔄 | Correct. This engagement has found 20+ he did not see, including two critical security holes. `STATUS.md` names what remains untested |
| R37 | Project is continuable; do not start over | ➖ | Agreed |
| R38 | Needs a strong full-stack developer, not low-level coding | ➖ | Noted |

## 9. Still not started

| ID | Work | Why it matters |
|---|---|---|
| R31 | Split the three oversized pages | Every hard-to-find bug in this audit lived in them |
| — | Firestore backups | Unverified. Hour records are graduation evidence |

## 10. Needs the owner

| ID | Question |
|---|---|
| R29 | A working `RESEND_API_KEY` — **without it no organization can sign in at all** |
| — | Confirm Firestore backups are enabled |
