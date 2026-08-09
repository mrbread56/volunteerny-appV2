# Volunteer North York

A web platform connecting Ontario high-school students with volunteer
opportunities at community organizations, and tracking the community-involvement
hours students need in order to graduate.

**The problem.** Ontario high school students must complete 40 hours of
community involvement to graduate. Doing the hours is achievable; *finding*
opportunities that match your interests, availability and location is the hard
part. In a survey of 20 Toronto students, 15 (75%) said finding a place to
volunteer was one of the biggest challenges of volunteering.

**Who it is for.** High school students across Toronto, and the nonprofit
organizations that need volunteers. Started in North York, not limited to it.

**Who builds it.** One person — the founder, a high school student, is the sole
developer. There is no fixed deadline; the project is being stabilised before
new features are added.

Full background, the survey, and reviews from three university professors:
[`docs/PROJECT.md`](docs/PROJECT.md).

---

## Documentation

| File | What it holds |
|---|---|
| [`docs/PROJECT.md`](docs/PROJECT.md) | Why the project exists: the problem, the student survey, academic reviews |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the system works: data model, authorization design, why each server route exists |
| [`docs/STATUS.md`](docs/STATUS.md) | Every known bug and gap, with evidence. Start here before changing anything |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | v1.0 blockers, then v1.1 / v2.0 / v3.0 |
| [`docs/REVIEW-RESPONSE.md`](docs/REVIEW-RESPONSE.md) | Point-by-point response to the external technical review |
| [`docs/security_spec.md`](docs/security_spec.md) | Security notes |

---

## Contents

