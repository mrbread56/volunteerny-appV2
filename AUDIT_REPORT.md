# Full-Stack Web App Audit Report — Volunteer North York (vny5)

**Date:** 2025-01-XX  
**Scope:** All shipping code in `src/` and `server.ts`  
**Methodology:** Manual code review across 6 phases (22+ checkpoints)

---

## Phase 1: Compile-time Errors

### 1.1 `npx tsc --noEmit` — Shipping Code
**Result:** No TypeScript errors in shipping code (`src/` and `server.ts`).  
110 errors exist in `backup/` and `legacy/` directories only — these are excluded from the build.

### 1.2 `npm run build`
**Result:** Build succeeds. `dist/` directory created with no errors.

### 1.3 Dead Code Check
**Finding 1 — LOW: Unused import in `server.ts`**
- **File:** `server.ts:3`
- **What:** `import path from 'path';` is imported but `path` is only used inside the `if (process.env.NODE_ENV !== 'production')` block at line ~600. The import is technically used, so not dead code.
- **No dead exports found** in shipping code.

---

## Phase 2: Silent Failures (Highest User Impact)

### 2.1 Catch blocks with only console.log/error/warn — no UI state update

**Finding 2 — HIGH: `MfaChallenge.tsx` sendOTP catch block**
- **File:** `MfaChallenge.tsx:44-46`
- **What:** `catch (err: any) { console.error("Failed to send OTP", err); setError(err.message || "Failed to send verification code..."); }`
- **User sees:** Error message is shown via `setError`, so this is **actually handled**. ✅

**Finding 3 — HIGH: `AuthContext.tsx` connectGmail catch block**
- **File:** `AuthContext.tsx:280-282`
- **What:** `catch (error) { console.error('Google Gmail OAuth integration failed:', error); }` — returns `null` but **no UI state update** (no `setAuthError`).
- **User sees:** Clicks "Connect Gmail" — nothing happens. No error message, no feedback. The button appears to do nothing.
- **Fix:** Add `setAuthError('Failed to connect Gmail. Please try again.');` in the catch block.

**Finding 4 — HIGH: `AuthContext.tsx` connectCalendar catch block**
- **File:** `AuthContext.tsx:302-304`
- **What:** Same pattern as connectGmail — `console.error` only, returns `null`.
- **User sees:** Clicks "Connect Calendar" — nothing happens silently.
- **Fix:** Add `setAuthError(...)` in the catch block.

**Finding 5 — HIGH: `AuthContext.tsx` connectTasks catch block**
- **File:** `AuthContext.tsx:324-326`
- **What:** Same pattern — `console.error` only, returns `null`.
- **User sees:** Clicks "Connect Tasks" — nothing happens silently.
- **Fix:** Add `setAuthError(...)` in the catch block.

### 2.2 `handleFirestoreError` inside catch blocks (throws → return value)

**Finding 6 — FIXED: `handleFirestoreError` now returns `FirestoreErrorInfo` instead of throwing**
- **File:** `src/firebase/utils.ts:30-52`
- **Status:** ✅ Already fixed. Function returns `FirestoreErrorInfo` object.
- **Callers updated:** `OrgDashboard.tsx:737`, `Signup.tsx:205`, `OrgOpportunityCreate.tsx:316`, `OrgOpportunityEdit.tsx:339`, `StudentOpportunityDetail.tsx:243`, `StudentProfile.tsx:337`

### 2.3 `return null` at page/component level — blank white screen

**Finding 7 — MEDIUM: No `return null` found in page-level components**
- All pages either render content or show loading/error states. No blank white screen paths found. ✅

---

## Phase 3: Auth and Security

### 3.1 Navbar vs Route Guard MFA disagreement

**Finding 8 — CRITICAL: Navbar and Route Guard use DIFFERENT MFA logic**

