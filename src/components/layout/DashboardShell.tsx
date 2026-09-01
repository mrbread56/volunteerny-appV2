import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import NotificationBell from '../NotificationBell';
import {
  LayoutDashboard, Search, MessageCircle, UserCircle, Trophy,
  Calendar, Settings, PlusCircle, ClipboardList, Clock, LogOut,
  Menu, X, Shield, HelpCircle, Send,
} from 'lucide-react';
import React, { useState } from 'react';
import { useDialog } from '../../hooks/useDialog';

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
/*
 * Four destinations, not eight.
 *
 * This advertised eight entries of which FIVE resolved to /student/dashboard
 * with a different ?tab=. A sidebar is a promise about how big the product is,
 * and this one promised eight places while delivering four.
 *
 * Browse leads, because finding a placement is what a student came for and it
 * was previously the second item under a "Dashboard" that mostly summarised
 * the other tabs. Hours is second because getting them signed off is the other
 * half of the job. Applications and the old Dashboard summary now live as one
 * entry, since the summary existed to point at them.
 */
const studentMain: NavItem[] = [
  { to: '/student/opportunities', label: 'Browse', icon: Search },
  { to: '/student/dashboard?tab=hours', label: 'My hours', icon: Clock },
  { to: '/student/dashboard?tab=applications', label: 'Applications', icon: Calendar },
];
const studentBottom: NavItem[] = [
  { to: '/student/profile', label: 'Profile', icon: UserCircle },
  { to: '/student/dashboard?tab=leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/student/dashboard?tab=settings', label: 'Settings', icon: Settings },
  { to: '/feedback', label: 'Feedback', icon: Send },
];

/*
 * Three destinations. Applications leads, because reviewing applicants is the
 * job a coordinator signs in to do.
 *
 * Overview is gone: it rendered four stat tiles, three of them reading 0, and
 * nothing else. "Post New" is gone from the sidebar because the Opportunities
 * page already carries a Post button, so one destination had two names in two
 * places.
 */
const orgMain: NavItem[] = [
  { to: '/org/dashboard?tab=applications', label: 'Applications', icon: Search },
  { to: '/org/dashboard?tab=opportunities', label: 'Opportunities', icon: ClipboardList },
  { to: '/org/dashboard?tab=hours', label: 'Hours', icon: Clock },
];
const orgBottom: NavItem[] = [
  { to: '/org/profile', label: 'Profile', icon: UserCircle },
  { to: '/feedback', label: 'Feedback', icon: Send },
];

const devMain: NavItem[] = [
  { to: '/developer/dashboard', label: 'Control Room', icon: Shield },

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
                ? "bg-blue-dark text-white"
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
  // The mobile drawer was the one overlay in the app that did not use this:
  // no Escape, no focus move into it, no focus restore to the hamburger, and a
  // backdrop whose only dismissal was a mouse click. Every dialog in the app
  // already goes through the same hook.
  const drawerRef = useDialog(mobileOpen, closeMobile);

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
        <div className="mx-3 mb-2 px-3 py-1.5 bg-blue-dark text-white text-xs font-medium text-center rounded-lg">
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
          <div className="w-8 h-8 rounded-lg bg-blue-dark flex items-center justify-center text-white text-xs font-semibold shrink-0">
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
      {/* Skip link — WCAG 2.4.1, and the first thing an AODA reviewer checks.
          Every page puts a nav of 5-8 links, a bell and a user card ahead of the
          content, so a keyboard user re-tabbed the whole sidebar on every single
          navigation. Visually hidden until focused. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-blue-dark focus:px-4 focus:py-2 focus:text-white focus:font-semibold focus:text-sm"
      >
        Skip to main content
      </a>
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-line-light flex items-center justify-between px-4 h-14">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="w-6 h-6" />
          <span className="text-[13px] font-semibold text-ink">VNY</span>
        </Link>
        {/* Outside the collapsed menu on purpose: an unread badge that only
            appears after you open a menu defeats the point of a badge. */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="p-2 text-ink-muted hover:text-ink rounded-lg"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ONE bell, for the whole shell.
          It used to be rendered twice — once inside the mobile header and once
          in a desktop float — hidden from each other with `lg:hidden` /
          `hidden lg:block`. Those are CSS, not mounting: React mounted both, so
          every notification fetch ran TWICE on every dashboard load. For a
          student that is ten Firestore queries and up to 380 documents instead
          of five and 190, paid for on mobile data.
          It cannot live inside the mobile header either, because that header is
          itself `lg:hidden` and would take the bell with it on desktop. So it
          sits here, outside both, and only its position changes: left of the
          hamburger on mobile, top-right of the content area on desktop. */}
      <div className="fixed z-50 top-3 right-14 lg:top-4 lg:right-6">
        <NotificationBell />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/20 z-40" onClick={closeMobile} />
          {/* 100dvh, not h-screen. h-screen is 100vh, which on mobile Safari
              and Chrome is the viewport with the browser toolbars treated as
              absent -- so the drawer was taller than the visible area and its
              last block ran underneath the toolbar. That block is the user
              card and Sign out, and it sits OUTSIDE the scrolling <nav>, so
              there was no way to scroll to it: on a phone, signing out of this
              app was unreachable. dvh tracks the toolbars as they collapse. */}
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="lg:hidden fixed top-0 left-0 w-[280px] h-[100dvh] z-50 shadow-xl"
          >
            {sidebar}
          </aside>
        </>
      )}

      {/* Main content — subtle gray bg so cards pop (video: lighter cards on darker bg) */}
      {/* min-w-0 is load-bearing, not tidying. A flex item defaults to
          min-width:auto, which refuses to shrink below its content's intrinsic
          width — so any page with something wide inside pushed THIS element
          past the viewport and gave the whole document a horizontal scrollbar,
          rather than the content reflowing. Measured on
          /org/opportunities/new at 375px: main rendered 382.7px wide inside a
          375.3px parent. With min-w-0 the content reflows and nothing is cut
          off. Every dashboard page renders through here, so removing it
          re-breaks all of them the moment one gains a wide child. */}
      <main id="main" tabIndex={-1} className="flex-1 min-w-0 lg:ml-[240px] min-h-screen">
        <div className="pt-14 lg:pt-0">
          {children}
        </div>
      </main>
    </div>
  );
}
