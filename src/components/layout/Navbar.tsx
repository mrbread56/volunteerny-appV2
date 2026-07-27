import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { verifyMfaClaim } from '../../lib/mfa';
import { Spinner } from '../ui/Spinner';
import { LogOut, LayoutDashboard, Search, UserCircle, PlusCircle, Trophy, Menu, X, MessageCircle } from 'lucide-react';

/**
 * Placeholder for the nav links while the session is still settling.
 *
 * This slot used to read "Security Verification". That wording is accurate
 * only for the small set of users who still owe an OTP — everyone who had just
 * *finished* the OTP step also landed here for the second or two it takes the
 * refreshed ID token and the Firestore profile to arrive, and being told they
 * need security verification right after passing it reads as a failure. Show
 * the shape of the nav that is about to appear instead.
 */
function NavLoading() {
  return (
    <div className="flex items-center gap-3" role="status" aria-label="Loading your account">
      <div className="flex items-center gap-2" aria-hidden="true">
        {['w-16', 'w-20', 'w-14'].map((w, i) => (
          <div
            key={w}
            data-motion="essential"
            style={{ animationDelay: `${i * 160}ms` }}
            className={`h-2.5 ${w} rounded-full bg-line animate-shimmer`}
          />
        ))}
      </div>
      <Spinner size="sm" className="text-ink-soft" label={null} />
    </div>
  );
}