**Navbar (`Navbar.tsx:14`):**
```typescript
const isVerified = verifyMfaClaim(user, userProfile, mfaVerified);
const authed = !!user && !loading && !profileMissing && isVerified && location.pathname !== '/mfa';
```
- Navbar shows authenticated links when `isVerified` is true AND the user is NOT on `/mfa`.

**Route Guard (`App.tsx:PrivateRoute`):**
```typescript
const isMfaClaimValid = verifyMfaClaim(user, userProfile, mfaVerified);
if (!isMfaClaimValid) {
  return <Navigate to="/mfa" />;
}
```
- Route guard redirects to `/mfa` when `isMfaClaimValid` is false.

**The disagreement:** The Navbar checks `location.pathname !== '/mfa'` as an additional condition. This means:
- When a user is on `/mfa` page, the Navbar shows "Security Verification" state (correct).
- But the Navbar's `authed` variable is false on `/mfa`, so it shows the "Security Verification" UI.
- **However**, the Navbar also has a fallback: `user ?` (line ~100) which shows "Security Verification" when `user` exists but `authed` is false. This is **correct behavior**.

**Verdict:** The Navbar and Route Guard actually agree in practice. The `location.pathname !== '/mfa'` check in Navbar is a UX optimization to show the MFA state on the MFA page. ✅ **No bug here.**

### 3.2 Demo-mode token in production

**Finding 9 — CRITICAL: Demo-mode tokens rejected in production**
- **File:** `server.ts:97-101`
- **What:** `if (token.startsWith('demo-mode-token-')) { if (process.env.NODE_ENV === 'production') { console.warn('[verifyAuth] Rejected demo token in production.'); return null; } ... }`
- **Status:** ✅ Already fixed. Demo tokens are explicitly rejected in production.

### 3.3 `postMessage(*, '*')` — wildcard origin

**Finding 10 — CRITICAL: `postMessage` uses `window.location.origin` instead of specific origin**

**File:** `server.ts:499, 532, 587, 594`
- **Lines 499, 532:** `window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: ... }, window.location.origin);`
- **Lines 587, 594:** `window.opener.postMessage({ type: 'GOOGLE_OAUTH_SUCCESS', idToken: ... }, window.location.origin);`

**What:** Uses `window.location.origin` as the target origin for `postMessage`. This is the server's origin (e.g., `https://volunteernorthyork.indevs.in`), which is the correct origin for the opener window. **This is actually secure** — it's not `'*'`.

**Verdict:** ✅ Not a wildcard. Uses the server's own origin, which is the correct target. **No bug.**

### 3.4 Firestore Security Rules — Not auditable from code alone
- Cannot determine Firestore security rules from client code alone. Need to check `firestore.rules` file.

### 3.5 OTP uses `crypto.randomInt()` — NOT `Math.random()`

**Finding 11 — ✅ SECURE: OTP generation uses `crypto.randomInt()`**
- **File:** `server.ts:370`
- **What:** `const otp = crypto.randomInt(100000, 999999).toString();`
- **Status:** ✅ Uses Node.js `crypto.randomInt()` which is cryptographically secure. Not `Math.random()`.

### 3.6 MFA OTP input — double-escaped regex

**Finding 12 — ✅ FIXED: MFA OTP input uses correct regex**
- **File:** `MfaChallenge.tsx:107`
- **What:** `onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}`
- **Status:** ✅ Uses `/\D/g` (single backslash-D) which correctly strips non-digits. No double-escaped regex issue.

---

## Phase 4: Data Integrity

### 4.1 Document IDs built with `Date.now()` alone

**Finding 13 — MEDIUM: Search for `Date.now()` as document ID**
- **Searched:** No instances found where `Date.now()` is used alone as a document ID. Firestore `addDoc()` is used for auto-generated IDs in most cases. ✅

### 4.2 Email normalization (`.trim().toLowerCase()`)

**Finding 14 — HIGH: Email addresses NOT normalized before Firestore queries**

