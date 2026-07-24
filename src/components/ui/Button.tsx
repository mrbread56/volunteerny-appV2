import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const variants = {
      primary: 'bg-[#1F4C63] hover:bg-[#153343] text-white shadow-[0_1px_2px_rgba(31,76,99,0.2),0_4px_12px_rgba(31,76,99,0.1)] hover:shadow-[0_1px_3px_rgba(31,76,99,0.3),0_8px_20px_rgba(31,76,99,0.15)] active:scale-[0.98] transition-all duration-300',
      secondary: 'bg-white text-ink border border-line hover:border-[#1F4C63]/20 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] active:scale-[0.98] transition-all duration-300',
      outline: 'border border-line bg-transparent text-ink hover:border-[#1F4C63]/20 hover:bg-[#1F4C63]/[0.02] active:scale-[0.98] transition-all duration-300',
      danger: 'bg-red-600 hover:bg-red-700 text-white shadow-[0_1px_2px_rgba(220,38,38,0.2)] active:scale-[0.98] transition-all duration-300',
      ghost: 'bg-transparent text-ink-soft hover:text-ink hover:bg-[#1F4C63]/[0.04] active:scale-[0.98] transition-all duration-300',
    };

    const sizes = {
      sm: 'px-3.5 py-2 text-[12px] font-medium',
      md: 'px-5 py-2.5 text-[13px] font-medium',
      lg: 'px-7 py-3 text-[14px] font-medium',
      icon: 'p-2.5',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4C63]/40 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4 text-current" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading...
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);
