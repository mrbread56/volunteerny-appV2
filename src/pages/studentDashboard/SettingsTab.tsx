import { motion } from 'motion/react';
import RecoveryCodes from '../../components/RecoveryCodes';
import { ShieldCheck } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { cn } from '../../lib/utils';
import type { StudentProfile, UserProfile } from '../../types';

/**
 * The settings tab of the student dashboard: leaderboard visibility,
 * leaderboard anonymity, and account details.
 *
 * Lifted out of StudentDashboard as part of splitting a 2,400-line component.
 * The two toggles are passed in rather than reimplemented — each one writes to
 * Firestore and surfaces its own failure, and that error handling stays with
 * the page that owns the error banner.
 *
 * Moved verbatim. Behaviour is unchanged.
 */
export default function SettingsTab({
  studentProfile,
  userProfile,
  user,
  isDemoMode,
  onToggleCompetitiveness,
  onToggleAnonymity,
  onToggle2FA,
  twoFaStage,
  twoFaCode,
  twoFaError,
  onTwoFaCodeChange,
  onConfirm2FA,
  onCancel2FA,
}: {
  studentProfile: Partial<StudentProfile> | null | undefined;
  userProfile: Partial<UserProfile> | null | undefined;
  user: { email?: string | null } | null | undefined;
  isDemoMode: boolean;
  onToggleCompetitiveness: () => void;
  onToggleAnonymity: () => void;
  /** Two-factor is optional for students; the toggle writes users/{uid}.twoFactorEnabled. */
  onToggle2FA: () => void;
  /**
   * Enabling is a two-step confirmation, not a switch.
   *
   * The panel below has always promised "Turning this on asks for a code right
   * away, so you can confirm you can receive it". It did not, and a student
   * whose mail never arrives has no recovery codes to fall back on — that
   * component renders only for organisations. So the flag is written only after
   * a code has actually been received and accepted.
   */
  twoFaStage: "idle" | "sending" | "awaiting" | "verifying";
  twoFaCode: string;
  twoFaError: string | null;
  onTwoFaCodeChange: (v: string) => void;
  onConfirm2FA: () => void;
  onCancel2FA: () => void;
}) {
  // Local aliases so the moved markup needs no edits.
  const handleToggleCompetitiveness = onToggleCompetitiveness;
  const handleToggleAnonymity = onToggleAnonymity;
  const handleToggle2FA = onToggle2FA;
  return (
    <motion.div
      key="settings"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.25 }}
      className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto"
    >
      {/* Account & Recognition Preferences */}
      <Card className="rounded-lg border border-line bg-white p-8 md:p-10 space-y-6">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-blue-dark">Privacy & Listing</span>
          <h3 className="text-xl font-bold text-ink mt-1 ">
            Community Listings Preference
          </h3>
          <p className="text-xs text-ink-soft mt-2 leading-relaxed">
            Configure how your high school volunteer hours display on leadership indices.
          </p>
        </div>

        <div className="space-y-6 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-ink">
                Participate in Rankings
              </h4>
              <p className="text-xs text-ink-soft mt-1 font-semibold">
                Toggle whether peers see your hours leaderboard
              </p>
            </div>
            <button
              onClick={handleToggleCompetitiveness}
              aria-label="Toggle whether peers see your hours leaderboard"
              role="switch"
              aria-checked={studentProfile?.trackerEnabled ?? false}
              className={cn(
                "w-11 h-6 rounded-lg transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0 self-center",
                (studentProfile?.trackerEnabled ?? false) ? "bg-blue-dark" : "bg-slate-200",
              )}
            >
              <span
                className={cn(
                  "bg-white w-5 h-5 rounded-lg  transform transition-transform duration-250",
                  (studentProfile?.trackerEnabled ?? false) ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-line pt-6">
            <div>
              <h4 className="text-sm font-bold text-ink">
                Anonymous Display Format
              </h4>
              <p className="text-xs text-ink-soft mt-1 font-semibold">
                Hide your full name on high achievement boards
              </p>
            </div>
            <button
              onClick={handleToggleAnonymity}
              aria-label="Hide your full name on high achievement boards"
              role="switch"
              aria-checked={studentProfile?.trackerAnonymous ?? false}
              disabled={!(studentProfile?.trackerEnabled ?? false)}
              className={cn(
                "w-11 h-6 rounded-lg transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0 self-center",
                (studentProfile?.trackerAnonymous ?? false) ? "bg-amber" : "bg-slate-200",
                !(studentProfile?.trackerEnabled ?? false) && "opacity-40 cursor-not-allowed",
              )}
            >
              <span
                className={cn(
                  "bg-white w-5 h-5 rounded-lg  transform transition-transform duration-250",
                  (studentProfile?.trackerAnonymous ?? false) ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>
        </div>
      </Card>

      {/* 2-Step Verification Security Shield */}
      {!isDemoMode && (
        <Card className="rounded-lg border border-blue-dark/20 bg-white p-8 md:p-10 space-y-6">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-dark">Account Security</span>
            <h3 className="text-xl font-bold text-ink mt-1 flex items-center gap-2 flex-wrap">
              <ShieldCheck className="w-5 h-5 text-emerald-600 animate-pulse" />
              <span>Two-Factor Shield (2FA)</span>
              <span className="text-xs font-semibold tracking-wide bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg border border-emerald-200/50">
                Highly Recommended
              </span>
            </h3>
            <p className="text-xs text-ink-soft mt-2 leading-relaxed font-semibold">
              Secure your account from brute force attacks by verifying your identity via email during sign-in.
            </p>
          </div>

          <div className="space-y-6 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-ink">
                  Email Passcode Gate
                </h4>
                <p className="text-xs text-ink-soft mt-1 font-semibold">
                  Require a 6-digit confirmation PIN on login
                </p>
              </div>
              <button
                onClick={handleToggle2FA}
                aria-label="Toggle Two-Factor Authentication"
                role="switch"
                aria-checked={userProfile?.twoFactorEnabled ?? false}
                className={cn(
                  "w-11 h-6 rounded-lg transition-all flex items-center p-0.5 outline-none cursor-pointer duration-250 shrink-0 self-center",
                  (userProfile?.twoFactorEnabled ?? false) ? "bg-emerald-600" : "bg-slate-200",
                )}
              >
                <span
                  className={cn(
                    "bg-white w-5 h-5 rounded-lg  transform transition-transform duration-250",
                    (userProfile?.twoFactorEnabled ?? false) ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            <div className="border-t border-line pt-6 space-y-3">
              <p className="text-xs text-ink-soft font-semibold leading-relaxed">
                Status: <strong className={cn(
                  "font-semibold tracking-wide text-xs px-2 py-0.5 rounded-lg border",
                  (userProfile?.twoFactorEnabled ?? false)
                    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                    : "text-ink-soft bg-paper-2 border-line"
                )}>{(userProfile?.twoFactorEnabled ?? false) ? "Shield Enabled" : "Shield Disabled"}</strong>
              </p>
              <p className="text-xs text-ink-soft font-medium leading-relaxed">
                We send a 6-digit code to <span className="text-xs text-ink-soft font-semibold">{user?.email}</span> each time you sign in. Staying signed in on this device won't ask again — only a new sign-in will.
              </p>
              <p className="text-xs text-ink-soft font-medium leading-relaxed">
                Turning this on asks for a code right away, so you can confirm you
                can receive it before your account starts depending on it.
              </p>

              {twoFaStage === "sending" && (
                <p role="status" className="text-xs font-semibold text-ink-soft">
                  Sending a test code to {user?.email}…
                </p>
              )}

              {(twoFaStage === "awaiting" || twoFaStage === "verifying") && (
                <div className="space-y-2 border-t border-line-light pt-3">
                  <label htmlFor="twofa-confirm" className="block text-xs font-semibold text-ink">
                    Enter the 6-digit code we just emailed you
                  </label>
                  <p className="text-xs text-ink-muted">
                    The passcode gate stays off until you do. If it does not arrive,
                    check your spam folder.
                  </p>
                  <input
                    id="twofa-confirm"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={twoFaCode}
                    onChange={(e) => onTwoFaCodeChange(e.target.value.replace(/\D/g, ""))}
                    className="w-32 h-11 px-3 rounded-lg border border-line text-center tracking-[0.3em] font-mono text-base"
                  />
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={onConfirm2FA}
                      disabled={twoFaStage === "verifying"}
                      className="h-10 px-4 rounded-lg bg-blue-dark text-white text-xs font-semibold disabled:opacity-50"
                    >
                      {twoFaStage === "verifying" ? "Checking…" : "Confirm and turn on"}
                    </button>
                    <button
                      type="button"
                      onClick={onCancel2FA}
                      className="h-10 px-3 rounded-lg border border-line bg-white text-xs font-semibold text-ink"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {twoFaError && (
                <p role="alert" className="text-xs font-semibold text-red-600">
                  {twoFaError}
                </p>
              )}

              {/*
                * The way back when the email stops arriving.
                *
                * This component existed but rendered only in OrgProfile, so a
                * student who turned the gate on and later lost access to that
                * mailbox — a changed school address, a full inbox, a spam rule —
                * had no route to their own hours record at all. Organisations
                * were given this exact escape hatch for exactly that reason.
                *
                * Shown only once the gate is actually on, because codes are
                * useless until something is gating you, and generating them
                * requires having passed the second factor.
                */}
              {(userProfile?.twoFactorEnabled ?? false) && !isDemoMode && (
                <RecoveryCodes />
              )}
            </div>
          </div>
        </Card>
      )}
    </motion.div>
  );
}
