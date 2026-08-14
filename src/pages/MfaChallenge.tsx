import React, { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from "../lib/config";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { auth } from "../firebase/config";
import { isMfaClaimCurrent } from "../lib/mfa";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import EmailDeliveryNote from "../components/ui/EmailDeliveryNote";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { ShieldAlert, AlertCircle, KeyRound, ArrowRight } from "lucide-react";
import { motion } from "motion/react";

export default function MfaChallenge() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasSentOTP, setHasSentOTP] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // `hasSentOTP` is React state, so it only flips AFTER the request resolves.
  // Two effect runs firing in that gap — a re-render, or StrictMode's
  // deliberate double-invoke in development — both saw `false` and both posted
  // to /send-otp. Each page visit therefore spent two of the five requests the
  // server allows per ten minutes, so a couple of retries produced a 429 that
  // looked like a random failure. A ref updates synchronously and closes that
  // window.
  const sendInFlight = useRef(false);
  // The automatic send happens once per visit. Retrying is the Resend button's
  // job, so a delivery failure can never turn into a send loop.
  const didAutoSend = useRef(false);

  const navigate = useNavigate();
  const { user, userProfile, mfaVerified, loading, isDemoMode, setMfaVerified } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate("/login");
      return;
    }
    if (mfaVerified) {
      navigate("/");
      return;
    }

    // Demo sessions use a mock user object that has no getIdToken(), so the
    // real OTP round trip threw "getIdToken is not a function" and left demo
    // organization/developer accounts permanently stranded on this screen.
    // There is no real account to protect in demo mode, so clear the gate.
    if (isDemoMode) {
      void setMfaVerified(true, user.uid);
      navigate("/");
      return;
    }

    if (!didAutoSend.current) {
      didAutoSend.current = true;
      void sendOTP();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mfaVerified, navigate, hasSentOTP, loading, isDemoMode]);

  // Auto-send OTP on mount, and reused directly by the Resend button so
  // resend is tied to the real request completing, not a fixed timeout.
  const sendOTP = async () => {
    if (!user || isDemoMode) return;
    if (sendInFlight.current) return;
    sendInFlight.current = true;
    setIsSending(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        // The server distinguishes "not configured", "provider rejected it" and
        // "rate limited"; pass that through instead of flattening everything
        // into one unhelpful sentence.
        const detail = data?.details ? ` (${data.details})` : "";
        throw new Error((data?.error || `Could not send the code (status ${response.status}).`) + detail);
      }
      setHasSentOTP(true);
      setError("");
    } catch (err: any) {
      console.error("Failed to send OTP", err);
      setError(err.message || "Failed to send verification code. Please check your network.");
      // Let the user retry after a failure — otherwise the guard above would
      // block every further attempt for the lifetime of the page.
      setHasSentOTP(false);
    } finally {
      sendInFlight.current = false;
      setIsSending(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Please enter a valid 6-digit code.");
      return;
    }
    setError("");
    setIsLoading(true);

    try {
      const token = await user!.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ code })
      });
      
      const data = await response.json().catch(() => null);
      if (response.ok && data?.success) {
        // The server has recorded the mfaVerified custom claim. Claims are
        // attached when a token is minted, and a freshly-written claim is not
        // always visible on the very first forced refresh — so a single check
        // would sometimes reject a code that had in fact just been accepted.
        // Poll a few times with a short backoff before giving up.
        const claimLanded = await (async () => {
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              const refreshed = await user!.getIdTokenResult(true);
              // Must be the SAME predicate the route guards use. Checking only
              // `mfaVerified === true` here would let this page redirect to /
              // on a claim the guard then rejects, bouncing straight back to
              // /mfa — a loop with a correct code in hand.
              if (isMfaClaimCurrent(refreshed)) return true;
            } catch (refreshErr) {
              console.warn("Token refresh failed while confirming MFA claim:", refreshErr);
            }
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }
          return false;
        })();

        if (claimLanded) {
          window.location.href = "/";
        } else {
          setError(
            "Your code was correct, but the session could not be updated. Please request a new code and try again."
          );
        }
      } else {
        setError(data?.error || "Invalid verification code.");
      }
    } catch (err: any) {
      console.error("MFA verification failed:", err);
      setError(
        err?.message?.includes("fetch") || err?.name === "TypeError"
          ? "We could not reach the server. Please check your connection and try again."
          : "An error occurred during verification. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError("");
    try {
      await sendOTP();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100vh] flex flex-col items-center justify-center p-4 bg-paper-2 relative overflow-hidden">
      <div className="absolute top-0 -left-4 w-72 h-72 bg-blue-400 rounded-lg mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
      
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="w-full border-blue-dark/10 overflow-hidden rounded-lg">
          <CardHeader className="text-center pb-2 pt-10">
            <div className="mx-auto w-16 h-16 bg-blue-dark rounded-lg flex items-center justify-center mb-6 shadow-blue-200">
              <ShieldAlert className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-3xl font-semibold tracking-tight text-ink">Security Check</CardTitle>
            <p className="text-ink-muted font-medium mt-3 px-4">
              We just sent a 6-digit security code to <strong>{user?.email}</strong>.
            </p>
            <div className="px-4 mt-2 text-left max-w-sm mx-auto">
              <EmailDeliveryNote />
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6 pb-10">
            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-lg text-xs border border-red-100 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="font-semibold leading-relaxed">{error}</p>
              </div>
            )}
            
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound className="h-5 w-5 text-ink-muted" />
                </div>
                <Input
                  id="mfa-code"
                  type="text"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit code"
                  className="pl-10 text-center text-2xl tracking-[0.5em] font-mono h-14"
                  required
                />
              </div>
              <Button type="submit" variant="primary" className="w-full h-12 text-sm flex items-center gap-2" isLoading={isLoading}>
                Verify Device <ArrowRight className="w-4 h-4" />
              </Button>
            </form>

            <div className="pt-4 text-center">
              <button 
                type="button" 
                onClick={handleResend}
                disabled={isLoading}
                className="text-sm font-bold text-ink-muted hover:text-blue-dark transition-colors rounded-full"
              >
                Didn't receive it? Resend code
              </button>
            </div>
            
            {/* A way out that is not "sign out and try again forever".
                Two-factor is mandatory for organizations and the code arrives
                by email, so anything that stops delivery - a bounce, a spam
                filter, a provider outage - locks the account permanently. The
                screen previously offered only Resend and Sign out, neither of
                which helps when mail is the thing that is broken. Support can
                verify the account by hand; see docs/RUNBOOK.md. */}
            <div className="pt-4 mt-2 border-t border-line text-center space-y-2">
              <p className="text-xs text-ink-muted leading-relaxed">
                Code still not arriving? Check your spam folder first. If it is not
                there, email us from the address on this account and we can verify
                it manually.
              </p>
              <a
                href={`mailto:privacy@volunteernorthyork.indevs.in?subject=${encodeURIComponent(
                  'Cannot receive verification code'
                )}&body=${encodeURIComponent(
                  `I am not receiving my verification code.\n\nAccount email: ${user?.email || ''}\n`
                )}`}
                className="inline-block text-xs font-semibold text-blue-dark hover:underline"
              >
                Contact support
              </a>
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => auth.signOut()}
                className="text-xs font-semibold text-ink-muted hover:text-red-600 transition-colors"
              >
                Cancel and sign out
              </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
