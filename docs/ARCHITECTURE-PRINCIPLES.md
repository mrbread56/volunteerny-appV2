# Architecture principles

`ARCHITECTURE.md` describes what this system **is**. This file says what **good
looks like** here, and why.

Every principle below is derived from a real defect found in this codebase, not
from a textbook. Each one names the incident that produced it. That is
deliberate: a rule with a scar attached survives contact with a deadline; a rule
copied from a blog post does not.

If you are new here, read this before changing anything. If you are reviewing a
change, these are the questions to ask.

---

## 1. Put the check where the check can actually be made

**The principle.** Authorization belongs at the layer that can see enough to
decide. If a rule needs information it cannot reach, moving the rule is the fix
— not weakening it.

**The incident.** `firestore.rules` allowed any account with
`role == 'organization'` to write `loggedHours` on any student. `hasOnly()`
constrains *which fields* a write may touch; it cannot constrain *whose
document*. The missing question was "does this organization have any
relationship with this student?", which needs a query across `applications` and
`opportunities`. Security rules can only read one exact document path. **They
structurally cannot answer it.**

Creating an organization account is free and instant. Ontario requires 40
community-involvement hours to graduate. So the gap was: anyone could forge or
erase any student's graduation record.

**The rule.** *When you find yourself writing a security rule that depends on a
query, that operation belongs on the server.* The organization branch was
deleted from the rules and `POST /api/hours/approve` now performs the
relationship check with the Admin SDK.

**How to apply it.** Before adding a rule, ask what it needs to know. If the
answer involves the word "any" or "other" — any application, another
collection — stop and write an endpoint.

---

## 2. Never let the authorising fact be one the actor controls

**The principle.** A permission check is only as strong as the weakest input it
trusts. Ask: *who wrote this value?*

**The incident.** After moving hours approval to the server, the endpoint
authorised on "the caller's email matches the request's `coordinatorContact`".
That field is written **by the student** when they submit the request. So a
student could name any address they controlled, register it as an organization,
and approve their own hours. The hole was reintroduced *by the fix for the same
hole*, one layer down.

**The rule.** *Trace every authorising value back to who wrote it.* If the actor
wrote it, it authorises nothing. A coordinator email match is now only a
tie-break for which request to settle — never the reason a write is allowed.

---

## 3. Silence is a bug

**The principle.** If a user action can fail, the user must be told. A `catch`
that only reaches `console.error` is a button that does nothing.

**The incident.** This was the single most repeated defect in the codebase —
around twenty instances. Saving an opportunity showed the bookmark filled while
the write had failed. A student's rating of an organization was silently
discarded. Toggling two-factor appeared to do nothing. A safety report involving
a minor could be marked resolved while still open in the database.

None of these looked broken. They looked like working features.

**The rule.** *Every catch either recovers or reports.* Use
`reportError(context, err, fallback)` from `lib/errors.ts` — it logs the
original and returns a sentence safe to display, which makes the reporting path
the easy one. `check:errors` pins the behaviour, including that it never returns
an empty string, because an empty error banner is indistinguishable from a
button that did nothing.

---

## 4. Never show a user a raw error

**The principle.** Internal error text is for the people who can act on it.

**The incident.** Three server routes returned provider messages verbatim,
including on the two-factor screen — an organization saw Resend's internal
guidance about test domains and a reference to Resend's documentation. Firebase
messages name internal collections; provider messages cite their own docs.
Neither means anything to a student, and both leak structure.

**The rule.** *Log the original, show the mapping.* Diagnostics are gated on
`NODE_ENV !== 'production'`.

---

## 5. One source of truth; derive the rest, never increment it

**The principle.** When the same fact lives in two places, they will disagree.
If you must duplicate for performance, recompute the copy from the source every
time.

**The incident.** `students/{uid}.hours` is a denormalised total of
`loggedHours[]`, needed because Firestore cannot order by a computed value. Only
the array was ever written, so the leaderboard ranked every student at zero. It
looked correct only because the dashboard injected a synthetic entry for the
viewer.

