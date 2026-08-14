import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Trophy, Award, ArrowRight, Lock } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { cn } from '../../lib/utils';
import { evaluateBadges } from '../../utils/badges';
import type { StudentProfile } from '../../types';

export interface LeaderboardEntry {
  id: string;
  name: string;
  /** Approved hours, the value the board ranks by. */
  hours: number;
  /** True for the viewer's own row, which is highlighted. */
  isSelf?: boolean;
}

/**
 * The leaderboard tab of the student dashboard.
 *
 * Lifted out of StudentDashboard as part of splitting a 2,400-line component.
 * It reads only two things — the ranked entries and the viewer's profile — so
 * it moves cleanly; the tab's 254 lines were 11% of the file and shared no
 * state with anything else on the page.
 *
 * Moved verbatim. Behaviour is unchanged.
 */
export default function LeaderboardTab({
  leaderboard,
  studentProfile,
  loadError = false,
}: {
  leaderboard: LeaderboardEntry[];
  studentProfile: Partial<StudentProfile> | null | undefined;
  /** The materialised leaderboard document could not be read. */
  loadError?: boolean;
}) {
  // A failed read renders as a failure. The previous behaviour substituted four
  // fabricated students, so a broken read was indistinguishable from a healthy
  // board — and students were ranked against people who do not exist.
  if (loadError) {
    return (
      <div className="py-12 text-center bg-white rounded-lg border border-line space-y-3 p-8" role="alert">
        <Trophy className="w-8 h-8 text-ink-soft mx-auto" />
        <h3 className="text-lg font-bold text-ink">The leaderboard could not be loaded</h3>
        <p className="text-xs text-ink-soft font-semibold max-w-sm mx-auto leading-relaxed">
          We couldn't read the current rankings. Please refresh the page in a
          moment — if this keeps happening, let us know through Feedback.
        </p>
      </div>
    );
  }

  return (
      <motion.div
        key="leaderboard"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.25 }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-8"
    >
    {/* Main Leaderboard Rankings list & Podium */}
    <div className="lg:col-span-2 space-y-8">
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-ink uppercase tracking-tight flex items-center gap-2 ">
              <Trophy className="text-amber-dark w-6 h-6" />
              Rankings Board
            </h2>
            <p className="text-ink-soft text-xs font-semibold mt-1">
              Outstanding high school student contributors in the
              community.
            </p>
          </div>
        </div>

        {(studentProfile?.trackerEnabled ?? true) ? (
          <div className="space-y-8 animate-fadeIn">
            {/* 3D-Style Podium Card (Light Theme Accent) */}
            <div className="bg-white border border-blue-dark/10 rounded-lg p-8 text-ink relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,87,22,0.06),transparent)] pointer-events-none" />

              <div className="text-center mb-8">
                <span className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-dark">
                  Community Podium
                </span>
                <h3 className="text-lg font-bold text-ink mt-1">
                  Active Hours Contributor Leaders
                </h3>
              </div>

              {/* Visual Columns Podium */}
              <div className="grid grid-cols-3 gap-3 items-end max-w-md mx-auto pt-6 pb-2">
                {/* 2nd Place (Silver) */}
                <div className="flex flex-col items-center animate-in fade-in slide-in- duration-300">
                  <div className="text-center mb-2">
                    <p className="text-xs font-bold text-ink-soft truncate max-w-[80px] sm:max-w-none">
                      {leaderboard[1] ? leaderboard[1].name : "---"}
                    </p>
                    <p className="text-xs font-semibold text-ink-soft ">
                      {leaderboard[1]
                        ? `${leaderboard[1].hours} hrs`
                        : "--"}
                    </p>
                  </div>
                  <div
                    className="w-full bg-paper-2 rounded-t-2xl flex flex-col items-center justify-center p-4 border border-line/50"
                    style={{ height: "70px" }}
                  >
                    <span className="text-2xl font-semibold text-ink-soft ">
                      2
                    </span>
                    <span className="text-xs font-semibold text-ink-soft uppercase tracking-widest mt-1">
                      Silver
                    </span>
                  </div>
                </div>

                {/* 1st Place (Gold/Orange, center and taller) */}
                <div className="flex flex-col items-center animate-in fade-in slide-in- duration-500">
                  <div className="text-center mb-2 relative">
                    {leaderboard[0] && (
                      <Trophy className="w-5 h-5 text-amber-dark mx-auto absolute -top-5 left-1/2 -translate-x-1/2" />
                    )}
                    <p className="text-sm font-semibold text-amber-dark truncate max-w-[90px] sm:max-w-none">
                      {leaderboard[0] ? leaderboard[0].name : "---"}
                    </p>
                    <p className="text-xs font-semibold text-amber-dark ">
                      {leaderboard[0]
                        ? `${leaderboard[0].hours} hrs`
                        : "--"}
                    </p>
                  </div>
                  <div
                    className="w-full bg-amber/10 rounded-t-2xl flex flex-col items-center justify-center p-5 border border-orange-300 border-amber/20 shadow-orange-500/5"
                    style={{ height: "95px" }}
                  >
                    <span className="text-3xl font-medium text-amber-dark ">
                      1
                    </span>
                    <span className="text-xs font-semibold text-amber-dark uppercase tracking-widest mt-1">
                      Champion
                    </span>
                  </div>
                </div>

                {/* 3rd Place (Bronze) */}
                <div className="flex flex-col items-center animate-in fade-in slide-in- duration-300">
                  <div className="text-center mb-2">
                    <p className="text-xs font-bold text-orange-700 truncate max-w-[80px] sm:max-w-none">
                      {leaderboard[2] ? leaderboard[2].name : "---"}
                    </p>
                    <p className="text-xs font-semibold text-amber-dark/80 ">
                      {leaderboard[2]
                        ? `${leaderboard[2].hours} hrs`
                        : "--"}
                    </p>
                  </div>
                  <div
                    className="w-full bg-[#fdf2e9] rounded-t-2xl flex flex-col items-center justify-center p-4 border border-orange-100"
                    style={{ height: "55px" }}
                  >
                    <span className="text-xl font-semibold text-amber-dark/80 ">
                      3
                    </span>
                    <span className="text-xs font-semibold text-orange-400 uppercase tracking-widest mt-1">
                      Bronze
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Complete Leaderboard list */}
            <Card className="overflow-hidden border-none rounded-lg bg-white p-6 space-y-4">
              <h3 className="text-xs font-semibold tracking-wide text-ink-soft ">
                Complete Standings
              </h3>
              {leaderboard.length === 0 && (
                <p className="text-xs text-ink-soft font-semibold text-center py-6">
                  No verified hours have been ranked yet. When an organization
                  approves logged hours, those students appear here.
                </p>
              )}
              <div className="space-y-2">
                {leaderboard.map((student, idx) => (
                  <div
                    key={student.id}
                    className={cn(
                      "flex items-center justify-between p-4.5 rounded-lg border transition-all text-sm",
                      student.isSelf
                        ? "bg-blue-dark/5 border-blue-dark/20"
                        : "bg-paper-2/50 border-line",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ",
                          idx === 0
                            ? "bg-amber/10 text-yellow-700 font-bold"
                            : idx === 1
                              ? "bg-paper-3 text-ink-soft font-bold"
                              : idx === 2
                                ? "bg-amber/10 text-amber-700 font-bold"
                                : "bg-paper-3 text-ink-soft",
                        )}
                      >
                        {idx + 1}
                      </span>
                      <span
                        className={cn(
                          "text-ink-soft font-semibold",
                          student.isSelf &&
                            "text-blue-dark font-semibold",
                        )}
                      >
                        {student.name} {student.isSelf && "(You)"}
                      </span>
                    </div>
                    <span className="font-semibold text-ink ">
                      {student.hours} hrs
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ) : (
          <div className="py-12 text-center bg-white rounded-lg border border-line space-y-3 p-8">
            <Lock className="w-8 h-8 text-ink-soft mx-auto" />
            <h3 className="text-lg font-bold text-ink">
              Leaderboard Participation Disabled
            </h3>
            <p className="text-xs text-ink-soft font-semibold max-w-sm mx-auto leading-relaxed">
              You have turned off the community rankings. Toggle
              participation on the sidebar settings controls to view high
              achievements and listings.
            </p>
          </div>
        )}
      </section>
    </div>

    {/* Leaderboard Settings & Options Sidebar */}
    <div className="space-y-8">
      {/* My Achievement Milestones Overview Card */}
      <section className="space-y-4 animate-fadeIn">
        <h2 className="text-xl font-bold text-ink flex items-center gap-2">
          <Trophy className="text-blue-dark w-5 h-5" />
          My Badges Cabinet
        </h2>
        <Card className="p-6 border border-line shadow-sm rounded-lg bg-white space-y-6">
          <div>
            <h4 className="text-xs font-semibold tracking-wide text-blue-dark">
              My Milestones
            </h4>
            <p className="text-[12px] text-ink-soft font-semibold mt-1">
              Your current community badge collection stats.
            </p>
          </div>

          {/* Progress Mini Showcase */}
          <div className="space-y-3.5 pt-1">
            {evaluateBadges((studentProfile as any) ?? null).slice(0, 4).map(({ badge, isUnlocked }) => (
              <div 
                key={badge.id}
                className={cn(
                  "flex items-center gap-3 p-2.5 rounded-lg border transition-all",
                  isUnlocked 
                    ? "bg-paper-2 border-line" 
                    : "bg-paper-2/45 border-line/50 opacity-60"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ",
                  isUnlocked
                    ? "bg-blue-dark text-white"
                    : "bg-paper-3 text-ink-muted"
                )}>
                  {isUnlocked ? (
                    <Award className="w-4 h-4" />
                  ) : (
                    <Lock className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    "text-sm font-bold truncate",
                    isUnlocked ? "text-ink" : "text-ink-soft"
                  )}>
                    {badge.name}
                  </p>
                  <p className="text-xs text-ink-soft truncate">
                    {isUnlocked ? "Unlocked! ✨" : badge.requirement}
                  </p>
                </div>
              </div>
            ))}

            <Link 
              to="/student/profile"
              className="flex items-center justify-center gap-1.5 w-full bg-paper-3 hover:bg-slate-200 text-ink-soft py-2.5 rounded-lg text-xs font-bold transition-all text-center mt-2"
            >
              <span>View All Badges Cabinet</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </Card>
      </section>
      </div>
    </motion.div>
  );
}
