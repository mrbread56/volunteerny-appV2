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
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { sendTransactionalEmail } from "../lib/emailService";
import { promoteWaitlistedApplicant } from "../lib/waitlistService";

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
          const newLogItem = {
            id: `log-req-${req.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
          ? `${req.hours} volunteer hours approved`
          : `Update on your volunteer hours submission`,
        templateName: approved ? "hours_confirmation" : "notification",
        templateData: {
          heading: "Your volunteer hours were not approved",
          details: `${orgProfile?.organizationName || "The organization"} reviewed the ${req.hours} hours you submitted for "${req.activity}" and was not able to approve them. If you think this is a mistake, contact your supervisor at the organization directly — they can re-submit the confirmation from their dashboard.`,
          studentName: req.studentName,
          oppTitle: req.activity,
          hours: req.hours,
          activity: req.activity,
          orgName: orgProfile?.organizationName || "Verified Organization",
          supervisorName: req.coordinatorName || "Site Supervisor",
          subject: "Volunteer Hours Update",
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
      id: `log-org-${user?.uid || "org"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
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
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-6 py-3 rounded-lg font-semibold text-xs tracking-wide shadow-rose-200 flex items-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            {errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

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
          <Button className="gap-2 shadow-blue-100 h-12 rounded-lg px-6 font-semibold text-xs tracking-wide bg-blue-dark hover:bg-[#153343]">
            <PlusCircle className="w-5 h-5" /> Post Opportunity
          </Button>
        </Link>
      </div>

      {/* Stats Overview — visible on the overview tab */}
      {activeTab === "overview" && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card
          onClick={() => setSelectedStatPopup("opportunities")}
          className="p-8 bg-blue-dark text-white border-none shadow-blue-100 rounded-lg cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
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
          className="p-8 bg-white border-none rounded-lg border-b-2 border-b-yellow-500 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
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
          className="p-8 bg-white border-none rounded-lg border-b-2 border-b-blue-dark cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
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
          className="p-8 bg-white border-none rounded-lg border-b-2 border-b-red-500 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
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
            <XCircle className="text-red-500 w-10 h-10" />
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
                  className="p-8 hover:border-blue-dark/20 transition-all group border-none rounded-lg bg-white"
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
        <section className="lg:col-span-3 space-y-6">


          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
              Recent Applications
            </h2>
            <div className="flex bg-paper-3 p-1 rounded-lg">
              {(["all", "pending", "accepted"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all",
                    filterTab === tab
                      ? "bg-white text-blue-dark"
                      : "text-ink-soft hover:text-ink",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <Card className="overflow-hidden border-none rounded-lg bg-white">
            <div className="divide-y divide-slate-100">
              {recentApplications.filter(
                (a) => filterTab === "all" || a.status === filterTab,
              ).length > 0 ? (
                recentApplications
                  .filter((a) => filterTab === "all" || a.status === filterTab)
                  .map((app) => (
                    <div
                      key={app.id}
                      className="p-8 hover:bg-paper-2 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row justify-between md:items-center gap-6 mb-4">
                        <div className="flex gap-4 items-center">
                          <div className="w-14 h-14 rounded-lg bg-blue-dark/5 flex items-center justify-center text-blue-dark font-semibold text-xl">
                            {app.studentName?.[0] || "S"}
                          </div>
                          <div>
                            <h4 className="font-bold text-ink text-lg leading-tight">
                              {app.studentName || "Student"}
                            </h4>
                            <p className="text-xs font-semibold text-ink-soft tracking-wide mt-1">
                              For{" "}
                              <span className="text-blue-dark">
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
                            className="w-10 h-10 p-0 rounded-lg hover:bg-white transition-all"
                            onClick={() => openReview(app)}
                          >
                            <Eye className="w-4 h-4 text-ink-soft" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs font-semibold tracking-wide h-11 rounded-lg border-blue-dark/10 text-blue-dark hover:bg-blue-dark/5 transition-all gap-2"
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
                <div className="p-20 text-center text-ink-soft font-bold tracking-wide text-xs">
                  No applications to review yet.
                </div>
              )}
            </div>
          </Card>
        </section>
        )}
      </div>
      )}

      {/* Hours Verification — own tab */}
      {activeTab === "hours" && (
      <section className="bg-white p-8 md:p-10 border border-line space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-ink tracking-tight flex items-center gap-2">
            <span>🛡️ Authorized Student Credits Registrar</span>
          </h2>
          <p className="text-xs font-bold text-ink-soft tracking-wide font-mono">
            Directly record and validate volunteer hours for youth participants
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left side: Logging Form */}
          <div className="lg:col-span-7 bg-white p-6 md:p-8 rounded-lg border border-line space-y-6 ">
            <h3 className="text-base font-semibold uppercase text-ink tracking-wide">
              Record Volunteer Hours
            </h3>

            <form onSubmit={handleOrgLogSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-ink-soft tracking-wide block ml-1">
                  Select Active Student *
                </label>
                <select
                  required
                  aria-label="Select active student"
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full text-xs font-semibold bg-paper-2 p-3 h-12 rounded-lg border border-line outline-none focus:ring-1 focus:ring-blue-dark focus:bg-white transition-all"
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
                  <label className="text-xs font-semibold text-ink-soft tracking-wide block ml-1">
                    Exact Date of Shift *
                  </label>
                  <input
                    type="date"
                    required
                    aria-label="Exact date of shift"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="w-full text-xs font-semibold bg-paper-2 p-3 h-12 rounded-lg border border-line outline-none focus:ring-1 focus:ring-blue-dark focus:bg-white transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-ink-soft tracking-wide block ml-1">
                    Credits Earned (Hours) *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.1"
                    aria-label="Credits earned in hours"
                    placeholder="e.g. 4.5"
                    value={logHours}
                    onChange={(e) => setLogHours(e.target.value)}
                    className="w-full text-xs font-semibold bg-paper-2 p-3 h-12 rounded-lg border border-line outline-none focus:ring-1 focus:ring-blue-dark focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-ink-soft tracking-wide block ml-1">
                  Volunteering Activity Name *
                </label>
                <input
                  type="text"
                  required
                  aria-label="Volunteering activity name"
                  placeholder="e.g. Toronto Haven Food Bank Sorting Shift"
                  value={logActivity}
                  onChange={(e) => setLogActivity(e.target.value)}
                  className="w-full text-xs font-semibold bg-paper-2 p-3 h-12 rounded-lg border border-line outline-none focus:ring-1 focus:ring-blue-dark focus:bg-white transition-all"
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  isLoading={isSubmittingLog}
                  className="w-full h-12 rounded-lg bg-blue-dark hover:bg-[#153343] text-white font-semibold text-xs tracking-wide hover:scale-[1.01] active:scale-[0.99] transition-all"
                >
                  ✓ Authorize & Log Credit Hours
                </Button>
              </div>

              {logResultStatus === "success" && (
                <p className="text-xs font-semibold text-blue-dark uppercase text-center animate-pulse">
                  ✓ Hours successfully recorded onto Student Hour Log!
                </p>
              )}
              {logResultStatus === "error_not_found" && (
                <p className="text-xs font-semibold text-red-500 uppercase text-center">
                  ❌ Error: Student Profile was not found.
                </p>
              )}
              {logResultStatus === "error" && (
                <p className="text-xs font-semibold text-red-500 uppercase text-center">
                  ❌ Failed to save hours log. Please try again.
                </p>
              )}
            </form>
          </div>

          {/* Right side: Disclaimer + Hour Request Approvals */}
          <div className="lg:col-span-5 space-y-6">
            {/* Disclaimer box */}
            <div className="bg-amber/10 border-2 border-dashed border-amber p-8 rounded-lg space-y-4">
              <h3 className="text-amber-950 font-semibold text-sm uppercase tracking-wider flex items-center gap-2">
                <span>⚠️</span> REQUIREMENT DISCLAIMER
              </h3>

              <p className="text-xs text-amber-900 leading-relaxed font-semibold">
                While logging hours on Volunteer NY updates the student's digital
                portal metrics instantly, <strong>students may still require a physical community involvement form with your signature to submit to their high school.</strong>
              </p>
            </div>

            {/* Verification Inquiries */}
            <div className="bg-white p-6 md:p-8 rounded-lg border border-line space-y-6 ">
              <div className="space-y-1">
                <h3 className="text-base font-semibold uppercase text-ink tracking-wide">
                  Hours Claims Inbox
                </h3>
                <p className="text-xs uppercase font-semibold tracking-widest text-blue-dark font-mono">
                  Pending Verification Requests ({hoursRequests.length})
                </p>
              </div>

              {hoursRequests.length === 0 ? (
                <div className="py-6 text-center border-2 border-dashed border-line rounded-lg text-xs font-semibold text-ink-soft italic">
                  No pending verification claims found.
                </div>
              ) : (
                <div className="space-y-4">
                  {hoursRequests.map((req) => (
                    <div key={req.id} className="p-4 bg-paper-2 rounded-lg border border-line space-y-3 hover:border-line transition-all">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-semibold text-ink">{req.studentName}</p>
                          <p className="text-xs text-ink-soft font-mono font-bold">{req.studentEmail}</p>
                        </div>
                        <span className="p-2 py-1 bg-blue-dark/5 text-blue-800 text-xs font-semibold tracking-wide rounded-lg font-mono border border-blue-dark/10 shrink-0">
                          {req.hours} hrs
                        </span>
                      </div>

                      <div className="text-xs font-semibold text-ink-soft space-y-1 bg-white p-3 rounded-lg border border-line/60">
                        <p><strong className="text-ink-soft">Activity:</strong> {req.activity}</p>
                        <p><strong className="text-ink-soft">Org:</strong> {req.organization}</p>
                        <p><strong className="text-ink-soft">Date:</strong> {req.date}</p>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isApprovingId !== null}
                          onClick={() => handleApproveHoursRequest(req, false)}
                          className="w-1/2 h-9 text-xs font-semibold tracking-wide text-red-600 hover:bg-red-50 border border-line cursor-pointer"
                        >
                          Decline
                        </Button>
                        <Button
                          type="button"
                          disabled={isApprovingId !== null}
                          onClick={() => handleApproveHoursRequest(req, true)}
                          className="w-1/2 h-9 text-xs font-semibold tracking-wide bg-blue-dark hover:bg-[#153343] text-white cursor-pointer"
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
                      <p className="text-sm text-ink-soft italic text-center py-6">
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
                      <p className="text-sm text-ink-soft italic text-center py-6">
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

