# Volunteer North York — session handoff

Everything from a long working session, written so another AI (or developer) can
pick up without re-deriving context. This is a summary, not a verbatim
transcript.

**Repo:** https://github.com/mrbread56/volunteerny-appV2
**Local path:** `C:\Users\ASUS\Downloads\VNY_V14`
**Live:** https://volunteerny-app-v2.vercel.app
**Last commit at time of writing:** `490f937`

---

## 1. What the project is

A two-sided platform matching Ontario high school students with volunteer
opportunities at nonprofits, and tracking the **40 community-involvement hours**
students need to graduate.

Built by **one person**, a high school student, who is not a professional
engineer, using AI development tools. Started late 2025. **No deadline.**
Currently ~10 students and 1 organization in the database.

Full background including a 20-student survey (75% confirmed the problem) and
reviews from Professors Chechik (Toronto), Zhao and Avery (Waterloo) is in
`docs/PROJECT.md`.

### Stack
React 19 + TypeScript + Vite SPA · Express API (`server.ts`) · Firebase
(Firestore + Auth, **named database** not `(default)`) · Resend for email ·
Gemini for optional AI triage · Vercel hosting (`api/index.ts` wraps the Express
app).

### The single most important architectural fact
**The browser talks to Firestore directly.** There is no API layer in front of
most reads and writes. `firestore.rules` **is** the authorization layer for the
majority of the app. The Express API exists only for operations rules cannot
express (things needing a query, a secret, or a privileged cross-user read).

---

## 2. Where this session started

A professor reviewed the project and gave detailed feedback. His core points:

1. **Don't rewrite** — the foundation is sound and continuable
2. **Stabilise before adding features** — architecture first
3. Step 1: technical stabilisation — bring up the dev environment, examine
   Firebase, test auth and every role by hand (not just read the code), and map
   the architecture at the same time
4. Then produce **a complete list of bugs**, then a **roadmap** (v1/v2/v3)
5. **Take documentation seriously** so the project doesn't depend on one person
6. Detailed tests for permissions, auth, application flow, org flow
7. Security review before production: env vars, auth, Firebase rules, external APIs
8. Repo cleanup — leftover scripts everywhere
9. **Separate routing and guards**
10. Some files ~1,700 lines, too big
11. Error handling needs normalising
12. No README — a new team can't onboard

His ratings: frontend medium-high, backend/API medium, database/auth
medium-high, UI/UX medium-high, testing "better than other projects", devops
medium, maintainability medium, complexity 6.5–7/10.

His tracked response document is `docs/REVIEW-RESPONSE.md` (points R1–R38).

---

## 3. What was done — verified and pushed

### Security fixes (all had working proof-of-concept attacks)
- **A student could approve their own graduation hours.** The approval endpoint
  trusted `coordinatorContact`, a field the *student* writes. Register that
  address as an organization → self-credit. Attack now in `check:security`;
  was HTTP 200 + 20 hours credited, now 403.
- **Any organization could alter any student's hours** (add or erase).
  `hasOnly()` limits *which fields*, never *whose document*. Moved to
  `POST /api/hours/approve` with a real relationship check; the org branch was
  deleted from the rules entirely.
- **Any organization could read any student's file**, including uploaded resume
  and passport documents. Now scoped to actual applicants, passport never returned.
- **Anyone with an account could send phishing from the verified mail domain**
  with an arbitrary button link — `actionUrl` now constrained to same-origin.
- **`.env.example` published a real personal email** — the exact account to
  compromise for developer access.
- **Three server routes leaked raw provider errors** to end users, including on
  the two-factor screen.

### Functional fixes
- Google sign-in permanently locked out new users (the popup creates the account,
  then the app signed them out into an unusable state)
- Ratings silently discarded (`orgId` never stored)
- Leaderboard ranked every student at zero
- Organizations told applicants were emailed when nothing was sent
- Every button in every email pointed at the **mail domain**, which serves no
  website — all dead links
- Real students shown **fabricated volunteer placements** when the database was
  empty
- ~20 silent failures (a `catch` that only reached `console.error`)
- Dashboard scrolled sideways on every phone (`flex` item without `min-w-0`)
- An extensionless import took down the **entire API** in production

### Architecture
- **Routing separated from guards**: `App.tsx` 409 → 85 lines. Guards in
  `src/routes/guards.tsx`, route table in `src/routes/AppRoutes.tsx`.
- **File sizes**: StudentDashboard 2,428 → ~1,850; DeveloperDashboard 1,836 →
  ~1,628; OrgDashboard 1,552 → ~1,400. Seven modules extracted.
