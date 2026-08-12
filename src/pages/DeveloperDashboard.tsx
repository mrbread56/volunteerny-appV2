import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../lib/config';
import { isDeveloperEmail, isDeveloperUser } from '../lib/devAccess';
// Without this import `reportError` silently resolved to the DOM's global
// window.reportError — which takes one argument and returns void, so the
// error never reached the shared handler and never reached the console notice.
import { reportError } from '../lib/errors';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase/config';
import { collection, getDocs, doc, updateDoc, getDoc, deleteDoc, query, where, serverTimestamp, setDoc, writeBatch, limit } from 'firebase/firestore';
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
import AttachmentPreview from '../components/AttachmentPreview';
import EmailDeliveryNote from '../components/ui/EmailDeliveryNote';
import ReportsTab from './developerDashboard/ReportsTab';

export default function DeveloperDashboard() {
  const { user, userProfile, isDemoMode } = useAuth();

  // Test Email Client States
  const [testEmailTo, setTestEmailTo] = useState(user?.email || 'developer@example.com');
  // Console-wide banner. These messages were browser alert()s: blocking,
  // unstyled, and silent to screen readers. They are refusals a developer
  // needs to read, not dismiss reflexively.
  const [consoleNotice, setConsoleNotice] = useState<string | null>(null);
  const [testEmailTemplate, setTestEmailTemplate] = useState('welcome_student');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!consoleNotice) return;
    const t = setTimeout(() => setConsoleNotice(null), 6000);
    return () => clearTimeout(t);
  }, [consoleNotice]);

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
        heading: 'A test notification',
        details: 'Sent from the developer console to check that mail delivery works.'
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
          subject: testEmailTemplate === 'welcome_student' ? 'Welcome to Your OSSD Volunteer Hub Portfolio!' :
                   testEmailTemplate === 'application_status' ? 'Volunteer Application Accepted!' :
                   testEmailTemplate === 'hours_confirmation' ? 'Community Involvement Hours Signed & Confirmed' :
                   testEmailTemplate === 'new_applicant' ? 'New Applicant Submitted to Your Opportunity' :
                   'A Volunteer North York Notification',
          templateName: testEmailTemplate,
          templateData
        })
      });

      if (res.ok) {
        const body = await res.json();
        // These branches used to test for 'smtp_production' and 'production'.
        // /api/email/send has only ever answered 'live' (Resend accepted it) or
        // 'demo' (simulated, nothing sent), so every genuinely delivered email
        // fell through to the failure branch and was reported as a failure.
        if (body.mode === 'live') {
          setTestEmailStatus({
            success: true,
            message: `Delivery succeeded — Resend accepted the message for ${testEmailTo}.`
          });
        } else if (body.mode === 'demo') {
          setTestEmailStatus({
            success: false,
            message: `Demo mode: the HTML was rendered and logged, but no email was sent. Sign in with a real developer account to send for real.`
          });
        } else {
          setTestEmailStatus({
            success: false,
            message: `The server returned 200 but did not confirm delivery (mode: ${body.mode || 'unknown'}${body.warning ? `, ${body.warning}` : ''}).`
          });
        }
      } else {
        // The endpoint explains itself (503 = RESEND_API_KEY missing, 429 =
        // rate limited, 400 = bad template). "Check server logs" threw that
        // away and sent the developer to the wrong place.
        const body = await res.json().catch(() => ({}) as any);
        setTestEmailStatus({
          success: false,
          message: `${res.status}: ${body.error || 'The email API returned a failure.'}${body.details ? ` — ${body.details}` : ''}`
        });
      }
    } catch (err: any) {
      setTestEmailStatus({
        success: false,
        message: `Request failed: ${err.message || err}`
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
  // Moderation actions used to fail silently: the write threw, a console line
  // was logged, and the console reported nothing. On a queue of safety reports
  // about minors, a moderator believing they had actioned something they had
  // not is the worst possible failure mode.
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 8000);
    return () => clearTimeout(t);
  }, [actionError]);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isUserDeletingId, setIsUserDeletingId] = useState<string | null>(null);
  const [developerDeleteError, setDeveloperDeleteError] = useState<string>('');


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
          const fbSnap = await getDocs(query(collection(db, 'feedbacks'), limit(200)));
          fbList = fbSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (dbErr) {
          setConsoleNotice(
            reportError('load feedback tickets', dbErr, "Couldn't load feedback tickets from the database."),
          );
        }

        // No localStorage merge here.
        //
        // This is the REAL data branch, and it used to append demo_feedbacks
        // and demo_reports to whatever Firestore returned. Two separate
        // failures came out of that. Invented tickets and invented safety
        // reports appeared in a live developer's queue, indistinguishable from
        // real ones. And because the catches here only console.warn'd, a failed
        // read left the localStorage copies as the ENTIRE list — so the console
        // looked healthy and populated while every real report was invisible.
        // A safety report nobody sees is the worst failure this app has, so
        // both reads now say so out loud and show only what the database
        // actually holds.
        fbList.sort((a: any, b: any) => {
          const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
          const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
          return tB - tA;
        });

        setFeedbacks(fbList);
        setRealFeedbackCount(fbList.length);

        // Fetch safety reports
        let repList: any[] = [];
        try {
          const repSnap = await getDocs(query(collection(db, 'reports'), limit(200)));
          repList = repSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (dbErr) {
          setConsoleNotice(
            reportError('load safety reports', dbErr, "Couldn't load safety reports from the database."),
          );
        }
        repList.sort((a: any, b: any) => {
          const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
          const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
          return tB - tA;
        });
        setReports(repList);
        setRealReportCount(repList.length);

        // Via the server, which returns an allow-listed projection. Reading
        // these documents directly pulled resumeUrl and passportUrl with them —
        // base64 files, up to 400 KB each by the rules — so listing 200
        // students streamed as much as 160 MB of minors' identity documents
        // into this tab to render names and emails.
        const studentToken = await user?.getIdToken();
        const studentRes = await fetch(`${API_BASE_URL}/api/admin/students`, {
          headers: studentToken ? { Authorization: `Bearer ${studentToken}` } : {},
        });
        if (!studentRes.ok) {
          const body = await studentRes.json().catch(() => ({}));
          throw new Error(body.error || `Could not load students (${studentRes.status}).`);
        }
        const { students: studentList } = await studentRes.json();
        setStudents(studentList);
        setRealStudentCount(studentList.length);

        const orgSnap = await getDocs(query(collection(db, 'organizations'), limit(200)));
        const orgList = orgSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        setOrgs(orgList);
        setRealOrgCount(orgList.length);
      }
    } catch (err) {
      // Was a bare console.error. This catch wraps the WHOLE admin load —
      // students, organizations, the lot — so when it fired the developer got a
      // dashboard of empty tables and no indication anything had gone wrong.
      // An empty list and a failed list looked identical.
      setConsoleNotice(
        reportError(
          'load developer admin lists',
          err,
          "Couldn't load the admin lists. They may be incomplete — refresh to try again.",
        ),
      );
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
    if (!isDeveloperUser(user?.email, userProfile?.role) && !isDemoMode) {
      setConsoleNotice('Access denied: your account does not have permission to perform that action.');
      return;
    }

    try {
      if (isDemoMode) {
        // Prevent banning developer in demo mode
        const targetStudentEmail = students.find(s => s.uid === userId)?.email || '';
        const targetOrgEmail = orgs.find(o => o.uid === userId)?.contactEmail || '';
        const isTargetDev = isDeveloperEmail(targetStudentEmail) || isDeveloperEmail(targetOrgEmail);
        if (isTargetDev && !isCurrentlyBanned) {
          setConsoleNotice('System developers cannot be suspended.');
          return;
        }
        setStudents(prev => prev.map(s => s.uid === userId ? { ...s, isBanned: !isCurrentlyBanned } : s));
        setOrgs(prev => prev.map(o => o.uid === userId ? { ...o, isBanned: !isCurrentlyBanned } : o));
      } else {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const uData = userDoc.data();
          if (isDeveloperUser(uData.email, uData.role)) {
            setConsoleNotice('System developers cannot be suspended.');
            return;
          }
          // Both documents in ONE batch. They were two sequential updateDocs,
          // so the users doc could flip while the students/organizations doc
          // did not — leaving an account banned in one place and active in the
          // other, with the failure logged to a console nobody was reading.
          // A batch is atomic: both land, or neither does.
          const batch = writeBatch(db);
          batch.update(userRef, { isBanned: !isCurrentlyBanned });
          if (uData.role === 'student') {
            batch.update(doc(db, 'students', userId), { isBanned: !isCurrentlyBanned });
          } else if (uData.role === 'organization') {
            batch.update(doc(db, 'organizations', userId), { isBanned: !isCurrentlyBanned });
          }
          await batch.commit();
        }
      }
      loadData();
    } catch (err) {
      console.error('Ban action write failure:', err);
      setActionError(
        `Could not ${isCurrentlyBanned ? 'restore' : 'suspend'} that account — nothing was changed. Please try again.`
      );
    }
  };

  // PURGE MEMBER Firestore Records
  const handleDeleteUser = async (userId: string, role: 'student' | 'organization') => {
    if (!isDeveloperUser(user?.email, userProfile?.role) && !isDemoMode) {
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
        // Via the server, because only the Admin SDK can remove the Firebase
        // Auth identity. Deleting the documents from here left the account able
        // to sign in and re-create its own users doc with a role of its
        // choosing — so "delete" removed the profile and none of the access.
        const token = await user?.getIdToken();
        const res = await fetch(`${API_BASE_URL}/api/admin/delete-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ userId, role }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.details || body.error || `Delete failed (${res.status}).`);
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

  // The global purge was removed on 9 August 2026 and must not come back.
  //
  // It matched by substring against JSON.stringify(entire document), then
  // deleted every hit from students/organizations AND users, one at a time,
  // with no dry run, no count preview, no typed confirmation and no undo.
  //
  // Student documents embed resumeUrl and passportUrl as base64 blobs of up to
  // 400 KB each. Base64 contains essentially every short alphanumeric
  // sequence, so a three-character query intended to remove one test
  // organization matched every student on the platform. The 3-character
  // minimum guard made it more dangerous, not less.
  //
  // It was written for a single one-off cleanup that is long finished.
  // handleDeleteUser already removes one specific account deliberately.

  // DEVELOPER REPLY SUBMISSION
  const handleSendReply = async (fbId: string) => {
    const textReply = replyInput[fbId];
    if (!textReply || !textReply.trim()) return;

    setIsReplying(fbId);
    try {
      if (isDemoMode) {
        // localStorage is the store in demo mode, and ONLY in demo mode. This
        // write used to run unconditionally — a real reply was mirrored into
        // the demo fixture key, where the console then read it back as though
        // it were a filed reply.
        const demoFeedbacks = JSON.parse(localStorage.getItem('demo_feedbacks') || '[]');
        const updated = demoFeedbacks.map((item: any) =>
          item.id === fbId
            ? { ...item, developerReply: textReply, repliedAt: new Date().toISOString() }
            : item
        );
        localStorage.setItem('demo_feedbacks', JSON.stringify(updated));
        setFeedbacks(updated);
      } else {
        // Not wrapped in its own catch any more. It used to console.warn and
        // fall through to clear the input and reload, so a reply that never
        // reached Firestore looked exactly like one that did — the developer
        // watched their text disappear and assumed it had sent. Let it throw to
        // the handler below, which keeps the text where it is and says so.
        await updateDoc(doc(db, 'feedbacks', fbId), {
          developerReply: textReply,
          repliedAt: new Date().toISOString()
        });
      }
      setReplyInput(prev => ({ ...prev, [fbId]: '' }));
      loadData();
    } catch (err) {
      // The reply stays in the box so it is not lost and can be retried.
      setConsoleNotice(
        reportError('send feedback reply', err, "That reply wasn't saved. Your text is still here — try again."),
      );
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
        // No swallowing here. This used to catch the failure and log "using
        // local fallback", so a safety report could be shown as resolved while
        // the database still had it open — invisible on any other device, and
        // silently dropped from the moderation queue.
        await updateDoc(doc(db, 'reports', reportId), { status: newStatus });
      }
      loadData();
    } catch (err) {
      console.error('Failed to change report status:', err);
      setActionError(
        `That safety report is still ${newStatus === 'resolved' ? 'unresolved' : 'open'} — the change was not saved. Please try again.`
      );
      loadData();
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

  if (!isDemoMode && user && !isDeveloperUser(user.email, userProfile?.role)) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-paper-2 p-6 text-center">

      {consoleNotice && (
        <div role="alert" aria-live="assertive" className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] px-4 py-2.5 text-[13px] font-semibold bg-red-50 border border-red-200 text-red-700">
          {consoleNotice}
        </div>
      )}
        <Card className="max-w-md p-8 border-line border space-y-4 bg-white rounded-lg">
          <ShieldAlert className="text-red-500 w-12 h-12 mx-auto" />
          <h2 className="text-xl font-bold text-ink tracking-tight">Access Denied</h2>
          <p className="text-ink-muted text-sm leading-relaxed">
            You do not have administrative permissions to view this page. Accessing this dashboard requires logging in with an authorized administrator developer account (<span className="font-mono text-xs px-1.5 py-0.5 bg-paper-2 border border-line-light rounded text-ink-muted">{user.email}</span>).
          </p>
          <div className="pt-2 flex justify-center">
            <Button variant="outline" className="text-xs uppercase font-bold" onClick={() => window.history.back()}>
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
      <div className="min-h-[calc(100vh-140px)] flex flex-col items-center justify-center py-16 px-4 bg-paper-2">
        <Card className="w-full max-w-xl mx-auto p-10 border border-line-light shadow-slate-200/60 rounded-lg bg-white text-center space-y-8 animate-fadeIn relative overflow-hidden">
          {/* Accent decoration */}
          <div className="absolute top-0 left-0 right-0 h-2" />
          
          <div className="space-y-3">
            <div className="w-16 h-16 bg-blue-dark/5 border border-blue-dark/10 text-blue-dark rounded-lg flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold text-ink uppercase tracking-tight font-sans">
              Control Room
            </h1>
            <p className="text-ink-muted font-semibold text-xs uppercase tracking-wider">
              York Region Administrative Command Centre
            </p>
            <p className="text-ink-muted text-xs max-w-sm mx-auto leading-relaxed font-semibold">
              Deploy the administrative dashboard to verify logged hours, ban/unban users, audit submissions, and run real-time support reviews.
            </p>
          </div>

          <div className="bg-paper-2 rounded-lg p-6 text-left border border-line-light space-y-3">
            <h4 className="text-xs font-bold text-ink-soft uppercase tracking-wide flex items-center gap-2">
              <Compass className="w-4 h-4 text-amber-dark" /> Key Privileges Includes:
            </h4>
            <ul className="text-xs text-ink-muted space-y-2 font-medium">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-dark rounded-lg" /> Click counters to drill down and retrieve real live data
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-dark rounded-lg" /> Live feedback processing with Gemini AI diagnostics
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-dark rounded-lg" /> One-click banning of violator organizations or students
              </li>
            </ul>
          </div>

          <div>
            <Button 
              onClick={() => setIsDashboardActive(true)}
              className="w-full h-14 rounded-lg font-semibold uppercase text-xs bg-blue-dark text-white hover:bg-slate-800 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
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
      {actionError && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-6 py-3 rounded-lg font-semibold text-xs tracking-wide max-w-[90vw]"
        >
          {actionError}
        </div>
      )}

      {/* Header info bar */}
      <div className="bg-blue-dark text-white rounded-lg p-8 md:p-12 relative overflow-hidden flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-3 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-dark/20 text-blue-400 border border-blue-dark/30 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" /> Administrator Verified
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight uppercase">Control Room</h1>
          <p className="text-ink-muted font-semibold text-xs max-w-md">
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
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowStudentsList(true);
                setActiveTab('users');
              }
            }}
            className={cn(
              "border rounded-lg p-4 text-center cursor-pointer transition-all duration-300 hover:scale-[1.03] select-students-metric focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
              showStudentsList
                ? "bg-blue-dark border-blue-dark text-white  shadow-blue-500/20"
                : "bg-white/5 border-white/5 text-white hover:bg-white/10"
            )}
          >
            <Users className={cn("w-5 h-5 mx-auto mb-1.5", showStudentsList ? "text-white" : "text-blue-400")} />
            <span className="block text-2xl font-bold">{showStudentsList ? realStudentCount : 0}</span>
            <span className="text-xs uppercase font-bold tracking-widest block opacity-70">STUDENTS</span>
            {!showStudentsList && <span className="text-[7px] text-blue-300 font-semibold uppercase tracking-wide block mt-1">Click to Load</span>}
          </div>

          {/* Orgs counter */}
          <div
            onClick={() => {
              setShowOrgsList(true);
              setActiveTab('users');
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowOrgsList(true);
                setActiveTab('users');
              }
            }}
            className={cn(
              "border rounded-lg p-4 text-center cursor-pointer transition-all duration-300 hover:scale-[1.03] select-orgs-metric focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
              showOrgsList
                ? "bg-blue-dark border-blue-dark text-white  shadow-blue-500/20"
                : "bg-white/5 border-white/5 text-white hover:bg-white/10"
            )}
          >
            <Building2 className={cn("w-5 h-5 mx-auto mb-1.5", showOrgsList ? "text-white animate-pulse" : "text-blue-400")} />
            <span className="block text-2xl font-bold">{showOrgsList ? realOrgCount : 0}</span>
            <span className="text-xs uppercase font-bold tracking-widest block opacity-70">ORGS</span>
            {!showOrgsList && <span className="text-[7px] text-blue-300 font-semibold uppercase tracking-wide block mt-1">Click to Load</span>}
          </div>

          {/* Reports counter */}
          <div
            onClick={() => {
              setShowReportsList(true);
              setActiveTab('reports');
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowReportsList(true);
                setActiveTab('reports');
              }
            }}
            className={cn(
              "border rounded-lg p-4 text-center cursor-pointer transition-all duration-300 hover:scale-[1.03] select-reports-metric focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
              showReportsList && activeTab === 'reports'
                ? "bg-red-600 border-red-500 text-white  shadow-red-500/20"
                : "bg-white/5 border-white/5 text-white hover:bg-white/10"
            )}
          >
            <ShieldAlert className={cn("w-5 h-5 mx-auto mb-1.5", showReportsList && activeTab === 'reports' ? "text-white" : "text-red-400 animate-pulse")} />
            <span className="block text-2xl font-bold">{reports.length}</span>
            <span className="text-xs uppercase font-bold tracking-widest block opacity-70">REPORTS</span>
            {(!showReportsList || activeTab !== 'reports') && <span className="text-[7px] text-red-300 font-semibold uppercase tracking-wide block mt-1">Click to Load</span>}
          </div>
        </div>

        <div className="absolute -bottom-24 -left-20 w-80 h-80 bg-blue-dark/10 rounded-lg blur-3xl -z-5 animate-pulse" />
      </div>

      {/* Primary tab bar controls */}
      <div className="border-b border-line overflow-x-auto scrollbar-none">
        <div className="flex min-w-max pb-1">
          <button
            onClick={() => setActiveTab('feedbacks')}
            className={cn(
              "pb-4 px-6 text-sm font-semibold uppercase border-b-4 transition-all flex items-center gap-2",
              activeTab === 'feedbacks' ? "border-blue-dark text-ink" : "border-transparent text-ink-muted hover:text-ink-muted"
            )}
          >
            <MessageSquare className="w-4 h-4" /> Feedback Tickets ({feedbacks.length})
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={cn(
              "pb-4 px-6 text-sm font-semibold uppercase border-b-4 transition-all flex items-center gap-2",
              activeTab === 'reports' ? "border-red-600 text-red-600" : "border-transparent text-ink-muted hover:text-ink-muted"
            )}
          >
            <ShieldAlert className="w-4 h-4 text-red-500 animate-pulse" /> Safety Reports ({reports.length})
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={cn(
              "pb-4 px-6 text-sm font-semibold uppercase border-b-4 transition-all flex items-center gap-2",
              activeTab === 'users' ? "border-blue-dark text-ink" : "border-transparent text-ink-muted hover:text-ink-muted"
            )}
          >
            <XOctagon className="w-4 h-4" /> User Base Audit
          </button>
          <button
            onClick={() => setActiveTab('terminated')}
            className={cn(
              "pb-4 px-6 text-sm font-semibold uppercase border-b-4 transition-all flex items-center gap-2",
              activeTab === 'terminated' ? "border-red-500 text-red-600" : "border-transparent text-ink-muted hover:text-ink-muted"
            )}
          >
            <Lock className="w-4 h-4 text-red-500" /> Suspended List ({students.filter(s => s.isBanned).length + orgs.filter(o => o.isBanned).length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={cn(
              "pb-4 px-6 text-sm font-semibold uppercase border-b-4 transition-all flex items-center gap-2",
              activeTab === 'settings' ? "border-blue-dark text-ink" : "border-transparent text-ink-muted hover:text-ink-muted"
            )}
          >
            <Settings className="w-4 h-4 text-blue-dark" /> System Settings
          </button>
          <button
            onClick={() => setActiveTab('verification')}
            className={cn(
              "pb-4 px-6 text-sm font-semibold uppercase border-b-4 transition-all flex items-center gap-2",
              activeTab === 'verification' ? "border-blue-dark text-ink" : "border-transparent text-ink-muted hover:text-ink-muted"
            )}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> Verify Orgs {pendingOrgs.length > 0 && <span className="ml-1 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{pendingOrgs.length}</span>}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-dark/30 border-t-blue-600 rounded-lg animate-spin mx-auto" />
          <p className="text-xs font-bold uppercase text-ink-muted tracking-widest animate-pulse">Retrieving system registries...</p>
        </div>
      ) : activeTab === 'feedbacks' ? (
        <div className="space-y-6">
          {/* Feedbacks filtering & query bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pb-4 border-b border-line-light">
            <div className="relative w-full sm:max-w-md">
              <input
                type="text"
                placeholder="Search ticket subjects, contents, or user emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 rounded-lg border border-line text-xs focus:ring-2 focus:ring-blue-dark font-semibold"
              />
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-end">
              <Filter className="w-4 h-4 text-ink-muted shrink-0" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="rounded-lg border border-line py-2.5 px-4 text-xs font-bold leading-tight bg-white cursor-pointer"
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
            <Card className="p-12 text-center rounded-lg border border-line-light bg-white space-y-4">
              <Lock className="w-10 h-10 text-ink-muted mx-auto" />
              <h3 className="text-base font-semibold text-ink uppercase">Support Tickets Log Locked</h3>
              <p className="text-ink-muted text-xs font-medium max-w-sm mx-auto leading-relaxed">
                Initially showing 0 reports. Click the high-contrast **REPORTS** metric block above to retrieve all the pending feedback submissions and active reviews.
              </p>
              <Button 
                onClick={() => setShowReportsList(true)}
                className="text-xs font-semibold uppercase"
              >
                Unlock Reports Queue
              </Button>
            </Card>
          ) : filteredFeedbacks.length === 0 ? (
            <div className="text-center py-16 bg-paper-2 border border-line rounded-lg text-ink-muted font-semibold text-xs leading-relaxed uppercase tracking-wider">
              All clear! No pending support logs found matching search filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {filteredFeedbacks.map((fb) => (
                <Card key={fb.id} className="rounded-lg border border-line bg-white overflow-hidden relative animate-fadeIn">
                  <div className="absolute top-0 left-0 w-2 h-full bg-blue-dark" />
                  
                  <CardContent className="p-6 md:p-8 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className={`inline-block text-xs font-semibold uppercase px-2 py-0.5 rounded ${
                            fb.type === 'bug' ? 'bg-red-50 text-red-600 border border-red-100' :
                            fb.type === 'feature' ? 'bg-blue-dark/5 text-blue-dark border border-blue-dark/10' :
                            'bg-blue-dark/5 text-blue-dark border border-blue-dark/10'
                          }`}>
                            {fb.type || 'SUPPORT'}
                          </span>
                          <span className="text-xs text-ink-muted font-semibold font-mono">ID: {fb.id}</span>
                        </div>
                        <h3 className="text-lg font-bold text-ink leading-tight">{fb.subject}</h3>
                        <p className="text-xs text-ink-muted font-semibold font-mono">
                          Sender: {fb.userEmail} ({fb.userRole})
                        </p>
                      </div>
                      
                      <div className="text-ink-muted text-xs font-semibold self-end md:self-start shrink-0 font-mono">
                        {fb.createdAt ? new Date(fb.createdAt.seconds ? fb.createdAt.seconds * 1000 : fb.createdAt).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>

                    <p className="text-ink-muted text-xs leading-relaxed font-semibold bg-paper-2 p-4 border border-line-light rounded-lg italic">
                      "{fb.message}"
                    </p>

                    {/* Display file attachment if present */}
                    {fb.attachmentName && (
                      <div className="bg-paper-2 border border-line/80 rounded-lg p-4 text-xs space-y-3 animate-fadeIn font-semibold">
                        <div className="flex items-center gap-2 text-ink-soft">
                          <Paperclip className="w-4 h-4 text-blue-dark" />
                          <span>Attached screenshot/document: <strong className="font-semibold text-[#FF6B35]">{fb.attachmentName}</strong> ({fb.attachmentSize || 'Unknown size'})</span>
                        </div>
                        {fb.attachmentDescription && (
                          <div className="pl-6 border-l-2 border-slate-300 italic text-ink-muted">
                            "File Context/Description: {fb.attachmentDescription}"
                          </div>
                        )}
                        {(fb.attachmentUrl || fb.attachmentData) && (
                          <AttachmentPreview
                            value={fb.attachmentUrl || fb.attachmentData}
                            name={fb.attachmentName}
                          />
                        )}
                      </div>
                    )}

                    {/* Gemini AI Overview annotation frame */}
                    {fb.aiOverview && (
                      <div className="border border-orange-100 bg-amber/10 p-5 rounded-lg space-y-3 relative overflow-hidden animate-fadeIn">
                        <div className="flex items-center gap-2 text-orange-900 border-b border-orange-100/40 pb-2">
                          <Sparkles className="w-4 h-4 text-amber-dark" />
                          <span className="text-xs uppercase tracking-widest font-bold">AI Overview Analysis</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold leading-relaxed">
                          <div className="space-y-1">
                            <span className="text-xs text-orange-900/45 uppercase tracking-widest block font-bold">AI urgency prediction</span>
                            <span className={`inline-block text-xs font-bold uppercase px-2 py-0.5 rounded ${
                              fb.aiOverview.urgency === 'critical' || fb.aiOverview.urgency === 'high'
                                ? 'bg-red-500/10 text-red-600 border border-red-200'
                                : 'bg-amber/10 text-amber-dark border border-amber/20'
                            }`}>
                              {fb.aiOverview.urgency || 'MEDIUM'}
                            </span>
                          </div>
                          
                          <div className="space-y-1 md:col-span-2">
                            <span className="text-xs text-orange-900/45 uppercase tracking-widest block font-bold">Issue synopsis</span>
                            <p className="text-ink-soft font-bold leading-relaxed">{fb.aiOverview.summary}</p>
                          </div>
                          
                          {fb.aiOverview.suggestedFix && (
                            <div className="space-y-1 md:col-span-2 bg-amber/5 p-4 border border-orange-100 rounded-lg">
                              <span className="text-xs text-amber-dark uppercase tracking-widest block font-bold">suggested resolve tip</span>
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
                      <div className="border border-blue-dark/20 bg-blue-dark/5 p-5 rounded-lg space-y-2 animate-fadeIn">
                        <div className="flex items-center gap-2 text-[#0F1E29]">
                          <CheckCircle2 className="w-4 h-4 text-blue-dark" />
                          <span className="text-xs uppercase tracking-widest font-bold">Logged Developer Response</span>
                        </div>
                        <p className="text-xs text-blue-dark font-bold">
                          "{fb.developerReply}"
                        </p>
                        <span className="block text-xs text-ink-muted font-mono font-semibold">
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
                            className="flex-1 rounded-lg border border-line px-4 py-3 text-xs focus:ring-2 focus:ring-blue-dark font-semibold"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSendReply(fb.id);
                            }}
                          />
                          <Button 
                            className="rounded-lg px-5 text-xs font-semibold uppercase" 
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
        <ReportsTab
          reports={reports}
          students={students}
          orgs={orgs}
          onUpdateReportStatus={handleUpdateReportStatus}
          onToggleBan={handleToggleBan}
        />
      ) : activeTab === 'terminated' ? (
        /* TERMINATED BASE TAB */
        <div className="space-y-6">
          <div className="bg-red-50 border border-red-100 rounded-lg p-6 flex flex-col sm:flex-row items-center gap-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-100/30 rounded-lg blur-2xl pointer-events-none" />
            <div className="w-12 h-12 rounded-lg bg-red-500 flex items-center justify-center text-white shrink-0 shadow-red-500/10">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink uppercase tracking-tight flex items-center gap-2">
                Account Suspension Registry
              </h2>
              <p className="text-xs text-ink-muted font-semibold mt-0.5 max-w-2xl leading-relaxed">
                York Region Trust safe-space enforcements. Lift locks on student volunteers or organization profiles to grant immediate login, posting, and action privileges.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Suspended Students */}
            <Card className="rounded-lg border border-line-light bg-white shadow-slate-100/50 overflow-hidden flex flex-col animate-fadeIn">
              <CardHeader className="border-b border-red-50 bg-red-50/10 p-6 md:p-8">
                <CardTitle className="text-xs font-bold text-rose-950 flex items-center gap-2 text-red-600 uppercase tracking-widest">
                  <Users className="w-4 h-4 text-red-500" /> Suspended Students ({students.filter(s => s.isBanned).length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 md:p-8 flex-1">
                {students.filter(s => s.isBanned).length === 0 ? (
                  <div className="py-12 text-center text-ink-muted space-y-3">
                    <ShieldCheck className="w-10 h-10 text-blue-dark mx-auto" />
                    <p className="text-xs font-semibold uppercase text-ink-soft">No Suspended Students</p>
                    <p className="text-xs text-ink-muted font-medium">All students currently maintain active, good-standing credentials.</p>
                  </div>
                ) : (
                  <div className="space-y-4 divide-y divide-red-50/30">
                    {students.filter(s => s.isBanned).map((st) => (
                      <div key={st.uid} className="pt-4 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn">
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-ink-soft">{st.fullName || st.name || 'Anonymous Student'}</p>
                          <p className="text-[10.5px] text-ink-muted font-mono font-medium leading-none">{st.email || 'No email registered'}</p>
                          <span className="inline-block text-xs font-semibold uppercase px-1.5 py-0.5 rounded bg-paper-2 text-ink-muted border border-line mt-1">
                            {st.school || 'York Region'}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-dark/20 hover:bg-blue-dark/5 hover:text-blue-dark text-blue-dark font-bold uppercase text-xs tracking-wider shrink-0"
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
            <Card className="rounded-lg border border-line-light bg-white shadow-slate-100/50 overflow-hidden flex flex-col animate-fadeIn">
              <CardHeader className="border-b border-red-50 bg-red-50/10 p-6 md:p-8">
                <CardTitle className="text-xs font-bold text-rose-950 flex items-center gap-2 text-red-600 uppercase tracking-widest">
                  <Building2 className="w-4 h-4 text-red-500" /> Suspended Partners ({orgs.filter(o => o.isBanned).length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 md:p-8 flex-1">
                {orgs.filter(o => o.isBanned).length === 0 ? (
                  <div className="py-12 text-center text-ink-muted space-y-3">
                    <ShieldCheck className="w-10 h-10 text-blue-dark mx-auto" />
                    <p className="text-xs font-semibold uppercase text-ink-soft">No Suspended Partners</p>
                    <p className="text-xs text-ink-muted font-medium">All partner organizations are verified and in good standing.</p>
                  </div>
                ) : (
                  <div className="space-y-4 divide-y divide-red-200/20">
                    {orgs.filter(o => o.isBanned).map((org) => (
                      <div key={org.uid} className="pt-4 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn">
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-ink-soft">{org.organizationName || 'Partner Agency'}</p>
                          <p className="text-[10.5px] text-ink-muted font-mono font-medium leading-none">{org.contactEmail || 'No contact email'}</p>
                          <span className="inline-block text-xs font-semibold uppercase px-1.5 py-0.5 rounded bg-paper-2 text-ink-muted border border-line mt-1">
                            {org.organizationType || 'Trust Partner'}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-dark/20 hover:bg-blue-dark/5 hover:text-blue-dark text-blue-dark font-bold uppercase text-xs tracking-wider shrink-0"
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
            <div className="bg-red-50 border border-red-100 text-red-700 text-xs font-bold p-4 rounded-lg uppercase tracking-wider">
              {developerDeleteError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* STUDENTS CONTROL BLOCK */}
          <Card className="rounded-lg border border-line-light bg-white overflow-hidden flex flex-col">
            <CardHeader className="border-b border-slate-50 bg-paper-2/40 p-6 md:p-8">
              <CardTitle className="text-lg flex items-center gap-2 font-bold text-ink">
                <Users className="w-5 h-5 text-blue-dark" /> Students Audit Base
              </CardTitle>
              <p className="text-xs font-semibold text-ink-muted mt-1">
                Verify logged involvement parameters and privilege status.
              </p>
            </CardHeader>

            {!showStudentsList ? (
              <CardContent className="p-8 text-center space-y-4">
                <Lock className="w-8 h-8 text-ink-muted mx-auto" />
                <p className="text-xs text-ink-muted font-semibold">
                  Currently showing 0 students. Click the Students metric card above to query.
                </p>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="bg-white hover:bg-paper-2 text-xs font-semibold uppercase text-blue-dark"
                  onClick={() => setShowStudentsList(true)}
                >
                  Load Student List
                </Button>
              </CardContent>
            ) : (
              <CardContent className="p-0 divide-y divide-slate-50">
                {students.length === 0 ? (
                  <p className="text-center py-10 text-ink-muted text-xs font-bold">No registered student lists logs found.</p>
                ) : (
                  students.map((st) => (
                    <div key={st.uid} className="p-6 flex items-center justify-between gap-4 hover:bg-paper-2/20 transition-colors animate-fadeIn">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-ink">{st.fullName}</p>
                        <p className="text-xs text-ink-muted font-semibold font-mono">UID: {st.uid}</p>
                        <p className="text-xs font-bold text-ink-muted">
                          {st.school} • Grade {st.grade}
                        </p>
                        <p className="text-xs font-bold text-blue-dark font-mono">
                          {/* loggedHoursCount comes from the projection; the
                              array itself is no longer sent. Demo fixtures
                              still carry the array, hence both. */}
                          LOGGED: {st.loggedHoursCount ?? st.loggedHours?.length ?? 0} activity sessions
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {st.isBanned ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase text-red-600 bg-red-50 py-1.5 px-3 rounded-lg border border-red-100 inline-flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> suspended</span>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="bg-white border-line hover:bg-paper-3 text-xs font-semibold uppercase"
                              onClick={() => handleToggleBan(st.uid, true)}
                            >
                              Restore
                            </Button>
                          </div>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="bg-red-50 text-red-600 hover:bg-red-100 border-red-100 text-xs font-semibold uppercase"
                            onClick={() => handleToggleBan(st.uid, false)}
                          >
                            Suspend
                          </Button>
                        )}

                        {deleteTargetId !== st.uid ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-red-50/10 border-dashed border-red-200 hover:bg-red-50 text-red-500 font-semibold text-xs uppercase tracking-wider"
                            onClick={() => {
                              setDeleteTargetId(st.uid);
                              setDeveloperDeleteError('');
                            }}
                          >
                            Purge
                          </Button>
                        ) : (
                          <div className="flex flex-col items-end gap-1 p-2 bg-red-50 border border-red-200 rounded-lg animate-fadeIn">
                            <p className="text-xs text-red-700 font-bold">Purge doc data?</p>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => setDeleteTargetId(null)}
                                className="text-xs text-ink-muted font-semibold uppercase hover:underline"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleDeleteUser(st.uid, 'student')}
                                disabled={isUserDeletingId === st.uid}
                                className="text-xs text-red-600 font-bold uppercase hover:underline"
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
          <Card className="rounded-lg border border-line-light bg-white overflow-hidden flex flex-col">
            <CardHeader className="border-b border-slate-50 bg-paper-2/40 p-6 md:p-8">
              <CardTitle className="text-lg flex items-center gap-2 font-bold text-ink">
                <Building2 className="w-5 h-5 text-blue-dark" /> Organizations Audit Base
              </CardTitle>
              <p className="text-xs font-semibold text-ink-muted mt-1">
                Review verified public community service hubs around York region.
              </p>
            </CardHeader>

            {!showOrgsList ? (
              <CardContent className="p-8 text-center space-y-4">
                <Lock className="w-8 h-8 text-ink-muted mx-auto" />
                <p className="text-xs text-ink-muted font-semibold">
                  Currently showing 0 organizations. Click the Orgs metric card above to query.
                </p>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="bg-white hover:bg-paper-2 text-xs font-semibold uppercase text-blue-dark"
                  onClick={() => setShowOrgsList(true)}
                >
                  Load Organizations List
                </Button>
              </CardContent>
            ) : (
              <CardContent className="p-0 divide-y divide-slate-50">
                {orgs.length === 0 ? (
                  <p className="text-center py-10 text-ink-muted text-xs font-bold">No organization registers found.</p>
                ) : (
                  orgs.map((org) => (
                    <div key={org.uid} className="p-6 flex items-center justify-between gap-4 hover:bg-paper-2/20 transition-colors animate-fadeIn">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-ink">{org.organizationName}</p>
                        <p className="text-xs text-ink-muted font-semibold font-mono">EMAIL: {org.contactEmail}</p>
                        <p className="text-xs font-bold text-ink-muted">
                          Type: {org.organizationType || 'Unassigned'}
                        </p>
                        {org.address && (
                          <p className="text-xs text-ink-muted italic">
                            HQ Address: {org.address}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {org.isBanned ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase text-red-600 bg-red-50 py-1.5 px-3 rounded-lg border border-red-100 inline-flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> suspended</span>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="bg-white border-line hover:bg-paper-3 text-xs font-semibold uppercase"
                              onClick={() => handleToggleBan(org.uid, true)}
                            >
                              Restore
                            </Button>
                          </div>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="bg-red-50 text-red-600 hover:bg-red-100 border-red-200 text-xs font-semibold uppercase border"
                            onClick={() => handleToggleBan(org.uid, false)}
                          >
                            Suspend
                          </Button>
                        )}

                        {deleteTargetId !== org.uid ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-red-50/10 border-dashed border-red-200 hover:bg-red-50 text-red-500 font-semibold text-xs uppercase tracking-wider"
                            onClick={() => {
                              setDeleteTargetId(org.uid);
                              setDeveloperDeleteError('');
                            }}
                          >
                            Purge
                          </Button>
                        ) : (
                          <div className="flex flex-col items-end gap-1 p-2 bg-red-50 border border-red-200 rounded-lg animate-fadeIn">
                            <p className="text-xs text-red-700 font-bold">Purge doc data?</p>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => setDeleteTargetId(null)}
                                className="text-xs text-ink-muted font-semibold uppercase hover:underline"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleDeleteUser(org.uid, 'organization')}
                                disabled={isUserDeletingId === org.uid}
                                className="text-xs text-red-600 font-bold uppercase hover:underline"
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
        <Card className="rounded-lg border border-line-light bg-white overflow-hidden flex flex-col">
          <CardHeader className="border-b border-slate-50 bg-paper-2/40 p-6 md:p-8">
            <CardTitle className="text-lg flex items-center gap-2 font-bold text-ink">
              <Settings className="w-5 h-5 text-blue-dark" /> MASTER SYSTEM VARIABLES
            </CardTitle>
            <p className="text-xs font-semibold text-ink-muted mt-1">
              Configure global application capabilities, feature flags, and email engines.
            </p>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            {/* Email system toggle */}
            <div className="flex items-center justify-between gap-4 p-6 rounded-lg bg-paper-2 border border-line/50">
              <div className="space-y-1">
                <p className="font-semibold text-ink text-sm">Master Email Dispatcher Switch</p>
                <p className="text-xs text-ink-muted leading-relaxed font-bold">
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
                  "w-11 h-6 rounded-lg transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0",
                  emailSystemOn ? "bg-blue-dark" : "bg-slate-200"
                )}
              >
                <div
                  className={cn(
                    "bg-white w-5 h-5 rounded-lg  transform transition-transform duration-250",
                    emailSystemOn ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Gmail integration standard defaults */}
            <div className="flex items-center justify-between gap-4 p-6 rounded-lg bg-paper-2 border border-line/50">
              <div className="space-y-1">
                <p className="font-semibold text-ink text-sm">Gmail Integration Default Activation</p>
                <p className="text-xs text-ink-muted leading-relaxed font-bold">
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
                  "w-11 h-6 rounded-lg transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0",
                  gmailOAuthOn ? "bg-blue-dark" : "bg-slate-200"
                )}
              >
                <div
                  className={cn(
                    "bg-white w-5 h-5 rounded-lg  transform transition-transform duration-250",
                    gmailOAuthOn ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Live Email Testing Form */}
            <div className="border border-orange-100 p-6 rounded-lg bg-amber/10 flex flex-col gap-4 animate-fadeIn">
              <div className="space-y-1">
                <p className="font-semibold text-orange-950 text-sm flex items-center gap-1.5 font-sans uppercase tracking-wide">
                  <Mail className="w-4 h-4 text-amber-dark animate-pulse" /> Send Live / Simulated Test Email
                </p>
                <p className="text-xs text-ink-muted leading-relaxed font-semibold">
                  Test the transactional system live! If your third-party credentials (Resend or SMTP) are invalid or unconfigured, the system will gracefully drop into the **Sandbox Fallback Mode** and generate a fully styled HTML email preview inside the dev log response below.
                  <br />
                  <em>Note: The <code>/api/email/history</code> API returns recent sends on this server instance only due to the serverless architecture.</em>
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-ink-muted uppercase tracking-wider block">Target Email Address</label>
                  <input
                    type="email"
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                    placeholder="e.g. you@domain.com"
                    className="w-full border border-line rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-amber font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-ink-muted uppercase tracking-wider block">Email Template</label>
                  <select
                    value={testEmailTemplate}
                    onChange={(e) => setTestEmailTemplate(e.target.value)}
                    className="w-full border border-line bg-white rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-amber font-bold"
                  >
                    <option value="welcome_student">Student Welcome Email</option>
                    <option value="application_status">Application Accepted Alert</option>
                    <option value="hours_confirmation">Logged & Signed Hours Receipt</option>
                    <option value="new_applicant">New Posting Applicant File</option>
                    {/* No 2FA or security-bulletin option: the server refuses
                        both by name (403), so offering them here would only
                        produce a button that always fails. */}
                    <option value="notification">General Notification</option>
                  </select>
                </div>
              </div>

              {testEmailStatus && (
                <div className="space-y-2">
                  <div className={cn(
                    "p-3 rounded-lg text-xs font-semibold leading-relaxed animate-fadeIn border",
                    testEmailStatus.success
                      ? "bg-blue-dark/5 border-blue-dark/10 text-blue-800"
                      : "bg-amber/10 border-orange-100 text-orange-800"
                  )}>
                    {testEmailStatus.message}
                  </div>
                  {testEmailStatus.success && <EmailDeliveryNote />}
                </div>
              )}

              <Button
                type="button"
                onClick={handleSendTestEmail}
                disabled={isSendingTestEmail || !testEmailTo}
                className="w-full bg-amber text-white hover:bg-amber font-semibold text-xs shadow-orange-500/10"
              >
                {isSendingTestEmail ? "Dispatching Delivery..." : "Send Test Email"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    ) : activeTab === 'verification' ? (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold uppercase text-ink-soft">Pending Organization Verification</h3>
        <p className="text-sm text-ink-muted">Organizations that submitted a CRA charity registration number. Verify each against the <a href="https://apps.cra-arc.gc.ca/ebci/hacc/srch/pub/dsplyBscSrch" target="_blank" rel="noopener noreferrer" className="text-blue-dark underline">CRA Charity Registry</a> before approving.</p>
        {pendingOrgs.length === 0 ? (
          <div className="text-center py-16 text-ink-muted text-sm font-semibold">No organizations pending verification.</div>
        ) : (
          <div className="space-y-4">
            {pendingOrgs.map(org => (
              <div key={org.uid} className="border border-line bg-white p-6 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-ink text-base">{org.organizationName}</h4>
                    <p className="text-xs text-ink-muted mt-1">{org.contactEmail} · {org.address || 'No address'}</p>
                  </div>
                  <span className="text-xs font-semibold uppercase bg-amber-100 text-amber-700 px-2 py-1">Pending</span>
                </div>
                <div className="bg-paper-2 p-3 font-mono text-sm tracking-wider text-ink-soft border border-line-light">
                  CRA #: <strong>{org.craNumber || 'Not provided'}</strong>
                </div>
                {org.mission && <p className="text-sm text-ink-muted">{org.mission}</p>}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => handleVerifyOrg(org.uid, 'verified')}
                    disabled={verifyingId === org.uid}
                    className="flex-1 h-10 bg-emerald-600 text-white text-xs font-semibold uppercase hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {verifyingId === org.uid ? '...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleVerifyOrg(org.uid, 'rejected')}
                    disabled={verifyingId === org.uid}
                    className="flex-1 h-10 bg-red-600 text-white text-xs font-semibold uppercase hover:bg-red-700 disabled:opacity-50 transition-colors"
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




