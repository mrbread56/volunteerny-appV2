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
  gender?: 'male' | 'female' | 'other';
  neighborhood: string;
  interests: string[];
  skills: string[];
  availability?: string[];
  previousExperience?: string;
  resumeUrl?: string;
  trackerEnabled?: boolean;
  trackerAnonymous?: boolean;
  loggedHours?: Array<{
    id: string;
    activity: string;
    hours: number;
    date: string;
    coordinatorName?: string;
    coordinatorContact?: string;
    /** Where the hours were served. An Ontario board form asks for this on
     *  every activity row. Optional because entries confirmed before it was
     *  carried across do not have it. */
    organization?: string;
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
  address?: string;
  organizationType?: string;
  /** Free text, only when organizationType is 'Other'. */
  organizationTypeOther?: string;
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
  /**
   * Whether the posting still accepts applications.
   *
   * Absent means open. Postings created before this field existed carry no
   * value, so every read treats `!== 'closed'` as open rather than filtering on
   * `=== 'open'` — a Firestore query on the latter omits documents missing the
   * field entirely, which would have hidden every existing posting overnight.
   */
  status?: 'open' | 'closed';
  /**
   * Seeded by a test suite, not by a real organisation.
   *
   * Set only by the check scripts and e2e specs, which write to the real
   * project. Absent on every posting a person created.
   */
  isFixture?: boolean;
  createdAt: any;
  coordinates?: {
    lat: number;
    lng: number;
  };
  scheduleType?: 'single' | 'recurring' | 'multiple' | 'flexible';
  shifts?: Array<{ 
    date?: string; 
    day?: string; 
    startTime: string; 
    endTime: string; 
    exclusiveBadges?: string[];
  }>;
  exclusives?: string[];
  /**
   * Minimum volunteer age this opportunity will accept.
   *
   * Toronto age floors genuinely range 14 to 19 — City recreation takes 14+,
   * Daily Bread 18+, Second Harvest 19+ — so without this a student applies
   * into a wall and finds out days later, if at all. Compared against an age
   * FLOOR derived from grade (see src/lib/eligibility.ts); we deliberately do
   * not hold a date of birth for a minor.
   */
  minAge?: number;
}

export interface Application {
  id: string;
  opportunityId: string;
  studentId: string;
  studentName?: string;
  opportunityTitle?: string;
  status: 'pending' | 'reviewed' | 'accepted' | 'rejected' | 'terminated' | 'waitlist';
  appliedAt: any;
  message?: string;
  previousExperience?: string;
  resumeUrl?: string;
  rejectionReason?: string;
  rejectionNote?: string;
  // Denormalised onto the application document at write time so the student
  // dashboard can render and email without a second read. These were being
  // set and read already; the interface just did not admit them.
  studentEmail?: string;
  /*
   * NOT written by the apply flow, despite the note that used to sit here
   * claiming they were "denormalised onto the application document at write
   * time". firestore.rules' hasOnly on applications does not permit either key,
   * so they are only ever present when a caller patches them in — which the
   * student dashboard does and the organisation pages do not. Treat as absent.
   */
  studentSchool?: string;
  studentGrade?: string;
  orgId?: string;
  organizationId?: string;
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
