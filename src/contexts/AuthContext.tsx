import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { UserProfile, StudentProfile, OrganizationProfile } from '../types';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  studentProfile: StudentProfile | null;
  orgProfile: OrganizationProfile | null;
  loading: boolean;
  /**
   * True when the user is authenticated but has no users/{uid} profile
   * document (a signup that failed partway through). Routes should show a
   * recovery message rather than looping through the MFA gate forever.
   */
  profileMissing: boolean;
  authError: string | null;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
  isDemoMode: boolean;
  enableDemoMode: (role: 'student' | 'organization' | 'developer') => Promise<void>;
  accessToken: string | null;
  connectGmail: () => Promise<string | null>;
  disconnectGmail: () => void;
  calendarToken: string | null;
  connectCalendar: () => Promise<string | null>;
  disconnectCalendar: () => void;
  tasksToken: string | null;
  connectTasks: () => Promise<string | null>;
  disconnectTasks: () => void;
  darkMode?: boolean;
  toggleDarkMode?: () => void;
  themeFont?: string;
  setThemeFont?: (font: string) => void;
  themeColor?: string;
  setThemeColor?: (color: string) => void;
  mfaVerified: boolean;
  setMfaVerified: (verified: boolean, optionalUid?: string, rememberDevice?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [orgProfile, setOrgProfile] = useState<OrganizationProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [tasksToken, setTasksToken] = useState<string | null>(null);

  const [mfaVerified, setMfaVerifiedState] = useState<boolean>(false);

  // Kept for backward compatibility with any external caller, but MFA status
  // is no longer sourced from local/session storage. Real users' status
  // comes from the `mfaVerified` custom claim on their ID token (set
  // server-side after a real OTP check); demo sessions are force-verified
  // in enableDemoMode. This just re-reads the real claim after a refresh.
  const setMfaVerified = async (verified: boolean, _optionalUid?: string, _rememberDevice: boolean = true) => {
    if (isDemoMode) {
      setMfaVerifiedState(verified);
      return;
    }
    if (!user) {
      setMfaVerifiedState(false);
      return;
    }
    try {
      const tokenResult = await user.getIdTokenResult(true);
      setMfaVerifiedState(tokenResult.claims.mfaVerified === true);
    } catch (e) {
      console.error('Failed to refresh MFA claim:', e);
      setMfaVerifiedState(false);
    }
  };

  const [themeColor, setThemeColorState] = useState(() => localStorage.getItem('theme_color') || 'blue');

  const applyThemeColor = (color: string) => {
    let accent = '#2563eb';
    let hover = '#1d4ed8';
    let lightBg = '#eff6ff';
    let border = '#dbeafe';

    if (color === 'blue') {
      accent = '#2563eb';
      hover = '#1d4ed8';
      lightBg = '#eff6ff';
      border = '#dbeafe';
    } else if (color === 'emerald') {
      accent = '#1F4C63';
      hover = '#059669';
      lightBg = '#ecfdf5';
      border = '#d1fae5';
    } else if (color === 'indigo') {
      accent = '#6366f1';
      hover = '#4f46e5';
      lightBg = '#f5f3ff';
      border = '#e0e7ff';
    } else if (color === 'rose') {
      accent = '#f43f5e';
      hover = '#e11d48';
      lightBg = '#fff1f2';
      border = '#ffe4e6';
    } else if (color === 'teal') {
      accent = '#0d9488';
      hover = '#0f766e';
      lightBg = '#f0fdfa';
      border = '#ccfbf1';
    } else if (color === 'orange') {
      accent = '#f95716';
      hover = '#ea430e';
      lightBg = '#fff7ed';
      border = '#ffedd5';
    } else if (color === 'violet') {
      accent = '#8b5cf6';
      hover = '#7c3aed';
      lightBg = '#f5f3ff';
      border = '#ddd6fe';
    } else if (color === 'amber') {
      accent = '#f59e0b';
      hover = '#d97706';
      lightBg = '#fef3c7';
      border = '#fde68a';
    }

    document.documentElement.style.setProperty('--color-theme-accent', accent);
    document.documentElement.style.setProperty('--color-theme-accent-hover', hover);
    document.documentElement.style.setProperty('--color-theme-light-bg', lightBg);
    document.documentElement.style.setProperty('--color-theme-border', border);
    document.documentElement.setAttribute('data-theme-color', color);
  };

  const setThemeColor = (color: string) => {
    setThemeColorState(color);
    localStorage.setItem('theme_color', color);
    applyThemeColor(color);
  };

  useEffect(() => {
    // Force light mode
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('theme_dark_mode');

    // 1. Process font selection
    const font = '"Plus Jakarta Sans", "Inter", sans-serif';
    document.documentElement.style.setProperty('--font-sans', font);
    document.documentElement.setAttribute('data-theme-font', 'jakarta');

    // 2. Process color selection
    applyThemeColor(themeColor);
  }, [themeColor]);

  const fetchProfiles = async (currentUser: User | { uid: string }) => {
    try {
      const AUTHORIZED_DEVS = (import.meta.env.VITE_DEVELOPER_EMAILS || '').split(',').map((e: string) => e.trim());
      const userEmail = (currentUser as any).email || '';
      const isDevEmail = AUTHORIZED_DEVS.includes(userEmail);

      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        setProfileMissing(false);
        const data = userDoc.data() as UserProfile;
        if (data.twoFactorEnabled === undefined) {
          // Older accounts predate this field. Default to the same policy as
          // signup: required for organizations and developers, optional for students (who can
          // still turn it on from their settings).
          data.twoFactorEnabled = data.role === 'organization' || data.role === 'developer' || isDevEmail;
        }
        
        // Auto-resolve developer session safely
        if (isDevEmail) {
          data.role = 'developer';
          if (data.isBanned) {
            data.isBanned = false;
            try {
              const { updateDoc } = await import('firebase/firestore');
              await updateDoc(doc(db, 'users', currentUser.uid), { isBanned: false });
              await updateDoc(doc(db, 'students', currentUser.uid), { isBanned: false });
              await updateDoc(doc(db, 'organizations', currentUser.uid), { isBanned: false });
            } catch (unbanErr) {
              console.warn('Auto-unbanning dev in DB failed but bypassed locally:', unbanErr);
            }
          }
        }
        
        setUserProfile(data);

        if (data.role === 'student') {
          const studentDoc = await getDoc(doc(db, 'students', currentUser.uid));
          if (studentDoc.exists()) {
            setStudentProfile(studentDoc.data() as StudentProfile);
          }
        } else if (data.role === 'organization') {
          const orgDoc = await getDoc(doc(db, 'organizations', currentUser.uid));
          if (orgDoc.exists()) {
            setOrgProfile(orgDoc.data() as OrganizationProfile);
          }
        }
      } else if (isDevEmail) {
        setProfileMissing(false);
        // Fallback profile creation for developer accounts
        const devProfile: UserProfile = {
          uid: currentUser.uid,
          email: userEmail,
          role: 'developer',
          twoFactorEnabled: true,
          createdAt: new Date(),
        };
        setUserProfile(devProfile);
        
        try {
          await setDoc(doc(db, 'users', currentUser.uid), {
            uid: currentUser.uid,
            email: userEmail,
            role: 'developer',
            twoFactorEnabled: true,
            createdAt: serverTimestamp(),
          });
        } catch (dbErr) {
          console.warn('Silent fallback for developer documents syncing: ', dbErr);
        }
      } else {
        // No users/{uid} document exists for this authenticated account.
        // We deliberately do NOT invent one here. Auto-provisioning a
        // `role: 'student'` profile hid the real problem (a signup that died
        // partway through, leaving an auth record with no profile) and turned
        // it into a permanent redirect loop the user could never escape:
        // the invented profile had twoFactorEnabled: true, so every route
        // bounced to /mfa forever.
        //
        // Instead we surface the broken state so the UI can tell the user
        // their setup never finished, and so it can be repaired properly.
        console.error(
          'Orphaned auth account: no users/%s profile document found for %s',
          currentUser.uid,
          userEmail || '(no email)'
        );
        setUserProfile(null);
        setProfileMissing(true);
      }
    } catch (error: any) {
      if (error?.message?.includes('offline') || error?.message?.includes('Failed to fetch') || error?.message?.includes('network')) {
        console.warn('Offline mode: Could not fetch profiles from Firestore.');
        setAuthError('Network error while connecting to the database. Please check your internet connection and try again.');
      } else {
        console.error('Error fetching profiles:', error);
        setAuthError('An unexpected error occurred while loading your profile. Please try again.');
      }
    }
  };

  useEffect(() => {
    // Check for demo mode in local storage
    const demoRole = localStorage.getItem('demo_mode_role');
    if (demoRole) {
      setIsDemoMode(true);
      const role = demoRole as 'student' | 'organization' | 'developer';
      const mockUser = { 
        uid: role === 'student' ? 'demo-student-1' : role === 'organization' ? 'demo-org-123' : 'demo-developer-99', 
        email: role === 'developer' ? 'developer@volunteernorthyork.indevs.in' : 'demo@example.com', 
        displayName: role === 'developer' ? 'Developer Assistant' : 'Demo Hero' 
      } as any;
      setUser(mockUser);
      localStorage.setItem('isLoggedIn', 'true');
      // For demo mode, we set the profile directly instead of fetching from firestore
      const demo2FA = role === 'student' ? false : localStorage.getItem('demo_2fa_enabled') !== 'false';
      setUserProfile({ uid: mockUser.uid, email: mockUser.email || '', role, twoFactorEnabled: demo2FA, createdAt: new Date() as any });
      setProfileMissing(false);
      
      const isVerified = sessionStorage.getItem(`mfa_verified_${mockUser.uid}`) === 'true' || 
                         localStorage.getItem(`mfa_verified_${mockUser.uid}`) === 'true';
      setMfaVerifiedState(isVerified);

      if (role === 'student') {
        const savedProfile = localStorage.getItem('demo_student_profile');
        if (savedProfile) {
          setStudentProfile(JSON.parse(savedProfile));
        } else {
          setStudentProfile({ 
            uid: mockUser.uid, 
            fullName: 'Alex Volunteer', 
            school: 'North York Collegiate', 
            grade: '11', 
            neighborhood: 'Willowdale', 
            interests: ['Environment', 'Sports'], 
            skills: ['Leadership', 'Communication'],
            contactEmail: 'alex.v@yorkschool.ca',
            phone: '(416) 555-0182'
          });
        }
        setOrgProfile(null);
      } else if (role === 'organization') {
        const savedProfile = localStorage.getItem('demo_org_profile');
        if (savedProfile) {
          setOrgProfile(JSON.parse(savedProfile));
        } else {
          setOrgProfile({ 
            uid: mockUser.uid, 
            organizationName: 'North York Community Hub', 
            mission: 'Empowering local youth through community involvement.', 
            contactEmail: 'contact@nychub.org', 
            northYorkConfirmed: true 
          });
        }
        setStudentProfile(null);
      } else if (role === 'developer') {
        setStudentProfile(null);
        setOrgProfile(null);
      }
      setLoading(false);
      return;
    }

    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error: any) {
        if (error.message?.includes('the client is offline')) {
          console.warn("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!localStorage.getItem('demo_mode_role')) {
        setUser(currentUser);
        if (currentUser) {
          localStorage.setItem('isLoggedIn', 'true');
          // MFA status is trusted from the ID token's custom claims only.
          // The server sets `mfaVerified` as a custom claim after a real OTP
          // check (see /api/auth/verify-otp); a client can no longer grant
          // itself MFA-verified status by writing to local/session storage.
          try {
            const tokenResult = await currentUser.getIdTokenResult();
            setMfaVerifiedState(tokenResult.claims.mfaVerified === true);
          } catch (claimsErr) {
            console.error('Failed to read auth token claims:', claimsErr);
            setMfaVerifiedState(false);
          }
          setAuthError(null);
          await fetchProfiles(currentUser);
        } else {
          localStorage.removeItem('isLoggedIn');
          setUserProfile(null);
          setStudentProfile(null);
          setOrgProfile(null);
          setMfaVerifiedState(false);
          setProfileMissing(false);
        }
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [isDemoMode]);

  const refreshProfile = async () => {
    if (user) {
      if (isDemoMode) {
        const demoRole = localStorage.getItem('demo_mode_role');
        const demo2FA = demoRole === 'student' ? false : localStorage.getItem('demo_2fa_enabled') !== 'false';
        setUserProfile({
          uid: user.uid,
          email: user.email || '',
          role: (demoRole as any) || 'student',
          twoFactorEnabled: demo2FA,
          createdAt: new Date() as any
        });
        if (demoRole === 'student') {
          const savedProfile = localStorage.getItem('demo_student_profile');
          if (savedProfile) {
            setStudentProfile(JSON.parse(savedProfile));
          }
        } else if (demoRole === 'organization') {
          const savedProfile = localStorage.getItem('demo_org_profile');
          if (savedProfile) {
            setOrgProfile(JSON.parse(savedProfile));
          }
        }
      } else {
        await fetchProfiles(user);
      }
    }
  };

  const logout = async () => {
    try {
      await auth.signOut();
    } catch (e) {
      console.warn("Silent ignore auth signout failure:", e);
    }
    if (user?.uid) {
      sessionStorage.removeItem(`mfa_verified_${user.uid}`);
      localStorage.removeItem(`mfa_verified_${user.uid}`);
    }
    sessionStorage.removeItem('mfa_verified_temp');
    localStorage.removeItem('mfa_verified_temp');
    localStorage.removeItem('demo_mode_role');
    localStorage.removeItem('demo_student_profile');
    localStorage.removeItem('demo_org_profile');
    localStorage.removeItem('gmail_connected_state');
    localStorage.removeItem('calendar_connected_state');
    sessionStorage.removeItem('mfa_verified');
    localStorage.removeItem('isLoggedIn');
    setMfaVerifiedState(false);
    setAccessToken(null);
    setCalendarToken(null);
    setIsDemoMode(false);
    setUser(null);
    setUserProfile(null);
    setStudentProfile(null);
    setOrgProfile(null);
    setProfileMissing(false);
  };

  const connectGmail = async () => {
    if (isDemoMode) {
      const mockToken = "demo-gmail-token-123456";
      setAccessToken(mockToken);
      localStorage.setItem('gmail_connected_state', 'true');
      return mockToken;
    }

    try {
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/gmail.send');
      provider.setCustomParameters({ prompt: 'consent' });
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
        localStorage.setItem('gmail_connected_state', 'true');
        return credential.accessToken;
      }
    } catch (error) {
      console.error('Google Gmail OAuth integration failed:', error);
      setAuthError('Failed to connect Gmail. Please try again.');
    }
    return null;
  };

  const disconnectGmail = () => {
    setAccessToken(null);
    localStorage.removeItem('gmail_connected_state');
  };

  const connectCalendar = async () => {
    if (isDemoMode) {
      const mockToken = "demo-calendar-token-123456";
      setCalendarToken(mockToken);
      localStorage.setItem('calendar_connected_state', 'true');
      return mockToken;
    }

    try {
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      provider.addScope('https://www.googleapis.com/auth/calendar');
      provider.setCustomParameters({ prompt: 'consent' });
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setCalendarToken(credential.accessToken);
        localStorage.setItem('calendar_connected_state', 'true');
        return credential.accessToken;
      }
    } catch (error) {
      console.error('Google Calendar OAuth integration failed:', error);
      setAuthError('Failed to connect Calendar. Please try again.');
    }
    return null;
  };

  const disconnectCalendar = () => {
    setCalendarToken(null);
    localStorage.removeItem('calendar_connected_state');
  };

  const connectTasks = async () => {
    if (isDemoMode) {
      const mockToken = "demo-tasks-token-123456";
      setTasksToken(mockToken);
      localStorage.setItem('tasks_connected_state', 'true');
      return mockToken;
    }

    try {
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/tasks');
      provider.addScope('https://www.googleapis.com/auth/tasks.readonly');
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setTasksToken(credential.accessToken);
        localStorage.setItem('tasks_connected_state', 'true');
        return credential.accessToken;
      }
    } catch (error) {
      console.error('Google Tasks OAuth integration failed:', error);
      setAuthError('Failed to connect Tasks. Please try again.');
    }
    return null;
  };

  const disconnectTasks = () => {
    setTasksToken(null);
    localStorage.removeItem('tasks_connected_state');
  };

  const enableDemoMode = async (role: 'student' | 'organization' | 'developer') => {
    localStorage.setItem('demo_mode_role', role);
    setIsDemoMode(true);
    const mockUser = { 
      uid: role === 'student' ? 'demo-student-1' : role === 'organization' ? 'demo-org-123' : 'demo-developer-99', 
      email: role === 'developer' ? 'developer@volunteernorthyork.indevs.in' : 'demo@example.com', 
      displayName: role === 'developer' ? 'Developer Assistant' : 'Demo Hero' 
    } as any;
    setUser(mockUser);
    localStorage.setItem('isLoggedIn', 'true');
    const demo2FA = role === 'student' ? false : localStorage.getItem('demo_2fa_enabled') !== 'false';
    setUserProfile({ uid: mockUser.uid, email: mockUser.email || '', role, twoFactorEnabled: demo2FA, createdAt: new Date() as any });
      setProfileMissing(false);
    
    // Automatically set MFA verified for demo sessions to bypass routing blocks
    setMfaVerifiedState(true);
    sessionStorage.setItem(`mfa_verified_${mockUser.uid}`, 'true');
    localStorage.setItem(`mfa_verified_${mockUser.uid}`, 'true');
    
    if (role === 'student') {
      const profile = { 
        uid: mockUser.uid, 
        fullName: 'Alex Volunteer', 
        school: 'North York Collegiate', 
        grade: '11', 
        neighborhood: 'Willowdale', 
        interests: ['Environment', 'Sports'], 
        skills: ['Leadership', 'Communication'],
        contactEmail: 'alex.v@yorkschool.ca',
        phone: '(416) 555-0182'
      };
      setStudentProfile(profile);
      setOrgProfile(null);
      localStorage.setItem('demo_student_profile', JSON.stringify(profile));
      localStorage.removeItem('demo_org_profile');
    } else if (role === 'organization') {
      const profile = { 
        uid: mockUser.uid, 
        organizationName: 'North York Community Hub', 
        mission: 'Empowering local youth through community involvement.', 
        contactEmail: 'contact@nychub.org', 
        northYorkConfirmed: true 
      };
      setOrgProfile(profile);
      setStudentProfile(null);
      localStorage.setItem('demo_org_profile', JSON.stringify(profile));
      localStorage.removeItem('demo_student_profile');
    } else if (role === 'developer') {
      setStudentProfile(null);
      setOrgProfile(null);
      localStorage.removeItem('demo_student_profile');
      localStorage.removeItem('demo_org_profile');
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      userProfile, 
      studentProfile, 
      orgProfile, 
      loading, 
      profileMissing,
      authError,
      refreshProfile, 
      isDemoMode, 
      enableDemoMode, 
      logout, 
      accessToken, 
      connectGmail, 
      disconnectGmail, 
      calendarToken, 
      connectCalendar, 
      disconnectCalendar,
      tasksToken,
      connectTasks,
      disconnectTasks,
      darkMode: false,
      toggleDarkMode: () => {},
      themeFont: 'jakarta',
      setThemeFont: () => {},
      themeColor,
      setThemeColor,
      mfaVerified,
      setMfaVerified
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
