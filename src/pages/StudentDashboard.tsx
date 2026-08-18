import { useDialog } from '../hooks/useDialog';
import React, { useState, useEffect } from "react";
import { API_BASE_URL } from '../lib/config';
import { getMatchScore as scoreOpportunity } from '../lib/matchScore';
import { DEMO_OPPORTUNITIES } from './studentDashboard/demoOpportunities';
import { buildCertificateHtml } from './studentDashboard/certificate';
import LeaderboardTab from './studentDashboard/LeaderboardTab';
import SettingsTab from './studentDashboard/SettingsTab';
import { useAuth } from "../contexts/AuthContext";
import SuccessAnimation from "../components/SuccessAnimation";
import EmailDeliveryNote from "../components/ui/EmailDeliveryNote";
import { db } from "../firebase/config";
import { subscribeToScalableLeaderboard, requestLeaderboardRebuild } from "../lib/scalableLeaderboard";
import { reportError } from "../lib/errors";
import { totalLoggedHours } from "../lib/hours";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  doc,
  getDoc,
  addDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import {
  Application,
} from "../types";
import {
  Card,
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
  Mail,
  Phone,
  Globe,
  ListPlus,
  Send,
  X,
  Trophy,
  Settings,
  Printer,
  FileText,
  LayoutDashboard,
} from "lucide-react";
import { formatDate, cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { OPPORTUNITY_CATEGORIES } from "../constants";
// CalendarView was imported here but never rendered. As a static import it was
// still bundled into this chunk (~36 KB of dead weight). Re-add the import when
// the calendar tab actually ships.
import ReceiptModal from "../components/ReceiptModal";
import { sendTransactionalEmail } from "../lib/emailService";
import { Award, Zap, BookOpen, Briefcase, Heart, ShieldCheck } from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useStudentDashboardData } from '../hooks/useStudentDashboardData';

