import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db, auth } from "../firebase/config";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Badge } from "../components/ui/Badge";
import { FileUpload } from "../components/ui/FileUpload";
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
  MapPin,
  FileText,
  Mail,
  Phone,
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

const GRADES = [
  { value: "9", label: "Grade 9" },
  { value: "10", label: "Grade 10" },
  { value: "11", label: "Grade 11" },
  { value: "12", label: "Grade 12" },
];



const INTERESTS = [
  "Animal Welfare",
  "Arts & Culture",
  "Children & Youth",
  "Community Services",
  "Education",
  "Environment",
  "Event Planning",
  "Food Banks",
  "Health & Hospitals",
  "Seniors",
  "Sports",
  "Technology",
  "Tutoring",
  "Other",
];

const SKILLS = [
  "Communication",
  "Computer & Tech",
  "Creative & Design",
  "Event Support",
  "Language Skills",
  "Leadership",
  "Organization",
  "Physical Work",
  "Research & Writing",
  "Teaching",
];

const AVAILABILITY_OPTIONS = [
  "Weekdays After School",
  "Weekends (Saturday/Sunday)",
  "Weekday Mornings",
  "Weekday Afternoons",
  "Summer Break",
  "Winter/Spring Breaks",
  "Flexible / On-Call",
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
        // 1. Delete user files/documents in Firestore
        await deleteDoc(doc(db, "users", user.uid));
        await deleteDoc(doc(db, "students", user.uid));
        
        // 2. Delete the actual FirebaseAuth auth user record
        await user.delete();
      }
      await logout();
      navigate("/");
    } catch (err: any) {
      console.error("Account deletion failed:", err);
      if (err.code === "auth/requires-recent-login") {
        setDeleteError(
          "🔒 Security restrictions apply: To delete your account, you must have logged in recently. Please log out, log back in, and try deleting again immediately."
        );
      } else {
        setDeleteError(`Deletion failed: ${err.message || err}`);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Profile Fields
  const [fullName, setFullName] = useState(studentProfile?.fullName || "");
  const [selectedSchool, setSelectedSchool] = useState("");
  const [otherSchool, setOtherSchool] = useState("");
  const [school, setSchool] = useState(studentProfile?.school || "");
  const [grade, setGrade] = useState(studentProfile?.grade || "");
  const [neighborhood, setNeighborhood] = useState(
    studentProfile?.neighborhood || "",
  );
  const [interests, setInterests] = useState<string[]>(
    studentProfile?.interests || [],
  );
  const [skills, setSkills] = useState<string[]>(studentProfile?.skills || []);
  const [availability, setAvailability] = useState<string[]>(
    studentProfile?.availability || [],
  );
  const [previousExperience, setPreviousExperience] = useState(
    studentProfile?.previousExperience || "",
  );
  const [resumeUrl, setResumeUrl] = useState(
    decompressFile(studentProfile?.resumeUrl || ""),
  );
  const [passportUrl, setPassportUrl] = useState(
    decompressFile(studentProfile?.passportUrl || ""),
  );
  const [trackerEnabled, setTrackerEnabled] = useState(true);
  const [trackerAnonymous, setTrackerAnonymous] = useState(false);
  const [contactEmail, setContactEmail] = useState(studentProfile?.contactEmail || user?.email || "");
  const [phone, setPhone] = useState(studentProfile?.phone || "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (studentProfile) {
      setFullName(studentProfile.fullName);
      setSchool(studentProfile.school);
      setGrade(studentProfile.grade);
      setNeighborhood(studentProfile.neighborhood);
      setInterests(studentProfile.interests);
      setSkills(studentProfile.skills);
      setAvailability(studentProfile.availability || []);
      setPreviousExperience(studentProfile.previousExperience || "");
      setResumeUrl(decompressFile(studentProfile.resumeUrl || ""));
      setPassportUrl(decompressFile(studentProfile.passportUrl || ""));
      setTrackerEnabled(studentProfile.trackerEnabled ?? true);
      setTrackerAnonymous(studentProfile.trackerAnonymous ?? false);
      setContactEmail(studentProfile.contactEmail || user?.email || "");
      setPhone(studentProfile.phone || "");

      if (TORONTO_SCHOOLS.includes(studentProfile.school)) {
        setSelectedSchool(studentProfile.school);
        setOtherSchool("");
      } else if (studentProfile.school) {
        setSelectedSchool("Other");
        setOtherSchool(studentProfile.school);
      }
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
    } else if (!/^[A-Za-z\s'\-]+$/.test(fullName.trim())) {
      newErrors.fullName = "Full name can only contain letters, spaces, hyphens, and apostrophes.";
    }

    // 2. School validation
    if (!selectedSchool) {
      newErrors.school = "Please select an academic institution.";
    } else if (selectedSchool === "Other" && (!otherSchool || !otherSchool.trim())) {
      newErrors.school = "Please enter your custom school name.";
    } else if (selectedSchool === "Other" && otherSchool.trim().length < 3) {
      newErrors.school = "Custom school name must be at least 3 characters long.";
    }

    // 3. Grade validation
    if (!grade) {
      newErrors.grade = "Please select your grade level.";
    }

    // 4. Neighborhood validation
    if (!neighborhood) {
      newErrors.neighborhood = "Please select your neighborhood.";
    }

    // 5. Contact Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!contactEmail || !contactEmail.trim()) {
      newErrors.contactEmail = "Contact email is required.";
    } else if (!emailRegex.test(contactEmail.trim())) {
      newErrors.contactEmail = "Please enter a valid email address.";
    }

    // 6. Phone validation
    if (phone && phone.trim()) {
      const cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.length < 10) {
        newErrors.phone = "Phone number must contain at least 10 digits.";
      }
    }

    // 7. Interests validation
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
          neighborhood,
          interests,
          skills,
          availability,
          previousExperience,
          resumeUrl: compressFile(resumeUrl),
          passportUrl: compressFile(passportUrl),
          trackerEnabled,
          trackerAnonymous,
          contactEmail,
          phone,
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
        neighborhood,
        interests,
        skills,
        availability,
        previousExperience,
        resumeUrl: compressFile(resumeUrl),
        passportUrl: compressFile(passportUrl),
        trackerEnabled,
        trackerAnonymous,
        contactEmail,
        phone,
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
      className="max-w-7xl mx-auto py-12 px-6 md:px-10 space-y-12 bg-slate-50 min-h-screen"
    >
      <div className="flex flex-col md:flex-row items-center gap-8 bg-white p-10 md:p-14 rounded-sm  shadow-slate-200 border-none relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-10 opacity-[0.03] rotate-12 scale-150 transform group-hover:scale-175 transition-transform duration-700">
          <UserCheck className="w-48 h-48 text-slate-900" />
        </div>

        <div className="w-24 h-24 md:w-32 md:h-32 bg-[#1F4C63] rounded-sm flex items-center justify-center  shadow-blue-200 shrink-0 relative z-10 group-hover:scale-105 transition-transform duration-500">
          <UserCheck className="text-white w-12 h-12 md:w-16 md:h-16" />
        </div>

        <div className="text-center md:text-left relative z-10">
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tight leading-none uppercase mb-4">
            Student Profile
          </h1>
          <div className="flex flex-wrap justify-center md:justify-start gap-4">
            <p className="text-lg text-slate-600 font-bold uppercase tracking-[0.2em]">
              Showcase Your Potential
            </p>
            <Badge
              variant="secondary"
              className="px-4 py-1.5 font-black text-[10px] tracking-widest bg-slate-50 border-slate-100 italic"
            >
              High School verified
            </Badge>
          </div>
        </div>
      </div>

      {/* Milestone Badges & Achievements Cabinet */}
      <div className="bg-white dark:bg-slate-900 rounded-sm p-8 md:p-12 shadow-sm border border-line space-y-8 animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1F4C63]">
              Personal Accomplishments
            </span>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mt-1 flex items-center gap-2">
              <Trophy className="text-[#1F4C63] w-6 h-6 animate-pulse" />
              Volunteer Milestone Badges
            </h2>
          </div>
          <div className="bg-[#1F4C63]/5 dark:bg-blue-950/45 border border-[#1F4C63]/10 dark:border-blue-900/30 rounded-sm px-5 py-2.5 text-right flex items-center gap-3 shrink-0">
            <span className="text-2xl font-black text-[#1F4C63] dark:text-blue-400 ">
              {evaluateBadges(studentProfile).filter(b => b.isUnlocked).length} / {evaluateBadges(studentProfile).length}
            </span>
            <div className="text-left">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#1F4C63]">Unlocked</p>
              <p className="text-[9px] font-bold text-slate-600">Keep logging to claim more</p>
            </div>
          </div>
        </div>

        {/* Badges Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {evaluateBadges(studentProfile).map(({ badge, isUnlocked }) => {
            const getGradient = (category: string) => {
              if (category === "milestone") return "shadow-blue-500/20";
              if (category === "skill") return "shadow-blue-500/20";
              return "shadow-blue-500/20";
            };

            const renderBadgeIcon = (name: string, className = "w-6 h-6") => {
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
              <motion.div
                key={badge.id}
                whileHover={{ y: -5, scale: 1.02 }}
                className={cn(
                  "p-6 rounded-sm border transition-all relative flex flex-col justify-between h-56",
                  isUnlocked
                    ? "bg-white dark:bg-slate-950 border-slate-100 dark:border-slate-800  shadow-slate-100 dark:"
                    : "bg-slate-50/50 dark:bg-slate-950/20 border-slate-100/50 dark:border-slate-900/40 text-slate-600 opacity-60"
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={cn(
                        "w-12 h-12 rounded-sm flex items-center justify-center ",
                        isUnlocked
                          ? ` ${getGradient(badge.category)} text-white`
                          : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-600"
                      )}
                    >
                      {isUnlocked ? (
                        renderBadgeIcon(badge.iconName, "w-6 h-6 text-white")
                      ) : (
                        <Lock className="w-5 h-5 text-slate-600" />
                      )}
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-600 ">
                      {badge.category}
                    </span>
                  </div>

                  <h3 className={cn(
                    "font-bold text-sm tracking-tight",
                    isUnlocked ? "text-slate-900 dark:text-white font-extrabold" : "text-slate-600 dark:text-slate-600"
                  )}>
                    {badge.name}
                  </h3>
                  <p className="text-[10px] text-slate-600 dark:text-slate-600 mt-1.5 leading-relaxed font-semibold line-clamp-2">
                    {badge.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100/60 dark:border-slate-800/60 flex items-center justify-between">
                  <span className="text-[8px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-600 block">
                    {isUnlocked ? "Status" : "Requirement"}
                  </span>
                  <span className={cn(
                    "text-[9px] font-black tracking-wide uppercase bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded",
                    isUnlocked ? "text-[#1F4C63] dark:text-[#1F4C63]" : "text-slate-600 dark:text-slate-600"
                  )}>
                    {isUnlocked ? "Unlocked ✨" : badge.requirement}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <form
        onSubmit={handleUpdate}
        className="grid grid-cols-1 lg:grid-cols-12 gap-12"
      >
        <div className="lg:col-span-8 space-y-12">
          <Card className="border-none  shadow-slate-100 rounded-sm overflow-hidden bg-white">
            <CardHeader className="p-10 md:p-14 border-b border-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#1F4C63]/10 rounded-sm flex items-center justify-center text-[#1F4C63]">
                  <School className="w-6 h-6" />
                </div>
                <CardTitle className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  School Details
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-10 md:p-14 space-y-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">
                  Full Name
                </label>
                <Input
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (errors.fullName) setErrors(prev => ({ ...prev, fullName: "" }));
                  }}
                  required
                  className={cn(
                    "h-18 rounded-sm bg-slate-50 border-slate-100 font-extrabold ",
                    errors.fullName && "border-red-500 focus:border-red-500"
                  )}
                />
                {errors.fullName && (
                  <p className="text-xs text-red-500 font-bold ml-2 mt-1 flex items-center gap-1 animate-fadeIn">
                    ⚠️ {errors.fullName}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">
                    Academic Institution
                  </label>
                  <Select
                    value={selectedSchool}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedSchool(val);
                      if (val !== "Other") {
                        setSchool(val);
                      } else {
                        setSchool(otherSchool);
                      }
                      if (errors.school) setErrors(prev => ({ ...prev, school: "" }));
                    }}
                    options={[
                      ...TORONTO_SCHOOLS.map((s) => ({ value: s, label: s })),
                      { value: "Other", label: "Other school not listed" },
                    ]}
                    required
                    className={cn(
                      "h-18 rounded-sm bg-slate-50 border-slate-100 font-extrabold ",
                      errors.school && "border-red-500 focus:border-red-500"
                    )}
                  />
                  {selectedSchool === "Other" && (
                    <div className="mt-4 animate-in slide-in- duration-300">
                      <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">
                        Custom School Name
                      </label>
                      <Input
                        value={otherSchool}
                        onChange={(e) => {
                          setOtherSchool(e.target.value);
                          setSchool(e.target.value);
                          if (errors.school) setErrors(prev => ({ ...prev, school: "" }));
                        }}
                        required
                        className={cn(
                          "h-18 rounded-sm bg-slate-50 border-slate-100 font-extrabold ",
                          errors.school && "border-red-500 focus:border-red-500"
                        )}
                      />
                    </div>
                  )}
                  {errors.school && (
                    <p className="text-xs text-red-500 font-bold ml-2 mt-1 flex items-center gap-1 animate-fadeIn">
                      ⚠️ {errors.school}
                    </p>
                  )}
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">
                    Grade Level
                  </label>
                  <Select
                    value={grade}
                    onChange={(e) => {
                      setGrade(e.target.value);
                      if (errors.grade) setErrors(prev => ({ ...prev, grade: "" }));
                    }}
                    options={GRADES}
                    required
                    className={cn(
                      "h-18 rounded-sm bg-slate-50 border-slate-100 font-extrabold ",
                      errors.grade && "border-red-500 focus:border-red-500"
                    )}
                  />
                  {errors.grade && (
                    <p className="text-xs text-red-500 font-bold ml-2 mt-1 flex items-center gap-1 animate-fadeIn">
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
                    "h-18 rounded-sm bg-slate-50 border-slate-100 font-extrabold ",
                    errors.neighborhood && "border-red-500 focus:border-red-500"
                  )}
                />
                {errors.neighborhood && (
                  <p className="text-xs text-red-500 font-bold ml-2 mt-1 flex items-center gap-1 animate-fadeIn">
                    ⚠️ {errors.neighborhood}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-6 border-t border-slate-100">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[#1F4C63]" /> Contact Email (visible to organizations)
                  </label>
                  <Input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => {
                      setContactEmail(e.target.value);
                      if (errors.contactEmail) setErrors(prev => ({ ...prev, contactEmail: "" }));
                    }}
                    required
                    placeholder="student@example.com"
                    className={cn(
                      "h-18 rounded-sm bg-slate-50 border-slate-100 font-extrabold ",
                      errors.contactEmail && "border-red-500 focus:border-red-500"
                    )}
                  />
                  {errors.contactEmail && (
                    <p className="text-xs text-red-500 font-bold ml-2 mt-1 flex items-center gap-1 animate-fadeIn">
                      ⚠️ {errors.contactEmail}
                    </p>
                  )}
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-[#1F4C63]" /> Phone Number (visible to organizations)
                  </label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (errors.phone) setErrors(prev => ({ ...prev, phone: "" }));
                    }}
                    placeholder="e.g. (416) 555-0199"
                    className={cn(
                      "h-18 rounded-sm bg-slate-50 border-slate-100 font-extrabold ",
                      errors.phone && "border-red-500 focus:border-red-500"
                    )}
                  />
                  {errors.phone && (
                    <p className="text-xs text-red-500 font-bold ml-2 mt-1 flex items-center gap-1 animate-fadeIn">
                      ⚠️ {errors.phone}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none  shadow-slate-100 rounded-sm overflow-hidden bg-white">
            <CardHeader className="p-10 md:p-14 border-b border-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#1F4C63]/10 rounded-sm flex items-center justify-center text-[#1F4C63]">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <CardTitle className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  Passion & Mastery
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-10 md:p-14 space-y-12">
              <div>
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest block mb-4 ml-2">
                  Causes That Ignite You
                </label>
                {errors.interests && (
                  <p className="text-xs text-red-500 font-bold ml-2 mb-4 flex items-center gap-1 animate-fadeIn">
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
                        "px-6 py-3 rounded-sm text-[10px] font-black uppercase tracking-widest border-2 transition-all duration-300 cursor-pointer",
                        interests.includes(interest)
                          ? "bg-slate-900 border-slate-900 text-white  scale-105"
                          : "bg-white border-slate-50 text-slate-600 hover:border-[#1F4C63]/10 hover:text-[#1F4C63] hover:scale-[1.02]",
                        errors.interests && "border-red-200 hover:border-red-300"
                      )}
                    >
                      {interest}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest block mb-4 ml-2">
                  Skills You Bring to the table
                </label>
                {errors.skills && (
                  <p className="text-xs text-red-500 font-bold ml-2 mb-4 flex items-center gap-1 animate-fadeIn">
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
                        "px-6 py-3 rounded-sm text-[10px] font-black uppercase tracking-widest border-2 transition-all duration-300 cursor-pointer",
                        skills.includes(skill)
                          ? "bg-[#1F4C63] border-[#1F4C63] text-white  scale-105"
                          : "bg-white border-slate-50 text-slate-600 hover:border-[#1F4C63]/10 hover:text-[#1F4C63] hover:scale-[1.02]",
                        errors.skills && "border-red-200 hover:border-red-300"
                      )}
                    >
                      {skill}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest block mb-4 ml-2">
                  Availability & Time Preferences
                </label>
                {errors.availability && (
                  <p className="text-xs text-red-500 font-bold ml-2 mb-4 flex items-center gap-1 animate-fadeIn">
                    ⚠️ {errors.availability}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  {AVAILABILITY_OPTIONS.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => {
                        toggleItem(slot, availability, setAvailability);
                        if (errors.availability) setErrors(prev => ({ ...prev, availability: "" }));
                      }}
                      className={cn(
                        "px-6 py-3 rounded-sm text-[10px] font-black uppercase tracking-widest border-2 transition-all duration-300 cursor-pointer",
                        availability.includes(slot)
                          ? "bg-[#E08A3C] border-[#E08A3C] text-white  shadow-orange-500/15 scale-105"
                          : "bg-white border-slate-100 text-slate-600 hover:border-orange-100 hover:text-[#E08A3C] hover:scale-[1.02]",
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

          <Card className="border-none  shadow-slate-100 rounded-sm overflow-hidden bg-white">
            <CardHeader className="p-10 md:p-14 border-b border-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#1F4C63]/10 rounded-sm flex items-center justify-center text-[#1F4C63]">
                  <FileText className="w-6 h-6" />
                </div>
                <CardTitle className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  Experience & Why
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-10 md:p-14 space-y-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">
                  Previous Volunteering (Other Communities & Reasons)
                </label>
                <textarea
                  value={previousExperience}
                  onChange={(e) => setPreviousExperience(e.target.value)}
                  placeholder="Tell us where else you've volunteered and what motivates you to help..."
                  className="w-full min-h-[250px] p-6 rounded-sm bg-slate-50 border-slate-100 font-medium text-slate-700  focus:ring-2 focus:ring-[#1F4C63] focus:outline-none transition-all"
                />
                <p className="text-[10px] text-slate-600 italic ml-2">
                  This helps organizations understand your background and
                  passion.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none  shadow-slate-100 rounded-sm overflow-hidden bg-white">
            <CardHeader className="p-10 md:p-14 border-b border-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#1F4C63]/10 rounded-sm flex items-center justify-center text-[#1F4C63]">
                  <FileText className="w-6 h-6" />
                </div>
                <CardTitle className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  Professional Resume
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-10 md:p-14 space-y-8">
              <div className="bg-slate-50 p-6 rounded-sm border border-slate-100 text-center">
                <p className="text-xs text-slate-600 mb-6 font-medium italic">
                  Upload your resume to share it automatically with
                  organizations when you apply. PDF files under 500KB are
                  required to keep the database fast and responsive.
                </p>
                <div className="max-w-sm mx-auto">
                  <FileUpload
                    label="Upload Resume (PDF)"
                    onFileSelect={(base64) => {
                      setFileUploadError("");
                      setFileUploadSuccess("");
                      if (base64 && base64.length > 700000) {
                        try {
                          const compressed = compressFile(base64);
                          if (compressed.length > 700000) {
                            setFileUploadError("Even compressed, this file is too large. Please shrink the PDF first!");
                            return;
                          }
                          const savedKb = Math.round(
                            (base64.length - compressed.length) / 1024,
                          );
                          setFileUploadSuccess(
                            `Successfully compressed and attached! Saved approximately ${savedKb}KB of space.`
                          );
                          setResumeUrl(compressed);
                        } catch (err) {
                          setFileUploadError("Failed to compress file automatically.");
                        }
                        return;
                      }
                      setResumeUrl(base64 || "");
                    }}
                    currentFileName={resumeUrl ? "Current Resume.pdf" : null}
                  />
                  {fileUploadError && (
                    <p className="mt-2 text-xs font-bold text-red-600 uppercase tracking-wide">
                      {fileUploadError}
                    </p>
                  )}
                  {fileUploadSuccess && (
                    <p className="mt-2 text-[10px] font-black text-[#E08A3C] uppercase tracking-widest">
                      {fileUploadSuccess}
                    </p>
                  )}
                </div>
                {resumeUrl && (
                  <div className="mt-4 flex items-center justify-center gap-2 p-3 bg-[#1F4C63]/5 rounded-sm border border-[#1F4C63]/10">
                    <div className="w-8 h-8 bg-[#1F4C63] rounded-sm flex items-center justify-center text-white">
                      <FileText className="w-4 h-4" />
                    </div>
                    <p className="text-[10px] font-black text-[#1F4C63] uppercase tracking-widest">
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
          <Card className="rounded-sm border border-slate-100  bg-white p-8 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                Leaderboard Options
              </h3>
              <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                Configure your preference for public student recognition.
              </p>
            </div>

            <div className="space-y-4 pt-1 ">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">
                    Participate in Rankings
                  </h4>
                  <p className="text-[10px] text-slate-600">
                    Toggle leaderboard visibility
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTrackerEnabled(!trackerEnabled)}
                  className={cn(
                    "w-11 h-6 rounded-sm transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0 self-center",
                    trackerEnabled ? "bg-[#1F4C63]" : "bg-slate-200",
                  )}
                >
                  <span
                    className={cn(
                      "bg-white w-5 h-5 rounded-sm  transform transition-transform duration-250",
                      trackerEnabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 pt-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">
                    Remain Anonymous
                  </h4>
                  <p className="text-[10px] text-slate-600">
                    Hide your display name
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!trackerEnabled}
                  onClick={() => setTrackerAnonymous(!trackerAnonymous)}
                  className={cn(
                    "w-11 h-6 rounded-sm transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0 self-center",
                    trackerAnonymous && trackerEnabled
                      ? "bg-[#E08A3C]"
                      : "bg-slate-200",
                    !trackerEnabled && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <span
                    className={cn(
                      "bg-white w-5 h-5 rounded-sm  transform transition-transform duration-250",
                      trackerAnonymous && trackerEnabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>
          </Card>
          <Card className="rounded-sm border border-slate-100  bg-white p-5 sm:p-8 space-y-8 sticky top-24">
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                My Profile
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                Keeping your profile complete makes it much easier for
                registered Toronto community groups and charities to discover
                your skills and invite you to help with their events.
              </p>
            </div>
            <div className="p-5 border border-slate-100 bg-slate-50 rounded-sm space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-semibold">
                  Selected Causes
                </span>
                <span className="font-extrabold text-slate-900">
                  {interests.length} selected
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-semibold">
                  Selected Skills
                </span>
                <span className="font-extrabold text-slate-900">
                  {skills.length} selected
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-semibold">
                  Availability Slots
                </span>
                <span className="font-extrabold text-slate-900">
                  {availability.length} selected
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-semibold">
                  Resume Status
                </span>
                <span
                  className={cn(
                    "font-extrabold",
                    resumeUrl ? "text-[#1F4C63]" : "text-[#E08A3C]",
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
                <div className="bg-[#1F4C63] text-white h-14 rounded-sm flex items-center justify-center text-xs font-black uppercase tracking-widest animate-in zoom-in duration-300">
                  <UserCheck className="w-4 h-4 mr-2" /> Changes Saved!
                </div>
              ) : (
                <Button
                  type="submit"
                  className="w-full h-14 bg-[#1F4C63] hover:bg-[#1F4C63] rounded-sm font-black text-xs uppercase tracking-widest"
                  isLoading={isSaving}
                >
                  Save Profile
                </Button>
              )}

              {!isDemoMode && (
                <div className="border border-red-100 bg-red-50/20 p-4 rounded-sm space-y-3">
                  {!showConfirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setShowConfirmDelete(true)}
                      className="w-full text-center text-red-500 hover:text-red-700 font-black text-xs uppercase tracking-widest py-3 hover:bg-red-50 rounded-sm border border-dashed border-red-200 transition-all cursor-pointer"
                    >
                      ⚠️ Permanently Delete Account (Start Over)
                    </button>
                  ) : (
                    <div className="space-y-3 text-left">
                      <p className="text-xs font-bold text-red-700 leading-normal">
                        ⚠️ WARNING: Are you sure you want to PERMANENTLY delete your account? All profiles, files, and hours tracking data will be deleted forever. You cannot undo this.
                      </p>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                          Type email to confirm ({user?.email})
                        </label>
                        <Input
                          type="text"
                          value={deleteConfirmEmail}
                          onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                          placeholder={user?.email || "Email address"}
                          className="bg-white"
                        />
                      </div>
                      
                      {deleteError && (
                        <p className="text-[10px] font-black uppercase text-red-600">
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
                          className="px-4 py-2 text-slate-600 hover:text-slate-800 font-extrabold text-[10px] uppercase tracking-wider rounded-sm hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={handleDeleteAccountInput}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-sm  rounded-full"
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