- [Stack](#stack)
- [Running it locally](#running-it-locally)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [How the app is organised](#how-the-app-is-organised)
- [Deploying](#deploying)
- [Before you ship a change](#before-you-ship-a-change)
- [Known gaps](#known-gaps)

---

## Stack

| Layer | Choice |
|---|---|
| UI | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Routing | React Router 7 |
| Database & auth | Firebase (Firestore + Firebase Auth), named database |
| Server | Express, run by `tsx` in development, bundled by esbuild for production |
| Email | Resend |
| AI triage | Google Gemini (`@google/genai`) — optional |
| Maps | Leaflet + OpenStreetMap Nominatim |
| Tests | Playwright, plus Node check scripts in `scripts/` |
| Hosting | Vercel (`api/index.ts` wraps the Express app as a serverless function) |

There is **one** Express app (`server.ts`). In development it serves the Vite
dev middleware; in production it serves the built SPA from `dist/` and the
`/api/*` routes. `api/index.ts` is the Vercel entry point and does nothing but
re-export it.

---

## Running it locally

**Prerequisites:** Node 20+, and access to the Firebase project.

```bash
npm install
```

Copy the example environment file and fill it in — the app will not start
without Firebase credentials:

```bash
cp .env.example .env
```

Then:

```bash
npm run dev
```

This serves the app and the API together on <http://localhost:3000>. There is no
separate frontend/backend process.

Confirm the Firebase credentials actually work before debugging anything else:

```bash
npm run check:firebase
```

---

## Environment variables

`VITE_`-prefixed variables are **compiled into the browser bundle and are
public**. Everything else is server-only and must never gain a `VITE_` prefix.

### Client (public — safe to expose)

| Variable | Purpose |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase web config |
| `VITE_FIREBASE_PROJECT_ID` | Firebase web config |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase web config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase web config |
| `VITE_FIREBASE_APP_ID` | Firebase web config |
| `VITE_FIREBASE_DATABASE_ID` | **Required.** This project uses a *named* Firestore database, not `(default)`. Omitting it produces `5 NOT_FOUND` on every query. |
| `VITE_API_URL` | Base URL for API calls. Empty means same-origin. |
| `VITE_DEVELOPER_EMAILS` | Comma-separated allowlist for the developer console. |

### Server (secret — never expose)

| Variable | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Admin SDK credentials, as a JSON string. Needed for privileged reads/writes: hours approval, leaderboard aggregation, capacity counts, MFA claims. |
| `FIREBASE_DATABASE_ID` | Same named database, for the Admin SDK. |
| `RESEND_API_KEY` | Transactional email. Without it the API answers 503 and no mail is sent. |
| `MAIL_FROM` | Sender, e.g. `Volunteer North York <vny@yourdomain>`. Must be a domain verified in Resend. |
| `APP_URL` | **The origin the app is served from.** Used for links inside emails and the production CORS origin. This is *not* the `MAIL_FROM` domain — see [`server/appUrl.ts`](server/appUrl.ts). |
| `GEMINI_API_KEY` | Optional. Powers AI triage of feedback and safety reports; the app degrades gracefully without it. |
| `GOOGLE_CLOUD_PROJECT` | Optional, for Gemini. |

`.env` is gitignored. Never commit it. Credentials belong in the Vercel
dashboard for deployed environments.

---

## Scripts

### Everyday

| Command | What it does |
|---|---|
| `npm run dev` | App + API on port 3000 |
| `npm run build` | Builds the SPA and bundles the server |
| `npm start` | Runs the production bundle |
| `npm run lint` | TypeScript check, **plus** the ESM guard below |

### Checks

These run against the **real** Firebase project, create throwaway accounts, and
clean up after themselves.

| Command | What it proves |
|---|---|
| `check:firebase` | Credentials and the named database resolve |
| `check:signup` | Student and organization signup write both documents and sign-in works |
| `check:flows` | The full journey: apply → accept → hours → approve → leaderboard → rate |
| `check:security` | **Adversarial.** Cross-tenant reads/writes, privilege escalation and API authorization are all refused |
| `check:queries` | Every query the app runs has the index it needs |
| `check:certificate` | The printable hours transcript is well-formed and escapes student-controlled text |
| `check:hours` | The hour-summing helper is correct, including non-numeric input |
| `check:email` | Resend key and sender are valid, and every link in every email template points at a real route on the real origin |
| `check:esm` | Server imports resolve under real ESM. **Do not remove from `lint`** — `moduleResolution: "bundler"` hides missing `.js` extensions that crash the whole API in production. |
| `sweep:console` | Visits every route as every role and reports any console error |
| `test` | Playwright end-to-end |
| `test:rules` | Firestore rules unit tests (needs the Firebase emulator and Java) |

### Operational

| Command | What it does |
|---|---|
| `deploy:rules` | Deploys `firestore.rules` |
| `backup` | Full database snapshot to `backups/*.json`. Free — no Blaze plan needed. Contains student personal data, so `backups/` is gitignored |
| `backfill:hours` | One-off: recomputes `students/{uid}.hours` from `loggedHours` |

---

## How the app is organised

```
src/
  pages/          One file per route
  components/     Shared UI; ui/ holds the primitives
  contexts/       AuthContext — session, profile, role, MFA state
  lib/            Firebase config and service helpers
  hooks/          Reusable behaviour
  utils/          Pure functions
server.ts         Express app: all /api routes
server/           Server-only modules (email templates, app origin)
api/index.ts      Vercel entry point
scripts/          The check scripts above
firestore.rules   Authorization — read this before changing any data access
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the data model, the role and
permission design, and why certain operations live on the server.

### Roles

`student`, `organization`, `developer`. The role lives on `users/{uid}.role`
and is set at signup. Students and organizations cannot change their own role;
`firestore.rules` enforces this. The developer console is additionally gated by
the `VITE_DEVELOPER_EMAILS` allowlist.

### Two-factor

Required for organizations, optional for students. Verification is a **signed
custom claim** set by the server after an emailed one-time code — never a
client-side flag.

---

## Deploying

Pushing to `main` deploys to Vercel.

Firestore rules and indexes deploy separately and are **not** part of the app
deploy:

```bash
npx firebase-tools deploy --only firestore:rules --project <project-id>
npx firebase-tools deploy --only firestore:indexes --project <project-id>
```

Rules and application code have to move together. Deploying tighter rules
before the matching code — or the reverse — breaks writes in production.

---

## Before you ship a change

```bash
npm run lint
npm run build
```

If you touched data access, security rules, or anything a student or
organization relies on:

```bash
npm run check:security
npm run check:flows
```

Read [`AGENTS.md`](AGENTS.md) if present, and prefer adding a check script over
manual verification — every check in `scripts/` exists because something broke
silently once.

---

## Known gaps

Honest list; see [`docs/STATUS.md`](docs/STATUS.md) for the full audit.

- **Large page components.** `StudentDashboard.tsx` is ~2,400 lines,
  `DeveloperDashboard.tsx` ~1,800, `OrgDashboard.tsx` ~1,550. Routing and route
  guards are not separated from `App.tsx`.
- **No automated CI.** The check scripts are run by hand.
- **`chats` and `messages`** have security rules but no user interface.
- **`CalendarView.tsx`** is complete but not rendered anywhere.
- **Uploads are base64 inside Firestore documents**, not Cloud Storage, and are
  bounded by the 1 MiB document limit.
- **Rules tests** (`test:rules`) need Java and the Firebase emulator, which are
  not installed in the current environment.
