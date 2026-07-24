import React, { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { loadRecaptchaScript } from "../lib/recaptcha";

interface RecaptchaBadgeProps {
  className?: string;
  actionName?: string;
}

export function RecaptchaBadge({ className = "", actionName = "submission" }: RecaptchaBadgeProps) {
  const [status, setStatus] = useState<"loading" | "active" | "sandbox">("loading");

  useEffect(() => {
    let active = true;
    loadRecaptchaScript().then((success) => {
      if (!active) return;
      if (success && (window as any).grecaptcha) {
        setStatus("active");
      } else {
        setStatus("sandbox");
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className={`p-3.5 bg-slate-50 border border-slate-100 rounded-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs ${className}`}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">
          {status === "active" ? (
            <ShieldCheck className="w-5 h-5 text-emerald-500 fill-emerald-50" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-indigo-500 fill-indigo-50" />
          )}
        </div>
        <div className="space-y-0.5">
          <p className="font-extrabold text-slate-900 flex items-center gap-1.5 leading-none">
            {status === "active" ? (
              <>
                <span>🔐 Google reCAPTCHA v3 Active</span>
                <span className="p-1 py-0.5 bg-emerald-100/70 border border-emerald-200 text-emerald-800 text-[8px] font-black uppercase tracking-widest rounded">LIVE</span>
              </>
            ) : (
              <>
                <span>⚠️ Bot Protection Unavailable</span>
                <span className="p-1 py-0.5 bg-amber-100 border border-amber-200 text-amber-800 text-[8px] font-black uppercase tracking-widest rounded">LIMITED</span>
              </>
            )}
          </p>
          <p className="text-[10px] text-slate-600 leading-relaxed font-semibold">
            Protecting form submissions against botnets and malicious registrations. Verified client actions score confidence through AI-based heuristics.
          </p>
        </div>
      </div>
      
      <div className="shrink-0 text-slate-600 font-bold font-mono text-[9px] uppercase tracking-wider text-right sm:border-l sm:border-slate-200/50 sm:pl-3">
        <p>RECAPTCHA V3</p>
        <p className="text-[8px] text-slate-600 font-semibold mt-0.5 lowercase font-sans">
          privacy &middot; terms
        </p>
      </div>
    </div>
  );
}
