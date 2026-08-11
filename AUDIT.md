# Volunteer NY QA Audit Report - DEEP DIVE

This report builds upon the initial findings with an even deeper dive into the codebase, uncovering additional vulnerabilities and silent failure points.

## 1. Unvalidated `users` updates allow unbounded document bloat
**Priority:** blocks launch
**File:** `firestore.rules` (lines ~294-304)

The `users` collection enforces `isValidUser(incoming())` on `create`, but the `update` block does not. Because it lacks both `isValidUser` and a `hasOnly()` restriction, any authenticated user can append arbitrary unvalidated data to their own `users` document up to the 1 MiB Firestore limit. (This matches previous template #8).

**Fix:** Add `&& isValidUser(incoming())` and a `.hasOnly([...])` clause to the `update` rule for `/users/{uid}`.

---

## 2. Failed application updates silently fall back to UI success
**Priority:** blocks launch
**File:** `src/pages/OrgDashboard.tsx` (lines 659-679)

When an organization accepts or rejects an applicant, a failed `updateDoc` call executes the `catch (dbErr)` block. Instead of halting, the catch block logs the error, writes the update to `localStorage`, and execution continues to update the React state and show `Application accepted successfully!`. (Matches template #4).

**Fix:** Remove the `demo_applications` fallback inside the `catch` block. Call `setErrorMessage` and `return` early.

---

## 3. Demo fixtures merge into real query results in production paths
**Priority:** blocks launch
**Files:** 
- `src/pages/StudentDashboard.tsx` (lines 863-870, 911-914)
- `src/pages/OrgDashboard.tsx` (lines 462-466)

Queries against real Firestore data are merged with or fallback to `localStorage` mock data outside of the `isDemoMode` guard. A real user will see fake data (like "Alan Turing" as a coordinator or fake opportunities) merged into their live dashboard. (Matches template #9).

**Fix:** Move all `localStorage.getItem("demo_*")` reads inside the `if (isDemoMode)` branch. Use `setErrorMessage` for real query failures.

---

## 4. NEW: Unbounded Application Update Vulnerability (rejectionReason / rejectionNote)
**Priority:** blocks launch
**File:** `firestore.rules` (lines 156-171, 437)

The `isValidApplication()` function does NOT check the `rejectionReason` or `rejectionNote` fields. However, the `update` block for the `applications` collection allows an organization to modify these fields via `.hasOnly(['status', 'rejectionReason', 'rejectionNote'])`. 

Because there are no size limits or type validations in `isValidApplication()` for these fields, a malicious organization can bypass standard restrictions and inject up to 1 MiB of arbitrary data blobs (arrays, maps, massive strings) into a student's application document via these fields.

**Fix:** Update `isValidApplication(data)` in `firestore.rules` to strictly enforce type and size limits for `rejectionReason` and `rejectionNote` (e.g., `(absent(data, 'rejectionReason') || (data.rejectionReason is string && data.rejectionReason.size() <= 1000))`).

---

## 5. NEW: Developer Dashboard Silently Drops Feedback Replies
**Priority:** blocks launch
**File:** `src/pages/DeveloperDashboard.tsx` (lines 567-573)

When a developer submits a reply to a user feedback ticket, the application attempts to update the feedback document in Firestore. The inner `catch (dbErr)` block warns in the console: `'Real Firestore reply write failed, updated local fallback storage:'` but does **not** throw an error or set any error state. 

Execution unconditionally falls through to clear the reply input and reload the data, leaving the developer completely unaware that their reply failed to send/save in production.

**Fix:** Remove the silent catch block. If the database update fails, it should throw an error to be caught by the outer block so it can display an actionable error message to the developer.

---

## 6. Hardcoded "Loading..." null fallback can show forever
**Priority:** fix soon
**File:** `src/routes/guards.tsx` (line 91)

The route guards return `<div className="...">Loading...</div>;` when `loading` is true. If `useAuth()` gets stuck in a loading state due to an unhandled initialization error, the user is presented with a white screen indefinitely. (Matches template #3).

**Fix:** Implement a timeout in `AuthContext` to set an error state if initialization takes longer than ~10 seconds.

---

## 7. Leaderboard Fabricated Data (Partially Resolved, Partially Remnants)
**File:** `src/pages/StudentDashboard.tsx` (lines 497-529)

While the leaderboard tab itself seems to rely on `scalableLeaderboard` and correctly shows an error if it fails to load, `demoPeers` is still explicitly set into state `setLeaderboard(demoPeers)` if `isDemoMode` is true. This is acceptable since it's guarded by `isDemoMode`. However, developers must remain vigilant that this logic does not leak into production paths (as the previous demo data did).
