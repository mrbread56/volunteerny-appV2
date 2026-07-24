import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../lib/config";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { auth } from "../firebase/config";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { ShieldAlert, AlertCircle, KeyRound, ArrowRight } from "lucide-react";
import { motion } from "motion/react";

export default function MfaChallenge() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasSentOTP, setHasSentOTP] = useState(false);
  
  const navigate = useNavigate();
  const { user, userProfile, mfaVerified, loading } = useAuth();

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
    
    if (!hasSentOTP) {
      sendOTP();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mfaVerified, navigate, hasSentOTP, loading]);

  // Auto-send OTP on mount, and reused directly by the Resend button so
  // resend is tied to the real request completing, not a fixed timeout.
  const sendOTP = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Send OTP failed with status ${response.status}`);
      }
      setHasSentOTP(true);
    } catch (err: any) {
      console.error("Failed to send OTP", err);
      setError(err.message || "Failed to send verification code. Please check your network.");
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
      
      const data = await response.json();
      if (data.success) {
        // Verification succeeded server-side. Force-refresh the ID token so
        // it picks up the new `mfaVerified` custom claim before we navigate
        // (this claim, not anything in local storage, is what AuthContext
        // trusts) then reload so AuthContext re-reads it from a clean state.
        await user!.getIdToken(true);
        window.location.href = "/";
      } else {
        setError(data.error || "Invalid verification code.");
      }
    } catch (err: any) {
      setError("An error occurred during verification.");
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
    <div className="min-h-[100vh] flex flex-col items-center justify-center p-4 bg-slate-50 relative overflow-hidden">
      <div className="absolute top-0 -left-4 w-72 h-72 bg-blue-400 rounded-sm mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
      
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="w-full border-[#1F4C63]/10  overflow-hidden rounded-sm">
          <CardHeader className="text-center pb-2 pt-10">
            <div className="mx-auto w-16 h-16 bg-[#1F4C63] rounded-sm flex items-center justify-center mb-6  shadow-blue-200">
              <ShieldAlert className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-3xl font-extrabold tracking-tight text-slate-900">Security Check</CardTitle>
            <p className="text-slate-600 font-medium mt-3 px-4">
              We just sent a 6-digit security code to <strong>{user?.email}</strong>.
            </p>
          </CardHeader>
          <CardContent className="space-y-6 pt-6 pb-10">
            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-sm text-xs border border-red-100 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="font-semibold leading-relaxed">{error}</p>
              </div>
            )}
            
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound className="h-5 w-5 text-slate-400" />
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
                className="text-sm font-bold text-slate-500 hover:text-[#1F4C63] transition-colors rounded-full"
              >
                Didn't receive it? Resend code
              </button>
            </div>
            
            <div className="pt-2 text-center">
              <button 
                type="button" 
                onClick={() => auth.signOut()}
                className="text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors"
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
