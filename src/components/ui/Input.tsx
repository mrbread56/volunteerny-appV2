import React, { useState } from 'react';
import { cn } from '../../lib/utils';
import { Eye, EyeOff } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const generatedId = React.useId();
    const id = props.id || generatedId;
    const errorId = `${id}-error`;
    const helperId = `${id}-helper`;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-ink">
            {label}
            {/* red-500 measured 3.81:1 on white; red-600 clears 4.5:1. The
                asterisk is decorative — `required` carries the meaning. */}
            {props.required && <span className="text-red-600 ml-1" aria-hidden="true">*</span>}
          </label>
        )}
        <div className="relative w-full">
          <input
            id={id}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            type={isPassword && showPassword ? 'text' : type}
            className={cn(
              'flex h-11 w-full border border-line-control rounded-lg bg-white px-3.5 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-blue-dark focus:ring-1 focus:ring-blue-dark disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
              isPassword && 'pr-10',
              error ? 'border-red-500 focus:ring-red-500' : '',
              className
            )}
            ref={ref}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink focus:outline-none flex items-center justify-center p-1.5 hover:bg-gray-50 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4 shrink-0" /> : <Eye className="h-4 w-4 shrink-0" />}
            </button>
          )}
        </div>
        {error && <p id={errorId} className="text-xs text-red-600 mt-0.5">{error}</p>}
        {helperText && !error && <p id={helperId} className="text-xs text-ink-muted mt-0.5">{helperText}</p>}
      </div>
    );
  }
);