**The rule.** *Recompute, never increment.* A retry cannot double-count a
recomputation, and the copy can never drift from its source. Both fields are
written in one transaction.

---

## 6. A check that cannot fail proves nothing

**The principle.** Before trusting a test, see it fail for the right reason.

**The incident, twice.** The self-approval test first "passed" with HTTP 400 —
blocked by the per-entry 24-hour cap, not by authorization. Using a value under
the cap revealed the real hole: HTTP 200 and 20 hours credited. Separately,
`check:email` verified every email link against the route table by reading
`App.tsx`; when routing moved to `AppRoutes.tsx`, it silently saw **zero routes**
and reported everything as dead.

**The rule.** *Assert on the specific reason, and make a check fail loudly when
its own assumptions break.* `check:email` now refuses to pass if it finds no
routes at all. `backup.ts` refuses to write a backup that captured zero
documents. A file that looks like protection and isn't is worse than none.

---

## 7. Make dependencies explicit

**The principle.** Code that can reach anything depends on everything, and you
cannot see it.

**The incident.** Splitting the oversized dashboards surfaced **eight**
dependencies that were invisible while the code sat inside its parent — `cn`,
`evaluateBadges`, `handleToggle2FA`, `studentsList`, `isSubmittingLog` and
others. I had also guessed one entry shape wrong; TypeScript rejected it the
moment an interface was required.

**The rule.** *Prefer boundaries that force declaration.* The value of extracting
a component is not fewer lines — it is that the props must be named, and named
things can be checked.

---

## 8. Configuration is a trust boundary

**The principle.** Treat environment values as untrusted input, and make the
public/secret split impossible to get wrong by accident.

**The incidents.** `VITE_`-prefixed variables are compiled into the browser
bundle and are public; anything else is server-only. Separately, CI failed five
consecutive times because a pasted secret contained a line break — gRPC forbids
control characters in metadata, the value is masked in logs, and the failure
looked nothing like a configuration problem. And `APP_URL` defaulted to the
`MAIL_FROM` domain, which sends mail and serves no website, so every button in
every email was dead.

**The rule.** *Sanitise config at load and name the variable, never the value.*
`scripts/env.ts` trims and strips line breaks; the README marks every variable
public or secret.

---

## 9. Client for convenience, server for authority

**The principle.** The browser may decide what to *show*. It must never be the
only thing deciding what is *allowed*.

**The incident.** MFA verification once fell back to a client-side
`sessionStorage` flag when the server could not write the custom claim — an
authentication pass with nothing recorded server-side. Separately, an
organization could self-issue a verified badge, because the client wrote
`craVerified: true` purely because the applicant typed a number.

**The rule.** *Fail closed.* If the server cannot record the fact, the operation
failed. Trust signals shown to students — verification status, hours, rankings —
are never self-settable.

---

## 10. Documentation is part of the system

**The principle.** Knowledge that exists only in one person's head is a
single point of failure, exactly like a server with no backup.

**The incident.** The external review's first substantive complaint was that
there was no README, so nobody else could onboard. Two `.md` files listed
"critical" issues that had all been fixed, which made a working project read as
abandoned.

**The rule.** *If the reason for a decision is not obvious from the code, the
code is not finished.* Comments here record the specific bug a branch prevents,
so that a future tidy-up does not delete the guard and reintroduce it.

---

## Reviewing a change against these

1. Does any new authorization depend on a value the actor wrote? (§2)
2. Can any new `catch` leave the user with no feedback? (§3)
3. Does this duplicate a fact that already exists somewhere? (§5)
4. Have I seen the new test fail for the right reason? (§6)
5. Does this rule need information rules cannot reach? (§1)
6. Would a new contributor understand *why* from the code alone? (§10)

## What these principles do not claim

They describe the standard this codebase is being held to, not a standard it
fully meets yet. `docs/STATUS.md` lists where it still falls short — including
work that is deliberately deferred. Naming the gap is part of the discipline;
pretending it is closed is the failure mode these principles exist to prevent.
