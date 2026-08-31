import  { useState, useEffect } from 'react';
import { API_BASE_URL } from '../lib/config';
import { isDeveloperEmail, isDeveloperUser } from '../lib/devAccess';
// Without this import `reportError` silently resolved to the DOM's global
// window.reportError — which takes one argument and returns void, so the
// error never reached the shared handler and never reached the console notice.
import { reportError } from '../lib/errors';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase/config';
import { doc, updateDoc, getDoc, serverTimestamp, writeBatch, getDocs, query, collection, where } from 'firebase/firestore';
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
  Settings,
  TrendingUp,
  Mail
} from 'lucide-react';
import { cn } from '../lib/utils';
import AttachmentPreview from '../components/AttachmentPreview';
import EmailDeliveryNote from '../components/ui/EmailDeliveryNote';
import ReportsTab from './developerDashboard/ReportsTab';
import MetricsTab from './developerDashboard/MetricsTab';
import { useDeveloperDashboardData } from '../hooks/useDeveloperDashboardData';
import UsersTab from './developerDashboard/UsersTab';

export default function DeveloperDashboard() {
  const { user, userProfile, isDemoMode, enableDemoMode } = useAuth();

  /** Everything this console reads. Both loaders come back so an action can refresh what it changed. */
  const {
    students, orgs, feedbacks, reports, interestRequests, pendingOrgs, pendingOrgsLoading,
    bannedStudents, bannedOrgs,
    realStudentCount, realOrgCount,
    isLoading, consoleNotice, setConsoleNotice,
    setStudents, setOrgs, setFeedbacks, setReports, setPendingOrgs,
    loadData,
  } = useDeveloperDashboardData(user, isDemoMode);

  // Test Email Client States
  const [testEmailTo, setTestEmailTo] = useState(user?.email || 'developer@example.com');
  // Console-wide banner. These messages were browser alert()s: blocking,
  // unstyled, and silent to screen readers. They are refusals a developer
  // needs to read, not dismiss reflexively.
  const [testEmailTemplate, setTestEmailTemplate] = useState('welcome_student');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Errors do NOT auto-dismiss. This state carries LOAD failures, not just
  // action toasts, and a timer on a load failure recreates the exact bug this
  // project keeps fixing: the message explaining why a list is empty deletes
  // itself, leaving "nothing here" over a queue that is not empty. The pattern
  // the codebase already settled on is OrgOpportunityApplicants — persist, and
  // give the reader an explicit Dismiss. Success toasts still auto-clear;
  // there is nothing to act on in those.

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
          message: `${res.status}: ${body.error || 'The email API returned a failure.'}${body.details ? `. ${body.details}` : ''}`
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

  // Entities Lists
  
  // Dashboard Interactive Creation / Click Toggles
  // All four of these gated content that was ALREADY LOADED. loadData() runs on
  // mount, so the splash screen, the "Click to Load" hints and the counters
  // rendering a literal 0 next to real data in memory bought nothing at all —
  // they were friction wearing the costume of a security control, and the first
  // one hid the entire console behind a button labelled "Create Control Room
  // Dashboard" for a dashboard that already existed.
  const [isDashboardActive, setIsDashboardActive] = useState(true);
  const [showStudentsList, setShowStudentsList] = useState(true);
  const [showOrgsList, setShowOrgsList] = useState(true);
  const [showReportsList, setShowReportsList] = useState(true);

  // General dashboard controls
  const [activeTab, setActiveTab] = useState<'feedbacks' | 'reports' | 'interests' | 'users' | 'terminated' | 'settings' | 'verification' | 'metrics'>('feedbacks');
  // "Join List" requests. Students pick categories they want opportunities in
  // and get "Added to waitlist!" — and until this tab existed, nothing in the
  // app ever read the collection, so no human saw a single one of them.

  // Org verification queue
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // System Settings state
  
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [emailLogError, setEmailLogError] = useState<string | null>(null);
  /**
   * Poll the transactional email log.
   *
   * The whole body used to be wrapped in `catch (e) {}` with the response
   * checked only as `if (res.ok)`, so a 403 or a throw left the list empty and
   * silent — indistinguishable from "no email has been sent". That matters more
   * now than it did: this route requires a VERIFIED developer address, and it
   * no longer honours a demo token, so an empty list is a real possibility with
   * a real cause worth naming.
   *
   * A transient blip between 15-second polls is not worth shouting about, so
   * the message only appears once the fetch has actually failed, and clears the
   * moment one succeeds.
   */
  const fetchEmailLogs = async () => {
    try {
      if (isDemoMode) {
        setEmailLogs([]);
        setEmailLogError('Email history is not available in demo mode.');
        return;
      }
      const authToken = await user?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/email/history`, {
        headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      });
      if (res.ok) {
        setEmailLogs(await res.json());
        setEmailLogError(null);
        return;
      }
      setEmailLogError(
        res.status === 403
          ? 'Your account cannot read the email log. It needs a developer role and a verified email address.'
          : `The email log could not be loaded (${res.status}).`,
      );
    } catch (e) {
      setEmailLogError('The email log could not be reached. Check your connection.');
    }
  };
  useEffect(() => {
    fetchEmailLogs();
    const interval = setInterval(fetchEmailLogs, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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





  const handleVerifyOrg = async (orgUid: string, decision: 'verified' | 'rejected') => {
    setVerifyingId(orgUid);
    try {
      if (isDemoMode) {
        setPendingOrgs(prev => prev.filter(o => o.uid !== orgUid));
        setVerifyingId(null);
        return;
      }
      /*
       * Server-side, because the decision has to reach the organisation.
       *
       * This was a bare updateDoc from the browser and nothing else, while
       * OrgDashboard promised "We will email you the moment it is done" and the
       * rejection banner told them to "reply to the email we sent". Nothing
       * sent anything. A coordinator who checks the site once a fortnight was
       * told to wait for an email, so they waited.
       *
       * /api/admin/verify-org re-checks the developer role (a client-side gate
       * on a privileged action is not a gate), writes the same fields, and
       * sends the message over the same Resend pipeline as everything else.
       * craVerified is still set only when a CRA number was actually submitted,
       * so approving a non-charity does not claim we checked a registration
       * they never had.
       */
      const token = await user?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/admin/verify-org`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgUid, decision }),
      });
      const body = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);

      // Say so when the decision landed but the message did not, rather than
      // letting the reviewer believe the organisation was told.
      if (body?.emailSent === false && body?.reason) {
        setConsoleNotice(
          `Decision saved, but the organization was NOT emailed: ${body.reason}. They may still be waiting.`,
        );
      }

      setPendingOrgs(prev => prev.filter(o => o.uid !== orgUid));
    } catch (err: any) {
      console.error('Verify org failed:', err);
      // consoleNotice, not developerDeleteError. That state is rendered only
      // under activeTab === 'users', and this handler is reachable only from
      // the VERIFICATION tab — so the message went to a panel the moderator
      // could not be looking at. They saw the spinner stop, the organization
      // stay in the queue, and nothing else: indistinguishable from a misfired
      // click, and the natural response is to click again, silently.
      setConsoleNotice(
        `Couldn't ${decision === 'verified' ? 'approve' : 'reject'} that organization. ` +
        `It is still in the queue. ${err?.message || err}`,
      );
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

    // Confirm before suspending. This fired on a single click, from buttons
    // sitting in the same row as Purge — which has a two-step inline confirm —
    // and from the reports tab. A suspended account hits the "Account Locked"
    // wall immediately, so a misclick locks a real student or organization out
    // of the site with no warning. Lifting a suspension is not destructive and
    // is left unconfirmed.
    const target =
      students.find((s) => s.uid === userId)?.fullName ||
      orgs.find((o) => o.uid === userId)?.organizationName ||
      'this account';
    if (!isCurrentlyBanned && !window.confirm(
      `Suspend ${target}? They are locked out immediately, and every open opportunity they own is taken off the student list. Lifting the suspension does NOT put those postings back.`
    )) return;

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

          /*
           * Postings come down AFTER the suspension, and separately.
           *
           * This was inside the batch above. A writeBatch is atomic, so when
           * the opportunity writes were refused the isBanned writes died with
           * them and suspending an organisation failed completely — only for
           * organisations that had live postings, which is every organisation
           * worth suspending. The rule now has a developer branch, but the
           * ordering is the real safeguard: locking the account out is the
           * safety-critical act, and it must not be contingent on a secondary
           * cleanup succeeding.
           *
           * Chunked at 400 because a batch caps at 500 writes, and closed
           * rather than deleted because the postings and the applications under
           * them are evidence. Lifting a suspension deliberately does not
           * reopen them: a person should decide what goes back in front of
           * students.
           */
          if (!isCurrentlyBanned && uData.role === 'organization') {
            try {
              const theirs = await getDocs(
                query(collection(db, 'opportunities'), where('orgId', '==', userId)),
              );
              const live = theirs.docs.filter((d) => d.data()?.status !== 'closed');
              for (let i = 0; i < live.length; i += 400) {
                const chunk = writeBatch(db);
                for (const d of live.slice(i, i + 400)) chunk.update(d.ref, { status: 'closed' });
                await chunk.commit();
              }
              if (live.length) {
                setConsoleNotice(`Suspended, and took ${live.length} posting(s) off the student list.`);
              }
            } catch (closeErr) {
              // The account IS suspended at this point. Say what still needs doing.
              console.error('Could not close postings for suspended org:', closeErr);
              setConsoleNotice(
                'Account suspended, but their postings could NOT be taken down and are still visible to students. Close them by hand.',
              );
            }
          }

        } else {
          /*
           * No users document, so nothing was written — and nothing said so.
           *
           * This `if` had no else at all: the handler fell straight through to
           * loadData(), the button returned, the card still showed the account
           * as active, and the moderator reasonably concluded the suspension
           * had worked. It is reachable from the SAFETY queue by design:
           * purgeAccount rewrites reportedUserId to `deleted_<uid>`, and the
           * reports tab passes that value straight into this handler. So the
           * one place where a silent no-op costs the most is the one place it
           * happens.
           */
          setActionError(
            'That account no longer exists, so nothing was changed. It may already have been deleted.',
          );
          return;
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

        <Card className="max-w-md p-8 border-line border space-y-4 bg-white rounded-lg">
          <ShieldAlert className="text-red-600 w-12 h-12 mx-auto" />
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
        <Card className="w-full max-w-xl mx-auto p-10 border border-line-light  rounded-lg bg-white text-center space-y-8 animate-fadeIn relative overflow-hidden">
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
      {/* consoleNotice is set in ten places — a failed feedback load, failed
          interest requests, failed safety reports, failed admin lists, a failed
          verification queue, permission refusals, a failed reply — and it used
          to be rendered ONLY inside the "Access Denied" early return above,
          which is a branch a real developer never reaches.
          So every one of those messages was produced and shown to nobody. The
          worst case is the safety-reports read failing: the tab then renders
          "All clear! No pending support logs found" over a queue of reports
          about minors, and a moderator reasonably concludes there is nothing to
          action. */}
      {consoleNotice && (
        <div
          role="alert"
          aria-live="assertive"
          className="px-4 py-3 text-[13px] font-semibold bg-red-50 border border-red-200 text-red-700 rounded-lg"
        >
          <span className="leading-relaxed">{consoleNotice}</span>
          <button
            onClick={() => setConsoleNotice(null)}
            aria-label="Dismiss notice"
            className="ml-3 shrink-0 underline underline-offset-2 hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}
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
                ? "bg-blue-dark border-blue-dark text-white "
                : "bg-white/5 border-white/5 text-white hover:bg-white/10"
            )}
          >
            <Users className={cn("w-5 h-5 mx-auto mb-1.5", showStudentsList ? "text-white" : "text-blue-400")} />
            <span className="block text-2xl font-bold">{showStudentsList ? realStudentCount : 0}</span>
            <span className="text-xs uppercase font-bold tracking-widest block opacity-70">STUDENTS</span>
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
                ? "bg-blue-dark border-blue-dark text-white "
                : "bg-white/5 border-white/5 text-white hover:bg-white/10"
            )}
          >
            <Building2 className={cn("w-5 h-5 mx-auto mb-1.5", showOrgsList ? "text-white animate-pulse" : "text-blue-400")} />
            <span className="block text-2xl font-bold">{showOrgsList ? realOrgCount : 0}</span>
            <span className="text-xs uppercase font-bold tracking-widest block opacity-70">ORGS</span>
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
                ? "bg-red-600 border-red-500 text-white "
                : "bg-white/5 border-white/5 text-white hover:bg-white/10"
            )}
          >
            <ShieldAlert className={cn("w-5 h-5 mx-auto mb-1.5", showReportsList && activeTab === 'reports' ? "text-white" : "text-red-400 animate-pulse")} />
            <span className="block text-2xl font-bold">{reports.length}</span>
            <span className="text-xs uppercase font-bold tracking-widest block opacity-70">REPORTS</span>
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
            {/* OPEN reports. This counted every status, so the badge never fell and
                said nothing about whether there was work waiting. */}
            <ShieldAlert className="w-4 h-4 text-red-600 animate-pulse" /> Safety Reports ({reports.filter((r: any) => (r.status ?? 'pending') === 'pending').length})
          </button>
          <button
            onClick={() => setActiveTab('interests')}
            className={cn(
              "pb-4 px-6 text-sm font-semibold uppercase border-b-4 transition-all flex items-center gap-2",
              activeTab === 'interests' ? "border-blue-dark text-ink" : "border-transparent text-ink-muted hover:text-ink-muted"
            )}
          >
            <Sparkles className="w-4 h-4" /> Interest Requests ({interestRequests.length})
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
            <Lock className="w-4 h-4 text-red-600" /> Suspended List ({bannedStudents.length + bannedOrgs.length})
          </button>
          <button
            onClick={() => setActiveTab('metrics')}
            className={cn(
              "pb-4 px-6 text-sm font-semibold uppercase border-b-4 transition-all flex items-center gap-2",
              activeTab === 'metrics' ? "border-blue-dark text-ink" : "border-transparent text-ink-muted hover:text-ink-muted"
            )}
          >
            <TrendingUp className="w-4 h-4 text-blue-dark" /> Metrics
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

                    <p className="text-ink-muted text-xs leading-relaxed font-semibold bg-paper-2 p-4 border border-line-light rounded-lg">
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
                          <div className="pl-6 border-l-2 border-slate-300 text-ink-muted">
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
                              <p className="text-orange-950 font-mono text-[10.5px] leading-relaxed">
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
          unloaded={isLoading || !!consoleNotice}
        />
      ) : activeTab === 'terminated' ? (
        /* TERMINATED BASE TAB */
        <div className="space-y-6">
          <div className="bg-red-50 border border-red-100 rounded-lg p-6 flex flex-col sm:flex-row items-center gap-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-100/30 rounded-lg blur-2xl pointer-events-none" />
            <div className="w-12 h-12 rounded-lg bg-red-500 flex items-center justify-center text-white shrink-0 ">
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
            <Card className="rounded-lg border border-line-light bg-white  overflow-hidden flex flex-col animate-fadeIn">
              <CardHeader className="border-b border-red-50 bg-red-50/10 p-6 md:p-8">
                <CardTitle className="text-xs font-bold text-rose-950 flex items-center gap-2 text-red-600 uppercase tracking-widest">
                  <Users className="w-4 h-4 text-red-600" /> Suspended Students ({bannedStudents.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 md:p-8 flex-1">
                {bannedStudents.length === 0 ? (
                  <div className="py-12 text-center text-ink-muted space-y-3">
                    <ShieldCheck className="w-10 h-10 text-blue-dark mx-auto" />
                    <p className="text-xs font-semibold uppercase text-ink-soft">
                      {/* A failed load leaves this array empty with isLoading
                          already false, so this made a positive claim about the
                          whole platform on the strength of a read that never
                          returned. */}
                      {consoleNotice ? 'Suspension list not loaded' : 'No Suspended Students'}
                    </p>
                    <p className="text-xs text-ink-muted font-medium">All students currently maintain active, good-standing credentials.</p>
                  </div>
                ) : (
                  <div className="space-y-4 divide-y divide-red-50/30">
                    {bannedStudents.map((st) => (
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
            <Card className="rounded-lg border border-line-light bg-white  overflow-hidden flex flex-col animate-fadeIn">
              <CardHeader className="border-b border-red-50 bg-red-50/10 p-6 md:p-8">
                <CardTitle className="text-xs font-bold text-rose-950 flex items-center gap-2 text-red-600 uppercase tracking-widest">
                  <Building2 className="w-4 h-4 text-red-600" /> Suspended Partners ({bannedOrgs.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 md:p-8 flex-1">
                {bannedOrgs.length === 0 ? (
                  <div className="py-12 text-center text-ink-muted space-y-3">
                    <ShieldCheck className="w-10 h-10 text-blue-dark mx-auto" />
                    <p className="text-xs font-semibold uppercase text-ink-soft">No Suspended Partners</p>
                    <p className="text-xs text-ink-muted font-medium">All partner organizations are verified and in good standing.</p>
                  </div>
                ) : (
                  <div className="space-y-4 divide-y divide-red-200/20">
                    {bannedOrgs.map((org) => (
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
        <UsersTab
          students={students}
          orgs={orgs}
          deleteTargetId={deleteTargetId}
          isUserDeletingId={isUserDeletingId}
          setDeleteTargetId={setDeleteTargetId}
          developerDeleteError={developerDeleteError}
          setDeveloperDeleteError={setDeveloperDeleteError}
          onDeleteUser={handleDeleteUser}
          onToggleBan={handleToggleBan}
        />
    ) : activeTab === 'metrics' ? (
      <MetricsTab />
    ) : activeTab === 'settings' ? (
      /* SYSTEM SETTINGS TAB */
      <div className="space-y-6 max-w-2xl animate-fadeIn">

        {/* Demo mode entry — developer-only, and the ONLY door in.
            The public "Just looking?" chips on the home page were removed once
            real organizations began onboarding: a coordinator landing in a
            dashboard of invented students, without realising it, had become a
            liability rather than a feature. The fixtures and the isDemoMode
            forks are unchanged; only entry moved. Entering swaps this real
            session for a mock one, so getting back means signing in again. */}
        <Card className="rounded-lg border border-amber-200 bg-amber-50/40 overflow-hidden">
          <div className="p-6 md:p-8 space-y-4">
            <div>
              <p className="font-semibold text-ink text-sm">Demo mode</p>
              <p className="text-xs text-ink-muted leading-relaxed mt-1">
                Walk the site as a fictional student or organization, on local fixture
                data. Nothing here reaches the real database. Entering ends your
                developer session — you will need to sign back in afterwards.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={async () => { await enableDemoMode('student'); window.location.href = '/student/dashboard'; }}
                className="h-11 px-5 rounded-lg border border-line bg-white text-sm font-semibold text-ink hover:border-blue-dark/40"
              >
                Enter as demo student
              </button>
              <button
                type="button"
                onClick={async () => { await enableDemoMode('organization'); window.location.href = '/org/dashboard'; }}
                className="h-11 px-5 rounded-lg border border-line bg-white text-sm font-semibold text-ink hover:border-blue-dark/40"
              >
                Enter as demo organization
              </button>
            </div>
          </div>
        </Card>
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
            {/* Two switches used to sit here: "Master Email Dispatcher Switch"
                and "Gmail Integration Default Activation". Neither controlled
                anything. Each wrote a localStorage key on the developer's own
                browser that no send path, server route or rule ever read — so
                the email switch claimed to turn ALL transactional mail on or
                off globally and did nothing at all. A moderator flipping it
                during an incident would believe mail had stopped while every
                message kept sending. A control that lies is worse than no
                control, so both are gone; the live send test below is real. */}
            {/* Live Email Testing Form */}
            <div className="border border-orange-100 p-6 rounded-lg bg-amber/10 flex flex-col gap-4 animate-fadeIn">
              <div className="space-y-1">
                <p className="font-semibold text-orange-950 text-sm flex items-center gap-1.5 font-sans uppercase tracking-wide">
                  <Mail className="w-4 h-4 text-amber-dark animate-pulse" /> Send Live / Simulated Test Email
                </p>
                <p className="text-xs text-ink-muted leading-relaxed font-semibold">
                  Test the transactional system live! If your third-party credentials (Resend or SMTP) are invalid or unconfigured, the system will gracefully drop into the **Sandbox Fallback Mode** and generate a fully styled HTML email preview inside the dev log response below.
                  <br />
                  <em>Sends are recorded in Firestore, so the log below is the same on every server instance.</em>
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-ink-muted uppercase tracking-wider block">Target Email Address</label>
                  <input
                    aria-label="Target Email Address"
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
                    aria-label="Email Template"
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
                className="w-full bg-amber-dark text-white hover:bg-amber-dark font-semibold text-xs "
              >
                {isSendingTestEmail ? "Dispatching Delivery..." : "Send Test Email"}
              </Button>
            </div>

            {/* Recent transactional sends.
                emailLogs was polled every 15 seconds and rendered NOWHERE — a
                request per open console, forever, for data nobody saw. The log
                is worth having in an admin console (knowing whether mail is
                actually going out is the first thing you check in an incident),
                so it is shown rather than the poll deleted. */}
            <div className="border border-line/50 p-6 rounded-lg bg-paper-2 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <p className="font-semibold text-ink text-sm">Recent Transactional Sends</p>
                <span className="text-xs text-ink-muted">refreshes every 15s</span>
              </div>

              {emailLogError ? (
                <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 leading-relaxed">
                  {emailLogError}
                </p>
              ) : emailLogs.length === 0 ? (
                <p className="text-xs text-ink-muted">
                  {/* There is no loading flag on this fetch, so the first paint
                      of System Settings always claimed no mail had ever been
                      sent while the request was still in flight. */}
                  {isLoading ? 'Loading the email log…' : 'No email has been sent yet.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-ink-muted border-b border-line">
                        <th className="py-2 pr-4 font-semibold">When</th>
                        <th className="py-2 pr-4 font-semibold">To</th>
                        <th className="py-2 pr-4 font-semibold">Subject</th>
                        <th className="py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emailLogs.slice(0, 25).map((log: any) => (
                        <tr key={log.id} className="border-b border-line-light last:border-0 align-top">
                          <td className="py-2 pr-4 whitespace-nowrap text-ink-muted">
                            {log.at ? new Date(log.at).toLocaleString() : '—'}
                          </td>
                          <td className="py-2 pr-4 break-all">{log.to}</td>
                          <td className="py-2 pr-4">{log.subject}</td>
                          <td className="py-2">
                            <span className={cn(
                              "font-semibold px-2 py-0.5 rounded-lg border text-xs",
                              log.status === 'sent'
                                ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                : log.status === 'failed'
                                  ? "text-red-700 bg-red-50 border-red-200"
                                  : "text-ink-soft bg-paper-2 border-line",
                            )}>
                              {log.status}
                            </span>
                            {log.error && <p className="text-red-600 mt-1 leading-relaxed">{log.error}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </CardContent>
        </Card>
      </div>
    ) : activeTab === 'interests' ? (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold uppercase text-ink-soft">Category Interest Requests</h3>
        <p className="text-sm text-ink-muted">
          Students who used "Join List" to say what they want to volunteer in. They were told they
          were added to a waitlist, so these are worth acting on — recruit organizations in these
          categories, or email the students when something matches.
        </p>
        {interestRequests.length === 0 ? (
          <div className="text-center py-16 text-ink-muted text-sm font-semibold">No interest requests yet.</div>
        ) : (
          <div className="space-y-4">
            {interestRequests.map((r: any) => (
              <div key={r.id} className="border border-line bg-white p-6 space-y-3">
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <h4 className="font-bold text-ink text-base truncate">{r.studentName || 'Student'}</h4>
                    <p className="text-xs text-ink-muted mt-1 truncate">{r.email || 'No email on file'}</p>
                  </div>
                  <span className="text-xs text-ink-muted shrink-0 whitespace-nowrap">
                    {r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000).toLocaleDateString() : ''}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(r.categories || []).map((c: string) => (
                    <span key={c} className="text-xs font-semibold bg-blue-dark/5 text-blue-dark border border-blue-dark/10 px-2.5 py-1 rounded-lg">
                      {c}
                    </span>
                  ))}
                </div>
                {r.description && (
                  <p className="text-sm text-ink-soft leading-relaxed border-t border-line-light pt-3">{r.description}</p>
                )}
                {r.email && (
                  <a
                    href={`mailto:${r.email}?subject=${encodeURIComponent('Volunteer opportunities in your areas of interest')}`}
                    className="inline-block text-xs font-semibold text-blue-dark underline underline-offset-2"
                  >
                    Email this student
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    ) : activeTab === 'verification' ? (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold uppercase text-ink-soft">Pending Organization Verification</h3>
        <p className="text-sm text-ink-muted">Every organization waiting to be let in. Charities give a CRA number to check against the <a href="https://apps.cra-arc.gc.ca/ebci/hacc/srch/pub/dsplyBscSrch" target="_blank" rel="noopener noreferrer" className="text-blue-dark underline">CRA Charity Registry</a>; the rest have to be judged on their website and address. Nobody can post until you approve them.</p>
        {/* The loading state comes FIRST. "No organizations pending
            verification." while the query is still running is the one message
            this tab must never show by mistake: an organisation that has been
            waiting looks identical to nothing to do, and the reviewer closes
            the page. */}
        {pendingOrgsLoading ? (
          <div className="text-center py-16 text-ink-muted text-sm font-semibold">Loading the verification queue...</div>
        ) : pendingOrgs.length === 0 ? (
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
                  <span className={`text-xs font-semibold uppercase px-2 py-1 ${
                    org.craNumber ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-ink-soft'
                  }`}>{org.craNumber ? 'Charity' : 'No CRA'}</span>
                </div>
                {org.craNumber ? (
                  <div className="bg-paper-2 p-3 border border-line-light space-y-1">
                    <p className="font-mono text-sm tracking-wider text-ink-soft">
                      CRA #: <strong>{org.craNumber}</strong>
                    </p>
                    <p className="text-xs text-ink-muted">
                      Look this up in the CRA registry and check the name matches before approving.
                    </p>
                  </div>
                ) : (
                  /*
                   * Not an error state. An organization can say it is not a registered
                   * charity and still be entirely real — a clinic, a retirement home, a
                   * BIA, a sports club. Before 28 Aug 2026 these never reached this queue
                   * at all, so they could join and then do nothing, forever. There is
                   * simply no CRA number to look up, so the check is a different one.
                   */
                  <div className="bg-paper-2 p-3 border border-line-light space-y-1">
                    <p className="text-sm text-ink-soft">
                      <strong>Not a registered charity.</strong> Nothing to look up in the CRA registry.
                    </p>
                    <p className="text-xs text-ink-muted">
                      Check they are real another way: open their website, confirm the address is in
                      or near North York, and see that the contact email matches their domain.
                    </p>
                    {org.websiteUrl && (
                      <a href={org.websiteUrl} target="_blank" rel="noopener noreferrer"
                         className="inline-block text-xs font-semibold text-blue-dark underline underline-offset-2">
                        {org.websiteUrl}
                      </a>
                    )}
                  </div>
                )}
                <p className="text-xs text-ink-muted">
                  {org.organizationType || 'No type given'}
                  {org.northYorkConfirmed ? ' · confirmed North York' : ' · did not confirm North York'}
                </p>
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
                    onClick={() => {
                    /*
                     * Confirmed, because this one does not come back.
                     *
                     * Suspend is reversible and pops a named confirm; Purge has
                     * a two-step inline confirm; Reject had neither, sat flush
                     * against Approve at the same size, and is the most final
                     * of the three. It closes every posting they own, emails
                     * them, and drops them out of this queue — which only lists
                     * 'pending' and 'unverified' — with no control anywhere in
                     * the console that can set a status back. An organisation
                     * WITH a CRA number can crawl back by re-saving its
                     * profile; a non-charity, which is most of the ones this
                     * queue was widened for, cannot.
                     */
                    const ok = window.confirm(
                      `Reject ${org.organizationName || 'this organization'}?

` +
                      'This closes every opportunity they have posted and emails them. ' +
                      'They will drop out of this queue and cannot be re-reviewed from here.',
                    );
                    if (ok) handleVerifyOrg(org.uid, 'rejected');
                  }}
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




