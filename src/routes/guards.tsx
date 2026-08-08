/**
 * Every route-level authorization decision in the application.
 *
 * These used to sit inline in App.tsx between the error boundary, the layout
 * wrappers and the route table. An external technical review asked for routing
 * and guards to be separated, and this file is why: answering "who can reach
 * what, and when" should mean reading one module, not scanning a 409-line
 * component for guards hidden between JSX.
 *
 * Moved verbatim. No logic changed in the extraction — the comments below each
 * record a specific bug the code exists to prevent, so do not simplify them.
 *
 * Evaluation order for a protected route:
 *   GlobalAuthGuard    — settles MFA before anything authenticated paints
 *   PrivateRoute       — session, profile, suspension, then role
 *   MfaClaimMiddleware — final claim check before children render
 */
import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { verifyMfaClaim } from '../lib/mfa';
import { isDeveloperUser } from '../lib/devAccess';
import { Spinner } from '../components/ui/Spinner';


export const LoadingFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
    <Spinner size="lg" className="text-ink" />
  </div>
);


// Shown when a user is authenticated but has no profile document — their signup
// died between the auth account being created and the profile being written.
//
// This used to be a dead end reading "contact support so we can clear the
// incomplete account". That was wrong on two counts. The app can repair this
// itself: /signup completes the profile for a session that already exists, and
// Login.tsx has always redirected these users straight there. So the guard was
// telling people to email a human about something one click could fix, while
// the login page quietly fixed it — the same state, two different answers.
//
// A backup taken on 8 Aug 2026 found NINE accounts in this state, including a
// @tdsb.ca school-board student. Every one of them had been told to write an
// email.
const AccountSetupIncomplete: React.FC = () => {
  const { logout } = useAuth();
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-line p-8 text-center space-y-5">
        <h2 className="text-2xl font-semibold text-ink tracking-[-0.02em]">
          Let's finish setting up your account
        </h2>
        <p className="text-[14px] text-ink-soft leading-relaxed">
          You're signed in, but your profile was never finished — usually because an
          earlier sign-up was interrupted. You can complete it now; you won't need to
          create a new account or use a different email address.
        </p>
        <Link
          to="/signup"
          className="block w-full h-11 leading-[2.75rem] bg-blue-dark text-paper text-[14px] font-medium hover:bg-ink transition-colors"
        >
          Finish setting up my account
        </Link>
        <button
          type="button"
          onClick={() => { void logout(); }}
          className="w-full h-11 border border-line text-ink text-[14px] font-medium hover:bg-paper-2 transition-colors"
        >
          Sign out
        </button>
        <p className="text-[12px] text-ink-muted leading-relaxed pt-1">
          Still stuck?{' '}
          <a
            href="mailto:privacy@volunteernorthyork.indevs.in"
            className="text-blue-dark hover:underline"
          >
            privacy@volunteernorthyork.indevs.in
          </a>
        </p>
      </div>
    </div>
  );
};

// Dedicated middleware component to verify the MFA claim before rendering any child components
const MfaClaimMiddleware: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, userProfile, mfaVerified, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  // Developer status must NOT bypass MFA. It used to (`isDev || verify...`),
  // which meant an allowlisted address reached /developer/dashboard without
  // ever entering a code — the highest-privilege account had the weakest gate.
  // AuthContext already forces twoFactorEnabled = true for these accounts.
  const isVerified = verifyMfaClaim(user, userProfile, mfaVerified);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isVerified) {
    return <Navigate to="/mfa" replace />;
  }

  return <>{children}</>;
};

