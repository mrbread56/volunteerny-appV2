import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import {
  LayoutDashboard, Search, MessageCircle, UserCircle, Trophy,
  Calendar, Settings, PlusCircle, ClipboardList, Clock, LogOut,
  Menu, X, Shield, HelpCircle, Send,
} from 'lucide-react';
import React, { useState } from 'react';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/* ── Navigation grouped by relevance ──
 * Main actions at the top. Settings/help at the bottom.
 * This follows the sidebar pattern from Linear/Vercel: frequently-used
 * items are always visible, rarely-used ones are pushed to the bottom
 * where users expect "meta" actions to live.
 */
const studentMain: NavItem[] = [
  { to: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/student/opportunities', label: 'Browse', icon: Search },
  { to: '/student/dashboard?tab=leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/student/dashboard?tab=calendar', label: 'Calendar', icon: Calendar },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
];
const studentBottom: NavItem[] = [
  { to: '/student/profile', label: 'Profile', icon: UserCircle },
  { to: '/student/dashboard?tab=settings', label: 'Settings', icon: Settings },
  { to: '/feedback', label: 'Feedback', icon: Send },
];

const orgMain: NavItem[] = [
  { to: '/org/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/org/dashboard?tab=opportunities', label: 'Opportunities', icon: ClipboardList },
  { to: '/org/dashboard?tab=applications', label: 'Applications', icon: Search },
  { to: '/org/dashboard?tab=hours', label: 'Hours', icon: Clock },
  { to: '/org/opportunities/new', label: 'Post New', icon: PlusCircle },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
];
const orgBottom: NavItem[] = [
  { to: '/org/profile', label: 'Profile', icon: UserCircle },
  { to: '/feedback', label: 'Feedback', icon: Send },
];

const devMain: NavItem[] = [
  { to: '/developer/dashboard', label: 'Control Room', icon: Shield },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
];
const devBottom: NavItem[] = [
  { to: '/feedback', label: 'Feedback', icon: Send },
];

function isActive(itemTo: string, currentPath: string, currentSearch: string): boolean {
  const [path, query] = itemTo.split('?');
  if (path !== currentPath) return false;
  if (!query) return !currentSearch || !currentSearch.includes('tab=');
  return currentSearch.includes(query);
}

function NavGroup({ items, location, onNavigate }: {
  items: NavItem[];
  location: { pathname: string; search: string };
  onNavigate: () => void;
}) {
  return (
    <>
      {items.map(({ to, label, icon: Icon }) => {
        const active = isActive(to, location.pathname, location.search);
        return (
          <Link
            key={to + label}
            to={to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-3 py-2 text-[13px] font-medium rounded-lg transition-colors",
              active
                ? "bg-[#1F4C63] text-white"
                : "text-ink-muted hover:bg-paper-3 hover:text-ink"
            )}
          >
            <Icon className="w-[18px] h-[18px] shrink-0" />
            {label}
          </Link>
        );
      })}
    </>
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { userProfile, isDemoMode, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = userProfile?.role;
  const main = role === 'organization' ? orgMain : role === 'developer' ? devMain : studentMain;
  const bottom = role === 'organization' ? orgBottom : role === 'developer' ? devBottom : studentBottom;

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const closeMobile = () => setMobileOpen(false);

  const sidebar = (
    <div className="flex flex-col h-full bg-[#FAFAF8]">
      {/* Logo — compact, no border, just spacing */}
      <Link to="/" onClick={closeMobile} className="flex items-center gap-2.5 px-5 py-4">
        <img src="/logo.png" alt="" className="w-7 h-7 object-contain" />
        <span className="text-[14px] font-semibold tracking-[-0.02em] text-ink">
          Volunteer NY
        </span>
      </Link>

      {isDemoMode && (
        <div className="mx-3 mb-2 px-3 py-1.5 bg-[#1F4C63] text-white text-xs font-medium text-center rounded-lg">
          Demo Mode
        </div>
      )}

      {/* Main navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        <NavGroup items={main} location={location} onNavigate={closeMobile} />
      </nav>

      {/* Bottom: profile, settings, help — separated */}
      <div className="px-3 py-2 space-y-0.5 border-t border-line-light">
        <NavGroup items={bottom} location={location} onNavigate={closeMobile} />
      </div>

      {/* User card + sign out */}
      <div className="px-3 py-3 border-t border-line-light">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-lg bg-[#1F4C63] flex items-center justify-center text-white text-xs font-semibold shrink-0">
            {(userProfile?.email || 'U')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink truncate">
              {userProfile?.email || 'User'}
            </p>
            <p className="text-xs text-ink-muted capitalize">
              {role || 'student'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 text-[13px] font-medium text-ink-muted hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors w-full mt-1"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-paper-2 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-[240px] border-r border-line-light fixed top-0 left-0 h-screen z-40">
        {sidebar}
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-line-light flex items-center justify-between px-4 h-14">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="w-6 h-6" />
          <span className="text-[13px] font-semibold text-ink">VNY</span>
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 text-ink-muted hover:text-ink rounded-lg"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/20 z-40" onClick={closeMobile} />
          <aside className="lg:hidden fixed top-0 left-0 w-[280px] h-screen z-50 shadow-xl">
            {sidebar}
          </aside>
        </>
      )}

      {/* Main content — subtle gray bg so cards pop (video: lighter cards on darker bg) */}
      <main className="flex-1 lg:ml-[240px] min-h-screen">
        <div className="pt-14 lg:pt-0">
          {children}
        </div>
      </main>
    </div>
  );
}