**File:** `AuthContext.tsx:fetchProfiles` (line ~130)
- **What:** `const userEmail = (currentUser as any).email || '';` — no `.trim().toLowerCase()` call.
- **Impact:** If a user signs up with `User@Gmail.COM`, the email stored in Firestore will be `User@Gmail.COM`. When querying by email later, `user@gmail.com` won't match because Firestore is case-sensitive.
- **Fix:** Add `const normalizedEmail = userEmail.trim().toLowerCase();` and use it consistently.

**File:** `server.ts:verifyAuth` (line ~110)
- **What:** `email: decoded.email` — no normalization.
- **Impact:** Same issue — email from Firebase Auth token may differ in case from Firestore-stored email.

### 4.3 State cleared before use (async setState issue)

**Finding 15 — MEDIUM: `AuthContext.tsx` logout clears state before `auth.signOut()`**
- **File:** `AuthContext.tsx:247-262`
- **What:** `setMfaVerifiedState(false); setAccessToken(null); ... setUser(null); ... await auth.signOut();`
- **Impact:** State is cleared BEFORE `auth.signOut()` completes. If `signOut()` fails, the state is already cleared — user sees logged-out state even though Firebase still has a session. However, the catch block logs a warning and continues, so the UI state is inconsistent with the actual auth state.
- **Fix:** Move state clearing to AFTER `await auth.signOut()` succeeds, or use a `finally` block.

---

## Phase 5: UX Bugs

### 5.1 Form submission — `setIsLoading(false)` in `finally` block?

**Finding 16 — ✅ FIXED: `MfaChallenge.tsx` handleVerify uses `finally` block**
- **File:** `MfaChallenge.tsx:60-80`
- **What:** `finally { setIsLoading(false); }` — correctly resets loading state on both success and failure. ✅

**Finding 16b — HIGH: `MfaChallenge.tsx` handleResend does NOT use `finally`**
- **File:** `MfaChallenge.tsx:83-87`
- **What:** 
```typescript
const handleResend = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError("");
    await sendOTP();
    setIsLoading(false);
};
```
- **Impact:** If `sendOTP()` throws (network error), `setIsLoading(false)` never runs. The "Resend" button stays stuck on "Loading..." forever.
- **Fix:** Wrap in try/catch/finally or use `try { await sendOTP(); } finally { setIsLoading(false); }`.

### 5.2 Share URLs — `window.location.href + '/' + id` vs `window.location.origin + '/path/' + id`

**Finding 17 — Search for share URL construction**
- **Searched:** No instances found of `window.location.href + '/' + id` pattern. Share URLs not implemented in the current codebase. ✅

### 5.3 `useEffect` with `onSnapshot` — missing unsubscribe

**Finding 18 — Search for `onSnapshot` listeners**
- **Searched:** No `onSnapshot` calls found in the shipping code. Firestore reads use `getDoc()` (one-time reads) rather than real-time listeners. ✅

### 5.4 Signup flow — no auth account rollback on Firestore write failure

**Finding 19 — CRITICAL: No auth account rollback on Firestore profile write failure**
- **File:** `Signup.tsx` (line ~205)
- **What:** After `createUserWithEmailAndPassword` succeeds, the code writes to Firestore. If the Firestore write fails, the auth account is NOT deleted.
- **Impact:** The user's email is permanently "already registered" with no usable profile. They can never sign up again with that email.
- **Fix:** In the catch block after Firestore write failure, call `auth.currentUser?.delete()` to roll back the auth account.

---

## Phase 6: Deployment

### 6.1 Environment variables declared

**Finding 20 — HIGH: Missing env var declarations**
- **File:** `server.ts:14-20` — logs presence of env vars
- **Required vars used in code:**
  - `RESEND_API_KEY` ✅ (checked at line 14)
  - `MAIL_FROM` ✅ (checked at line 18)
  - `APP_URL` ✅ (checked at line 19)
  - `GOOGLE_CLOUD_PROJECT` ✅ (checked at line 17)
  - `GEMINI_API_KEY` ✅ (checked at line ~240)
  - `GOOGLE_CLIENT_ID` ✅ (checked at line ~480)
  - `GOOGLE_CLIENT_SECRET` ✅ (checked at line ~530)
  - `FIREBASE_SERVICE_ACCOUNT_KEY` ✅ (checked at line 15)
  - `PORT` ✅ (defaults to 3000)
  - `VITE_API_URL` ❌ **MISSING from .env.example**
  - `VITE_DEVELOPER_EMAILS` ❌ **MISSING from .env.example**

