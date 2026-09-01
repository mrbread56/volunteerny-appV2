import React, { useState, useEffect } from "react";
import { usePageTitle } from '../hooks/usePageTitle';
import { reportError } from "../lib/errors";
import { ORGANIZATION_TYPES } from '../constants';
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase/config";
import { doc, updateDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import SearchableSelect from "../components/ui/SearchableSelect";
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
import { deleteOwnAccount } from "../lib/deleteAccount";
import { isPlausibleCraNumber, normalizeCraNumber } from "../lib/craValidation";
import RecoveryCodes from '../components/RecoveryCodes';
import ChangePassword from '../components/ChangePassword';


export default function OrgProfile() {
  usePageTitle('Organisation profile');
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
        // Deleted server-side — firestore.rules forbids the client deleting
        // either document, so this always failed. Same fix and same reasoning
        // as StudentProfile. The endpoint additionally removes this
        // organization's opportunities and the applications to them; without
        // that, deleting the account left world-readable postings live that
        // students could still apply to and nobody could ever accept.
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

  const handleToggle2FA = async () => {
    if (!user) return;
    /*
     * Two-factor is MANDATORY for organisations, and firestore.rules enforces
     * it: isValidUser permits `twoFactorEnabled: false` only when
     * role == 'student'. So every click of this switch returned
     * permission-denied and showed "Could not change the two-factor setting.
     * Please try again." in a card near the top of a different section — an
     * error inviting a retry that can never work, on a control that is not
     * allowed to do anything. The switch renders locked-on instead; see the
     * copy beside it.
     */
    setError('Two-step sign-in is required for organisations, because your account holds the contact details of minors. It cannot be turned off.');
  };

  // Profile Fields
  const [orgName, setOrgName] = useState(orgProfile?.organizationName || "");
  const [mission, setMission] = useState(orgProfile?.mission || "");
  const [description, setDescription] = useState(orgProfile?.description || "");
  const [hasCra, setHasCra] = useState(orgProfile?.hasCra ?? true);
  const [craNumber, setCraNumber] = useState(orgProfile?.craNumber || "");
  const [orgType, setOrgType] = useState(orgProfile?.organizationType || "");
  const [orgTypeOther, setOrgTypeOther] = useState(orgProfile?.organizationTypeOther || "");
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
      setOrgTypeOther(orgProfile.organizationTypeOther || "");
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
          organizationTypeOther: orgType === 'Other' ? orgTypeOther.trim() : '',
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
        //
        // verificationStatus IS written, but only ever to 'pending' — a request
        // to be reviewed, not a claim to be verified (the rules enforce that
        // too). Without it an organization that got charitable status after
        // signing up could enter its CRA number and never reach the reviewer's
        // queue, which lists 'pending' only.
        // NOT for an already-verified organisation.
        //
        // This wrote verificationStatus: 'pending' whenever a number was
        // present and craVerified was false — and craVerified is false for
        // every approved organisation that is not a registered charity. So a
        // verified clinic or care home typing its BUSINESS number into a field
        // labelled "CRA Registered Charity / Business Number (Optional)"
        // silently moved itself back to pending, and isApprovedOrg() then
        // refused posting, editing, closing and every accept or reject. No
        // warning, no confirmation, no notice afterwards.
        ...(cleanCra
            && !orgProfile?.craVerified
            && orgProfile?.verificationStatus !== 'pending'
            && orgProfile?.verificationStatus !== 'verified'
          ? { verificationStatus: 'pending' }
          : {}),
        organizationType: orgType,
        organizationTypeOther: orgType === 'Other' ? orgTypeOther.trim() : '',
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
          <h1 className="text-3xl font-bold text-ink tracking-tight leading-none">
            Organization Profile
          </h1>
          <p className="text-ink-soft mt-2">
            Manage your organization's public identity.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleUpdate}
        /* A fixed 340px rail rather than one third of the grid.
           md:grid-cols-3 gave the side column about 190px, which is why
           "Create recovery codes" wrapped onto three lines inside its own
           button, "Delete Organization Profile" onto two, and the two-step
           sign-in explanation became a wall of 13px text in a 20-character
           measure. 340px is inside the 240-400px band the major systems use
           for a secondary rail. */
        className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-8" 
      >
        <div className="space-y-8">
          <Card className="rounded-lg border border-line bg-white overflow-hidden">
            <CardHeader className="border-b border-line-light">
              <CardTitle className="text-lg flex items-center gap-2 font-bold text-ink">
                <Info className="w-5 h-5 text-blue-dark" /> Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {error && (
                <div role="alert" aria-live="assertive" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-bold font-sans">
                  ⚠️ {error}
                </div>
              )}

              <Input
                label="Organization Name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />

              <SearchableSelect
                label="Organization Type"
                value={orgType}
                onChange={(v: string) => {
                  setOrgType(v);
                  if (v !== 'Other') setOrgTypeOther('');
                }}
                options={ORGANIZATION_TYPES}
                required
                placeholder="Search organization types…"
              />
              {orgType === 'Other' && (
                <Input
                  label="Please specify"
                  value={orgTypeOther}
                  onChange={(e) => setOrgTypeOther(e.target.value)}
                  placeholder="What kind of organization are you?"
                  maxLength={80}
                  required
                />
              )}

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
                {/* Two columns, not three. The form column is about 476px
                    now that the rail is a fixed 340px, so three columns gave
                    each field roughly 140px — every label wrapped onto two
                    lines and every placeholder truncated mid-word. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
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
                  className="w-6 h-6 rounded-lg text-blue-dark focus:ring-blue-dark border-line"
                  checked={isNorthYork}
                  onChange={(e) => setIsNorthYork(e.target.checked)}
                />
                <div>
                  <p className="font-bold text-blue-dark text-lg tracking-tight">
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

        <div className="space-y-6">

          {/* Account Security Card */}
          <Card className="rounded-lg border border-blue-dark/10 bg-white p-6 md:p-8 space-y-5">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-blue-dark">Account Security</span>
              <h3 className="text-lg font-bold text-ink mt-1 font-sans flex items-center gap-1.5 flex-wrap">
                <ShieldCheck className="w-5 h-5 text-emerald-600 " />
                <span>Two-step sign-in</span>
                {/* "Required", not "Highly Recommended". firestore.rules refuses
                    any non-student write of twoFactorEnabled: false, so this has
                    never been optional for an organisation — the copy simply
                    said otherwise while the switch beside it could not move. */}
                <span className="text-xs font-semibold tracking-wide bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-lg border border-emerald-200/50">
                  Required
                </span>
              </h3>
              <p className="text-xs text-ink-soft mt-1 leading-relaxed font-semibold">
                A 6-digit confirmation key is sent to your contact address every time you sign in.
                This is required for organisation accounts, because your dashboard holds the names,
                schools and contact details of students under 18.
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-line-light pt-4">
              <div>
                <h4 className="text-xs font-semibold text-ink-soft">
                  MFA Login Gate
                </h4>
                <p className="text-xs text-ink-soft font-bold">
                  {(userProfile?.twoFactorEnabled ?? true) ? "Active" : "Not yet active"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggle2FA}
                role="switch"
                aria-label="Two-step sign-in is required for organisation accounts"
                aria-disabled="true"
                aria-checked={userProfile?.twoFactorEnabled ?? true}
                className={cn(
                  "w-11 h-6 rounded-lg transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0",
                  (userProfile?.twoFactorEnabled ?? true) ? "bg-emerald-600" : "bg-line",
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

            <RecoveryCodes />
            <ChangePassword />
            <p className="text-xs text-ink-soft font-medium leading-relaxed border-t border-line-light pt-4">
              We send a 6-digit code to <strong className="text-ink-soft">{user?.email}</strong> each
              time you sign in. Staying signed in on this device won't ask again — only a new sign-in will.
            </p>
          </Card>

          <Card className="bg-white border border-line p-5 sm:p-8 space-y-8 rounded-lg sticky top-24 overflow-hidden shadow-none">
            <div className="space-y-4">
              <h3 className="text-xl font-bold border-b border-line-light pb-4 text-ink">
                Verification Status
              </h3>
              {/* This card was hardcoded to "Standard Account" with a green
                  shield, so it said the same thing forever — including after a
                  developer approved the organization and the notification bell
                  had already told them "Your organization is verified" and
                  linked them here. It now reads the actual state. */}
              {(() => {
                const hasCraNumber = !!String(orgProfile?.craNumber || '').trim();
                const status = orgProfile?.craVerified
                  ? 'verified'
                  : (orgProfile?.verificationStatus || 'unverified');
                const view = {
                  /*
                   * Two different approvals, and they must not claim the same
                   * thing. craVerified means a CRA charity registration was
                   * looked up; verificationStatus 'verified' only means a
                   * person approved the organization.
                   *
                   * Non-charities could not reach the reviewer at all until
                   * 28 Aug 2026, so every approved organization had a CRA
                   * number and one wording covered both. Now a private clinic
                   * can be approved, and telling it we checked a charity
                   * registration it never had would be a plain untruth shown
                   * on its own dashboard.
                   */
                  verified: orgProfile?.craVerified ? {
                    cls: 'bg-emerald-50 border-emerald-200 text-emerald-800',
                    icon: 'text-emerald-600',
                    label: 'Verified charity',
                    note: 'Your CRA registration has been checked by our team.',
                  } : {
                    cls: 'bg-emerald-50 border-emerald-200 text-emerald-800',
                    icon: 'text-emerald-600',
                    label: 'Verified organization',
                    note: 'Your organization has been reviewed and approved by our team.',
                  },
                  /*
                   * These three branches assumed every organisation is a
                   * charity. Non-charities have been admissible since 28 Aug
                   * 2026, and the reviewer's own screen says so: "Not a
                   * registered charity. Nothing to look up in the CRA
                   * registry." A clinic that was rejected was told to fix a
                   * number it never entered and cannot find, and never learned
                   * the real reason — an unconfirmable website, an address
                   * outside North York, a contact address that does not match
                   * the domain. The one actionable path was hidden behind a
                   * fabricated one. There is also no CRA lookup in this
                   * codebase at all; craValidation.ts is a format check.
                   */
                  pending: {
                    cls: 'bg-amber-50 border-amber-200 text-amber-900',
                    icon: 'text-amber-600',
                    label: 'Awaiting review',
                    note: hasCraNumber
                      ? 'A person is checking your CRA registration against the public registry. This usually takes a few days.'
                      : 'A person is reviewing your organization. They check your website, your address, and that your contact email matches your domain. This usually takes a few days.',
                  },
                  rejected: {
                    cls: 'bg-red-50 border-red-200 text-red-800',
                    icon: 'text-red-600',
                    label: 'Could not be verified',
                    note: hasCraNumber
                      ? 'We could not match your CRA registration number. Please check it below, and reply to our email if you think it is correct.'
                      : 'We could not confirm your organization from the details we have. Adding a website, and making sure your address and contact email match it, is usually what helps. Reply to our email and a person will look again.',
                  },
                  unverified: {
                    cls: 'bg-paper-2 border-line-light text-ink',
                    icon: 'text-ink-muted',
                    label: 'Standard account',
                    note: 'A person reviews every organization before it can post. If you are a registered charity, adding your CRA number below is the fastest route; if you are not, we check your website and address instead.',
                  },
                }[status as 'verified' | 'pending' | 'rejected' | 'unverified'] ?? {
                  cls: 'bg-paper-2 border-line-light text-ink',
                  icon: 'text-ink-muted',
                  label: 'Standard account',
                  note: '',
                };
                return (
                  <div className={cn('border p-4 rounded-lg space-y-2', view.cls)}>
                    <div className="flex items-center gap-3">
                      <ShieldCheck className={cn('w-6 h-6 shrink-0', view.icon)} />
                      <span className="text-sm font-bold">{view.label}</span>
                    </div>
                    {view.note && <p className="text-xs leading-relaxed opacity-90">{view.note}</p>}
                  </div>
                );
              })()}
            </div>

            {/* What a student actually sees, not YES/NO tiles.
                This was two stat-shaped cards reading "YES EMAILS" and
                "NO PHONE", which restate whether the two fields above are
                filled in. A big YES in a tile implies a measurement; this was
                form completeness. Showing the real values, and naming what is
                missing, is the version an organisation can act on. */}
            <div className="space-y-3">
              <p className="text-xs text-ink-soft uppercase tracking-wide font-semibold">
                How students can reach you
              </p>
              <ul className="space-y-2">
                {[
                  { Icon: Mail, label: 'Email', value: contactEmail, required: true },
                  { Icon: Phone, label: 'Phone', value: phone, required: false },
                  { Icon: Globe, label: 'Website', value: website, required: false },
                ].map(({ Icon, label, value, required }) => (
                  <li key={label} className="flex items-start gap-2.5 text-xs">
                    <Icon className="w-4 h-4 mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="text-ink-soft">{label}: </span>
                      {value
                        ? <span className="text-ink break-words">{value}</span>
                        : <span className="text-ink-muted">
                            not added{required ? '' : ' (optional)'}
                          </span>}
                    </span>
                  </li>
                ))}
              </ul>
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
                        {/* Named explicitly: the visible label carries a JSX expression, so it
                            was skipped by the sweep that fixed the plain-text ones.
                            This is the confirmation gate on permanent account deletion. */}
                        <Input
                          type="text"
                          aria-label="Type your email address to confirm account deletion"
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
