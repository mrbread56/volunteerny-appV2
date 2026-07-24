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
    <div className="min-h-[calc(100vh-64px)] bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-primary-950 tracking-tight">{title}</h1>
            {subtitle && <p className="text-slate-500 mt-1.5 text-[15px]">{subtitle}</p>}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>

        <div className={cn("flex flex-col gap-8", hasSidebar && "lg:flex-row lg:gap-10")}>
          
          {/* Sidebar (desktop) / Tabs (mobile) */}
          {hasSidebar && (
            <>
              {/* Desktop sidebar */}
              <aside className="hidden lg:block lg:w-56 shrink-0">
                <nav className="flex flex-col gap-1 sticky top-24">
                  {sidebarItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => onTabChange?.(item.id)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium transition-all duration-200 w-full text-left focus-ring",
                        activeTab === item.id 
                          ? "bg-[#F6F1E4] text-primary-900 shadow-card font-semibold" 
                          : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                      )}
                    >
                      <span className={cn(
                        "shrink-0 w-4 h-4",
                        activeTab === item.id ? "text-primary-700" : "text-slate-400"
                      )}>{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </nav>
              </aside>

              {/* Mobile tabs */}
              <div className="lg:hidden -mx-4 px-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                <nav className="flex gap-1 w-max">
                  {sidebarItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => onTabChange?.(item.id)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-medium whitespace-nowrap transition-all focus-ring",
                        activeTab === item.id 
                          ? "bg-[#F6F1E4] text-primary-900 shadow-card font-semibold" 
                          : "text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      <span className="shrink-0 w-4 h-4">{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </nav>
              </div>
            </>
          )}

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}
