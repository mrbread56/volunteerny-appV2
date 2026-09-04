import { lazy } from 'react';

// Lazy load pages for maximum performance and minimum bundle size (lighthouse optimization)
export const Home = lazy(() => import('../pages/Home'));
export const NotFound = lazy(() => import('../pages/NotFound'));
export const Login = lazy(() => import('../pages/Login'));
export const Signup = lazy(() => import('../pages/Signup'));
export const StudentDashboard = lazy(() => import('../pages/StudentDashboard'));
export const StudentOpportunities = lazy(() => import('../pages/StudentOpportunities'));
export const StudentOpportunityDetail = lazy(() => import('../pages/StudentOpportunityDetail'));
export const StudentProfile = lazy(() => import('../pages/StudentProfile'));
export const StudentOnboarding = lazy(() => import('../pages/StudentOnboarding'));
export const OrgDashboard = lazy(() => import('../pages/OrgDashboard'));
export const OrgOpportunityCreate = lazy(() => import('../pages/OrgOpportunityCreate'));
export const OrgOpportunityEdit = lazy(() => import('../pages/OrgOpportunityEdit'));
export const OrgOpportunityApplicants = lazy(() => import('../pages/OrgOpportunityApplicants'));
export const OrgProfile = lazy(() => import('../pages/OrgProfile'));
export const FeedbackPage = lazy(() => import('../pages/FeedbackPage'));
export const DeveloperDashboard = lazy(() => import('../pages/DeveloperDashboard'));
export const TermsOfService = lazy(() => import('../pages/TermsOfService'));
export const About = lazy(() => import('../pages/About'));
export const PrivacyPolicy = lazy(() => import('../pages/PrivacyPolicy'));
export const MfaChallenge = lazy(() => import('../pages/MfaChallenge'));
