# Architecture

How this system actually works, derived from the code rather than from
intentions. If something here disagrees with the code, the code is right and
this file is stale, fix it.

- [Shape of the system](#shape-of-the-system)
- [Roles and identity](#roles-and-identity)
- [Data model](#data-model)
- [Authorization](#authorization)
- [Why some operations live on the server](#why-some-operations-live-on-the-server)
- [The core journey](#the-core-journey)
- [External services](#external-services)
- [Known architectural debt](#known-architectural-debt)

---

## Shape of the system

```
Browser (React SPA)
   │
   ├── Firebase Auth ──────────► identity, ID tokens, MFA custom claim
   │
   ├── Firestore (client SDK) ─► most reads and writes, constrained by firestore.rules
   │
   └── Express API (/api/*) ───► the operations rules cannot safely allow
                                  │
                                  ├── Firebase Admin SDK (bypasses rules)
                                  ├── Resend (email)
                                  └── Gemini (optional AI triage)
```

Two things are worth understanding before changing anything:

**1. The client talks to the database directly.** Most reads and writes go
browser → Firestore. There is no API layer in front of them. This means
`firestore.rules` *is* the authorization layer for the majority of the app, not an extra safety net behind server checks.

**2. The API exists only for what rules cannot express.** Every `/api` route is
there because the operation needs either a privileged cross-user read, a secret,
or a check that security rules are structurally incapable of performing. See
[why some operations live on the server](#why-some-operations-live-on-the-server).

`server.ts` is a single Express app. In development it mounts Vite as
middleware; in production it serves `dist/` and the API. `api/index.ts` is a
three-line Vercel wrapper around it.

---

## Roles and identity

Role lives on `users/{uid}.role` and is one of `student`, `organization`,
`developer`. It is set once at signup and **cannot be changed by the account
holder**, `firestore.rules` requires `incoming().role == existing().role` on
update, and `isValidUser()` only accepts `student` or `organization` at create
time, so nobody can self-assign `developer`.

The developer console has a second gate: the caller's email must appear in
`VITE_DEVELOPER_EMAILS`. Role alone is not enough.

### Two-factor

Mandatory for organizations (they hold contact details for many students, often
minors), optional for students.

The important property: **verification is a signed Firebase custom claim**
(`mfaVerified`), set by the server after checking an emailed one-time code. It
is never a client-side flag. If the server cannot write the claim it fails the
verification rather than letting the client mark itself verified, see
`/api/auth/verify-otp`.

The code itself: 6 digits, `crypto.randomInt`, 5 attempts, expires, cleared on
success.

---

## Data model

Firestore, in a **named database** (not `(default)`). Both
`VITE_FIREBASE_DATABASE_ID` and `FIREBASE_DATABASE_ID` must be set or every
query fails with `5 NOT_FOUND`.

### Live collections

| Collection | Key | Holds | Written by |
|---|---|---|---|
| `users` | uid | email, role, twoFactorEnabled | owner at signup; role immutable after |
| `students` | uid | profile, `loggedHours[]`, `hours` | owner (profile only); **server** (hours only) |
| `organizations` | uid | profile, CRA number, `craVerified` | owner (profile only); developer (verification) |
| `opportunities` | auto | listing, `orgId`, capacity, schedule | owning organization |
| `applications` | auto | `studentId`, `opportunityId`, `orgId`, status | student creates; organization updates status |
| `hoursRequests` | auto | student-submitted hours awaiting sign-off | student creates; **server** settles |
| `savedOpportunities` | auto | student bookmarks | owner |
| `orgRatings` | auto | student's rating of an organization | student, once per opportunity |
| `feedbacks` | auto | support tickets | owner; developer replies |
| `reports` | auto | safety reports | reporter; developer resolves |
| `leaderboards` | `global_top` | materialised top-100 | **server only**, no client can write |

### Declared but unused

`recommendations` and `interestRequests` are referenced once each.

`chats` and `messages` used to sit here with a complete rule set and no code at
all. Both the rules and the unrendered calendar component were deleted rather
than left in place: an unused rule is live, reachable permission on the
production database that no test covers and no feature justifies. Messaging is
a v2 item; write the rules then, from the shape the feature actually needs.

### The one denormalisation

`students/{uid}.hours` is the sum of `students/{uid}.loggedHours[]`.

It exists because the leaderboard sorts on it, and Firestore cannot order by a
computed value. It is **always recomputed from the array**, never incremented,
so a retry cannot double-count and the two can never drift. Both are written in
a single transaction by the server.

This is also why `orderBy('hours')` silently excludes students who have never
had hours approved. Firestore omits documents missing the field.
`npm run backfill:hours` fixes existing records.

---

## Authorization

`firestore.rules` is the real access-control layer. Its design:

- **Default deny.** Everything is closed, then specific paths open.
- **`get` and `list` are separated.** A student may read their own document but
 may not enumerate the collection. Getting this wrong leaks every record.
- **Optional fields use `data.get(field, null)`, never `data.field == null`.**
 Reading an absent key is an *evaluation error* in the rules language, and an
 erroring condition denies the request. This once denied every real browser
 signup while Admin-SDK test fixtures passed, because the Admin SDK bypasses
 rules entirely.
- **Trust signals are not self-settable.** An organization cannot write its own
 `craVerified` or `verificationStatus`; a student cannot write their own
 `hours` or `loggedHours`; nobody can write `leaderboards`.

### The limit that shaped the design

`hasOnly()` constrains **which fields** a write may touch. It cannot constrain
**whose document** is written.

So a rule saying "an organization may write `loggedHours`" permits *any*
organization to write *any* student's hours. Creating an organization account is
free and instant, and Ontario requires 40 community-involvement hours to
graduate. That combination is a forged or destroyed graduation record.

The missing check is "does this organization have a relationship with this
student", which requires a query across `applications` and `opportunities`.
Rules can only read one exact document path. **They structurally cannot answer
it.** So the authority moved to the server and the organization branch was
removed from the rule entirely.

**When you find yourself needing a rule that depends on a query, that operation
belongs on the server.**

---

## Why some operations live on the server

| Route | Why it cannot be client-side |
|---|---|
| `POST /api/hours/approve` | Needs the relationship check above. Verifies an `hoursRequest` addressed to this org, or an accepted application to one of its opportunities, then writes in a transaction. |
| `GET /api/students/:id/review-profile` | An org reviewing an applicant needs their profile, but must not be able to read *every* student. Returns only applicants of that org, and omits sensitive documents. |
| `GET /api/opportunities/:id/accepted-count` | Counting other students' applications. Rules correctly refuse; returns an integer, never a record. |
| `POST /api/leaderboard/refresh` | Cross-user aggregation over all students. Throttled, plus a 15-minute timer. |
| `POST /api/auth/send-otp` / `verify-otp` | Only the server may set the `mfaVerified` custom claim. |
| `POST /api/email/send` | Holds the Resend key. Templates are fixed and `actionUrl` is constrained to our own origin, so the endpoint cannot be used to send phishing from a verified domain. |
| `GET /api/email/history` | Recipient addresses are personal data, developer allowlist only. |
| `POST /api/feedback/analyze` | Holds the Gemini key. |

Every route calls `verifyAuth()`, which validates a real Firebase ID token.
Demo-mode tokens are self-asserted and are **rejected when `NODE_ENV=production`**.

---

## The core journey

```
Student                          Organization                    System
───────                          ────────────                    ──────
signs up ─────────────────────────────────────────────────────►  users + students
completes onboarding
browses opportunities ◄──────── posts opportunity ────────────►  opportunities
applies ──────────────────────────────────────────────────────►  applications
                                                                 (server checks capacity
                                                                  → pending or waitlist)
                                 reviews applicant ────────────►  server returns profile
                                 accepts / rejects ────────────►  application.status
                                                                 + email to student
logs hours ───────────────────────────────────────────────────►  hoursRequests
                                 approves ─────────────────────►  server verifies
                                                                  relationship, then
                                                                  loggedHours + hours
                                                                  in one transaction
                                                                 → leaderboard rebuild
rates the organization ───────────────────────────────────────►  orgRatings
```

Data flows one way through documents; there are no live listeners on this path,
so each side sees the other's changes on next load rather than instantly. That
is a deliberate current limitation, not a bug.

---

## External services

| Service | Used for | Failure behaviour |
|---|---|---|
| Firebase Auth | Identity, MFA claim | Hard dependency |
| Firestore | All persistence | Hard dependency |
| Resend | Transactional email | API answers 503; the app continues and reports the failure honestly rather than claiming success |
| Gemini | AI triage of feedback and safety reports | Degrades to a generic summary; the ticket is still filed |
| OpenStreetMap Nominatim | Address geocoding | Requests are aborted on unmount; failure leaves the map at its default |

---

## Known architectural debt

Ordered by how much pain it will cause.

1. **Oversized page components.** `StudentDashboard.tsx` ~2,400 lines,
 `DeveloperDashboard.tsx` ~1,800, `OrgDashboard.tsx` ~1,550. Data fetching,
 business logic and presentation are interleaved, which is why bugs in them
 were hard to find and are easy to reintroduce.
2. **Routing and guards live inside `App.tsx`.** Route definitions, role guards
 and the MFA gate should be separated so authorization is reviewable in one
 place.
3. **No CI.** Every check in `scripts/` is run by hand, so nothing stops a
 regression reaching `main`.
4. **Uploads are base64 in Firestore documents.** Bounded by the 1 MiB document
 limit and expensive to read; belongs in Cloud Storage with signed URLs.
6. **Developer identity is split** between a Firestore role and an email
 allowlist, so adding a developer means changing an environment variable.
7. **Rules tests cannot run** in the current environment (need Java and the
 Firebase emulator), so rules are verified by live adversarial tests
 (`check:security`) instead of unit tests.

---

## Error handling

One rule, because breaking it is this codebase's most repeated bug:

**A user action that can fail must tell the user when it fails, and must never
show them a raw error.**

Use `lib/errors.ts`:

```ts
import { reportError } from '../lib/errors';

try {
  await saveProfile();
} catch (err) {
  // Logs the real error, returns a sentence safe to display.
  setErrorMessage(reportError('save profile', err, "Couldn't save your profile."));
}
```

`toUserMessage()` maps Firebase Auth and Firestore codes to plain language and
falls back rather than leaking; `reportError()` pairs that with a console log so
the developer keeps the detail. `npm run check:errors` pins the behaviour.

Why it matters here specifically:

- **Silent failure.** A `catch` that only calls `console.error` is a button that
 does nothing. Around twenty of these were found and fixed, saving an
 opportunity, submitting a rating, toggling two-factor, resolving a safety
 report. Each looked like a working feature.
- **Leaking.** Firebase messages name internal collections; provider messages
 cite their own documentation. Three server routes were returning those
 verbatim to end users, including on the two-factor screen.
- **`alert()`.** Blocking, unstyled, unannounced to screen readers. All twelve
 are gone. Do not reintroduce one: `npm run check:errors` does not catch it,
 but a browser dialog on a form means whatever the person typed is hidden
 behind it while they read the message.

Both duplicated auth-error maps (Login and Signup, overlapping on three codes
and disagreeing on the wording) now delegate here.
