import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import SuccessAnimation from "../components/SuccessAnimation";
import { db } from "../firebase/config";
import { subscribeToScalableLeaderboard } from "../lib/scalableLeaderboard";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  doc,
  getDoc,
  addDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  Application,
  Opportunity,
  SavedOpportunity,
  InterestRequest,
} from "../types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Calendar,
  MapPin,
  Clock,
  Star,
  ArrowRight,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  Mail,
  Phone,
  Globe,
  ListPlus,
  Send,
  X,
  Trophy,
  Lock,
  Settings,
  Printer,
  Plus,
  FileText,
  Check,
  LayoutDashboard,
} from "lucide-react";
import { formatDate, cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { OPPORTUNITY_CATEGORIES } from "../constants";
import CalendarView from "../components/CalendarView";
import ReceiptModal from "../components/ReceiptModal";
import { sendTransactionalEmail } from "../lib/emailService";
import { evaluateBadges } from "../utils/badges";
import { Award, Zap, BookOpen, Briefcase, Heart, ShieldCheck } from "lucide-react";

export default function StudentDashboard() {
  const { user, userProfile, studentProfile, isDemoMode, refreshProfile, loading } =
    useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "leaderboard" | "calendar" | "settings"
  >("dashboard");

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (
      tabParam === "leaderboard" ||
      tabParam === "calendar" ||
      tabParam === "dashboard" ||
      tabParam === "settings"
    ) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleTabChange = (tab: "dashboard" | "leaderboard" | "calendar" | "settings") => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };
  const [applications, setApplications] = useState<Application[]>([]);
  const [orgContacts, setOrgContacts] = useState<
    Record<string, { email: string; phone?: string; website?: string }>
  >({});
  const [savedOpportunities, setSavedOpportunities] = useState<Opportunity[]>(
    [],
  );
  const [recommended, setRecommended] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Receipt Modal State
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  // Rating state
  const [ratingApp, setRatingApp] = useState<any>(null);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [existingRatings, setExistingRatings] = useState<Record<string, boolean>>({});
  const [selectedReceiptApp, setSelectedReceiptApp] =
    useState<Application | null>(null);

  // Print Certificate Modal State
  const [showPrintModal, setShowPrintModal] = useState(false);

  // New Academic Verification Check: Force newly created Accounts to complete the details
  useEffect(() => {
    if (!loading && user) {
      if (!studentProfile || !studentProfile.school) {
        navigate("/student/onboarding");
      }
    }
  }, [user, studentProfile, loading, navigate]);

  // Hour Logging and tracking states
  const loggedHoursList = studentProfile?.loggedHours || [];
  const totalCompletedHours = loggedHoursList.reduce(
    (acc, current) => acc + Number(current.hours || 0),
    0,
  );
  const hourGoal = 40;

  const [selectedVolunteeringId, setSelectedVolunteeringId] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [allOrganizations, setAllOrganizations] = useState<any[]>([]);
  const [logActivity, setLogActivity] = useState("");
  const [logOrg, setLogOrg] = useState("");
  const [logHours, setLogHours] = useState("");
  const [logDate, setLogDate] = useState("");
  const [logCoordinator, setLogCoordinator] = useState("");
  const [logContact, setLogContact] = useState("");
  const [isLogging, setIsLogging] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [logSuccess, setLogSuccess] = useState(false);
  const [logError, setLogError] = useState("");

  const [hoursRequests, setHoursRequests] = useState<any[]>([]);
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [reminderSuccessId, setReminderSuccessId] = useState<string | null>(null);

  useEffect(() => {
    if (showLogForm) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [showLogForm]);

  const handleSendReminder = async (req: any) => {
    if (!req || !req.coordinatorContact) return;
    setSendingReminderId(req.id);
    try {
      await sendTransactionalEmail({
        to: req.coordinatorContact,
        subject: `⚠️ Reminder: Volunteer hours verification pending for ${studentProfile?.fullName || "Student"}`,
        templateName: "admin_alert",
        templateData: {
          subject: "Involvement Hour Verification Reminder",
          details: `Student ${studentProfile?.fullName || "Student"} is kindly reminding you to authorize the ${req.hours} hours submitted for "${req.activity}" on ${req.date}. Please log in to your dashboard to review this request.`
        }
      });
      setReminderSuccessId(req.id);
      setTimeout(() => {
        setReminderSuccessId(null);
      }, 3000);
    } catch (err) {
      console.error("Failed to send hours request reminder:", err);
    } finally {
      setSendingReminderId(null);
    }
  };

  // Leaderboard states
  const [leaderboard, setLeaderboard] = useState<
    Array<{ id: string; name: string; hours: number; isSelf: boolean }>
  >([]);

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!logActivity || !logHours || !logDate || !logOrg || !logContact) {
      setLogError("Please fill in Activity Name, Organization, Hours, Coordinator Email, and Date.");
      return;
    }
    const parsedHours = parseFloat(logHours);
    if (isNaN(parsedHours) || parsedHours <= 0) {
      setLogError("Please enter a valid positive number for hours.");
      return;
    }

    // The organization finds these requests with an exact-match Firestore query
    // on coordinatorContact == their account email. Firestore has no
    // case-insensitive matching, so "Coord@Org.com" typed by a student would
    // never match "coord@org.com" on the org account and the request would be
    // invisible to them forever. Normalise before saving.
    const normalizedContact = logContact.trim().toLowerCase();

    setIsLogging(true);
    setLogError("");
    const requestItem = {
      // Date.now() alone is millisecond-resolution and shared across all users,
      // so two students submitting in the same millisecond would generate the
      // same document id and setDoc would silently overwrite one request with
      // the other. Scope it to the user and add randomness.
      id: `req-${user.uid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      studentId: user.uid,
      studentName: studentProfile?.fullName || "Alex Volunteer",
      studentEmail: user.email || "student@example.com",
      activity: logActivity,
      organization: logOrg,
      hours: parsedHours,
      date: logDate,
      coordinatorName: logCoordinator || "Supervisor",
      coordinatorContact: normalizedContact,
      status: "pending",
      requestedAt: new Date().toISOString()
    };

    if (isDemoMode) {
      const currentReqs = JSON.parse(localStorage.getItem("demo_hours_requests") || "[]");
      currentReqs.push(requestItem);
      localStorage.setItem("demo_hours_requests", JSON.stringify(currentReqs));
      setHoursRequests(prev => [...prev, requestItem]);
      
      setLogSuccess(true);
      setLogActivity("");
      setLogOrg("");
      setLogHours("");
      setLogDate("");
      setLogCoordinator("");
      setLogContact("");
      setShowLogForm(false);
      setTimeout(() => setLogSuccess(false), 5000);
      setIsLogging(false);

      sendTransactionalEmail({
        to: normalizedContact,
        subject: `Volunteer hour authorization request from ${studentProfile?.fullName || "Student"}`,
        templateName: "admin_alert",
        templateData: {
          subject: "Involvement Hour Verification Request",
          details: `Student ${studentProfile?.fullName || "Student"} has logged ${parsedHours} hours for "${logActivity}" on ${logDate} and requested your organization's approval.`
        }
      }).catch(err => console.error("Could not send hours request notification email:", err));
      return;
    }

    try {
      await setDoc(doc(db, "hoursRequests", requestItem.id), requestItem);
      setHoursRequests(prev => [...prev, requestItem]);
      setLogSuccess(true);
      setLogActivity("");
      setLogOrg("");
      setLogHours("");
      setLogDate("");
      setLogCoordinator("");
      setLogContact("");
      setShowLogForm(false);
      setTimeout(() => setLogSuccess(false), 5000);

      // The hours request is already saved at this point. The coordinator
      // notification is a side effect: if it fails we must NOT tell the student
      // the submission failed, or they resubmit and create a duplicate request.
      sendTransactionalEmail({
        to: normalizedContact,
        subject: `Volunteer hour verification request from ${studentProfile?.fullName || "Student"}`,
        templateName: "admin_alert",
        templateData: {
          subject: "Involvement Hour Verification Request",
          details: `Student ${studentProfile?.fullName || "Student"} has submitted ${parsedHours} hours for "${logActivity}" on ${logDate} and requested your online verification.`
        }
      }).catch(err => console.error("Could not send hours verification email:", err));
    } catch (err: any) {
      setLogError("Failed to submit verification request: " + err.message);
    } finally {
      setIsLogging(false);
    }
  };

  const handleToggleCompetitiveness = async () => {
    if (!user) return;
    const newVal = !(studentProfile?.trackerEnabled ?? true);
    if (isDemoMode) {
      const updated = { ...(studentProfile || {}), trackerEnabled: newVal };
      localStorage.setItem("demo_student_profile", JSON.stringify(updated));
      await refreshProfile();
      return;
    }
    try {
      await updateDoc(doc(db, "students", user.uid), {
        trackerEnabled: newVal,
      });
      await refreshProfile();
    } catch (err) {
      console.error("Error updating trackerEnabled", err);
    }
  };

  const handleToggleAnonymity = async () => {
    if (!user) return;
    const newVal = !(studentProfile?.trackerAnonymous ?? false);
    if (isDemoMode) {
      const updated = { ...(studentProfile || {}), trackerAnonymous: newVal };
      localStorage.setItem("demo_student_profile", JSON.stringify(updated));
      await refreshProfile();
      return;
    }
    try {
      await updateDoc(doc(db, "students", user.uid), {
        trackerAnonymous: newVal,
      });
      await refreshProfile();
    } catch (err) {
      console.error("Error updating trackerAnonymous", err);
    }
  };

  const handleToggle2FA = async () => {
    if (!user) return;
    const newVal = !(userProfile?.twoFactorEnabled ?? false);
    if (isDemoMode) {
      localStorage.setItem("demo_2fa_enabled", newVal ? "true" : "false");
      await refreshProfile();
      return;
    }
    try {
      await updateDoc(doc(db, "users", user.uid), {
        twoFactorEnabled: newVal,
      });
      await refreshProfile();
    } catch (err) {
      console.error("Error updating twoFactorEnabled", err);
    }
  };

  // Load which orgs the student has already rated so we don't show the button twice
  useEffect(() => {
    if (!user || isDemoMode) return;
    const fetchRatings = async () => {
      try {
        const q = query(collection(db, 'orgRatings'), where('studentId', '==', user.uid));
        const snap = await getDocs(q);
        const map: Record<string, boolean> = {};
        snap.docs.forEach(d => { map[`${d.data().orgId}_${d.data().opportunityId}`] = true; });
        setExistingRatings(map);
      } catch (err) { console.error('Failed to load existing ratings:', err); }
    };
    fetchRatings();
  }, [user, isDemoMode]);

  const handleSubmitRating = async () => {
    if (!ratingApp || !user || ratingStars < 1) return;
    setIsSubmittingRating(true);
    try {
      const ratingId = `${user.uid}_${ratingApp.orgId || ratingApp.organizationId}_${ratingApp.opportunityId}`;
      if (isDemoMode) {
        const existing = JSON.parse(localStorage.getItem('demo_ratings') || '[]');
        existing.push({ id: ratingId, stars: ratingStars, comment: ratingComment, orgName: ratingApp.orgName || ratingApp.organizationName, opportunityTitle: ratingApp.opportunityTitle });
        localStorage.setItem('demo_ratings', JSON.stringify(existing));
      } else {
        await setDoc(doc(db, 'orgRatings', ratingId), {
          studentId: user.uid,
          studentName: studentProfile?.fullName || user.displayName || 'Student',
          orgId: ratingApp.orgId || ratingApp.organizationId,
          orgName: ratingApp.orgName || ratingApp.organizationName || 'Organization',
          opportunityId: ratingApp.opportunityId,
          opportunityTitle: ratingApp.opportunityTitle || 'Opportunity',
          stars: ratingStars,
          comment: ratingComment,
          createdAt: serverTimestamp(),
        });
      }
      setExistingRatings(prev => ({ ...prev, [`${ratingApp.orgId || ratingApp.organizationId}_${ratingApp.opportunityId}`]: true }));
      setRatingApp(null);
      setRatingStars(0);
      setRatingComment("");
    } catch (err) {
      console.error('Failed to submit rating:', err);
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const handlePrintCertificate = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setShowPrintModal(true);
      return;
    }

    const escapeHTML = (str: any) => {
      if (typeof str !== 'string') return String(str || '');
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    const tableRows =
      (studentProfile?.loggedHours || [])
        .map(
          (lh, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 12px; font-weight: bold; color: #1e293b;">${escapeHTML(lh.activity)}</td>
        <td style="padding: 12px; font-weight: bold; color: #2563eb;">${escapeHTML(lh.hours)} hrs</td>
        <td style="padding: 12px; color: #475569;">${escapeHTML(lh.date)}</td>
        <td style="padding: 12px; color: #475569;">${escapeHTML(lh.coordinatorName)} (${escapeHTML(lh.coordinatorContact)})</td>
        <td style="padding: 12px; color: #1F4C63; font-weight: bold;">Verified Profile Check</td>
      </tr>
    `,
        )
        .join("") ||
      `<tr><td colSpan="5" style="padding: 24px; text-align: center; color: #94a3b8; font-style: italic;">No volunteer hours logged in your tracking list yet.</td></tr>`;

    printWindow.document.write(`
      <html>
        <head>
          <title>Ontario High School Community Involvement Hour Document - Export</title>
          <style>
            body { font-family: 'Inter', system-ui, sans-serif; padding: 40px; color: #0f172a; line-height: 1.5; }
            .header { border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 24px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; }
            .student-info { background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            th { background: #0f172a; color: white; text-align: left; padding: 12px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
            .totals { font-size: 18px; font-weight: 800; text-align: right; margin-bottom: 50px; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; }
            .sig-box { border-top: 1px solid #94a3b8; padding-top: 12px; text-align: center; font-size: 12px; color: #475569; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Toronto Community Involvement Hours Transcript</div>
            <p style="font-size: 12px; color: #64748b; margin-top: 4px;">Ontario High School Graduation (40-Hours Requirement Tracker Document)</p>
          </div>
          
          <div class="student-info">
            <div><strong>Student Name:</strong> ${escapeHTML(studentProfile?.fullName || "Anonymous Student")}</div>
            <div><strong>Academic School:</strong> ${escapeHTML(studentProfile?.school || "Secondary School")}</div>
            <div><strong>Grade:</strong> Grade ${escapeHTML(studentProfile?.grade || "N/A")}</div>
            <div><strong>Toronto Neighborhood:</strong> ${escapeHTML(studentProfile?.neighborhood || "N/A")}</div>
          </div>

          <table border="0">
            <thead>
              <tr>
                <th>Activity Description</th>
                <th>Hours</th>
                <th>Completion Date</th>
                <th>Coordinator Supervisor Details</th>
                <th>Verification Hook</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div class="totals">
             Total Ontario Involvement Hours Logged: <span style="color: #2563eb; font-size: 24px;">${escapeHTML(totalCompletedHours)} / 40</span>
          </div>

          <p style="font-size: 11.5px; color: #64748b; font-style: italic; border-left: 2px solid #cbd5e1; padding-left: 12px; margin-bottom: 40px;">
             Disclaimer: These community involvement hours are logged on Volunteer NY for community tracking. Legal school pre-approval and physical verification forms should be authenticated in agreement with your local school board guidelines.
          </p>

          <div class="signatures">
            <div class="sig-box">
              Supervisor Signature & Stamp
            </div>
            <div class="sig-box">
              School Principal / Guidance Counselor Approval Date
            </div>
          </div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const fetchLeaderboard = () => {
      let basePeers = [
        { id: "peer-1", name: "Maya S.", hours: 32.5, isSelf: false },
        { id: "peer-2", name: "Devon K.", hours: 26.0, isSelf: false },
        { id: "peer-3", name: "Ethan L.", hours: 18.0, isSelf: false },
        { id: "peer-4", name: "Zara P.", hours: 12.5, isSelf: false },
      ];

      if (isDemoMode) {
        if (studentProfile?.trackerEnabled ?? true) {
          const selfItem = {
            id: user?.uid || "self",
            name: studentProfile?.trackerAnonymous
              ? "Anonymous Student"
              : studentProfile?.fullName || "You",
            hours: totalCompletedHours,
            isSelf: true,
          };
          const combined = [...basePeers, selfItem].sort(
            (a, b) => b.hours - a.hours,
          );
          setLeaderboard(combined);
        } else {
          setLeaderboard(basePeers);
        }
        return;
      }

      try {
        unsubscribe = subscribeToScalableLeaderboard(
          (entries) => {
            let mapped = entries.map((entry) => ({
              id: entry.userId,
              name: entry.name,
              hours: entry.score,
              isSelf: entry.userId === user?.uid,
            }));

            const hasSelf = mapped.some((item) => item.isSelf);
            if (!hasSelf && (studentProfile?.trackerEnabled ?? true)) {
              mapped.push({
                id: user?.uid || "self",
                name: studentProfile?.trackerAnonymous
                  ? "Anonymous Student"
                  : studentProfile?.fullName || "You",
                hours: totalCompletedHours,
                isSelf: true,
              });
            }

            basePeers.forEach((peer) => {
              if (!mapped.some((c) => c.id === peer.id)) {
                mapped.push(peer);
              }
            });

            mapped.sort((a, b) => b.hours - a.hours);
            setLeaderboard(mapped.slice(0, 5));
          },
          (err) => {
            console.error("Scalable leaderboard aggregation fallback:", err);
            setLeaderboard(basePeers);
          }
        );
      } catch (err) {
        console.error("Error subscribing to scalable leaderboard:", err);
        setLeaderboard(basePeers);
      }
    };

    fetchLeaderboard();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [studentProfile, isDemoMode, user, totalCompletedHours]);

  // Interest Matching State
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [interestNote, setInterestNote] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const handleInterestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || selectedCategories.length === 0) return;

    setIsSubmitting(true);
    try {
      if (isDemoMode) {
        setTimeout(() => {
          setShowSuccess(true);
          setSelectedCategories([]);
          setInterestNote("");
          setIsSubmitting(false);
          setTimeout(() => setShowSuccess(false), 5000);
        }, 1000);
        return;
      }

      await addDoc(collection(db, "interestRequests"), {
        studentId: user.uid,
        studentName: studentProfile?.fullName || "Anonymous Student",
        email: user.email,
        categories: selectedCategories,
        description: interestNote,
        createdAt: serverTimestamp(),
        status: "pending",
      });

      setShowSuccess(true);
      setSelectedCategories([]);
      setInterestNote("");
      setTimeout(() => setShowSuccess(false), 5000);
    } catch (err) {
      console.error("Error submitting interest:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const fetchOrgContacts = async () => {
      const acceptedApps = applications;
      if (acceptedApps.length === 0) return;

      const newContacts: Record<
        string,
        { email: string; phone?: string; website?: string; organizationName?: string }
      > = { ...orgContacts };
      let changed = false;

      for (const app of acceptedApps) {
        if (app.opportunityId && !newContacts[app.opportunityId]) {
          try {
            // Fetch the opportunity to get orgId
            const oppSnap = await getDoc(
              doc(db, "opportunities", app.opportunityId),
            );
            if (oppSnap.exists()) {
              const oppData = oppSnap.data();
              const orgId = oppData.orgId;

              // Fetch the organization
              const orgSnap = await getDoc(doc(db, "organizations", orgId));
              if (orgSnap.exists()) {
                const orgData = orgSnap.data();
                newContacts[app.opportunityId] = {
                  email: orgData.contactEmail || "",
                  phone: orgData.phone || "",
                  website: orgData.websiteUrl || "",
                  organizationName: orgData.organizationName || "Community Group",
                };
                changed = true;
              }
            }
          } catch (err) {
            console.error("Error fetching org contact:", err);
          }
        }
      }

      if (changed) {
        setOrgContacts(newContacts);
      }
    };

    if (applications.length > 0 && !isDemoMode) {
      fetchOrgContacts();
    } else if (isDemoMode && applications.length > 0) {
      // Mock contacts for demo with supervisor details
      setOrgContacts({
        "demo-opp-1": {
          email: "coordinator@nycommunity.org",
          phone: "(416) 555-0199",
          website: "https://nycommunityhub.org",
          organizationName: "North York Community Hub",
        },
        "opp-1": {
          email: "coordinator@nycommunity.org",
          phone: "(416) 555-0199",
          website: "https://nycommunityhub.org",
          organizationName: "North York Community Hub",
        },
      });
    }
  }, [applications, isDemoMode]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setIsLoading(true);

      // Define standard opportunities pool for Fallback & Demo
      const pool: Opportunity[] = [
        {
          id: "demo-opp-1",
          orgId: "demo-org-1",
          title: "Math Tutor for Grade 9 Students",
          description: "Help high school students with algebra, geometry, and key math concepts.",
          location: "5100 Yonge St, North York",
          dateTime: new Date(Date.now() + 86400000 * 2) as any,
          category: "Tutoring",
          requirements: "Excellent tutoring skills.",
          maxVolunteers: 5,
          skillsNeeded: ["Teaching", "Communication"],
          timeCommitment: "Short-term",
          isVirtual: false,
          createdAt: new Date(Date.now() - 86400000 * 3) as any,
        },
        {
          id: "demo-opp-2",
          orgId: "demo-org-2",
          title: "Community Garden Cleanup Initiative",
          description: "Join us for a day of planting, raking, and cleanup at the organic community art garden.",
          location: "Lee Lifeson Art Park, North York",
          dateTime: new Date(Date.now() + 86400000 * 7) as any,
          category: "Environment",
          requirements: "Love for outdoor work.",
          maxVolunteers: 15,
          skillsNeeded: ["Physical Work", "Leadership"],
          timeCommitment: "One-time",
          isVirtual: false,
          createdAt: new Date(Date.now() - 86400000 * 5) as any,
        },
        {
          id: "demo-opp-3",
          orgId: "demo-org-3",
          title: "Senior Tech Support Circle",
          description: "Empower local seniors by teaching them how to safely browse, use smartphones, and connect with families.",
          location: "21 Hendon Ave, North York",
          dateTime: new Date(Date.now() + 86400000 * 1) as any,
          category: "Seniors",
          requirements: "Patience and tech knowledge.",
          maxVolunteers: 4,
          skillsNeeded: ["Computer & Tech", "Communication"],
          timeCommitment: "Long-term",
          isVirtual: false,
          createdAt: new Date(Date.now() - 86400000 * 1) as any,
        },
        {
          id: "demo-opp-4",
          orgId: "demo-org-4",
          title: "Spring Festival Event Organizer",
          description: "Support logistically with stage coordination, welcoming community guests, and running vendor booths.",
          location: "Mel Lastman Square",
          dateTime: new Date(Date.now() + 86400000 * 5) as any,
          category: "Event Planning",
          requirements: "Cheerful personality.",
          maxVolunteers: 10,
          skillsNeeded: ["Organization", "Event Support"],
          timeCommitment: "One-time",
          isVirtual: false,
          createdAt: new Date(Date.now() - 86400000 * 2) as any,
        },
        {
          id: "demo-opp-5",
          orgId: "demo-org-5",
          title: "Weekend Food Hamper Drive",
          description: "Help organize, load, and dispense essential grocery items for local families in North York.",
          location: "North York Foodbank Hub",
          dateTime: new Date(Date.now() + 86400000 * 4) as any,
          category: "Food Banks",
          requirements: "Must be able to lift up to 15 lbs.",
          maxVolunteers: 8,
          skillsNeeded: ["Physical Work", "Organization"],
          timeCommitment: "Short-term",
          isVirtual: false,
          createdAt: new Date(Date.now() - 86400000 * 6) as any,
        },
        {
          id: "demo-opp-6",
          orgId: "demo-org-1",
          title: "HTML/JS Coding Club Instructor",
          description: "Contribute to building introductory coding exercises and run workshops for kids.",
          location: "5100 Yonge St, North York",
          dateTime: new Date(Date.now() + 86400000 * 3) as any,
          category: "Technology",
          requirements: "Proficient in basic HTML / CSS / Javascript.",
          maxVolunteers: 3,
          skillsNeeded: ["Computer & Tech", "Teaching"],
          timeCommitment: "Long-term",
          isVirtual: true,
          createdAt: new Date(Date.now() - 86400000 * 4) as any,
        }
      ];

      const myInterests = studentProfile?.interests || [];
      const mySkills = studentProfile?.skills || [];

      // Unified ranking function matching categories and skills
      const getMatchScore = (opp: Opportunity) => {
        let score = 0;
        // Primary Match: Category matches student's interests (cause categories)
        if (opp.category && myInterests.some(interest => interest.toLowerCase() === opp.category.toLowerCase())) {
          score += 30;
        }
        // Secondary Match: Overlap of required skills vs student skills
        if (opp.skillsNeeded && opp.skillsNeeded.length > 0) {
          const overlap = opp.skillsNeeded.filter(skill => 
            mySkills.some(s => s.toLowerCase() === skill.toLowerCase())
          );
          score += overlap.length * 15;
        }
        // Text keyword searches
        const lowerText = `${opp.title} ${opp.description} ${opp.category || ""}`.toLowerCase();
        myInterests.forEach(interest => {
          if (lowerText.includes(interest.toLowerCase())) {
            score += 5;
          }
        });
        mySkills.forEach(skill => {
          if (lowerText.includes(skill.toLowerCase())) {
            score += 5;
          }
        });
        return score;
      };

      if (isDemoMode) {
        // Mock data for demo mode synced via local storage
        const storedApps = localStorage.getItem("demo_applications");
        let mockApplications: Application[] = [];
        if (storedApps) {
          // Filter to include applications belonging to the current demo student user (Alex Volunteer has id 'demo-student-1')
          mockApplications = JSON.parse(storedApps).filter(
            (app: any) =>
              app.studentId === "demo-student-1" || app.studentId === user.uid,
          );
        } else {
          mockApplications = [
            {
              id: "demo-app-1",
              opportunityId: "demo-opp-1",
              opportunityTitle: "Welcome Center Support",
              studentId: "demo-student-1",
              studentName: "Alex Volunteer",
              status: "pending",
              message: "I would love to help out at the welcome center!",
              appliedAt: new Date().toISOString(),
            },
          ];
          localStorage.setItem(
            "demo_applications",
            JSON.stringify(mockApplications),
          );
        }
        const mockSaved: Opportunity[] = [
          {
            id: "demo-opp-1",
            orgId: "org-1",
            title: "Math Tutor for Grade 9 Students",
            description: "Help with math homework.",
            location: "5100 Yonge St, North York",
            dateTime: new Date() as any,
            category: "Tutoring",
            requirements: "None",
            maxVolunteers: 5,
            skillsNeeded: ["Teaching"],
            timeCommitment: "Short-term",
            isVirtual: false,
            createdAt: new Date() as any,
          },
        ];

        // Apply dynamic ranking for recommendations in Demo Mode
        const scoredPool = pool.map(opp => ({ opp, score: getMatchScore(opp) }));
        scoredPool.sort((a, b) => b.score - a.score || new Date(b.opp.createdAt).getTime() - new Date(a.opp.createdAt).getTime());
        const mockRec = scoredPool.slice(0, 3).map(item => item.opp);

        const savedReqs = JSON.parse(localStorage.getItem("demo_hours_requests") || "[]");
        const studentReqs = savedReqs.filter(
          (r: any) => r.studentId === "demo-student-1" || r.studentId === user.uid
        );

        setAllOrganizations([
          { id: "demo-org-1", organizationName: "North York Help Feed Foodbank", contactEmail: "feedbox@northyorkfeed.org", contactName: "Sarah Jenkins" },
          { id: "demo-org-2", organizationName: "Lee Lifeson Park Restoration Group", contactEmail: "greenery@yorknature.org", contactName: "David Suzuki Jr" },
          { id: "demo-org-3", organizationName: "Huron Senior Technical Tutoring Hub", contactEmail: "seniors@techhelpyork.org", contactName: "Alan Turing" },
          { id: "demo-org-4", organizationName: "Toronto Youth Shelter Initiative", contactEmail: "shelter@torontoyouth.org", contactName: "John Connor" },
          { id: "demo-org-5", organizationName: "York Region Multicultural Society", contactEmail: "contact@yorkmulti.org", contactName: "Amara Singh" },
        ]);

        setTimeout(() => {
          setApplications(mockApplications);
          setSavedOpportunities(mockSaved);
          setRecommended(mockRec);
          setHoursRequests(studentReqs);
          setIsLoading(false);
        }, 600);
        return;
      }

      try {
        // Fetch applications with a generous limit to see past roles
        const appsQuery = query(
          collection(db, "applications"),
          where("studentId", "==", user.uid),
          orderBy("appliedAt", "desc"),
          limit(50),
        );
        const appsSnap = await getDocs(appsQuery);
        const appsData = appsSnap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Application,
        );
        setApplications(appsData);

        // Fetch organizations database list for direct selection / verification
        try {
          const orgsSnap = await getDocs(collection(db, "organizations"));
          const orgsList = orgsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setAllOrganizations(orgsList);
        } catch (orgsErr) {
          console.warn("Could not load registered organizations:", orgsErr);
        }

        // Fetch hours requests
        try {
          const hoursQuery = query(
            collection(db, "hoursRequests"),
            where("studentId", "==", user.uid)
          );
          const hoursSnap = await getDocs(hoursQuery);
          const hoursList = hoursSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setHoursRequests(hoursList);
        } catch (hoursErr) {
          console.warn("Could not query hours requests from Firestore, using local storage fallback:", hoursErr);
          const savedReqs = JSON.parse(localStorage.getItem("demo_hours_requests") || "[]");
          setHoursRequests(savedReqs.filter((r: any) => r.studentId === user.uid));
        }

        // Fetch saved opportunities with robust fallback
        let savedIds: string[] = [];
        try {
          const savedQuery = query(
            collection(db, "savedOpportunities"),
            where("studentId", "==", user.uid),
            limit(5),
          );
          const savedSnap = await getDocs(savedQuery);
          savedIds = savedSnap.docs.map(
            (doc) => (doc.data() as SavedOpportunity).opportunityId,
          );
        } catch (savedErr) {
          console.warn(
            "Real Firestore saved query failed, reading local storage index:",
            savedErr,
          );
        }

        // Merge with local storage IDs
        const localSaves = JSON.parse(
          localStorage.getItem("demo_saved_ids") || "[]",
        );
        savedIds = Array.from(new Set([...savedIds, ...localSaves])).slice(
          0,
          10,
        );

        if (savedIds.length > 0) {
          try {
            const oppsQuery = query(
              collection(db, "opportunities"),
              where("__name__", "in", savedIds),
            );
            const oppsSnap = await getDocs(oppsQuery);
            setSavedOpportunities(
              oppsSnap.docs.map(
                (doc) => ({ id: doc.id, ...doc.data() }) as Opportunity,
              ),
            );
          } catch (oppsErr) {
            console.warn(
              "Could not query saved opportunities from Firestore, local fallback applied:",
              oppsErr,
            );
            const stored = JSON.parse(
              localStorage.getItem("demo_opportunities") || "[]",
            );
            const locallyFound = stored.filter((o: any) =>
              savedIds.includes(o.id),
            );
            setSavedOpportunities(locallyFound);
          }
        }

        // Fetch up to 50 latest opportunities and rank them
        let fetchedOpps: Opportunity[] = [];
        try {
          const recQuery = query(
            collection(db, "opportunities"),
            orderBy("createdAt", "desc"),
            limit(50),
          );
          const recSnap = await getDocs(recQuery);
          fetchedOpps = recSnap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as Opportunity,
          );
        } catch (dbErr) {
          console.warn("Could not query opportunities from Firestore, doing local storage resolution:", dbErr);
          fetchedOpps = JSON.parse(localStorage.getItem("demo_opportunities") || "[]");
        }

        // Fallback to pool if empty
        if (fetchedOpps.length === 0) {
          fetchedOpps = pool;
        }

        // Apply dynamic scoring and sorting in Production Mode
        const scoredOpps = fetchedOpps.map(opp => ({ opp, score: getMatchScore(opp) }));
        scoredOpps.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          const dateA = a.opp.createdAt ? new Date(a.opp.createdAt).getTime() : 0;
          const dateB = b.opp.createdAt ? new Date(b.opp.createdAt).getTime() : 0;
          return dateB - dateA;
        });

        const finalRecs = scoredOpps.slice(0, 3).map(item => item.opp);
        setRecommended(finalRecs);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user, isDemoMode, studentProfile]);

  if (isLoading)
    return <div className="p-8 text-center">Loading your dashboard...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-slate-900 tracking-tight">
          Hi, {studentProfile?.fullName || "Student"}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Your volunteer dashboard
        </p>
      </div>

      {/* Sidebar + Content Layout */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Navigation */}
        <nav className="lg:w-56 shrink-0" aria-label="Dashboard sections">
          <div className="lg:sticky lg:top-24 flex flex-row lg:flex-col gap-1.5 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
            {([
              { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
              { id: "leaderboard" as const, label: "Leaderboard", icon: Trophy },
              { id: "calendar" as const, label: "Calendar", icon: Calendar },
              { id: "settings" as const, label: "Settings", icon: Settings },
            ]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => handleTabChange(id)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap",
                  activeTab === id
                    ? "bg-[#1F4C63] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </nav>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
      <AnimatePresence mode="wait">
        {activeTab === "dashboard" ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Main Column */}
            <div className="lg:col-span-2 space-y-8">
            {/* Recent Applications */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="text-[#1F4C63] w-5 h-5" />
                  Your Applications
                </h2>
              </div>
              {applications.length > 0 ? (
                <div className="space-y-4">
                  {applications.map((app) => (
                    <Card
                      key={app.id}
                      className="p-6 border-l-4 overflow-hidden relative"
                      style={{
                        borderColor:
                          app.status === "accepted"
                            ? "#1F4C63"
                            : app.status === "rejected" ||
                                app.status === "terminated"
                              ? "#ef4444"
                              : "#eab308",
                      }}
                    >
                      <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-slate-900 text-lg break-words">
                            {app.opportunityTitle || "Opportunity"}
                          </h4>
                          <p className="text-xs text-slate-600 font-medium uppercase tracking-widest mt-1">
                            Applied{" "}
                            {formatDate(
                              app.appliedAt
                                ? (app.appliedAt.toDate ? app.appliedAt.toDate() : app.appliedAt)
                                : new Date()
                            )}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 self-start flex-shrink-0">
                          {app.status === "accepted" && (
                            <button
                              title="Official Enrollment Slip"
                              className="px-3 py-1.5 text-[9.5px] font-black uppercase tracking-widest bg-[#E08A3C]/10 hover:bg-[#E08A3C]/10 text-[#E08A3C] border border-[#E08A3C]/20 rounded-sm flex items-center gap-1 hover:scale-[1.03] transition-all duration-200  whitespace-nowrap rounded-full"
                              onClick={() => {
                                setSelectedReceiptApp({
                                  ...app,
                                  studentName:
                                    studentProfile?.fullName ||
                                    user?.displayName ||
                                    "Alex Volunteer",
                                  studentEmail: user?.email || "",
                                  studentSchool:
                                    studentProfile?.school ||
                                    "York Region College",
                                  studentGrade: studentProfile?.grade || "12",
                                });
                                setShowReceiptModal(true);
                              }}
                            >
                              <FileText className="w-3.5 h-3.5 text-[#E08A3C] animate-pulse" />
                              <span>Receipt</span>
                            </button>
                          )}
                          {app.status === "accepted" && !existingRatings[`${app.orgId || app.organizationId}_${app.opportunityId}`] && (
                            <button
                              title="Rate this organization"
                              className="px-3 py-1.5 text-[9.5px] font-black uppercase tracking-widest bg-[#1F4C63]/10 hover:bg-[#1F4C63]/20 text-[#1F4C63] border border-[#1F4C63]/20 rounded-full flex items-center gap-1 transition-all duration-200 whitespace-nowrap"
                              onClick={() => { setRatingApp(app); setRatingStars(0); setRatingComment(""); }}
                            >
                              <Star className="w-3.5 h-3.5" />
                              <span>Rate</span>
                            </button>
                          )}
                          <Badge
                            variant={
                              app.status === "accepted"
                                ? "success"
                                : app.status === "rejected" ||
                                    app.status === "terminated"
                                  ? "danger"
                                  : "warning"
                            }
                            className="whitespace-nowrap"
                          >
                            {app.status.toUpperCase()}
                          </Badge>
                        </div>
                      </div>

                      {(app.status === "accepted" || app.status === "pending") &&
                        orgContacts[app.opportunityId] && (
                          <div className="mt-4 bg-[#E08A3C]/10/50 p-6 rounded-sm border border-orange-100 animate-in fade-in slide-in- duration-500">
                            <p className="text-[10px] font-black text-orange-700 uppercase tracking-widest mb-3">
                              Organization Contact Details
                            </p>
                            <div className="flex flex-wrap gap-6">
                              <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-[#E08A3C]" />
                                <a
                                  href={`mailto:${orgContacts[app.opportunityId].email}`}
                                  className="text-sm font-bold text-slate-900 hover:text-[#E08A3C] transition-colors"
                                >
                                  {orgContacts[app.opportunityId].email}
                                </a>
                              </div>
                              {orgContacts[app.opportunityId].phone && (
                                <div className="flex items-center gap-2">
                                  <Phone className="w-4 h-4 text-[#E08A3C]" />
                                  <span className="text-sm font-bold text-slate-900">
                                    {orgContacts[app.opportunityId].phone}
                                  </span>
                                </div>
                              )}
                              {orgContacts[app.opportunityId].website && (
                                <div className="flex items-center gap-2">
                                  <Globe className="w-4 h-4 text-[#E08A3C]" />
                                  <a
                                    href={
                                      orgContacts[app.opportunityId].website
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-bold text-slate-900 hover:text-[#1F4C63] transition-colors"
                                  >
                                    Website
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                      {app.status === "rejected" &&
                        app.rejectionReason &&
                        app.rejectionReason !==
                          "No reason provided (Silent rejection)" && (
                          <div className="mt-4 bg-red-50 p-4 rounded-sm border border-red-100 flex gap-4 animate-in fade-in slide-in- duration-500">
                            <div className="w-10 h-10 bg-red-100 rounded-sm flex items-center justify-center text-red-600 flex-shrink-0">
                              <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs font-black text-red-900 uppercase tracking-widest mb-1">
                                Feedback from Organization
                              </p>
                              <p className="text-sm text-red-700 font-bold">
                                {app.rejectionReason}
                              </p>
                              {app.rejectionNote && (
                                <p className="text-xs text-red-600/80 italic mt-1 leading-relaxed">
                                  "{app.rejectionNote}"
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="p-8 text-center bg-white border-dashed">
                  <p className="text-slate-600 italic">
                    No applications yet. Start exploring!
                  </p>
                  <Link to="/student/opportunities">
                    <Button variant="outline" className="mt-4">
                      Browse Opportunities
                    </Button>
                  </Link>
                </Card>
              )}
            </section>

            {/* Recommended Opportunities */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="text-[#1F4C63] w-5 h-5" />
                  Recommended For You
                </h2>
                <Link to="/student/opportunities">
                  <Button variant="ghost" size="sm" className="gap-1">
                    Explore more <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {recommended.length > 0 ? (
                  recommended.map((opp) => (
                    <Card
                      key={opp.id}
                      className="group overflow-hidden flex flex-col h-full cursor-pointer"
                      onClick={() =>
                        navigate(`/student/opportunities/${opp.id}`)
                      }
                    >
                      <div className="p-6 flex-grow">
                        <div className="flex items-center justify-between mb-3 text-xs font-bold text-[#1F4C63] uppercase tracking-widest">
                          <span>{opp.category}</span>
                          {opp.isVirtual && (
                            <Badge variant="info">Virtual</Badge>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 group-hover:text-[#1F4C63] transition-colors mb-2 line-clamp-1">
                          {opp.title}
                        </h3>
                        <div className="flex flex-col gap-2 mt-4">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <MapPin className="w-4 h-4" /> {opp.location}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Clock className="w-4 h-4" /> {opp.timeCommitment}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                ) : (
                  <div className="col-span-full py-12 text-center bg-white rounded-sm border border-dashed text-slate-600 font-medium">
                    New opportunities will appear here soon!
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            {/* Hour Tracker Gauge */}
            <section className="space-y-4 animate-fadeIn">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 uppercase tracking-tight">
                <Trophy className="text-[#1F4C63] w-5 h-5" />
                Hour Tracker
              </h2>
              <Card className="p-8 border border-slate-100  shadow-slate-100/50 rounded-sm bg-white space-y-6">
                {/* Hours Gauge */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-slate-600 font-black uppercase tracking-wider ">
                      Volunteering Progress
                    </span>
                    <span className="text-[#1F4C63] font-black ">
                      {totalCompletedHours} / {hourGoal} hrs
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-sm overflow-hidden">
                    <div
                      className="   h-full rounded-sm transition-all"
                      style={{
                        width: `${Math.min((totalCompletedHours / hourGoal) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <div className="pt-1 flex items-center justify-center">
                    <Button
                      onClick={handlePrintCertificate}
                      variant="outline"
                      className="w-full h-10 border-[#1F4C63]/20 text-[#1F4C63] hover:bg-[#1F4C63]/5/50 hover:text-[#153343] font-extrabold text-xs uppercase tracking-wider rounded-sm transition-all gap-1.5 cursor-pointer flex items-center justify-center "
                    >
                      <Printer className="w-4 h-4 shrink-0 text-[#1F4C63]" />
                      Print Hours Transcript
                    </Button>
                  </div>
                </div>

                 {/* Unofficial Disclaimer Warning Box */}
                <div className="bg-[#E08A3C]/10/75 border border-[#E08A3C]/20 rounded-sm p-5 text-center space-y-3">
                  <div>
                    <p className="text-orange-800 font-black text-xs uppercase tracking-wide">
                      Hour Verification Info
                    </p>
                    <p className="text-[11px] text-orange-700 leading-relaxed font-semibold mt-1">
                      Volunteer hours must be verified and logged directly by your
                      coordinators or supervisors. Only they can verify and approve your hours online.
                    </p>
                  </div>
                  <div className="pt-1.5 border-t border-[#E08A3C]/20/50">
                    <Button
                      onClick={() => setShowLogForm(true)}
                      className="w-full h-10 bg-[#E08A3C] hover:bg-[#E08A3C] hover:scale-102 hover: text-white font-bold text-xs uppercase tracking-wider rounded-sm transition-all gap-1.5 cursor-pointer"
                    >
                      📩 Request Hours Verification
                    </Button>
                  </div>
                </div>

                {hoursRequests.length > 0 && (
                  <div className="pt-6 border-t border-slate-100 space-y-4">
                    <p className="text-[10px] font-black uppercase text-slate-600 tracking-wider ml-1">
                      Submitted Claims ({hoursRequests.length})
                    </p>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                      {hoursRequests.map((req) => (
                        <div
                          key={req.id}
                          className="p-4 rounded-sm border border-slate-100 bg-slate-50/50 space-y-3 transition-all hover:bg-slate-50"
                        >
                          <div className="flex justify-between items-start">
                            <div className="space-y-0.5">
                              <p className="font-bold text-slate-800 text-sm leading-tight">
                                {req.activity}
                              </p>
                              <p className="text-[10px] text-slate-600 font-extrabold tracking-wide uppercase">
                                {req.organization} • {req.date}
                              </p>
                            </div>
                            <span className="font-black text-xs text-[#1F4C63] bg-[#1F4C63]/5 px-2 py-0.5 rounded-sm shrink-0">
                              {req.hours} hrs
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-100/50">
                            <span
                              className={cn(
                                "text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-sm",
                                req.status === "approved"
                                  ? "bg-[#1F4C63]/5 text-[#153343]"
                                  : req.status === "declined"
                                    ? "bg-red-50 text-red-700"
                                    : "bg-[#E08A3C]/10 text-orange-700"
                              )}
                            >
                              {req.status === "approved"
                                ? "✓ Approved"
                                : req.status === "declined"
                                  ? "✕ Declined"
                                  : "⚡ Pending"}
                            </span>

                            {req.status === "pending" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={sendingReminderId === req.id || reminderSuccessId === req.id}
                                onClick={() => handleSendReminder(req)}
                                className="h-7 text-[9px] px-2 font-black uppercase tracking-wider hover:bg-slate-100 text-slate-600 cursor-pointer text-right flex items-center gap-1 shrink-0"
                              >
                                {sendingReminderId === req.id ? (
                                  "Sending..."
                                ) : reminderSuccessId === req.id ? (
                                  "✓ Sent!"
                                ) : (
                                  <>
                                    <Send className="w-2.5 h-2.5" /> Remind
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </section>

            {/* Interest Matching / Waiting List in Sidebar */}
            <section className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ListPlus className="text-[#1F4C63] w-5 h-5" />
                Waiting List
              </h2>
              <Card className="p-6 border-none  shadow-slate-100 rounded-sm bg-white">
                <p className="text-slate-600 text-xs font-medium mb-4">
                  Can't find a match? Join our waiting list for custom
                  placements.
                </p>
                <form onSubmit={handleInterestSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">
                      Categories of interest
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {OPPORTUNITY_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleCategory(cat)}
                          className={cn(
                            "px-3 py-1.5 rounded-sm text-[10px] font-bold border transition-all",
                            selectedCategories.includes(cat)
                              ? "bg-[#1F4C63] border-[#1F4C63] text-white  shadow-blue-100"
                              : "bg-white border-slate-100 text-slate-600 hover:border-[#1F4C63]/20",
                          )}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    placeholder="Specific interests or goals..."
                    className="w-full min-h-[60px] p-3 rounded-sm bg-slate-50 border border-transparent focus:bg-white focus:border-[#1F4C63]/10 outline-none h-10 text-xs font-bold transition-all"
                    value={interestNote}
                    onChange={(e) => setInterestNote(e.target.value)}
                  />

                  <AnimatePresence>
                    {showSuccess && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="text-[10px] text-[#1F4C63] font-bold"
                      >
                        Added to waitlist!
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <Button
                    type="submit"
                    size="sm"
                    className="w-full rounded-sm bg-[#1F4C63] hover:bg-[#153343] text-white font-black uppercase text-[10px] tracking-widest"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Joining..." : "Join List"}
                  </Button>
                </form>
              </Card>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Star className="text-[#E08A3C] w-5 h-5 fill-yellow-500" />
                Saved
              </h2>
              <div className="space-y-3">
                {savedOpportunities.length > 0 ? (
                  savedOpportunities.map((opp) => (
                    <Link
                      key={opp.id}
                      to={`/student/opportunities/${opp.id}`}
                      className="block group"
                    >
                      <Card className="p-4 hover:border-[#1F4C63]/20">
                        <h4 className="font-bold text-slate-900 text-sm group-hover:text-[#1F4C63] transition-colors line-clamp-1">
                          {opp.title}
                        </h4>
                      </Card>
                    </Link>
                  ))
                ) : (
                  <p className="text-xs text-slate-600 italic">
                    No saved posts.
                  </p>
                )}
              </div>
            </section>
            </div>
          </motion.div>
        ) : activeTab === "leaderboard" /* Dedicated Leaderboard Tab Layout */ ? (
          <motion.div
            key="leaderboard"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
          {/* Main Leaderboard Rankings list & Podium */}
          <div className="lg:col-span-2 space-y-8">
            <section className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2 ">
                    <Trophy className="text-[#E08A3C] w-6 h-6" />
                    Rankings Board
                  </h2>
                  <p className="text-slate-600 text-xs font-semibold mt-1">
                    Outstanding high school student contributors in the
                    community.
                  </p>
                </div>
              </div>

              {(studentProfile?.trackerEnabled ?? true) ? (
                <div className="space-y-8 animate-fadeIn">
                  {/* 3D-Style Podium Card (Light Theme Accent) */}
                  <div className="bg-white border border-[#1F4C63]/10/80 rounded-sm p-8  text-slate-900 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,87,22,0.06),transparent)] pointer-events-none" />

                    <div className="text-center mb-8">
                      <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#E08A3C]">
                        Community Podium
                      </span>
                      <h3 className="text-lg font-bold text-slate-900 mt-1">
                        Active Hours Contributor Leaders
                      </h3>
                    </div>

                    {/* Visual Columns Podium */}
                    <div className="grid grid-cols-3 gap-3 items-end max-w-md mx-auto pt-6 pb-2">
                      {/* 2nd Place (Silver) */}
                      <div className="flex flex-col items-center animate-in fade-in slide-in- duration-300">
                        <div className="text-center mb-2">
                          <p className="text-xs font-bold text-slate-700 truncate max-w-[80px] sm:max-w-none">
                            {leaderboard[1] ? leaderboard[1].name : "---"}
                          </p>
                          <p className="text-[10px] font-black text-slate-600 ">
                            {leaderboard[1]
                              ? `${leaderboard[1].hours} hrs`
                              : "--"}
                          </p>
                        </div>
                        <div
                          className="w-full bg-slate-50 rounded-t-2xl flex flex-col items-center justify-center p-4 border border-slate-200/50"
                          style={{ height: "70px" }}
                        >
                          <span className="text-2xl font-black text-slate-600 ">
                            2
                          </span>
                          <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-1">
                            Silver
                          </span>
                        </div>
                      </div>

                      {/* 1st Place (Gold/Orange, center and taller) */}
                      <div className="flex flex-col items-center animate-in fade-in slide-in- duration-500">
                        <div className="text-center mb-2 relative">
                          {leaderboard[0] && (
                            <Trophy className="w-5 h-5 text-[#E08A3C] mx-auto animate-bounce absolute -top-5 left-1/2 -translate-x-1/2" />
                          )}
                          <p className="text-sm font-black text-[#E08A3C] truncate max-w-[90px] sm:max-w-none">
                            {leaderboard[0] ? leaderboard[0].name : "---"}
                          </p>
                          <p className="text-xs font-black text-[#E08A3C] ">
                            {leaderboard[0]
                              ? `${leaderboard[0].hours} hrs`
                              : "--"}
                          </p>
                        </div>
                        <div
                          className="w-full bg-[#E08A3C]/10 rounded-t-2xl flex flex-col items-center justify-center p-5 border border-orange-300 border-[#E08A3C]/20  shadow-orange-500/5"
                          style={{ height: "95px" }}
                        >
                          <span className="text-3xl font-medium text-[#E08A3C] ">
                            1
                          </span>
                          <span className="text-[8px] font-black text-[#E08A3C] uppercase tracking-widest mt-1">
                            Champion
                          </span>
                        </div>
                      </div>

                      {/* 3rd Place (Bronze) */}
                      <div className="flex flex-col items-center animate-in fade-in slide-in- duration-300">
                        <div className="text-center mb-2">
                          <p className="text-xs font-bold text-orange-700 truncate max-w-[80px] sm:max-w-none">
                            {leaderboard[2] ? leaderboard[2].name : "---"}
                          </p>
                          <p className="text-[10px] font-black text-[#E08A3C]/80 ">
                            {leaderboard[2]
                              ? `${leaderboard[2].hours} hrs`
                              : "--"}
                          </p>
                        </div>
                        <div
                          className="w-full bg-[#fdf2e9] rounded-t-2xl flex flex-col items-center justify-center p-4 border border-orange-100"
                          style={{ height: "55px" }}
                        >
                          <span className="text-xl font-black text-[#E08A3C]/80 ">
                            3
                          </span>
                          <span className="text-[8px] font-black text-orange-400 uppercase tracking-widest mt-1">
                            Bronze
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Complete Leaderboard list */}
                  <Card className="overflow-hidden border-none  rounded-sm bg-white p-6 space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 ">
                      Complete Standings
                    </h3>
                    <div className="space-y-2">
                      {leaderboard.map((student, idx) => (
                        <div
                          key={student.id}
                          className={cn(
                            "flex items-center justify-between p-4.5 rounded-sm border transition-all text-sm",
                            student.isSelf
                              ? "bg-[#1F4C63]/5/50 border-[#1F4C63]/20"
                              : "bg-slate-50/50 border-slate-100",
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={cn(
                                "w-6 h-6 rounded-sm flex items-center justify-center font-bold text-xs ",
                                idx === 0
                                  ? "bg-[#E08A3C]/10 bg-[#E08A3C]/10 text-yellow-700 font-bold"
                                  : idx === 1
                                    ? "bg-slate-100 bg-slate-100 text-slate-700 font-bold"
                                    : idx === 2
                                      ? "bg-[#E08A3C]/10 bg-[#E08A3C]/10 text-amber-700 font-bold"
                                      : "bg-slate-100 text-slate-600",
                              )}
                            >
                              {idx + 1}
                            </span>
                            <span
                              className={cn(
                                "text-slate-700 font-semibold",
                                student.isSelf &&
                                  "text-[#1F4C63] font-extrabold",
                              )}
                            >
                              {student.name} {student.isSelf && "(You)"}
                            </span>
                          </div>
                          <span className="font-extrabold text-slate-900 ">
                            {student.hours} hrs
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              ) : (
                <div className="py-12 text-center bg-white rounded-sm border border-slate-100  space-y-3 p-8">
                  <Lock className="w-8 h-8 text-slate-600 mx-auto" />
                  <h3 className="text-lg font-bold text-slate-800">
                    Leaderboard Participation Disabled
                  </h3>
                  <p className="text-xs text-slate-600 font-semibold max-w-sm mx-auto leading-relaxed">
                    You have turned off the community rankings. Toggle
                    participation on the sidebar settings controls to view high
                    achievements and listings.
                  </p>
                </div>
              )}
            </section>
          </div>

          {/* Leaderboard Settings & Options Sidebar */}
          <div className="space-y-8">
            {/* My Achievement Milestones Overview Card */}
            <section className="space-y-4 animate-fadeIn">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Trophy className="text-[#1F4C63] w-5 h-5" />
                My Badges Cabinet
              </h2>
              <Card className="p-6 border border-line shadow-sm rounded-sm bg-white space-y-6">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#1F4C63]">
                    My Milestones
                  </h4>
                  <p className="text-[12px] text-slate-600 font-semibold mt-1">
                    Your current community badge collection stats.
                  </p>
                </div>

                {/* Progress Mini Showcase */}
                <div className="space-y-3.5 pt-1">
                  {evaluateBadges(studentProfile).slice(0, 4).map(({ badge, isUnlocked }) => (
                    <div 
                      key={badge.id}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-sm border transition-all",
                        isUnlocked 
                          ? "bg-slate-50 border-line" 
                          : "bg-slate-50/45 border-line/50 opacity-60"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-sm flex items-center justify-center shrink-0 ",
                        isUnlocked
                          ? "bg-[#1F4C63] text-white"
                          : "bg-slate-100 text-slate-400"
                      )}>
                        {isUnlocked ? (
                          <Award className="w-4 h-4" />
                        ) : (
                          <Lock className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "text-sm font-bold truncate",
                          isUnlocked ? "text-slate-800" : "text-slate-500"
                        )}>
                          {badge.name}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {isUnlocked ? "Unlocked! ✨" : badge.requirement}
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  <Link 
                    to="/student/profile"
                    className="flex items-center justify-center gap-1.5 w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-sm text-xs font-bold transition-all text-center mt-2"
                  >
                    <span>View All Badges Cabinet</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </Card>
            </section>
            </div>
          </motion.div>
        ) : activeTab === "settings" ? (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto"
          >
            {/* Account & Recognition Preferences */}
            <Card className="rounded-sm border border-slate-100 bg-white p-8 md:p-10  space-y-6">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1F4C63]">Privacy & Listing</span>
                <h3 className="text-xl font-bold text-slate-900 mt-1 ">
                  Community Listings Preference
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Configure how your high school volunteer hours display on leadership indices.
                </p>
              </div>

              <div className="space-y-6 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      Participate in Rankings
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-1 font-semibold">
                      Toggle whether peers see your hours leaderboard
                    </p>
                  </div>
                  <button
                    onClick={handleToggleCompetitiveness}
                    aria-label="Toggle whether peers see your hours leaderboard"
                    role="switch"
                    aria-checked={studentProfile?.trackerEnabled ?? true}
                    className={cn(
                      "w-11 h-6 rounded-sm transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0 self-center",
                      (studentProfile?.trackerEnabled ?? true) ? "bg-[#1F4C63]" : "bg-slate-200",
                    )}
                  >
                    <span
                      className={cn(
                        "bg-white w-5 h-5 rounded-sm  transform transition-transform duration-250",
                        (studentProfile?.trackerEnabled ?? true) ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-6">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      Anonymous Display Format
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-1 font-semibold">
                      Hide your full name on high achievement boards
                    </p>
                  </div>
                  <button
                    onClick={handleToggleAnonymity}
                    aria-label="Hide your full name on high achievement boards"
                    role="switch"
                    aria-checked={studentProfile?.trackerAnonymous ?? false}
                    disabled={!(studentProfile?.trackerEnabled ?? true)}
                    className={cn(
                      "w-11 h-6 rounded-sm transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0 self-center",
                      (studentProfile?.trackerAnonymous ?? false) ? "bg-[#E08A3C]" : "bg-slate-200",
                      !(studentProfile?.trackerEnabled ?? true) && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    <span
                      className={cn(
                        "bg-white w-5 h-5 rounded-sm  transform transition-transform duration-250",
                        (studentProfile?.trackerAnonymous ?? false) ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>
            </Card>

            {/* 2-Step Verification Security Shield */}
            {!isDemoMode && (
              <Card className="rounded-sm border border-[#1F4C63]/20 bg-white p-8 md:p-10  space-y-6">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1F4C63]">Account Security</span>
                  <h3 className="text-xl font-bold text-slate-900 mt-1 flex items-center gap-2 flex-wrap">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 animate-pulse" />
                    <span>Two-Factor Shield (2FA)</span>
                    <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-sm border border-emerald-200/50">
                      Highly Recommended
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed font-semibold">
                    Secure your account from brute force attacks by verifying your identity via email during sign-in.
                  </p>
                </div>

                <div className="space-y-6 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">
                        Email Passcode Gate
                      </h4>
                      <p className="text-[11px] text-slate-600 mt-1 font-semibold">
                        Require a 6-digit confirmation PIN on login
                      </p>
                    </div>
                    <button
                      onClick={handleToggle2FA}
                      aria-label="Toggle Two-Factor Authentication"
                      role="switch"
                      aria-checked={userProfile?.twoFactorEnabled ?? false}
                      className={cn(
                        "w-11 h-6 rounded-sm transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0 self-center",
                        (userProfile?.twoFactorEnabled ?? false) ? "bg-emerald-600" : "bg-slate-200",
                      )}
                    >
                      <span
                        className={cn(
                          "bg-white w-5 h-5 rounded-sm  transform transition-transform duration-250",
                          (userProfile?.twoFactorEnabled ?? false) ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>

                  <div className="border-t border-slate-100 pt-6 space-y-3">
                    <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                      Status: <strong className={cn(
                        "font-black uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-sm border",
                        (userProfile?.twoFactorEnabled ?? false)
                          ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                          : "text-slate-600 bg-slate-50 border-slate-200"
                      )}>{(userProfile?.twoFactorEnabled ?? false) ? "Shield Enabled" : "Shield Disabled"}</strong>
                    </p>
                    <p className="text-[10px] text-slate-600 font-medium leading-relaxed">
                      When enabled, we will send an identity authorization key to <span className="text-[10px] text-slate-600 font-black">{user?.email}</span> every time you log back in.
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="calendar"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
          >
            <CalendarView
              studentProfile={studentProfile}
              isDemoMode={isDemoMode}
              user={user}
              refreshProfile={refreshProfile}
            />
          </motion.div>
        )}
      </AnimatePresence>
        </div>{/* end flex-1 content area */}
      </div>{/* end sidebar + content flex row */}

      {showReceiptModal && selectedReceiptApp && (
        <ReceiptModal
          isOpen={showReceiptModal}
          onClose={() => {
            setShowReceiptModal(false);
            setSelectedReceiptApp(null);
          }}
          application={selectedReceiptApp}
          organizationName="York Region Community Partner"
        />
      )}

      {/* Rating Modal */}
      {ratingApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white p-8 space-y-5 relative">
            <button onClick={() => setRatingApp(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-ink">Rate your experience</h3>
            <p className="text-sm text-slate-500">{ratingApp.opportunityTitle || ratingApp.orgName || 'Organization'}</p>
            <div className="flex gap-1 py-2">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setRatingStars(s)} className="p-1 transition-transform hover:scale-110">
                  <Star className={cn("w-8 h-8", s <= ratingStars ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
                </button>
              ))}
            </div>
            <textarea
              value={ratingComment}
              onChange={e => setRatingComment(e.target.value)}
              placeholder="Optional: share your experience (500 char max)"
              maxLength={500}
              className="w-full h-24 p-3 border border-slate-200 text-sm resize-none focus:outline-none focus:border-[#1F4C63]"
            />
            <button
              onClick={handleSubmitRating}
              disabled={ratingStars < 1 || isSubmittingRating}
              className="w-full h-11 bg-[#1F4C63] text-white text-xs font-black uppercase tracking-wider disabled:opacity-50 hover:bg-[#153343] transition-colors"
            >
              {isSubmittingRating ? 'Submitting...' : 'Submit Rating'}
            </button>
          </div>
        </div>
      )}

      {showLogForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <Card className="w-full max-w-lg rounded-sm border-none  p-8 bg-white space-y-6 relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => {
                setShowLogForm(false);
                setLogError("");
              }}
              aria-label="Close request hours form"
              className="absolute top-6 right-6 p-2 text-slate-600 hover:text-slate-600 rounded-sm hover:bg-slate-50 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#E08A3C] bg-[#E08A3C]/10 px-3 py-1 rounded-sm border border-orange-100">
                Official Involvement Request
              </span>
              <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">Request Hours Verification</CardTitle>
              <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                Fill in the details below. We will send an automatic email notification directly to your supervisor's email coordinates to authorize these hours.
              </p>
            </div>

            {logError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-sm text-xs font-bold ">
                ⚠️ {logError}
              </div>
            )}

            <form onSubmit={handleLogSubmit} className="space-y-4">
              {applications.length > 0 && (
                <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-sm space-y-1 text-indigo-900 animate-fadeIn ">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest flex items-center gap-1.5 text-indigo-800">
                    <span className="text-sm">⚡</span> Highlighted Most Recent Volunteering
                  </p>
                  <p className="text-xs font-black text-indigo-950">
                    {applications[0].opportunityTitle || "Volunteer Session"}
                  </p>
                  <p className="text-[10px] text-indigo-700 font-semibold leading-relaxed">
                    Select this option in the dropdown below to automatically pre-fill your supervisor email and coordinate approval.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Select Previous Volunteer Role</label>
                <select
                  value={selectedVolunteeringId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedVolunteeringId(val);
                    if (val === "custom" || !val) {
                      setLogActivity("");
                      setLogOrg("");
                      setLogContact("");
                    } else {
                      const app = applications.find(a => a.id === val);
                      if (app) {
                        setLogActivity(app.opportunityTitle || "");
                        const contact = orgContacts[app.opportunityId];
                        setLogOrg(contact?.organizationName || "Canada Mutual Aid Partner");
                        setLogContact(contact?.email || "");
                      }
                    }
                  }}
                  className="w-full rounded-sm h-11 border border-slate-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-[#1F4C63] font-bold text-slate-700 cursor-pointer "
                >
                  <option value="">-- Choose an opportunity --</option>
                  {applications.map((app, index) => {
                    const isMostRecent = index === 0;
                    const contact = orgContacts[app.opportunityId];
                    const orgDisplay = contact?.organizationName ? ` at ${contact.organizationName}` : "";
                    const dateDisplay = app.appliedAt ? ` (Applied: ${new Date(app.appliedAt.toDate ? app.appliedAt.toDate() : (app.appliedAt || new Date())).toLocaleDateString()})` : "";
                    return (
                      <option 
                        key={app.id} 
                        value={app.id}
                        className={isMostRecent ? "text-indigo-600 bg-indigo-50 font-black" : "text-slate-800"}
                      >
                        {isMostRecent ? "🌟 [MOST RECENT] " : ""}
                        {app.opportunityTitle || "Volunteer Session"}{orgDisplay}{dateDisplay}
                      </option>
                    );
                  })}
                  <option value="custom" className="font-bold text-amber-700">✨ Other / Unlisted Custom Activity Name...</option>
                </select>
              </div>

              {(!selectedVolunteeringId || selectedVolunteeringId === "custom") ? (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Select Registered Volunteer Site / Organization</label>
                    <select
                      value={selectedPartnerId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedPartnerId(val);
                        if (val === "custom" || !val) {
                          setLogOrg("");
                          setLogContact("");
                          setLogCoordinator("");
                        } else {
                          const org = allOrganizations.find(o => o.id === val);
                          if (org) {
                            setLogOrg(org.organizationName || "");
                            setLogContact(org.contactEmail || org.email || "");
                            setLogCoordinator(org.contactName || "Site Supervisor");
                          }
                        }
                      }}
                      className="w-full rounded-sm h-11 border border-slate-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-[#1F4C63] font-bold text-slate-700 cursor-pointer  mb-4"
                    >
                      <option value="">-- Choose verified partner (Auto-Fills info) --</option>
                      {allOrganizations.map((org) => (
                        <option key={org.id} value={org.id} className="text-slate-800">
                          🛡️ {org.organizationName}
                        </option>
                      ))}
                      <option value="custom" className="font-bold text-amber-700">✍️ Other / Unlisted Organization (Enter Manually)...</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Activity Name / Event</label>
                    <Input 
                      value={logActivity}
                      onChange={(e) => setLogActivity(e.target.value)}
                      placeholder="e.g. Teen Tech Tutoring Session"
                      className="rounded-sm h-11 border-slate-100 text-sm font-medium"
                      required
                    />
                  </div>

                  {(!selectedPartnerId || selectedPartnerId === "custom") && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Community Organization Name</label>
                      <Input 
                        value={logOrg}
                        onChange={(e) => setLogOrg(e.target.value)}
                        placeholder="e.g. North York Public Library"
                        className="rounded-sm h-11 border-slate-100 text-sm font-medium"
                        required
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="p-3.5 bg-[#1F4C63]/5 border border-[#1F4C63]/20 rounded-sm space-y-1.5 animate-fadeIn">
                  <p className="text-[10px] font-black uppercase text-blue-900 tracking-wider flex items-center gap-1">
                    🇨🇦 Pre-selected Match Verified
                  </p>
                  <p className="text-xs font-black text-slate-900">
                    Activity: {logActivity}
                  </p>
                  <p className="text-xs text-slate-600 font-semibold">
                    Hosted by: <span className="text-slate-900 font-bold">{logOrg}</span>
                  </p>
                  <p className="text-[10px] text-blue-800 leading-normal font-medium">
                    Organization contact email was automatically mapped to <span className="font-bold">{logContact}</span>.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Volunteer Hours</label>
                  <Input 
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={logHours}
                    onChange={(e) => setLogHours(e.target.value)}
                    placeholder="e.g. 4.5"
                    className="rounded-sm h-11 border-slate-100 text-sm font-bold"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Service Date</label>
                  <Input 
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="rounded-sm h-11 border-slate-100 text-sm font-semibold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Coordinator Name</label>
                  <Input 
                    value={logCoordinator}
                    onChange={(e) => setLogCoordinator(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    className="rounded-sm h-11 border-slate-100 text-sm font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Coordinator Email</label>
                  <Input 
                    type="email"
                    value={logContact}
                    onChange={(e) => setLogContact(e.target.value)}
                    placeholder="jane.doe@organization.org"
                    className="rounded-sm h-11 border-slate-100 text-sm font-medium"
                    required
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowLogForm(false);
                    setLogError("");
                  }}
                  className="w-1/2 h-12 rounded-sm font-bold uppercase text-[10px] tracking-widest text-slate-600 border border-slate-200 cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isLoading={isLogging}
                  className="w-1/2 h-12 bg-[#1F4C63] hover:bg-[#1F4C63] text-white font-black uppercase text-[10px] tracking-widest rounded-sm  shadow-blue-100 cursor-pointer"
                >
                  Send Request
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
      {logSuccess && (
        <SuccessAnimation
          message="Your volunteer hours request has been logged and dispatched to your coordinator successfully!"
          onClose={() => setLogSuccess(false)}
        />
      )}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 overflow-y-auto animate-fadeIn">
          <Card className="w-full max-w-4xl bg-white border border-slate-200/80 rounded-sm  p-6 md:p-10 space-y-8 relative overflow-hidden my-8 text-slate-800">
            <button
              onClick={() => setShowPrintModal(false)}
              aria-label="Close transcript modal"
              className="absolute top-5 right-5 text-slate-600 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 p-2.5 rounded-sm transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            {/* Certificate Header */}
            <div className="border-b-4 border-[#1F4C63] pb-5 text-center sm:text-left">
              <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight">Toronto Community Involvement Hours Transcript</h2>
              <p className="text-xs text-slate-600 mt-1">Ontario High School Graduation Requirement Official Tracking Document</p>
            </div>

            {/* Student Info Box */}
            <div className="bg-slate-50/70 border border-slate-200 p-6 rounded-sm grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div><strong>Student Name:</strong> <span className="text-slate-800 font-bold">{studentProfile?.fullName || "Alex Volunteer"}</span></div>
              <div><strong>Academic School:</strong> <span className="text-slate-800 font-bold">{studentProfile?.school || "Toronto Secondary"}</span></div>
              <div><strong>Grade:</strong> <span className="text-slate-800 font-bold">Grade {studentProfile?.grade || "11"}</span></div>
              <div><strong>Toronto Neighborhood:</strong> <span className="text-slate-800 font-bold">{studentProfile?.neighborhood || "North York"}</span></div>
            </div>

            {/* List Of Hours */}
            <div className="overflow-x-auto border border-slate-100 rounded-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                    <th className="p-4 font-black">Activity Description</th>
                    <th className="p-4 font-black text-center">Hours</th>
                    <th className="p-4 font-black">Completion Date</th>
                    <th className="p-4 font-black">Supervisor Details</th>
                    <th className="p-4 font-black text-right">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loggedHoursList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-600 italic">No volunteer hours logged in your tracking list yet.</td>
                    </tr>
                  ) : (
                    loggedHoursList.map((lh, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30">
                        <td className="p-4 font-bold text-slate-800">{lh.activity}</td>
                        <td className="p-4 font-black text-[#1F4C63] text-center">{lh.hours} hrs</td>
                        <td className="p-4 text-slate-600 ">{lh.date}</td>
                        <td className="p-4 text-slate-600">{lh.coordinatorName} ({lh.coordinatorContact})</td>
                        <td className="p-4 text-right text-emerald-600 font-black tracking-wide uppercase text-[9px]">Verified Check</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="text-right text-sm md:text-base font-extrabold text-slate-900 flex justify-end gap-2 items-center">
              Total Community Involvement Hours Logged: 
              <span className="text-[#1F4C63] text-lg md:text-xl font-black">{totalCompletedHours} / {hourGoal} hrs</span>
            </div>

            {/* Signatures boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-6 border-t border-slate-100">
              <div className="border-t border-slate-300 pt-3 text-center text-[10px] text-slate-600 font-semibold uppercase tracking-wider">
                Supervisor Signature & Stamp
              </div>
              <div className="border-t border-slate-300 pt-3 text-center text-[10px] text-slate-600 font-semibold uppercase tracking-wider">
                Guidance Counselor Approval Date
              </div>
            </div>

            {/* Sticky Actions */}
            <div className="flex gap-3 justify-end pt-4">
              <Button
                variant="outline"
                className="px-5 h-11 text-xs uppercase text-slate-600 font-black hover:bg-slate-100 rounded-sm"
                onClick={() => setShowPrintModal(false)}
              >
                Close Certificate
              </Button>
              <Button
                className="px-5 h-11 text-xs uppercase bg-[#1F4C63] hover:bg-[#1F4C63] font-black text-white rounded-sm  cursor-pointer flex items-center gap-1.5"
                onClick={() => window.print()}
              >
                <Printer className="w-4 h-4" /> Print Document
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
