import React, { useState, useEffect } from "react";
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
import { directChatId, groupChatId } from "../lib/chatBus";
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
  const [rejectionModalApp, setRejectionModalApp] =
    useState<Application | null>(null);
  const [reviewApp, setReviewApp] = useState<Application | null>(null);
  const [reviewStudent, setReviewStudent] = useState<StudentProfile | null>(
    null,
  );
  const [filterTab, setFilterTab] = useState<
    "all" | "pending" | "accepted" | "terminated"
  >("pending");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
  const [recText, setRecText] = useState("");
  const [recRating, setRecRating] = useState(0);
  const [isSubmittingRec, setIsSubmittingRec] = useState(false);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
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
      } catch (err) {
        console.error("Error fetching applicants:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const updateStatus = async (
    appId: string,
    status: "accepted" | "rejected" | "terminated",
    rejectionData?: { reason: string; note: string },
  ): Promise<{ success: boolean; emailSent: boolean; receiptGenerated: boolean; error?: string }> => {
    let emailSent = false;
    let receiptGenerated = false;

    const dispatchEmailNotification = async (
      currentApplicantsList: Application[],
    ) => {
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

          await sendTransactionalEmail({
            to: studentEmail,
            subject: subject,
            templateName: "application_status",
            templateData: {
              studentName: targetStudentName,
              oppTitle: opportunityTitle,
              orgName: orgProfile?.organizationName || "Verified Organization",
              status: status === "accepted" ? "accepted" : "rejected",
              note: status === "rejected"
                ? `${rejectionData?.reason || "Schedule Match Conflict"}. ${rejectionData?.note || ""}`
                : status === "terminated"
                  ? "Your placement for this shift was terminated by the site moderator."
                  : undefined
            }
          });
          emailSent = true;
        }
      } catch (e) {
        console.error("Failed to compile or dispatch Resend notification:", e);
      }
    };


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
      setSuccessMessage(
        `Placement ${status === "terminated" ? "terminated" : status} successfully!`,
      );
      const opportunityApps = updatedAll.filter((a) => a.opportunityId === id);
      setApplicants(opportunityApps);
      await dispatchEmailNotification(opportunityApps);
      receiptGenerated = status === "accepted";
      return { success: true, emailSent, receiptGenerated };
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
      setSuccessMessage(
        `Placement ${status === "terminated" ? "terminated" : status} successfully!`,
      );
      
      let updatedApps: Application[] = [];
      setApplicants((prev) => {
        updatedApps = prev.map((a) =>
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
        return updatedApps;
      });

      // --- AUTOMATED CHAT PROVISIONING / CLEANUP ---
      // Uses deterministic chat IDs (dm_<uidA>_<uidB>, group_<opportunityId>)
      // instead of `array-contains` + equality queries, so this never depends
      // on a composite Firestore index existing. The direct-chat step and the
      // group-chat step each have their own try/catch so one failing doesn't
      // silently take out the other - any failure is surfaced to the org
      // instead of only going to the console.
      let chatWarnings: string[] = [];
      const targetApp = updatedApps.find(a => a.id === appId);

      if (targetApp && orgProfile) {
        if (status === "accepted") {
          try {
            const dmRef = doc(db, "chats", directChatId(orgProfile.uid, targetApp.studentId));
            const dmSnap = await getDoc(dmRef);
            if (!dmSnap.exists()) {
              await setDoc(dmRef, {
                type: "direct",
                participants: [orgProfile.uid, targetApp.studentId],
                updatedAt: serverTimestamp(),
                lastMessage: "Chat created automatically upon acceptance.",
              });
            }
          } catch (dmErr) {
            console.error("Failed to provision direct chat:", dmErr);
            chatWarnings.push("the direct message");
          }

          try {
            const oppRef = await getDoc(doc(db, "opportunities", targetApp.opportunityId));
            const oppData = oppRef.exists() ? oppRef.data() : null;

            if (oppData && oppData.autoCreateGroupChat !== false) {
              const gcRef = doc(db, "chats", groupChatId(targetApp.opportunityId));
              const gcSnap = await getDoc(gcRef);
              if (!gcSnap.exists()) {
                await setDoc(gcRef, {
                  type: "group",
                  opportunityId: targetApp.opportunityId,
                  opportunityTitle: targetApp.opportunityTitle || oppData.title || "Opportunity Group",
                  participants: [orgProfile.uid, targetApp.studentId],
                  updatedAt: serverTimestamp(),
                  lastMessage: `Group chat created for ${targetApp.opportunityTitle || oppData.title}.`,
                });
              } else {
                const existingParticipants: string[] = gcSnap.data().participants || [];
                if (!existingParticipants.includes(targetApp.studentId)) {
                  await updateDoc(gcRef, {
                    participants: [...existingParticipants, targetApp.studentId],
                    updatedAt: serverTimestamp(),
                    lastMessage: `${targetApp.studentName || "A student"} joined the group!`,
                  });
                }
              }
            }
          } catch (groupErr) {
            console.error("Failed to provision group chat:", groupErr);
            chatWarnings.push("the group chat");
          }
        } else if (status === "rejected" || status === "terminated") {
          // Remove them from the opportunity's group chat if they were in it.
          // If they were never added (e.g. rejected before acceptance), this
          // is a harmless no-op. Their direct message history is left intact.
          try {
            const gcRef = doc(db, "chats", groupChatId(targetApp.opportunityId));
            const gcSnap = await getDoc(gcRef);
            if (gcSnap.exists()) {
              const existingParticipants: string[] = gcSnap.data().participants || [];
              if (existingParticipants.includes(targetApp.studentId)) {
                await updateDoc(gcRef, {
                  participants: existingParticipants.filter((pid) => pid !== targetApp.studentId),
                  updatedAt: serverTimestamp(),
                  lastMessage: `${targetApp.studentName || "A student"} left the group.`,
                });
              }
            }
          } catch (removeErr) {
            console.error("Failed to remove student from group chat:", removeErr);
            chatWarnings.push("removing them from the group chat");
          }
        }
      }

      if (chatWarnings.length > 0) {
        setSuccessMessage(
          `Placement ${status === "terminated" ? "terminated" : status} successfully! (Note: ${chatWarnings.join(" and ")} could not be updated automatically - you may need to do this from Messages.)`
        );
      }

      // Await email dispatch directly
      const appsSnapshot = [...applicants];
      const targetIndex = appsSnapshot.findIndex(a => a.id === appId);
      if (targetIndex !== -1) {
        appsSnapshot[targetIndex] = {
          ...appsSnapshot[targetIndex],
          status,
          rejectionReason: status === "rejected" ? rejectionData?.reason : undefined,
          rejectionNote: status === "rejected" ? rejectionData?.note : undefined,
        };
      }
      await dispatchEmailNotification(appsSnapshot);
      receiptGenerated = status === "accepted";

      if (id && (status === "rejected" || status === "terminated")) {
        await promoteWaitlistedApplicant(id, orgProfile?.organizationName || "Verified Organization");
      }

      return { success: true, emailSent, receiptGenerated };
    } catch (err: any) {
      console.error("Error updating status:", err);
      return { success: false, emailSent: false, receiptGenerated: false, error: err.message || "Database write failed" };
    }
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
    } catch (err) {
      console.error('Failed to submit recommendation:', err);
      setSuccessMessage(null);
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
      const studentSnap = await getDoc(doc(db, "students", app.studentId));
      if (studentSnap.exists()) {
        setReviewStudent(studentSnap.data() as StudentProfile);
      }
    } catch (err) {
      console.error("Error fetching student profile:", err);
    }
  };

  if (isLoading)
    return (
      <div className="p-20 text-center text-slate-600 font-bold">
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
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-[#1F4C63] text-white px-6 py-3 rounded-sm font-black uppercase text-xs tracking-widest  shadow-[#1F4C63]/20 flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            {successMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-600 hover:text-[#1F4C63] font-black uppercase text-[10px] tracking-widest transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-100">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-none">
            {opportunity.title}
          </h1>
          <p className="text-slate-600 mt-3 font-medium">
            Reviewing {applicants.length} volunteering applications
          </p>
        </div>
        <div className="max-w-full overflow-x-auto scrollbar-none pb-1 shrink-0">
          <div className="flex bg-slate-100 p-1 rounded-sm w-max">
            {(["all", "pending", "accepted", "rejected", "terminated"] as const).map(
              (tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={cn(
                    "px-6 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all",
                    filterTab === tab
                      ? "bg-white text-[#1F4C63] "
                      : "text-slate-600 hover:text-slate-600",
                  )}
                >
                  {tab}
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {applicants.filter((a) => filterTab === "all" || a.status === filterTab)
          .length > 0 ? (
          applicants
            .filter((a) => filterTab === "all" || a.status === filterTab)
            .map((app) => (
              <Card
                key={app.id}
                className="overflow-hidden border-none  shadow-slate-100 rounded-sm bg-white"
              >
                <CardContent className="p-5 sm:p-10">
                  <div className="flex flex-col md:flex-row justify-between gap-8">
                    <div className="space-y-6 flex-grow">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 bg-[#1F4C63]/5 rounded-sm flex items-center justify-center text-[#153343] text-3xl font-black shrink-0">
                            {app.studentName?.[0] || "S"}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-2xl font-black text-slate-900 leading-none mb-2 break-words">
                              {app.studentName || "Student Volunteer"}
                            </h3>
                            <p className="text-[10px] text-slate-600 font-bold flex items-center gap-1 uppercase tracking-widest leading-none">
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
                              className="w-12 h-12 rounded-sm text-[#1F4C63] hover:text-[#1F4C63] hover:bg-[#1F4C63]/5"
                              title="Official Enrollment Slip / Receipt"
                              onClick={() => {
                                setSelectedReceiptApp(app);
                                setShowReceiptModal(true);
                              }}
                            >
                              <FileText className="w-5 h-5 text-[#1F4C63] text-[#1F4C63] animate-pulse" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            className="w-12 h-12 rounded-sm"
                            onClick={() => openReview(app)}
                          >
                            <Eye className="w-5 h-5 text-slate-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            className="w-12 h-12 rounded-sm text-red-500 hover:text-red-700 hover:bg-rose-50/50"
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

                      <div className="bg-slate-50 p-6 rounded-sm border border-slate-100 relative overflow-hidden">
                        <MessageSquare className="absolute -right-2 -bottom-2 w-16 h-16 text-slate-200 opacity-20" />
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">
                          Personal Message
                        </p>
                        <p className="text-sm text-slate-700 leading-relaxed italic font-medium">
                          "{app.message || "No message provided."}"
                        </p>
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
                                : "warning"
                        }
                        className="text-xs py-2 px-6 font-black uppercase tracking-widest rounded-sm border-none text-center block w-full"
                      >
                        {app.status === "terminated"
                          ? "TERMINATED"
                          : app.status}
                      </Badge>

                      {app.status === "accepted" && (
                        <div className="space-y-2 w-full animate-fadeIn">
                          <Button 
                            variant="outline" 
                            className="w-full font-black uppercase text-[10px] tracking-widest h-11 rounded-sm border-[#1F4C63]/20 text-[#1F4C63] hover:bg-[#1F4C63]/5/50 flex items-center justify-center gap-2 "
                            onClick={() => {
                              setSelectedReceiptApp(app);
                              setShowReceiptModal(true);
                            }}
                          >
                            <FileText className="w-4 h-4" /> View Receipt
                          </Button>
                          <Button 
                            variant="outline" 
                            className="w-full font-black uppercase text-[10px] tracking-widest h-11 rounded-sm border-emerald-200 text-emerald-700 hover:bg-emerald-50/50 flex items-center justify-center gap-2"
                            onClick={() => { setRecApp(app); setRecText(""); setRecRating(0); }}
                          >
                            <Edit3 className="w-4 h-4" /> Write Reference
                          </Button>
                          <Button 
                            variant="outline" 
                            className="w-full font-black uppercase text-[10px] tracking-widest h-11 rounded-sm border-red-200 text-red-600 hover:bg-rose-50/50 flex items-center justify-center gap-2"
                            onClick={() => updateStatus(app.id, "terminated")}
                          >
                            Terminate Placement
                          </Button>
                        </div>
                      )}

                      {app.status === "terminated" && (
                        <Button 
                          variant="outline" 
                          className="w-full font-black uppercase text-[10px] tracking-widest h-11 rounded-sm border-[#1F4C63]/20 text-[#1F4C63] bg-[#1F4C63]/5 hover:bg-[#1F4C63]/5 flex items-center justify-center gap-2  animate-fadeIn"
                          onClick={() => updateStatus(app.id, "accepted")}
                        >
                          Un-terminate Placement
                        </Button>
                      )}

                      {(app.status === "pending" || app.status === "rejected") && (
                        <Button
                          variant={app.status === "pending" ? "default" : "ghost"}
                          className={cn(
                            "w-full font-black uppercase text-[10px] tracking-widest h-12 rounded-sm",
                            app.status === "pending"
                              ? "bg-[#1F4C63] hover:bg-[#153343] text-white  shadow-blue-100"
                              : "text-slate-600",
                          )}
                          onClick={() => openReview(app)}
                        >
                          {app.status === "pending"
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
          <div className="py-24 text-center bg-white rounded-sm border-2 border-dashed border-slate-100 text-slate-600 font-bold uppercase tracking-widest text-xs">
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
          <div className="w-full max-w-md bg-white p-8 space-y-5 relative">
            <button onClick={() => setRecApp(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-slate-900">Write a reference</h3>
            <p className="text-sm text-slate-500">For <strong>{recApp.studentName}</strong> — {recApp.opportunityTitle || opportunity?.title}</p>
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
              className="w-full h-28 p-3 border border-slate-200 text-sm resize-none focus:outline-none focus:border-[#1F4C63]"
            />
            <button
              onClick={handleSubmitRec}
              disabled={recRating < 1 || !recText.trim() || isSubmittingRec}
              className="w-full h-11 bg-emerald-600 text-white text-xs font-black uppercase tracking-wider disabled:opacity-50 hover:bg-emerald-700 transition-colors"
            >
              {isSubmittingRec ? 'Submitting...' : 'Submit Reference'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

