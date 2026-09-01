import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, deleteUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { API_BASE_URL } from "../lib/config";
import { useAuth } from "../contexts/AuthContext";
import { verifyMfaClaim } from "../lib/mfa";
import { toUserMessage } from "../lib/errors";
import { Spinner } from "../components/ui/Spinner";
import { AlertCircle } from "lucide-react";
import { motion } from "motion/react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [resetNotice, setResetNotice] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const navigate = useNavigate();
  const { user, userProfile, profileMissing, mfaVerified, authError } = useAuth();

  // Set for the whole duration of handleGoogleLogin. The popup signs the user
  // in, so onAuthStateChanged fires and profileMissing flips true while we are
  // still deciding whether to delete the account it just created — and the
  // effect below would race us to /signup, without the explanation we want to
  // hand over. The Google handler owns the routing for its own flow.
  const googleFlowInFlight = React.useRef(false);

  useEffect(() => {
    if (googleFlowInFlight.current) return;
    if (!user) return;

    // Wait until the profile is actually resolved before routing.
    //
    // onAuthStateChanged sets `user` immediately and only then awaits the
    // Firestore profile read, so this effect used to fire once with
    // userProfile === null. `userProfile?.role` was undefined, fell through to
    // the else branch, and pushed EVERY user (developers included) to
    // /student/dashboard before their real role was known. The role guard then
    // bounced them again, producing the flicker-then-stall on sign-in.
    //
    // profileMissing is the terminal "no profile document" state.
    if (!userProfile && !profileMissing) return;

    // An authenticated account with no profile document — a brand-new Google
    // sign-in, or a signup that died after the auth record was created.
    //
    // This is checked BEFORE the MFA gate on purpose. There is no profile, so
    // there is no twoFactorEnabled to read and verifyMfaClaim falls back to the
    // (false) claim, which sent them to /mfa — a challenge for an account with
    // no contact record to challenge against. /signup can complete the profile
    // for a session that already exists, so send them somewhere they can
    // actually recover. GlobalAuthGuard likewise skips the MFA redirect while
    // profileMissing is set, so the two agree.
    if (profileMissing && !userProfile) {
      navigate("/signup", { replace: true });
      return;
    }

    const isVerified = verifyMfaClaim(user, userProfile, mfaVerified);
    if (!isVerified) {
      navigate("/mfa", { replace: true });
      return;
    }

    if (userProfile?.role === 'developer') {
      navigate("/developer/dashboard", { replace: true });
    } else if (userProfile?.role === 'organization') {
      navigate("/org/dashboard", { replace: true });
    } else {
      navigate("/student/dashboard", { replace: true });
    }
  }, [user, userProfile, profileMissing, mfaVerified, navigate]);

  // Delegates to the shared map in lib/errors. This used to be a private copy
  // that overlapped Signup's on three codes and disagreed on the wording, and
  // covered no Firestore errors at all.
  const friendlyAuthError = (code: string) => toUserMessage({ code });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Let the useEffect handle routing to the appropriate dashboard
    } catch (err: any) {
      setError(friendlyAuthError(err.code));
    } finally {
      setIsLoading(false);
    }
  };

  /*
   * There was previously no recovery path at all: a forgotten password locked
   * the account permanently. The confirmation wording is deliberately identical
   * whether or not the address exists, so this cannot be used to enumerate
   * which emails are registered.
   *
   * This used to call the SDK's sendPasswordResetEmail. It returned cleanly and
   * delivered nothing: Firebase sends that message itself, as
   * noreply@<project>.firebaseapp.com, a domain this project never
   * authenticated and a pipeline entirely separate from the Resend sender that
   * carries every other email the site manages to deliver. An organisation
   * reported it on 27 Aug 2026 and it reproduced from our own account the same
   * day. The server route generates the same link through the Admin SDK and
   * sends it over the sender that works.
   */
  const handlePasswordReset = async () => {
    const target = email.trim();
    setError("");
    setResetNotice("");
    if (!target) {
      setError("Enter your email address above, then choose “Forgot password?” again.");
      return;
    }
    setIsResetting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      // The route answers identically for a real and an unknown address, so
      // there is nothing to branch on here — only genuine faults (mail not
      // configured, provider rejection) come back as a non-2xx.
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || "We could not send the reset email. Please try again.");
        setIsResetting(false);
        return;
      }
    } catch {
      setError("We could not reach the server. Please check your connection and try again.");
      setIsResetting(false);
      return;
    }
    setResetNotice(
      `If an account exists for ${target}, a password reset link is on its way. Check your spam folder if it doesn't arrive in a few minutes.`
    );
    setIsResetting(false);
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    googleFlowInFlight.current = true;
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      const credential = await signInWithPopup(auth, provider);

      // signInWithPopup CREATES the Firebase account the moment it resolves;
      // there is no "try before you buy". Registration is deliberately manual
      // only (it collects a role, school, grade, org type, CRA number — none of
      // which Google can supply), so an account created by this button is an
      // accident of the SDK, not a signup, and it must not survive.
      //
      // The previous code just signed the new user out. That left an auth
      // record with no profile which its owner could neither sign in with (no
      // profile, so every route bounced) nor register with
      // (auth/email-already-in-use, forever) — permanently locked out on their
      // first click of "Continue with Google". Delete it instead: the account
      // is seconds old, owns nothing, and the popup is a fresh reauthentication
      // so deleteUser will not ask for one.
      //
      // Checking for the profile document beats the creationTime ===
      // lastSignInTime heuristic: it also catches a returning user whose
      // profile write failed on an earlier attempt.
      const profileSnap = await getDoc(doc(db, "users", credential.user.uid));
      if (!profileSnap.exists()) {
        try {
          await deleteUser(credential.user);
        } catch (cleanupErr) {
          // Could not remove it (offline, token too old). Do NOT sign out —
          // /signup can finish the profile for a session that already exists,
          // and that is the only escape from the lockout described above.
          console.error('Could not remove the empty Google account, falling back to profile recovery:', cleanupErr);
          navigate("/signup", {
            replace: true,
            state: { message: "Almost there — we just need a few details to finish setting up your account." },
          });
          return;
        }
        navigate("/signup", {
          replace: true,
          state: {
            message: "There's no account for that Google address yet. Sign up here first — it takes a minute, and afterwards you can use Continue with Google to sign in.",
          },
        });
        return;
      }

    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.code ? friendlyAuthError(err.code) : (err.message || 'Failed to sign in with Google.'));
      }
    } finally {
      setIsGoogleLoading(false);
      googleFlowInFlight.current = false;
    }
  };

  if (user && !userProfile && !profileMissing && !authError) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center gap-4 bg-white">
        <Spinner size="lg" className="text-ink" label={null} />
        <p role="status" className="text-[13px] text-ink-soft">Signing you in…</p>
      </div>
    );
  }

  const displayError = error || authError;

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center p-6 bg-white">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[400px]"
      >
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-[1.75rem] font-bold text-ink tracking-[-0.03em]">Sign in</h1>
          <p className="text-[14px] text-ink-soft mt-1.5">Welcome back to Volunteer North York.</p>
        </div>

        {/* Error */}
        {displayError && (
          <div role="alert" aria-live="assertive" className="bg-red-50 text-red-700 p-3.5 text-[13px] border border-red-200 flex items-start gap-2 mb-6">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{displayError}</p>
          </div>
        )}
        
        {resetNotice && (
          <div role="status" className="bg-blue-dark/5 text-blue-dark p-3.5 text-[13px] border border-blue-dark/20 mb-6 leading-relaxed">
            {resetNotice}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-[13px] font-medium text-ink mb-1.5">Email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="student@example.com"
              autoComplete="username"
              className="w-full h-11 px-3.5 text-[14px] bg-white border border-line text-ink placeholder:text-ink-muted focus:outline-none focus:border-blue-dark focus:ring-1 focus:ring-blue-dark transition-colors"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="login-password" className="block text-[13px] font-medium text-ink">Password</label>
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={isResetting}
                className="text-[12px] font-medium text-blue-dark hover:text-ink disabled:opacity-50"
              >
                {isResetting ? 'Sending…' : 'Forgot password?'}
              </button>
            </div>
            <input
              id="login-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full h-11 px-3.5 text-[14px] bg-white border border-line text-ink placeholder:text-ink-muted focus:outline-none focus:border-blue-dark focus:ring-1 focus:ring-blue-dark transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 bg-blue-dark text-paper text-[14px] font-medium rounded-full hover:bg-ink transition-colors duration-200 disabled:opacity-50 mt-2"
          >
            {isLoading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Divider */}
        <div className="relative flex items-center my-6">
          <div className="flex-grow border-t border-line"></div>
          <span className="flex-shrink-0 mx-4 text-xs font-medium text-ink-muted uppercase tracking-[0.06em]">or</span>
          <div className="flex-grow border-t border-line"></div>
        </div>

        {/* Google */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isGoogleLoading}
          className="w-full h-11 bg-white border border-line text-ink text-[14px] font-medium rounded-full hover:bg-gray-50 transition-colors duration-200 flex items-center justify-center gap-2.5 disabled:opacity-50"
        >
          {isGoogleLoading ? (
            <Spinner size="sm" className="text-ink-soft" label={null} />
          ) : (
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4.5 h-4.5" />
          )}
          {isGoogleLoading ? 'Connecting…' : 'Continue with Google'}
        </button>

        {isGoogleLoading && (
          <button 
            type="button"
            onClick={() => setIsGoogleLoading(false)}
            className="w-full text-center mt-3 text-[12px] text-ink-muted hover:text-ink underline rounded-full"
          >
            Cancel
          </button>
        )}

        {/* Sign up link */}
        <p className="text-center text-[13px] text-ink-soft mt-8">
          Don't have an account?{" "}
          <Link to="/signup" className="text-blue-dark hover:text-ink font-medium">
            Create one
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