// Route Guard for Authenticated Users
export const PrivateRoute = ({ children, role }: { children: React.ReactNode, role?: 'student' | 'organization' | 'developer' }) => {
  const { user, userProfile, loading, mfaVerified, profileMissing, authError } = useAuth();
  const location = useLocation();

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (authError) return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md bg-white border border-red-200 p-8 rounded-sm text-center space-y-6 shadow-sm">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Connection Error</h2>
        <p className="text-slate-600 text-[15px] leading-relaxed">
          {authError}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="w-full h-11 bg-slate-900 text-white rounded-sm font-semibold hover:bg-slate-800 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );

  if (!user) return <Navigate to="/login" />;

  // Authenticated, but the account has no profile document. Without this the
  // user bounces to /mfa forever with no way out. Tell them what happened.
  if (profileMissing) return <AccountSetupIncomplete />;

  // Authenticated and the profile is neither loaded nor explicitly missing.
  // This is a transient state (the Firestore read is still in flight, or it
  // failed without setting authError). Previously we fell straight through to
  // the role comparison below, where `userProfile?.role` was `undefined`,
  // never matched the required role, and redirected to /org/dashboard — which
  // required 'organization', mismatched again, and redirected to itself
  // forever. That self-redirect loop is what rendered as a blank screen.
  if (!userProfile) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  // Perform strict checking using the dedicated verifyMfaClaim middleware function.
  // No developer short-circuit here — see MfaClaimMiddleware.
  const isMfaClaimValid = verifyMfaClaim(user, userProfile, mfaVerified);
  if (!isMfaClaimValid) {
    return <Navigate to="/mfa" />;
  }

  // Account Suspension interception
  const isDev = isDeveloperUser(user?.email, userProfile?.role);
  if (userProfile?.isBanned && !isDev) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md bg-white border border-red-200 p-8 rounded-sm  text-center space-y-6">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-sm flex items-center justify-center mx-auto ">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Account Locked</h2>
          <p className="text-slate-600 text-sm leading-relaxed font-semibold">
            This account has been flagged and suspended for violating the terms of service alignment of Volunteer North York.
          </p>
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-sm text-xs text-slate-600 font-medium space-y-1.5 leading-relaxed">
            <p className="font-bold text-slate-700">Appeal or Investigation:</p>
            <p>To request review or appeal records, contact our privacy desk directly:</p>
            <a aria-label="Email privacy desk" href="mailto:privacy@volunteernorthyork.indevs.in" className="text-blue-dark font-extrabold hover:underline">privacy@volunteernorthyork.indevs.in</a>
          </div>
        </div>
      </div>
    );
  }

  if (role && userProfile.role !== role) {
    // Send the user to the home route for the role they actually have.
    // `homeFor` is exhaustive over the known roles and falls back to '/' for
    // anything unrecognised, so an unexpected role value can never resolve to
    // a route that would bounce back here.
    const homeFor = (r: string | undefined) => {
      switch (r) {
        case 'developer': return '/developer/dashboard';
        case 'organization': return '/org/dashboard';
        case 'student': return '/student/dashboard';
        default: return '/';
      }
    };
    const target = homeFor(userProfile.role);
    // Loop guard: never redirect to the route we are already on. Without this
    // any mismatch whose target equals the current path re-renders this same
    // component, returns the same <Navigate>, and spins forever as a blank page.
    if (target !== location.pathname) {
      return <Navigate to={target} replace />;
    }
  }

  return <MfaClaimMiddleware>{children}</MfaClaimMiddleware>;
};


/** Routes that must render whatever the auth state is — they *are* the auth flow. */
const AUTH_NEUTRAL_PATHS = new Set(['/login', '/signup', '/mfa', '/terms', '/privacy']);

export const GlobalAuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, userProfile, mfaVerified, loading, profileMissing } = useAuth();
  const location = useLocation();

  if (AUTH_NEUTRAL_PATHS.has(location.pathname)) return <>{children}</>;

  // No session resolved yet. `user` is still null here, so this only ever
  // renders the public site to an anonymous visitor.
  if (loading || !user) return <>{children}</>;

  if (!profileMissing) {
    // Signed in, profile read still in flight. The MFA decision is not
    // knowable yet, so hold instead of rendering.
    //
    // This branch used to `return children`, which is the hole: between the
    // Google popup closing and the Firestore profile landing, every route
    // rendered unguarded. Navigating to "/" during that window parked the
    // session on a page the guard had already waved through, and the gate
    // never re-ran. Deciding MFA *before* anything authenticated paints is
    // the whole point of this component.
    if (!userProfile) return <LoadingFallback />;

    // Developer status deliberately does not short-circuit this.
    if (!verifyMfaClaim(user, userProfile, mfaVerified)) {
      return <Navigate to="/mfa" replace />;
    }
  }

  return <>{children}</>;
};
