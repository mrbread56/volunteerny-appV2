import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, sendEmailVerification } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { sendTransactionalEmail } from "../lib/emailService";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import { useAuth } from "../contexts/AuthContext";
import { Users, GraduationCap, Building2, ShieldCheck, Lock, AlertCircle } from "lucide-react";
import { cn } from "../lib/utils";
import { TORONTO_SCHOOLS, NEIGHBORHOODS } from "../constants";
import { isPlausibleCraNumber, normalizeCraNumber } from "../lib/craValidation";
import AddressMapsSelector from "../components/AddressMapsSelector";
import { motion } from "motion/react";

const ORGANIZATION_TYPES = [
  { value: "Registered Charity", label: "Registered Charity" },
  { value: "Non-Profit Organization (NPO)", label: "Non-Profit Organization (NPO)" },
  { value: "Community Group", label: "Community Group" },
  { value: "High School / Education", label: "School / Educational Institution" },
  { value: "Healthcare / Hospital Foundation", label: "Healthcare & Hospital Foundation" },
  { value: "Religious / Faith-Based", label: "Religious & Faith-Based Organization" },
  { value: "Sports / Recreational Club", label: "Sports & Recreational Club" },
  { value: "Other", label: "Other Group" },
];

const GRADES = [
  { value: "9", label: "Grade 9" },
  { value: "10", label: "Grade 10" },
  { value: "11", label: "Grade 11" },
  { value: "12", label: "Grade 12" },
];

const INTERESTS = [
  "Animal Welfare", "Arts & Culture", "Children & Youth", "Community Services",
  "Education", "Environment", "Event Planning", "Food Banks",
  "Health & Hospitals", "Seniors", "Sports", "Technology", "Tutoring", "Other",
];

const SKILLS = [
  "Communication", "Computer & Tech", "Creative & Design", "Event Support",
  "Language Skills", "Leadership", "Organization", "Physical Work",
  "Research & Writing", "Teaching",
];

const AVAILABILITY = [
  "Weekday Mornings", "Weekday Afternoons", "Weekday Evenings",
  "Weekend Mornings", "Weekend Afternoons", "Weekend Evenings", "Flexible",
];

