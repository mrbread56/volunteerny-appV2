import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db, auth } from "../firebase/config";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import { Building2, Info, Globe, ShieldCheck, Mail, Phone } from "lucide-react";
import AddressMapsSelector from "../components/AddressMapsSelector";
import { motion } from "motion/react";
import { cn } from "../lib/utils";
import { isPlausibleCraNumber, normalizeCraNumber } from "../lib/craValidation";

const ORGANIZATION_TYPES = [
  { value: "Registered Charity", label: "Registered Charity" },
  {
    value: "Non-Profit Organization (NPO)",
    label: "Non-Profit Organization (NPO)",
  },
  { value: "Community Group", label: "Community Group" },
  {
    value: "High School / Education",
    label: "School / Educational Institution",
  },
  {
    value: "Healthcare / Hospital Foundation",
    label: "Healthcare & Hospital Foundation",
  },
  {
    value: "Religious / Faith-Based",
    label: "Religious & Faith-Based Organization",
  },
  { value: "Sports / Recreational Club", label: "Sports & Recreational Club" },
  { value: "Other", label: "Other Group" },
];

export default function OrgProfile() {
  const { user, userProfile, orgProfile, refreshProfile, isDemoMode, logout } = useAuth();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const handleDeleteAccountInput = async () => {
    if (deleteConfirmEmail.toLowerCase() !== user?.email?.toLowerCase()) {
      setDeleteError("Email confirmation failed. Please correct the email entered.");
      return;
    }

    setDeleteError("");
    setIsDeleting(true);
    try {
      if (user) {
        // 1. Delete organization documents in Firestore
        await deleteDoc(doc(db, "users", user.uid));
        await deleteDoc(doc(db, "organizations", user.uid));
        
        // 2. Delete the actual FirebaseAuth auth user record
        await user.delete();
      }
      await logout();
      navigate("/");
    } catch (err: any) {
      console.error("Account deletion failed:", err);
      if (err.code === "auth/requires-recent-login") {
        setDeleteError(
          "🔒 Security Policy: Delete request blocked. Please sign out, log back in immediately, and try again."
        );
      } else {
        setDeleteError(`Deletion failed: ${err.message || err}`);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggle2FA = async () => {
    if (!user) return;
    const newVal = !(userProfile?.twoFactorEnabled ?? true);
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
    } catch (err: any) {
      console.error("Error updating twoFactorEnabled", err);
      alert(`Failed to update 2FA setting: ${err.message || 'Please check your connection and try again.'}`);
    }
  };

  // Profile Fields
  const [orgName, setOrgName] = useState(orgProfile?.organizationName || "");
  const [mission, setMission] = useState(orgProfile?.mission || "");
  const [description, setDescription] = useState(orgProfile?.description || "");
  const [hasCra, setHasCra] = useState(orgProfile?.hasCra ?? true);
  const [craNumber, setCraNumber] = useState(orgProfile?.craNumber || "");
  const [orgType, setOrgType] = useState(orgProfile?.organizationType || "");
  const [contactEmail, setContactEmail] = useState(
    orgProfile?.contactEmail || "",
  );
  const [phone, setPhone] = useState(orgProfile?.phone || "");
  const [address, setAddress] = useState(orgProfile?.address || "");
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(
    (orgProfile as any)?.coordinates || { lat: 43.7615, lng: -79.4111 },
  );
  const [isNorthYork, setIsNorthYork] = useState(
    orgProfile?.northYorkConfirmed || false,
  );
  const [website, setWebsite] = useState(orgProfile?.websiteUrl || "");
  const [socialTwitter, setSocialTwitter] = useState(
    orgProfile?.socialLinks?.twitter || ""
  );
  const [socialInstagram, setSocialInstagram] = useState(
    orgProfile?.socialLinks?.instagram || ""
  );
  const [socialLinkedin, setSocialLinkedin] = useState(
    orgProfile?.socialLinks?.linkedin || ""
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (orgProfile) {
      setOrgName(orgProfile.organizationName);
      setMission(orgProfile.mission);
      setDescription(orgProfile.description || "");
      setHasCra(orgProfile.hasCra ?? (orgProfile.craNumber ? true : false));
      setCraNumber(orgProfile.craNumber || "");
      setOrgType(orgProfile.organizationType || "");
      setContactEmail(orgProfile.contactEmail);
      setPhone(orgProfile.phone || "");
      setAddress(orgProfile.address || "");
      setCoords(
        (orgProfile as any).coordinates || { lat: 43.7615, lng: -79.4111 },
      );
      setIsNorthYork(orgProfile.northYorkConfirmed);
      setWebsite(orgProfile.websiteUrl || "");
      setSocialTwitter(orgProfile.socialLinks?.twitter || "");
      setSocialInstagram(orgProfile.socialLinks?.instagram || "");
      setSocialLinkedin(orgProfile.socialLinks?.linkedin || "");
    }
  }, [orgProfile]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError("");
    setIsSaving(true);

    // 1. Validation Logic
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (contactEmail && !emailRegex.test(contactEmail)) {
      setError("Please enter a valid format for public contact email.");
      setIsSaving(false);
      return;
    }

    if (phone) {
      const numericPhone = phone.replace(/\D/g, "");
      if (numericPhone.length > 0 && numericPhone.length < 10) {
        setError("Please enter a valid 10-digit phone number (or leave empty).");
        setIsSaving(false);
        return;
      }
    }

    if (website && !website.startsWith("http://") && !website.startsWith("https://")) {
      setError("Please enter a website URL starting with http:// or https://");
      setIsSaving(false);
      return;
    }

    let cleanCra = "";
    if (craNumber) {
      cleanCra = normalizeCraNumber(craNumber);
      if (!isPlausibleCraNumber(cleanCra)) {
        setError("That doesn't look like a valid CRA Registration Number. It should be 9 digits, then RR, then 4 digits (e.g. 118833011RR0001).");
        setIsSaving(false);
        return;
      }
    }

    if (isDemoMode) {
      setTimeout(() => {
        const updatedProfile = {
          uid: user.uid,
          organizationName: orgName,
          mission,
          description,
          hasCra: cleanCra ? true : false,
          craNumber: cleanCra,
          craVerified: cleanCra ? true : false,
          organizationType: orgType,
          contactEmail: contactEmail,
          phone,
          address,
          coordinates: coords,
          websiteUrl: website,
          northYorkConfirmed: isNorthYork,
          socialLinks: {
            twitter: socialTwitter,
            instagram: socialInstagram,
            linkedin: socialLinkedin,
          },
        };
        localStorage.setItem(
          "demo_org_profile",
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
      await updateDoc(doc(db, "organizations", user.uid), {
        organizationName: orgName,
        mission,
        description,
        hasCra: cleanCra ? true : false,
        craNumber: cleanCra,
        // craVerified is intentionally NOT written here. It previously flipped
        // to true whenever the org typed anything into the CRA field, which
        // meant any organization could grant itself a verified badge just by
        // editing its own profile. Only a reviewer may set this.
        organizationType: orgType,
        contactEmail,
        phone,
        address,
        coordinates: coords,
        northYorkConfirmed: isNorthYork,
        websiteUrl: website,
        socialLinks: {
          twitter: socialTwitter,
          instagram: socialInstagram,
          linkedin: socialLinkedin,
        },
      });
      await refreshProfile();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error("Error updating profile:", err);
      setError(err.message || "Failed to update profile changes.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="max-w-4xl mx-auto py-12 px-4 space-y-8 bg-slate-50/50 rounded-sm p-6 md:p-12 border border-slate-100/50"
    >
      <div className="flex items-center gap-6">
        <div className="w-20 h-20 bg-[#1F4C63] rounded-sm flex items-center justify-center  shadow-blue-100">
          <Building2 className="text-white w-10 h-10" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">
            Organization Profile
          </h1>
          <p className="text-slate-600 mt-2">
            Manage your organization's public identity.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleUpdate}
        className="grid grid-cols-1 md:grid-cols-3 gap-8"
      >
        <div className="md:col-span-2 space-y-8">
          <Card className="rounded-sm border border-slate-100  bg-white overflow-hidden">
            <CardHeader className="border-b border-slate-50">
              <CardTitle className="text-lg flex items-center gap-2 font-bold text-slate-900">
                <Info className="w-5 h-5 text-[#1F4C63]" /> Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-sm text-xs font-bold font-sans">
                  ⚠️ {error}
                </div>
              )}

              <Input
                label="Organization Name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />

              <Select
                label="Organization Type"
                value={orgType}
                onChange={(e) => setOrgType(e.target.value)}
                options={ORGANIZATION_TYPES}
                required
                placeholder="Select organization type"
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Basic Description
                </label>
                <textarea
                  className="w-full rounded-sm border border-slate-200 p-4 text-sm focus:ring-2 focus:ring-[#1F4C63] min-h-[100px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Introduce your organization, objectives, and community presence..."
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Mission Statement
                </label>
                <textarea
                  className="w-full rounded-sm border border-slate-200 p-4 text-sm focus:ring-2 focus:ring-[#1F4C63] min-h-[100px]"
                  value={mission}
                  onChange={(e) => setMission(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-100 animate-fadeIn">
                <Input
                  label="CRA Registered Charity / Business Number (Optional)"
                  value={craNumber}
                  onChange={(e) => setCraNumber(e.target.value)}
                  placeholder="e.g. 123456789RR0001"
                />
                <div className="p-3 bg-[#1F4C63]/5 border border-[#1F4C63]/20 rounded-sm space-y-1">
                  <p className="text-[10px] font-black uppercase text-blue-900 tracking-wider flex items-center gap-1">
                    🇨🇦 Canada Revenue Agency Validation (Optional)
                  </p>
                  <p className="text-[10px] text-blue-800 leading-relaxed font-semibold">
                    Providing your 15-character CRA Registration Number consists of 9 digits, 2 letters, and 4 digits (e.g. 123456789RR0001) is optional, but verifies non-profit or charitable status with a badge.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Input
                  label="Public Contact Email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  required
                />
                <Input
                  label="Public Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="p-5 border border-slate-200 rounded-sm bg-slate-50/50 space-y-4">
                <AddressMapsSelector
                  value={address}
                  onChange={(addr) => setAddress(addr)}
                  onCoordinatesChange={(c) => setCoords(c)}
                  initialCoords={coords}
                />
              </div>

              <Input
                label="Website URL"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
              />

              <div className="space-y-4 pt-4 border-t border-slate-100/70">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">
                  Social Media Links or Handles
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <Input
                    label="Twitter / X Handle"
                    value={socialTwitter}
                    onChange={(e) => setSocialTwitter(e.target.value)}
                    placeholder="e.g. @orgname"
                  />
                  <Input
                    label="Instagram Handle"
                    value={socialInstagram}
                    onChange={(e) => setSocialInstagram(e.target.value)}
                    placeholder="e.g. @orgname"
                  />
                  <Input
                    label="LinkedIn Company URL"
                    value={socialLinkedin}
                    onChange={(e) => setSocialLinkedin(e.target.value)}
                    placeholder="https://linkedin.com/company/..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-sm border border-slate-100  bg-white">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 font-bold text-slate-900 border-none">
                <Globe className="w-5 h-5 text-[#1F4C63]" /> Location Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <label className="flex items-center gap-4 p-6 rounded-sm bg-[#1F4C63]/5 border border-[#1F4C63]/10 cursor-pointer transition-all hover:bg-[#1F4C63]/10/50">
                <input
                  type="checkbox"
                  className="w-6 h-6 rounded-sm text-[#1F4C63] focus:ring-[#1F4C63] border-slate-300"
                  checked={isNorthYork}
                  onChange={(e) => setIsNorthYork(e.target.checked)}
                />
                <div>
                  <p className="font-bold text-blue-900 text-lg tracking-tight">
                    Located in Toronto / North York
                  </p>
                  <p className="text-sm text-[#153343]/70 leading-relaxed font-medium">
                    Verify that your main headquarters or operations are based
                    in the Greater Toronto Area.
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-1 space-y-6">
          {/* Account Security Card */}
          <Card className="rounded-sm border border-[#1F4C63]/10 bg-white p-6 md:p-8  space-y-5">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1F4C63]">Account Security</span>
              <h3 className="text-lg font-bold text-slate-900 mt-1 font-sans flex items-center gap-1.5 flex-wrap">
                <ShieldCheck className="w-5 h-5 text-emerald-600 animate-pulse" />
                <span>Two-Factor Shield</span>
                <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-sm border border-emerald-200/50">
                  Highly Recommended
                </span>
              </h3>
              <p className="text-[11px] text-slate-600 mt-1 leading-relaxed font-semibold">
                Require a secure 6-digit confirmation key to sign in to your dashboard.
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-slate-50 pt-4">
              <div>
                <h4 className="text-xs font-black text-slate-700 text-slate-700 uppercase tracking-wider">
                  MFA Login Gate
                </h4>
                <p className="text-[10px] text-slate-600 font-bold">
                  {(userProfile?.twoFactorEnabled ?? true) ? "Shield is Active" : "Shield is Disabled"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggle2FA}
                className={cn(
                  "w-11 h-6 rounded-sm transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0",
                  (userProfile?.twoFactorEnabled ?? true) ? "bg-emerald-600" : "bg-slate-200",
                )}
              >
                <span
                  className={cn(
                    "bg-white w-5 h-5 rounded-sm  transform transition-transform duration-250",
                    (userProfile?.twoFactorEnabled ?? true) ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
            <p className="text-[10px] text-slate-600 font-medium leading-relaxed border-t border-slate-50 pt-4">
              An identity code will be dispatched to <strong className="text-slate-600">{user?.email}</strong>.
            </p>
          </Card>

          <Card className="bg-slate-900 text-white p-5 sm:p-8 space-y-8 rounded-sm sticky top-24  overflow-hidden">
            <div className="space-y-4">
              <h3 className="text-xl font-bold border-b border-white/10 pb-4">
                Verification Status
              </h3>
              <div className="bg-white/5 p-4 rounded-sm flex items-center gap-3">
                <ShieldCheck className="text-blue-400 w-6 h-6" />
                <span className="text-sm font-bold">Standard Account</span>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-white/40 uppercase tracking-[0.2em] font-black">
                Public Reach
              </p>
              <div className="flex gap-4">
                <div className="flex-1 text-center p-4 bg-white/5 rounded-sm">
                  <Mail className="w-4 h-4 mx-auto mb-2 text-blue-400" />
                  <span className="block text-xl font-black">
                    {contactEmail ? "YES" : "NO"}
                  </span>
                  <span className="text-[10px] text-white/40 font-bold uppercase">
                    EMAILS
                  </span>
                </div>
                <div className="flex-1 text-center p-4 bg-white/5 rounded-sm">
                  <Phone className="w-4 h-4 mx-auto mb-2 text-blue-400" />
                  <span className="block text-xl font-black">
                    {phone ? "YES" : "NO"}
                  </span>
                  <span className="text-[10px] text-white/40 font-bold uppercase">
                    PHONE
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 flex flex-col gap-3">
              {success ? (
                <div className="bg-[#1F4C63] text-white p-4 rounded-sm text-center font-bold animate-in zoom-in-95 duration-200">
                  Changes Saved!
                </div>
              ) : (
                <Button
                  type="submit"
                  className="w-full bg-[#1F4C63] hover:bg-[#1F4C63] py-4 font-black"
                  isLoading={isSaving}
                >
                  Save Changes
                </Button>
              )}

              {!isDemoMode && (
                <div className="border border-red-500/20 bg-red-500/5 p-4 rounded-sm space-y-3">
                  {!showConfirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setShowConfirmDelete(true)}
                      className="w-full text-center text-red-400 hover:text-red-300 font-extrabold text-[11px] uppercase tracking-wider py-3 hover:bg-white/5 rounded-sm border border-dashed border-red-500/30 transition-all cursor-pointer"
                    >
                      ⚠️ Delete Organization Profile
                    </button>
                  ) : (
                    <div className="space-y-3 text-left">
                      <p className="text-xs font-bold text-red-400 leading-normal">
                        ⚠️ WARNING: Are you sure you want to PERMANENTLY delete your organization? All postings, applicants, and archives will be deleted from the registry. You cannot undo this.
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
                          className="bg-white/5 border-white/15 focus:border-white/30 text-white"
                        />
                      </div>
                      
                      {deleteError && (
                        <p className="text-[10px] font-black uppercase text-red-400 font-mono">
                          {deleteError}
                        </p>
                      )}

                      <div className="flex gap-2 justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowConfirmDelete(false);
                            setDeleteConfirmEmail("");
                            setDeleteError("");
                          }}
                          className="px-4 py-2 text-slate-600 hover:text-white font-extrabold text-[10px] uppercase tracking-wider rounded-sm hover:bg-white/5"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={handleDeleteAccountInput}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-sm  rounded-full"
                        >
                          {isDeleting ? "Deleting..." : "Delete Org"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-[#1F4C63]/10 rounded-sm blur-3xl -z-10" />
          </Card>
        </div>
      </form>
    </motion.div>
  );
}