export default function Navbar() {
  const { user, userProfile, loading, isDemoMode, logout, mfaVerified, profileMissing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // No developer short-circuit: the nav must not offer authenticated links to a
  // session that has not cleared MFA (see MfaClaimMiddleware in App.tsx).
  const isVerified = verifyMfaClaim(user, userProfile, mfaVerified);
  const authed = !!user && !loading && !profileMissing && isVerified && location.pathname !== '/mfa';

  // Signed in, but the profile read hasn't resolved yet. Previously this fell
  // into the same branch as "MFA required" and rendered the Security
  // Verification header, which is why the navbar could sit there permanently
  // after a successful sign-in. Show a neutral placeholder instead so a
  // transient load never masquerades as a security prompt.
  const profilePending = !!user && !loading && !profileMissing && !userProfile;

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/');
  };

  const close = () => setOpen(false);

  const navLink = 'text-ink-soft hover:text-ink px-3 py-2 text-[13px] font-medium tracking-[-0.01em] transition-colors duration-200 relative after:absolute after:bottom-0 after:left-3 after:right-3 after:h-px after:bg-blue-dark after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-300 after:origin-left';

  return (
    <nav className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-xl border-b border-line/60">
      {isDemoMode && (
        <div className="bg-gradient-to-r from-blue-dark to-[#153343] text-paper text-xs font-semibold uppercase tracking-wide py-1.5 text-center">
          Demo Mode
          <button onClick={handleLogout} className="ml-4 text-paper/60 hover:text-paper underline text-xs rounded-full">
            Exit
          </button>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          {/*
            The brand text below is `hidden sm:inline`, and the image is
            correctly decorative (alt=""), so under 640px this link had no
            accessible name at all — screen reader users heard "link" with no
            destination. The label lives on the anchor so it survives the text
            being hidden, and it matches the visible wording exactly so
            voice-control users can still say "Volunteer North York".
          */}
          <Link to="/" onClick={close} aria-label="Volunteer North York" className="flex items-center gap-2.5 group">
            <img
              src="/logo.png"
              alt=""
              className="w-8 h-8 object-contain transition-transform duration-300 group-hover:scale-105"
            />
            <span className="text-[15px] font-semibold tracking-[-0.03em] text-ink hidden sm:inline">
              Volunteer North York
            </span>
          </Link>

          {/* Desktop */}
          <div className="hidden lg:flex items-center gap-1">
            {authed ? (
              <>
                {userProfile?.role === 'student' && (
                  <>
                    <Link to="/student/opportunities" className={navLink}>
                      <span className="flex items-center gap-1.5"><Search className="w-3.5 h-3.5" /> Browse</span>
                    </Link>
                    <Link to="/student/dashboard?tab=leaderboard" className={navLink}>
                      <span className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Leaderboard</span>
                    </Link>

                    <Link to="/student/profile" className={navLink}>
                      <span className="flex items-center gap-1.5"><UserCircle className="w-3.5 h-3.5" /> Profile</span>
                    </Link>
                    <Link to="/student/dashboard" className={navLink}>
                      <span className="flex items-center gap-1.5"><LayoutDashboard className="w-3.5 h-3.5" /> Dashboard</span>
                    </Link>
                  </>
                )}
                {userProfile?.role === 'developer' && (
                  <Link to="/developer/dashboard" className={navLink}>
                    <span className="flex items-center gap-1.5"><LayoutDashboard className="w-3.5 h-3.5" /> Control Room</span>
                  </Link>
                )}
                {userProfile?.role === 'organization' && (
                  <>
                    <Link to="/org/opportunities/new" className={navLink}>
                      <span className="flex items-center gap-1.5"><PlusCircle className="w-3.5 h-3.5" /> Post</span>
                    </Link>

                    <Link to="/org/profile" className={navLink}>
                      <span className="flex items-center gap-1.5"><UserCircle className="w-3.5 h-3.5" /> Profile</span>
                    </Link>
                    <Link to="/org/dashboard" className={navLink}>
                      <span className="flex items-center gap-1.5"><LayoutDashboard className="w-3.5 h-3.5" /> Dashboard</span>
                    </Link>
                  </>
                )}
                <div className="w-px h-5 bg-line mx-2" />
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-ink-soft hover:text-ink text-[13px] font-medium px-3 py-2 transition-colors rounded-full"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </>
            ) : profilePending ? (
              <div className="px-4 py-2">
                <NavLoading />
              </div>
            ) : user ? (
              <div className="flex items-center gap-2">
                <div className="px-4 py-2">
                  <NavLoading />
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-ink-soft hover:text-ink text-[13px] font-medium px-3 py-2 transition-colors rounded-full border border-line hover:bg-paper-2"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="text-ink-soft hover:text-ink text-[13px] font-medium px-4 py-2 transition-colors">
                  Log in
                </Link>
                <Link
                  to="/signup"
                  className="bg-blue-dark text-paper text-[13px] font-medium px-5 py-2 rounded-full hover:bg-[#153343] transition-all duration-300 shadow-[0_1px_2px_rgba(31,76,99,0.15)]"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen(!open)}
            className="lg:hidden p-2 text-ink-soft hover:text-ink transition-colors rounded-full"
            aria-label="Toggle menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="lg:hidden border-t border-line bg-white px-6 py-5 space-y-1 animate-fadeIn">
          {authed ? (
            <>
              {userProfile?.role === 'student' && (
                <>
                  <Link to="/student/opportunities" onClick={close} className="block py-2.5 text-sm font-medium text-ink-soft hover:text-ink">Browse</Link>
                  <Link to="/student/dashboard?tab=leaderboard" onClick={close} className="block py-2.5 text-sm font-medium text-ink-soft hover:text-ink">Leaderboard</Link>

                  <Link to="/student/profile" onClick={close} className="block py-2.5 text-sm font-medium text-ink-soft hover:text-ink">Profile</Link>
                  <Link to="/student/dashboard" onClick={close} className="block py-2.5 text-sm font-medium text-ink-soft hover:text-ink">Dashboard</Link>
                </>
              )}
              {userProfile?.role === 'developer' && (
                <Link to="/developer/dashboard" onClick={close} className="block py-2.5 text-sm font-medium text-ink-soft hover:text-ink">Control Room</Link>
              )}
              {userProfile?.role === 'organization' && (
                <>
                  <Link to="/org/opportunities/new" onClick={close} className="block py-2.5 text-sm font-medium text-ink-soft hover:text-ink">Post Opportunity</Link>

                  <Link to="/org/profile" onClick={close} className="block py-2.5 text-sm font-medium text-ink-soft hover:text-ink">Profile</Link>
                  <Link to="/org/dashboard" onClick={close} className="block py-2.5 text-sm font-medium text-ink-soft hover:text-ink">Dashboard</Link>
                </>
              )}
              <div className="border-t border-line pt-3 mt-3">
                <button onClick={handleLogout} className="w-full text-left py-2.5 text-sm font-medium text-ink-soft hover:text-ink flex items-center gap-2 rounded-full">
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            </>
          ) : profilePending ? (
            <div className="py-2.5">
              <NavLoading />
            </div>
          ) : user ? (
            <>
              <div className="py-2.5">
                <NavLoading />
              </div>
              <button onClick={handleLogout} className="w-full text-left py-2.5 text-sm font-medium text-ink-soft hover:text-ink flex items-center gap-2 rounded-full">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={close} className="block py-2.5 text-sm font-medium text-ink-soft hover:text-ink">Log in</Link>
              <Link to="/signup" onClick={close} className="block w-full text-center bg-blue-dark text-paper py-2.5 text-sm font-medium mt-2 rounded-full">Sign Up</Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