export default function Signup() {
  const [role, setRole] = useState<"student" | "organization" | null>(null);
  const [setupStage, setSetupStage] = useState<"role-select" | "form">("role-select");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  
  const navigate = useNavigate();
  const { user, userProfile, profileMissing, refreshProfile } = useAuth();

  // Set for the whole duration of handleSignup. createUserWithEmailAndPassword
  // signs the user in immediately, so onAuthStateChanged fires and reads
  // users/{uid} *before* the setDoc below has written it — profileMissing flips
  // true, the redirect effect below fired, and Signup unmounted mid-submit,
  // stranding the user on "Account setup didn't finish". The redirect must not
  // act on the transient state of a signup that is still running.
  const signupInFlight = React.useRef(false);

  React.useEffect(() => {
    if (signupInFlight.current) return;
    if (!user) return;
    // Same profile-resolution race as Login.tsx: `user` lands before the
    // Firestore profile read finishes, so routing on an undefined role sent
    // people to the wrong dashboard and let the guards bounce them.
    if (!userProfile && !profileMissing) return;

    if (userProfile?.role === 'developer') {
      navigate("/developer/dashboard", { replace: true });
    } else if (userProfile?.role === 'organization') {
      navigate("/org/dashboard", { replace: true });
    } else {
      navigate("/student/dashboard", { replace: true });
    }
  }, [user, userProfile, profileMissing, navigate]);
  
  // Form State
  const [fullName, setFullName] = useState("");
  const [selectedSchool, setSelectedSchool] = useState("");
  const [otherSchool, setOtherSchool] = useState("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedAvailability, setSelectedAvailability] = useState<string[]>([]);
  
  const [orgName, setOrgName] = useState("");
  const [mission, setMission] = useState("");
  const [orgType, setOrgType] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{lat: number, lng: number} | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isNorthYork, setIsNorthYork] = useState(false);
  const [website, setWebsite] = useState("");
  const [hasCra, setHasCra] = useState<"yes" | "no" | null>(null);
  const [craNumber, setCraNumber] = useState("");
  
  const [consent, setConsent] = useState(false);

  const toggleItem = (item: string, list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (list.includes(item)) {
      setList(list.filter(i => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) return;

    if (role === "organization") {
      // Previously this only validated `if (craNumber)`, so an organization
      // could answer "yes, we are a registered charity", leave the field blank,
      // and still be written to Firestore with craVerified: true.
      if (hasCra === "yes") {
        const cleanCra = craNumber.replace(/[\s-]/g, "").toUpperCase();
        if (!cleanCra) {
          setError("Please enter your CRA Registration Number, or select \"No\" if your organization is not a registered charity.");
          return;
        }
        if (!isPlausibleCraNumber(cleanCra)) {
          setError("That doesn't look like a valid CRA Registration Number. It should be 9 digits, then RR, then 4 digits (e.g. 118833011RR0001).");
          return;
        }
      }
    }

    if (!consent) {
      setError("Please agree to our Terms and Privacy Policy.");
      return;
    }

    setIsLoading(true);
    signupInFlight.current = true;
    setError("");

    try {
      const normalizedEmail = email.trim().toLowerCase();

      // A signup that died after the auth account was created but before the
      // profile was written used to be unrecoverable: retrying hit
      // auth/email-already-in-use forever. Sign back in with the same
      // credentials instead and finish the profile writes. If the password
      // doesn't match, the email really is someone else's — rethrow the
      // original error so the message is unchanged for that case.
      let user;
      try {
        user = (await createUserWithEmailAndPassword(auth, email, password)).user;
      } catch (createErr: any) {
        if (createErr?.code !== 'auth/email-already-in-use') throw createErr;
        try {
          user = (await signInWithEmailAndPassword(auth, email, password)).user;
        } catch {
          throw createErr;
        }
        // Already fully set up — this is a sign-in, not a signup.
        const existing = await getDoc(doc(db, "users", user.uid));
        if (existing.exists()) {
          await refreshProfile();
          signupInFlight.current = false;
          return;
        }
      }

      try {
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: normalizedEmail,
          role,
          // Two-factor is required for organizations (they hold contact details
          // for many students, often minors) but not forced on students at
          // signup, where the emailed-code round trip was causing drop-off.
          // Students can still enable it later from their settings.
          twoFactorEnabled: role === "organization",
          createdAt: serverTimestamp(),
        });

        if (role === "student") {
          await setDoc(doc(db, "students", user.uid), {
            uid: user.uid,
            fullName,
            school: school || selectedSchool,
            grade,
            neighborhood,
            interests: selectedInterests,
            skills: selectedSkills,
            availability: selectedAvailability,
            resumeUrl: "",
            passportUrl: "",
          });
        } else {
          await setDoc(doc(db, "organizations", user.uid), {
            uid: user.uid,
            organizationName: orgName,
            mission,
            organizationType: orgType,
            address,
            coordinates: coords,
            contactEmail: (contactEmail || normalizedEmail),
            phone,
            northYorkConfirmed: isNorthYork,
            websiteUrl: website,
            hasCra,
            craNumber: hasCra === "yes" ? normalizeCraNumber(craNumber) : "",
            // NOT self-declared. An organization typing its own number proves
            // nothing; previously this wrote craVerified: true purely because
            // the applicant selected "yes". Verification is a decision made by
            // a human reviewer against the CRA charity registry, so new orgs
            // start unverified and pending.
            craVerified: false,
            verificationStatus: hasCra === "yes" ? "pending" : "unverified",
          });
        }
      } catch (profileErr: any) {
        // Deliberately NOT deleteUser(). Rolling the auth account back on any
        // profile-write failure is what made this look like "the site forgot my
        // account": the password was accepted at signup, the write failed, the
        // credentials were destroyed, and the next login said "Incorrect email
        // or password". Keep the account — the resume path above lets the same
        // email and password retry and finish the profile.
        console.error('Profile write failed during signup:', profileErr);
        setError(
          profileErr?.code === 'permission-denied'
            ? "Your account was created, but we couldn't save your profile. Please try submitting again."
            : "We couldn't finish setting up your profile. Your account is safe — please try again."
        );
        return;
      }

      // The account and both profile documents exist at this point, so from
      // here on nothing may reach the outer catch. It previously could: a
      // failed sendEmailVerification threw into the generic handler and told
      // the user "Something went wrong creating your account" even though the
      // account was created, leaving them signed in but convinced they had
      // failed — and every retry then hit auth/email-already-in-use.
      try {
        await sendEmailVerification(user);
      } catch (verifyErr) {
        console.error('Verification email could not be sent for', normalizedEmail, verifyErr);
      }
      try {
        await refreshProfile();
      } catch (refreshErr) {
        console.error('Profile refresh after signup failed:', refreshErr);
      }

      if (role === "student") {
        sendTransactionalEmail({
          to: normalizedEmail,
          subject: "Welcome to Volunteer North York",
          templateName: "welcome_student",
          templateData: {
            studentName: fullName || "Student"
          }
        }).catch(err => console.error(err));
      } else {
        sendTransactionalEmail({
          to: contactEmail || normalizedEmail,
          subject: `${orgName} is registered on Volunteer North York`,
          templateName: "notification",
          templateData: {
            heading: `Welcome, ${orgName}`,
            details: `Your organization account has been created. A member of our team reviews new organizations before opportunities go live, so you may not appear in search results right away. In the meantime you can finish your profile and draft your first opportunity.`,
            actionLabel: "Complete your profile",
            actionUrl: `${window.location.origin}/org/profile`
          }
        }).catch(err => console.error(err));
      }

      navigate(role === "student" ? "/student/onboarding" : "/org/profile");
    } catch (err: any) {
      const friendlyErrors: Record<string, string> = {
        'auth/email-already-in-use': 'This email is already registered. Please sign in instead.',
        'auth/weak-password': 'Password is too weak. Please use at least 6 characters.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
        'auth/network-request-failed': 'Network error. Please check your internet connection.',
        'auth/operation-not-allowed': 'Sign-up is temporarily unavailable. Please try again later.',
      };
      setError(friendlyErrors[err.code] || 'Something went wrong creating your account. Please try again.');
    } finally {
      setIsLoading(false);
      signupInFlight.current = false;
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center p-6 bg-white">
      
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-xl relative z-10 my-8"
      >
        <Card className="w-full overflow-hidden">
          <CardHeader className="text-center pb-2 pt-10">
            <CardTitle className="text-[1.5rem] font-semibold tracking-[-0.02em] text-ink">
              Create an Account
            </CardTitle>
            <p className="text-ink-soft text-[14px] mt-2">Join Volunteer North York</p>
          </CardHeader>
          <CardContent className="space-y-6 pt-6 pb-10">
            {error && (
              <div role="alert" aria-live="assertive" className="bg-red-50 text-red-700 p-3.5 text-[13px] border border-red-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="leading-relaxed">{error}</p>
              </div>
            )}
            
            {setupStage === "role-select" ? (
              <div className="space-y-4">
                <Button 
                  type="button"
                  variant={role === "student" ? "primary" : "outline"}
                  onClick={() => setRole("student")}
                  className="w-full h-16 flex items-center justify-start px-6 gap-4"
                >
                  <GraduationCap className="w-6 h-6" />
                  <div className="text-left">
                    <div className="font-bold">I'm a Student</div>
                    <div className="text-xs opacity-80">Find volunteer hours</div>
                  </div>
                </Button>
                <Button 
                  type="button"
                  variant={role === "organization" ? "primary" : "outline"}
                  onClick={() => setRole("organization")}
                  className="w-full h-16 flex items-center justify-start px-6 gap-4"
                >
                  <Building2 className="w-6 h-6" />
                  <div className="text-left">
                    <div className="font-bold">I'm an Organization</div>
                    <div className="text-xs opacity-80">Post volunteer opportunities</div>
                  </div>
                </Button>

                {role && (
                  <Button 
                    className="w-full mt-4" 
                    variant="primary"
                    onClick={() => setSetupStage("form")}
                  >
                    Continue
                  </Button>
                )}
                <div className="mt-6 text-center text-[13px] text-ink-soft">

                  <div className="pt-4">
                    Already have an account?{" "}
                    <Link to="/login" className="text-blue-dark hover:text-ink font-medium">
                      Sign in
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSignup} className="space-y-6">
                {role === "student" ? (
                  <>
                    <Input
                      label="Full Name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                    <Select
                      label="Grade"
                      options={GRADES}
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      required
                    />
                  </>
                ) : (
                  <>
                    <Input
                      label="Organization Name"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required
                    />
                    <Input
                      label="Mission Statement"
                      value={mission}
                      onChange={(e) => setMission(e.target.value)}
                      required
                    />
                    <Select
                      label="Organization Type"
                      options={ORGANIZATION_TYPES}
                      value={orgType}
                      onChange={(e) => setOrgType(e.target.value)}
                      required
                    />
                    
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-ink">Organization Address <span className="text-red-500">*</span></label>
                      <AddressMapsSelector
                        value={address}
                        onChange={setAddress}
                        onCoordinatesChange={setCoords}
                      />
                    </div>

                  </>
                )}
                
                <div className="pt-4 border-t border-line">
                  <div className="text-[14px] font-medium text-ink mb-4">Account Details</div>
                  <div className="space-y-4">
                    <Input
                      label="Email Address"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                    <Input
                      label="Password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="At least 6 characters"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="consent"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="w-4 h-4 rounded-full border-line text-blue-dark focus:ring-blue-dark"
                  />
                  <label htmlFor="consent" className="text-[12px] text-ink-soft">
                    I agree to the Terms of Service and Privacy Policy
                  </label>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setSetupStage("role-select")}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    className="flex-[2]"
                    isLoading={isLoading}
                  >
                    Create Account
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