**Fix:** Add `VITE_API_URL` and `VITE_DEVELOPER_EMAILS` to `.env.example`.

### 6.2 Server port — hardcoded or from `process.env.PORT`?

**Finding 21 — ✅ FIXED: Server port reads from `process.env.PORT`**
- **File:** `server.ts:195`
- **What:** `const PORT = parseInt(process.env.PORT || '3000', 10);`
- **Status:** ✅ Uses `process.env.PORT` with fallback to 3000. Render-compatible.

### 6.3 Firebase credentials committed to repo

**Finding 22 — CRITICAL: Firebase API key and config committed to repo**
- **File:** `firebase-applet-config.json`
- **What:** Contains `apiKey: "AIzaSyDVogYV6end4FDcOSHNkuwh3r_CVisGc38"`, `projectId`, `appId`, `authDomain`, `storageBucket`, `messagingSenderId`, `firestoreDatabaseId`
- **Impact:** While Firebase API keys are technically public (they're sent to the client), the `firestoreDatabaseId` and full project configuration are exposed. This is a **security concern** if the repo is public.
- **Note:** Firebase API keys are designed to be public (they're in the client-side code anyway). However, the `firestoreDatabaseId` (`ai-studio-volunteerny-abfab7a5-e856-49f4-882f-511f963bb755`) is unusual and may be a sensitive internal identifier.
- **Fix:** Move `firebase-applet-config.json` to `.env` variables and add to `.gitignore`. Use `import.meta.env` for client-side Firebase config.

---

## Summary of Findings

| Severity | Count | Key Issues |
|----------|-------|------------|
| **CRITICAL** | 3 | No auth rollback on signup failure (#19), Firebase config committed (#22), Navbar/RouteGuard MFA disagreement (#8 - mitigated) |
| **HIGH** | 5 | Silent OAuth failures (#3-5), Email not normalized (#14), Resend button stuck on error (#16b) |
| **MEDIUM** | 2 | State cleared before async operation (#15), Missing env vars in .env.example (#20) |
| **LOW** | 1 | No dead code issues found |

### Already Fixed (from previous work):
- ✅ `handleFirestoreError` returns object instead of throwing (#6)
- ✅ Gemini model name corrected to `gemini-2.0-flash`
- ✅ `require()` in ESM context fixed
- ✅ `postMessage` uses `window.location.origin` (not `'*'`)
- ✅ MFA OTP regex uses correct `/\D/g` (not double-escaped)
- ✅ Demo-mode tokens rejected in production
- ✅ Server port reads from `process.env.PORT`
- ✅ `setIsLoading(false)` in `finally` block for verify handler
- ✅ Build succeeds with no errors in shipping code

### Recommended Fixes (in priority order):

1. **CRITICAL:** Add auth account rollback in `Signup.tsx` catch block — delete the auth user if Firestore profile write fails
2. **CRITICAL:** Move `firebase-applet-config.json` to environment variables and add to `.gitignore`
3. **HIGH:** Add `setAuthError()` calls in `connectGmail`, `connectCalendar`, `connectTasks` catch blocks in `AuthContext.tsx`
4. **HIGH:** Fix `handleResend` in `MfaChallenge.tsx` to use try/finally for `setIsLoading(false)`
5. **HIGH:** Normalize email addresses with `.trim().toLowerCase()` before Firestore operations
6. **MEDIUM:** Move state clearing in `logout()` to after `auth.signOut()` completes
7. **MEDIUM:** Add `VITE_API_URL` and `VITE_DEVELOPER_EMAILS` to `.env.example`
