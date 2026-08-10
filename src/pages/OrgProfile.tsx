import React, { useState, useEffect } from "react";
import { reportError } from "../lib/errors";
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
import { Badge } from "../components/ui/Badge";
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

  // A Gmail "broadcasts" toggle and a "send test email" handler used to live
  // here, but no button ever rendered either — dead scaffolding from the
  // demo-oriented Gmail surface. Removed rather than left as unreachable code;
  // the real email test lives in the developer console.

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
      // Was a browser alert containing err.message — a raw Firebase string,
      // shown blocking and unstyled. reportError logs the original and returns
      // a sentence.
      setError(reportError('org 2FA toggle', err, 'Could not change the two-factor setting. Please try again.'));
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
      className="max-w-4xl mx-auto py-12 px-4 space-y-8 bg-paper-2/50 rounded-lg p-6 md:p-12 border border-line/50"
    >
      <div className="flex items-center gap-6">
        <div className="w-20 h-20 bg-blue-dark rounded-lg flex items-center justify-center">
          <Building2 className="text-white w-10 h-10" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold text-ink tracking-tight leading-none">
            Organization Profile
          </h1>
          <p className="text-ink-soft mt-2">
            Manage your organization's public identity.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleUpdate}
        className="grid grid-cols-1 md:grid-cols-3 gap-8"
      >
        <div className="md:col-span-2 space-y-8">
          <Card className="rounded-lg border border-line bg-white overflow-hidden">
            <CardHeader className="border-b border-line-light">
              <CardTitle className="text-lg flex items-center gap-2 font-bold text-ink">
                <Info className="w-5 h-5 text-blue-dark" /> Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-bold font-sans">
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
                <label className="text-sm font-medium text-ink-soft">
                  Basic Description
                </label>
                <textarea
                  className="w-full rounded-lg border border-line p-4 text-sm focus:ring-2 focus:ring-blue-dark min-h-[100px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  aria-label="Basic description"
                  placeholder="Introduce your organization, objectives, and community presence..."
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-ink-soft">
                  Mission Statement
                </label>
                <textarea
                  aria-label="Mission statement"
                  className="w-full rounded-lg border border-line p-4 text-sm focus:ring-2 focus:ring-blue-dark min-h-[100px]"
                  value={mission}
                  onChange={(e) => setMission(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5 pt-2 border-t border-line animate-fadeIn">
                <Input
                  label="CRA Registered Charity / Business Number (Optional)"
                  value={craNumber}
                  onChange={(e) => setCraNumber(e.target.value)}
                  placeholder="e.g. 123456789RR0001"
                />
                <div className="p-4 bg-paper-2 border border-line rounded-lg space-y-1">
                  <p className="text-xs font-semibold uppercase text-ink-soft tracking-wider flex items-center gap-1">
                    🇨🇦 Canada Revenue Agency Validation (Optional)
                  </p>
                  <p className="text-xs text-ink-soft leading-relaxed font-medium">
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

              <div className="p-5 border border-line rounded-lg bg-paper-2/50 space-y-4">
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

              <div className="space-y-4 pt-4 border-t border-line/70">
                <p className="text-xs font-semibold text-ink-soft ml-1">
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

          <Card className="rounded-lg border border-line bg-white">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 font-bold text-ink border-none">
                <Globe className="w-5 h-5 text-blue-dark" /> Location Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <label className="flex items-center gap-4 p-6 rounded-lg bg-blue-dark/5 border border-blue-dark/10 cursor-pointer transition-all hover:bg-blue-dark/10">
                <input
                  type="checkbox"
                  className="w-6 h-6 rounded-lg text-blue-dark focus:ring-blue-dark border-slate-300"
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
          <Card className="rounded-lg border border-blue-dark/10 bg-white p-6 md:p-8 space-y-5">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-blue-dark">Account Security</span>
              <h3 className="text-lg font-bold text-ink mt-1 font-sans flex items-center gap-1.5 flex-wrap">
                <ShieldCheck className="w-5 h-5 text-emerald-600 animate-pulse" />
                <span>Two-Factor Shield</span>
                <span className="text-xs font-semibold tracking-wide bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-lg border border-emerald-200/50">
                  Highly Recommended
                </span>
              </h3>
              <p className="text-xs text-ink-soft mt-1 leading-relaxed font-semibold">
                Require a secure 6-digit confirmation key to sign in to your dashboard.
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-line-light pt-4">
              <div>
                <h4 className="text-xs font-semibold text-ink-soft">
                  MFA Login Gate
                </h4>
                <p className="text-xs text-ink-soft font-bold">
                  {(userProfile?.twoFactorEnabled ?? true) ? "Shield is Active" : "Shield is Disabled"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggle2FA}
                className={cn(
                  "w-11 h-6 rounded-lg transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0",
                  (userProfile?.twoFactorEnabled ?? true) ? "bg-emerald-600" : "bg-slate-200",
                )}
              >
                <span
                  className={cn(
                    "bg-white w-5 h-5 rounded-lg transform transition-transform duration-250",
                    (userProfile?.twoFactorEnabled ?? true) ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
            <p className="text-xs text-ink-soft font-medium leading-relaxed border-t border-line-light pt-4">
              An identity code will be dispatched to <strong className="text-ink-soft">{user?.email}</strong>.
            </p>
          </Card>

          <Card className="bg-white border border-line p-5 sm:p-8 space-y-8 rounded-lg sticky top-24 overflow-hidden shadow-none">
            <div className="space-y-4">
              <h3 className="text-xl font-bold border-b border-line-light pb-4 text-ink">
                Verification Status
              </h3>
              <div className="bg-paper-2 border border-line-light p-4 rounded-lg flex items-center gap-3">
                <ShieldCheck className="text-emerald-600 w-6 h-6" />
                <span className="text-sm font-bold text-ink">Standard Account</span>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-ink-soft uppercase tracking-wide font-semibold">
                Public Reach
              </p>
              <div className="flex gap-4">
                <div className="flex-1 text-center p-4 bg-paper-2 border border-line-light rounded-lg">
                  <Mail className="w-4 h-4 mx-auto mb-2 text-blue-dark" />
                  <span className="block text-xl font-semibold text-ink">
                    {contactEmail ? "YES" : "NO"}
                  </span>
                  <span className="text-xs text-ink-soft font-bold uppercase">
                    EMAILS
                  </span>
                </div>
                <div className="flex-1 text-center p-4 bg-paper-2 border border-line-light rounded-lg">
                  <Phone className="w-4 h-4 mx-auto mb-2 text-blue-dark" />
                  <span className="block text-xl font-semibold text-ink">
                    {phone ? "YES" : "NO"}
                  </span>
                  <span className="text-xs text-ink-soft font-bold uppercase">
                    PHONE
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 flex flex-col gap-3">
              {success ? (
                <div className="bg-blue-dark text-white p-4 rounded-lg text-center font-bold animate-in zoom-in-95 duration-200">
                  Changes Saved!
                </div>
              ) : (
                <Button
                  type="submit"
                  className="w-full bg-blue-dark hover:bg-[#153343] py-4 font-semibold"
                  isLoading={isSaving}
                >
                  Save Changes
                </Button>
              )}

              {!isDemoMode && (
                <div className="border border-red-200 bg-red-50 p-4 rounded-lg space-y-3">
                  {!showConfirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setShowConfirmDelete(true)}
                      className="w-full text-center text-red-600 hover:text-red-700 font-semibold text-xs py-3 hover:bg-red-100 rounded-lg border border-dashed border-red-300 transition-all cursor-pointer"
                    >
                      ⚠️ Delete Organization Profile
                    </button>
                  ) : (
                    <div className="space-y-3 text-left">
                      <p className="text-xs font-bold text-red-600 leading-normal">
                        ⚠️ WARNING: Are you sure you want to PERMANENTLY delete your organization? All postings, applicants, and archives will be deleted from the registry. You cannot undo this.
                      </p>
                      <div>
                        <label className="block text-xs font-semibold uppercase text-red-700 mb-1">
                          Type email to confirm ({user?.email})
                        </label>
                        <Input
                          type="text"
                          value={deleteConfirmEmail}
                          onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                          placeholder={user?.email || "Email address"}
                          className="bg-white border-red-200 focus:border-red-400 text-ink"
                        />
                      </div>
                      
                      {deleteError && (
                        <p className="text-xs font-semibold uppercase text-red-600 font-mono">
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
                          className="px-4 py-2 text-red-700 hover:text-red-800 font-semibold text-xs rounded-lg hover:bg-red-100 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={handleDeleteAccountInput}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-lg rounded-full cursor-pointer"
                        >
                          {isDeleting ? "Deleting..." : "Delete Org"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-blue-dark/5 rounded-lg blur-3xl -z-10" />
          </Card>
        </div>
      </form>
    </motion.div>
  );
}
