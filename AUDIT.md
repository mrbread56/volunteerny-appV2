# Volunteer NY QA Audit Report

Based on a thorough review of the codebase, rules, and local test runs, here are the ranked findings.

## 1. Unvalidated `users` updates allow unbounded document bloat
**Priority:** blocks launch
**File:** [firestore.rules](file:///C:/Users/ASUS/Downloads/VNY_V14/firestore.rules#L294-L304)

**What actually goes wrong, and for whom:**
The `users` collection enforces `isValidUser(incoming())` on `create`, but the `update` block does not. It only checks a few specific fields (`role`, `uid`, `email`, `createdAt`, `twoFactorEnabled`). Because it lacks both `isValidUser` and a `hasOnly()` restriction, any authenticated user can append arbitrary unvalidated data to their own `users` document up to the 1 MiB Firestore limit. (This exactly matches previous template #8).

**How I confirmed it:**
I inspected the `firestore.rules` file and compared the `create` and `update` blocks for `/users/{uid}`.
```javascript
// Missing isValidUser(incoming()) and missing .hasOnly()
allow update: if isSignedIn() && request.auth.uid == uid && isValidId(uid) &&
                incoming().role == existing().role &&
                incoming().uid == existing().uid &&
                incoming().createdAt == existing().createdAt &&
                ...
```

**Suggested fix (simplest first):**
Add `&& isValidUser(incoming())` and a `.hasOnly([...])` clause to the `update` rule for `/users/{uid}`.

---

## 2. Failed application updates silently fall back to UI success
**Priority:** blocks launch
**File:** [src/pages/OrgDashboard.tsx](file:///C:/Users/ASUS/Downloads/VNY_V14/src/pages/OrgDashboard.tsx#L659-L679)

**What actually goes wrong, and for whom:**
When an organization clicks to Accept or Reject an applicant, the app attempts to update the application document in Firestore. If this `updateDoc` call fails (e.g., due to permission denied or being offline), the `catch (dbErr)` block executes. Instead of halting, the catch block logs the error, writes the update to `localStorage` (`demo_applications`), and execution continues down to update the React state and show `Application accepted successfully!`. The organization believes the student was accepted, but nothing was saved. (This matches template #4).

**How I confirmed it:**
Inspected the source code inside `updateApplicationStatus`. The `setSuccessMessage` call and state update happen *outside* the `try` block, and the `catch` block does not `return` or throw.
```typescript
        } catch (dbErr) {
          console.error("Could not update application status in Firestore:", dbErr);
          // Fallback: update in localStorage demo_applications
          ...
        }
        setApplications(...); // Updates UI anyway
        setSuccessMessage(`Application ${newStatus} successfully!`); // Shows success!
```

**Suggested fix:**
Remove the `demo_applications` fallback inside the `catch` block (demo logic belongs in `isDemoMode`). Instead, handle the error gracefully:
```typescript
        } catch (dbErr) {
          setErrorMessage(reportError('update application', dbErr, "Could not update the application status. Please try again."));
          return;
        }
```

---

## 3. Demo fixtures merge into real query results in production paths
**Priority:** blocks launch
**Files:** 
- [src/pages/StudentDashboard.tsx](file:///C:/Users/ASUS/Downloads/VNY_V14/src/pages/StudentDashboard.tsx#L863-L870)
- [src/pages/StudentDashboard.tsx](file:///C:/Users/ASUS/Downloads/VNY_V14/src/pages/StudentDashboard.tsx#L911-L914)
- [src/pages/OrgDashboard.tsx](file:///C:/Users/ASUS/Downloads/VNY_V14/src/pages/OrgDashboard.tsx#L462-L466)

**What actually goes wrong, and for whom:**
In multiple places, queries against real Firestore data are merged with or fallback to `localStorage` mock data outside of the `isDemoMode` guard. For example, a real student's `savedIds` are actively merged with `demo_saved_ids`. If a query for recommended opportunities fails, the catch block silently replaces the results with `demo_opportunities`. A real user will see fake data (like "Alan Turing" as a coordinator or fake opportunities) merged into their live dashboard. (This matches template #9).

**How I confirmed it:**
I checked the execution flow in `fetchData` in `StudentDashboard.tsx`. The early return for `if (isDemoMode)` correctly bypasses the real queries, but further down in the real query path:
```typescript
        // Merge with local storage IDs (This runs for REAL users!)
        const localSaves = JSON.parse(localStorage.getItem("demo_saved_ids") || "[]");
        savedIds = Array.from(new Set([...savedIds, ...localSaves])).slice(0, 10);
```

**Suggested fix:**
Delete all `localStorage.getItem("demo_*")` reads that reside outside the `if (isDemoMode)` branch. For real queries that fail, use `setErrorMessage` rather than substituting fake data.

---

## 4. Hardcoded "Loading..." null fallback can show forever
**Priority:** fix soon
**File:** [src/routes/guards.tsx](file:///C:/Users/ASUS/Downloads/VNY_V14/src/routes/guards.tsx#L91)

**What actually goes wrong, and for whom:**
The route guards (`RequireAuth`, `RequireStudent`, `RequireOrg`, `RequireDeveloper`) return `<div className="flex items-center justify-center h-screen">Loading...</div>;` when `loading` is true. If `useAuth()` gets stuck in a loading state due to a hanging network request or an unhandled initialization error, the user is presented with a white screen that says "Loading..." indefinitely, with no error state or retry mechanism. (This matches template #3).

**How I confirmed it:**
Used `Select-String` to locate all instances of `Loading...` in the codebase and verified they are returned unconditionally while `loading` is true.

**Suggested fix:**
In `AuthContext`, implement a timeout that sets an error state and switches `loading` to `false` if initialization takes too long (e.g., > 10 seconds). Update the guards to display an error message with a "Retry" or "Reload Page" button if this state is reached.

---

## What was checked and found working
- **Code Execution & Dependencies**: `npm run build` succeeds.
- **Node Integration Tests**: `check:signup`, `check:security`, `check:flows`, and `check:storage` scripts all execute and pass. The permissions rules successfully enforce read/write access constraints during these flows.
- **E2E Tests**: `npm test` runs the Playwright suite correctly (24 passing tests). Click-traps and console errors are comprehensively swept and no issues were found there.
- **reportError imports**: Previous issues involving `reportError` resolving to `window.reportError` appear to be fixed. It is properly imported in `DeveloperDashboard.tsx`, `OrgDashboard.tsx`, and others.

## What couldn't be checked and why
- **Infrastructure Exists**: I cannot directly verify the Vercel production environment variables, Firebase project bucket creation, or Firestore indexes through the CLI since I do not have authenticated access to your Firebase/Vercel dashboards. You should manually verify that the Storage Bucket exists in the Firebase Console and that the correct `VITE_FIREBASE_DATABASE_ID` is set in Vercel.
- **Deployed Rules Match**: `package.json` relies on a REST script (`deploy:rules`) to push rules. I cannot definitively prove that the live database rules match the local `firestore.rules` file without fetching them via the REST API or Firebase CLI. You should run `npm run deploy:rules` to ensure parity.
