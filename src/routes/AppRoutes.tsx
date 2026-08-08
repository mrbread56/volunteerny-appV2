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
} from './pages';

/** Public pages get the traditional navbar + footer. */
function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white font-sans text-ink overflow-x-hidden">
      <Navbar />
      <main>{children}</main>
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

                <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
    </Suspense>
  );
}
