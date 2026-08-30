/**
 * The route table: which layout and which guard apply to each path, and
 * nothing else.
 *
 * Guards live in ./guards. Keeping them out of this file means it reads as a
 * map of the site, and a change to authorization cannot hide inside what looks
 * like a routing change.
 */
import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import DashboardShell from '../components/layout/DashboardShell';
import CookieBanner from '../components/CookieBanner';
import { PrivateRoute, LoadingFallback } from './guards';
import {
  Home, Login, Signup, StudentDashboard, StudentOpportunities, StudentOpportunityDetail,
  StudentProfile, StudentOnboarding, OrgDashboard, OrgOpportunityCreate, OrgOpportunityEdit,
  OrgOpportunityApplicants, OrgProfile, FeedbackPage, DeveloperDashboard, TermsOfService,
  PrivacyPolicy, MfaChallenge,
  NotFound,
} from './pages';

/** Public pages get the traditional navbar + footer. */
function PublicLayout({ children }: { children: React.ReactNode }) {
  // No overflow-x-hidden on this wrapper.
  //
  // `overflow-x: hidden` forces the other axis to compute as `auto`
  // (overflow: hidden auto), which makes this element a scroll container — and
  // a scroll container silently disables `position: sticky` for every
  // descendant, app-wide.
  //
  // That had broken four real features without anyone noticing: the site navbar
  // (Navbar.tsx, `sticky top-0`) never actually stuck, and neither did the
  // sidebar cards on OrgProfile, StudentProfile and StudentOpportunityDetail.
  // Measured: a sticky element sat at -800px with the rule and pins at 135px
  // without it.
  //
  // Horizontal overflow is handled where it originates instead — the hero and
  // the facts carousel each carry their own `overflow-hidden`. Verified: no
  // horizontal overflow at 375, 768 or 1440.
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      {/* Skip link — WCAG 2.4.1. See the note in DashboardShell. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-blue-dark focus:px-4 focus:py-2 focus:text-white focus:font-semibold focus:text-sm"
      >
        Skip to main content
      </a>
      <Navbar />
      <main id="main" tabIndex={-1}>{children}</main>
      <Footer />
      <CookieBanner />
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<LoadingFallback />}>
                <Routes>
                {/* Public Routes — traditional navbar + footer */}
                <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
                <Route path="/login" element={<PublicLayout><Login /></PublicLayout>} />
                <Route path="/signup" element={<PublicLayout><Signup /></PublicLayout>} />
                <Route path="/mfa" element={<PublicLayout><MfaChallenge /></PublicLayout>} />
                <Route path="/terms" element={<PublicLayout><TermsOfService /></PublicLayout>} />
                <Route path="/privacy" element={<PublicLayout><PrivacyPolicy /></PublicLayout>} />

                {/* Student Routes — sidebar layout */}
                <Route path="/student/dashboard" element={
                  <PrivateRoute role="student">
                    <DashboardShell><StudentDashboard /></DashboardShell>
                  </PrivateRoute>
                } />
                <Route path="/student/opportunities" element={
                  <PrivateRoute role="student">
                    <DashboardShell><StudentOpportunities /></DashboardShell>
                  </PrivateRoute>
                } />
                <Route path="/student/opportunities/:id" element={
                  <PrivateRoute role="student">
                    <DashboardShell><StudentOpportunityDetail /></DashboardShell>
                  </PrivateRoute>
                } />
                <Route path="/student/profile" element={
                  <PrivateRoute role="student">
                    <DashboardShell><StudentProfile /></DashboardShell>
                  </PrivateRoute>
                } />
                <Route path="/student/onboarding" element={
                  <PrivateRoute role="student">
                    <StudentOnboarding />
                  </PrivateRoute>
                } />

                {/* Organization Routes — sidebar layout */}
                <Route path="/org/dashboard" element={
                  <PrivateRoute role="organization">
                    <DashboardShell><OrgDashboard /></DashboardShell>
                  </PrivateRoute>
                } />
                <Route path="/org/opportunities/new" element={
                  <PrivateRoute role="organization">
                    <DashboardShell><OrgOpportunityCreate /></DashboardShell>
                  </PrivateRoute>
                } />
                <Route path="/org/opportunities/:id/edit" element={
                  <PrivateRoute role="organization">
                    <DashboardShell><OrgOpportunityEdit /></DashboardShell>
                  </PrivateRoute>
                } />
                <Route path="/org/opportunities/:id/applicants" element={
                  <PrivateRoute role="organization">
                    <DashboardShell><OrgOpportunityApplicants /></DashboardShell>
                  </PrivateRoute>
                } />
                <Route path="/org/profile" element={
                  <PrivateRoute role="organization">
                    <DashboardShell><OrgProfile /></DashboardShell>
                  </PrivateRoute>
                } />

                {/* Shared authenticated routes */}
                <Route path="/feedback" element={
                  <PrivateRoute>
                    <DashboardShell><FeedbackPage /></DashboardShell>
                  </PrivateRoute>
                } />


                {/* Developer */}
                <Route path="/developer/dashboard" element={
                  <PrivateRoute role="developer">
                    <DashboardShell><DeveloperDashboard /></DashboardShell>
                  </PrivateRoute>
                } />

                {/* A real page, not a silent redirect home.
                    This was <Navigate to="/" replace />, which dropped the
                    visitor on the marketing page with no explanation and, being
                    a replace, erased the bad URL from history so Back could not
                    return them either. The realistic case is a shared link to a
                    withdrawn opportunity, not a typo. */}
                <Route path="*" element={<NotFound />} />
                </Routes>
    </Suspense>
  );
}
