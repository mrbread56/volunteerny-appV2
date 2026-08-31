import React, { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from '../lib/config';
import { useDialog } from "../hooks/useDialog";
import { useAuth } from "../contexts/AuthContext";
import { db, auth } from "../firebase/config";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  limit,
} from "firebase/firestore";
import { Application, StudentProfile } from "../types";
import {
  Card,
} from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  PlusCircle,
  ClipboardList,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
} from "lucide-react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import RejectionDialog from "../components/RejectionDialog";
import ApplicationReviewDialog from "../components/ApplicationReviewDialog";
import { serverTimestamp } from "firebase/firestore";
import { sendTransactionalEmail, notifyApplicant } from "../lib/emailService";
import { capacityRefusal } from '../lib/opportunityCapacity';
import { promoteWaitlistedApplicant } from "../lib/waitlistService";
import { requestLeaderboardRebuild } from "../lib/scalableLeaderboard";
import { reportError } from "../lib/errors";
import { approveStudentHours } from "../lib/approveHours";
import { fetchReviewProfile } from "../lib/reviewProfile";
import { toUserMessage } from "../lib/errors";
import HoursTab from './orgDashboard/HoursTab';
import { useOrgDashboardData } from '../hooks/useOrgDashboardData';
import OrgApplicationsTab from './orgDashboard/OrgApplicationsTab';

/**
 * Turn a failed hours read into something the coordinator can act on.
 *
 * Shared by the total-failure catch and the partial-failure branch, because
 * both have the same one real cause and the same one real remedy, and the
 * partial case is the more dangerous of the two: it renders a SHORT list that
 * is indistinguishable from a complete one.
 *
 * permission-denied here means the coordinatorContact rule refused the read,
 * and that rule requires a VERIFIED address. It is what stops anyone
 * registering a coordinator's address and reading every student's hours
 * submitted to it. Nothing forces an organisation to click its verification
 * link before reaching this page, and "please refresh" is useless against that,
 * so say what will actually work.
 */
function describeHoursReadFailure(err: any, partial: boolean): { message: string; needsVerification: boolean } {
  const needsVerification =
    err?.code === 'permission-denied' && auth.currentUser?.emailVerified === false;

  if (needsVerification) {
    // The old copy was "We sent a link when you signed up, open it." That link
    // went out over Firebase's unauthenticated mailer, the one already found to
    // deliver nothing, and there was no way to ask for another. The banner this
    // message points at offers to send one over the pipeline that works.
    return {
      needsVerification: true,
      message: partial
        ? "Some hours requests are hidden until you confirm your email address, so this list is incomplete. Use the button below to send yourself a new link, then sign out and back in."
        : "Confirm your email address before you can see hours awaiting approval. Use the button below to send yourself a new link, then sign out and back in.",
    };
  }

  return {
    needsVerification: false,
    message: reportError(
      'load hours requests',
      err,
      partial
        ? "Part of your hours queue could not be loaded, so this list may be incomplete. Please refresh to try again."
        : "We couldn't load the hours awaiting your approval. Please refresh to try again.",
    ),
  };
}

