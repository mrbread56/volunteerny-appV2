import React, { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from '../lib/config';
import { useDialog } from "../hooks/useDialog";
import { fetchReviewProfile } from "../lib/reviewProfile";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";
import { Application, Opportunity, StudentProfile } from "../types";
import {
  Card,
  CardContent,
} from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import {
  ArrowLeft,
  MessageSquare,
  CheckCircle,
  FileText,
  Eye,
  ShieldAlert,
  Star,
  Edit3,
  X,
  AlertCircle,
  Mail,
} from "lucide-react";
import { cn } from "../lib/utils";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import RejectionDialog from "../components/RejectionDialog";
import ApplicationReviewDialog from "../components/ApplicationReviewDialog";
import ReportModal from "../components/ReportModal";
import ReceiptModal from "../components/ReceiptModal";
import { notifyApplicant, fetchApplicantContacts, type ApplicantContact } from "../lib/emailService";
import { buildMailtoLink } from "../lib/mailto";
import { toUserMessage } from "../lib/errors";
import { capacityRefusal } from '../lib/opportunityCapacity';
import { promoteWaitlistedApplicant } from "../lib/waitlistService";

export default function OrgOpportunityApplicants() {
  const { id } = useParams();
  const { isDemoMode, orgProfile, user } = useAuth();
  const navigate = useNavigate();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [applicants, setApplicants] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rejectionModalApp, setRejectionModalApp] =
    useState<Application | null>(null);
  const [reviewApp, setReviewApp] = useState<Application | null>(null);
  const [reviewStudent, setReviewStudent] = useState<StudentProfile | null>(
    null,
  );
  const [filterTab, setFilterTab] = useState<
    "all" | "pending" | "reviewed" | "waitlist" | "accepted" | "rejected" | "terminated"
  >("pending");
  const [expandedMsgs, setExpandedMsgs] = useState<Record<string, boolean>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isBulkRejecting, setIsBulkRejecting] = useState(false);
  // Applicant email addresses, fetched from the server because the browser is
  // not allowed to read users/{uid} for anyone but itself. Keyed by studentId.
  const [contacts, setContacts] = useState<Record<string, ApplicantContact>>({});
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  // `settle` is the resolve() of the promise updateStatus handed its caller.
  // Without it, Undo cleared the timer and the caller (ApplicationReviewDialog)
  // was left awaiting a promise that could never resolve — its spinner never
  // stopped. Every path that retires an entry must settle it exactly once.
  type PendingUpdate = {
    timeout: NodeJS.Timeout;
    previousState: Application;
    settle: (result: { success: boolean; emailSent: boolean; receiptGenerated: boolean; error?: string }) => void;
  };
  const pendingUpdates = useRef<Record<string, PendingUpdate>>({});

  const cancelUpdate = (appId: string) => {
    const pending = pendingUpdates.current[appId];
    if (pending) {
      clearTimeout(pending.timeout);
      delete pendingUpdates.current[appId];
      setApplicants(prev => prev.map(a => a.id === appId ? pending.previousState : a));
      setSuccessMessage("Action undone.");
      pending.settle({ success: false, emailSent: false, receiptGenerated: false, error: "undone" });
    }
  };

  // Load the addresses once the opportunity is known.
  useEffect(() => {
    if (!id || isDemoMode) return;
    let cancelled = false;
    fetchApplicantContacts(id)
      .then((list) => {
        if (cancelled) return;
        const byStudent: Record<string, ApplicantContact> = {};
        for (const c of list) if (c.studentId) byStudent[c.studentId] = c;
        setContacts(byStudent);
        setContactsError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        // Named, not swallowed: without addresses the Email buttons cannot
        // work, and a disabled button with no explanation is the pattern this
        // codebase keeps getting wrong.
        setContactsError(err?.message || 'Could not load applicant email addresses.');
      });
    return () => { cancelled = true; };
  }, [id, isDemoMode, applicants.length]);

  /**
   * Close the posting, and optionally decline whoever is still waiting.
   *
   * Closing is not deleting. The opportunity, its applications and its accepted
   * volunteers all stay exactly where they are — it simply stops appearing in
   * browse and refuses new applications, which is what "we have the people we
   * need" actually means. Reopening is one click.
   */
  const handleToggleClosed = async () => {
    if (!id || !opportunity) return;
    const closing = opportunity.status !== 'closed';
    const stillWaiting = applicants.filter(
      (a) => a.status === 'pending' || a.status === 'reviewed' || a.status === 'waitlist',
    );

    if (closing) {
      const msg = stillWaiting.length
        ? `Close "${opportunity.title}" to new applications?

The ${stillWaiting.length} applicant(s) still waiting will be declined and emailed. Anyone you have already accepted keeps their place.`
        : `Close "${opportunity.title}" to new applications? It will stop showing in browse. You can reopen it any time.`;
      if (!window.confirm(msg)) return;
    }

    setIsClosing(true);
    try {
      await updateDoc(doc(db, 'opportunities', id), {
        status: closing ? 'closed' : 'open',
        updatedAt: serverTimestamp(),
      });
      setOpportunity((prev) => (prev ? { ...prev, status: closing ? 'closed' : 'open' } : prev));

      if (closing && stillWaiting.length) {
        const results = await Promise.allSettled(stillWaiting.map(async (app) => {
          await updateDoc(doc(db, 'applications', app.id), {
            status: 'rejected',
            rejectionReason: 'Position Filled',
            rejectionNote: 'This opportunity has now been filled and closed to new applications.',
            decidedAt: serverTimestamp(),
          });
          return notifyApplicant({
            applicationId: app.id,
            status: 'rejected',
            reason: 'Position Filled',
            note: 'This opportunity has now been filled and closed to new applications.',
          });
        }));
        const closedIds = new Set(stillWaiting.map((a) => a.id));
        setApplicants((prev) => prev.map((a) => (closedIds.has(a.id) ? { ...a, status: 'rejected' } : a)));
        /*
         * Two counts, because this one was always zero.
         *
         * notifyApplicant never rejects — like sendTransactionalEmail it
         * returns `{ success: false }` — so the inner promise was always
         * FULFILLED and `results.filter(r => r.status === 'rejected')` could
         * only ever be empty. The dialog above says "The N applicant(s) still
         * waiting will be declined AND EMAILED", and /api/applications/notify
         * is rate limited to 20 sends per 10 minutes, so any posting with more
         * than 20 waiting applicants silently dropped the rest. handleBulkReject
         * sixty lines below already does this correctly.
         */
        const failedWrites = results.filter((r) => r.status === 'rejected').length;
        const unnotified = results.filter(
          (r) => r.status === 'fulfilled' && (r.value as any)?.success === false,
        ).length;
        if (failedWrites) {
          setErrorMessage(`${failedWrites} applicant(s) could not be declined. Please try again.`);
        } else if (unnotified) {
          setErrorMessage(
            `All applicants were declined, but ${unnotified} could not be emailed. ` +
            'Please contact them directly so they know the opportunity is closed.',
          );
        }
      }
      setSuccessMessage(closing ? 'Opportunity closed to new applications.' : 'Opportunity reopened.');
    } catch (err: any) {
      setErrorMessage(toUserMessage(err) || 'Could not change the opportunity status.');
    } finally {
      setIsClosing(false);
    }
  };

  const handleBulkReject = async () => {
    // Count and name FIRST. This asked for confirmation and only counted on the
    // next line, so "all remaining" could be two applicants or twenty and the
    // coordinator had no way to tell — and every one of them is written and
    // emailed.
    const toReject = applicants.filter((a) => a.status === 'pending' || a.status === 'reviewed');
    if (toReject.length === 0) {
      setErrorMessage('There are no pending or reviewed applications left to reject.');
      return;
    }
    if (!window.confirm(
      `Reject ${toReject.length} applicant${toReject.length === 1 ? '' : 's'} for "${opportunity?.title ?? 'this opportunity'}"?\n\n` +
      `Each of them will be emailed that they were not successful. This cannot be undone.`,
    )) return;
    
    setIsBulkRejecting(true);
    try {
      const pendingApps = applicants.filter(a => a.status === 'pending' || a.status === 'reviewed');
      const rejectionNote = "Bulk rejected. The position has been filled or the opportunity is closed.";
      
      const batchPromises = pendingApps.map(async (app) => {
        if (!isDemoMode) {
          const updates = {
            status: 'rejected',
            rejectionReason: 'Position Filled',
            rejectionNote,
            // When the decision was made. The student's bell reads this; it
            // used to show the time they APPLIED, so a decision taken after
            // they last checked never raised the unread badge.
            decidedAt: serverTimestamp(),
          };
          await updateDoc(doc(db, "applications", app.id), updates);
          // Rejecting ONE applicant emails them; this path wrote straight to
          // Firestore and skipped the notification entirely, so rejecting
          // twenty at once told none of them — while the toast reported success
          // either way. Failures are collected rather than thrown: a student
          // who is not emailed must not also stay wrongly listed as pending.
          const notified = await notifyApplicant({
            applicationId: app.id,
            status: 'rejected',
            reason: 'Position Filled',
            note: rejectionNote,
          });
          return { app: { ...app, ...updates } as Application, notified: notified.success };
        }
        return {
          app: { ...app, status: 'rejected', rejectionReason: 'Position Filled', rejectionNote } as Application,
          notified: true,
        };
      });

      // allSettled, not all: Promise.all rejects on the FIRST failure, so a
      // single failed write discarded the results of every successful one —
      // the list showed all twenty still pending while nineteen were in fact
      // rejected in the database.
      const settled = await Promise.allSettled(batchPromises);
      const processed = settled
        .filter((r): r is PromiseFulfilledResult<{ app: Application; notified: boolean }> => r.status === 'fulfilled')
        .map((r) => r.value);
      const failedWrites = settled.length - processed.length;
      const unnotified = processed.filter((p) => !p.notified).length;

      setApplicants(prev => prev.map(a => {
        const hit = processed.find(p => p.app.id === a.id);
        return hit ? hit.app : a;
      }));
      setSuccessMessage(`Bulk rejected ${processed.length} application${processed.length === 1 ? '' : 's'}.`);
      if (failedWrites || unnotified) {
        setErrorMessage(
          [
            failedWrites ? `${failedWrites} application${failedWrites === 1 ? '' : 's'} could not be updated.` : '',
            unnotified ? `${unnotified} applicant${unnotified === 1 ? ' was' : 's were'} not emailed.` : '',
          ].filter(Boolean).join(' '),
        );
      }
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error("Error during bulk rejection:", err);
      setErrorMessage("Failed to bulk reject applications.");
    } finally {
      setIsBulkRejecting(false);
    }
  };

  // Receipt Modal State
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceiptApp, setSelectedReceiptApp] =
    useState<Application | null>(null);

  // Safety Report Modal State
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportStudentId, setReportStudentId] = useState("");
  const [reportStudentName, setReportStudentName] = useState("");

  // Recommendation state
  const [recApp, setRecApp] = useState<any>(null);
  const closeRecDialog = React.useCallback(() => setRecApp(null), []);
  const refDialogRef = useDialog(!!recApp, closeRecDialog);
  const [recText, setRecText] = useState("");
  const [recRating, setRecRating] = useState(0);
  const [isSubmittingRec, setIsSubmittingRec] = useState(false);

  useEffect(() => {
    if (successMessage) {
      const duration = successMessage.includes('|UNDO|') ? 5000 : 3000;
      const timer = setTimeout(() => setSuccessMessage(null), duration);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Accept/reject writes are deliberately deferred five seconds so the toast can
  // offer Undo — but the toast says "Placement accepted." immediately and the
  // row updates immediately, so closing the tab inside that window silently
  // threw the decision away: nothing was written, and the applicant was never
  // emailed, while the organization had every reason to believe otherwise.
  //
  // The deferral itself is worth keeping (it is what lets Undo stop the email
  // going out), so warn instead of dropping. The ref is read inside the handler
  // rather than captured, so this registers once and still sees current state.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(pendingUpdates.current).length === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setIsLoading(true);

      if (isDemoMode) {
        setOpportunity({
          id: id,
          title: "Welcome Center Support",
          orgId: "demo-org-1",
        } as any);

        const storedApps = localStorage.getItem("demo_applications");
        let apps: Application[] = storedApps
          ? JSON.parse(storedApps)
          : [
              {
                id: "demo-app-1",
                opportunityId: id,
                opportunityTitle: "Welcome Center Support",
                studentId: "demo-student-1",
                studentName: "Alex Volunteer",
                status: "pending",
                message: "I am excited to help out!",
                appliedAt: new Date() as any,
              },
            ];

        setApplicants(apps.filter((a) => a.opportunityId === id));
        setIsLoading(false);
        return;
      }

      try {
        const oppSnap = await getDoc(doc(db, "opportunities", id));
        if (oppSnap.exists()) {
          setOpportunity({ id: oppSnap.id, ...oppSnap.data() } as Opportunity);

          const appsQuery = query(
            collection(db, "applications"),
            where("opportunityId", "==", id),
          );
          const appsSnap = await getDocs(appsQuery);
          setApplicants(
            appsSnap.docs.map(
              (doc) => ({ id: doc.id, ...doc.data() }) as Application,
            ),
          );
        }
      } catch (err: any) {
        console.error("Error fetching applicants:", err);
        setErrorMessage(toUserMessage(err) || "Failed to load applicants.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const updateStatus = async (
    appId: string,
    status: "accepted" | "rejected" | "terminated" | "reviewed",
    rejectionData?: { reason: string; note: string },
  ): Promise<{ success: boolean; emailSent: boolean; receiptGenerated: boolean; error?: string }> => {
    let emailSent = false;
    let receiptGenerated = false;

    const dispatchEmailNotification = async (
      currentApplicantsList: Application[],
      finalStatus: string,
      rejectionArgs?: { reason: string; note: string }
    ) => {
      // "reviewed" is an internal triage flag the organization sets for itself.
      // The applicant has not been accepted or rejected yet, so mailing them a
      // decision notice here would be wrong.
      if (finalStatus === "reviewed") return;

      if (isDemoMode) return;

      try {
        // The address is resolved server-side. This used to read
        // users/{studentId} from the browser, which firestore.rules denies to
        // every organization, so the address silently became the literal
        // "student@example.com" and no real applicant was ever told the
        // outcome. See POST /api/applications/notify.
        const emailResult = await notifyApplicant({
          applicationId: appId,
          status: finalStatus as "accepted" | "rejected" | "terminated",
          reason: rejectionArgs?.reason,
          note: rejectionArgs?.note,
        });
        emailSent = emailResult.success;
        if (!emailResult.success) {
          console.error("Applicant status email was not delivered:", emailResult.error);
          setErrorMessage(
            `The status was saved, but we could not email the applicant. ${emailResult.error || ""}`.trim()
          );
        }
      } catch (e: any) {
        console.error("Failed to dispatch the applicant notification:", e);
        setErrorMessage(e.message || "Failed to send notification email.");
      }
    };


    const visibleState = applicants.find(a => a.id === appId);
    if (!visibleState) return { success: false, emailSent: false, receiptGenerated: false };

    // Acting twice on the same applicant inside the 5s undo window used to
    // leave the first timer running: the map entry was simply overwritten. The
    // orphaned timer then fired, ran `delete pendingUpdates.current[appId]` on
    // the SECOND action's entry (killing its Undo), and wrote the first,
    // now-superseded status in a race with the second write. Retire the
    // previous action here — the newer one wins.
    const superseded = pendingUpdates.current[appId];
    if (superseded) {
      clearTimeout(superseded.timeout);
      delete pendingUpdates.current[appId];
      superseded.settle({ success: false, emailSent: false, receiptGenerated: false, error: "superseded" });
    }

    // Undo must restore what was actually persisted, not the superseded
    // action's optimistic row — otherwise undoing the second action leaves the
    // applicant showing a status that was never written to Firestore.
    const currentState = superseded ? superseded.previousState : visibleState;

    // Optimistically update UI immediately
    let updatedApps: Application[] = [];
    setApplicants((prev) => {
      updatedApps = prev.map((a) =>
        a.id === appId
          ? {
              ...a,
              status,
              rejectionReason: status === "rejected" ? rejectionData?.reason : undefined,
              rejectionNote: status === "rejected" ? rejectionData?.note : undefined,
            }
          : a
      );
      return updatedApps;
    });

    setSuccessMessage(
      status === "reviewed"
        ? `Application marked as reviewed.|UNDO|${appId}`
        : `Placement ${status === "terminated" ? "terminated" : status}.|UNDO|${appId}`
    );

    return new Promise((resolve) => {
      const timeoutId = setTimeout(async () => {
        delete pendingUpdates.current[appId];

        if (isDemoMode) {
          const storedApps = localStorage.getItem("demo_applications");
          let allApps: Application[] = storedApps ? JSON.parse(storedApps) : [];

          const updatedAll = allApps.map((a) =>
            a.id === appId
              ? {
                  ...a,
                  status,
                  rejectionReason:
                    status === "rejected" ? rejectionData?.reason : undefined,
                  rejectionNote:
                    status === "rejected" ? rejectionData?.note : undefined,
                }
              : a,
          );

          localStorage.setItem("demo_applications", JSON.stringify(updatedAll));
          const opportunityApps = updatedAll.filter((a) => a.opportunityId === id);
          await dispatchEmailNotification(opportunityApps, status, rejectionData);
          resolve({ success: true, emailSent, receiptGenerated: status === "accepted" });
          return;
        }

        try {
          // Capacity, before the write and not after it. See capacityRefusal:
          // maxVolunteers was displayed on this very page and enforced on no
          // accept path in the app, and the Accept button below is rendered for
          // waitlisted rows too, so promoting by hand was the easiest way to
          // overfill a posting and freeze its waitlist for good.
          if (status === 'accepted' && id) {
            const refusal = await capacityRefusal(id, opportunity?.maxVolunteers);
            if (refusal) {
              setApplicants(prev => prev.map(a => a.id === appId ? currentState : a));
              setErrorMessage(refusal);
              resolve({ success: false, emailSent: false, receiptGenerated: false, error: refusal });
              return;
            }
          }

          // decidedAt: see the note on the bulk-reject payload above.
          const updates: any = { status, decidedAt: serverTimestamp() };
          if (status === "rejected" && rejectionData) {
            updates.rejectionReason = rejectionData.reason;
            updates.rejectionNote = rejectionData.note;
          } else {
            updates.rejectionReason = null;
            updates.rejectionNote = null;
          }
          await updateDoc(doc(db, "applications", appId), updates);

          const appsSnapshot = [...updatedApps];
          await dispatchEmailNotification(appsSnapshot, status, rejectionData);

          // The return value is USED. promoteWaitlistedApplicant reports
          // whether the promoted student was actually emailed, its own comment
          // says "reported so the caller can surface it", and both callers threw
          // it away. A student was moved off the waitlist into an accepted
          // placement, the mail failed, and the only record was a console line
          // nobody reads: they held a place they were never told about and
          // missed the shift.
          if (id && (status === "rejected" || status === "terminated")) {
            const promoted: any = await promoteWaitlistedApplicant(id, orgProfile?.organizationName || "Verified Organization");
            if (promoted && promoted.emailSent === false) {
              setErrorMessage(
                `${promoted.studentName || 'A waitlisted student'} was moved off the waitlist and accepted, ` +
                'but we could not email them. Please contact them directly so they know they have a place.',
              );
            }
          }

          resolve({ success: true, emailSent, receiptGenerated: status === "accepted" });
        } catch (err: any) {
          console.error("Error updating status:", err);
          /*
           * The failure has to outlive this component.
           *
           * The write is deferred five seconds so the toast can offer Undo, and
           * the timer keeps running after an in-app navigation -- the
           * beforeunload guard only covers a tab close or a reload. So an
           * organisation could accept an applicant, see "Placement accepted.",
           * click Back to Dashboard within five seconds, and have the write
           * fail into a component that no longer exists: setApplicants and
           * setErrorMessage are both no-ops, the student is never emailed, and
           * on the next visit the applicant is simply still pending with no
           * explanation anywhere.
           *
           * sessionStorage because it survives the unmount and the navigation
           * but not the session, and OrgDashboard reads it on mount.
           */
          try {
            sessionStorage.setItem('vny_pending_decision_failed', JSON.stringify({
              at: Date.now(),
              message: `A decision on one applicant did not save (${toUserMessage(err) || 'database write failed'}). `
                + 'Please open that opportunity and check the applicant list.',
            }));
          } catch { /* storage disabled; the in-page path below still runs */ }

          // Revert optimistic update on error
          setApplicants(prev => prev.map(a => a.id === appId ? currentState : a));
          setErrorMessage(toUserMessage(err) || "Database write failed");
          resolve({ success: false, emailSent: false, receiptGenerated: false, error: err.message });
        }
      }, 5000);

      pendingUpdates.current[appId] = { timeout: timeoutId, previousState: currentState, settle: resolve };
    });
  };

  const handleSubmitRec = async () => {
    if (!recApp || !user || recRating < 1 || !recText.trim()) return;
    setIsSubmittingRec(true);
    try {
      const recId = `${user.uid}_${recApp.studentId}_${recApp.opportunityId}`;
      if (isDemoMode) {
        const existing = JSON.parse(localStorage.getItem('demo_recommendations') || '[]');
        existing.push({ id: recId, text: recText, rating: recRating, studentName: recApp.studentName, opportunityTitle: recApp.opportunityTitle || opportunity?.title });
        localStorage.setItem('demo_recommendations', JSON.stringify(existing));
      } else {
        // Via the server: the rules cannot prove this student actually
        // volunteered here (that is a query across applications), so a direct
        // client write let any organization author a reference about any
        // student. The endpoint runs that query, and rules now refuse client
        // creates outright.
        const token = await user.getIdToken();
        const res = await fetch(`${API_BASE_URL}/api/recommendations/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            studentId: recApp.studentId,
            opportunityId: recApp.opportunityId,
            text: recText.trim(),
            rating: recRating,
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Could not save the reference (${res.status}).`);
        }
      }
      setSuccessMessage(`Reference submitted for ${recApp.studentName || 'student'}`);
      setRecApp(null);
    } catch (err: any) {
      console.error('Failed to submit recommendation:', err);
      setSuccessMessage(null);
      setErrorMessage(toUserMessage(err) || "Failed to submit recommendation.");
    } finally {
      setIsSubmittingRec(false);
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

    // Cleared before the fetch: `if (profile)` used to leave the PREVIOUS
    // applicant's details on screen when this one failed to load.
    setReviewStudent(null);

    try {
      // See src/lib/reviewProfile.ts — the rules could not check that this
      // student ever applied to us, so this read moved behind an endpoint that
      // can, and which never returns passportUrl.
      const profile = await fetchReviewProfile(app.studentId);
      setReviewStudent(profile);
    } catch (err: any) {
      console.error("Error fetching student profile:", err);
      setReviewStudent(null);
      setErrorMessage(
        toUserMessage(err) ||
        "We couldn't load this applicant's profile. Close this and try again — don't decide from a blank one.",
      );
    }
  };

  if (isLoading)
    return (
      <div className="p-20 text-center text-ink-muted font-bold">
        Loading applicants...
      </div>
    );
  if (!opportunity)
    return (
      <div className="max-w-4xl mx-auto px-4 py-20">
        <div role="alert" className="bg-red-50 text-red-700 p-4 text-sm border border-red-200 text-center">
          We couldn't load this opportunity. It may have been removed, or your connection dropped.
        </div>
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8 relative">
      {/* No <AnimatePresence>, no exit — see src/components/CookieBanner.tsx.
          An exit that never completes leaves an invisible fixed overlay mounted,
          and it still swallows clicks. This toast carries the Undo button and
          sits over the header, so a stale copy would both eat nav clicks and
          leave a dead Undo on screen. */}
      {/* errorMessage was set in six places on this page and rendered in none
          of them. So a failed status write silently reverted the row five
          seconds after the toast said "Placement accepted", a failed reference
          submission just stopped spinning, and the permission error that broke
          every applicant email was invisible. Same placement as the success
          toast, and it does NOT auto-dismiss — a failure the organization has
          to act on should not disappear on a timer. */}
      {errorMessage && (
        <div
          role="alert"
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50 max-w-lg bg-red-600 text-white px-6 py-3 rounded-lg font-semibold text-xs tracking-wide flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          <span className="leading-relaxed">{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            aria-label="Dismiss error"
            className="ml-2 shrink-0 underline underline-offset-2 hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-blue-dark text-white px-6 py-3 rounded-lg font-semibold text-xs tracking-wide shadow-blue-dark/20 flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {successMessage.includes('|UNDO|') ? (
                <div className="flex items-center gap-4">
                  <span>{successMessage.split('|UNDO|')[0]}</span>
                  <button 
                    onClick={() => cancelUpdate(successMessage.split('|UNDO|')[1])}
                    className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded text-white font-bold transition-colors border border-white/30"
                  >
                    Undo
                  </button>
                </div>
              ) : (
                <span>{successMessage}</span>
              )}
            </motion.div>
          )}

      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-ink-muted hover:text-blue-dark font-bold uppercase text-xs tracking-widest transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-line-light">
        <div>
          <h1 className="text-4xl font-bold text-ink tracking-tight leading-none">
            {opportunity.title}
          </h1>
          {/* Places filled, not just applications received. maxVolunteers was in
              scope on this page and rendered nowhere, so nothing told a
              coordinator they had already filled all five spots — and manual
              accepts are not capacity-checked, only auto-promotions are. */}
          <p className="text-ink-muted mt-3 font-medium">
            Reviewing {applicants.length} application{applicants.length === 1 ? '' : 's'}
            {typeof opportunity?.maxVolunteers === 'number' && opportunity.maxVolunteers > 0 && (
              <>
                {' · '}
                <span className={cn(
                  'font-semibold',
                  applicants.filter((a) => a.status === 'accepted').length >= opportunity.maxVolunteers
                    ? 'text-amber-900'
                    : 'text-ink',
                )}>
                  {applicants.filter((a) => a.status === 'accepted').length} of {opportunity.maxVolunteers} place
                  {opportunity.maxVolunteers === 1 ? '' : 's'} filled
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col gap-3 max-w-full shrink-0 items-end">
          <div className="max-w-full overflow-x-auto scrollbar-none pb-1 shrink-0">
            <div className="flex bg-paper-3 p-1 rounded-lg w-max">
              {/* "waitlist" was missing. Applications are auto-created with that
                  status once an opportunity is full, so a full posting collected
                  waitlisted students who appeared under no tab but "all", with no
                  action available on the row — the organization could see them and
                  do nothing about them, ever. */}
              {(["all", "pending", "reviewed", "waitlist", "accepted", "rejected", "terminated"] as const).map(
                (tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilterTab(tab)}
                    className={cn(
                      "px-6 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all",
                      filterTab === tab
                        ? "bg-white text-blue-dark"
                        : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {/* Counts, because the tab defaults to "pending": once every
                        applicant was decided, a posting with twelve of them showed
                        an empty list and no clue that the other eleven were one
                        click away. */}
                    {tab}
                    <span className="ml-1.5 opacity-60">
                      {tab === "all"
                        ? applicants.length
                        : applicants.filter((a) => a.status === tab).length}
                    </span>
                  </button>
                )
              )}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {/* Email everyone you accepted, in one go. Opens the organization's
                own mail client with the addresses already filled in — no
                subject, no body, they write it themselves. Addresses go in BCC
                so the volunteers, who are mostly minors, are not disclosed to
                each other. */}
            {(() => {
              const acceptedEmails = applicants
                .filter((a) => a.status === 'accepted')
                .map((a) => contacts[a.studentId]?.email)
                .filter((e): e is string => !!e);
              const href = buildMailtoLink(acceptedEmails);
              if (!href) return null;
              return (
                <a
                  href={href}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-blue-dark border border-blue-dark/20 bg-blue-dark/5 hover:bg-blue-dark/10 h-8 px-4 rounded-lg transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Email all {acceptedEmails.length} accepted
                </a>
              );
            })()}

            {applicants.some(a => a.status === 'pending' || a.status === 'reviewed') && (
              <Button
                variant="outline"
                className="text-xs font-semibold text-red-600 border-red-200 hover:bg-red-50 h-8 px-4 rounded-lg"
                onClick={handleBulkReject}
                disabled={isBulkRejecting}
              >
                {isBulkRejecting ? "Rejecting..." : "Bulk Reject Remaining Pending"}
              </Button>
            )}

            {/* Close the posting once you have the volunteers you need. */}
            <Button
              variant="outline"
              className="text-xs font-semibold h-8 px-4 rounded-lg"
              onClick={handleToggleClosed}
              disabled={isClosing}
            >
              {isClosing
                ? 'Saving…'
                : opportunity.status === 'closed'
                  ? 'Reopen applications'
                  : 'Close applications'}
            </Button>
          </div>

          {opportunity.status === 'closed' && (
            <p className="text-sm text-ink-muted text-right">
              This opportunity is closed — it no longer appears in browse and cannot receive new applications.
            </p>
          )}

          {contactsError && (
            <p role="alert" className="text-xs text-red-700 text-right">
              {contactsError} Email buttons are unavailable until this loads.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-6">
          {applicants.filter((a) => filterTab === "all" || a.status === filterTab)
            .length > 0 ? (
            applicants
              .filter((a) => filterTab === "all" || a.status === filterTab)
              .sort((a, b) => {
                const isBottomA = a.status === "rejected" || a.status === "terminated";
                const isBottomB = b.status === "rejected" || b.status === "terminated";
                if (isBottomA && !isBottomB) return 1;
                if (!isBottomA && isBottomB) return -1;
                // Longest wait first. This used to `return 0` for everything
                // undecided, so applicants appeared in raw Firestore document
                // order and someone who had been waiting three weeks could sit
                // below someone who applied this morning.
                const at = (x: any) => {
                  const v = x?.appliedAt;
                  if (!v) return 0;
                  if (typeof v?.toDate === 'function') return v.toDate().getTime();
                  if (typeof v?.seconds === 'number') return v.seconds * 1000;
                  const d = new Date(v).getTime();
                  return Number.isFinite(d) ? d : 0;
                };
                return at(a) - at(b);
              })
              .map((app) => (
                <Card
                key={app.id}
                className="overflow-hidden border-none  rounded-lg bg-white shadow-card"
              >
                <CardContent className="p-5 sm:p-10">
                  <div className="flex flex-col md:flex-row justify-between gap-8">
                    <div className="space-y-6 flex-grow">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 bg-blue-dark/5 rounded-lg flex items-center justify-center text-[#153343] text-3xl font-bold shrink-0">
                            {app.studentName?.[0] || "S"}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-2xl font-bold text-ink leading-none mb-2 break-words">
                              {app.studentName || "Student Volunteer"}
                            </h3>
                            <p className="text-sm text-ink-muted font-bold flex items-center gap-1 uppercase tracking-widest leading-none">
                              Applied{" "}
                              {app.appliedAt 
                                  ? (app.appliedAt.toDate ? app.appliedAt.toDate() : new Date(app.appliedAt)).toLocaleDateString() 
                                  : 'Recently'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 self-start sm:self-auto">
                          {app.status === "accepted" && (
                            <Button
                              variant="ghost"
                              className="w-12 h-12 rounded-lg text-blue-dark hover:bg-blue-dark/5"
                              title="Placement receipt"
                              onClick={() => {
                                setSelectedReceiptApp(app);
                                setShowReceiptModal(true);
                              }}
                            >
                              <FileText className="w-5 h-5 text-blue-dark " />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            className="w-12 h-12 rounded-lg"
                            onClick={() => openReview(app)}
                          >
                            <Eye className="w-5 h-5 text-ink-muted" />
                          </Button>
                          <Button
                            variant="ghost"
                            className="w-12 h-12 rounded-lg text-red-600 hover:text-red-700 hover:bg-rose-50/50"
                            title="Report Safe Space Violation"
                            onClick={() => {
                              setReportStudentId(app.studentId);
                              setReportStudentName(
                                app.studentName || "Student Volunteer",
                              );
                              setShowReportModal(true);
                            }}
                          >
                            <ShieldAlert className="w-5 h-5" />
                          </Button>
                        </div>
                      </div>

                      <div className="bg-paper-2 p-6 rounded-lg border border-line-light relative overflow-hidden">
                        <MessageSquare className="absolute -right-2 -bottom-2 w-16 h-16 text-paper-2 opacity-20" />
                        <p className="text-xs font-bold text-ink-muted uppercase tracking-widest mb-2">
                          Personal Message
                        </p>
                        <p className="text-sm text-ink-soft leading-relaxed font-medium">
                          "{app.message ? (app.message.length > 100 && !expandedMsgs[app.id] ? app.message.substring(0, 100) + "..." : app.message) : "No message provided."}"
                        </p>
                        {app.message && app.message.length > 100 && (
                          <button 
                            onClick={() => setExpandedMsgs(prev => ({...prev, [app.id]: !prev[app.id]}))}
                            className="mt-2 text-xs font-bold text-blue-dark hover:underline"
                          >
                            {expandedMsgs[app.id] ? "Show Less" : "Read Full Application"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col md:w-56 gap-4 self-start w-full">
                      <Badge
                        variant={
                          app.status === "accepted"
                            ? "success"
                            : app.status === "terminated"
                              ? "danger"
                              : app.status === "rejected"
                                ? "danger"
                                : app.status === "reviewed"
                                  ? "warning"
                                  : "warning"
                        }
                        className="text-xs py-2 px-6 font-semibold tracking-wide rounded-lg border-none text-center block w-full shadow-card"
                      >
                        {app.status === "terminated"
                          ? "TERMINATED"
                          : app.status}
                      </Badge>

                      {app.status === "accepted" && (
                        <div className="space-y-2 w-full animate-fadeIn">
                          <Button 
                            variant="outline" 
                            className="w-full font-bold uppercase text-xs tracking-widest h-11 rounded-lg border-blue-dark/20 text-blue-dark hover:bg-blue-dark/5 flex items-center justify-center gap-2"
                            onClick={() => {
                              setSelectedReceiptApp(app);
                              setShowReceiptModal(true);
                            }}
                          >
                            <FileText className="w-4 h-4" /> View Receipt
                          </Button>
                          <Button 
                            variant="outline" 
                            className="w-full font-bold uppercase text-xs tracking-widest h-11 rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50/50 flex items-center justify-center gap-2"
                            onClick={() => { setRecApp(app); setRecText(""); setRecRating(0); }}
                          >
                            <Edit3 className="w-4 h-4" /> Write Reference
                          </Button>
                          <Button 
                            variant="outline" 
                            className="w-full font-bold uppercase text-xs tracking-widest h-11 rounded-lg border-red-200 text-red-600 hover:bg-rose-50/50 flex items-center justify-center gap-2"
                            onClick={() => {
                              // Terminating emails the student that their
                              // placement has ended and frees their spot to the
                              // waitlist. It fired on one click, with only the
                              // 5s Undo toast as a safety net — and the review
                              // modal renders over that toast at the same
                              // z-index. Un-terminate beside it is harmless and
                              // stays unconfirmed.
                              if (!window.confirm(
                                `End ${app.studentName || 'this student'}'s placement?\n\n` +
                                `They will be emailed that it has ended, and their place will be offered to the waitlist.`,
                              )) return;
                              updateStatus(app.id, "terminated");
                            }}
                          >
                            Terminate Placement
                          </Button>
                        </div>
                      )}

                      {app.status === "terminated" && (
                        <Button 
                          variant="outline" 
                          className="w-full border-blue-dark/20 text-blue-dark bg-blue-dark/5 gap-2"
                          onClick={() => updateStatus(app.id, "accepted")}
                        >
                          Un-terminate Placement
                        </Button>
                      )}

                      {/* Email this applicant directly.
                          A plain mailto: with only the recipient filled in —
                          the organization writes the message in their own
                          inbox. Shown for EVERY status, not just accepted: an
                          organization needs to be able to ask a pending
                          applicant a question, or follow up with someone they
                          turned down. Applying is the contact request. */}
                      {contacts[app.studentId]?.email && (
                        <a
                          href={`mailto:${encodeURIComponent(contacts[app.studentId].email as string)}`}
                          className="w-full inline-flex items-center justify-center gap-2 font-bold uppercase text-xs tracking-widest h-11 rounded-lg border border-line text-ink hover:bg-paper-2 transition-colors"
                          title={contacts[app.studentId].email as string}
                        >
                          <Mail className="w-4 h-4" /> Email {app.studentName?.split(' ')[0] || 'applicant'}
                        </a>
                      )}

                      {/* Waitlisted applicants had no controls at all. Promoting one
                          by hand is the same accept the review dialog performs, and
                          declining releases them so they are not left waiting on a
                          place that is never coming. */}
                      {app.status === "waitlist" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Button
                            variant="primary"
                            className="w-full font-bold uppercase text-xs tracking-widest h-11 rounded-lg bg-blue-dark hover:bg-[#153343] text-white"
                            onClick={() => updateStatus(app.id, "accepted")}
                          >
                            Offer a Place
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full font-bold uppercase text-xs tracking-widest h-11 rounded-lg border-red-200 text-red-600 hover:bg-rose-50/50"
                            onClick={() => setRejectionModalApp(app)}
                          >
                            Decline
                          </Button>
                        </div>
                      )}

                      {(app.status === "pending" || app.status === "reviewed" || app.status === "rejected") && (
                        <Button
                          variant={(app.status === "pending" || app.status === "reviewed") ? "primary" : "ghost"}
                          className={cn(
                            "w-full font-bold uppercase text-xs tracking-widest h-12 rounded-lg",
                            (app.status === "pending" || app.status === "reviewed")
                              ? "bg-blue-dark hover:bg-[#153343] text-white "
                              : "text-ink-muted",
                          )}
                          onClick={() => openReview(app)}
                        >
                          {(app.status === "pending" || app.status === "reviewed")
                            ? "Review Application"
                            : "View Details"}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
        ) : (
          <div className="py-24 text-center bg-white rounded-lg border-2 border-dashed border-line-light text-ink-muted font-bold uppercase tracking-widest text-xs">
            No applications received yet.
          </div>
        )}
      </div>

      {showReceiptModal && selectedReceiptApp && (
        <ReceiptModal
          isOpen={showReceiptModal}
          onClose={() => {
            setShowReceiptModal(false);
            setSelectedReceiptApp(null);
          }}
          application={selectedReceiptApp}
          organizationName={
            orgProfile?.organizationName || "Authorized Volunteer Partner"
          }
        />
      )}

      <RejectionDialog
        isOpen={!!rejectionModalApp}
        onClose={() => setRejectionModalApp(null)}
        studentName={rejectionModalApp?.studentName || "Student"}
        onConfirm={(reason, note) => {
          if (rejectionModalApp) {
            updateStatus(rejectionModalApp.id, "rejected", { reason, note });
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
        onAccept={(id) => updateStatus(id, "accepted")}
        onReview={(id) => updateStatus(id, "reviewed")}
        onReject={(app) => {
          setReviewApp(null);
          setRejectionModalApp(app);
        }}
      />

      {showReportModal && reportStudentId && (
        <ReportModal
          isOpen={showReportModal}
          onClose={() => {
            setShowReportModal(false);
            setReportStudentId("");
            setReportStudentName("");
          }}
          reportedUserId={reportStudentId}
          reportedUserName={reportStudentName}
          reportedUserRole="student"
        />
      )}

      {/* Write Reference Modal */}
      {recApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm">
          <div
            ref={refDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Write a reference"
            className="w-full max-w-md bg-white p-8 space-y-5 relative"
          >
            <button onClick={() => setRecApp(null)} aria-label="Close" className="absolute top-4 right-4 text-ink-muted hover:text-ink-soft">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-ink">Write a reference</h3>
            <p className="text-sm text-ink-muted">For <strong>{recApp.studentName}</strong> — {recApp.opportunityTitle || opportunity?.title}</p>
            <div className="flex gap-1 py-2">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setRecRating(s)} className="p-1 transition-transform hover:scale-110">
                  <Star className={cn("w-7 h-7", s <= recRating ? "fill-amber-400 text-amber-400" : "text-paper-3")} />
                </button>
              ))}
            </div>
            <textarea
              value={recText}
              onChange={e => setRecText(e.target.value)}
              placeholder="Describe this volunteer's contribution (required, 1000 char max)"
              maxLength={1000}
              className="w-full h-28 p-3 border border-line text-sm resize-none focus:outline-none focus:border-blue-dark"
            />
            <button
              onClick={handleSubmitRec}
              disabled={recRating < 1 || !recText.trim() || isSubmittingRec}
              className="w-full h-11 bg-emerald-600 text-white text-xs font-semibold tracking-wide disabled:opacity-50 hover:bg-emerald-700 transition-colors"
            >
              {isSubmittingRec ? 'Submitting...' : 'Submit Reference'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

