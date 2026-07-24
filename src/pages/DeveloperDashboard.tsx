import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../lib/config';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase/config';
import { collection, getDocs, doc, updateDoc, getDoc, deleteDoc, query, where, serverTimestamp, setDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { 
  ShieldAlert, 
  Users, 
  Building2, 
  MessageSquare, 
  Sparkles, 
  ShieldCheck, 
  XOctagon, 
  Reply, 
  Filter,
  CheckCircle2,
  Lock,
  Plus,
  Compass,
  Paperclip,
  Trash2,
  Settings,
  Mail
} from 'lucide-react';
import { cn } from '../lib/utils';
import { decompressFile } from '../utils/compress';

export default function DeveloperDashboard() {
  const { user, userProfile, isDemoMode } = useAuth();

  // Test Email Client States
  const [testEmailTo, setTestEmailTo] = useState(user?.email || 'developer@example.com');
  const [testEmailTemplate, setTestEmailTemplate] = useState('welcome_student');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<{ success: boolean; message: string } | null>(null);

  const handleSendTestEmail = async () => {
    setIsSendingTestEmail(true);
    setTestEmailStatus(null);
    try {
      const templateData = {
        studentName: 'Kiamehr',
        fullName: 'Kiamehr Metanat',
        userName: 'Admin Assistant',
        oppTitle: 'GTA High School Food Security Initiative',
        orgName: 'York Region Food Coordinators',
        supervisorName: 'Sarah Jenkins',
        hours: 15,
        status: 'accepted',
        note: 'Welcome aboard! We are super excited to see you join our OSSD development team this week.',
        code: '184920',
        purpose: 'identity verification',
        subject: 'Brute-force Threat Prevented',
        details: 'IP rate limiter triggered 12 concurrent authentication blocks from outside York region within 1 second.'
      };

      const token = isDemoMode ? 'demo-mode-token-developer' : await user?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/email/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          to: testEmailTo,
          subject: testEmailTemplate === 'welcome_student' ? '✨ Welcome to Your OSSD Volunteer Hub Portfolio!' :
                   testEmailTemplate === 'application_status' ? '🎉 Volunteer Application Accepted!' :
                   testEmailTemplate === 'hours_confirmation' ? '📝 Community Involvement Hours Signed & Confirmed' :
                   testEmailTemplate === 'new_applicant' ? '📬 New Applicant Submitted to Your Opportunity' :
                   testEmailTemplate === 'auth_verification' ? '🔐 Secure OSSD Account Verification Code' :
                   '⚠️ System Operations Alert - High Priority',
          templateName: testEmailTemplate,
          templateData
        })
      });

      if (res.ok) {
        const body = await res.json();
        if (body.mode === 'smtp_production') {
          setTestEmailStatus({
            success: true,
            message: `🟢 SMTP Delivery Succeeded! Email dispatched securely via SMTP Server (${body.host || 'volunteernorthyork.indevs.in'}) to ${testEmailTo}. MessageID: ${body.messageId}`
          });
        } else if (body.mode === 'production') {
          setTestEmailStatus({
            success: true,
            message: `🟢 Resend API Delivery Succeeded! Email dispatched securely via Resend to ${testEmailTo}. ID: ${body.id || 'N/A'}`
          });
        } else {
          setTestEmailStatus({
            success: false,
            message: `⚠️ Simulation Fallback Active: Real email sending failed (Error: ${body.details || 'API Key or SMTP invalid'}), but the email HTML was successfully generated and recorded in the dev/test logs!`
          });
        }
      } else {
        setTestEmailStatus({
          success: false,
          message: '🔴 API router returned a failure. Check server logs.'
        });
      }
    } catch (err: any) {
      setTestEmailStatus({
        success: false,
        message: `🔴 Request failed: ${err.message || err}`
      });
    } finally {
      setIsSendingTestEmail(false);
    }
  };
  
  // Stats loaded from DB
  const [realStudentCount, setRealStudentCount] = useState(0);
  const [realOrgCount, setRealOrgCount] = useState(0);
  const [realFeedbackCount, setRealFeedbackCount] = useState(0);

  // Entities Lists
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  
  // Dashboard Interactive Creation / Click Toggles
  const [isDashboardActive, setIsDashboardActive] = useState(false);
  const [showStudentsList, setShowStudentsList] = useState(false);
  const [showOrgsList, setShowOrgsList] = useState(false);
  const [showReportsList, setShowReportsList] = useState(false);

  // General dashboard controls
  const [activeTab, setActiveTab] = useState<'feedbacks' | 'reports' | 'users' | 'terminated' | 'settings' | 'verification'>('feedbacks');
  const [reports, setReports] = useState<any[]>([]);
  const [realReportCount, setRealReportCount] = useState(0);

  // Org verification queue
  const [pendingOrgs, setPendingOrgs] = useState<any[]>([]);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // System Settings state
  
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const fetchEmailLogs = async () => {
    try {
      const authToken = isDemoMode ? 'demo-mode-token-developer' : await user?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/email/history`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        setEmailLogs(data);
      }
    } catch (e) {}
  };
  useEffect(() => {
    fetchEmailLogs();
    const interval = setInterval(fetchEmailLogs, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [emailSystemOn, setEmailSystemOn] = useState(() => {
    return localStorage.getItem("email_system_disabled") !== "true";
  });
  const [gmailOAuthOn, setGmailOAuthOn] = useState(() => {
    return localStorage.getItem("gmail_connected_state") === "true";
  });
  
  const handleToggleEmailSystem = (val: boolean) => {
    setEmailSystemOn(val);
    if (val) {
      localStorage.removeItem("email_system_disabled");
    } else {
      localStorage.setItem("email_system_disabled", "true");
    }
  };

  const handleToggleGmailOAuth = (val: boolean) => {
    setGmailOAuthOn(val);
    if (val) {
      localStorage.setItem("gmail_connected_state", "true");
    } else {
      localStorage.removeItem("gmail_connected_state");
    }
  };
  const [isLoading, setIsLoading] = useState(true);
  const [replyInput, setReplyInput] = useState<{ [key: string]: string }>({});
  const [isReplying, setIsReplying] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isUserDeletingId, setIsUserDeletingId] = useState<string | null>(null);
  const [developerDeleteError, setDeveloperDeleteError] = useState<string>('');
  const [adminPurgeQuery, setAdminPurgeQuery] = useState('onwoo');
  const [isGlobalPurging, setIsGlobalPurging] = useState(false);
  const [adminPurgeSuccess, setAdminPurgeSuccess] = useState('');

  // Primary developer list
  const AUTHORIZED_DEVS = (import.meta.env.VITE_DEVELOPER_EMAILS || '').split(',').map((e: string) => e.trim());

  useEffect(() => {
    loadData();
    loadPendingOrgs();
  }, [isDemoMode]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (isDemoMode) {
        // Load demo feedbacks
        const demoFeedbacks = JSON.parse(localStorage.getItem('demo_feedbacks') || '[]');
        if (demoFeedbacks.length === 0) {
          const sample = [
            {
              id: 'fb_sample1',
              userEmail: 'tom.clarke@senecacollege.ca',
              userRole: 'student',
              type: 'bug',
              subject: 'Leaflet Map tile failing to render inside profile container',
              message: 'When I open my org dashboard, sometimes the background tiles of the Leaflet map stay grey until I resize my browser tab. This is quite tricky to deal with.',
              createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
              aiOverview: {
                category: 'bug',
                urgency: 'high',
                summary: 'Map tiles fail to load immediately on modal mount due to Leaflet container size change before initialization.',
                suggestedFix: 'Implement map.invalidateSize() inside a standard useEffect timeout trigger on map mount.'
              }
            },
            {
              id: 'fb_sample2',
              userEmail: 'outreach@nycharity.ca',
              userRole: 'organization',
              type: 'feature',
              subject: 'Needs a certificate generation option for school credit',
              message: 'Adding a feature where we can click a single button to auto-generate a completion certificate PDF containing student hours would save us several hours of administrative work.',
              createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
              aiOverview: {
                category: 'feature',
                urgency: 'medium',
                summary: 'Organization requests automatic PDF certificate generating widget to streamline proof-of-completion signatures.',
                suggestedFix: 'Integrate jsPDF package on frontend to generate custom PDF certificates from application details on high-school templates.'
              }
            }
          ];
          localStorage.setItem('demo_feedbacks', JSON.stringify(sample));
          setFeedbacks(sample);
          setRealFeedbackCount(sample.length);
        } else {
          setFeedbacks(demoFeedbacks);
          setRealFeedbackCount(demoFeedbacks.length);
        }

        // Demo fallback students and orgs
        const sampleStudents = [
          { uid: 'student_1', fullName: 'Armin Karimi', email: 'armin.k@yorkschool.ca', school: 'York Mills Collegiate', grade: '11', neighborhood: 'York Mills', isBanned: false },
          { uid: 'student_2', fullName: 'Sarah Jenkins', email: 's.jenkins@willowdale.ca', school: 'Earl Haig Secondary', grade: '12', neighborhood: 'Willowdale', isBanned: false }
        ];
        const sampleOrgs = [
          { uid: 'org_1', organizationName: 'North York Food Share', contactEmail: 'outreach@nyfoodshare.ca', isBanned: false, organizationType: 'Registered Charity', address: '1700 Sheppard Ave E, North York' },
          { uid: 'org_2', organizationName: 'Yonge Athletics Club', contactEmail: 'info@yongeathletics.ca', isBanned: false, organizationType: 'Sports / Recreational Club', address: '3900 Yonge St, Toronto' }
        ];

        setStudents(sampleStudents);
        setOrgs(sampleOrgs);
        setRealStudentCount(sampleStudents.length);
        setRealOrgCount(sampleOrgs.length);

        // Load demo safety reports
        const demoReports = JSON.parse(localStorage.getItem('demo_reports') || '[]');
        setReports(demoReports);
        setRealReportCount(demoReports.length);

      } else {
        // Fetch from real Firestore
        let fbList: any[] = [];
        try {
          const fbSnap = await getDocs(collection(db, 'feedbacks'));
          fbList = fbSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (dbErr) {
          console.warn('Real Firestore feedbacks fetch failed, using local fallback:', dbErr);
        }

        // Merge with local feedback storage to ensure everything actually works even if DB rules/indices are slow or fail
        const localFeedbacks = JSON.parse(localStorage.getItem('demo_feedbacks') || '[]');
        const combined = [...fbList, ...localFeedbacks];
        const uniqueFeedbacks = combined.filter((item, index, self) =>
          self.findIndex(t => t.id === item.id) === index
        );

        uniqueFeedbacks.sort((a: any, b: any) => {
          const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
          const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
          return tB - tA;
        });

        setFeedbacks(uniqueFeedbacks);
        setRealFeedbackCount(uniqueFeedbacks.length);

        // Fetch safety reports
        let repList: any[] = [];
        try {
          const repSnap = await getDocs(collection(db, 'reports'));
          repList = repSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (dbErr) {
          console.warn('Real Firestore reports fetch failed:', dbErr);
        }
        const localReports = JSON.parse(localStorage.getItem('demo_reports') || '[]');
        const combinedReps = [...repList, ...localReports];
        const uniqueReports = combinedReps.filter((item, index, self) =>
          self.findIndex(t => t.id === item.id) === index
        );
        uniqueReports.sort((a: any, b: any) => {
          const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
          const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
          return tB - tA;
        });
        setReports(uniqueReports);
        setRealReportCount(uniqueReports.length);

        const studentSnap = await getDocs(collection(db, 'students'));
        const studentList = studentSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        setStudents(studentList);
        setRealStudentCount(studentList.length);

        const orgSnap = await getDocs(collection(db, 'organizations'));
        const orgList = orgSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        setOrgs(orgList);
        setRealOrgCount(orgList.length);
      }
    } catch (err) {
      console.error('Failed to load developer admin dashboard lists:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Org Verification Queue ──
  const loadPendingOrgs = async () => {
    if (isDemoMode) {
      setPendingOrgs([
        { uid: 'demo-org-pending-1', organizationName: 'North York Youth Arts', craNumber: '119219814RR0001', contactEmail: 'arts@nyyouth.ca', verificationStatus: 'pending', address: '100 Sheppard Ave W' },
        { uid: 'demo-org-pending-2', organizationName: 'Willowdale Food Bank', craNumber: '118833011RR0001', contactEmail: 'hello@wfoodbank.ca', verificationStatus: 'pending', address: '5000 Yonge St' },
      ]);
      return;
    }
    try {
      const q = query(collection(db, 'organizations'), where('verificationStatus', '==', 'pending'));
      const snap = await getDocs(q);
      setPendingOrgs(snap.docs.map(d => ({ ...d.data(), uid: d.id } as any)));
    } catch (err) {
      console.error('Failed to load pending orgs:', err);
    }
  };

  const handleVerifyOrg = async (orgUid: string, decision: 'verified' | 'rejected') => {
    setVerifyingId(orgUid);
    try {
      if (isDemoMode) {
        setPendingOrgs(prev => prev.filter(o => o.uid !== orgUid));
        setVerifyingId(null);
        return;
      }
      await updateDoc(doc(db, 'organizations', orgUid), {
        verificationStatus: decision,
        craVerified: decision === 'verified',
        verifiedAt: serverTimestamp(),
        verifiedBy: user?.email || 'developer',
      });
      setPendingOrgs(prev => prev.filter(o => o.uid !== orgUid));
    } catch (err: any) {
      console.error('Verify org failed:', err);
      setDeveloperDeleteError(`Failed to ${decision === 'verified' ? 'approve' : 'reject'} organization: ${err?.message || err}`);
    } finally {
      setVerifyingId(null);
    }
  };

  // BAN & UNBAN Control
  const handleToggleBan = async (userId: string, isCurrentlyBanned: boolean) => {
    if (!AUTHORIZED_DEVS.includes(user?.email || '') && !isDemoMode) {
      alert('Access Denied: You do not have permission to perform this action.');
      return;
    }

    try {
      if (isDemoMode) {
        // Prevent banning developer in demo mode
        const targetStudentEmail = students.find(s => s.uid === userId)?.email || '';
        const targetOrgEmail = orgs.find(o => o.uid === userId)?.contactEmail || '';
        const isTargetDev = AUTHORIZED_DEVS.includes(targetStudentEmail) || AUTHORIZED_DEVS.includes(targetOrgEmail);
        if (isTargetDev && !isCurrentlyBanned) {
          alert('Security Restriction: System developers cannot be suspended.');
          return;
        }
        setStudents(prev => prev.map(s => s.uid === userId ? { ...s, isBanned: !isCurrentlyBanned } : s));
        setOrgs(prev => prev.map(o => o.uid === userId ? { ...o, isBanned: !isCurrentlyBanned } : o));
      } else {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const uData = userDoc.data();
          if (uData.email && AUTHORIZED_DEVS.includes(uData.email)) {
            alert('Security Restriction: System developers cannot be suspended.');
            return;
          }
          await updateDoc(userRef, { isBanned: !isCurrentlyBanned });
          
          if (uData.role === 'student') {
            await updateDoc(doc(db, 'students', userId), { isBanned: !isCurrentlyBanned });
          } else if (uData.role === 'organization') {
            await updateDoc(doc(db, 'organizations', userId), { isBanned: !isCurrentlyBanned });
          }
        }
      }
      loadData();
    } catch (err) {
      console.error('Ban action write failure:', err);
    }
  };

  // PURGE MEMBER Firestore Records
  const handleDeleteUser = async (userId: string, role: 'student' | 'organization') => {
    if (!AUTHORIZED_DEVS.includes(user?.email || '') && !isDemoMode) {
      setDeveloperDeleteError('Access Denied: You do not have permission to execute administrative deletes.');
      return;
    }

    setIsUserDeletingId(userId);
    setDeveloperDeleteError('');
    try {
      if (isDemoMode) {
        setStudents(prev => prev.filter(s => s.uid !== userId));
        setOrgs(prev => prev.filter(o => o.uid !== userId));
      } else {
        await deleteDoc(doc(db, 'users', userId));
        if (role === 'student') {
          await deleteDoc(doc(db, 'students', userId));
        } else if (role === 'organization') {
          await deleteDoc(doc(db, 'organizations', userId));
        }
      }
      setDeleteTargetId(null);
      loadData();
    } catch (err: any) {
      console.error('purging user documents write failure:', err);
      setDeveloperDeleteError(`Purge failed: ${err.message || err}`);
    } finally {
      setIsUserDeletingId(null);
    }
  };

  // GLOBAL SCANNED PURGE FOR 'onwoo' OR TRACES
  const handleGlobalPurgeOnwoo = async () => {
    if (!AUTHORIZED_DEVS.includes(user?.email || '') && !isDemoMode) {
      setDeveloperDeleteError('Access Denied: You do not have permission to execute global purges.');
      return;
    }
    const target = adminPurgeQuery.trim().toLowerCase();
    if (!target) {
      setDeveloperDeleteError('Please specify a target query to scan and purge.');
      return;
    }
    setIsGlobalPurging(true);
    setDeveloperDeleteError('');
    setAdminPurgeSuccess('');

    try {
      let matchCount = 0;
      if (isDemoMode) {
        setStudents(prev => {
          const filtered = prev.filter(s => {
            const match = (s.fullName?.toLowerCase().includes(target) || s.school?.toLowerCase().includes(target) || s.uid.includes(target));
            if (match) matchCount++;
            return !match;
          });
          return filtered;
        });
        setOrgs(prev => {
          const filtered = prev.filter(o => {
            const match = (o.organizationName?.toLowerCase().includes(target) || o.contactEmail?.toLowerCase().includes(target) || o.uid.includes(target));
            if (match) matchCount++;
            return !match;
          });
          return filtered;
        });
      } else {
        const scanAndPurgeCollection = async (col: 'students' | 'organizations') => {
          const snap = await getDocs(collection(db, col));
          for (const docSnap of snap.docs) {
            const data = docSnap.data();
            const strVal = JSON.stringify(data).toLowerCase();
            const idVal = docSnap.id.toLowerCase();
            if (strVal.includes(target) || idVal.includes(target)) {
              await deleteDoc(doc(db, col, docSnap.id));
              try {
                await deleteDoc(doc(db, 'users', docSnap.id));
              } catch (_) {}
              matchCount++;
            }
          }
        };

        await scanAndPurgeCollection('students');
        await scanAndPurgeCollection('organizations');
      }

      setAdminPurgeSuccess(`Administrative Cleanup Complete! Found and permanently purged ${matchCount} records matching "${target}".`);
      loadData();
    } catch (err: any) {
      console.error('Global purge failure:', err);
      setDeveloperDeleteError(`Global purge failed: ${err.message || err}`);
    } finally {
      setIsGlobalPurging(false);
    }
  };

  // DEVELOPER REPLY SUBMISSION
  const handleSendReply = async (fbId: string) => {
    const textReply = replyInput[fbId];
    if (!textReply || !textReply.trim()) return;

    setIsReplying(fbId);
    try {
      // Always cache developer reply locally to ensure seamless responsiveness
      const demoFeedbacks = JSON.parse(localStorage.getItem('demo_feedbacks') || '[]');
      const updated = demoFeedbacks.map((item: any) => {
        if (item.id === fbId) {
          return {
            ...item,
            developerReply: textReply,
            repliedAt: new Date().toISOString()
          };
        }
        return item;
      });
      localStorage.setItem('demo_feedbacks', JSON.stringify(updated));

      if (isDemoMode) {
        setFeedbacks(updated);
      } else {
        try {
          await updateDoc(doc(db, 'feedbacks', fbId), {
            developerReply: textReply,
            repliedAt: new Date().toISOString()
          });
        } catch (dbErr) {
          console.warn('Real Firestore reply write failed, updated local fallback storage:', dbErr);
        }
      }
      setReplyInput(prev => ({ ...prev, [fbId]: '' }));
      loadData();
    } catch (err) {
      console.error('Developer reply failed to record:', err);
    } finally {
      setIsReplying(null);
    }
  };

  const handleUpdateReportStatus = async (reportId: string, newStatus: 'resolved' | 'dismissed') => {
    try {
      const localReports = JSON.parse(localStorage.getItem('demo_reports') || '[]');
      const updated = localReports.map((r: any) => r.id === reportId ? { ...r, status: newStatus } : r);
      localStorage.setItem('demo_reports', JSON.stringify(updated));

      if (isDemoMode) {
        setReports(updated);
      } else {
        try {
          await updateDoc(doc(db, 'reports', reportId), { status: newStatus });
        } catch (dbErr) {
          console.warn('Real Firestore report update failed, using local fallback:', dbErr);
        }
      }
      loadData();
    } catch (err) {
      console.error('Failed to change report status:', err);
    }
  };

  const filteredFeedbacks = feedbacks.filter(fb => {
    const matchesFilter = filterType === 'all' || fb.type === filterType;
    const matchesSearch = 
      fb.subject?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      fb.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fb.userEmail?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (!isDemoMode && user && !AUTHORIZED_DEVS.includes(user.email || '')) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-slate-50 p-6 text-center">
        <Card className="max-w-md p-8 border-slate-200 border space-y-4  bg-white rounded-sm">
          <ShieldAlert className="text-red-500 w-12 h-12 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Access Denied</h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            You do not have administrative permissions to view this page. Accessing this dashboard requires logging in with an authorized administrator developer account (<span className="font-mono text-xs px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded text-slate-600">{user.email}</span>).
          </p>
          <div className="pt-2 flex justify-center">
            <Button variant="outline" className="text-xs uppercase font-black" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // INTRO SETUP WITH "CREATE" BUTTON
  if (!isDashboardActive) {
    return (
      <div className="min-h-[calc(100vh-140px)] flex flex-col items-center justify-center py-16 px-4 bg-slate-50">
        <Card className="w-full max-w-xl mx-auto p-10 border border-slate-100  shadow-slate-200/60 rounded-sm bg-white text-center space-y-8 animate-fadeIn relative overflow-hidden">
          {/* Accent decoration */}
          <div className="absolute top-0 left-0 right-0 h-2    " />
          
          <div className="space-y-3">
            <div className="w-16 h-16 bg-[#1F4C63]/5 border border-[#1F4C63]/10 text-[#1F4C63] rounded-sm flex items-center justify-center mx-auto ">
              <Lock className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight font-sans">
              Control Room
            </h1>
            <p className="text-slate-600 font-extrabold text-[10px] uppercase tracking-wider">
              York Region Administrative Command Centre
            </p>
            <p className="text-slate-600 text-xs max-w-sm mx-auto leading-relaxed font-semibold">
              Deploy the administrative dashboard to verify logged hours, ban/unban users, audit submissions, and run real-time support reviews.
            </p>
          </div>

          <div className="bg-slate-50 rounded-sm p-6 text-left border border-slate-100 space-y-3">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-2">
              <Compass className="w-4 h-4 text-[#E08A3C]" /> Key Privileges Includes:
            </h4>
            <ul className="text-[11px] text-slate-600 space-y-2 font-medium">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-[#1F4C63] rounded-sm" /> Click counters to drill down and retrieve real live data
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-[#1F4C63] rounded-sm" /> Live feedback processing with Gemini AI diagnostics
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-[#1F4C63] rounded-sm" /> One-click banning of violator organizations or students
              </li>
            </ul>
          </div>

          <div>
            <Button 
              onClick={() => setIsDashboardActive(true)}
              className="w-full h-14 rounded-sm font-black uppercase tracking-wider text-xs bg-slate-900 text-white hover:bg-slate-800  flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" /> Create Control Room Dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // MAIN RUNNING CONTROL ROOM
  return (
    <div className="max-w-7xl mx-auto py-12 px-4 space-y-8 animate-fadeIn">
      {/* Header info bar */}
      <div className="bg-slate-900 text-white rounded-sm p-8 md:p-12  relative overflow-hidden flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-3 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm bg-[#1F4C63]/20 text-blue-400 border border-[#1F4C63]/30 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" /> Administrator Verified
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight uppercase">Control Room</h1>
          <p className="text-slate-600 font-semibold text-xs max-w-md">
            Administrative panel. Click any of the zero metrics below to load all corresponding live data entries and reports.
          </p>
        </div>

        {/* Stats HUD Block with Drill-down Action */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6 relative z-10 w-full md:w-auto shrink-0 select-hud">
          {/* Students counter */}
          <div 
            onClick={() => {
              setShowStudentsList(true);
              setActiveTab('users');
            }}
            className={cn(
              "border rounded-sm p-4 text-center cursor-pointer transition-all duration-300 hover:scale-[1.03] select-students-metric",
              showStudentsList 
                ? "bg-[#1F4C63] border-[#1F4C63] text-white  shadow-blue-500/20" 
                : "bg-white/5 border-white/5 text-white hover:bg-white/10"
            )}
          >
            <Users className={cn("w-5 h-5 mx-auto mb-1.5", showStudentsList ? "text-white animate-bounce" : "text-blue-400")} />
            <span className="block text-2xl font-black">{showStudentsList ? realStudentCount : 0}</span>
            <span className="text-[9px] uppercase font-black tracking-widest block opacity-70">STUDENTS</span>
            {!showStudentsList && <span className="text-[7px] text-blue-300 font-extrabold uppercase tracking-wide block mt-1">Click to Load</span>}
          </div>

          {/* Orgs counter */}
          <div 
            onClick={() => {
              setShowOrgsList(true);
              setActiveTab('users');
            }}
            className={cn(
              "border rounded-sm p-4 text-center cursor-pointer transition-all duration-300 hover:scale-[1.03] select-orgs-metric",
              showOrgsList 
                ? "bg-[#1F4C63] border-[#1F4C63] text-white  shadow-blue-500/20" 
                : "bg-white/5 border-white/5 text-white hover:bg-white/10"
            )}
          >
            <Building2 className={cn("w-5 h-5 mx-auto mb-1.5", showOrgsList ? "text-white animate-pulse" : "text-blue-400")} />
            <span className="block text-2xl font-black">{showOrgsList ? realOrgCount : 0}</span>
            <span className="text-[9px] uppercase font-black tracking-widest block opacity-70">ORGS</span>
            {!showOrgsList && <span className="text-[7px] text-blue-300 font-extrabold uppercase tracking-wide block mt-1">Click to Load</span>}
          </div>

          {/* Reports counter */}
          <div 
            onClick={() => {
              setShowReportsList(true);
              setActiveTab('reports');
            }}
            className={cn(
              "border rounded-sm p-4 text-center cursor-pointer transition-all duration-300 hover:scale-[1.03] select-reports-metric",
              showReportsList && activeTab === 'reports'
                ? "bg-red-600 border-red-500 text-white  shadow-red-500/20" 
                : "bg-white/5 border-white/5 text-white hover:bg-white/10"
            )}
          >
            <ShieldAlert className={cn("w-5 h-5 mx-auto mb-1.5 animate-pulse", showReportsList && activeTab === 'reports' ? "text-white animate-bounce" : "text-red-400")} />
            <span className="block text-2xl font-black">{reports.length}</span>
            <span className="text-[9px] uppercase font-black tracking-widest block opacity-70">REPORTS</span>
            {(!showReportsList || activeTab !== 'reports') && <span className="text-[7px] text-red-300 font-extrabold uppercase tracking-wide block mt-1">Click to Load</span>}
          </div>
        </div>

        <div className="absolute -bottom-24 -left-20 w-80 h-80 bg-[#1F4C63]/10 rounded-sm blur-3xl -z-5 animate-pulse" />
      </div>

      {/* Primary tab bar controls */}
      <div className="border-b border-slate-200 overflow-x-auto scrollbar-none">
        <div className="flex min-w-max pb-1">
          <button
            onClick={() => setActiveTab('feedbacks')}
            className={cn(
              "pb-4 px-6 text-sm font-black uppercase tracking-wider border-b-4 transition-all flex items-center gap-2",
              activeTab === 'feedbacks' ? "border-[#1F4C63] text-slate-900" : "border-transparent text-slate-600 hover:text-slate-600"
            )}
          >
            <MessageSquare className="w-4 h-4" /> Feedback Tickets ({feedbacks.length})
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={cn(
              "pb-4 px-6 text-sm font-black uppercase tracking-wider border-b-4 transition-all flex items-center gap-2",
              activeTab === 'reports' ? "border-red-600 text-red-600" : "border-transparent text-slate-600 hover:text-slate-600"
            )}
          >
            <ShieldAlert className="w-4 h-4 text-red-500 animate-pulse" /> Safety Reports ({reports.length})
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={cn(
              "pb-4 px-6 text-sm font-black uppercase tracking-wider border-b-4 transition-all flex items-center gap-2",
              activeTab === 'users' ? "border-[#1F4C63] text-slate-900" : "border-transparent text-slate-600 hover:text-slate-600"
            )}
          >
            <XOctagon className="w-4 h-4" /> User Base Audit
          </button>
          <button
            onClick={() => setActiveTab('terminated')}
            className={cn(
              "pb-4 px-6 text-sm font-black uppercase tracking-wider border-b-4 transition-all flex items-center gap-2",
              activeTab === 'terminated' ? "border-red-500 text-red-600" : "border-transparent text-slate-600 hover:text-slate-600"
            )}
          >
            <Lock className="w-4 h-4 text-red-500" /> Suspended List ({students.filter(s => s.isBanned).length + orgs.filter(o => o.isBanned).length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={cn(
              "pb-4 px-6 text-sm font-black uppercase tracking-wider border-b-4 transition-all flex items-center gap-2",
              activeTab === 'settings' ? "border-[#1F4C63] text-slate-900" : "border-transparent text-slate-600 hover:text-slate-600"
            )}
          >
            <Settings className="w-4 h-4 text-[#1F4C63]" /> System Settings
          </button>
          <button
            onClick={() => setActiveTab('verification')}
            className={cn(
              "pb-4 px-6 text-sm font-black uppercase tracking-wider border-b-4 transition-all flex items-center gap-2",
              activeTab === 'verification' ? "border-[#1F4C63] text-slate-900" : "border-transparent text-slate-600 hover:text-slate-600"
            )}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> Verify Orgs {pendingOrgs.length > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{pendingOrgs.length}</span>}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[#1F4C63]/30 border-t-blue-600 rounded-sm animate-spin mx-auto" />
          <p className="text-xs font-black uppercase text-slate-600 tracking-widest animate-pulse">Retrieving system registries...</p>
        </div>
      ) : activeTab === 'feedbacks' ? (
        <div className="space-y-6">
          {/* Feedbacks filtering & query bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pb-4 border-b border-slate-100">
            <div className="relative w-full sm:max-w-md">
              <input
                type="text"
                placeholder="Search ticket subjects, contents, or user emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 rounded-sm border border-slate-200 text-xs focus:ring-2 focus:ring-[#1F4C63] font-semibold"
              />
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-end">
              <Filter className="w-4 h-4 text-slate-600 shrink-0" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="rounded-sm border border-slate-200 py-2.5 px-4 text-xs font-bold leading-tight bg-white cursor-pointer"
              >
                <option value="all">All Feedback</option>
                <option value="bug">Bugs Only</option>
                <option value="feature">Features Only</option>
                <option value="ux">UX Ideas Only</option>
                <option value="other">Other Tickets</option>
              </select>
            </div>
          </div>

          {/* Feedbacks Render queue */}
          {!showReportsList ? (
            <Card className="p-12 text-center rounded-sm border border-slate-100 bg-white space-y-4">
              <Lock className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-base font-extrabold text-slate-900 uppercase">Support Tickets Log Locked</h3>
              <p className="text-slate-600 text-xs font-medium max-w-sm mx-auto leading-relaxed">
                Initially showing 0 reports. Click the high-contrast **REPORTS** metric block above to retrieve all the pending feedback submissions and active reviews.
              </p>
              <Button 
                onClick={() => setShowReportsList(true)}
                className="text-xs font-black uppercase tracking-wider"
              >
                Unlock Reports Queue
              </Button>
            </Card>
          ) : filteredFeedbacks.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 border border-slate-200 rounded-sm text-slate-600 font-semibold text-xs leading-relaxed uppercase tracking-wider">
              All clear! No pending support logs found matching search filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {filteredFeedbacks.map((fb) => (
                <Card key={fb.id} className="rounded-sm border border-slate-200  bg-white overflow-hidden relative animate-fadeIn">
                  <div className="absolute top-0 left-0 w-2 h-full bg-[#1F4C63]" />
                  
                  <CardContent className="p-6 md:p-8 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className={`inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                            fb.type === 'bug' ? 'bg-red-50 text-red-600 border border-red-100' :
                            fb.type === 'feature' ? 'bg-[#1F4C63]/5 text-[#1F4C63] border border-[#1F4C63]/10' :
                            'bg-[#1F4C63]/5 text-[#1F4C63] border border-[#1F4C63]/10'
                          }`}>
                            {fb.type || 'SUPPORT'}
                          </span>
                          <span className="text-xs text-slate-600 font-semibold font-mono">ID: {fb.id}</span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 leading-tight">{fb.subject}</h3>
                        <p className="text-xs text-slate-600 font-semibold font-mono text-slate-600">
                          Sender: {fb.userEmail} ({fb.userRole})
                        </p>
                      </div>
                      
                      <div className="text-slate-600 text-xs font-semibold self-end md:self-start shrink-0 font-mono">
                        {fb.createdAt ? new Date(fb.createdAt.seconds ? fb.createdAt.seconds * 1000 : fb.createdAt).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>

                    <p className="text-slate-600 text-xs leading-relaxed font-semibold bg-slate-50 p-4 border border-slate-100 rounded-sm italic leading-relaxed">
                      "{fb.message}"
                    </p>

                    {/* Display file attachment if present */}
                    {fb.attachmentName && (
                      <div className="bg-slate-50 border border-slate-200/80 rounded-sm p-4 text-xs space-y-3 animate-fadeIn font-semibold">
                        <div className="flex items-center gap-2 text-slate-800">
                          <Paperclip className="w-4 h-4 text-[#1F4C63]" />
                          <span>Attached screenshot/document: <strong className="font-extrabold text-[#FF6B35]">{fb.attachmentName}</strong> ({fb.attachmentSize || 'Unknown size'})</span>
                        </div>
                        {fb.attachmentDescription && (
                          <div className="pl-6 border-l-2 border-slate-300 italic text-slate-600">
                            "File Context/Description: {fb.attachmentDescription}"
                          </div>
                        )}
                        {fb.attachmentData && (
                          <div className="mt-2 p-3 bg-white border border-slate-100 rounded-sm overflow-hidden max-w-md ">
                            <p className="text-[10px] font-black uppercase text-slate-600 font-mono tracking-wider mb-2">Screenshot Preview (Click to download):</p>
                            {decompressFile(fb.attachmentData).startsWith('data:image/') ? (
                              <img 
                                src={decompressFile(fb.attachmentData)} 
                                alt={fb.attachmentName} 
                                loading="lazy" width="800" height="600"
                                className="w-full aspect-video max-h-72 object-contain rounded-sm hover:scale-[1.02] transition-transform duration-300  border border-slate-200/60 cursor-pointer mx-auto"
                                onClick={() => {
                                  const link = document.createElement('a');
                                  link.href = decompressFile(fb.attachmentData!);
                                  link.download = fb.attachmentName || 'screenshot';
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                }}
                              />
                            ) : decompressFile(fb.attachmentData).startsWith('data:application/pdf') ? (
                              <div className="space-y-2">
                                <iframe 
                                  src={decompressFile(fb.attachmentData)} 
                                  className="w-full h-64 rounded-sm border border-slate-200 bg-slate-50"
                                />
                                <a aria-label="Download attachment" 
                                  href={decompressFile(fb.attachmentData)}
                                  download={fb.attachmentName}
                                  className="text-xs font-black text-[#1F4C63] hover:text-[#153343] hover:underline block"
                                >
                                  Download PDF Attachment
                                </a>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <span className="text-slate-600 font-medium">Binary document format attachment.</span>
                                <a aria-label="Download attachment" 
                                  href={decompressFile(fb.attachmentData)} 
                                  download={fb.attachmentName}
                                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 rounded-sm text-slate-800 font-extrabold text-xs inline-flex items-center gap-1.5 w-fit"
                                >
                                  Download File ({fb.attachmentName})
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Gemini AI Overview annotation frame */}
                    {fb.aiOverview && (
                      <div className="border border-orange-100 bg-[#E08A3C]/10/15 p-5 rounded-sm space-y-3 relative overflow-hidden animate-fadeIn">
                        <div className="flex items-center gap-2 text-orange-900 border-b border-orange-100/40 pb-2">
                          <Sparkles className="w-4 h-4 text-[#E08A3C]" />
                          <span className="text-[10px] uppercase tracking-widest font-black">AI Overview Analysis</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold leading-relaxed">
                          <div className="space-y-1">
                            <span className="text-[10px] text-orange-900/45 uppercase tracking-widest block font-bold">AI urgency prediction</span>
                            <span className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                              fb.aiOverview.urgency === 'critical' || fb.aiOverview.urgency === 'high'
                                ? 'bg-red-500/10 text-red-600 border border-red-200'
                                : 'bg-[#E08A3C]/10 text-[#E08A3C] border border-[#E08A3C]/20'
                            }`}>
                              {fb.aiOverview.urgency || 'MEDIUM'}
                            </span>
                          </div>
                          
                          <div className="space-y-1 md:col-span-2">
                            <span className="text-[10px] text-orange-900/45 uppercase tracking-widest block font-bold">Issue synopsis</span>
                            <p className="text-slate-800 font-bold leading-relaxed">{fb.aiOverview.summary}</p>
                          </div>
                          
                          {fb.aiOverview.suggestedFix && (
                            <div className="space-y-1 md:col-span-2 bg-[#E08A3C]/5 p-4 border border-orange-100 rounded-sm">
                              <span className="text-[10px] text-[#E08A3C] uppercase tracking-widest block font-black">suggested resolve tip</span>
                              <p className="text-orange-950 font-mono text-[10.5px] leading-relaxed italic">
                                {fb.aiOverview.suggestedFix}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Developer Response reply block */}
                    {fb.developerReply ? (
                      <div className="border border-[#1F4C63]/20 bg-[#1F4C63]/5 p-5 rounded-sm space-y-2 animate-fadeIn">
                        <div className="flex items-center gap-2 text-[#0F1E29]">
                          <CheckCircle2 className="w-4 h-4 text-[#1F4C63] animate-bounce" />
                          <span className="text-[10px] uppercase tracking-widest font-black">Logged Developer Response</span>
                        </div>
                        <p className="text-xs text-[#1F4C63] font-bold">
                          "{fb.developerReply}"
                        </p>
                        <span className="block text-[9px] text-slate-600 font-mono font-semibold">
                          LOGGED: {new Date(fb.repliedAt).toLocaleString()}
                        </span>
                      </div>
                    ) : (
                      <div className="pt-2">
                        <div className="flex gap-2 relative">
                          <input
                            type="text"
                            placeholder="Type response reply to tickets..."
                            value={replyInput[fb.id] || ''}
                            onChange={(e) => setReplyInput(prev => ({ ...prev, [fb.id]: e.target.value }))}
                            className="flex-1 rounded-sm border border-slate-200 px-4 py-3 text-xs focus:ring-2 focus:ring-[#1F4C63] font-semibold"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSendReply(fb.id);
                            }}
                          />
                          <Button 
                            className="rounded-sm px-5 text-xs font-black uppercase tracking-wider" 
                            onClick={() => handleSendReply(fb.id)}
                            isLoading={isReplying === fb.id}
                          >
                            <Reply className="w-4 h-4 mr-2" /> Reply
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'reports' ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500 animate-pulse" /> Inbound Violations Queue
              </h2>
              <p className="text-xs text-slate-600 font-semibold mt-1">
                Review and act on reported safe space violations from our students and organizations.
              </p>
            </div>
          </div>

          {reports.length === 0 ? (
            <Card className="p-16 text-center border-2 border-dashed border-slate-100 rounded-sm bg-white space-y-4">
              <ShieldCheck className="w-12 h-12 text-[#1F4C63] mx-auto animate-bounce" />
              <h3 className="text-base font-extrabold text-slate-900 uppercase">Secure Safe Space Guaranteed</h3>
              <p className="text-slate-600 text-xs font-semibold max-w-sm mx-auto leading-relaxed">
                Zero safety reports or violations submitted in the system. The volunteering network remains highly secure.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {reports.map((report) => {
                const statusBadge = report.status === 'resolved' 
                  ? 'bg-[#1F4C63]/5 text-[#1F4C63] border-[#1F4C63]/10' 
                  : report.status === 'dismissed'
                    ? 'bg-slate-50 text-slate-600 border-slate-200'
                    : 'bg-red-50 text-red-600 border-red-100 animate-pulse';

                const isUserBanned = report.reportedUserRole === 'student'
                  ? students.find(s => s.uid === report.reportedUserId)?.isBanned || false
                  : orgs.find(o => o.uid === report.reportedUserId)?.isBanned || false;

                return (
                  <Card key={report.id} className="rounded-sm border border-red-100  bg-white overflow-hidden relative animate-fadeIn">
                    <div className="absolute top-0 left-0 w-2 h-full bg-red-500" />
                    <CardContent className="p-6 md:p-8 space-y-6">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="text-[9px] font-black uppercase text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" /> Safe Space Report
                            </span>
                            <span className={`inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${statusBadge}`}>
                              {report.status?.toUpperCase() || 'PENDING'}
                            </span>
                            <span className="text-xs text-slate-600 font-semibold font-mono">REPORT ID: {report.id}</span>
                          </div>
                          
                          <h3 className="text-lg font-bold text-slate-900 leading-tight">Reason: {report.reason}</h3>
                          
                          <div className="bg-slate-50 p-4 border border-slate-100 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs font-semibold text-slate-600">
                            <div>
                              <span className="text-[10px] text-slate-600 uppercase tracking-widest block font-extrabold text-slate-600">Reporter (Initiator)</span>
                              <p className="text-slate-800 font-black">{report.reportingUserName || 'User'}</p>
                              <p className="text-[10px] font-mono font-medium text-slate-600">{report.reportingUserEmail || 'N/A'}</p>
                            </div>
                            <div className="hidden md:block text-slate-600">→</div>
                            <div>
                              <span className="text-[10px] text-slate-600 uppercase tracking-widest block font-extrabold text-slate-600">Reported Target User</span>
                              <span className="text-red-500 text-[10px] uppercase font-bold mr-1">[{report.reportedUserRole}]</span>
                              <span className="text-slate-800 font-black">{report.reportedUserName}</span>
                              <p className="text-[10px] font-mono font-medium text-slate-600">UID: {report.reportedUserId}</p>
                            </div>
                          </div>
                        </div>

                        <div className="text-slate-600 text-xs font-semibold shrink-0 font-mono">
                          {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : 'N/A'}
                        </div>
                      </div>

                      <div className="prose">
                        <span className="text-[10px] text-slate-600 uppercase tracking-widest block font-extrabold">Description of Violation</span>
                        <p className="text-slate-600 text-xs leading-relaxed font-semibold bg-rose-50/10 p-4 border border-red-50 rounded-sm italic">
                          "{report.description}"
                        </p>
                      </div>

                      {/* Display file attachment if present */}
                      {report.attachmentName && (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-sm p-4 text-xs space-y-3 animate-fadeIn font-semibold">
                          <div className="flex items-center gap-2 text-slate-800">
                            <Paperclip className="w-4 h-4 text-red-500" />
                            <span>Attached Safe Space Proof/Screenshot: <strong className="font-extrabold text-[#FF6B35]">{report.attachmentName}</strong> ({report.attachmentSize || 'Unknown size'})</span>
                          </div>
                          {report.attachmentDescription && (
                            <div className="pl-6 border-l-2 border-slate-300 italic text-slate-600">
                              "Attachment Description: {report.attachmentDescription}"
                            </div>
                          )}
                          {report.attachmentData && (
                            <div className="mt-2 p-3 bg-white border border-slate-200 rounded-sm overflow-hidden max-w-md ">
                              <p className="text-[10px] font-black uppercase text-slate-600 font-mono tracking-wider mb-2">Screenshot Preview (Click to download):</p>
                              {decompressFile(report.attachmentData).startsWith('data:image/') ? (
                                <img 
                                  src={decompressFile(report.attachmentData)} 
                                  alt={report.attachmentName} 
                                  loading="lazy" width="800" height="600"
                                  className="w-full aspect-video max-h-72 object-contain rounded-sm hover:scale-[1.02] transition-transform duration-300  border border-slate-300 cursor-pointer mx-auto"
                                  onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = decompressFile(report.attachmentData!);
                                    link.download = report.attachmentName || 'report_attachment';
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  }}
                                />
                              ) : decompressFile(report.attachmentData).startsWith('data:application/pdf') ? (
                                <div className="space-y-2">
                                  <iframe 
                                    src={decompressFile(report.attachmentData)} 
                                    className="w-full h-64 rounded-sm border border-slate-200 bg-slate-50"
                                  />
                                  <a aria-label="Download attachment" 
                                    href={decompressFile(report.attachmentData)}
                                    download={report.attachmentName}
                                    className="text-xs font-black text-rose-600 hover:text-rose-700 hover:underline block"
                                  >
                                    Download Proof PDF Attachment
                                  </a>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  <span className="text-slate-600 font-medium">Binary document format attachment.</span>
                                  <a aria-label="Download attachment" 
                                    href={decompressFile(report.attachmentData)} 
                                    download={report.attachmentName}
                                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-300 rounded-sm text-slate-800 font-extrabold text-xs inline-flex items-center gap-1.5 w-fit"
                                  >
                                    Download File ({report.attachmentName})
                                  </a>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Gemini AI Violation audit Frame */}
                      {report.aiOverview && (
                        <div className="border border-red-100 bg-red-50/5 p-5 rounded-sm space-y-3 relative overflow-hidden animate-fadeIn">
                          <div className="flex items-center gap-2 text-red-950 border-b border-red-100/40 pb-2">
                            <Sparkles className="w-4 h-4 text-red-500" />
                            <span className="text-[10px] uppercase tracking-widest font-black text-slate-800">AI Trust & Safety Analysis</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold leading-relaxed">
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-600 uppercase tracking-widest block font-black">AI Urgency Risk Assessment</span>
                              <span className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                                report.aiOverview.urgency === 'critical' || report.aiOverview.urgency === 'high'
                                  ? 'bg-red-500/10 text-red-600 border border-red-200'
                                  : 'bg-[#1F4C63]/10 text-[#1F4C63] border border-[#1F4C63]/20'
                              }`}>
                                {report.aiOverview.urgency || 'HIGH RISK'}
                              </span>
                            </div>
                            
                            <div className="space-y-1 md:col-span-2">
                              <span className="text-[10px] text-slate-600 uppercase tracking-widest block font-black">Safety threat summary</span>
                              <p className="text-slate-800 font-bold leading-relaxed">{report.aiOverview.summary}</p>
                            </div>
                            
                            {report.aiOverview.suggestedFix && (
                              <div className="space-y-1 md:col-span-2 bg-slate-50 p-4 border border-slate-200 rounded-sm">
                                <span className="text-[10px] text-slate-600 uppercase tracking-widest block font-black">AI Safety Action recommendations</span>
                                <p className="text-slate-600 font-mono text-[10.5px] leading-relaxed italic">
                                  {report.aiOverview.suggestedFix}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Action buttons (Resolve/Dismiss & Block/Unblock offender) */}
                      <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-3 items-center justify-between">
                        <div className="flex gap-2">
                          {report.status !== 'resolved' && (
                            <Button 
                              size="sm" 
                              className="bg-[#1F4C63] hover:bg-[#0F1E29] text-white font-black uppercase text-[10px] tracking-wider"
                              onClick={() => handleUpdateReportStatus(report.id, 'resolved')}
                            >
                              Resolve Issue
                            </Button>
                          )}
                          {report.status !== 'dismissed' && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="font-black uppercase text-[10px] tracking-wider"
                              onClick={() => handleUpdateReportStatus(report.id, 'dismissed')}
                            >
                              Dismiss Report
                            </Button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {isUserBanned ? (
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-black uppercase text-red-600 bg-red-50 border border-red-100 px-3 py-1.5 rounded-sm">�,� SUSPENDED</span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="font-black uppercase text-[10px] tracking-wider"
                                onClick={() => handleToggleBan(report.reportedUserId, true)}
                              >
                                Restore User Account
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-red-50 hover:bg-red-100 border-red-100 text-red-600 font-black uppercase text-[10px] tracking-wider"
                              onClick={() => handleToggleBan(report.reportedUserId, false)}
                            >
                              LOCK/SUSPEND OFFENDER
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === 'terminated' ? (
        /* TERMINATED BASE TAB */
        <div className="space-y-6">
          <div className="bg-[#FFF5F5] border border-red-100 border-red-100 rounded-sm p-6 flex flex-col sm:flex-row items-center gap-4 relative overflow-hidden ">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-100/30 rounded-sm blur-2xl pointer-events-none" />
            <div className="w-12 h-12 rounded-sm bg-red-500 flex items-center justify-center text-white shrink-0  shadow-red-500/10">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                Account Suspension Registry
              </h2>
              <p className="text-xs text-slate-600 font-semibold mt-0.5 max-w-2xl leading-relaxed">
                York Region Trust safe-space enforcements. Lift locks on student volunteers or organization profiles to grant immediate login, posting, and action privileges.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Suspended Students */}
            <Card className="rounded-sm border border-slate-100 bg-white  shadow-slate-100/50 overflow-hidden flex flex-col animate-fadeIn">
              <CardHeader className="border-b border-red-50 bg-red-50/10 p-6 md:p-8">
                <CardTitle className="text-xs font-black text-rose-950 flex items-center gap-2 text-red-600 uppercase tracking-widest">
                  <Users className="w-4 h-4 text-red-500" /> Suspended Students ({students.filter(s => s.isBanned).length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 md:p-8 flex-1">
                {students.filter(s => s.isBanned).length === 0 ? (
                  <div className="py-12 text-center text-slate-600 space-y-3">
                    <ShieldCheck className="w-10 h-10 text-[#1F4C63] mx-auto animate-bounce" />
                    <p className="text-xs font-black uppercase tracking-wider text-slate-800">No Suspended Students</p>
                    <p className="text-[10px] text-slate-600 font-medium">All students currently maintain active, good-standing credentials.</p>
                  </div>
                ) : (
                  <div className="space-y-4 divide-y divide-red-50/30">
                    {students.filter(s => s.isBanned).map((st) => (
                      <div key={st.uid} className="pt-4 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn">
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-slate-800">{st.fullName || st.name || 'Anonymous Student'}</p>
                          <p className="text-[10.5px] text-slate-600 font-mono font-medium leading-none">{st.email || 'No email registered'}</p>
                          <span className="inline-block text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200 mt-1">
                            {st.school || 'York Region'}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-[#1F4C63]/20 hover:bg-[#1F4C63]/5 hover:text-[#1F4C63] text-[#1F4C63] font-black uppercase text-[10px] tracking-wider shrink-0 "
                          onClick={() => handleToggleBan(st.uid, true)}
                        >
                          Un-terminate / Lift Lock
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Suspended Organizations */}
            <Card className="rounded-sm border border-slate-100 bg-white  shadow-slate-100/50 overflow-hidden flex flex-col animate-fadeIn">
              <CardHeader className="border-b border-red-50 bg-red-50/10 p-6 md:p-8">
                <CardTitle className="text-xs font-black text-rose-950 flex items-center gap-2 text-red-600 uppercase tracking-widest">
                  <Building2 className="w-4 h-4 text-red-500" /> Suspended Partners ({orgs.filter(o => o.isBanned).length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 md:p-8 flex-1">
                {orgs.filter(o => o.isBanned).length === 0 ? (
                  <div className="py-12 text-center text-slate-600 space-y-3">
                    <ShieldCheck className="w-10 h-10 text-[#1F4C63] mx-auto animate-bounce" />
                    <p className="text-xs font-black uppercase tracking-wider text-slate-800">No Suspended Partners</p>
                    <p className="text-[10px] text-slate-600 font-medium">All partner organizations are verified and in good standing.</p>
                  </div>
                ) : (
                  <div className="space-y-4 divide-y divide-red-200/20">
                    {orgs.filter(o => o.isBanned).map((org) => (
                      <div key={org.uid} className="pt-4 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn">
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-slate-800">{org.organizationName || 'Partner Agency'}</p>
                          <p className="text-[10.5px] text-slate-600 font-mono font-medium leading-none">{org.contactEmail || 'No contact email'}</p>
                          <span className="inline-block text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200 mt-1">
                            {org.organizationType || 'Trust Partner'}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-[#1F4C63]/20 hover:bg-[#1F4C63]/5 hover:text-[#1F4C63] text-[#1F4C63] font-black uppercase text-[10px] tracking-wider shrink-0 "
                          onClick={() => handleToggleBan(org.uid, true)}
                        >
                          Un-terminate / Lift Lock
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : activeTab === 'users' ? (
        /* USER MANAGEMENT AUDIT TAB */
        <div className="space-y-4">
          {developerDeleteError && (
            <div className="bg-red-50 border border-red-100 text-red-700 text-xs font-black p-4 rounded-sm uppercase tracking-wider">
              {developerDeleteError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* STUDENTS CONTROL BLOCK */}
          <Card className="rounded-sm border border-slate-100 bg-white  overflow-hidden flex flex-col">
            <CardHeader className="border-b border-slate-50 bg-slate-50/40 p-6 md:p-8">
              <CardTitle className="text-lg flex items-center gap-2 font-black text-slate-900">
                <Users className="w-5 h-5 text-[#1F4C63]" /> Students Audit Base
              </CardTitle>
              <p className="text-xs font-semibold text-slate-600 mt-1">
                Verify logged involvement parameters and privilege status.
              </p>
            </CardHeader>

            {!showStudentsList ? (
              <CardContent className="p-8 text-center space-y-4">
                <Lock className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs text-slate-600 font-semibold">
                  Currently showing 0 students. Click the Students metric card above to query.
                </p>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="bg-white hover:bg-slate-50 text-[10px] font-black uppercase tracking-wider text-[#1F4C63]"
                  onClick={() => setShowStudentsList(true)}
                >
                  Load Student List
                </Button>
              </CardContent>
            ) : (
              <CardContent className="p-0 divide-y divide-slate-50">
                {students.length === 0 ? (
                  <p className="text-center py-10 text-slate-600 text-xs font-bold">No registered student lists logs found.</p>
                ) : (
                  students.map((st) => (
                    <div key={st.uid} className="p-6 flex items-center justify-between gap-4 hover:bg-slate-50/20 transition-colors animate-fadeIn">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-900">{st.fullName}</p>
                        <p className="text-xs text-slate-600 font-semibold font-mono">UID: {st.uid}</p>
                        <p className="text-xs font-bold text-slate-600">
                          {st.school} • Grade {st.grade}
                        </p>
                        <p className="text-[10px] font-bold text-[#1F4C63] font-mono">
                          LOGGED: {st.loggedHours?.length || 0} activity sessions
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {st.isBanned ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase text-red-600 bg-red-50 py-1.5 px-3 rounded-sm border border-red-100">�,� suspended</span>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="bg-white border-slate-200 hover:bg-slate-100 text-[10px] font-black uppercase tracking-wider"
                              onClick={() => handleToggleBan(st.uid, true)}
                            >
                              Restore
                            </Button>
                          </div>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="bg-red-50 text-red-600 hover:bg-red-100 border-red-100 text-[10px] font-black uppercase tracking-wider"
                            onClick={() => handleToggleBan(st.uid, false)}
                          >
                            Suspend
                          </Button>
                        )}

                        {deleteTargetId !== st.uid ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-red-50/10 border-dashed border-red-200 hover:bg-red-50 text-red-500 font-extrabold text-[10px] uppercase tracking-wider"
                            onClick={() => {
                              setDeleteTargetId(st.uid);
                              setDeveloperDeleteError('');
                            }}
                          >
                            Purge
                          </Button>
                        ) : (
                          <div className="flex flex-col items-end gap-1 p-2 bg-red-50 border border-red-200 rounded-sm animate-fadeIn">
                            <p className="text-[9px] text-red-700 font-bold">Purge doc data?</p>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => setDeleteTargetId(null)}
                                className="text-[9.5px] text-slate-600 font-extrabold uppercase hover:underline"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleDeleteUser(st.uid, 'student')}
                                disabled={isUserDeletingId === st.uid}
                                className="text-[9.5px] text-red-600 font-black uppercase hover:underline"
                              >
                                {isUserDeletingId === st.uid ? 'Purging...' : 'Purge!'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            )}
          </Card>

          {/* ORGANIZATIONS CONTROL BLOCK */}
          <Card className="rounded-sm border border-slate-100 bg-white  overflow-hidden flex flex-col">
            <CardHeader className="border-b border-slate-50 bg-slate-50/40 p-6 md:p-8">
              <CardTitle className="text-lg flex items-center gap-2 font-black text-slate-900">
                <Building2 className="w-5 h-5 text-[#1F4C63]" /> Organizations Audit Base
              </CardTitle>
              <p className="text-xs font-semibold text-slate-600 mt-1">
                Review verified public community service hubs around York region.
              </p>
            </CardHeader>

            {!showOrgsList ? (
              <CardContent className="p-8 text-center space-y-4">
                <Lock className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs text-slate-600 font-semibold">
                  Currently showing 0 organizations. Click the Orgs metric card above to query.
                </p>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="bg-white hover:bg-slate-50 text-[10px] font-black uppercase tracking-wider text-[#1F4C63]"
                  onClick={() => setShowOrgsList(true)}
                >
                  Load Organizations List
                </Button>
              </CardContent>
            ) : (
              <CardContent className="p-0 divide-y divide-slate-50">
                {orgs.length === 0 ? (
                  <p className="text-center py-10 text-slate-600 text-xs font-bold">No organization registers found.</p>
                ) : (
                  orgs.map((org) => (
                    <div key={org.uid} className="p-6 flex items-center justify-between gap-4 hover:bg-slate-50/20 transition-colors animate-fadeIn">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-900">{org.organizationName}</p>
                        <p className="text-xs text-slate-600 font-semibold font-mono">EMAIL: {org.contactEmail}</p>
                        <p className="text-xs font-bold text-slate-600">
                          Type: {org.organizationType || 'Unassigned'}
                        </p>
                        {org.address && (
                          <p className="text-[10px] text-slate-600 italic">
                            HQ Address: {org.address}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {org.isBanned ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase text-red-600 bg-red-50 py-1.5 px-3 rounded-sm border border-red-100">�,� suspended</span>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="bg-white border-slate-200 hover:bg-slate-100 text-[10px] font-black uppercase tracking-wider"
                              onClick={() => handleToggleBan(org.uid, true)}
                            >
                              Restore
                            </Button>
                          </div>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="bg-red-50 text-red-600 hover:bg-red-100 border-red-200 text-[10px] font-black uppercase tracking-wider border"
                            onClick={() => handleToggleBan(org.uid, false)}
                          >
                            Suspend
                          </Button>
                        )}

                        {deleteTargetId !== org.uid ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-red-50/10 border-dashed border-red-200 hover:bg-red-50 text-red-500 font-extrabold text-[10px] uppercase tracking-wider"
                            onClick={() => {
                              setDeleteTargetId(org.uid);
                              setDeveloperDeleteError('');
                            }}
                          >
                            Purge
                          </Button>
                        ) : (
                          <div className="flex flex-col items-end gap-1 p-2 bg-red-50 border border-red-200 rounded-sm animate-fadeIn">
                            <p className="text-[9px] text-red-700 font-bold">Purge doc data?</p>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => setDeleteTargetId(null)}
                                className="text-[9.5px] text-slate-600 font-extrabold uppercase hover:underline"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleDeleteUser(org.uid, 'organization')}
                                disabled={isUserDeletingId === org.uid}
                                className="text-[9.5px] text-red-600 font-black uppercase hover:underline"
                              >
                                {isUserDeletingId === org.uid ? 'Purging...' : 'Purge!'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    ) : activeTab === 'settings' ? (
      /* SYSTEM SETTINGS TAB */
      <div className="space-y-6 max-w-2xl animate-fadeIn">
        <Card className="rounded-sm border border-slate-100 bg-white  overflow-hidden flex flex-col">
          <CardHeader className="border-b border-slate-50 bg-slate-50/40 p-6 md:p-8">
            <CardTitle className="text-lg flex items-center gap-2 font-black text-slate-900">
              <Settings className="w-5 h-5 text-[#1F4C63]" /> MASTER SYSTEM VARIABLES
            </CardTitle>
            <p className="text-xs font-semibold text-slate-600 mt-1">
              Configure global application capabilities, feature flags, and email engines.
            </p>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            {/* Email system toggle */}
            <div className="flex items-center justify-between gap-4 p-6 rounded-sm bg-slate-50 border border-slate-200/50">
              <div className="space-y-1">
                <p className="font-extrabold text-slate-900 text-sm">Master Email Dispatcher Switch</p>
                <p className="text-xs text-slate-600 leading-relaxed font-bold">
                  Turn all transactional and verification email dispatching (sign-up, status changes, Waitlists, receipts) on or off globally.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleEmailSystem(!emailSystemOn)}
                aria-label="Toggle Global Email Sub-system"
                role="switch"
                aria-checked={emailSystemOn}
                className={cn(
                  "w-11 h-6 rounded-sm transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0",
                  emailSystemOn ? "bg-[#1F4C63]" : "bg-slate-200"
                )}
              >
                <div
                  className={cn(
                    "bg-white w-5 h-5 rounded-sm  transform transition-transform duration-250",
                    emailSystemOn ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Gmail integration standard defaults */}
            <div className="flex items-center justify-between gap-4 p-6 rounded-sm bg-slate-50 border border-slate-200/50">
              <div className="space-y-1">
                <p className="font-extrabold text-slate-900 text-sm">Gmail Integration Default Activation</p>
                <p className="text-xs text-slate-600 leading-relaxed font-bold">
                  Enable client-side Gmail OAuth integration helper and connect statuses automatically for all new hosting organizations.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleGmailOAuth(!gmailOAuthOn)}
                aria-label="Toggle Gmail Integration Default Activation"
                role="switch"
                aria-checked={gmailOAuthOn}
                className={cn(
                  "w-11 h-6 rounded-sm transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0",
                  gmailOAuthOn ? "bg-[#1F4C63]" : "bg-slate-200"
                )}
              >
                <div
                  className={cn(
                    "bg-white w-5 h-5 rounded-sm  transform transition-transform duration-250",
                    gmailOAuthOn ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Live Email Testing Form */}
            <div className="border border-orange-100 p-6 rounded-sm bg-[#E08A3C]/10/10 flex flex-col gap-4 animate-fadeIn">
              <div className="space-y-1">
                <p className="font-extrabold text-orange-950 text-sm flex items-center gap-1.5 font-sans uppercase tracking-wide">
                  <Mail className="w-4 h-4 text-[#E08A3C] animate-pulse" /> Send Live / Simulated Test Email
                </p>
                <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                  Test the transactional system live! If your third-party credentials (Resend or SMTP) are invalid or unconfigured, the system will gracefully drop into the **Sandbox Fallback Mode** and generate a fully styled HTML email preview inside the dev log response below.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">Target Email Address</label>
                  <input
                    type="email"
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                    placeholder="e.g. you@domain.com"
                    className="w-full border border-slate-200 rounded-sm px-3 py-2 text-xs focus:ring-1 focus:ring-[#E08A3C] font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">Email Template</label>
                  <select
                    value={testEmailTemplate}
                    onChange={(e) => setTestEmailTemplate(e.target.value)}
                    className="w-full border border-slate-200 bg-white rounded-sm px-3 py-2 text-xs focus:ring-1 focus:ring-[#E08A3C] font-bold"
                  >
                    <option value="welcome_student">Student Welcome Email</option>
                    <option value="application_status">Application Accepted Alert</option>
                    <option value="hours_confirmation">Logged & Signed Hours Receipt</option>
                    <option value="new_applicant">New Posting Applicant File</option>
                    <option value="auth_verification">Account 2FA / Recovery Verification</option>
                    <option value="admin_alert">System Security Bulletin</option>
                  </select>
                </div>
              </div>

              {testEmailStatus && (
                <div className={cn(
                  "p-3 rounded-sm text-xs font-semibold leading-relaxed animate-fadeIn border",
                  testEmailStatus.success
                    ? "bg-[#1F4C63]/5 border-[#1F4C63]/10 text-blue-800"
                    : "bg-[#E08A3C]/10 border-orange-100 text-orange-800"
                )}>
                  {testEmailStatus.message}
                </div>
              )}

              <Button
                type="button"
                onClick={handleSendTestEmail}
                disabled={isSendingTestEmail || !testEmailTo}
                className="w-full bg-[#E08A3C] text-white hover:bg-[#E08A3C] font-black uppercase text-xs tracking-wider  shadow-orange-500/10"
              >
                {isSendingTestEmail ? "Dispatching Delivery..." : "Send Test Email"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    ) : activeTab === 'verification' ? (
      <div className="space-y-6">
        <h3 className="text-lg font-black uppercase tracking-wider text-slate-800">Pending Organization Verification</h3>
        <p className="text-sm text-slate-500">Organizations that submitted a CRA charity registration number. Verify each against the <a href="https://apps.cra-arc.gc.ca/ebci/hacc/srch/pub/dsplyBscSrch" target="_blank" rel="noopener noreferrer" className="text-[#1F4C63] underline">CRA Charity Registry</a> before approving.</p>
        {pendingOrgs.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm font-semibold">No organizations pending verification.</div>
        ) : (
          <div className="space-y-4">
            {pendingOrgs.map(org => (
              <div key={org.uid} className="border border-slate-200 bg-white p-6 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">{org.organizationName}</h4>
                    <p className="text-xs text-slate-500 mt-1">{org.contactEmail} · {org.address || 'No address'}</p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-2 py-1">Pending</span>
                </div>
                <div className="bg-slate-50 p-3 font-mono text-sm tracking-wider text-slate-700 border border-slate-100">
                  CRA #: <strong>{org.craNumber || 'Not provided'}</strong>
                </div>
                {org.mission && <p className="text-sm text-slate-600">{org.mission}</p>}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => handleVerifyOrg(org.uid, 'verified')}
                    disabled={verifyingId === org.uid}
                    className="flex-1 h-10 bg-emerald-600 text-white text-xs font-black uppercase tracking-wider hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {verifyingId === org.uid ? '...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleVerifyOrg(org.uid, 'rejected')}
                    disabled={verifyingId === org.uid}
                    className="flex-1 h-10 bg-red-600 text-white text-xs font-black uppercase tracking-wider hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {verifyingId === org.uid ? '...' : 'Reject'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ) : null}
  </div>
  );
}

