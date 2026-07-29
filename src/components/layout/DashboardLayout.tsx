import React from 'react';
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
  activeTab,
  children,
  headerAction
}: DashboardLayoutProps) {
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
            This used to render a second nav here for switching tabs within the
            page (Overview / My Applications / Hours & Verification /
            Leaderboard / Settings) — first as a full-height sidebar stacked
            beside DashboardShell's own sidebar, then briefly as a horizontal
            bar. Both were a second nav competing with the app's actual
            sidebar. DashboardShell's studentMain/studentBottom now carry an
            entry for every one of these tabs (including 'My Applications',
            which had no entry anywhere before), so this component renders
            nothing but the page content — there is exactly one nav.
          */}

          {/* Main Content */}
          {/* DashboardShell already renders the page's <main> landmark, so this
              is a <div>, not another <main> — that was already fixed once
              before and is not the bug being described here. */}
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