export default function OrgDashboard() {
  const {
    user,
    orgProfile,
    isDemoMode,
  } = useAuth();
  const navigate = useNavigate();

  /** Everything this page reads. See the hook for why it looks the way it does. */
  const {
    opportunities, recentApplications, isLoading, errorMessage,
    setErrorMessage, setOpportunities, setRecentApplications,
  } = useOrgDashboardData(user, isDemoMode);
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";

  const getGoogleCalendarFallbackUrl = (opp: any) => {
    try {
      const oppDateStr = opp.dateTime 
        ? new Date(opp.dateTime.seconds ? opp.dateTime.seconds * 1000 : opp.dateTime).toISOString().split('T')[0] 
        : new Date().toISOString().split('T')[0];
      let startTimeStr = '09:00';
      let endTimeStr = '12:00';

      if (opp.shifts && opp.shifts[0]) {
        startTimeStr = opp.shifts[0].startTime || '09:00';
        endTimeStr = opp.shifts[0].endTime || '12:00';
      }

      const startObj = new Date(`${oppDateStr}T${startTimeStr}:00`);
      const endObj = new Date(`${oppDateStr}T${endTimeStr}:00`);

      const formatGoogleDate = (date: Date) => {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        const hh = String(date.getUTCHours()).padStart(2, '0');
        const mm = String(date.getUTCMinutes()).padStart(2, '0');
        const ss = String(date.getUTCSeconds()).padStart(2, '0');
        return `${y}${m}${d}T${hh}${mm}${ss}Z`;
      };

      const datesParam = `${formatGoogleDate(startObj)}/${formatGoogleDate(endObj)}`;
      const detailsParam = `${opp.description || ''}\n\nOrganization: ${orgProfile?.organizationName || 'Community Partner'}\nCategory: ${opp.category || 'Volunteer'}\n\nSynced via Volunteer NY.`;
      
      const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: `Volunteer Event: ${opp.title}`,
        dates: datesParam,
        details: detailsParam,
        location: opp.location || 'North York, NY',
      });

      return `https://calendar.google.com/calendar/u/0/r/eventedit?${params.toString()}`;
    } catch {
      return `https://calendar.google.com/calendar`;
    }
  };
  const stats = React.useMemo(
    () => ({
      totalOpps: opportunities.length,
      totalApps: recentApplications.length,
      pendingApps: recentApplications.filter((a) => a.status === "pending")
        .length,
      acceptedApps: recentApplications.filter((a) => a.status === "accepted")
        .length,
      rejectedApps: recentApplications.filter((a) => a.status === "rejected")
        .length,
    }),
    [opportunities, recentApplications],
  );
  const [rejectionModalApp, setRejectionModalApp] =
    useState<Application | null>(null);
  const [reviewApp, setReviewApp] = useState<Application | null>(null);
  const [reviewStudent, setReviewStudent] = useState<StudentProfile | null>(
    null,
  );
  const [filterTab, setFilterTab] = useState<"all" | "pending" | "accepted">(
    "pending",
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedStatPopup, setSelectedStatPopup] = useState<
    "opportunities" | "pending" | "accepted" | "rejected" | null
  >(null);
  const closeStatPopup = React.useCallback(() => setSelectedStatPopup(null), []);
  const statDialogRef = useDialog(!!selectedStatPopup, closeStatPopup);

  // Search input States
  const [oppSearchTerm, setOppSearchTerm] = useState("");
  const [appSearchTerm, setAppSearchTerm] = useState("");
  const [reqSearchTerm, setReqSearchTerm] = useState("");

  const filteredOpportunities = React.useMemo(() => {
    if (!oppSearchTerm) return opportunities;
    const term = oppSearchTerm.toLowerCase();
    return opportunities.filter(o => 
      o.title?.toLowerCase().includes(term) ||
      o.location?.toLowerCase().includes(term) ||
      o.category?.toLowerCase().includes(term)
    );
  }, [opportunities, oppSearchTerm]);

  const filteredApplications = React.useMemo(() => {
    if (!appSearchTerm) return recentApplications;
    const term = appSearchTerm.toLowerCase();
    return recentApplications.filter(a => 
      a.studentName?.toLowerCase().includes(term) ||
      a.opportunityTitle?.toLowerCase().includes(term) ||
      (a.message && a.message.toLowerCase().includes(term))
    );
  }, [recentApplications, appSearchTerm]);

  // Organization Direct Student Credits Logger States
  const [studentsList, setStudentsList] = useState<
    { id: string; fullName: string }[]
  >([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [logDate, setLogDate] = useState("");
  const [logHours, setLogHours] = useState("");
  const [logActivity, setLogActivity] = useState("");
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);
  const [logResultStatus, setLogResultStatus] = useState<string | null>(null);
  // Survives re-renders and the failed attempt itself, which a state value
  // would too — but a ref avoids re-rendering the form on every keystroke of
  // the retry. Cleared on success; see handleOrgLogSubmit.
  const logClientRef = useRef<string | null>(null);

  // Set when the hours read failed specifically because the address is
  // unconfirmed, so the banner can offer a new link instead of pointing at one
  // that may never have arrived.
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'already' | 'error'>('idle');

  /*
   * Changing any field starts a NEW attempt.
   *
   * The idempotency key is what stops a retry after a failed post-commit tail
   * from crediting the hours twice. But the coordinator is looking at an error
   * message above a form that still holds everything they typed — and the
   * obvious reason to press the button again is that they spotted a mistake.
   * Reusing the key there would match the entry already written, discard the
   * correction, and report "Successfully logged and authorized hours!" over a
   * record that still says 8 when they meant 4. Silently, on a graduation
   * record.
   *
   * So the key survives an unchanged retry, which is the case it exists for,
   * and is abandoned the moment the submission is no longer the same
   * submission.
   */
  const withNewAttempt = <T,>(setter: (v: T) => void) => (v: T) => {
    logClientRef.current = null;
    setter(v);
  };

  // Verification request inbox states
  const [hoursRequests, setHoursRequests] = useState<any[]>([]);
  const [isApprovingId, setIsApprovingId] = useState<string | null>(null);

  const filteredHoursRequests = React.useMemo(() => {
    if (!reqSearchTerm) return hoursRequests;
    const term = reqSearchTerm.toLowerCase();
    return hoursRequests.filter(r => 
      r.studentName?.toLowerCase().includes(term) ||
      r.studentEmail?.toLowerCase().includes(term) ||
      r.activity?.toLowerCase().includes(term)
    );
  }, [hoursRequests, reqSearchTerm]);

  const fetchHoursRequests = async () => {
    if (!user) return;
    if (isDemoMode) {
      const saved = JSON.parse(localStorage.getItem("demo_hours_requests") || "[]");
      setHoursRequests(saved.filter((r: any) => r.status === "pending"));
      return;
    }
    try {
      /*
       * Two queries, because the address is not a reliable address.
       *
       * This read only coordinatorContact == the account's LOGIN email, while
       * the student's form is prefilled from the organisation's PUBLIC contact
       * email — a required field OrgProfile explicitly invites them to change.
       * The moment those two differ, every hours request to this organisation
       * became invisible here, in the notification bell, and to the rules, with
       * no error anywhere: the student was told it was submitted and the
       * coordinator saw an empty queue. Hours that never reach the record are
       * hours a student cannot graduate with.
       *
       * orgId is the identity and cannot drift. The email query is kept for
       * rows written before it existed, and for the "Other / Unlisted" branch
       * where there is no account behind the address. Results are merged by
       * document id so a row matching both is not counted twice.
       */
      const base = [where("status", "==", "pending"), limit(300)] as const;
      /*
       * The errors are CAPTURED, not discarded.
       *
       * These two were `.catch(() => null)` and the failure below threw a bare
       * `new Error('both hours queries failed')`. A plain Error has no `.code`,
       * so the permission-denied branch in the catch could never match, and the
       * "Send me a new link" button that branch renders became unreachable the
       * moment it was written. Swallowing an error to keep a sibling query
       * alive is right; swallowing which error it was is not.
       */
      let idErr: any = null;
      let emailErr: any = null;
      const [byId, byEmail] = await Promise.all([
        getDocs(query(collection(db, "hoursRequests"), where("orgId", "==", user.uid), ...base))
          .catch((err) => { idErr = err; return null; }),
        getDocs(query(
          collection(db, "hoursRequests"),
          where("coordinatorContact", "==", (user.email || "").trim().toLowerCase()),
          ...base,
        )).catch((err) => { emailErr = err; return null; }),
      ]);
      if (!byId && !byEmail) throw idErr || emailErr;
      const merged = new Map<string, any>();
      for (const snapshot of [byId, byEmail]) {
        for (const d of snapshot?.docs || []) merged.set(d.id, d);
      }
      const snap = { docs: [...merged.values()] };
      const list = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      setHoursRequests(list);

      /*
       * One query answered and the other did not, so this queue is INCOMPLETE
       * and looks exactly like a short one.
       *
       * This is the realistic case, not an edge: the orgId rule deliberately
       * carries no email_verified requirement (a uid cannot be spoofed) while
       * the coordinatorContact rule requires one, so an organisation that has
       * not confirmed its address is ALLOWED on the first query and DENIED on
       * the second. Every legacy row and every "Other / Unlisted" row silently
       * disappears from the list. Rendering that as a normal result is the same
       * failure this block was written to stop, one layer further in.
       */
      const partialErr = idErr || emailErr;
      if (partialErr) {
        const { message, needsVerification } = describeHoursReadFailure(partialErr, true);
        setErrorMessage(message);
        setNeedsEmailVerification(needsVerification);
      } else {
        setNeedsEmailVerification(false);
      }
    } catch (e: any) {
      // Deliberately no demo-fixture fallback. An organization seeing invented
      // pending requests, or an empty queue that is really a failed read, both
      // lead to a real student's hours going unapproved.
      const { message, needsVerification } = describeHoursReadFailure(e, false);
      setErrorMessage(message);
      setNeedsEmailVerification(needsVerification);
      setHoursRequests([]);
    }
  };

  /** Send another confirmation link, over the pipeline that actually delivers. */
  const handleResendVerification = async () => {
    if (!user) return;
    setResendState('sending');
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/auth/send-verification`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not send the link.');
      setResendState(body?.alreadyVerified ? 'already' : 'sent');
    } catch (err: any) {
      setResendState('error');
      setErrorMessage(err?.message || 'We could not send a new confirmation link. Please try again.');
    }
  };

  useEffect(() => {
    fetchHoursRequests();
  }, [user, isDemoMode]);

  const handleApproveHoursRequest = async (req: any, approved: boolean) => {
    // Set from the server's response on the approved path; see below.
    let serverConfirmed = false;
    setIsApprovingId(req.id);
    try {
      if (isDemoMode) {
        const savedRequests = JSON.parse(localStorage.getItem("demo_hours_requests") || "[]");
        const updatedRequests = savedRequests.map((r: any) => 
          r.id === req.id ? { ...r, status: approved ? "approved" : "declined" } : r
        );
        localStorage.setItem("demo_hours_requests", JSON.stringify(updatedRequests));

        if (approved) {
          const newLogItem = {
            id: `log-req-${req.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            activity: req.activity + ` (${orgProfile?.organizationName || "Verified Partner"})`,
            hours: req.hours,
            date: req.date,
            coordinatorName: orgProfile?.organizationName || "Supervisor",
            coordinatorContact: user?.email || "coordination@volunteerny.ca",
            approved: true
          };

          const alexProfile = JSON.parse(localStorage.getItem("demo_student_profile") || "{}");
          alexProfile.loggedHours = [...(alexProfile.loggedHours || []), newLogItem];
          localStorage.setItem("demo_student_profile", JSON.stringify(alexProfile));
        }

        setSuccessMessage(approved ? "Hours approved successfully!" : "Hours request declined.");
        await fetchHoursRequests();
      } else {
        if (approved) {
          // Server-side, not updateDoc. The rules cannot check that this
          // organization has any relationship to this student — hasOnly()
          // restricts which fields are written, never whose document — so the
          // authority lives behind /api/hours/approve, which can query
          // applications and opportunities to prove it. It settles the
          // hoursRequest in the same transaction, so the request can no longer
          // be marked approved while the credit failed.
          // Rejects rather than resolving on refusal, so a 403 from the
          // relationship check skips the success message below and lands in
          // this function's catch, which shows the server's wording.
          const credited = await approveStudentHours({
            studentId: req.studentId,
            hours: Number(req.hours),
            activity: `${req.activity} (${orgProfile?.organizationName || req.organization})`,
            date: req.date,
            requestId: req.id,
          });
          // The SERVER sends hours_confirmation on approval, and now reports
          // whether it went. See the send below: this page was sending the very
          // same template a second time, so every approved student received two
          // identical confirmations.
          serverConfirmed = credited.confirmationSent === true;
        } else {
          // Server-side, like approving. The rule that used to allow this
          // from the client identified the coordinator by an email the STUDENT
          // wrote, so it also let a student settle their own request.
          // Throws with a message safe to show; the surrounding catch reports it.
          await approveStudentHours({
            studentId: req.studentId,
            hours: 0,
            approved: false,
            requestId: req.id,
          });
        }

        setSuccessMessage(approved ? "Hours approved successfully!" : "Hours request declined.");
        await fetchHoursRequests();

        // The student's hour total just changed, so the materialised
        // /leaderboards/global_top document is now stale. Fire-and-forget; the
        // server throttles and also rebuilds on a timer.
        if (approved) void requestLeaderboardRebuild();
      }

      // Guarded. This sat AFTER the demo/real fork rather than inside the real
      // branch, so a demo session mailed whatever address the fixture carried,
      // for real, from our verified domain.
      /*
       * The RESOLVED value is checked, not just a .catch().
       *
       * sendTransactionalEmail never rejects — its whole body sits in one try
       * whose catch RETURNS `{ success: false }`, and a non-2xx response
       * (403 recipient refusal, 429 rate limit, 502 Resend rejection, 503 no
       * API key) returns the same. So the .catch() attached here was dead code
       * and the failure was invisible: the coordinator saw "Hours approved
       * successfully!" and the student was never told their hours had moved.
       * handleSendReminder in StudentDashboard already reads .success and even
       * documents the behaviour; this call site was never updated.
       */
      /*
       * DECLINES only. /api/hours/approve already sends hours_confirmation on
       * the approved path, so this was a duplicate: the student got the same
       * confirmation twice, from two code paths, with slightly different copy.
       * The decline path has no server-side send, so it still runs here.
       */
      const mail = (isDemoMode || approved)
        ? { success: isDemoMode ? true : serverConfirmed }
        : await sendTransactionalEmail({
        to: req.studentEmail,
        subject: approved
          ? `${req.hours} volunteer hours approved`
          : `Update on your volunteer hours submission`,
        templateName: approved ? "hours_confirmation" : "notification",
        // The template body used to be hardcoded to the DECLINED wording, so
        // the subject said "hours approved" while the email itself told the
        // student their hours were not approved. Branch the copy properly.
        templateData: approved
          ? {
              heading: "Your volunteer hours were approved",
              // No "official transcript" and no "count toward your graduation
              // total". That is the sentence emailTemplates.ts removed from
              // hours_confirmation for being false: nothing here is a
              // transcript, and the app's own printed record says in its footer
              // that the student still needs their school board's form. It
              // survived here only because the approved branch selects
              // hours_confirmation, which ignores `details` -- one template
              // switch from shipping.
              details: `${orgProfile?.organizationName || "The organization"} confirmed the ${req.hours} hours you submitted for "${req.activity}". Your running total on the dashboard has been updated. You still need your school board's own community involvement form signed.`,
              studentName: req.studentName,
              oppTitle: req.activity,
              hours: req.hours,
              activity: req.activity,
              orgName: orgProfile?.organizationName || "The organization",
              supervisorName: req.coordinatorName || "Site Supervisor",
              subject: "Volunteer Hours Approved",
            }
          : {
              heading: "Your volunteer hours were not approved",
              details: `${orgProfile?.organizationName || "The organization"} reviewed the ${req.hours} hours you submitted for "${req.activity}" and was not able to approve them. If you think this is a mistake, talk to your supervisor and then submit the hours again from your dashboard. A declined request cannot be reopened, so it has to be a new submission.`,
              studentName: req.studentName,
              oppTitle: req.activity,
              hours: req.hours,
              activity: req.activity,
              orgName: orgProfile?.organizationName || "The organization",
              supervisorName: req.coordinatorName || "Site Supervisor",
              subject: "Volunteer Hours Update",
            }
      });

      if (!mail.success) {
        setErrorMessage(
          `The hours were ${approved ? 'approved' : 'declined'}, but we could not email ${req.studentName || 'the student'}. ` +
          'Please let them know directly.',
        );
      }

    } catch (err: any) {
      // This previously only logged to the console: the org clicked Approve,
      // the spinner stopped, and nothing indicated success or failure, so they
      // had no way to know the hours were never credited.
      console.error("Failed to update hours status:", err);
      setErrorMessage(
        err?.message ||
          (approved
            ? "Couldn't approve these hours. Please check your connection and try again."
            : "Couldn't decline this request. Please check your connection and try again.")
      );
    } finally {
      setIsApprovingId(null);
    }
  };

  // Fetch the registered list of students in the area for authorization logging
  useEffect(() => {
    const fetchStudents = async () => {
      if (isDemoMode) {
        setStudentsList([
          { id: "demo-student-1", fullName: "Alex Volunteer" },
          { id: "demo-student-2", fullName: "Michael Smith" },
          { id: "demo-student-3", fullName: "Emily North" },
        ]);
        return;
      }
      try {
        // Live Mode: Securely derive from applicants who have applied to your postings!
        // This stops broad querying of the students collection which leaks youth profile data.
        const list = recentApplications.map((app) => ({
          id: app.studentId,
          fullName: app.studentName || "Anonymous Student",
        }));
        // Deduplicate the list
        const uniqueList = list.filter(
          (st, idx, self) => self.findIndex((s) => s.id === st.id) === idx
        );
        setStudentsList(uniqueList);
      } catch (e) {
        console.error("Failed to load students list securely:", e);
      }
    };
    fetchStudents();
  }, [isDemoMode, recentApplications]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Errors do NOT auto-dismiss. This state carries LOAD failures, not just
  // action toasts, and a timer on a load failure recreates the exact bug this
  // project keeps fixing: the message explaining why a list is empty deletes
  // itself, leaving "nothing here" over a queue that is not empty. The pattern
  // the codebase already settled on is OrgOpportunityApplicants — persist, and
  // give the reader an explicit Dismiss. Success toasts still auto-clear;
  // there is nothing to act on in those.


  const updateAppStatus = async (
    appId: string,
    newStatus: "accepted" | "rejected" | "terminated",
    rejectionData?: { reason: string; note: string },
  ): Promise<{ success: boolean; emailSent: boolean; receiptGenerated: boolean; error?: string }> => {
    let emailSent = false;
    let receiptGenerated = false;

    // Send email via Workspace Gmail integration if configured
    const dispatchEmailNotification = async (
      currentRecentApps: Application[],
    ) => {
      if (isDemoMode) return;

      try {
        // Resolved and sent server-side — the browser cannot read
        // users/{studentId}. See POST /api/applications/notify, and the note on
        // the identical call in OrgOpportunityApplicants.tsx.
        const emailResult = await notifyApplicant({
          applicationId: appId,
          status: newStatus as "accepted" | "rejected" | "terminated",
          reason: rejectionData?.reason,
          note: rejectionData?.note,
        });
        emailSent = emailResult.success;
        if (!emailResult.success) {
          console.error("Applicant status email was not delivered:", emailResult.error);
          setErrorMessage(
            `The status was saved, but we could not email the applicant. ${emailResult.error || ""}`.trim()
          );
        }
      } catch (e) {
        console.error("Failed to dispatch the applicant notification:", e);
      }
    };


    if (isDemoMode) {
      let updated: Application[] = [];
      setRecentApplications((prev) => {
        updated = prev.map((a) =>
          a.id === appId
            ? {
                ...a,
                status: newStatus,
                rejectionReason: rejectionData?.reason,
                rejectionNote: rejectionData?.note,
              }
            : a,
        );
        localStorage.setItem("demo_applications", JSON.stringify(updated));
        return updated;
      });
      setSuccessMessage(`Application ${newStatus} successfully!`);
      const fullDemoApps = JSON.parse(localStorage.getItem("demo_applications") || "[]");
      await dispatchEmailNotification(fullDemoApps);
      receiptGenerated = newStatus === "accepted";
      return { success: true, emailSent, receiptGenerated };
    }
    try {
      // Capacity, before the write. The same guard runs on the applicants page;
      // this is the second of the two places a coordinator clicks Accept, and
      // neither one checked maxVolunteers against the accepted count. See
      // capacityRefusal for why it fails closed.
      if (newStatus === "accepted") {
        const app = recentApplications.find((a) => a.id === appId);
        const oppForCap = opportunities.find((o: any) => o.id === app?.opportunityId);
        if (app?.opportunityId) {
          const refusal = await capacityRefusal(app.opportunityId, oppForCap?.maxVolunteers);
          if (refusal) {
            setErrorMessage(refusal);
            return { success: false, emailSent: false, receiptGenerated: false };
          }
        }
      }

      const updates: any = {
        status: newStatus,
        // When the decision was made, so the student's notification bell can
        // tell a fresh decision from the moment they applied. Without it the
        // unread badge never fired for an acceptance or a rejection.
        decidedAt: serverTimestamp(),
      };

      if (newStatus === "rejected" && rejectionData) {
        updates.rejectionReason = rejectionData.reason;
        updates.rejectionNote = rejectionData.note;
      }

      try {
        await updateDoc(doc(db, "applications", appId), updates);
      } catch (dbErr) {
        throw dbErr;
      }

      setSuccessMessage(`Application ${newStatus} successfully!`);

      let updatedApps: Application[] = [];
      setRecentApplications((prev) => {
        updatedApps = prev.map((a) =>
          a.id === appId
            ? {
                ...a,
                status: newStatus,
                rejectionReason: rejectionData?.reason,
                rejectionNote: rejectionData?.note,
              }
            : a,
        );
        return updatedApps;
      });

      // Fetch snapshot to notify with email
      const recentAppsSnapshot = [...recentApplications];
      const targetIndex = recentAppsSnapshot.findIndex(a => a.id === appId);
      if (targetIndex !== -1) {
        recentAppsSnapshot[targetIndex] = {
          ...recentAppsSnapshot[targetIndex],
          status: newStatus,
          rejectionReason: rejectionData?.reason,
          rejectionNote: rejectionData?.note,
        };
      }
      await dispatchEmailNotification(recentAppsSnapshot);
      receiptGenerated = newStatus === "accepted";

      const targetApp = recentApplications.find((a) => a.id === appId) ||
        (isDemoMode ? JSON.parse(localStorage.getItem("demo_applications") || "[]").find((a: any) => a.id === appId) : null);
      const oppId = targetApp?.opportunityId;
          // The return value is USED. promoteWaitlistedApplicant reports
          // whether the promoted student was actually emailed, its own comment
          // says "reported so the caller can surface it", and both callers threw
          // it away. A student was moved off the waitlist into an accepted
          // placement, the mail failed, and the only record was a console line
          // nobody reads: they held a place they were never told about and
          // missed the shift.
      if (oppId && (newStatus === "rejected" || newStatus === "terminated")) {
        const promoted: any = await promoteWaitlistedApplicant(oppId, orgProfile?.organizationName || "The organization");
        if (promoted && promoted.emailSent === false) {
          setErrorMessage(
            `${promoted.studentName || 'A waitlisted student'} was moved off the waitlist and accepted, ` +
            'but we could not email them. Please contact them directly so they know they have a place.',
          );
        }
      }

      return { success: true, emailSent, receiptGenerated };
    } catch (err: any) {
      console.error("Error updating status:", err);
      // toUserMessage, not err.message. The identical operation on the
      // applicants page already does this. Raw, this surfaced as "Missing or
      // insufficient permissions." — and ApplicationReviewDialog renders it
      // under a monospace heading reading "Error Traceback", to a charity
      // coordinator.
      setErrorMessage(toUserMessage(err) || "That change didn't save. Please try again.");
      return { success: false, emailSent: false, receiptGenerated: false, error: err.message || "Operation failed" };
    }
  };

  const openReview = async (app: Application) => {
    setReviewApp(app);
    if (isDemoMode && app.studentId === "demo-student-1") {
      setReviewStudent({
        uid: "demo-student-1",
        fullName: "Alex Volunteer",
        school: "North York Collegiate",
        grade: "11",
        neighborhood: "Willowdale",
        interests: ["Environment", "Coding"],
        skills: ["Public Speaking", "React"],
        availability: ["Mon", "Wed"],
      });
      return;
    }

    // Clear first. Without this, opening applicant B after a failed fetch left
    // applicant A's school, neighbourhood, email and phone on screen under B's
    // name — the most dangerous possible outcome for a screen used to decide
    // about minors.
    setReviewStudent(null);

    try {
      // Server-side: the rules could not check that this student ever applied
      // to us, so any organization could read any student's record — including
      // their passport. The endpoint proves the relationship and returns an
      // allow-listed subset without it.
      const profile = await fetchReviewProfile(app.studentId);
      setReviewStudent(profile);
    } catch (err: any) {
      // Say so. This used to console.error and leave the dialog rendering its
      // `student?.x || fallback` defaults, so a failed read looked exactly like
      // a student who had filled nothing in.
      console.error("Error fetching student profile:", err);
      setReviewStudent(null);
      setErrorMessage(
        toUserMessage(err) ||
        "We couldn't load this applicant's profile. Close this and try again — don't decide from a blank one.",
      );
    }
  };

  const handleOrgLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !logDate || !logHours || !logActivity) {
      setErrorMessage("Please fill in all four fields before logging hours.");
      return;
    }

    setIsSubmittingLog(true);
    setLogResultStatus(null);

    const parsedHours = Number(parseFloat(logHours).toFixed(1));
    const newLogItem = {
      id: `log-org-${user?.uid || "org"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      // The suffix only when there is a real name to put in it. This was
      // `|| "Verified Org"`, and this string is sent to /api/hours/approve and
      // written verbatim into the student's permanent loggedHours entry, which
      // the printed transcript renders — so a null orgProfile put a fictional
      // organisation on a graduation record. An empty bracket pair is worse
      // than none, so the whole suffix goes when the name is missing.
      activity: orgProfile?.organizationName
        ? `${logActivity} (${orgProfile.organizationName})`
        : logActivity,
      hours: parsedHours,
      date: logDate,
      coordinatorName: orgProfile?.organizationName || "The organization",
      coordinatorContact: user?.email || "",
      approved: true, // Officially verified from organizations
    };

    try {
      let studentEmail = "student@example.com";
      let studentName = "Student";

      if (isDemoMode) {
        // Handle mock write in localStorage
        let cachedProfiles =
          localStorage.getItem("demo_student_profiles") || "{}";
        let profiles = JSON.parse(cachedProfiles);

        const studentProfile = profiles[selectedStudentId] || {
          loggedHours: [],
        };
        studentProfile.loggedHours = [
          ...(studentProfile.loggedHours || []),
          newLogItem,
        ];
        profiles[selectedStudentId] = studentProfile;

        localStorage.setItem("demo_student_profiles", JSON.stringify(profiles));

        if (selectedStudentId === "demo-student-1") {
          studentName = "Alex Volunteer";
          studentEmail = "armin.k@yorkschool.ca";
          const alexProfile = JSON.parse(
            localStorage.getItem("demo_student_profile") || "{}",
          );
          alexProfile.loggedHours = [
            ...(alexProfile.loggedHours || []),
            newLogItem,
          ];
          localStorage.setItem(
            "demo_student_profile",
            JSON.stringify(alexProfile),
          );
        }

        setLogResultStatus("success");
        setLogDate("");
        setLogHours("");
        setLogActivity("");
        setSelectedStudentId("");
        setSuccessMessage("Successfully logged credits for student!");
      } else {
        // This used to getDoc(students/{id}) and getDoc(users/{id}) first, to
        // read the name and the address. firestore.rules allows neither read to
        // an organization, so the very first one threw for every real account
        // and the throw fell into the catch below — this form reported
        // "Failed to save hours log" every single time and never reached the
        // server. Nothing was lost by deleting it: studentsList already carries
        // fullName (it is what the picker renders), and the address is not
        // needed here, because /api/hours/approve emails the student itself
        // after it has proved the placement.
        studentName =
          studentsList.find((s) => s.id === selectedStudentId)?.fullName || studentName;

        // The credit is written by the server, which can prove this student
        // actually volunteered with us. A student the organization has no
        // accepted application for is refused with a clear message instead of
        // being silently credited.
        /*
         * One key per submission ATTEMPT, reused across retries of that attempt.
         *
         * The credit commits in a transaction, and only then does the server do
         * three more reads and up to two mail sends. Anything failing in that
         * tail rejects this promise after the hours are already on the record —
         * and the catch below sets "error" while the form keeps every value the
         * coordinator typed, so pressing the button again is the obvious thing
         * to do. That second press used to append a second entry: eight hours
         * became sixteen on a graduation record.
         *
         * The key is cleared on success, so a genuine second logging of the
         * same activity still goes through as its own entry.
         */
        if (!logClientRef.current) {
          logClientRef.current =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `ref_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        }
        await approveStudentHours({
          studentId: selectedStudentId,
          hours: Number(logHours),
          activity: newLogItem.activity,
          date: logDate,
          clientRef: logClientRef.current,
        });
        logClientRef.current = null;
        setLogResultStatus("success");
        // Direct credit logging also moves the student's total.
        void requestLeaderboardRebuild();
        setLogDate("");
        setLogHours("");
        setLogActivity("");
        setSelectedStudentId("");
        setSuccessMessage("Successfully logged and authorized hours!");
      }
    } catch (err: any) {
      console.error("Failed to log student hours:", err);
      /*
       * The server's own words, not a fixed string.
       *
       * approveStudentHours documents its contract: "Rejects with a message
       * safe to show the organization — the caller is expected to surface it
       * rather than swallow it, which is the mistake this codebase kept
       * making." This site swallowed it into "Failed to save hours log. Please
       * try again.", and the two failures it actually hits are both actionable:
       * the relationship refusal, which explains what the coordinator has to do
       * first, and "Hours must be a number between 0 and 24."
       */
      setErrorMessage(toUserMessage(err, "We couldn't log those hours. Please try again."));
      setLogResultStatus("error");
    } finally {
      setIsSubmittingLog(false);
    }
  };

  if (isLoading)
    return (
      <div className="p-8 text-center text-ink-soft font-bold">
        Loading dashboard...
      </div>
    );

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10 relative"
    >
      {/* No <AnimatePresence> and no exit animation — same reason as
          src/components/CookieBanner.tsx. An exit that never completes (which is
          what happens under `prefers-reduced-motion: reduce`) leaves the node
          mounted at opacity 0, and an invisible position:fixed overlay still
          swallows clicks. These toasts sit at top-centre over the header, so a
          stale one would eat clicks on the nav. Unmount immediately instead. */}
      {successMessage && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-blue-dark text-white px-6 py-3 rounded-lg font-semibold text-xs tracking-wide shadow-blue-dark/20 flex items-center gap-2"
        >
          <CheckCircle className="w-4 h-4" />
          {successMessage}
        </motion.div>
      )}
      {errorMessage && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-6 py-3 rounded-lg font-semibold text-xs tracking-wide  flex items-center gap-2"
        >
          <XCircle className="w-4 h-4 shrink-0" />
          <span className="leading-relaxed">{errorMessage}</span>
          {needsEmailVerification && (
            <button
              onClick={handleResendVerification}
              disabled={resendState === 'sending' || resendState === 'sent'}
              className="ml-2 shrink-0 bg-white text-rose-700 rounded-lg px-3 h-8 font-bold disabled:opacity-60"
            >
              {resendState === 'sending'
                ? 'Sending…'
                : resendState === 'sent'
                  ? 'Link sent'
                  : resendState === 'already'
                    ? 'Already confirmed'
                    : 'Send me a new link'}
            </button>
          )}
          <button
            onClick={() => setErrorMessage(null)}
            aria-label="Dismiss error"
            className="ml-2 shrink-0 underline underline-offset-2 hover:no-underline"
          >
            Dismiss
          </button>
        </motion.div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2 border-b border-line">
        <div>
          <h1 className="text-3xl font-mono font-medium text-ink tracking-tight leading-none">
            {orgProfile?.organizationName || "Organization"} Dashboard
          </h1>
          <p className="text-ink-soft mt-2 font-medium">
            Manage your opportunities and review volunteers across Toronto.
          </p>
        </div>
        <Link to="/org/opportunities/new">
          <Button className="gap-2  h-12 rounded-lg px-6 font-semibold text-xs tracking-wide bg-blue-dark hover:bg-[#153343]">
            <PlusCircle className="w-5 h-5" /> Post Opportunity
          </Button>
        </Link>
      </div>

      {/* Stats Overview — visible on the overview tab */}
      {/* What to do next, for an organization that cannot post yet.
          Verification is now enforced in firestore.rules, so without this the
          first thing a new organization does is click "Post New" and hit a wall.
          Four stat cards reading zero explain nothing. */}
      {activeTab === "overview" && !isDemoMode && orgProfile && (() => {
        const status = orgProfile.craVerified
          ? 'verified'
          : (orgProfile.verificationStatus || 'unverified');
        /*
         * The banner was INVERTED, and this is why approved organisations post
         * nothing.
         *
         * An org that CANNOT post was shown "One step before you can post". An
         * org that CAN post was shown null — the one moment the guidance
         * becomes actionable is the moment it was deleted. What replaced it was
         * four stat cards reading zero under the words "Manage your
         * opportunities", which reads as a broken account rather than an empty
         * one. The empty state that does lead somewhere lives behind the
         * Opportunities tab, which nobody has a reason to open once the
         * overview says there is nothing to manage.
         *
         * Two verified organisations on this platform have posted nothing and
         * never signed in a second time. This is the screen they would land on.
         */
        if (status === 'verified' && opportunities.length > 0) return null;
        const copy = {
          verified: {
            tone: 'border-blue-dark/20 bg-blue-dark/5',
            title: 'Post your first opportunity',
            body: 'Your organization is approved, so anything you post is visible to students straight away. Say what they would be doing, roughly when, and how many you can take.',
            cta: { to: '/org/opportunities/new', label: 'Post an opportunity' },
          },
          unverified: {
            tone: 'border-blue-dark/20 bg-blue-dark/5',
            title: 'One step before you can post',
            body: 'Students meet organizations in person, and most of them are under 18, so a person reviews every organization before its opportunities are shown. You are already in the queue. Adding a website and your address helps us approve you faster — it usually takes a day or two.',
            cta: { to: '/org/profile', label: 'Complete your profile' },
          },
          pending: {
            tone: 'border-amber-200 bg-amber-50',
            title: 'We are reviewing your organization',
            body: 'Nothing more is needed from you. We will email you the moment it is done, and you can post straight away.',
            cta: null,
          },
          rejected: {
            tone: 'border-red-200 bg-red-50',
            title: 'This organization was not approved',
            body: 'It cannot post opportunities. If you believe that is a mistake, reply to the email we sent and we will take another look.',
            cta: null,
          },
        }[status === 'verified' ? 'verified' : status === 'pending' ? 'pending' : status === 'rejected' ? 'rejected' : 'unverified'];
        return (
          <div className={cn('rounded-lg border p-6 sm:p-8 space-y-3', copy.tone)}>
            <h2 className="text-lg font-bold text-ink">{copy.title}</h2>
            <p className="text-sm text-ink-soft leading-relaxed max-w-2xl">{copy.body}</p>
            {copy.cta && (
              <Link
                to={copy.cta.to}
                className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-blue-dark text-white font-semibold text-sm"
              >
                {copy.cta.label}
              </Link>
            )}
          </div>
        );
      })()}

      {activeTab === "overview" && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card
          onClick={() => setSelectedStatPopup("opportunities")}
          className="p-8 bg-blue-dark text-white border-none  rounded-lg cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-4xl font-mono font-medium leading-none">
                {stats.totalOpps}
              </p>
              <p className="text-blue-100 text-xs font-semibold tracking-wide mt-2 font-mono">
                Opportunities
              </p>
            </div>
            <ClipboardList className="text-blue-400 w-10 h-10 opacity-50" />
          </div>
        </Card>
        <Card
          onClick={() => setSelectedStatPopup("pending")}
          className="p-8 bg-white border-0 rounded-lg border-b-2 border-b-yellow-500 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-4xl font-mono font-medium text-ink leading-none">
                {stats.pendingApps}
              </p>
              <p className="text-ink-soft text-xs font-semibold tracking-wide mt-2 font-mono">
                Pending Review
              </p>
            </div>
            <Clock className="text-amber-dark w-10 h-10" />
          </div>
        </Card>
        <Card
          onClick={() => setSelectedStatPopup("accepted")}
          className="p-8 bg-white border-0 rounded-lg border-b-2 border-b-blue-dark cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-4xl font-mono font-medium text-ink leading-none">
                {stats.acceptedApps}
              </p>
              <p className="text-ink-soft text-xs font-semibold tracking-wide mt-2 font-mono">
                Accepted
              </p>
            </div>
            <CheckCircle className="text-blue-dark w-10 h-10" />
          </div>
        </Card>
        <Card
          onClick={() => setSelectedStatPopup("rejected")}
          className="p-8 bg-white border-0 rounded-lg border-b-2 border-b-red-500 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-4xl font-mono font-medium text-ink leading-none">
                {stats.rejectedApps}
              </p>
              <p className="text-ink-soft text-xs font-semibold tracking-wide mt-2 font-mono">
                Rejected
              </p>
            </div>
            <XCircle className="text-red-600 w-10 h-10" />
          </div>
        </Card>
      </div>
      )}

      {/* Opportunities + Applications grid */}
      {(activeTab === "opportunities" || activeTab === "applications") && (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        {/* Managed Opportunities */}
        {activeTab === "opportunities" && (
        <section className="lg:col-span-2 space-y-6">
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
              Active Opportunities
            </h2>
            <div className="relative">
              <input
                type="text"
                placeholder="Search opportunities by name, category, or location..."
                value={oppSearchTerm}
                onChange={(e) => setOppSearchTerm(e.target.value)}
                className="w-full text-xs font-semibold bg-paper-2 px-4 py-3 h-10 rounded-lg border border-line outline-none focus:ring-1 focus:ring-blue-dark focus:bg-white transition-all"
              />
              {oppSearchTerm && (
                <button
                  type="button"
                  onClick={() => setOppSearchTerm("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-2.5 text-xs text-ink-soft hover:text-ink font-semibold cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          <div className="space-y-4">
            {filteredOpportunities.length > 0 ? (
              filteredOpportunities.map((opp) => (
                <Card
                  key={opp.id}
                  className="p-8 hover:border-blue-dark/20 transition-all group border-none rounded-lg bg-white shadow-card"
                >
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Link
                        to={`/org/opportunities/${opp.id}/applicants`}
                        className="font-semibold text-xl text-ink group-hover:text-blue-dark block leading-tight"
                      >
                        {opp.title}
                      </Link>
                      <p className="text-xs text-ink-soft flex items-center gap-1 font-bold tracking-wide">
                        <Clock className="w-3 h-3" /> Created {opp.createdAt 
                            ? (opp.createdAt.toDate ? opp.createdAt.toDate() : new Date(opp.createdAt)).toLocaleDateString()
                            : new Date().toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-4 py-4 border-t border-b border-line-light">
                      <Badge
                        variant="secondary"
                        className="bg-blue-dark/5 text-[#153343] border-none font-bold px-3 py-1"
                      >
                        {
                          recentApplications.filter(
                            (a) => a.opportunityId === opp.id,
                          ).length
                        }{" "}
                        applicants
                      </Badge>
                      <a
                        href={getGoogleCalendarFallbackUrl(opp)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold tracking-wide text-ink-soft hover:text-blue-dark flex items-center gap-1.5 no-underline transition-colors cursor-pointer"
                      >
                        <Calendar className="w-3.5 h-3.5 text-blue-dark" />
                        <span>Sync Cal</span>
                      </a>
                    </div>

                    <div className="flex gap-2">
                      <Link
                        to={`/org/opportunities/${opp.id}/edit`}
                        className="flex-1"
                      >
                        <Button
                          variant="ghost"
                          className="w-full text-xs h-10 font-semibold tracking-wide rounded-lg hover:bg-paper-2"
                        >
                          Edit Post
                        </Button>
                      </Link>
                      <Link
                        to={`/org/opportunities/${opp.id}/applicants`}
                        className="flex-1"
                      >
                        <Button
                          variant="outline"
                          className="w-full text-xs h-10 font-semibold tracking-wide rounded-lg border-line hover:border-blue-dark hover:text-blue-dark"
                        >
                          Review All
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="py-20 text-center bg-white rounded-lg border border-dashed border-line">
                <p className="text-ink-soft font-bold">
                  No opportunities posted yet.
                </p>
                <Link to="/org/opportunities/new">
                  <Button variant="ghost" className="mt-2 text-blue-dark">
                    Post your first one ➜
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </section>
        )}

        {/* Recent Applications Feed */}
        {activeTab === "applications" && (
          <OrgApplicationsTab
            filteredApplications={filteredApplications}
            appSearchTerm={appSearchTerm}
            onSearchChange={setAppSearchTerm}
            filterTab={filterTab}
            onFilterChange={setFilterTab}
            onOpenReview={openReview}
          />
        )}
      </div>
      )}

      {/* Hours Verification — own tab */}
      {activeTab === "hours" && (
        <HoursTab
          hoursRequests={filteredHoursRequests}
          isApprovingId={isApprovingId}
          onApproveHoursRequest={handleApproveHoursRequest}
          studentsList={studentsList}
          isSubmittingLog={isSubmittingLog}
          selectedStudentId={selectedStudentId}
          setSelectedStudentId={withNewAttempt(setSelectedStudentId)}
          logDate={logDate}
          setLogDate={withNewAttempt(setLogDate)}
          logHours={logHours}
          setLogHours={withNewAttempt(setLogHours)}
          logActivity={logActivity}
          setLogActivity={withNewAttempt(setLogActivity)}
          logResultStatus={logResultStatus}
          onLogSubmit={handleOrgLogSubmit}
        />
      )}

      <RejectionDialog
        isOpen={!!rejectionModalApp}
        onClose={() => setRejectionModalApp(null)}
        studentName={rejectionModalApp?.studentName || "Student"}
        onConfirm={(reason, note) => {
          if (rejectionModalApp) {
            updateAppStatus(rejectionModalApp.id, "rejected", { reason, note });
          }
        }}
      />

      <ApplicationReviewDialog
        isOpen={!!reviewApp}
        onClose={() => {
          setReviewApp(null);
          setReviewStudent(null);
        }}
        application={reviewApp}
        student={reviewStudent}
        onAccept={(id) => updateAppStatus(id, "accepted")}
        onReject={(app) => {
          setReviewApp(null);
          setRejectionModalApp(app);
        }}
      />

      <AnimatePresence>
        {selectedStatPopup && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              ref={statDialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Applications breakdown"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-lg w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col border border-line"
            >
              <div className="p-8 border-b border-line flex justify-between items-center bg-paper-2">
                <div>
                  <h3 className="font-semibold text-2xl text-ink uppercase tracking-tight">
                    {selectedStatPopup === "opportunities" &&
                      "My Active Postings"}
                    {selectedStatPopup === "pending" &&
                      "Pending Candidate Applications"}
                    {selectedStatPopup === "accepted" && "Accepted Placements"}
                    {selectedStatPopup === "rejected" && "Rejected Submissions"}
                  </h3>
                  <p className="text-xs text-ink-soft font-semibold mt-1">
                    {selectedStatPopup === "opportunities" &&
                      `${stats.totalOpps} posts running live`}
                    {selectedStatPopup === "pending" &&
                      `${stats.pendingApps} submissions waiting for your response`}
                    {selectedStatPopup === "accepted" &&
                      `${stats.acceptedApps} youth volunteers linked with your team`}
                    {selectedStatPopup === "rejected" &&
                      `${stats.rejectedApps} inactive submissions`}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedStatPopup(null)}
                  aria-label="Close statistics popup"
                  className="w-10 h-10 rounded-lg hover:bg-slate-200 flex items-center justify-center text-ink-soft hover:text-ink transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="overflow-y-auto p-8 space-y-4 flex-grow">
                {selectedStatPopup === "opportunities" && (
                  <div className="space-y-4">
                    {opportunities.length > 0 ? (
                      opportunities.map((opp) => (
                        <div
                          key={opp.id}
                          className="p-5 bg-paper-2 rounded-lg border border-line flex justify-between items-center"
                        >
                          <div>
                            <div className="font-bold text-ink text-sm">
                              {opp.title}
                            </div>
                            <div className="text-xs text-ink-soft font-semibold tracking-wide mt-1">
                              {opp.category} • {opp.timeCommitment}
                            </div>
                          </div>
                          <Link
                            to={`/org/opportunities/${opp.id}/applicants`}
                            onClick={() => setSelectedStatPopup(null)}
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs font-bold uppercase tracking-wider h-9 rounded-lg"
                            >
                              Candidates
                            </Button>
                          </Link>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-ink-soft text-center py-6">
                        No posted opportunities.
                      </p>
                    )}
                  </div>
                )}

                {(selectedStatPopup === "pending" ||
                  selectedStatPopup === "accepted" ||
                  selectedStatPopup === "rejected") && (
                  <div className="space-y-4">
                    {recentApplications.filter(
                      (a) => a.status === selectedStatPopup,
                    ).length > 0 ? (
                      recentApplications
                        .filter((a) => a.status === selectedStatPopup)
                        .map((app) => (
                          <div
                            key={app.id}
                            className="p-5 bg-paper-2 rounded-lg border border-line flex justify-between items-center"
                          >
                            <div>
                              <div className="font-bold text-ink text-sm">
                                {app.studentName || "Unlabeled Student"}
                              </div>
                              <div className="text-xs text-ink-soft font-semibold tracking-wide mt-1">
                                For: {app.opportunityTitle}
                              </div>
                              {app.status === "rejected" &&
                                app.rejectionReason && (
                                  <div className="mt-2 text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-100">
                                    <span className="font-bold">Reason:</span>{" "}
                                    {app.rejectionReason}
                                  </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">

                              <Button
                                size="sm"
                                className="bg-blue-dark hover:bg-[#153343] text-white text-xs font-bold uppercase tracking-wider h-9 rounded-lg"
                                onClick={() => {
                                  setSelectedStatPopup(null);
                                  openReview(app);
                                }}
                              >
                                Review Profile
                              </Button>
                            </div>
                          </div>
                        ))
                    ) : (
                      <p className="text-sm text-ink-soft text-center py-6">
                        No applications in this category.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

