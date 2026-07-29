import React from 'react';
import { cn } from '../../lib/utils';
import { motion } from 'motion/react';

export interface SidebarItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

export interface DashboardLayoutProps {
  title: string;
  subtitle?: string;
  sidebarItems?: SidebarItem[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
}

export default function DashboardLayout({
  title,
  subtitle,
  sidebarItems = [],
  activeTab,
  onTabChange,
  children,
  headerAction
}: DashboardLayoutProps) {
  const hasSidebar = sidebarItems.length > 0;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-paper-2">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-primary-950 tracking-tight">{title}</h1>
            {subtitle && <p className="text-ink-muted mt-1.5 text-[15px]">{subtitle}</p>}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>

        <div className="flex flex-col gap-6">

          {/*
            This used to render a second, full-height <aside> sidebar here
            (Overview / My Applications / Hours & Verification / Leaderboard /
            Settings) sitting directly beside DashboardShell's own sidebar
            (Dashboard / Browse / Leaderboard / Hours) — two sidebars stacked
            side by side on the same page. DashboardShell already owns sidebar
            navigation for the app; this component only ever needed to switch
            tabs *within* one page, so that's now a single horizontal tab bar
            at every screen size instead of a competing vertical rail.
          */}
          {hasSidebar && (
            <div className="-mx-4 px-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <nav className="flex gap-1 w-max border-b border-line-light">
                {sidebarItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => onTabChange?.(item.id)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium whitespace-nowrap transition-all focus-ring border-b-2 -mb-px",
                      activeTab === item.id
                        ? "border-primary-700 text-primary-900 font-semibold"
                        : "border-transparent text-ink-muted hover:text-ink-soft hover:bg-slate-100"
                    )}
                  >
                    <span className={cn(
                      "shrink-0 w-4 h-4",
                      activeTab === item.id ? "text-primary-700" : "text-ink-muted"
                    )}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>
          )}

          {/* Main Content */}
          {/* DashboardShell already renders the page's <main> landmark, so this
              produced a nested <main> — invalid HTML and two "main" landmarks
              for assistive tech to choose between. */}
          <div className="flex-1 min-w-0">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
