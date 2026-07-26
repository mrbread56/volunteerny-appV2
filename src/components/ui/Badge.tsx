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
    primary: 'bg-blue-dark/10 text-blue-dark border-blue-dark/20',
    secondary: 'bg-gray-50 text-ink-soft border-line',
    success: 'bg-blue-dark/5 text-blue-dark border-blue-dark/20',
    warning: 'bg-amber/10 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-blue-dark/5 text-blue-dark border-blue-dark/10',
  };

  return (
    <span className={cn(
      'inline-flex items-center px-3 py-1 text-xs font-medium border rounded-full',
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
}
