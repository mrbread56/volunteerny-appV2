# Audit Fix Implementation TODO

## Priority Order

### ✅ Already Fixed (verified in code)
- [x] #6: `handleFirestoreError` returns object instead of throwing
- [x] #19: Auth account rollback on Firestore write failure (Signup.tsx:205-218)
- [x] #9: Demo-mode tokens rejected in production (server.ts:97-101)
- [x] #10: `postMessage` uses `window.location.origin` (not wildcard)
- [x] #11: OTP uses `crypto.randomInt()` (not `Math.random()`)
- [x] #12: MFA OTP regex uses correct `/\D/g` (not double-escaped)
- [x] #8: Navbar/RouteGuard MFA logic aligned
- [x] #21: Server port reads from `process.env.PORT`

### 🔴 CRITICAL
- [x] #22: Firebase config moved to env vars (`VITE_FIREBASE_*`), `firebase-applet-config.json` added to `.gitignore`

### 🔴 HIGH
- [x] #3: Add `setAuthError()` in `connectGmail` catch block (AuthContext.tsx)
- [x] #4: Add `setAuthError()` in `connectCalendar` catch block (AuthContext.tsx)
- [x] #5: Add `setAuthError()` in `connectTasks` catch block (AuthContext.tsx)
- [x] #16b: Fix `handleResend` in MfaChallenge.tsx — use try/finally for `setIsLoading(false)`
- [x] #14: Normalize emails with `.trim().toLowerCase()` before Firestore operations (Signup.tsx)

### 🟡 MEDIUM
- [x] #15: Move state clearing in `logout()` to after `auth.signOut()` completes (AuthContext.tsx)
- [x] #20: Added `VITE_API_URL` and `VITE_DEVELOPER_EMAILS=kiamehrmetanat@gmail.com` to `.env.example`
