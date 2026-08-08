import React, { useState, useEffect, useRef } from "react";
import { useDialog } from "../hooks/useDialog";
import { fetchReviewProfile } from "../lib/reviewProfile";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  addDoc,
  serverTimestamp
} from "firebase/firestore";
import { Application, Opportunity, StudentProfile } from "../types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import {
  ArrowLeft,
  User,
  MessageSquare,
  CheckCircle,
  XCircle,
  FileText,
  Eye,
  ShieldAlert,
  Star,
  Edit3,
  X,
} from "lucide-react";
import { formatDate, cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import RejectionDialog from "../components/RejectionDialog";
import ApplicationReviewDialog from "../components/ApplicationReviewDialog";
import ReportModal from "../components/ReportModal";
import ReceiptModal from "../components/ReceiptModal";
import { sendTransactionalEmail } from "../lib/emailService";
import { promoteWaitlistedApplicant } from "../lib/waitlistService";

export default function OrgOpportunityApplicants() {
  const { id } = useParams();
  const { isDemoMode, accessToken, orgProfile, user } = useAuth();
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
    "all" | "pending" | "reviewed" | "accepted" | "rejected" | "terminated"
  >("pending");
  const [expandedMsgs, setExpandedMsgs] = useState<Record<string, boolean>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isBulkRejecting, setIsBulkRejecting] = useState(false);
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

  const handleBulkReject = async () => {
    if (!window.confirm("Are you sure you want to reject all remaining pending and reviewed applications?")) return;
    
    setIsBulkRejecting(true);
    try {
      const pendingApps = applicants.filter(a => a.status === 'pending' || a.status === 'reviewed');
      const rejectionNote = "Bulk rejected. The position has been filled or the opportunity is closed.";
      
      const batchPromises = pendingApps.map(async (app) => {
        if (!isDemoMode) {
          const updates = { 
            status: 'rejected',
            rejectionReason: 'Position Filled',
            rejectionNote
          };
          await updateDoc(doc(db, "applications", app.id), updates);
          return { ...app, ...updates } as Application;
        } else {
          return { ...app, status: 'rejected', rejectionReason: 'Position Filled', rejectionNote } as Application;
        }
      });

      const processed = await Promise.all(batchPromises);
      
      setApplicants(prev => prev.map(a => {
        const processedApp = processed.find(p => p.id === a.id);
        return processedApp ? processedApp : a;
      }));
      setSuccessMessage(`Bulk rejected ${processed.length} applications.`);
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
        setErrorMessage(err.message || "Failed to load applicants.");
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

      try {
        let studentEmail: string | null = null;
        const targetApp = currentApplicantsList.find((a) => a.id === appId);
        const targetStudentName = targetApp?.studentName || "Student";
        const opportunityTitle =
          targetApp?.opportunityTitle || opportunity?.title || "Opportunity";

        if (isDemoMode) {
          studentEmail =
            targetApp?.studentId === "demo-student-1"
              ? "armin.k@yorkschool.ca"
              : "student@example.com";
        } else if (targetApp?.studentId) {
          const studentUserDoc = await getDoc(
            doc(db, "users", targetApp.studentId),
          );
          if (studentUserDoc.exists()) {
            studentEmail = studentUserDoc.data().email;
          }
        }

        // Sandbox safety fallback if email is not resolved or is demo
        if (!studentEmail || studentEmail === "student@example.com") {
          studentEmail = "student@example.com";
        }

        if (studentEmail) {
          const subject = status === "accepted"
            ? `Your application for "${opportunityTitle}" was accepted! 🎉`
            : status === "terminated"
              ? `Placement Update for "${opportunityTitle}"`
              : `Application Update for "${opportunityTitle}"`;

          // sendTransactionalEmail never throws: it resolves with
          // { success: false } on failure. This used to set emailSent = true
          // unconditionally, so the UI reported "applicant notified" even when
          // no email left the building. Trust the returned flag instead.
          const emailResult = await sendTransactionalEmail({
            to: studentEmail,
            subject: subject,
            templateName: "application_status",
            templateData: {
              studentName: targetStudentName,
              oppTitle: opportunityTitle,
              orgName: orgProfile?.organizationName || "Verified Organization",
              status: finalStatus === "accepted" ? "accepted" : "rejected",
              note: finalStatus === "rejected"
                ? `${rejectionArgs?.reason || "Schedule Match Conflict"}. ${rejectionArgs?.note || ""}`
                : finalStatus === "terminated"
                  ? "Your placement for this shift was terminated by the site moderator."
                  : undefined
            }
          });
          emailSent = emailResult.success;
          if (!emailResult.success) {
            console.error("Applicant status email was not delivered:", emailResult.error);
          }
        }
      } catch (e: any) {
        console.error("Failed to compile or dispatch Resend notification:", e);
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
          const updates: any = { status };
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

          if (id && (status === "rejected" || status === "terminated")) {
            await promoteWaitlistedApplicant(id, orgProfile?.organizationName || "Verified Organization");
          }

          resolve({ success: true, emailSent, receiptGenerated: status === "accepted" });
        } catch (err: any) {
          console.error("Error updating status:", err);
          // Revert optimistic update on error
          setApplicants(prev => prev.map(a => a.id === appId ? currentState : a));
          setErrorMessage(err.message || "Database write failed");
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
        await setDoc(doc(db, 'recommendations', recId), {
          orgId: user.uid,
          orgName: orgProfile?.organizationName || 'Organization',
          studentId: recApp.studentId,
          studentName: recApp.studentName || 'Student',
          opportunityId: recApp.opportunityId,
          opportunityTitle: recApp.opportunityTitle || opportunity?.title || 'Opportunity',
          text: recText.trim(),
          rating: recRating,
          createdAt: serverTimestamp(),
        });
      }
      setSuccessMessage(`Reference submitted for ${recApp.studentName || 'student'}`);
      setRecApp(null);
    } catch (err: any) {
      console.error('Failed to submit recommendation:', err);
      setSuccessMessage(null);
      setErrorMessage(err.message || "Failed to submit recommendation.");
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

    try {
      // See src/lib/reviewProfile.ts — the rules could not check that this
      // student ever applied to us, so this read moved behind an endpoint that
      // can, and which never returns passportUrl.
      const profile = await fetchReviewProfile(app.studentId);
      if (profile) setReviewStudent(profile);
    } catch (err: any) {
      console.error("Error fetching student profile:", err);
      setErrorMessage(err.message || "Error fetching student profile.");
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
        <div role="alert" className="bg-red-50 text-red-700 p-4 text-[14px] border border-red-200 text-center">
          We couldn't load this opportunity. It may have been removed, or your connection dropped.
        </div>
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8 relative">
      <AnimatePresence>
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
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
      </AnimatePresence>

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
          <p className="text-ink-muted mt-3 font-medium">
            Reviewing {applicants.length} volunteering applications
          </p>
        </div>
        <div className="flex flex-col gap-3 max-w-full shrink-0 items-end">
          <div className="max-w-full overflow-x-auto scrollbar-none pb-1 shrink-0">
            <div className="flex bg-slate-100 p-1 rounded-lg w-max">
              {(["all", "pending", "reviewed", "accepted", "rejected", "terminated"] as const).map(
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
                    {tab}
                  </button>
                )
              )}
            </div>
          </div>
          {applicants.some(a => a.status === 'pending' || a.status === 'reviewed') && (
            <div className="flex justify-end">
              <Button 
                variant="outline" 
                className="text-xs font-semibold text-red-600 border-red-200 hover:bg-red-50 h-8 px-4 rounded-lg"
                onClick={handleBulkReject}
                disabled={isBulkRejecting}
              >
                {isBulkRejecting ? "Rejecting..." : "Bulk Reject Remaining Pending"}
              </Button>
            </div>
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
                return 0;
              })
              .map((app) => (
                <Card
                key={app.id}
                className="overflow-hidden border-none shadow-slate-100 rounded-lg bg-white"
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
                            <p className="text-xs text-ink-muted font-bold flex items-center gap-1 uppercase tracking-widest leading-none">
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
                              title="Official Enrollment Slip / Receipt"
                              onClick={() => {
                                setSelectedReceiptApp(app);
                                setShowReceiptModal(true);
                              }}
                            >
                              <FileText className="w-5 h-5 text-blue-dark animate-pulse" />
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
                            className="w-12 h-12 rounded-lg text-red-500 hover:text-red-700 hover:bg-rose-50/50"
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
                        <MessageSquare className="absolute -right-2 -bottom-2 w-16 h-16 text-slate-200 opacity-20" />
                        <p className="text-xs font-bold text-ink-muted uppercase tracking-widest mb-2">
                          Personal Message
                        </p>
                        <p className="text-sm text-ink-soft leading-relaxed italic font-medium">
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
                        className="text-xs py-2 px-6 font-semibold tracking-wide rounded-lg border-none text-center block w-full"
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
                            onClick={() => updateStatus(app.id, "terminated")}
                          >
                            Terminate Placement
                          </Button>
                        </div>
                      )}

                      {app.status === "terminated" && (
                        <Button 
                          variant="outline" 
                          className="w-full font-bold uppercase text-xs tracking-widest h-11 rounded-lg border-blue-dark/20 text-blue-dark bg-blue-dark/5 hover:bg-blue-dark/5 flex items-center justify-center gap-2 animate-fadeIn"
                          onClick={() => updateStatus(app.id, "accepted")}
                        >
                          Un-terminate Placement
                        </Button>
                      )}

                      {(app.status === "pending" || app.status === "reviewed" || app.status === "rejected") && (
                        <Button
                          variant={(app.status === "pending" || app.status === "reviewed") ? "primary" : "ghost"}
                          className={cn(
                            "w-full font-bold uppercase text-xs tracking-widest h-12 rounded-lg",
                            (app.status === "pending" || app.status === "reviewed")
                              ? "bg-blue-dark hover:bg-[#153343] text-white shadow-blue-100"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
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
                  <Star className={cn("w-7 h-7", s <= recRating ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
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

