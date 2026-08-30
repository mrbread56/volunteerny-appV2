import { useDialog } from '../hooks/useDialog';
import { isMfaClaimCurrent } from '../lib/mfa';
import React, { useState, useEffect } from "react";
import { API_BASE_URL } from '../lib/config';
import { getMatchScore as scoreOpportunity } from '../lib/matchScore';
import { buildCertificateHtml } from './studentDashboard/certificate';
import LeaderboardTab from './studentDashboard/LeaderboardTab';
import SettingsTab from './studentDashboard/SettingsTab';
import { useAuth } from "../contexts/AuthContext";
import SuccessAnimation from "../components/SuccessAnimation";
import EmailDeliveryNote from "../components/ui/EmailDeliveryNote";
import { db } from "../firebase/config";
import { subscribeToScalableLeaderboard, requestLeaderboardRebuild } from "../lib/scalableLeaderboard";
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
  ListPlus,
  X,
  Trophy,
  Settings,
  Printer,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { OPPORTUNITY_CATEGORIES } from "../constants";
// CalendarView was imported here but never rendered. As a static import it was
// still bundled into this chunk (~36 KB of dead weight). Re-add the import when
// the calendar tab actually ships.
import ReceiptModal from "../components/ReceiptModal";
import { sendTransactionalEmail } from "../lib/emailService";
import { Award, Zap, BookOpen, Briefcase, Heart, ShieldCheck } from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";
import { reportError } from '../lib/errors';
import { useStudentDashboardData } from '../hooks/useStudentDashboardData';
import ApplicationsTab from './studentDashboard/ApplicationsTab';
import HoursTracker from './studentDashboard/HoursTracker';

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
  } = useStudentDashboardData(user, studentProfile, isDemoMode, profilesLoaded);
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
    Record<string, { email: string; uid?: string; phone?: string; website?: string; organizationName?: string }>
  >({});
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  // The passcode gate is not switched on until a code has actually arrived.
  const [twoFaStage, setTwoFaStage] = useState<"idle" | "sending" | "awaiting" | "verifying">("idle");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaError, setTwoFaError] = useState<string | null>(null);

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
  /*
   * The organisation's uid, carried so the request can be routed by identity.
   *
   * coordinatorContact alone was not enough. It is prefilled from the
   * organisation's PUBLIC contact address, and OrgProfile invites them to make
   * that different from their login address ("Public Contact Email", a required
   * field). The organisation's queue, the notification bell and the rules all
   * match on the LOGIN address. The moment those diverge every hours request to
   * that organisation becomes invisible to them, with no error on either side:
   * the student is told it was submitted, the coordinator sees an empty queue,
   * and the hours never reach the record. A uid cannot drift.
   */
  const [logOrgUid, setLogOrgUid] = useState<string | null>(null);
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
          details: `${studentProfile?.fullName || "A student"} has asked you to confirm the ${req.hours} hours they logged for "${req.activity}" on ${req.date}. Confirming here needs a Volunteer North York organization account, which our team reviews before it is approved. If you would rather not create one, signing the student's school board form directly works just as well.`,
          actionLabel: "Create an organization account",
          actionUrl: `${window.location.origin}/signup`
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
  /*
   * Has the board actually answered yet?
   *
   * There was no third state: leaderboard starts [] and arrives over an
   * onSnapshot, so for the length of one Firestore round trip -- longer on a
   * phone or a cold connection -- every student was told "No verified hours
   * have been ranked yet", with the podium reading --- and -- underneath, which
   * looks like confirmation rather than like loading.
   */
  const [leaderboardReady, setLeaderboardReady] = useState(false);

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
      // No invented identity on a record a coordinator has to recognise. This
      // was `|| "Alex Volunteer"` and `|| "student@example.com"`, so a student
      // with no saved profile name arrived in the queue as a fictional person
      // at a sandbox address, and the confirmation mail went nowhere.
      studentName: studentProfile?.fullName || user.displayName || "",
      studentEmail: user.email || "",
      activity: logActivity,
      organization: logOrg,
      hours: parsedHours,
      date: logDate,
      // No literal. certificate.ts prints this under "Coordinator Supervisor
      // Details" on the transcript a student hands to a guidance office, and the
      // form does not require the field — so leaving it blank produced a
      // supervisor named "Supervisor" on an official-looking record. Same rule
      // as the receipt and the certificate: an empty cell is honest.
      coordinatorName: logCoordinator || "",
      coordinatorContact: normalizedContact,
      // Present whenever the request came from a real placement; absent for the
      // "Other / Unlisted" branch, which has no organisation account behind it.
      ...(logOrgUid ? { orgId: logOrgUid } : {}),
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
          details: `${studentProfile?.fullName || "A student"} submitted ${parsedHours} hours for "${logActivity}" on ${logDate} and has asked you to confirm them. Confirming here needs a Volunteer North York organization account, which our team reviews before it is approved. If you would rather not create one, signing the student's school board form directly works just as well.`,
          // /org/dashboard is organization-only, so a coordinator at an
          // unregistered organisation hit a login wall and the hours sat
          // pending forever. The server rebuilds this copy before sending;
          // these two are kept in step with it.
          actionLabel: "Create an organization account",
          actionUrl: `${window.location.origin}/signup`
        }
      }).catch(err => console.error("Could not send hours verification email:", err));
    } catch (err: any) {
      // reportError, like the two other catches in this file. Raw, this printed
      // "Missing or insufficient permissions." to a Grade 10 student on the one
      // screen that produces their graduation record, with nothing telling them
      // to retry.
      setLogError(reportError('submit hours request', err, "We couldn't send that request. Please try again."));
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
    const newVal = !(studentProfile?.trackerEnabled ?? false);
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
    /*
     * One dialog doing both jobs. Cancel means "do not withdraw", OK means
     * withdraw with whatever was typed, including nothing. A separate confirm
     * followed by a separate reason box is two interruptions for one decision.
     */
    const reason = window.prompt(
      `Withdraw your application for "${app.opportunityTitle || 'this opportunity'}"?

` +
      `You can apply again afterwards. If you want, say why — it is sent to the ` +
      `organization so they know. Leave it blank to withdraw without a reason.`,
      '',
    );
    if (reason === null) return; // cancelled
    setWithdrawingId(app.id);
    try {
      if (isDemoMode) {
        const stored = JSON.parse(localStorage.getItem("demo_applications") || "[]");
        localStorage.setItem("demo_applications", JSON.stringify(
          stored.filter((a: any) => a.id !== app.id),
        ));
      } else {
        /*
         * Tell the organization BEFORE the delete, not after.
         *
         * Withdrawal deletes the application (see the note above on why a
         * tombstone would trap the student), so once it is gone there is
         * nothing left to describe: not the posting title, not who applied.
         * Sending first is the only ordering where the message can be built at
         * all.
         *
         * Awaited rather than fired and forgotten, for the same reason. The
         * delete would otherwise race the read of the organization document
         * and win. A failure here must NOT block the withdrawal though — the
         * student asked to leave, and an unreachable mailbox is not a reason to
         * keep them attached to a placement.
         */
        try {
          const orgId = app.orgId || (await getDoc(doc(db, "opportunities", app.opportunityId))).data()?.orgId;
          if (orgId) {
            const orgSnap = await getDoc(doc(db, "organizations", orgId));
            const org: any = orgSnap.exists() ? orgSnap.data() : null;
            if (org?.contactEmail) {
              /*
       * The RESOLVED value is checked. sendTransactionalEmail never rejects —
       * its catch RETURNS { success: false }, and so does every non-2xx — so
       * the surrounding try/catch could not see this fail. Telling the
       * organisation an applicant has withdrawn is the entire point of this
       * feature; without the check it failed in complete silence and the
       * application was deleted anyway.
       */
      const withdrawMail = await sendTransactionalEmail({
                to: org.contactEmail,
                subject: `An applicant withdrew from "${app.opportunityTitle || 'your posting'}"`,
                templateName: 'applicant_withdrew',
                templateData: {
                  orgName: org.organizationName || 'your organization',
                  applicantName: studentProfile?.fullName || user.displayName || 'A student',
                  oppTitle: app.opportunityTitle || 'your posting',
                  reason: reason.trim() || undefined,
                },
              });
              if (!withdrawMail.success) {
                // Recorded where an operator can see it. The withdrawal itself
                // still goes ahead below — refusing to let a student withdraw
                // because we could not send a courtesy email would be worse.
                reportError(
                  'tell an organization an applicant withdrew',
                  new Error(withdrawMail.error || 'send failed'),
                );
              }
            }
          }
        } catch (notifyErr) {
          console.error('Could not tell the organization about a withdrawal:', notifyErr);
        }

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

  /*
   * Turning the passcode gate ON now costs a code the student has actually
   * received, which is what the panel beside it has always promised.
   *
   * It used to write twoFactorEnabled and refresh, nothing else. The copy said
   * "Turning this on asks for a code right away, so you can confirm you can
   * receive it before your account starts depending on it." Nothing asked, and
   * nothing was confirmed.
   *
   * That gap is the whole risk. Students default to the gate OFF, so only
   * someone who deliberately opts in is exposed, and they find out whether mail
   * reaches them at their NEXT sign-in, when they are already standing behind
   * /mfa. Recovery codes, which exist and would rescue them, render only in
   * OrgProfile: a locked-out student has no route back to their own hours
   * record at all. We have already watched a real organisation fail to receive
   * a password reset from this project, so "the address on file works" is not
   * an assumption worth betting a graduation record on.
   *
   * Turning it OFF is deliberately unguarded. Requiring a code to REMOVE a
   * protection is how someone who cannot receive codes stays trapped by it.
   */
  const handleToggle2FA = async () => {
    if (!user) return;
    const newVal = !(userProfile?.twoFactorEnabled ?? false);
    if (isDemoMode) {
      localStorage.setItem("demo_2fa_enabled", newVal ? "true" : "false");
      await refreshProfile();
      return;
    }

    if (!newVal) {
      try {
        await updateDoc(doc(db, "users", user.uid), { twoFactorEnabled: false });
        setTwoFaStage("idle");
        setTwoFaCode("");
        setTwoFaError(null);
        await refreshProfile();
      } catch (err) {
        console.error("Error turning two-factor off", err);
        setErrorMessage("Couldn't turn off two-factor authentication. Please try again.");
      }
      return;
    }

    setTwoFaError(null);
    setTwoFaStage("sending");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "We could not send a code.");
      setTwoFaStage("awaiting");
    } catch (err: any) {
      // The flag is untouched, which is the point: a student who cannot be
      // reached does not end up behind a gate they cannot pass.
      setTwoFaStage("idle");
      setTwoFaError(
        err?.message ||
          "We could not send a test code to your email, so the passcode gate was left off."
      );
    }
  };

  /** The code came back, so the address demonstrably works. Now enable it. */
  const handleConfirm2FA = async () => {
    if (!user) return;
    const code = twoFaCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setTwoFaError("Enter the 6-digit code from your email.");
      return;
    }
    setTwoFaError(null);
    setTwoFaStage("verifying");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "That code was not accepted.");

      /*
       * Pick up the claim BEFORE the flag, or the student is thrown off this
       * page the instant they succeed.
       *
       * verify-otp writes mfaVerified/mfaVerifiedFor onto the Auth user record,
       * not onto the token already in this browser. refreshProfile() touches no
       * token. So writing twoFactorEnabled first re-renders the guard with
       * "2FA required" true and "2FA satisfied" still false, and PrivateRoute
       * redirects to /mfa — demanding a second code seconds after the first,
       * from a student whose RecoveryCodes panel is on the page they were just
       * ejected from, and whose OTP send budget is five per ten minutes.
       *
       * Same poll as MfaChallenge, and for the reason its comment gives: a
       * freshly written claim is not always visible on the first forced
       * refresh.
       */
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const refreshed = await user.getIdTokenResult(true);
          if (isMfaClaimCurrent(refreshed)) break;
        } catch (refreshErr) {
          console.warn("Token refresh failed while enabling the passcode gate:", refreshErr);
        }
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }

      await updateDoc(doc(db, "users", user.uid), { twoFactorEnabled: true });
      setTwoFaStage("idle");
      setTwoFaCode("");
      // No banner needed: the status chip beside the switch flips to
      // "Shield Enabled" the moment the profile refreshes.
      await refreshProfile();
    } catch (err: any) {
      setTwoFaStage("awaiting");
      setTwoFaError(err?.message || "That code was not accepted. Please check and try again.");
    }
  };

  const handleCancel2FA = () => {
    setTwoFaStage("idle");
    setTwoFaCode("");
    setTwoFaError(null);
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
      } catch (err) {
        // Not console-only. existingRatings is the SOLE gate on the Rate
        // button, so a failed read leaves it {} and every accepted placement
        // offers Rate again, including ones the student already reviewed. They
        // write a second review and it overwrites the first, with nothing
        // anywhere saying the list simply did not load.
        console.error('Failed to load existing ratings:', err);
        setErrorMessage(reportError(
          'load your ratings',
          err,
          "We couldn't load which placements you have already rated, so you may be offered one twice. Please refresh.",
        ));
      }
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
        if (studentProfile?.trackerEnabled ?? false) {
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
          setLeaderboardReady(true);
        } else {
          setLeaderboard(demoPeers);
          setLeaderboardReady(true);
        }
        setLeaderboardError(false);
        return;
      }

      try {
        unsubscribe = subscribeToScalableLeaderboard(
          (entries) => {
            let mapped = entries.map((entry, i) => ({
              // Anonymous rows carry userId: null, so they need a synthetic key
              // for React. Rank position is stable within one snapshot, which is
              // all a key has to be.
              id: entry.userId || `anon-${i}`,
              name: entry.name,
              hours: entry.score,
              // Guard the null: `null === undefined` is false, but a signed-out
              // viewer has user?.uid undefined and two nulls would match.
              isSelf: !!entry.userId && entry.userId === user?.uid,
            }));

            const hasSelf = mapped.some((item) => item.isSelf);
            /*
             * An anonymous student carries userId: null on the public board —
             * that is what makes it anonymous — so isSelf can never match them
             * and the append below would list them a second time, once in rank
             * order and once at the bottom, both reading "Anonymous Student".
             * Their own score is the only handle left, which is the price of
             * not publishing an identifier anyone can join on.
             */
            /*
             * Only when the score identifies exactly ONE row.
             *
             * `some` claimed any anonymous row with a matching total, and totals
             * collide constantly — 10, 20 and 40 are the numbers this product
             * drives everyone toward. Two anonymous students on 12.5 hours, one
             * ranked third and one outside the top 100: the second loaded their
             * dashboard, matched the first student's row, was dropped from the
             * append, and read a stranger's rank as their own.
             *
             * When the score is ambiguous we cannot tell, so we do not guess:
             * the student is appended as themselves. The ranked rows stay
             * anonymous either way. Showing someone their own total at the
             * bottom is a smaller wrong than showing them someone else's rank.
             *
             * The complete fix is an opaque per-student token published on the
             * anonymous row and mirrored into students/{uid} — an identifier
             * only its owner can match. That needs a server change and a
             * backfill; this removes the false identification today.
             */
            const anonScoreMatches = (studentProfile?.trackerAnonymous ?? false)
              ? entries.filter((e) => !e.userId && Math.abs(Number(e.score) - totalCompletedHours) < 0.01)
              : [];
            const anonSelfAlreadyRanked = anonScoreMatches.length === 1;

            if (!hasSelf && !anonSelfAlreadyRanked && (studentProfile?.trackerEnabled ?? false)) {
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
            setLeaderboardReady(true);
            setLeaderboardError(false);
          },
          (err) => {
            // A failed read must render as a failure, not as four invented
            // students. Same principle as the demo-hours fixtures removed in
            // B17: these are graduation records and a public ranking.
            console.error("Scalable leaderboard read failed:", err);
            setLeaderboard([]);
            setLeaderboardReady(true);
            setLeaderboardError(true);
          }
        );
      } catch (err) {
        console.error("Error subscribing to scalable leaderboard:", err);
        setLeaderboard([]);
        setLeaderboardReady(true);
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
        { email: string; uid?: string; phone?: string; website?: string; organizationName?: string }
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
              // The identity, so an hours request can be routed to the account
              // rather than to whatever address the profile currently shows.
              uid: orgId,
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
            <ApplicationsTab
              hidden={activeTab !== "applications"}
              applications={applications}
              orgContacts={orgContacts}
              existingRatings={existingRatings}
              withdrawingId={withdrawingId}
              onWithdraw={handleWithdrawApplication}
              onOpenReceipt={(app) => {
                // The receipt shows the student's identity, which the tab does
                // not hold — enrich here, where the profile lives.
                /* Omitted, not invented.
                 *
                 * These were `|| "Alex Volunteer"`, `|| "York Region College"`
                 * and `|| "12"`. ReceiptModal already guards school and grade
                 * and renders them only when present -- and these fallbacks
                 * made them ALWAYS present, so the guard never fired and the
                 * receipt stated that the student attends a college they have
                 * never heard of, in a grade nobody entered. That is invented
                 * identity data on a document a student forwards to a guidance
                 * office. An empty row is honest; a wrong row is not. */
                setSelectedReceiptApp({
                  ...app,
                  studentName: studentProfile?.fullName || user?.displayName || "",
                  studentEmail: user?.email || "",
                  studentSchool: studentProfile?.school || "",
                  studentGrade: studentProfile?.grade || "",
                });
                setShowReceiptModal(true);
              }}
              onStartRating={(app) => {
                setRatingApp(app);
                setRatingStars(0);
                setRatingComment("");
                setRatingError("");
              }}
            />

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
            <HoursTracker
              hidden={activeTab === "applications"}
              totalCompletedHours={totalCompletedHours}
              pendingHourCount={pendingHourCount}
              hoursRequests={hoursRequests}
              sendingReminderId={sendingReminderId}
              reminderSuccessId={reminderSuccessId}
              onOpenLogForm={() => setShowLogForm(true)}
              onSendReminder={handleSendReminder}
              onPrintCertificate={handlePrintCertificate}
            />

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
                  <LeaderboardTab leaderboard={leaderboard} studentProfile={studentProfile} loadError={leaderboardError} isReady={leaderboardReady} />
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
              twoFaStage={twoFaStage}
              twoFaCode={twoFaCode}
              twoFaError={twoFaError}
              onTwoFaCodeChange={setTwoFaCode}
              onConfirm2FA={handleConfirm2FA}
              onCancel2FA={handleCancel2FA}
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
          /* Was the literal string "York Region Community Partner", an
             organisation that does not exist, printed on every receipt and sent
             in the confirmation email. The real name is on the application, or
             on the organisation document the dashboard already loads. */
          organizationName={
            (selectedReceiptApp as any)?.organizationName ||
            (selectedReceiptApp as any)?.orgName ||
            (allOrganizations || []).find((o: any) => (o.uid ?? o.id) === (selectedReceiptApp as any)?.orgId)?.organizationName ||
            'the organization'
          }
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
            {/* Placeholder-only, so a screen reader announced "edit text, blank".
                A placeholder is not a label: it disappears the moment you type. */}
            <textarea
              aria-label="Share your experience with this organization (optional)"
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
                      aria-label="Select Previous Volunteer Role"
                  value={selectedVolunteeringId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedVolunteeringId(val);
                    if (val === "custom" || !val) {
                      setLogActivity("");
                      setLogOrg("");
                      setLogContact("");
                      setLogOrgUid(null);
                    } else {
                      const app = applications.find(a => a.id === val);
                      if (app) {
                        setLogActivity(app.opportunityTitle || "");
                        /*
                         * No invented organisation. This was
                         * `|| "Canada Mutual Aid Partner"`, and orgContacts is
                         * populated by a fetch whose every failure path is
                         * swallowed — so when that read failed the student's
                         * hours request was filed against a fictional charity,
                         * with a blank coordinator address and NO orgId, which
                         * is the field that routes it to a queue. It could
                         * never be approved by anyone, and the student was told
                         * it had been submitted.
                         *
                         * Leaving it blank makes the required field visibly
                         * empty, which is the truth: we do not know.
                         */
                        const contact = orgContacts[app.opportunityId];
                        setLogOrg(contact?.organizationName || "");
                        setLogContact(contact?.email || "");
                        setLogOrgUid(contact?.uid || null);
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
                      aria-label="Select Registered Volunteer Site / Organization"
                      value={selectedPartnerId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedPartnerId(val);
                        if (val === "custom" || !val) {
                          setLogOrg("");
                          setLogContact("");
                          setLogCoordinator("");
                          setLogOrgUid(null);
                        } else {
                          const org = allOrganizations.find(o => o.id === val);
                          if (org) {
                            setLogOrg(org.organizationName || "");
                            setLogContact(org.contactEmail || org.email || "");
                            /*
                             * The uid, so the request can be routed by identity.
                             *
                             * orgId was added to hoursRequests precisely so a claim
                             * would still reach an organisation after it changed its
                             * public contact address, and it was wired only to the
                             * OTHER dropdown — the one fed from organisations the
                             * student already has an application with, which is the
                             * case /api/hours/approve already authorises by the
                             * application itself.
                             *
                             * This dropdown is the only route for hours volunteered
                             * outside a posted opportunity, which is the case orgId
                             * was for. Without it the request carried only
                             * coordinatorContact, prefilled from the organisation's
                             * PUBLIC address, while OrgDashboard queries orgId or the
                             * LOGIN address — so the claim was invisible in the
                             * organisation's queue and in both notification bells, with
                             * no error anywhere.
                             */
                            setLogOrgUid(org.id);
                            // No literal. `contactName` is in NO organizations allowlist and exists in
                        // this repo only in demo fixtures, so in production it is always
                        // undefined and "Site Supervisor" was always what landed in the
                        // field, then in coordinatorName, then on the printed transcript
                        // under "Coordinator Supervisor Details". Changing the write to
                        // `|| ""` guarded a field that was already poisoned here.
                        setLogCoordinator((org as any).contactName || "");
                          }
                        }
                      }}
                      className="w-full rounded-lg h-11 border border-line bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-blue-dark font-bold text-ink-soft cursor-pointer mb-4"
                    >
                      <option value="">-- Choose an organisation (fills in their contact details) --</option>
                      {allOrganizations.map((org) => (
                        <option key={org.id} value={org.id} className="text-ink">
                          {org.organizationName}
                        </option>
                      ))}
                      <option value="custom" className="font-bold text-amber-700">Other / Unlisted Organization (Enter Manually)...</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-soft tracking-wide ml-1">Activity Name / Event</label>
                    <Input
                      aria-label="Activity Name / Event" 
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
                      aria-label="Community Organization Name" 
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
                      aria-label="Volunteer Hours" 
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
                      aria-label="Service Date" 
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
                      aria-label="Coordinator Name" 
                    value={logCoordinator}
                    onChange={(e) => setLogCoordinator(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    className="rounded-lg h-11 border-line text-sm font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink-soft tracking-wide ml-1">Coordinator Email</label>
                  <Input
                      aria-label="Coordinator Email" 
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
      {/* "we emailed your coordinator" was asserted BEFORE the send, and the
          send is fire-and-forget with a console-only catch. The demo branch
          sets the same success flag and deliberately sends nothing. This file
          already fixed the identical pattern on the reminder button, which used
          to claim a coordinator had been reminded when nothing went out. Claim
          the submission, which is true; point at the reminder for the part that
          might not have happened. */}
      {logSuccess && (
        <SuccessAnimation
          message="Your hours request was submitted. We are asking your coordinator to confirm it. If you do not hear back, send a reminder from Submitted Claims."
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
              <h2 className="text-xl md:text-2xl font-semibold text-ink uppercase tracking-tight">Community Involvement Hours: Personal Record</h2>
              <p className="text-xs text-ink-soft mt-1">A summary of hours confirmed on Volunteer North York. Not an official school document.</p>
            </div>

            {/*
              * Student Info Box — no invented identity, same rule as the
              * receipt above and as certificate.ts.
              *
              * These were `|| "Toronto Secondary"`, `|| "11"` and
              * `|| "North York"`. This is the sheet a student gets when the
              * print popup is BLOCKED, which is the normal case on mobile Safari
              * and on a school-managed browser — and it carries "Supervisor
              * Signature & Stamp" and "Guidance Counselor Approval Date" boxes,
              * so it reads as a signable record. A student handing that to a
              * guidance office was naming a school they have never attended.
              *
              * A row that is left out is honest. A row that is wrong is not.
              */}
            <div className="bg-paper-2/70 border border-line p-6 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div><strong>Student Name:</strong> <span className="text-ink font-bold">{studentProfile?.fullName || "Not set"}</span></div>
              {studentProfile?.school && (
                <div><strong>School:</strong> <span className="text-ink font-bold">{studentProfile.school}</span></div>
              )}
              {studentProfile?.grade && (
                <div><strong>Grade:</strong> <span className="text-ink font-bold">Grade {studentProfile.grade}</span></div>
              )}
              {studentProfile?.neighborhood && (
                <div><strong>Neighbourhood:</strong> <span className="text-ink font-bold">{studentProfile.neighborhood}</span></div>
              )}
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
                        {/* emerald-700, not 600. #009966 on white measures 3.67:1 and this is
                            12px text, so it needed 4.5:1. emerald-700 gives 5.37:1. */}
                        <td className="p-4 text-right text-emerald-700 font-semibold tracking-wide uppercase text-xs">Verified Check</td>
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
