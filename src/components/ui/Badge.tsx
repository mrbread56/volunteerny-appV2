import React from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
  key?: React.Key;
}

export function Badge({ children, variant = 'primary', className }: BadgeProps) {
  const variants = {
    primary: 'bg-[#1F4C63]/10 text-[#1F4C63] border-[#1F4C63]/20',
    secondary: 'bg-gray-50 text-ink-soft border-line',
    success: 'bg-[#1F4C63]/5 text-[#1F4C63] border-[#1F4C63]/20',
    warning: 'bg-[#E08A3C]/10 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-[#1F4C63]/5 text-[#1F4C63] border-[#1F4C63]/10',
  };

  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 text-[11px] font-medium border',
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
}