- **One error-handling pattern**: `src/lib/errors.ts` — `toUserMessage()` and
  `reportError()`. Both duplicated auth-error maps now delegate to it.
- **TypeScript `strict` enabled** — cost 9 fixes, 3 were real bugs.
- **CI** (`.github/workflows/ci.yml`) — types, ESM guard, build, and the
  adversarial suite. A push to `main` with missing secrets **fails** rather than
  reporting green over zero tests.
- **Nightly encrypted backups** (`.github/workflows/backup.yml`) + `npm run
  restore` + `check:backup` proving the round trip.
- **Client error sink** — `POST /api/log/client-error`, wired to the React error
  boundary. The crash screen previously claimed "our team has been notified",
  which was true of nobody.
- Deleted: 40 leftover scripts, a 1.1 MB committed bundle, `supabase/`,
  `render.yaml`, dead `chats`/`messages` rules, unrendered `CalendarView.tsx`.

### Documentation (all in `docs/`)
`PROJECT.md` · `ARCHITECTURE.md` · `ARCHITECTURE-PRINCIPLES.md` (10 principles,
each tied to a real incident) · `STATUS.md` · `ROADMAP.md` · `RUNBOOK.md` ·
`REVIEW-RESPONSE.md`

---

## 4. ⚠️ OPEN BUGS — found by an independent review, NOT yet fixed

An agent with no prior context reviewed the code and found these. **I verified
the first four myself against the source.** These are the priority.

### P0-1. CLOSED — was already fixed before this document was written
`src/pages/DeveloperDashboard.tsx` — `handleGlobalPurgeOnwoo`

The original report: the function substring-matched
`JSON.stringify(entire document)`, and student documents carry base64 resume and
passport blobs up to 400 KB. Base64 contains essentially every 3-character
sequence, so typing `abc` to remove "ABC Charity" would have deleted every
student. No dry run, no undo.

Re-checked on 2026-08-09: the function is gone, removed in commit `67680a9`.
Three orphaned `useState` lines survived it and have now been deleted too.
`grep -rn "handleGlobalPurge\|adminPurgeQuery" src/` returns nothing. Nothing
left to do here. Start at P0-2.

### P0-2. Phishing vector still open (I incorrectly marked this fixed)
`server/emailTemplates.ts:430` and `:436`

```ts
<div class="auth-box">${code}</div>
```

Every other template escapes with `esc()`. This one doesn't. Any authenticated
account can POST `/api/email/send` with `templateName: 'auth_verification'` and
`code: '<a href="https://evil.example">Click to verify</a>'` — producing an
SPF/DKIM-signed email from the real domain, identical to a genuine 2FA notice.

Only the `actionUrl` door was closed. **`docs/STATUS.md` F4 claims this is
fixed. It is not.**

**Fix:** escape `${code}`, and restrict which templates a client may select.
`auth_verification` and `admin_alert` should be server-internal only.

### P0-3. Hours can be double-credited (race)
`server.ts:718-729` vs `:786-811`

The `status === 'pending'` check runs **outside** the transaction; the
transaction reads only `studentRef`. Two concurrent approvals both pass the
pre-check, both append. A double-clicked 15-hour approval credits 30 hours,
both entries marked `approved: true`.

**Fix:** `tx.get(requestRef)` **inside** the transaction and assert `pending`
there. ~5 lines.

### P0-4. The "Mark as reviewed" button cannot work
`src/types.ts:106` declares `'reviewed'`. `firestore.rules:158`
`isValidApplication` allows only `['pending','accepted','rejected','terminated','waitlist']`.
`OrgOpportunityApplicants.tsx:772` calls `updateStatus(id, 'reviewed')` → the
write is **rejected with permission-denied** against real Firestore. Passes in
demo mode because demo mode never touches Firestore.

**Fix:** add `'reviewed'` to the rules list (one word) or remove the feature.

### P1 — also reported, not independently verified by me
- **Demo fixtures still in the real read path.** `StudentDashboard.tsx:842-848`
  and `:867-873` merge `demo_saved_ids` / `demo_opportunities` into real
  queries. Removed from the recommendations query, left in saved opportunities.
- **`handleDeleteUser` creates orphans** (`DeveloperDashboard.tsx:473-478`) —
  deletes Firestore docs but never the Auth account. Manufactures the exact
  state the recovery screen apologises for.
