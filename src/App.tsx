import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { verifyMfaClaim } from './lib/mfa';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import CookieBanner from './components/CookieBanner';

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  public state = { hasError: false, error: null as Error | null };

  constructor(props: {children: React.ReactNode}) {
    super(props);
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 font-sans text-slate-900">
          <div className="max-w-md w-full bg-white p-8 rounded-sm  text-center space-y-6 border border-red-100">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-sm flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">Something went wrong</h1>
            <p className="text-sm font-medium text-slate-600">We've encountered an unexpected error. Our team has been notified. Please try refreshing the page.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 w-full h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-full font-bold uppercase tracking-widest text-xs transition-colors cursor-pointer"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

// Lazy load pages for maximum performance and minimum bundle size (lighthouse optimization)
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));
const StudentOpportunities = lazy(() => import('./pages/StudentOpportunities'));
const StudentOpportunityDetail = lazy(() => import('./pages/StudentOpportunityDetail'));
const StudentProfile = lazy(() => import('./pages/StudentProfile'));
const StudentOnboarding = lazy(() => import('./pages/StudentOnboarding'));
const OrgDashboard = lazy(() => import('./pages/OrgDashboard'));
const OrgOpportunityCreate = lazy(() => import('./pages/OrgOpportunityCreate'));
const OrgOpportunityEdit = lazy(() => import('./pages/OrgOpportunityEdit'));
const OrgOpportunityApplicants = lazy(() => import('./pages/OrgOpportunityApplicants'));
const OrgProfile = lazy(() => import('./pages/OrgProfile'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const DeveloperDashboard = lazy(() => import('./pages/DeveloperDashboard'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const MfaChallenge = lazy(() => import('./pages/MfaChallenge'));
const Messages = lazy(() => import('./pages/Messages'));

const LoadingFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
    <div className="w-6 h-6 border-2 border-ink/10 border-t-ink rounded-full animate-spin"></div>
  </div>
);

// Shown when a user is authenticated but has no profile document, i.e. their
// signup died partway through and left an orphaned auth account. Signing out
// is the escape hatch; the account itself must be cleared server-side before
// the address can be reused.
const AccountSetupIncomplete: React.FC = () => {
  const { logout } = useAuth();
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-line p-8 text-center space-y-5">
        <h2 className="text-2xl font-semibold text-ink tracking-[-0.02em]">
          Account setup didn't finish
        </h2>
        <p className="text-[14px] text-ink-soft leading-relaxed">
          Your sign-in worked, but your profile was never fully created, so there's
          nothing to load yet. This usually means an earlier sign-up was interrupted.
        </p>
        <p className="text-[14px] text-ink-soft leading-relaxed">
          Please contact support so we can clear the incomplete account, then you'll
          be able to sign up again with the same email address.
        </p>
        <a
          href="mailto:privacy@volunteernorthyork.indevs.in"
          className="block text-[#1F4C63] font-medium hover:underline"
        >
          privacy@volunteernorthyork.indevs.in
        </a>
        <button
          type="button"
          onClick={() => { void logout(); }}
          className="w-full h-11 bg-blue-dark text-paper text-[14px] font-medium hover:bg-ink transition-colors"
        >
          Sign out
        </button>
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
const PrivateRoute = ({ children, role }: { children: React.ReactNode, role?: 'student' | 'organization' | 'developer' }) => {
  const { user, userProfile, loading, mfaVerified, profileMissing, authError } = useAuth();

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

  // Perform strict checking using the dedicated verifyMfaClaim middleware function
  const isMfaClaimValid = verifyMfaClaim(user, userProfile, mfaVerified);
  if (!isMfaClaimValid) {
    return <Navigate to="/mfa" />;
  }

  // Account Suspension interception
  const AUTHORIZED_DEVS = (import.meta.env.VITE_DEVELOPER_EMAILS || '').split(',').map((e: string) => e.trim());
  const isDev = user?.email && AUTHORIZED_DEVS.includes(user.email);
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
            <a aria-label="Email privacy desk" href="mailto:privacy@volunteernorthyork.indevs.in" className="text-[#1F4C63] font-extrabold hover:underline">privacy@volunteernorthyork.indevs.in</a>
          </div>
        </div>
      </div>
    );
  }

  if (role && userProfile?.role !== role) {
    if (userProfile?.role === 'developer') {
      return <Navigate to="/developer/dashboard" />;
    }
    return <Navigate to={userProfile?.role === 'student' ? '/student/dashboard' : '/org/dashboard'} />;
  }

  return <MfaClaimMiddleware>{children}</MfaClaimMiddleware>;
};

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

import SplashScreen from './components/SplashScreen';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <ScrollToTop />
          <SplashScreen>
            <div className="min-h-screen bg-white font-sans text-ink overflow-x-hidden">
          <Navbar />
          <main>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/mfa" element={<MfaChallenge />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />

                {/* Student Routes */}
                <Route path="/student/dashboard" element={
                  <PrivateRoute role="student">
                    <StudentDashboard />
                  </PrivateRoute>
                } />
                <Route path="/student/opportunities" element={
                  <PrivateRoute role="student">
                    <StudentOpportunities />
                  </PrivateRoute>
                } />
                <Route path="/student/opportunities/:id" element={
                  <PrivateRoute role="student">
                    <StudentOpportunityDetail />
                  </PrivateRoute>
                } />
                <Route path="/student/profile" element={
                  <PrivateRoute role="student">
                    <StudentProfile />
                  </PrivateRoute>
                } />
                <Route path="/student/onboarding" element={
                  <PrivateRoute role="student">
                    <StudentOnboarding />
                  </PrivateRoute>
                } />

                {/* Organization Routes */}
                <Route path="/org/dashboard" element={
                  <PrivateRoute role="organization">
                    <OrgDashboard />
                  </PrivateRoute>
                } />
                <Route path="/org/opportunities/new" element={
                  <PrivateRoute role="organization">
                    <OrgOpportunityCreate />
                  </PrivateRoute>
                } />
                <Route path="/org/opportunities/:id/edit" element={
                  <PrivateRoute role="organization">
                    <OrgOpportunityEdit />
                  </PrivateRoute>
                } />
                <Route path="/org/opportunities/:id/applicants" element={
                  <PrivateRoute role="organization">
                    <OrgOpportunityApplicants />
                  </PrivateRoute>
                } />
                <Route path="/org/profile" element={
                  <PrivateRoute role="organization">
                    <OrgProfile />
                  </PrivateRoute>
                } />

                {/* Feedback and Developer Administration routes */}
                <Route path="/feedback" element={
                  <PrivateRoute>
                    <FeedbackPage />
                  </PrivateRoute>
                } />

                <Route path="/messages" element={
                  <PrivateRoute>
                    <Messages />
                  </PrivateRoute>
                } />

                <Route path="/developer/dashboard" element={
                  <PrivateRoute role="developer">
                    <DeveloperDashboard />
                  </PrivateRoute>
                } />

                {/* Redirect if unknown */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>

          <Footer />
          <CookieBanner />
            </div>
          </SplashScreen>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
