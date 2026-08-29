import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase/config";
import { doc, updateDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Badge } from "../components/ui/Badge";
import { FileUpload } from "../components/ui/FileUpload";
import { deleteOwnAccount } from "../lib/deleteAccount";
import ChangePassword from "../components/ChangePassword";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import {
  UserCheck,
  GraduationCap,
  School,
  FileText,
  Mail,
  Trophy,
  Award,
  Zap,
  BookOpen,
  Briefcase,
  Heart,
  Sparkles,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { cn } from "../lib/utils";
import { TORONTO_SCHOOLS, NEIGHBORHOODS } from "../constants";
import { compressFile, decompressFile } from "../utils/compress";
import { motion } from "motion/react";
import { evaluateBadges } from "../utils/badges";
import { SKILLS, AVAILABILITY, normalizeAvailability } from '../lib/vocabularies';
import { OPPORTUNITY_CATEGORIES as INTERESTS } from '../constants';

const GENDERS = [
  { value: "", label: "Select…" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const GRADES = [
  { value: "9", label: "Grade 9" },
  { value: "10", label: "Grade 10" },
  { value: "11", label: "Grade 11" },
  { value: "12", label: "Grade 12" },
];






export default function StudentProfile() {
  const { user, studentProfile, refreshProfile, isDemoMode, logout } = useAuth();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [fileUploadError, setFileUploadError] = useState("");
  const [fileUploadSuccess, setFileUploadSuccess] = useState("");

  const handleDeleteAccountInput = async () => {
    if (deleteConfirmEmail.toLowerCase() !== user?.email?.toLowerCase()) {
      setDeleteError("Confirmation email does not match your account email.");
      return;
    }

    setDeleteError("");
    setIsDeleting(true);
    try {
      if (user) {
        // Deleted server-side. This used to call deleteDoc on users/{uid} and
        // students/{uid} straight from the browser, which firestore.rules
        // forbids outright (`allow delete: if false` on users, developer-only
        // on students) — so the first call threw, user.delete() below it never
        // ran, and the student was shown a raw permissions error while their
        // account and their uploaded passport scan both survived. The endpoint
        // also clears applications, saved opportunities and hours requests,
        // which the client never attempted at all.
        await deleteOwnAccount(deleteConfirmEmail);
      }
      await logout();
      navigate("/");
    } catch (err: any) {
      console.error("Account deletion failed:", err);
      setDeleteError(err?.message || "We could not delete your account. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Profile Fields
  const [fullName, setFullName] = useState(studentProfile?.fullName || "");
  const [school, setSchool] = useState(studentProfile?.school || "");
  const [grade, setGrade] = useState(studentProfile?.grade || "");
  const [gender, setGender] = useState(studentProfile?.gender || "");
  const [neighborhood, setNeighborhood] = useState(
    studentProfile?.neighborhood || "",
  );
  const [interests, setInterests] = useState<string[]>(
    studentProfile?.interests || [],
  );
  const [skills, setSkills] = useState<string[]>(studentProfile?.skills || []);
  const [availability, setAvailability] = useState<string[]>(
    normalizeAvailability(studentProfile?.availability),
  );
  const [previousExperience, setPreviousExperience] = useState(
    studentProfile?.previousExperience || "",
  );
  const [resumeUrl, setResumeUrl] = useState(
    decompressFile(studentProfile?.resumeUrl || ""),
  );
  // false, matching the server's `trackerEnabled === true` filter and the
  // effect below. The effect only runs `if (studentProfile)`, and AuthContext
  // sets that only on a SUCCESSFUL read with no else — so after a transient
  // students/ read failure this initial value was written straight back on the
  // next save, publishing a student who was never asked. Same consent
  // manufacture the effect four lines down was changed to stop.
  const [trackerEnabled, setTrackerEnabled] = useState(false);
  const [trackerAnonymous, setTrackerAnonymous] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (studentProfile) {
      setFullName(studentProfile.fullName);
      setSchool(studentProfile.school);
      setGrade(studentProfile.grade);
      setGender(studentProfile.gender || "");
      setNeighborhood(studentProfile.neighborhood);
      setInterests(studentProfile.interests);
      setSkills(studentProfile.skills);
      setAvailability(normalizeAvailability(studentProfile.availability));
      setPreviousExperience(studentProfile.previousExperience || "");
      setResumeUrl(decompressFile(studentProfile.resumeUrl || ""));
      // ?? false, matching the server's `trackerEnabled === true` filter.
      // With ?? true this page READ absence as opted-in and then WROTE it back
      // on the next save of anything at all — a resume upload, a school
      // correction — publishing the student's real name and hours on a board
      // readable by every signed-in account. Signup was fixed and this
      // manufactured the consent right back.
      setTrackerEnabled(studentProfile.trackerEnabled ?? false);
      setTrackerAnonymous(studentProfile.trackerAnonymous ?? false);
    }
  }, [studentProfile]);

  const toggleItem = (
    item: string,
    list: string[],
    setList: (l: string[]) => void,
  ) => {
    if (list.includes(item)) {
      setList(list.filter((i) => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // 1. Full name validation
    if (!fullName || !fullName.trim()) {
      newErrors.fullName = "Full name is required.";
    } else if (fullName.trim().length < 2) {
      newErrors.fullName = "Full name must be at least 2 characters long.";
    } else if (!/^[\p{L}\p{M}\s'’.\-]+$/u.test(fullName.trim())) {
      /*
       * \p{L} is "a letter in any script", not "a letter in English".
       *
       * This was /^[A-Za-z\s'-]+$/, which rejects José, Nguyễn, Оля, 李 and
       * roughly every name outside Western Europe. Signup and onboarding
       * validate the name not at all, so those students got in, got greeted by
       * name on their own dashboard, and were then permanently unable to save
       * ANY profile change — a new skill, an availability update, a resume —
       * because validateForm() fails on a field they never touched and cannot
       * fix without anglicising their own name. In North York, where over half
       * of residents were born outside Canada, that is most of the intended
       * users.
       *
       * \p{M} keeps combining marks, so a decomposed é survives. U+2019 is the
       * curly apostrophe phones insert automatically in O'Brien. The full stop
       * is for initials.
       */
      newErrors.fullName = "Full name can only contain letters, spaces, hyphens, and apostrophes.";
    }

    // 2. School validation
    if (!school) {
      newErrors.school = "Please select an academic institution.";
    }

    // 3. Grade validation
    if (!grade) {
      newErrors.grade = "Please select your grade level.";
    }

    // 4. Neighborhood validation
    if (!neighborhood) {
      newErrors.neighborhood = "Please select your neighborhood.";
    }

    // 5. Interests validation
    if (!interests || interests.length === 0) {
      newErrors.interests = "Please select at least one cause category that inspires you.";
    }

    // 8. Skills validation
    if (!skills || skills.length === 0) {
      newErrors.skills = "Please select at least one of your current skills.";
    }

    // 9. Availability validation
    if (!availability || availability.length === 0) {
      newErrors.availability = "Please select at least one availability slot.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (!user) return;

    if (!validateForm()) {
      window.scrollTo({ top: 350, behavior: "smooth" });
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    if (isDemoMode) {
      setTimeout(() => {
        const updatedProfile = {
          uid: user.uid,
          fullName,
          school,
          grade,
          gender,
          neighborhood,
          interests,
          skills,
          availability,
          previousExperience,
          resumeUrl: compressFile(resumeUrl),
          trackerEnabled,
          trackerAnonymous,
        };
        localStorage.setItem(
          "demo_student_profile",
          JSON.stringify(updatedProfile),
        );
        refreshProfile();
        setSuccess(true);
        setIsSaving(false);
        setTimeout(() => setSuccess(false), 3000);
      }, 500);
      return;
    }

    try {
      await updateDoc(doc(db, "students", user.uid), {
        fullName,
        school,
        grade,
        gender,
        neighborhood,
        interests,
        skills,
        availability,
        previousExperience,
        resumeUrl: compressFile(resumeUrl),
        trackerEnabled,
        trackerAnonymous,
      });
      await refreshProfile();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      // handleFirestoreError throws from inside the catch, which escaped
      // unhandled - the student saw no success message and no error either.
      console.error("Error updating profile:", err);
      setSaveError("We couldn't save your profile. Please check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="max-w-7xl mx-auto py-12 px-6 md:px-10 space-y-12 bg-paper-2 min-h-screen"
    >
      <div className="flex flex-col md:flex-row items-center gap-8 bg-white p-6 sm:p-8 rounded-lg border-none relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-10 opacity-[0.03] rotate-12 scale-150 transform group-hover:scale-175 transition-transform duration-700">
          <UserCheck className="w-48 h-48 text-ink" />
        </div>

        <div className="w-24 h-24 md:w-32 md:h-32 bg-blue-dark rounded-lg flex items-center justify-center shrink-0 relative z-10 group-hover:scale-105 transition-transform duration-500">
          <UserCheck className="text-white w-12 h-12 md:w-16 md:h-16" />
        </div>

        <div className="text-center md:text-left relative z-10">
          <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
            <h1 className="text-4xl md:text-6xl font-bold text-ink tracking-tight leading-none uppercase">
              Student Profile
            </h1>
          </div>
          <div className="flex flex-wrap justify-center md:justify-start gap-4">
            <p className="text-lg text-ink-soft font-bold uppercase tracking-wide">
              Showcase Your Potential
            </p>
            <Badge
              variant="secondary"
              className="px-4 py-1.5 font-semibold text-xs tracking-widest bg-paper-2 border-line italic"
            >
              High School verified
            </Badge>
          </div>
        </div>
      </div>

      {/* Milestone Badges & Achievements */}
      <div className="bg-white p-8 md:p-10 border border-line space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <Trophy className="text-blue-dark w-5 h-5" />
              Badges
            </h2>
            <p className="text-sm text-ink-soft mt-1">
              {evaluateBadges(studentProfile).filter(b => b.isUnlocked).length} of {evaluateBadges(studentProfile).length} unlocked
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {evaluateBadges(studentProfile).map(({ badge, isUnlocked }) => {

            const categoryColor = (cat: string) => {
              if (cat === "milestone") return "bg-blue-dark";
              if (cat === "skill") return "bg-amber";
              return "bg-slate-600";
            };

            const renderBadgeIcon = (name: string, className = "w-5 h-5") => {
              switch (name) {
                case "trophy": return <Trophy className={className} />;
                case "award": return <Award className={className} />;
                case "zap": return <Zap className={className} />;
                case "book": return <BookOpen className={className} />;
                case "briefcase": return <Briefcase className={className} />;
                case "heart": return <Heart className={className} />;
                case "sparkles": return <Sparkles className={className} />;
                case "user": return <UserCheck className={className} />;
                default: return <ShieldCheck className={className} />;
              }
            };

            return (
              <div
                key={badge.id}
                className={cn(
                  "p-5 border flex flex-col justify-between",
                  isUnlocked
                    ? "bg-white border-line"
                    // No opacity here. Dimming the whole card multiplied into its
                    // text: ink-muted at 60% over paper composites to #9DACB5, a
                    // contrast ratio of 2.25:1, and ink-soft to 3.1:1. A locked badge
                    // is the thing a student is working TOWARD, so its name and
                    // requirement are exactly what must stay readable. The lock glyph
                    // and the flat grey icon already say "not yet".
                    : "bg-paper-2 border-line"
                )}
              >
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn(
                      "w-9 h-9 flex items-center justify-center shrink-0",
                      isUnlocked
                        ? `${categoryColor(badge.category)} text-white`
                        : "bg-slate-200 text-ink-muted"
                    )}>
                      {isUnlocked ? (
                        renderBadgeIcon(badge.iconName, "w-4.5 h-4.5 text-white")
                      ) : (
                        <Lock className="w-4 h-4 text-ink-muted" />
                      )}
                    </div>
                    <span className="text-xs font-semibold text-ink-muted">
                      {badge.category}
                    </span>
                  </div>

                  <h3 className={cn(
                    "font-semibold text-sm",
                    isUnlocked ? "text-ink" : "text-ink-soft"
                  )}>
                    {badge.name}
                  </h3>
                  <p className={cn(
                    "text-[12px] mt-1 leading-relaxed",
                    isUnlocked ? "text-ink-soft" : "text-ink-muted"
                  )}>
                    {badge.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-line">
                  <span className={cn(
                    "text-xs font-medium",
                    isUnlocked ? "text-amber-dark" : "text-ink-muted"
                  )}>
                    {isUnlocked ? "Unlocked ✓" : badge.requirement}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <form
        onSubmit={handleUpdate}
        className="grid grid-cols-1 lg:grid-cols-12 gap-12"
      >
        <div className="lg:col-span-8 space-y-12">
          <Card className="border-none rounded-lg overflow-hidden bg-white">
            <CardHeader className="p-6 sm:p-8 border-b border-line-light">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-dark/10 rounded-lg flex items-center justify-center text-blue-dark">
                  <School className="w-6 h-6" />
                </div>
                <CardTitle className="text-xl font-semibold text-ink uppercase tracking-tight">
                  School Details
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 sm:p-8 space-y-10">
              <div className="space-y-3">
                <label className="text-xs font-semibold text-ink-soft ml-2">
                  Full Name
                </label>
                <Input
                  aria-label="Full name"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (errors.fullName) setErrors(prev => ({ ...prev, fullName: "" }));
                  }}
                  required
                  className={cn(
                    "h-11 rounded-lg bg-paper-2 border-line font-semibold ",
                    errors.fullName && "border-red-500 focus:border-red-500"
                  )}
                />
                {errors.fullName && (
                  <p className="text-xs text-red-600 font-bold ml-2 mt-1 flex items-center gap-1 animate-fadeIn">
                    ⚠️ {errors.fullName}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-ink-soft ml-2">
                    Academic Institution
                  </label>
                  <Select
                    aria-label="Academic institution"
                    value={school}
                    onChange={(e) => {
                      setSchool(e.target.value);
                      if (errors.school) setErrors(prev => ({ ...prev, school: "" }));
                    }}
                    options={[
                      ...TORONTO_SCHOOLS.map((s) => ({ value: s, label: s })),
                    ]}
                    required
                    className={cn(
                      "h-11 rounded-lg bg-paper-2 border-line font-semibold ",
                      errors.school && "border-red-500 focus:border-red-500"
                    )}
                  />
                  {errors.school && (
                    <p className="text-xs text-red-600 font-bold ml-2 mt-1 flex items-center gap-1 animate-fadeIn">
                      ⚠️ {errors.school}
                    </p>
                  )}
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-ink-soft ml-2">
                    Gender
                  </label>
                  <Select
                    aria-label="Gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    options={GENDERS}
                    className="h-11 rounded-lg bg-paper-2 border-line font-semibold"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-ink-soft ml-2">
                    Grade Level
                  </label>
                  <Select
                    aria-label="Grade level"
                    value={grade}
                    onChange={(e) => {
                      setGrade(e.target.value);
                      if (errors.grade) setErrors(prev => ({ ...prev, grade: "" }));
                    }}
                    options={GRADES}
                    required
                    className={cn(
                      "h-11 rounded-lg bg-paper-2 border-line font-semibold ",
                      errors.grade && "border-red-500 focus:border-red-500"
                    )}
                  />
                  {errors.grade && (
                    <p className="text-xs text-red-600 font-bold ml-2 mt-1 flex items-center gap-1 animate-fadeIn">
                      ⚠️ {errors.grade}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                <Select
                  label="Toronto Neighborhood"
                  value={neighborhood}
                  onChange={(e) => {
                    setNeighborhood(e.target.value);
                    if (errors.neighborhood) setErrors(prev => ({ ...prev, neighborhood: "" }));
                  }}
                  options={NEIGHBORHOODS.map(n => ({ value: n, label: n }))}
                  required
                  className={cn(
                    "h-11 rounded-lg bg-paper-2 border-line font-semibold ",
                    errors.neighborhood && "border-red-500 focus:border-red-500"
                  )}
                />
                {errors.neighborhood && (
                  <p className="text-xs text-red-600 font-bold ml-2 mt-1 flex items-center gap-1 animate-fadeIn">
                    ⚠️ {errors.neighborhood}
                  </p>
                )}
              </div>

              <div className="pt-6 border-t border-line">
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-ink-soft ml-2 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-blue-dark" /> Verified School Email (read-only)
                    </label>
                    <Input
                      aria-label="Verified school email (read-only)"
                      type="email"
                      value={user?.email || ""}
                      readOnly
                      disabled
                      className="h-11 rounded-lg bg-paper border-line font-semibold opacity-75"
                    />
                    <p className="text-xs text-ink-muted ml-2 mt-1 italic">Organizations will use this email to contact you regarding your applications.</p>
                  </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none rounded-lg overflow-hidden bg-white">
            <CardHeader className="p-6 sm:p-8 border-b border-line-light">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-dark/10 rounded-lg flex items-center justify-center text-blue-dark">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <CardTitle className="text-xl font-semibold text-ink uppercase tracking-tight">
                  Passion & Mastery
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 sm:p-8 space-y-12">
              <div>
                <label className="text-xs font-semibold text-ink-soft block mb-4 ml-2">
                  Causes That Ignite You
                </label>
                {errors.interests && (
                  <p className="text-xs text-red-600 font-bold ml-2 mb-4 flex items-center gap-1 animate-fadeIn">
                    ⚠️ {errors.interests}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  {INTERESTS.map((interest) => (
                    <button
                      key={interest}
                      type="button"
                      onClick={() => {
                        toggleItem(interest, interests, setInterests);
                        if (errors.interests) setErrors(prev => ({ ...prev, interests: "" }));
                      }}
                      className={cn(
                        "px-6 py-3 rounded-lg text-xs font-semibold tracking-wide border-2 transition-all duration-300 cursor-pointer",
                        interests.includes(interest)
                          ? "bg-slate-900 border-slate-900 text-white  scale-105"
                          : "bg-white border-line-light text-ink-soft hover:border-blue-dark/10 hover:text-blue-dark hover:scale-[1.02]",
                        errors.interests && "border-red-200 hover:border-red-300"
                      )}
                    >
                      {interest}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-soft block mb-4 ml-2">
                  Skills You Bring to the table
                </label>
                {errors.skills && (
                  <p className="text-xs text-red-600 font-bold ml-2 mb-4 flex items-center gap-1 animate-fadeIn">
                    ⚠️ {errors.skills}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  {SKILLS.map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => {
                        toggleItem(skill, skills, setSkills);
                        if (errors.skills) setErrors(prev => ({ ...prev, skills: "" }));
                      }}
                      className={cn(
                        "px-6 py-3 rounded-lg text-xs font-semibold tracking-wide border-2 transition-all duration-300 cursor-pointer",
                        skills.includes(skill)
                          ? "bg-blue-dark border-blue-dark text-white  scale-105"
                          : "bg-white border-line-light text-ink-soft hover:border-blue-dark/10 hover:text-blue-dark hover:scale-[1.02]",
                        errors.skills && "border-red-200 hover:border-red-300"
                      )}
                    >
                      {skill}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-soft block mb-4 ml-2">
                  Availability & Time Preferences
                </label>
                {errors.availability && (
                  <p className="text-xs text-red-600 font-bold ml-2 mb-4 flex items-center gap-1 animate-fadeIn">
                    ⚠️ {errors.availability}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  {AVAILABILITY.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => {
                        toggleItem(slot, availability, setAvailability);
                        if (errors.availability) setErrors(prev => ({ ...prev, availability: "" }));
                      }}
                      className={cn(
                        "px-6 py-3 rounded-lg text-xs font-semibold tracking-wide border-2 transition-all duration-300 cursor-pointer",
                        availability.includes(slot)
                          ? "bg-amber-dark border-amber-dark text-white shadow-orange-500/15 scale-105"
                          : "bg-white border-line text-ink-soft hover:border-orange-100 hover:text-amber-dark hover:scale-[1.02]",
                        errors.availability && "border-red-200 hover:border-red-300"
                      )}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none rounded-lg overflow-hidden bg-white">
            <CardHeader className="p-6 sm:p-8 border-b border-line-light">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-dark/10 rounded-lg flex items-center justify-center text-blue-dark">
                  <FileText className="w-6 h-6" />
                </div>
                <CardTitle className="text-xl font-semibold text-ink uppercase tracking-tight">
                  Experience & Why
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 sm:p-8 space-y-10">
              <div className="space-y-3">
                <label className="text-xs font-semibold text-ink-soft ml-2">
                  Previous Volunteering (Other Communities & Reasons)
                </label>
                <textarea
                  aria-label="Previous volunteering experience"
                  value={previousExperience}
                  onChange={(e) => setPreviousExperience(e.target.value)}
                  placeholder="Tell us where else you've volunteered and what motivates you to help..."
                  className="w-full min-h-[250px] p-6 rounded-lg bg-paper-2 border-line font-medium text-ink-soft focus:ring-2 focus:ring-blue-dark focus:outline-none transition-all"
                />
                <p className="text-xs text-ink-soft italic ml-2">
                  This helps organizations understand your background and
                  passion.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none rounded-lg overflow-hidden bg-white">
            <CardHeader className="p-6 sm:p-8 border-b border-line-light">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-dark/10 rounded-lg flex items-center justify-center text-blue-dark">
                  <FileText className="w-6 h-6" />
                </div>
                <CardTitle className="text-xl font-semibold text-ink uppercase tracking-tight">
                  Professional Resume
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 sm:p-8 space-y-8">
              <div className="bg-paper-2 p-6 rounded-lg border border-line text-center">
                <p className="text-xs text-ink-soft mb-6 font-medium italic">
                  Upload your resume to share it automatically with
                  organizations when you apply. PDF files up to 5MB are
                  supported; files are stored securely in cloud storage, not in
                  your profile record.
                </p>
                <div className="max-w-sm mx-auto">
                  <FileUpload
                    label="Upload Resume (PDF)"
                    storagePath={`students/${user?.uid}`}
                    onFileSelect={(url) => {
                      setFileUploadError("");
                      setFileUploadSuccess("");
                      setResumeUrl(url || "");
                    }}
                    currentFileName={resumeUrl ? "Current Resume.pdf" : null}
                    accept=".pdf"
                    maxSizeMB={5}
                  />
                  {fileUploadError && (
                    <p className="mt-2 text-xs font-bold text-red-600 uppercase tracking-wide">
                      {fileUploadError}
                    </p>
                  )}
                  {fileUploadSuccess && (
                    <p className="mt-2 text-xs font-semibold text-amber-dark">
                      {fileUploadSuccess}
                    </p>
                  )}
                </div>
                {resumeUrl && (
                  <div className="mt-4 flex items-center justify-center gap-2 p-3 bg-blue-dark/5 rounded-lg border border-blue-dark/10">
                    <div className="w-8 h-8 bg-blue-dark rounded-lg flex items-center justify-center text-white">
                      <FileText className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-semibold text-blue-dark">
                      Resume Attached
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-8">
          {/* Leaderboard Preferences Card */}
          <Card className="rounded-lg border border-line bg-white p-8 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-ink mb-1">
                Leaderboard Options
              </h3>
              <p className="text-xs text-ink-soft font-semibold leading-relaxed">
                Configure your preference for public student recognition.
              </p>
            </div>

            <div className="space-y-4 pt-1 ">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-ink-soft">
                    Participate in Rankings
                  </h4>
                  <p className="text-xs text-ink-soft">
                    Toggle leaderboard visibility
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={trackerEnabled}
                  aria-label="Participate in rankings"
                  onClick={() => setTrackerEnabled(!trackerEnabled)}
                  className={cn(
                    "w-11 h-6 rounded-lg transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0 self-center",
                    trackerEnabled ? "bg-blue-dark" : "bg-slate-200",
                  )}
                >
                  <span
                    className={cn(
                      "bg-white w-5 h-5 rounded-lg  transform transition-transform duration-250",
                      trackerEnabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between border-t border-line pt-4">
                <div>
                  <h4 className="text-xs font-bold text-ink-soft">
                    Remain Anonymous
                  </h4>
                  <p className="text-xs text-ink-soft">
                    Hide your display name
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={trackerAnonymous}
                  aria-label="Remain anonymous on the leaderboard"
                  disabled={!trackerEnabled}
                  onClick={() => setTrackerAnonymous(!trackerAnonymous)}
                  className={cn(
                    "w-11 h-6 rounded-lg transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0 self-center",
                    trackerAnonymous && trackerEnabled
                      ? "bg-amber"
                      : "bg-slate-200",
                    !trackerEnabled && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <span
                    className={cn(
                      "bg-white w-5 h-5 rounded-lg  transform transition-transform duration-250",
                      trackerAnonymous && trackerEnabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>
          </Card>
          <Card className="rounded-lg border border-line bg-white p-5 sm:p-8 space-y-8 sticky top-24">
            <div>
              <h3 className="text-lg font-bold text-ink mb-2">
                My Profile
              </h3>
              <p className="text-xs text-ink-soft leading-relaxed font-semibold">
                Keeping your profile complete makes it much easier for
                registered Toronto community groups and charities to discover
                your skills and invite you to help with their events.
              </p>
            </div>
            <div className="p-5 border border-line bg-paper-2 rounded-lg space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-ink-soft font-semibold">
                  Selected Causes
                </span>
                <span className="font-semibold text-ink">
                  {interests.length} selected
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-ink-soft font-semibold">
                  Selected Skills
                </span>
                <span className="font-semibold text-ink">
                  {skills.length} selected
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-ink-soft font-semibold">
                  Availability Slots
                </span>
                <span className="font-semibold text-ink">
                  {availability.length} selected
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-ink-soft font-semibold">
                  Resume Status
                </span>
                <span
                  className={cn(
                    "font-semibold",
                    resumeUrl ? "text-blue-dark" : "text-amber-dark",
                  )}
                >
                  {resumeUrl ? "Uploaded" : "Optional"}
                </span>
              </div>
            </div>

            <div className="pt-2 gap-4 flex flex-col">
              {saveError && (
                <div role="alert" aria-live="assertive" className="bg-red-50 text-red-700 p-3.5 text-[13px] border border-red-200">
                  {saveError}
                </div>
              )}
              {success ? (
                <div className="bg-blue-dark text-white h-14 rounded-lg flex items-center justify-center text-xs font-semibold tracking-wide animate-in zoom-in duration-300">
                  <UserCheck className="w-4 h-4 mr-2" /> Changes Saved!
                </div>
              ) : (
                <Button
                  type="submit"
                  className="w-full h-14 bg-blue-dark hover:bg-blue-dark rounded-lg font-semibold text-xs"
                  isLoading={isSaving}
                >
                  Save Profile
                </Button>
              )}

              <ChangePassword />

              {!isDemoMode && (
                <div className="border border-red-100 bg-red-50/20 p-4 rounded-lg space-y-3">
                  {!showConfirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setShowConfirmDelete(true)}
                      className="w-full text-center text-red-600 hover:text-red-700 font-semibold text-xs py-3 hover:bg-red-50 rounded-lg border border-dashed border-red-200 transition-all cursor-pointer"
                    >
                      ⚠️ Permanently Delete Account (Start Over)
                    </button>
                  ) : (
                    <div className="space-y-3 text-left">
                      <p className="text-xs font-bold text-red-700 leading-normal">
                        ⚠️ WARNING: Are you sure you want to PERMANENTLY delete your account? All profiles, files, and hours tracking data will be deleted forever. You cannot undo this.
                      </p>
                      <div>
                        <label className="block text-xs font-semibold uppercase text-ink-soft mb-1">
                          Type email to confirm ({user?.email})
                        </label>
                        {/* Named explicitly: the visible label carries a JSX expression, so it
                            was skipped by the sweep that fixed the plain-text ones.
                            This is the confirmation gate on permanent account deletion. */}
                        <Input
                          type="text"
                          aria-label="Type your email address to confirm account deletion"
                          value={deleteConfirmEmail}
                          onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                          placeholder={user?.email || "Email address"}
                          className="bg-white"
                        />
                      </div>
                      
                      {deleteError && (
                        <p className="text-xs font-semibold uppercase text-red-600">
                          {deleteError}
                        </p>
                      )}

                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setShowConfirmDelete(false);
                            setDeleteConfirmEmail("");
                            setDeleteError("");
                          }}
                          className="px-4 py-2 text-ink-soft hover:text-ink-soft font-semibold text-xs rounded-lg hover:bg-paper-3"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={handleDeleteAccountInput}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-lg rounded-full"
                        >
                          {isDeleting ? "Deleting..." : "Delete Account"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      </form>
    </motion.div>
  );
}
