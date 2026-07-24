import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth, db } from "../firebase/config";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { useAuth } from "../contexts/AuthContext";
import { AlertCircle } from "lucide-react";
import { motion } from "motion/react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();

  useEffect(() => {
    if (user) {
      if (userProfile?.role === 'developer') {
        navigate("/developer/dashboard");
      } else if (userProfile?.role === 'organization') {
        navigate("/org/dashboard");
      } else {
        // Fallback for students or orphaned accounts (profileMissing)
        navigate("/student/dashboard");
      }
    }
  }, [user, userProfile, navigate]);

  const friendlyAuthError = (code: string) => {
    const map: Record<string, string> = {
      'auth/invalid-credential': 'Incorrect email or password. Please try again.',
      'auth/user-not-found': 'No account found with this email. Please sign up first.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/too-many-requests': 'Too many failed attempts. Please wait a moment and try again.',
      'auth/user-disabled': 'This account has been disabled. Please contact support.',
      'auth/network-request-failed': 'Network error. Please check your internet connection.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/popup-blocked': 'Pop-up was blocked by your browser. Please allow pop-ups and try again.',
      'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
    };
    return map[code] || 'Something went wrong. Please try again.';
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/");
    } catch (err: any) {
      setError(friendlyAuthError(err.code));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      const credential = await signInWithPopup(auth, provider);
      
      const isNewUser = credential.user.metadata.creationTime === credential.user.metadata.lastSignInTime;
      if (isNewUser) {
        // Don't delete the user - that's destructive. Just sign them out
        // and redirect to signup so they can complete registration properly.
        await auth.signOut();
        navigate("/signup", { state: { message: "Looks like you don't have an account yet. Sign up first, then you can log in with Google." } });
        return;
      }
      
      navigate("/");
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.code ? friendlyAuthError(err.code) : (err.message || 'Failed to sign in with Google.'));
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center p-6 bg-white">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[400px]"
      >
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-[1.75rem] font-semibold text-ink tracking-[-0.03em]">Sign in</h1>
          <p className="text-[14px] text-ink-soft mt-1.5">Welcome back to Volunteer North York.</p>
        </div>

        {/* Error */}
        {error && (
          <div role="alert" aria-live="assertive" className="bg-red-50 text-red-700 p-3.5 text-[13px] border border-red-200 flex items-start gap-2 mb-6">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{error}</p>
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
              className="w-full h-11 px-3.5 text-[14px] bg-white border border-line text-ink placeholder:text-ink-muted/50 focus:outline-none focus:border-blue-dark focus:ring-1 focus:ring-blue-dark transition-colors"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-[13px] font-medium text-ink mb-1.5">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full h-11 px-3.5 text-[14px] bg-white border border-line text-ink placeholder:text-ink-muted/50 focus:outline-none focus:border-blue-dark focus:ring-1 focus:ring-blue-dark transition-colors"
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
          <span className="flex-shrink-0 mx-4 text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em]">or</span>
          <div className="flex-grow border-t border-line"></div>
        </div>

        {/* Google */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isGoogleLoading}
          className="w-full h-11 bg-white border border-line text-ink text-[14px] font-medium rounded-full hover:bg-gray-50 transition-colors duration-200 flex items-center justify-center gap-2.5 disabled:opacity-50"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4.5 h-4.5" />
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
