import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { verifyMfaClaim } from '../../lib/mfa';
import { LogOut, LayoutDashboard, Search, UserCircle, PlusCircle, Trophy, Menu, X, MessageCircle } from 'lucide-react';

export default function Navbar() {
  const { user, userProfile, loading, isDemoMode, logout, mfaVerified, profileMissing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const isVerified = verifyMfaClaim(user, userProfile, mfaVerified);
  const authed = !!user && !loading && !profileMissing && isVerified && location.pathname !== '/mfa';

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/');
  };

  const close = () => setOpen(false);

  const navLink = 'text-ink-soft hover:text-ink px-3 py-2 text-[13px] font-medium tracking-[-0.01em] transition-colors duration-200 relative after:absolute after:bottom-0 after:left-3 after:right-3 after:h-px after:bg-[#1F4C63] after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-300 after:origin-left';

  return (
    <nav className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-xl border-b border-line/60">
      {isDemoMode && (
        <div className="bg-gradient-to-r from-[#1F4C63] to-[#153343] text-paper text-[10px] font-semibold uppercase tracking-[0.2em] py-1.5 text-center">
          Demo Mode
          <button onClick={handleLogout} className="ml-4 text-paper/60 hover:text-paper underline text-[9px] rounded-full">
            Exit
          </button>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" onClick={close} className="flex items-center gap-2.5 group">
            <img
              src="/logo.png"
              alt="Volunteer North York"
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
                    <Link to="/messages" className={navLink}>
                      <span className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> Messages</span>
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
                    <Link to="/messages" className={navLink}>
                      <span className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> Messages</span>
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
            ) : user ? (
              <div className="flex items-center gap-2">
                <span className="text-ink-soft text-[13px] font-medium px-4 py-2 hidden md:block">
                  Security Verification
                </span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-ink-soft hover:text-ink text-[13px] font-medium px-3 py-2 transition-colors rounded-full border border-line hover:bg-slate-50"
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
                  className="bg-[#1F4C63] text-paper text-[13px] font-medium px-5 py-2 rounded-full hover:bg-[#153343] transition-all duration-300 shadow-[0_1px_2px_rgba(31,76,99,0.15)]"
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
                  <Link to="/messages" onClick={close} className="block py-2.5 text-sm font-medium text-ink-soft hover:text-ink">Messages</Link>
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
                  <Link to="/messages" onClick={close} className="block py-2.5 text-sm font-medium text-ink-soft hover:text-ink">Messages</Link>
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
          ) : user ? (
            <>
              <div className="py-2.5 text-sm font-medium text-ink-soft opacity-70">Security Verification Required</div>
              <button onClick={handleLogout} className="w-full text-left py-2.5 text-sm font-medium text-ink-soft hover:text-ink flex items-center gap-2 rounded-full">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={close} className="block py-2.5 text-sm font-medium text-ink-soft hover:text-ink">Log in</Link>
              <Link to="/signup" onClick={close} className="block w-full text-center bg-[#1F4C63] text-paper py-2.5 text-sm font-medium mt-2 rounded-full">Sign Up</Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