- **Rules `get()` budget** — `firestore.rules:363-368` calls `exists()` + `get()`
  per applicant. Firestore caps document accesses at 10 per query. An org with
  ~6 opportunities gets `permission-denied` on its **whole** applicant list.
- **`StudentDashboard.tsx:928`** — effect depends on `studentProfile`, an object
  with a fresh identity each fetch. Refetches everything with no cancellation →
  stale writes.
- **Unbounded reads** — `StudentDashboard.tsx:790` reads the entire
  `organizations` collection; developer console streams every student's base64
  passport into the browser.
- **CI writes to production.** `.firebaserc` has one project. `check-security.ts`
  cleanup deletes only `users`/`students`/`organizations` — `hoursRequests`
  created at `:365` and `:404` **persist forever**.
- **`test:rules` cannot run** — the primary authorization layer has zero unit
  tests, against this project's own written principle #6.
- **Rules gaps in newer collections** — `recommendations` readable by *any*
  org; `update` doesn't re-validate the bounds `create` enforces (create a valid
  rating, then PATCH `stars: 999999`).

### Documentation that disagrees with the code
- `STATUS.md` says F4 (phishing) is fixed — **it isn't** (P0-2)
- `STATUS.md` says both demo fallbacks removed — **one remains**
- `STATUS.md` says `51/51` in one place and `56` in another
- `README.md` still says "routing not separated from `App.tsx`" — it was
  separated days ago
- Line counts in both docs were typed, not measured, and are wrong
- `README.md` claims checks "clean up after themselves" — `hoursRequests` don't

---

## 5. Marketplace architecture research (LinkedIn / Meta / Airbnb / Handshake)

Key transferable ideas, filtered for a project this size:

**ADOPT NOW**
- **Materialise the edge both directions** (Meta TAO's inverse associations).
  Applications already carry `orgId` but nothing uses it — `types.ts` has both
  `orgId?` and `organizationId?`, optional. Making it required collapses a
  30-item chunked fan-out into one query and removes the rules `get()` ceiling.
- **Deterministic document IDs** — `applications` uses `addDoc` (auto-ID), so a
  double-click creates duplicate applications, corrupting capacity and waitlist
  ordering. `setDoc(doc(db,'applications', \`${uid}_${oppId}\`))` makes it
  structurally impossible. The codebase already does this for `orgRatings`.
- **Gate reviews on a verified completed transaction** — anyone can currently
  rate any org, and *nothing displays ratings anywhere*.
- **Append-only ledger for hours** — a graduation record with no history is
  weak if ever challenged.

**NEVER for this project:** microservices, sharding, Kafka, Elasticsearch, ML
ranking, caching layers, CQRS, GraphQL, A/B infrastructure. All solve problems
5–7 orders of magnitude away.

**The non-engineering point:** 1 organization, 10 students. Network effects here
are hyperlocal (a North York student can't use a Scarborough placement). Twenty
real North York organizations would improve the product more than every code
change combined.

---

## 6. Current verified state

```
tsc --strict          0 errors
ESM guard             pass
production build      pass
check:security        56/56
check:flows           13/13
check:signup          6/6
check:queries         0 failures
check:email           4/4
check:backup          round trip passes
check:errors          pass
check:certificate     pass
sweep:console         0 unexpected (every route, every role)
```

Useful commands:
```bash
npm run dev            # app + API on :3000
npm run lint           # tsc --strict + ESM guard
npm run check:security # 56 adversarial tests against the real project
npm run backup         # snapshot to backups/ (gitignored, contains PII)
npx tsx scripts/grant-mfa.ts <email>   # unblock an org stuck at 2FA
```

---

## 7. If you are the next AI picking this up

**Do first, in order:** P0-2 (escape `${code}` + restrict templates), P0-3 (move
the pending check into the transaction), P0-4 (the `reviewed` status mismatch).
P0-1 is already closed, see above.

**Then:** the P1 list, then reconcile the documentation with reality — several
`STATUS.md` claims are wrong, which is worse than having no document.

**Deliberately don't:** split the big components further (maintainability debt,
not correctness), add ESLint, migrate uploads to Cloud Storage, or add any new
feature. The professor was explicit and he's right.

**House rules that matter** (`docs/ARCHITECTURE-PRINCIPLES.md`):
1. If a security rule needs a *query*, that operation belongs on the server
2. Never let the authorising fact be one the actor controls
3. Silence is a bug — every catch either recovers or reports
6. A check that cannot fail proves nothing — see it fail for the right reason first

**Verify claims against the code, not against the docs.** This session found
three things the documentation said were fixed that were not.
