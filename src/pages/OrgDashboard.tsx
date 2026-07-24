import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase/config";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  updateDoc,
  doc,
  getDoc,
} from "firebase/firestore";
import { Opportunity, Application, StudentProfile } from "../types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Link, useNavigate } from "react-router-dom";
import {
  PlusCircle,
  Users,
  ClipboardList,
  TrendingUp,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Mail,
  Calendar,
  MessageCircle,
} from "lucide-react";
import { formatDate, cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import RejectionDialog from "../components/RejectionDialog";
import ApplicationReviewDialog from "../components/ApplicationReviewDialog";
import { serverTimestamp } from "firebase/firestore";
import { requestOpenDirectChat } from "../lib/chatBus";
import { sendTransactionalEmail } from "../lib/emailService";
import { promoteWaitlistedApplicant } from "../lib/waitlistService";
import { handleFirestoreError, OperationType } from "../firebase/utils";

export default function OrgDashboard() {
  const {
    user,
    orgProfile,
    isDemoMode,
    accessToken,
    connectGmail,
    disconnectGmail,
  } = useAuth();
  const navigate = useNavigate();

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

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [recentApplications, setRecentApplications] = useState<Application[]>(
    [],
  );
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

  const [isLoading, setIsLoading] = useState(true);
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedStatPopup, setSelectedStatPopup] = useState<
    "opportunities" | "pending" | "accepted" | "rejected" | null
  >(null);

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

  // Google Gmail Integration helper states & hooks
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);
  const [isGmailStateEnabled, setIsGmailStateEnabled] = useState(
    localStorage.getItem("gmail_connected_state") !== "false",
  );

  const handleToggleGmail = async () => {
    setTestFeedback(null);
    if (isGmailStateEnabled) {
      disconnectGmail();
      setIsGmailStateEnabled(false);
      localStorage.setItem("gmail_connected_state", "false");
      setTestFeedback("Gmail broadcasts disabled successfully.");
    } else {
      const token = await connectGmail();
      if (token) {
        setIsGmailStateEnabled(true);
        localStorage.setItem("gmail_connected_state", "true");
        setTestFeedback("Gmail alerts connected and active!");
      } else {
        setIsGmailStateEnabled(true);
        localStorage.setItem("gmail_connected_state", "true");
        setTestFeedback(
          "Gmail alerts fallback activated in simulation sandbox mode.",
        );
      }
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailAddress) {
      setTestFeedback("Please type an email address first.");
      return;
    }

    setIsSendingTest(true);
    setTestFeedback(null);

    const res = await sendTransactionalEmail({
      to: testEmailAddress,
      subject: "Volunteer North York Email Integration Test! 🚀",
      templateName: "admin_alert",
      templateData: {
        subject: "Integration Test Succeeded",
        details: "This is a real transactional notification confirming that your Volunteer North York backend email delivery is fully active and functional!"
      }
    });

    setIsSendingTest(false);
    if (res.success) {
      setTestFeedback(`Test email sent successfully to ${testEmailAddress}!`);
      setTestEmailAddress("");
    } else {
      setTestFeedback(`Test failed: ${res.error || "Please check your configuration"}`);
    }
  };

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
      const q = query(
        collection(db, "hoursRequests"),
        where("coordinatorContact", "==", (user.email || "").trim().toLowerCase()),
        where("status", "==", "pending")
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      setHoursRequests(list);
    } catch (e) {
      console.error("Failed to fetch custom hours requests:", e);
    }
  };

  useEffect(() => {
    fetchHoursRequests();
  }, [user, isDemoMode]);

  const handleApproveHoursRequest = async (req: any, approved: boolean) => {
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
            id: "log-req-" + Date.now(),
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
          const newLogItem = {
            id: "log-req-" + Date.now(),
            activity: req.activity + ` (${orgProfile?.organizationName || req.organization})`,
            hours: req.hours,
            date: req.date,
            coordinatorName: orgProfile?.organizationName || req.coordinatorName,
            coordinatorContact: user?.email || req.coordinatorContact,
            approved: true
          };

          const studentRef = doc(db, "students", req.studentId);
          const studentSnap = await getDoc(studentRef);
          if (!studentSnap.exists()) {
            // Without this guard the missing student was skipped silently, the
            // request was still marked "approved" below, and the org saw
            // "Hours approved successfully!" - while the student was never
            // credited and the request vanished from the queue for good.
            throw new Error(
              `Student record not found for ${req.studentName || req.studentId}, so the hours could not be credited.`
            );
          }
          const currentHours = studentSnap.data().loggedHours || [];
          await updateDoc(studentRef, {
            loggedHours: [...currentHours, newLogItem]
          });
        }

        const reqRef = doc(db, "hoursRequests", req.id);
        await updateDoc(reqRef, {
          status: approved ? "approved" : "declined"
        });

        setSuccessMessage(approved ? "Hours approved successfully!" : "Hours request declined.");
        await fetchHoursRequests();
      }

      sendTransactionalEmail({
        to: req.studentEmail,
        subject: approved 
          ? `✓ ${req.hours} Volunteer Hours Successfully Approved! 🎉`
          : `⚠️ Volunteer Hour Claim Declined`,
        templateName: approved ? "hours_confirmation" : "admin_alert",
        templateData: {
          studentName: req.studentName,
          oppTitle: req.activity,
          hours: req.hours,
          activity: req.activity,
          orgName: orgProfile?.organizationName || "Verified Organization",
          supervisorName: req.coordinatorName || "Site Supervisor",
          subject: "Volunteer Hours Update",
          details: approved 
            ? `Your supervisor has approved your volunteer claim of ${req.hours} hours for ${req.activity}.`
            : `Your claim of ${req.hours} hours for ${req.activity} was declined. Please verify inputs with your coordinator.`
        }
      }).catch(err => console.error("Could not send validation email:", err));

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

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setIsLoading(true);

      if (isDemoMode) {
        // Mock data for demo mode
        const mockOpps: Opportunity[] = [
          {
            id: "demo-opp-1",
            orgId: user.uid,
            title: "Welcome Center Support",
            description: "Help us welcome new community members.",
            location: "5100 Yonge St, North York",
            dateTime: new Date(Date.now() + 86400000 * 5),
            category: "Community Services",
            requirements: "Friendly attitude.",
            maxVolunteers: 10,
            skillsNeeded: ["Communication"],
            timeCommitment: "One-time",
            isVirtual: false,
            createdAt: new Date() as any,
          },
        ];

        const storedApps = localStorage.getItem("demo_applications");
        let apps: Application[] = storedApps
          ? JSON.parse(storedApps)
          : [
              {
                id: "demo-app-1",
                opportunityId: "demo-opp-1",
                opportunityTitle: "Welcome Center Support",
                studentId: "demo-student-1",
                studentName: "Alex Volunteer",
                status: "pending",
                message: "I would love to help out at the welcome center!",
                appliedAt: new Date() as any,
              },
            ];

        setOpportunities(mockOpps);
        setRecentApplications(apps);
        setIsLoading(false);
        return;
      }

      try {
        // Fetch opportunities
        let oppsData: Opportunity[] = [];
        try {
          const oppsQuery = query(
            collection(db, "opportunities"),
            where("orgId", "==", user.uid),
            orderBy("createdAt", "desc"),
          );
          const oppsSnap = await getDocs(oppsQuery);
          oppsData = oppsSnap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as Opportunity,
          );
        } catch (dbErr) {
          console.warn(
            "Firestore fetch for opportunities failed, using local fallback:",
            dbErr,
          );
        }

        // Merge with any local opportunities saved to localStorage by this organization
        const localOpps = JSON.parse(
          localStorage.getItem("local_opportunities") || "[]",
        );
        const orgLocalOpps = localOpps.filter(
          (opp: any) => opp.orgId === user.uid,
        );

        // Combine keeping latest on top, avoiding duplicate IDs
        const combinedOpps = [...orgLocalOpps, ...oppsData];
        const uniqueOpps = combinedOpps.filter(
          (opp, idx, self) => self.findIndex((o) => o.id === opp.id) === idx,
        );

        setOpportunities(uniqueOpps);

        // Fetch applications for these opportunities
        let appsData: Application[] = [];
        try {
          const oppIds = uniqueOpps.map((o) => o.id);
          if (oppIds.length > 0) {
            // Firestore 'in' support up to 30 elements maximum. Chunk query to load all applications for major organizations.
            const chunkSize = 30;
            const chunks: string[][] = [];
            for (let i = 0; i < oppIds.length; i += chunkSize) {
              chunks.push(oppIds.slice(i, i + chunkSize));
            }

            const queryPromises = chunks.map(async (chunk) => {
              const appsQuery = query(
                collection(db, "applications"),
                where("opportunityId", "in", chunk),
                orderBy("appliedAt", "desc"),
              );
              const snap = await getDocs(appsQuery);
              return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Application);
            });

            const results = await Promise.all(queryPromises);
            appsData = results.flat();
            // Re-sort apps by appliedAt desc since chunks were queried independently
            appsData.sort((a, b) => {
              const dateA = a.appliedAt?.seconds ? a.appliedAt.seconds * 1000 : new Date(a.appliedAt || 0).getTime();
              const dateB = b.appliedAt?.seconds ? b.appliedAt.seconds * 1000 : new Date(b.appliedAt || 0).getTime();
              return dateB - dateA;
            });
          }
        } catch (appsErr) {
          console.warn(
            "Firestore fetch for applications failed, using local fallback:",
            appsErr,
          );
        }

        const localApps = JSON.parse(
          localStorage.getItem("demo_applications") || "[]",
        );
        // Filter local applications matching any of the active opportunities
        const activeOppIds = uniqueOpps.map((o) => o.id);
        const orgLocalApps = localApps.filter((app: any) =>
          activeOppIds.includes(app.opportunityId),
        );

        const combinedApps = [...orgLocalApps, ...appsData];
        const uniqueApps = combinedApps.filter(
          (app, idx, self) => self.findIndex((a) => a.id === app.id) === idx,
        );

        setRecentApplications(uniqueApps);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user]);

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
      try {
        let studentEmail: string | null = null;
        const targetApp = currentRecentApps.find((a) => a.id === appId);
        const targetStudentName = targetApp?.studentName || "Student";
        const opportunityTitle = targetApp?.opportunityTitle || "Opportunity";

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
          const subject = newStatus === "accepted"
            ? `Your application for "${opportunityTitle}" was accepted! 🎉`
            : `Application Update for "${opportunityTitle}"`;

          await sendTransactionalEmail({
            to: studentEmail,
            subject: subject,
            templateName: "application_status",
            templateData: {
              studentName: targetStudentName,
              oppTitle: opportunityTitle,
              orgName: orgProfile?.organizationName || "Verified Organization",
              status: newStatus === "accepted" ? "accepted" : "rejected",
              note: newStatus === "rejected"
                ? `${rejectionData?.reason || "Schedule Match Conflict"}. ${rejectionData?.note || ""}`
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
      const updates: any = {
        status: newStatus,
      };

      if (newStatus === "rejected" && rejectionData) {
        updates.rejectionReason = rejectionData.reason;
        updates.rejectionNote = rejectionData.note;
      }

      try {
        await updateDoc(doc(db, "applications", appId), updates);
      } catch (dbErr) {
        if (isDemoMode) {
          console.warn(
            "Firestore update application status failed, using local fallback:",
            dbErr,
          );
          // Fallback: update in localStorage demo_applications
          const storedApps = localStorage.getItem("demo_applications");
          if (storedApps) {
            const appsList = JSON.parse(storedApps);
            const updatedList = appsList.map((a: any) =>
              a.id === appId
                ? {
                    ...a,
                    status: newStatus,
                    rejectionReason: rejectionData?.reason,
                    rejectionNote: rejectionData?.note,
                  }
                : a,
            );
            localStorage.setItem(
              "demo_applications",
              JSON.stringify(updatedList),
            );
          }
        } else {
          // If we are not in demo mode, avoid silent swallow. Raise error for correction.
          throw dbErr;
        }
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
      if (oppId && (newStatus === "rejected" || newStatus === "terminated")) {
        await promoteWaitlistedApplicant(oppId, orgProfile?.organizationName || "Verified Organization");
      }

      return { success: true, emailSent, receiptGenerated };
    } catch (err: any) {
      console.error("Error updating status:", err);
      setErrorMessage(err.message || "Operation failed");
      if (!isDemoMode) {
        const formattedErr = handleFirestoreError(err, OperationType.UPDATE, "applications");
        return { success: false, emailSent: false, receiptGenerated: false, error: formattedErr.error };
      }
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

    try {
      const studentSnap = await getDoc(doc(db, "students", app.studentId));
      if (studentSnap.exists()) {
        setReviewStudent(studentSnap.data() as StudentProfile);
      }
    } catch (err) {
      console.error("Error fetching student profile:", err);
    }
  };

  const handleOrgLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !logDate || !logHours || !logActivity) {
      alert("Please fill in all credit logging fields.");
      return;
    }

    setIsSubmittingLog(true);
    setLogResultStatus(null);

    const parsedHours = Number(parseFloat(logHours).toFixed(1));
    const newLogItem = {
      id: "log-org-" + Date.now(),
      activity:
        logActivity + ` (${orgProfile?.organizationName || "Verified Org"})`,
      hours: parsedHours,
      date: logDate,
      coordinatorName: orgProfile?.organizationName || "Verified Organization",
      coordinatorContact: user?.email || "Registered Org",
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
        const studentRef = doc(db, "students", selectedStudentId);
        const studentSnap = await getDoc(studentRef);

        if (studentSnap.exists()) {
          const sName = studentSnap.data().fullName;
          if (sName) studentName = sName;

          const userRef = doc(db, "users", selectedStudentId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const sEmail = userSnap.data().email;
            if (sEmail) studentEmail = sEmail;
          }

          const currentHours = studentSnap.data().loggedHours || [];
          const updatedHours = [...currentHours, newLogItem];
          await updateDoc(studentRef, {
            loggedHours: updatedHours,
          });
          setLogResultStatus("success");
          setLogDate("");
          setLogHours("");
          setLogActivity("");
          setSelectedStudentId("");
          setSuccessMessage("Successfully logged and authorized hours!");
        } else {
          setLogResultStatus("error_not_found");
        }
      }

      if (studentEmail && studentEmail !== "student@example.com") {
        sendTransactionalEmail({
          to: studentEmail,
          subject: `${parsedHours} Volunteer Hours Successfully Authorized! 🎉`,
          templateName: "hours_confirmation",
          templateData: {
            studentName: studentName,
            hours: parsedHours,
            activity: logActivity,
            orgName: orgProfile?.organizationName || "Verified Organization"
          }
        }).catch((err) => {
          console.error("Failed to automatically email hours notification to student:", err);
        });
      }
    } catch (err) {
      console.error("Failed to log student hours:", err);
      setLogResultStatus("error");
    } finally {
      setIsSubmittingLog(false);
    }
  };

  if (isLoading)
    return (
      <div className="p-8 text-center text-slate-600 font-bold">
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
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-6 py-3 rounded-sm font-black uppercase text-xs tracking-widest  shadow-rose-200 flex items-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            {errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-3xl font-mono font-medium text-slate-900 tracking-tight leading-none">
            {orgProfile?.organizationName || "Organization"} Dashboard
          </h1>
          <p className="text-slate-600 mt-2 font-medium">
            Manage your opportunities and review volunteers across Toronto.
          </p>
        </div>
        <Link to="/org/opportunities/new">
          <Button className="gap-2  shadow-blue-100 h-12 rounded-sm px-6 font-black uppercase text-xs tracking-widest bg-[#1F4C63] hover:bg-[#153343]">
            <PlusCircle className="w-5 h-5" /> Post Opportunity
          </Button>
        </Link>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card
          onClick={() => setSelectedStatPopup("opportunities")}
          className="p-8 bg-[#1F4C63] text-white border-none  shadow-blue-100 rounded-sm cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-4xl font-mono font-medium leading-none">
                {stats.totalOpps}
              </h3>
              <p className="text-blue-100 text-[10px] font-black uppercase tracking-widest mt-2 font-mono">
                Opportunities
              </p>
            </div>
            <ClipboardList className="text-blue-400 w-10 h-10 opacity-50" />
          </div>
        </Card>
        <Card
          onClick={() => setSelectedStatPopup("pending")}
          className="p-8 bg-white border-none  shadow-slate-100 rounded-sm border-b-4 border-b-yellow-500 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-4xl font-mono font-medium text-slate-900 leading-none">
                {stats.pendingApps}
              </h3>
              <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest mt-2 font-mono">
                Pending Review
              </p>
            </div>
            <Clock className="text-[#E08A3C] w-10 h-10" />
          </div>
        </Card>
        <Card
          onClick={() => setSelectedStatPopup("accepted")}
          className="p-8 bg-white border-none  shadow-slate-100 rounded-sm border-b-4 border-b-[#1F4C63] cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-4xl font-mono font-medium text-slate-900 leading-none">
                {stats.acceptedApps}
              </h3>
              <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest mt-2 font-mono">
                Accepted
              </p>
            </div>
            <CheckCircle className="text-[#1F4C63] w-10 h-10" />
          </div>
        </Card>
        <Card
          onClick={() => setSelectedStatPopup("rejected")}
          className="p-8 bg-white border-none  shadow-slate-100 rounded-sm border-b-4 border-b-red-500 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-4xl font-mono font-medium text-slate-900 leading-none">
                {stats.rejectedApps}
              </h3>
              <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest mt-2 font-mono">
                Rejected
              </p>
            </div>
            <XCircle className="text-red-500 w-10 h-10" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        {/* Managed Opportunities */}
        <section className="lg:col-span-2 space-y-6">
          <div className="space-y-3">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              Active Opportunities
            </h2>
            <div className="relative">
              <input
                type="text"
                placeholder="Search opportunities by name, category, or location..."
                value={oppSearchTerm}
                onChange={(e) => setOppSearchTerm(e.target.value)}
                className="w-full text-[11px] font-semibold bg-slate-50 px-4 py-3 h-10 rounded-sm border border-slate-100 outline-none focus:ring-1 focus:ring-[#1F4C63] focus:bg-white transition-all "
              />
              {oppSearchTerm && (
                <button
                  type="button"
                  onClick={() => setOppSearchTerm("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-2.5 text-xs text-slate-600 hover:text-slate-600 font-extrabold cursor-pointer"
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
                  className="p-8 hover:border-[#1F4C63]/20 transition-all group border-none  shadow-slate-50 rounded-sm bg-white"
                >
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Link
                        to={`/org/opportunities/${opp.id}/applicants`}
                        className="font-black text-xl text-slate-900 group-hover:text-[#1F4C63] block leading-tight"
                      >
                        {opp.title}
                      </Link>
                      <p className="text-xs text-slate-600 flex items-center gap-1 font-bold uppercase tracking-widest">
                        <Clock className="w-3 h-3" /> Created {opp.createdAt 
                            ? (opp.createdAt.toDate ? opp.createdAt.toDate() : new Date(opp.createdAt)).toLocaleDateString()
                            : new Date().toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-4 py-4 border-t border-b border-slate-50">
                      <Badge
                        variant="secondary"
                        className="bg-[#1F4C63]/5 text-[#153343] border-none font-bold px-3 py-1"
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
                        className="text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-[#1F4C63] flex items-center gap-1.5 no-underline transition-colors cursor-pointer"
                      >
                        <Calendar className="w-3.5 h-3.5 text-[#1F4C63]" />
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
                          className="w-full text-[10px] h-10 font-black uppercase tracking-widest rounded-sm hover:bg-slate-50"
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
                          className="w-full text-[10px] h-10 font-black uppercase tracking-widest rounded-sm border-slate-100 hover:border-[#1F4C63] hover:text-[#1F4C63]"
                        >
                          Review All
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="py-20 text-center bg-white rounded-sm border border-dashed border-slate-200">
                <p className="text-slate-600 font-bold">
                  No opportunities posted yet.
                </p>
                <Link to="/org/opportunities/new">
                  <Button variant="ghost" className="mt-2 text-[#1F4C63]">
                    Post your first one ➜
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Recent Applications Feed */}
        <section className="lg:col-span-3 space-y-6">
          {/* Google Gmail Integration Console */}
          <Card className="p-8 border-none  shadow-slate-100 rounded-sm   to-white border border-slate-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="flex gap-4 items-start">
                <span className="p-4 bg-red-50 rounded-sm text-red-600 block shrink-0">
                  <Mail className="w-6 h-6" />
                </span>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-lg leading-tight flex items-center gap-2 flex-wrap">
                    Gmail Notification Broadcasts
                    {isGmailStateEnabled && (
                      <Badge className="bg-[#E08A3C]/10 text-[#E08A3C] hover:bg-[#E08A3C]/20 px-2 py-0.5 rounded-sm text-[9px] uppercase font-black tracking-widest leading-none border-none">
                        Active
                      </Badge>
                    )}
                  </h3>
                  <p className="text-xs font-semibold text-slate-600 mt-1">
                    Authorize Gmail to automatically send decision emails
                    (acceptance, rejection, etc.) to student volunteers in real
                    time.
                  </p>
                </div>
              </div>
              <Button
                variant={isGmailStateEnabled ? "outline" : "default"}
                onClick={handleToggleGmail}
                className={cn(
                  "h-12 px-6 rounded-sm font-black text-xs uppercase tracking-widest shrink-0 w-full md:w-auto",
                  isGmailStateEnabled
                    ? "border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                    : "bg-red-600 hover:bg-red-700 text-white  shadow-red-200",
                )}
              >
                {isGmailStateEnabled
                  ? "Disconnect Gmail"
                  : "Enable Gmail Integration"}
              </Button>
            </div>

            {isGmailStateEnabled && (
              <div className="mt-6 pt-6 border-t border-slate-100/80 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-2 text-slate-600 font-bold">
                    <span
                      className={cn(
                        "w-2.5 h-2.5 rounded-sm inline-block",
                        accessToken || isDemoMode
                          ? "bg-[#E08A3C] animate-pulse"
                          : "bg-orange-400 animate-pulse",
                      )}
                    />
                    Session Token Status:{" "}
                    <span
                      className={cn(
                        "font-black uppercase tracking-wider text-[10px]",
                        accessToken || isDemoMode
                          ? "text-[#E08A3C]"
                          : "text-[#E08A3C]",
                      )}
                    >
                      {accessToken || isDemoMode
                        ? "Fully Authorized"
                        : "Expired (Requires Re-Auth)"}
                    </span>
                  </div>
                  {!(accessToken || isDemoMode) && (
                    <Button
                      variant="ghost"
                      onClick={handleToggleGmail}
                      className="text-xs font-black text-red-600 bg-red-50 hover:bg-red-100 rounded-sm px-3 py-1.5 h-auto uppercase tracking-wider"
                    >
                      Refresh Auth Connection
                    </Button>
                  )}
                </div>

                <div className="bg-white p-6 rounded-sm border border-slate-100 flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex-1 w-full">
                    <p className="text-xs font-black text-slate-600 uppercase tracking-widest mb-1.5">
                      Verify connection with a test email
                    </p>
                    <input
                      type="email"
                      placeholder="Type your email (e.g. your_address@gmail.com)"
                      value={testEmailAddress}
                      onChange={(e) => setTestEmailAddress(e.target.value)}
                      className="w-full text-sm font-medium border border-slate-100 bg-slate-50 rounded-sm px-4 py-3 focus:outline-none focus:border-red-500 focus:bg-white transition-colors border-slate-200"
                    />
                  </div>
                  <Button
                    onClick={handleSendTestEmail}
                    disabled={isSendingTest}
                    className="w-full sm:w-auto h-12 px-6 rounded-sm bg-slate-900 hover:bg-slate-800 text-white font-extrabold uppercase text-[10px] tracking-widest"
                  >
                    {isSendingTest ? "Sending Test..." : "Send Test Mail"}
                  </Button>
                </div>

                {testFeedback && (
                  <p className="text-xs font-bold text-slate-600 italic bg-slate-100/50 px-4 py-3 rounded-sm border border-dotted border-slate-200">
                    {testFeedback}
                  </p>
                )}
              </div>
            )}
          </Card>

          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              Recent Applications
            </h2>
            <div className="flex bg-slate-100 p-1 rounded-sm">
              {(["all", "pending", "accepted"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={cn(
                    "px-4 py-1.5 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all",
                    filterTab === tab
                      ? "bg-white text-[#1F4C63] "
                      : "text-slate-600 hover:text-slate-600",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <Card className="overflow-hidden border-none  shadow-slate-100 rounded-sm bg-white">
            <div className="divide-y divide-slate-100">
              {recentApplications.filter(
                (a) => filterTab === "all" || a.status === filterTab,
              ).length > 0 ? (
                recentApplications
                  .filter((a) => filterTab === "all" || a.status === filterTab)
                  .map((app) => (
                    <div
                      key={app.id}
                      className="p-8 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row justify-between md:items-center gap-6 mb-4">
                        <div className="flex gap-4 items-center">
                          <div className="w-14 h-14 rounded-sm bg-[#1F4C63]/5 flex items-center justify-center text-[#1F4C63] font-black text-xl">
                            {app.studentName?.[0] || "S"}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 text-lg leading-tight">
                              {app.studentName || "Student"}
                            </h4>
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">
                              For{" "}
                              <span className="text-[#1F4C63]">
                                {app.opportunityTitle}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={
                              app.status === "accepted"
                                ? "success"
                                : app.status === "rejected"
                                  ? "danger"
                                  : "warning"
                            }
                            className="font-bold border-none px-3 py-1"
                          >
                            {app.status.toUpperCase()}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-10 h-10 p-0 rounded-sm hover:bg-white hover: transition-all"
                            onClick={() => openReview(app)}
                          >
                            <Eye className="w-4 h-4 text-slate-600" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs font-black uppercase tracking-widest h-11 rounded-sm border-[#1F4C63]/10 text-[#1F4C63] hover:bg-[#1F4C63]/5 transition-all gap-2"
                          onClick={() => openReview(app)}
                        >
                          <Eye className="w-4 h-4" />{" "}
                          {app.status === "pending"
                            ? "Review Application"
                            : "View Details"}
                        </Button>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="p-20 text-center text-slate-600 font-bold uppercase tracking-widest text-[10px]">
                  No applications to review yet.
                </div>
              )}
            </div>
          </Card>
        </section>
      </div>

      {/* Organization Registrations and Direct Logging Control Pane */}
      <section className="bg-slate-50/50 rounded-sm p-8 md:p-12 border border-slate-100  space-y-8 animate-fadeIn">
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>🛡️ Authorized Student Credits Registrar</span>
          </h2>
          <p className="text-xs font-bold text-slate-600 uppercase tracking-widest font-mono">
            Directly record and validate volunteer hours for youth participants
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left side: Logging Form */}
          <div className="lg:col-span-7 bg-white p-6 md:p-8 rounded-sm border border-slate-100 space-y-6 ">
            <h3 className="text-base font-black uppercase text-slate-900 tracking-wide">
              Record Volunteer Hours
            </h3>

            <form onSubmit={handleOrgLogSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest block ml-1">
                  Select Active Student *
                </label>
                <select
                  required
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-50 p-3 h-12 rounded-sm border border-slate-100 outline-none focus:ring-1 focus:ring-[#1F4C63] focus:bg-white transition-all"
                >
                  <option value="">-- Choose active youth volunteer --</option>
                  {studentsList.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.fullName} (ID: {st.id.substring(0, 8)}...)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest block ml-1">
                    Exact Date of Shift *
                  </label>
                  <input
                    type="date"
                    required
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 p-3 h-12 rounded-sm border border-slate-100 outline-none focus:ring-1 focus:ring-[#1F4C63] focus:bg-white transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest block ml-1">
                    Credits Earned (Hours) *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.1"
                    placeholder="e.g. 4.5"
                    value={logHours}
                    onChange={(e) => setLogHours(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 p-3 h-12 rounded-sm border border-slate-100 outline-none focus:ring-1 focus:ring-[#1F4C63] focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest block ml-1">
                  Volunteering Activity Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Toronto Haven Food Bank Sorting Shift"
                  value={logActivity}
                  onChange={(e) => setLogActivity(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-50 p-3 h-12 rounded-sm border border-slate-100 outline-none focus:ring-1 focus:ring-[#1F4C63] focus:bg-white transition-all"
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  isLoading={isSubmittingLog}
                  className="w-full h-12 rounded-sm bg-[#1F4C63] hover:bg-[#153343] text-white font-black uppercase text-xs tracking-widest hover:scale-[1.01] active:scale-[0.99] transition-all"
                >
                  ✓ Authorize & Log Credit Hours
                </Button>
              </div>

              {logResultStatus === "success" && (
                <p className="text-[11px] font-extrabold text-[#1F4C63] uppercase text-center animate-pulse">
                  ✓ Hours successfully recorded onto Student Hour Log!
                </p>
              )}
              {logResultStatus === "error_not_found" && (
                <p className="text-[11px] font-extrabold text-red-500 uppercase text-center">
                  ❌ Error: Student Profile was not found.
                </p>
              )}
              {logResultStatus === "error" && (
                <p className="text-[11px] font-extrabold text-red-500 uppercase text-center">
                  ❌ Failed to save hours log. Please try again.
                </p>
              )}
            </form>
          </div>

          {/* Right side: Disclaimer + Hour Request Approvals */}
          <div className="lg:col-span-5 space-y-6">
            {/* Disclaimer box */}
            <div className="bg-[#E08A3C]/10 border-2 border-dashed border-[#E08A3C] p-8 rounded-sm space-y-4">
              <h3 className="text-amber-950 font-black text-sm uppercase tracking-wider flex items-center gap-2">
                <span>⚠️</span> REQUIREMENT DISCLAIMER
              </h3>

              <p className="text-[11px] text-amber-900 leading-relaxed font-semibold">
                While logging hours on Volunteer NY updates the student's digital
                portal metrics instantly, <strong>students may still require a physical community involvement form with your signature to submit to their high school.</strong>
              </p>
            </div>

            {/* Verification Inquiries */}
            <div className="bg-white p-6 md:p-8 rounded-sm border border-slate-100 space-y-6 ">
              <div className="space-y-1">
                <h3 className="text-base font-black uppercase text-slate-900 tracking-wide">
                  Hours Claims Inbox
                </h3>
                <p className="text-[10px] uppercase font-black tracking-widest text-[#1F4C63] font-mono">
                  Pending Verification Requests ({hoursRequests.length})
                </p>
              </div>

              {hoursRequests.length === 0 ? (
                <div className="py-6 text-center border-2 border-dashed border-slate-100 rounded-sm text-xs font-semibold text-slate-600 italic">
                  No pending verification claims found.
                </div>
              ) : (
                <div className="space-y-4">
                  {hoursRequests.map((req) => (
                    <div key={req.id} className="p-4 bg-slate-50 rounded-sm border border-slate-100 space-y-3 hover:border-slate-200 transition-all">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-black text-slate-900">{req.studentName}</p>
                          <p className="text-[10px] text-slate-600 text-slate-600 font-mono font-bold">{req.studentEmail}</p>
                        </div>
                        <span className="p-2 py-1 bg-[#1F4C63]/5 text-blue-800 text-[10px] font-black uppercase tracking-widest rounded-sm font-mono border border-[#1F4C63]/10 shrink-0">
                          {req.hours} hrs
                        </span>
                      </div>

                      <div className="text-[11px] font-semibold text-slate-600 space-y-1 bg-white p-3 rounded-sm border border-slate-100/60">
                        <p><strong className="text-slate-600">Activity:</strong> {req.activity}</p>
                        <p><strong className="text-slate-600">Org:</strong> {req.organization}</p>
                        <p><strong className="text-slate-600">Date:</strong> {req.date}</p>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isApprovingId !== null}
                          onClick={() => handleApproveHoursRequest(req, false)}
                          className="w-1/2 h-9 text-[9px] font-black uppercase tracking-widest text-red-600 hover:bg-red-50 border border-slate-200 cursor-pointer text-red-600"
                        >
                          Decline
                        </Button>
                        <Button
                          type="button"
                          disabled={isApprovingId !== null}
                          onClick={() => handleApproveHoursRequest(req, true)}
                          className="w-1/2 h-9 text-[9px] font-black uppercase tracking-widest bg-[#1F4C63] hover:bg-[#153343] text-white  cursor-pointer"
                        >
                          {isApprovingId === req.id ? "Approving..." : "Approve ✓"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

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
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-sm  w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col border border-slate-100"
            >
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tight">
                    {selectedStatPopup === "opportunities" &&
                      "My Active Postings"}
                    {selectedStatPopup === "pending" &&
                      "Pending Candidate Applications"}
                    {selectedStatPopup === "accepted" && "Accepted Placements"}
                    {selectedStatPopup === "rejected" && "Rejected Submissions"}
                  </h3>
                  <p className="text-xs text-slate-600 font-semibold mt-1">
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
                  className="w-10 h-10 rounded-sm hover:bg-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-700 transition-colors"
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
                          className="p-5 bg-slate-50 rounded-sm border border-slate-100 flex justify-between items-center"
                        >
                          <div>
                            <div className="font-bold text-slate-900 text-sm">
                              {opp.title}
                            </div>
                            <div className="text-[10px] text-slate-600 font-black uppercase tracking-wider mt-1">
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
                              className="text-[10px] font-bold uppercase tracking-wider h-9 rounded-sm"
                            >
                              Candidates
                            </Button>
                          </Link>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-600 italic text-center py-6">
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
                            className="p-5 bg-slate-50 rounded-sm border border-slate-100 flex justify-between items-center"
                          >
                            <div>
                              <div className="font-bold text-slate-900 text-sm">
                                {app.studentName || "Unlabeled Student"}
                              </div>
                              <div className="text-[10px] text-slate-600 font-black uppercase tracking-wider mt-1">
                                For: {app.opportunityTitle}
                              </div>
                              {app.status === "rejected" &&
                                app.rejectionReason && (
                                  <div className="mt-2 text-xs text-red-600 bg-red-50 p-2.5 rounded-sm border border-red-100">
                                    <span className="font-bold">Reason:</span>{" "}
                                    {app.rejectionReason}
                                  </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-[10px] font-bold uppercase tracking-wider h-9 rounded-sm border-slate-200 text-slate-600 hover:text-[#1F4C63] hover:border-[#1F4C63]/30"
                                onClick={() => {
                                  setSelectedStatPopup(null);
                                  navigate("/messages", {
                                    state: { openWithUserId: app.studentId, openWithLabel: app.studentName },
                                  });
                                  requestOpenDirectChat(app.studentId, app.studentName);
                                }}
                              >
                                <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                                Message
                              </Button>
                              <Button
                                size="sm"
                                className="bg-[#1F4C63] hover:bg-[#153343] text-white text-[10px] font-bold uppercase tracking-wider h-9 rounded-sm"
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
                      <p className="text-sm text-slate-600 italic text-center py-6">
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

