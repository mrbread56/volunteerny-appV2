export type UserRole = 'student' | 'organization' | 'developer';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  isBanned?: boolean;
  twoFactorEnabled?: boolean;
  createdAt: any;
}

export interface StudentProfile {
  uid: string;
  fullName: string;
  school: string;
  grade: string;
  neighborhood: string;
  interests: string[];
  skills: string[];
  availability: string[];
  previousExperience?: string;
  resumeUrl?: string;
  passportUrl?: string;
  trackerEnabled?: boolean;
  trackerAnonymous?: boolean;
  loggedHours?: Array<{
    id: string;
    activity: string;
    hours: number;
    date: string;
    coordinatorName?: string;
    coordinatorContact?: string;
    approved?: boolean;
  }>;
  contactEmail?: string;
  phone?: string;
}

export interface OrganizationProfile {
  uid: string;
  organizationName: string;
  mission: string;
  contactEmail: string;
  phone?: string;
  address: string;
  organizationType?: string;
  northYorkConfirmed: boolean;
  websiteUrl?: string;
  hasCra?: boolean;
  craNumber?: string;
  craVerified?: boolean;
  /**
   * Reviewer-controlled trust state. Never set by the organization itself.
   * 'unverified' - no charity number supplied
   * 'pending'    - number supplied, awaiting human review against the CRA registry
   * 'verified'   - a reviewer confirmed the registration and the applicant's control of it
   * 'rejected'   - review failed
   */
  verificationStatus?: 'unverified' | 'pending' | 'verified' | 'rejected';
  description?: string;
  socialLinks?: {
    twitter?: string;
    instagram?: string;
    linkedin?: string;
  };
}

export interface Opportunity {
  id: string;
  orgId: string;
  orgName?: string;
  title: string;
  description: string;
  location: string;
  dateTime: any;
  category: string;
  requirements: string;
  maxVolunteers: number;
  skillsNeeded: string[];
  timeCommitment: string;
  isVirtual: boolean;
  createdAt: any;
  coordinates?: {
    lat: number;
    lng: number;
  };
  scheduleType?: 'single' | 'recurring' | 'multiple';
  shifts?: Array<{ 
    date?: string; 
    day?: string; 
    startTime: string; 
    endTime: string; 
    exclusiveBadges?: string[];
  }>;
  exclusives?: string[];
  autoCreateGroupChat?: boolean;
}

export interface Application {
  id: string;
  opportunityId: string;
  studentId: string;
  studentName?: string;
  opportunityTitle?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'terminated' | 'waitlist';
  appliedAt: any;
  message?: string;
  previousExperience?: string;
  resumeUrl?: string;
  rejectionReason?: string;
  rejectionNote?: string;
}

export interface SavedOpportunity {
  id: string;
  studentId: string;
  opportunityId: string;
  savedAt: any;
}

export interface InterestRequest {
  id: string;
  studentId: string;
  studentName: string;
  email: string;
  categories: string[];
  description: string;
  createdAt: any;
  status: 'pending' | 'matched';
}

export interface Feedback {
  id: string;
  userId: string;
  userEmail: string;
  userRole: string;
  type: 'bug' | 'feature' | 'ux' | 'other';
  subject: string;
  message: string;
  createdAt: any;
  aiOverview?: {
    category: 'bug' | 'feature' | 'ux' | 'other';
    urgency: 'low' | 'medium' | 'high' | 'critical';
    summary: string;
    suggestedFix?: string;
  };
  developerReply?: string;
  repliedAt?: any;
}

// ── Org → Student recommendation ──
export interface Recommendation {
  id?: string;
  orgId: string;
  orgName: string;
  studentId: string;
  studentName: string;
  opportunityId: string;
  opportunityTitle: string;
  text: string;
  /** 1-5, org's assessment of the student's work */
  rating: number;
  createdAt: any;
}

// ── Student → Org rating ──
export interface OrgRating {
  id?: string;
  studentId: string;
  studentName: string;
  orgId: string;
  orgName: string;
  opportunityId: string;
  opportunityTitle: string;
  /** 1-5 stars */
  stars: number;
  comment: string;
  createdAt: any;
}