export default function StudentDashboard() {
  const { user, userProfile, studentProfile, isDemoMode, refreshProfile, loading, profilesLoaded } =
    useAuth();
  const navigate = useNavigate();

  /**
   * Everything this page READS.
   *
   * The 264-line effect that used to sit in the middle of this component now
   * lives in the hook, along with the seven collections it touches and the two
   * invariants that are easy to "tidy" into bugs. This page decides what
   * happens when someone clicks something; it no longer decides how anything is
   * fetched.
   */
  const {
    applications, savedOpportunities, recommended, hoursRequests, allOrganizations,
    isLoading, errorMessage, setErrorMessage,
    setApplications, setSavedOpportunities, setHoursRequests, setAllOrganizations,
  } = useStudentDashboardData(user, studentProfile, isDemoMode);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "applications" | "hours" | "leaderboard" | "settings"
  >("dashboard");

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (
      tabParam === "leaderboard" ||
      tabParam === "applications" ||
      tabParam === "hours" ||
      tabParam === "dashboard" ||
      tabParam === "settings"
    ) {
      setActiveTab(tabParam as any);
    }
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as any);
    setSearchParams({ tab });
  };
  const [orgContacts, setOrgContacts] = useState<
    Record<string, { email: string; phone?: string; website?: string; organizationName?: string }>
  >({});
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  // Receipt Modal State
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  // Rating state
  const [ratingApp, setRatingApp] = useState<any>(null);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState("");
  const [existingRatings, setExistingRatings] = useState<Record<string, boolean>>({});
  const [selectedReceiptApp, setSelectedReceiptApp] =
    useState<Application | null>(null);

  // Print Certificate Modal State
  const [showPrintModal, setShowPrintModal] = useState(false);

  // New Academic Verification Check: Force newly created Accounts to complete the details
  //
  // `profilesLoaded` is required here. `loading` is already false by the time a
  // user signs in (it flipped on the first, anonymous auth callback), so this
  // used to run while studentProfile was still null and bounced EVERY returning
  // student to onboarding — including ones who had completed it.
  useEffect(() => {
    if (!loading && profilesLoaded && user) {
      if (!studentProfile || !studentProfile.school) {
        navigate("/student/onboarding");
      }
    }
  }, [user, studentProfile, loading, profilesLoaded, navigate]);

  // Hour Logging and tracking states
  const loggedHoursList = studentProfile?.loggedHours || [];
  const totalCompletedHours = totalLoggedHours(loggedHoursList);
  const hourGoal = 40;

  const [selectedVolunteeringId, setSelectedVolunteeringId] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
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

  // Keyboard and screen-reader plumbing for this page's three modals. See
  // src/hooks/useDialog.ts — role, aria-modal, Escape, focus trap and focus
  // restore, none of which these had.
  const ratingDialogRef = useDialog(!!ratingApp, () => { setRatingApp(null); setRatingError(''); });
  const logFormDialogRef = useDialog(showLogForm, () => setShowLogForm(false));
  const printDialogRef = useDialog(showPrintModal, () => setShowPrintModal(false));
  // Hours the student has submitted that a coordinator has not confirmed yet.
  // Without showing these, a student who logged 8 hours sees the bar refuse to
  // move and has no idea whether the submission worked.
  const pendingHourCount = React.useMemo(
    () => hoursRequests
      .filter((r: any) => r?.status === 'pending')
      .reduce((sum: number, r: any) => {
        const n = Number(r?.hours);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    [hoursRequests],
  );
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
      // sendTransactionalEmail resolves with { success: false } rather than
      // throwing, so showing the success tick unconditionally told students
      // their coordinator had been reminded when nothing was actually sent.
      const reminderResult = await sendTransactionalEmail({
        to: req.coordinatorContact,
        subject: `Reminder: ${studentProfile?.fullName || "A student"} is waiting on your hours confirmation`,
        templateName: "notification",
        templateData: {
          heading: "A volunteer hours confirmation is still pending",
          details: `${studentProfile?.fullName || "A student"} has asked you to confirm the ${req.hours} hours they logged for "${req.activity}" on ${req.date}. You can approve or decline it from your Volunteer North York dashboard.`,
          actionLabel: "Review the request",
          actionUrl: `${window.location.origin}/org/dashboard?tab=hours`
        }
      });
      if (!reminderResult.success) {
        // Correctly refuses to claim success — but said nothing at all, which
        // to the student is indistinguishable from a button that does nothing.
        console.error("Failed to send hours request reminder:", reminderResult.error);
        setErrorMessage("We couldn't send that reminder. Please try again in a moment.");
        return;
      }
      setReminderSuccessId(req.id);
      setTimeout(() => {
        setReminderSuccessId(null);
      }, 3000);
    } catch (err) {
      console.error("Failed to send hours request reminder:", err);
      setErrorMessage("We couldn't send that reminder. Please try again in a moment.");
    } finally {
      setSendingReminderId(null);
    }
  };

  // Leaderboard states
  const [leaderboard, setLeaderboard] = useState<
    Array<{ id: string; name: string; hours: number; isSelf: boolean }>
  >([]);
  // True when the leaderboard document could not be read. Rendered as an
  // honest error instead of fabricated peers.
  const [leaderboardError, setLeaderboardError] = useState(false);

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
      // Deliberately NO email from the demo branch. This used to send for real,
      // to whatever address an anonymous visitor typed into the coordinator
      // field, from our verified sending domain. Production was saved only by
      // the server refusing demo tokens — and that refusal was swallowed by a
      // .catch — so any preview deploy without NODE_ENV=production delivered it.
      // A demo must never touch a real inbox.
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
        subject: `${studentProfile?.fullName || "A student"} asked you to confirm their volunteer hours`,
        templateName: "notification",
        templateData: {
          heading: "Please confirm these volunteer hours",
          details: `${studentProfile?.fullName || "A student"} submitted ${parsedHours} hours for "${logActivity}" on ${logDate} and has asked you to verify them online.`,
          actionLabel: "Review the request",
          actionUrl: `${window.location.origin}/org/dashboard?tab=hours`
        }
      }).catch(err => console.error("Could not send hours verification email:", err));
    } catch (err: any) {
      setLogError("Failed to submit verification request: " + err.message);
    } finally {
      setIsLogging(false);
    }
  };

  // Errors do NOT auto-dismiss. This state carries LOAD failures, not just
  // action toasts, and a timer on a load failure recreates the exact bug this
  // project keeps fixing: the message explaining why a list is empty deletes
  // itself, leaving "nothing here" over a queue that is not empty. The pattern
  // the codebase already settled on is OrgOpportunityApplicants — persist, and
  // give the reader an explicit Dismiss. Success toasts still auto-clear;
  // there is nothing to act on in those.

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
      // The public board is a materialised document, not a live query, so
      // writing the flag changes nothing other students can see until something
      // rebuilds it. Without this the toggle only altered THIS student's own
      // tab: they were told "Leaderboard Participation Disabled" while everyone
      // else carried on seeing their real name and hours, until some unrelated
      // organization happened to approve someone's hours. Opting out of a
      // public ranking has to take effect when you opt out.
      void requestLeaderboardRebuild();
      await refreshProfile();
    } catch (err) {
      console.error("Error updating trackerEnabled", err);
      setErrorMessage("Couldn't change your leaderboard visibility. Please try again.");
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
      // Same reason as the visibility toggle above — the rendered board is a
      // stored snapshot, so hiding your name has to rebuild it.
      void requestLeaderboardRebuild();
      await refreshProfile();
    } catch (err) {
      console.error("Error updating trackerAnonymous", err);
      setErrorMessage("Couldn't change your leaderboard anonymity. Please try again.");
    }
  };

  /**
   * Withdraw an application the student no longer wants.
   *
   * This DELETES the application rather than setting status 'terminated', and
   * the difference matters because applications are now keyed deterministically
   * as `${studentId}_${opportunityId}` to make duplicates impossible.
   *
   * A tombstoned document keeps that key occupied. Re-applying would then be an
   * UPDATE, and isValidApplication pins `appliedAt` to its stored value while
   * the apply path sends serverTimestamp() — so the write is refused, and the
   * detail page's hasApplied check (which counts any status) shows "You've
   * Applied!" for ever. Withdrawing would have been a permanent dead end.
   *
   * Deleting is also the more honest record: no decision had been made, so
   * there is nothing for the organization to keep. firestore.rules has always
   * allowed the owner to delete their own application. Withdrawal is only
   * offered before a decision — an accepted placement is the organization's to
   * terminate, and that path still uses 'terminated'.
   */
  const handleWithdrawApplication = async (app: any) => {
    if (!user) return;
    if (!window.confirm(`Withdraw your application for "${app.opportunityTitle || 'this opportunity'}"? You can apply again afterwards.`)) return;
    setWithdrawingId(app.id);
    try {
      if (isDemoMode) {
        const stored = JSON.parse(localStorage.getItem("demo_applications") || "[]");
        localStorage.setItem("demo_applications", JSON.stringify(
          stored.filter((a: any) => a.id !== app.id),
        ));
      } else {
        await deleteDoc(doc(db, "applications", app.id));
      }
      setApplications((prev: any[]) => prev.filter((a) => a.id !== app.id));
      setErrorMessage(null);
    } catch (err) {
      console.error("Error withdrawing application", err);
      setErrorMessage("We couldn't withdraw that application. Please try again.");
    } finally {
      setWithdrawingId(null);
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
      // Worth being loud about: silently failing to turn two-factor ON is a
      // security setting the student believes they changed.
      console.error("Error updating twoFactorEnabled", err);
      setErrorMessage(
        newVal
          ? "Two-factor authentication was NOT turned on. Please try again."
          : "Couldn't turn off two-factor authentication. Please try again."
      );
    }
  };

  // Load which orgs the student has already rated so we don't show the button twice
  useEffect(() => {
    if (!user || isDemoMode) return;
    const fetchRatings = async () => {
      try {
        const q = query(collection(db, 'orgRatings'), where('studentId', '==', user.uid), limit(100));
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
    setRatingError("");
    try {
      // Applications written before orgId was stored on them have neither
      // orgId nor organizationId, and `orgId: undefined` is rejected outright
      // by the Firestore SDK — which is why every rating from a real student
      // vanished. Recover the org from the opportunity for those.
      let orgId: string | undefined = ratingApp.orgId || ratingApp.organizationId;
      if (!orgId && !isDemoMode && ratingApp.opportunityId) {
        const oppSnap = await getDoc(doc(db, "opportunities", ratingApp.opportunityId));
        orgId = oppSnap.data()?.orgId;
      }
      if (!orgId) {
        setRatingError("We couldn't work out which organization this was for, so the rating wasn't saved. Please let us know via Feedback.");
        return;
      }

      const ratingId = `${user.uid}_${orgId}_${ratingApp.opportunityId}`;
      if (isDemoMode) {
        const existing = JSON.parse(localStorage.getItem('demo_ratings') || '[]');
        existing.push({ id: ratingId, stars: ratingStars, comment: ratingComment, orgName: ratingApp.orgName || ratingApp.organizationName, opportunityTitle: ratingApp.opportunityTitle });
        localStorage.setItem('demo_ratings', JSON.stringify(existing));
      } else {
        // Via the server: proving this student actually volunteered with the
        // organization is a query across applications, which rules cannot run,
        // so a direct client write let anyone rate anyone. The endpoint also
        // reads the organization from the opportunity rather than trusting the
        // request, so a rater cannot aim their stars at a different org.
        const token = await user.getIdToken();
        const res = await fetch(`${API_BASE_URL}/api/ratings/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            opportunityId: ratingApp.opportunityId,
            stars: ratingStars,
            comment: ratingComment,
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Could not save the rating (${res.status}).`);
        }
      }
      setExistingRatings(prev => ({ ...prev, [`${orgId}_${ratingApp.opportunityId}`]: true }));
      setRatingApp(null);
      setRatingStars(0);
      setRatingComment("");
    } catch (err: any) {
      // Previously a console.error only: the modal just sat there, the spinner
      // stopped, and the student's rating was discarded without a word.
      console.error('Failed to submit rating:', err);
      setRatingError(
        err?.code === 'permission-denied'
          ? "We couldn't save this rating. You can only rate an organization you volunteered with."
          : "We couldn't save your rating. Please check your connection and try again."
      );
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const handlePrintCertificate = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      // Pop-up blocked. The modal is the fallback path.
      setShowPrintModal(true);
      return;
    }
    printWindow.document.write(buildCertificateHtml(studentProfile, totalCompletedHours));
    printWindow.document.close();
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const fetchLeaderboard = () => {
      // Fabricated peers ("Maya S.", "Devon K.", …) used to live here and were
      // merged into the REAL leaderboard on every load — students were ranked
      // against people who do not exist. They now exist only inside demo mode,
      // where the whole session is explicitly simulated.
      const demoPeers = [
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
          const combined = [...demoPeers, selfItem].sort(
            (a, b) => b.hours - a.hours,
          );
          setLeaderboard(combined);
        } else {
          setLeaderboard(demoPeers);
        }
        setLeaderboardError(false);
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

            mapped.sort((a, b) => b.hours - a.hours);
            setLeaderboard(mapped.slice(0, 5));
            setLeaderboardError(false);
          },
          (err) => {
            // A failed read must render as a failure, not as four invented
            // students. Same principle as the demo-hours fixtures removed in
            // B17: these are graduation records and a public ranking.
            console.error("Scalable leaderboard read failed:", err);
            setLeaderboard([]);
            setLeaderboardError(true);
          }
        );
      } catch (err) {
        console.error("Error subscribing to scalable leaderboard:", err);
        setLeaderboard([]);
        setLeaderboardError(true);
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
      // The success banner is set INSIDE the try, above, so it never fired on
      // failure — but nothing else did either. The student filled in the form,
      // pressed submit, and got no banner and no error: indistinguishable from
      // the button not working.
      console.error("Error submitting interest:", err);
      setErrorMessage("We couldn't send that request. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Registered organizations, loaded the first time the hours form is opened.
  //
  // Up to 200 documents for a single dropdown. Gating it on showLogForm removes
  // them from the default dashboard load entirely; the student pays for it only
  // when they are actually logging hours, and only once per session.
  useEffect(() => {
    if (!showLogForm || isDemoMode || allOrganizations.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const orgsSnap = await getDocs(query(collection(db, "organizations"), limit(200)));
        if (cancelled) return;
        setAllOrganizations(orgsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (orgsErr) {
        // The picker also accepts a typed name, so this degrades rather than
        // blocking the submission.
        console.warn("Could not load registered organizations:", orgsErr);
      }
    })();
    return () => { cancelled = true; };
  }, [showLogForm, isDemoMode, allOrganizations.length]);

  useEffect(() => {
    const fetchOrgContacts = async () => {
      const acceptedApps = applications;
      if (acceptedApps.length === 0) return;

      const newContacts: Record<
        string,
        { email: string; phone?: string; website?: string; organizationName?: string }
      > = { ...orgContacts };
      let changed = false;

      // Two rounds of parallel reads, not two reads per application in series.
      //
      // This was `await getDoc(opportunity)` then `await getDoc(organization)`
      // INSIDE the loop, so the reads serialised: applications are capped at 50,
      // making a worst case of 100 sequential round trips. At a 150ms mobile
      // RTT that is roughly fifteen seconds during which the contact block
      // simply is not there.
      //
      // The organizations were also being re-fetched despite already being in
      // memory — the same effect loads up to 200 of them for the hours form —
      // so the second round only asks for what is genuinely missing.
      const needed = acceptedApps.filter(
        (app: any) => app.opportunityId && !newContacts[app.opportunityId],
      );

      if (needed.length) {
        try {
          const opps = await Promise.all(
            needed.map((app: any) =>
              getDoc(doc(db, "opportunities", app.opportunityId))
                .then((snap) => ({ app, snap }))
                .catch(() => ({ app, snap: null })),
            ),
          );

          const known = new Map<string, any>(
            (allOrganizations || []).map((o: any) => [o.uid ?? o.id, o]),
          );
          const missingOrgIds = [
            ...new Set(
              opps
                .map(({ snap }) => (snap?.exists() ? snap.data()?.orgId : null))
                .filter((id): id is string => !!id && !known.has(id)),
            ),
          ];

          const fetched = await Promise.all(
            missingOrgIds.map((orgId) =>
              getDoc(doc(db, "organizations", orgId))
                .then((snap) => (snap.exists() ? { orgId, data: snap.data() } : null))
                .catch(() => null),
            ),
          );
          for (const row of fetched) if (row) known.set(row.orgId, row.data);

          for (const { app, snap } of opps) {
            const orgId = snap?.exists() ? snap.data()?.orgId : null;
            const orgData = orgId ? known.get(orgId) : null;
            if (!orgData) continue;
            newContacts[app.opportunityId] = {
              email: orgData.contactEmail || "",
              phone: orgData.phone || "",
              website: orgData.websiteUrl || "",
              organizationName: orgData.organizationName || "Community Group",
            };
            changed = true;
          }
        } catch (err) {
          console.error("Error fetching org contacts:", err);
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
    // allOrganizations is read to avoid re-fetching organizations already in
    // memory, so the effect re-runs once it arrives and can fill in contacts it
    // previously had to skip. orgContacts is deliberately NOT a dependency: the
    // effect writes it, and listing it would loop.
  }, [applications, isDemoMode, allOrganizations]);


  if (isLoading)
    // A skeleton of the real layout, not a sentence.
    //
    // This screen sits behind six Firestore queries and is the first thing a
    // student sees after signing in. A centred line of text gives no hint of
    // what is coming, so the page appears to snap into existence; a shape that
    // matches the finished layout reads as faster even when it is not. The
    // shimmer primitive already exists (--animate-shimmer, used by the navbar).
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-8" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your dashboard</span>
        <div className="h-9 w-64 rounded-lg bg-line animate-shimmer" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 rounded-lg bg-paper-2 border border-line animate-shimmer" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-paper-2 border border-line animate-shimmer" />
            ))}
          </div>
          <div className="h-64 rounded-lg bg-paper-2 border border-line animate-shimmer" />
        </div>
      </div>
    );

  const sidebarItems = [
    { id: "dashboard", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "applications", label: "My Applications", icon: <Calendar className="w-4 h-4" /> },
    { id: "hours", label: "Hours & Verification", icon: <Clock className="w-4 h-4" /> },
    { id: "leaderboard", label: "Leaderboard", icon: <Trophy className="w-4 h-4" /> },
    { id: "settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <DashboardLayout
      title={`Hi, ${studentProfile?.fullName || "Student"}`}
      subtitle="Your volunteer dashboard"
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={handleTabChange}
    >
      {/* `errorMessage` was declared and never set or rendered. The settings
          toggles below (leaderboard visibility, anonymity, two-factor) each
          swallowed their write failure in a console.error, so a student who
          switched two-factor ON and hit a rules or network error saw the switch
          simply not move, with no explanation. */}
      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-6 py-3 rounded-lg font-semibold text-xs tracking-wide flex items-start gap-3 max-w-[90vw]"
        >
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

      <AnimatePresence mode="wait">
        {["dashboard", "applications", "hours"].includes(activeTab) && (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className={`grid grid-cols-1 ${activeTab === "hours" ? "max-w-3xl mx-auto" : "lg:grid-cols-3"} gap-8`}
          >
            {/* Main Column */}
            <div className={`lg:col-span-2 space-y-8 ${activeTab === "hours" ? "hidden" : ""}`}>
            {/* Recent Applications */}
            <section className={activeTab !== "applications" ? "hidden" : ""}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-ink flex items-center gap-2">
                  <Calendar className="text-blue-dark w-5 h-5" />
                  Your Applications
                </h2>
              </div>
              {applications.length > 0 ? (
                <div className="space-y-4">
                  {/* These cards carry no status-coloured left border. It
                      duplicated the <Badge> below, which already spells the
                      status out in words, and colour alone is not an accessible
                      way to carry meaning (WCAG 1.4.1) — a colourblind student,
                      or anyone using a screen reader, got nothing from the
                      stripe and everything from the badge. */}
                  {applications.map((app) => (
                    <Card
                      key={app.id}
                      className="p-6 overflow-hidden relative"
                    >
                      <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-ink text-lg break-words">
                            {app.opportunityTitle || "Opportunity"}
                          </h4>
                          <p className="text-xs text-ink-soft font-medium tracking-wide mt-1">
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
                              className="px-3 py-1.5 text-xs font-semibold tracking-wide bg-white hover:bg-paper-3 text-ink border border-line rounded-lg flex items-center gap-1 hover:scale-[1.03] transition-all duration-200 whitespace-nowrap rounded-full shadow-sm"
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
                              <FileText className="w-3.5 h-3.5 text-amber-dark animate-pulse" />
                              <span>Receipt</span>
                            </button>
                          )}
                          {/* Withdraw. firestore.rules has always permitted a student
                              to set their own application to 'terminated', and no UI
                              anywhere called it — a student who applied to the wrong
                              opportunity had no way to take it back, the detail page
                              said "You've Applied!" forever, and the organization kept
                              counting them as an applicant against its capacity. */}
                          {(app.status === "pending" || app.status === "reviewed" || app.status === "waitlist") && (
                            <button
                              title="Withdraw this application"
                              disabled={withdrawingId === app.id}
                              className="px-3 py-1.5 text-xs font-semibold tracking-wide bg-white hover:bg-rose-50 text-red-600 border border-red-200 rounded-full flex items-center gap-1 transition-all duration-200 whitespace-nowrap disabled:opacity-50"
                              onClick={() => handleWithdrawApplication(app)}
                            >
                              <span>{withdrawingId === app.id ? "Withdrawing…" : "Withdraw"}</span>
                            </button>
                          )}
                          {app.status === "accepted" && !existingRatings[`${app.orgId || app.organizationId}_${app.opportunityId}`] && (
                            <button
                              title="Rate this organization"
                              className="px-3 py-1.5 text-xs font-semibold tracking-wide bg-blue-dark/10 hover:bg-blue-dark/20 text-blue-dark border border-blue-dark/20 rounded-full flex items-center gap-1 transition-all duration-200 whitespace-nowrap"
                              onClick={() => { setRatingApp(app); setRatingStars(0); setRatingComment(""); setRatingError(""); }}
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
                          <div className="mt-4 bg-paper-2 p-6 rounded-lg border border-line animate-in fade-in slide-in- duration-500">
                            <p className="text-xs font-bold text-ink tracking-wide mb-3">
                              Organization Contact Details
                            </p>
                            <div className="flex flex-wrap gap-6">
                              <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-ink-soft" />
                                <a
                                  href={`mailto:${orgContacts[app.opportunityId].email}`}
                                  className="text-sm font-bold text-ink hover:text-blue-dark transition-colors"
                                >
                                  {orgContacts[app.opportunityId].email}
                                </a>
                              </div>
                              {orgContacts[app.opportunityId].phone && (
                                <div className="flex items-center gap-2">
                                  <Phone className="w-4 h-4 text-ink-soft" />
                                  <span className="text-sm font-bold text-ink">
                                    {orgContacts[app.opportunityId].phone}
                                  </span>
                                </div>
                              )}
                              {orgContacts[app.opportunityId].website && (
                                <div className="flex items-center gap-2">
                                  <Globe className="w-4 h-4 text-ink-soft" />
                                  <a
                                    href={
                                      orgContacts[app.opportunityId].website
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-bold text-ink hover:text-blue-dark transition-colors"
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
                          <div className="mt-4 bg-red-50 p-4 rounded-lg border border-red-100 flex gap-4 animate-in fade-in slide-in- duration-500">
                            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center text-red-600 flex-shrink-0">
                              <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-red-900 tracking-wide mb-1">
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
                  <p className="text-ink-soft italic">
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
            <section className={activeTab !== "dashboard" ? "hidden" : ""}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-ink flex items-center gap-2">
                  <Sparkles className="text-blue-dark w-5 h-5" />
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
                        <div className="flex items-center justify-between mb-3 text-xs font-bold text-blue-dark tracking-wide">
                          <span>{opp.category}</span>
                          {opp.isVirtual && (
                            <Badge variant="info">Virtual</Badge>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-ink group-hover:text-blue-dark transition-colors mb-2 line-clamp-1">
                          {opp.title}
                        </h3>
                        <div className="flex flex-col gap-2 mt-4">
                          <div className="flex items-center gap-2 text-sm text-ink-soft">
                            <MapPin className="w-4 h-4" /> {opp.location}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-ink-soft">
                            <Clock className="w-4 h-4" /> {opp.timeCommitment}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                ) : (
                  <div className="col-span-full py-12 text-center bg-white rounded-lg border border-dashed text-ink-soft font-medium">
                    New opportunities will appear here soon!
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Sidebar */}
            <div className={`space-y-8 ${activeTab === "applications" ? "hidden lg:block lg:col-span-1" : ""}`}>
              {/* Hour Tracker Gauge */}
              <section className={activeTab === "applications" ? "hidden" : ""}>
              <h2 className="text-xl font-bold text-ink flex items-center gap-2 uppercase tracking-tight">
                <Trophy className="text-blue-dark w-5 h-5" />
                Hour Tracker
              </h2>
              <Card className="p-8 border border-line/50 rounded-lg bg-white space-y-6">
                {/* Hours Gauge */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm font-extrabold">
                    <span className="text-ink font-black tracking-wide ">
                      Volunteering Progress
                    </span>
                    <span className="text-blue-dark font-black text-lg ">
                      {totalCompletedHours} / {hourGoal} hrs
                    </span>
                  </div>
                  {/* bg-blue-dark is load-bearing. The fill carried NO background
                      utility at all — just " h-full rounded-lg transition-all" —
                      so the width was computed correctly and then painted with
                      nothing. The one visual showing a student how close they are
                      to the 40 hours they need to graduate was an empty grey
                      track at every value, including 39/40. */}
                  <div
                    className="w-full bg-paper-3 h-2.5 rounded-lg overflow-hidden"
                    role="progressbar"
                    aria-valuenow={Math.round(totalCompletedHours)}
                    aria-valuemin={0}
                    aria-valuemax={hourGoal}
                    aria-label={`${totalCompletedHours} of ${hourGoal} volunteer hours completed`}
                  >
                    <div
                      className="h-full rounded-lg bg-blue-dark transition-all"
                      style={{
                        width: `${Math.min((totalCompletedHours / hourGoal) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  {/* The number that actually motivates: what is LEFT. Pending
                      claims are shown separately so a student who submitted
                      hours understands why the bar has not moved. */}
                  <p className="text-xs text-ink-muted text-center">
                    {totalCompletedHours >= hourGoal
                      ? `You've completed all ${hourGoal} hours.`
                      : `${Math.max(0, Math.round((hourGoal - totalCompletedHours) * 10) / 10)} hours to go`}
                    {pendingHourCount > 0 && (
                      <span className="text-amber-dark">
                        {' '}· {pendingHourCount} hr{pendingHourCount === 1 ? '' : 's'} awaiting confirmation
                      </span>
                    )}
                  </p>
                  <div className="pt-1 flex items-center justify-center">
                    <Button
                      onClick={handlePrintCertificate}
                      variant="outline"
                      className="w-full h-10 border-blue-dark/20 text-blue-dark hover:bg-blue-dark/5 hover:text-[#153343] font-semibold text-xs uppercase tracking-wider rounded-lg transition-all gap-1.5 cursor-pointer flex items-center justify-center"
                    >
                      <Printer className="w-4 h-4 shrink-0 text-blue-dark" />
                      Print Hours Transcript
                    </Button>
                  </div>
                </div>

                {/* Disclaimer box */}
                <div className="bg-amber/10 border-2 border-dashed border-amber p-6 rounded-lg space-y-3">
                  <h3 className="text-amber-950 font-semibold text-xs uppercase tracking-wider flex items-center gap-2">
                    <span>⚠️</span> REQUIREMENT DISCLAIMER
                  </h3>

                  {/* Deliberately larger than the copy around it, and phrased
                      without hedging. "may still require" reads as "probably
                      not" — and a student who believes this page replaces their
                      board's form finds out in their graduating year, when it is
                      far too late to go back and collect signatures. */}
                  <p className="text-[13px] text-amber-950 leading-relaxed font-bold">
                    <strong className="text-[15px]">You still need your school's own community involvement form, signed by your supervisor.</strong>
                  </p>
                  <p className="text-[12px] text-amber-900 leading-relaxed font-semibold mt-2">
                    Volunteer North York tracks your hours here so you can see your
                    progress and your leaderboard position. It is <strong>not</strong> an
                    official record and no school board accepts it in place of their
                    own form. Print your hours from here to help you fill that form
                    in — then get it signed.
                  </p>
                </div>

                 {/* Unofficial Disclaimer Warning Box */}
                <div className="bg-white border border-line rounded-lg p-5 text-center space-y-3 shadow-sm">
                  <div>
                    <p className="text-orange-800 font-semibold text-xs uppercase tracking-wide">
                      Hour Verification Info
                    </p>
                    <p className="text-xs text-orange-700 leading-relaxed font-semibold mt-1">
                      Volunteer hours must be verified and logged directly by your
                      coordinators or supervisors. Only they can verify and approve your hours online.
                    </p>
                  </div>
                  <div className="pt-1.5 border-t border-amber/20">
                    <Button
                      onClick={() => setShowLogForm(true)}
                      className="w-full h-10 bg-blue-dark hover:bg-blue-dark hover:scale-[1.02] text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all gap-1.5 cursor-pointer"
                    >
                      Request Hours Verification
                    </Button>
                  </div>
                </div>

                {hoursRequests.length > 0 && (
                  <div className="pt-6 border-t border-line space-y-4">
                    <p className="text-xs font-semibold uppercase text-ink-soft tracking-wider ml-1">
                      Submitted Claims ({hoursRequests.length})
                    </p>
                    <div className="flex items-start gap-2 p-3 bg-amber/10 border border-amber/40 rounded-lg">
                      <span aria-hidden="true" className="text-sm leading-none mt-px">⚠️</span>
                      <p className="text-[11px] text-amber-900 font-semibold leading-relaxed">
                        Pending claims do not count toward your hour total until
                        the coordinator approves them. If your coordinator says
                        they never received the verification email, ask them to
                        check their spam or junk folder, then use Remind.
                      </p>
                    </div>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                      {hoursRequests.map((req) => (
                        <div
                          key={req.id}
                          className="p-4 rounded-lg border border-line bg-paper-2/50 space-y-3 transition-all hover:bg-paper-2"
                        >
                          <div className="flex justify-between items-start">
                            <div className="space-y-0.5">
                              <p className="font-bold text-ink text-sm leading-tight">
                                {req.activity}
                              </p>
                              <p className="text-xs text-ink-soft font-semibold tracking-wide uppercase">
                                {req.organization} • {req.date}
                              </p>
                            </div>
                            <span className="font-semibold text-xs text-blue-dark bg-blue-dark/5 px-2 py-0.5 rounded-lg shrink-0">
                              {req.hours} hrs
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-line/50">
                            <span
                              className={cn(
                                "text-xs font-semibold tracking-wide px-2 py-1 rounded-lg",
                                req.status === "approved"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : req.status === "declined"
                                    ? "bg-red-50 text-red-700"
                                    : "bg-amber/10 text-amber-700"
                              )}
                            >
                              {req.status === "approved"
                                ? "Approved"
                                : req.status === "declined"
                                  ? "Declined"
                                  : "Pending"}
                            </span>

                            {req.status === "pending" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={sendingReminderId === req.id || reminderSuccessId === req.id}
                                onClick={() => handleSendReminder(req)}
                                className="h-7 text-xs px-2 font-semibold tracking-wide hover:bg-paper-3 text-ink-soft cursor-pointer text-right flex items-center gap-1 shrink-0"
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
            <section className={activeTab !== "dashboard" ? "hidden" : ""}>
              <h2 className="text-xl font-bold text-ink flex items-center gap-2 mb-6">
                <ListPlus className="text-blue-dark w-5 h-5" />
                Waiting List
              </h2>
              <Card className="p-6 border-none rounded-lg bg-white">
                <p className="text-ink-soft text-xs font-medium mb-4">
                  Can't find a match? Join our waiting list for custom
                  placements.
                </p>
                <form onSubmit={handleInterestSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-ink-soft tracking-wide ml-1">
                      Categories of interest
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {OPPORTUNITY_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleCategory(cat)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                            selectedCategories.includes(cat)
                              ? "bg-blue-dark border-blue-dark text-white  shadow-blue-100"
                              : "bg-white border-line text-ink-soft hover:border-blue-dark/20",
                          )}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    aria-label="Specific interests or goals for the waiting list"
                    placeholder="Specific interests or goals..."
                    className="w-full min-h-[60px] p-3 rounded-lg bg-paper-2 border border-transparent focus:bg-white focus:border-blue-dark/10 outline-none h-10 text-xs font-bold transition-all"
                    value={interestNote}
                    onChange={(e) => setInterestNote(e.target.value)}
                  />

                  <AnimatePresence>
                    {showSuccess && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="text-xs text-blue-dark font-bold"
                      >
                        Added to waitlist!
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <Button
                    type="submit"
                    size="sm"
                    className="w-full rounded-lg bg-blue-dark hover:bg-[#153343] text-white font-semibold uppercase text-xs tracking-widest"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Joining..." : "Join List"}
                  </Button>
                </form>
              </Card>
            </section>

            <section className={activeTab !== "applications" ? "hidden" : ""}>
              <h2 className="text-xl font-bold text-ink mb-4 flex items-center gap-2">
                <Star className="text-amber-dark w-5 h-5 fill-yellow-500" />
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
                      <Card className="p-4 hover:border-blue-dark/20">
                        <h4 className="font-bold text-ink text-sm group-hover:text-blue-dark transition-colors line-clamp-1">
                          {opp.title}
                        </h4>
                      </Card>
                    </Link>
                  ))
                ) : (
                  <p className="text-xs text-ink-soft italic">
                    No saved posts.
                  </p>
                )}
              </div>
            </section>
            </div>
          </motion.div>
          )} 
                {activeTab === "leaderboard" && (
                  <LeaderboardTab leaderboard={leaderboard} studentProfile={studentProfile} loadError={leaderboardError} />
                )}
          {activeTab === "settings" && (
            <SettingsTab
              studentProfile={studentProfile}
              userProfile={userProfile}
              user={user}
              isDemoMode={isDemoMode}
              onToggleCompetitiveness={handleToggleCompetitiveness}
              onToggleAnonymity={handleToggleAnonymity}
              onToggle2FA={handleToggle2FA}
            />
          )}
      </AnimatePresence>

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
        <div
          ref={ratingDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Rate this organization"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
        >
          <div className="w-full max-w-md bg-white p-8 space-y-5 relative">
            <button onClick={() => { setRatingApp(null); setRatingError(""); }} className="absolute top-4 right-4 text-ink-muted hover:text-ink-soft">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-ink">Rate your experience</h3>
            <p className="text-sm text-ink-soft">{ratingApp.opportunityTitle || ratingApp.orgName || 'Organization'}</p>
            {ratingError && (
              <div role="alert" aria-live="assertive" className="bg-red-50 text-red-700 p-3 text-[13px] border border-red-200 leading-relaxed">
                {ratingError}
              </div>
            )}
            <div className="flex gap-1 py-2">
              {/* A screen reader announced five identical unnamed buttons, and the
                  chosen value was carried by fill colour alone. aria-pressed is what
                  conveys the current rating without sight; min-w/h takes the target
                  from 24px to the 44px guideline. */}
              {[1, 2, 3, 4, 5].map(s => (
                <button
                  key={s}
                  onClick={() => setRatingStars(s)}
                  aria-label={`${s} star${s === 1 ? '' : 's'}`}
                  aria-pressed={s <= ratingStars}
                  className="p-1 min-w-[44px] min-h-[44px] flex items-center justify-center transition-transform hover:scale-110"
                >
                  <Star aria-hidden="true" className={cn("w-8 h-8", s <= ratingStars ? "fill-amber-400 text-amber-400" : "text-ink-muted")} />
                </button>
              ))}
            </div>
            <textarea
              value={ratingComment}
              onChange={e => setRatingComment(e.target.value)}
              placeholder="Optional: share your experience (500 char max)"
              maxLength={500}
              className="w-full h-24 p-3 border border-line text-sm resize-none focus:outline-none focus:border-blue-dark"
            />
            <button
              onClick={handleSubmitRating}
              disabled={ratingStars < 1 || isSubmittingRating}
              className="w-full h-11 bg-blue-dark text-white text-xs font-semibold tracking-wide disabled:opacity-50 hover:bg-[#153343] transition-colors"
            >
              {isSubmittingRating ? 'Submitting...' : 'Submit Rating'}
            </button>
          </div>
        </div>
      )}

      {showLogForm && (
        <div
          ref={logFormDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Log volunteer hours"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
        >
          <Card className="w-full max-w-lg rounded-lg border-none p-8 bg-white space-y-6 relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => {
                setShowLogForm(false);
                setLogError("");
              }}
              aria-label="Close request hours form"
              className="absolute top-6 right-6 p-2 text-ink-soft hover:text-ink-soft rounded-lg hover:bg-paper-2 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="space-y-2">
              <span className="text-xs font-semibold tracking-wide text-ink-soft bg-paper-3 px-3 py-1 rounded-lg border border-line">
                Official Involvement Request
              </span>
              <CardTitle className="text-2xl font-bold text-ink tracking-tight">Request Hours Verification</CardTitle>
              <p className="text-xs text-ink-soft font-semibold leading-relaxed">
                Fill in the details below. We will send an automatic email notification directly to your supervisor's email coordinates to authorize these hours.
              </p>
              
              {/* Disclaimer box */}
              <div className="bg-amber/10 border-2 border-dashed border-amber p-4 rounded-lg space-y-2 mt-4">
                <h3 className="text-amber-950 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span>⚠️</span> REQUIREMENT DISCLAIMER
                </h3>
                <p className="text-[13px] text-amber-950 leading-relaxed font-bold">
                  <strong className="text-[15px]">You still need your school's own community involvement form, signed by your supervisor.</strong>
                </p>
                <p className="text-[12px] text-amber-900 leading-relaxed font-semibold mt-2">
                  These hours are tracked here for your own progress and your
                  leaderboard position. This is <strong>not</strong> an official record
                  and no school board accepts it in place of their form.
                </p>
              </div>
            </div>

            {logError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-bold ">
                {logError}
              </div>
            )}

            <form onSubmit={handleLogSubmit} className="space-y-4">
              {applications.length > 0 && (
                <div className="p-3.5 bg-paper-2 border border-line rounded-lg space-y-1 text-ink animate-fadeIn ">
                  <p className="text-xs font-semibold tracking-wide flex items-center gap-1.5 text-ink-soft">
                    Highlighted Most Recent Volunteering
                  </p>
                  <p className="text-xs font-semibold text-ink">
                    {applications[0].opportunityTitle || "Volunteer Session"}
                  </p>
                  <p className="text-xs text-ink-soft font-semibold leading-relaxed">
                    Select this option in the dropdown below to automatically pre-fill your supervisor email and coordinate approval.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-soft tracking-wide ml-1">Select Previous Volunteer Role</label>
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
                  className="w-full rounded-lg h-11 border border-line bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-blue-dark font-bold text-ink-soft cursor-pointer "
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
                        className={isMostRecent ? "text-indigo-600 bg-indigo-50 font-semibold" : "text-ink"}
                      >
                        {isMostRecent ? "[MOST RECENT] " : ""}
                        {app.opportunityTitle || "Volunteer Session"}{orgDisplay}{dateDisplay}
                      </option>
                    );
                  })}
                  <option value="custom" className="font-bold text-amber-700">Other / Unlisted Custom Activity Name...</option>
                </select>
              </div>

              {(!selectedVolunteeringId || selectedVolunteeringId === "custom") ? (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-soft tracking-wide ml-1">Select Registered Volunteer Site / Organization</label>
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
                      className="w-full rounded-lg h-11 border border-line bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-blue-dark font-bold text-ink-soft cursor-pointer mb-4"
                    >
                      <option value="">-- Choose verified partner (Auto-Fills info) --</option>
                      {allOrganizations.map((org) => (
                        <option key={org.id} value={org.id} className="text-ink">
                          🛡️ {org.organizationName}
                        </option>
                      ))}
                      <option value="custom" className="font-bold text-amber-700">Other / Unlisted Organization (Enter Manually)...</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-soft tracking-wide ml-1">Activity Name / Event</label>
                    <Input 
                      value={logActivity}
                      onChange={(e) => setLogActivity(e.target.value)}
                      placeholder="e.g. Teen Tech Tutoring Session"
                      className="rounded-lg h-11 border-line text-sm font-medium"
                      required
                    />
                  </div>

                  {(!selectedPartnerId || selectedPartnerId === "custom") && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-soft tracking-wide ml-1">Community Organization Name</label>
                      <Input 
                        value={logOrg}
                        onChange={(e) => setLogOrg(e.target.value)}
                        placeholder="e.g. North York Public Library"
                        className="rounded-lg h-11 border-line text-sm font-medium"
                        required
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="p-3.5 bg-blue-dark/5 border border-blue-dark/20 rounded-lg space-y-1.5 animate-fadeIn">
                  <p className="text-xs font-semibold uppercase text-blue-900 tracking-wider flex items-center gap-1">
                    🇨🇦 Pre-selected Match Verified
                  </p>
                  <p className="text-xs font-semibold text-ink">
                    Activity: {logActivity}
                  </p>
                  <p className="text-xs text-ink-soft font-semibold">
                    Hosted by: <span className="text-ink font-bold">{logOrg}</span>
                  </p>
                  <p className="text-xs text-blue-800 leading-normal font-medium">
                    Organization contact email was automatically mapped to <span className="font-bold">{logContact}</span>.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink-soft tracking-wide ml-1">Volunteer Hours</label>
                  <Input 
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={logHours}
                    onChange={(e) => setLogHours(e.target.value)}
                    placeholder="e.g. 4.5"
                    className="rounded-lg h-11 border-line text-sm font-bold"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink-soft tracking-wide ml-1">Service Date</label>
                  <Input 
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="rounded-lg h-11 border-line text-sm font-semibold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink-soft tracking-wide ml-1">Coordinator Name</label>
                  <Input 
                    value={logCoordinator}
                    onChange={(e) => setLogCoordinator(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    className="rounded-lg h-11 border-line text-sm font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink-soft tracking-wide ml-1">Coordinator Email</label>
                  <Input 
                    type="email"
                    value={logContact}
                    onChange={(e) => setLogContact(e.target.value)}
                    placeholder="jane.doe@organization.org"
                    className="rounded-lg h-11 border-line text-sm font-medium"
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
                  className="w-1/2 h-12 rounded-lg font-bold uppercase text-xs tracking-widest text-ink-soft border border-line cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isLoading={isLogging}
                  className="w-1/2 h-12 bg-blue-dark hover:bg-blue-dark text-white font-semibold uppercase text-xs tracking-widest rounded-lg shadow-blue-100 cursor-pointer"
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
          message="Your hours request was submitted and we emailed your coordinator for verification."
          note={
            <div className="space-y-2">
              <p className="text-[11px] leading-relaxed text-amber-800 font-semibold bg-amber/10 border border-amber/40 rounded-lg p-2.5">
                ⚠️ These hours do NOT count toward your total yet. They are
                added only after your coordinator approves the request — track
                the status under Submitted Claims.
              </p>
              <EmailDeliveryNote who="your coordinator's" />
            </div>
          }
          onClose={() => setLogSuccess(false)}
        />
      )}
      {showPrintModal && (
        <div
          data-print-root
          ref={printDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Your community involvement hours"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 overflow-y-auto animate-fadeIn"
        >
          <Card data-print-sheet className="w-full max-w-4xl bg-white border border-line/80 rounded-lg p-6 md:p-10 space-y-8 relative overflow-hidden my-8 text-ink">
            <button
              onClick={() => setShowPrintModal(false)}
              aria-label="Close transcript modal"
              className="absolute top-5 right-5 text-ink-soft hover:text-ink-soft bg-paper-2 hover:bg-paper-3 p-2.5 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            {/* Certificate Header */}
            <div className="border-b-4 border-blue-dark pb-5 text-center sm:text-left">
              <h2 className="text-xl md:text-2xl font-semibold text-ink uppercase tracking-tight">Community Involvement Hours — Personal Record</h2>
              <p className="text-xs text-ink-soft mt-1">A summary of hours confirmed on Volunteer North York. Not an official school document.</p>
            </div>

            {/* Student Info Box */}
            <div className="bg-paper-2/70 border border-line p-6 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div><strong>Student Name:</strong> <span className="text-ink font-bold">{studentProfile?.fullName || "Alex Volunteer"}</span></div>
              <div><strong>Academic School:</strong> <span className="text-ink font-bold">{studentProfile?.school || "Toronto Secondary"}</span></div>
              <div><strong>Grade:</strong> <span className="text-ink font-bold">Grade {studentProfile?.grade || "11"}</span></div>
              <div><strong>Toronto Neighborhood:</strong> <span className="text-ink font-bold">{studentProfile?.neighborhood || "North York"}</span></div>
            </div>

            {/* List Of Hours */}
            <div className="overflow-x-auto border border-line rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white uppercase text-xs tracking-wider">
                    <th className="p-4 font-semibold">Activity Description</th>
                    <th className="p-4 font-semibold text-center">Hours</th>
                    <th className="p-4 font-semibold">Completion Date</th>
                    <th className="p-4 font-semibold">Supervisor Details</th>
                    <th className="p-4 font-semibold text-right">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loggedHoursList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-ink-soft italic">No volunteer hours logged in your tracking list yet.</td>
                    </tr>
                  ) : (
                    loggedHoursList.map((lh, idx) => (
                      <tr key={idx} className="hover:bg-paper-2/30">
                        <td className="p-4 font-bold text-ink">{lh.activity}</td>
                        <td className="p-4 font-semibold text-blue-dark text-center">{lh.hours} hrs</td>
                        <td className="p-4 text-ink-soft ">{lh.date}</td>
                        <td className="p-4 text-ink-soft">{lh.coordinatorName} ({lh.coordinatorContact})</td>
                        <td className="p-4 text-right text-emerald-600 font-semibold tracking-wide uppercase text-xs">Verified Check</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="text-right text-sm md:text-base font-semibold text-ink flex justify-end gap-2 items-center">
              Total Community Involvement Hours Logged: 
              <span className="text-blue-dark text-lg md:text-xl font-semibold">{totalCompletedHours} / {hourGoal} hrs</span>
            </div>

            {/* Signatures boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-6 border-t border-line">
              <div className="border-t border-line pt-3 text-center text-xs text-ink-soft font-semibold uppercase tracking-wider">
                Supervisor Signature & Stamp
              </div>
              <div className="border-t border-line pt-3 text-center text-xs text-ink-soft font-semibold uppercase tracking-wider">
                Guidance Counselor Approval Date
              </div>
            </div>

            {/* Sticky Actions */}
            <div data-print-hide className="flex gap-3 justify-end pt-4">
              <Button
                variant="outline"
                className="px-5 h-11 text-xs uppercase text-ink-soft font-semibold hover:bg-paper-3 rounded-lg"
                onClick={() => setShowPrintModal(false)}
              >
                Close Certificate
              </Button>
              <Button
                className="px-5 h-11 text-xs uppercase bg-blue-dark hover:bg-blue-dark font-semibold text-white rounded-lg cursor-pointer flex items-center gap-1.5"
                onClick={() => window.print()}
              >
                <Printer className="w-4 h-4" /> Print Document
              </Button>
            </div>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
