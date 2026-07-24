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

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={id} className="text-[13px] font-medium text-ink">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative w-full">
          <input
            id={id}
            type={isPassword && showPassword ? 'text' : type}
            className={cn(
              'flex h-11 w-full border border-line bg-white px-3.5 py-2 text-[14px] text-ink placeholder:text-ink-muted/50 focus:outline-none focus:border-[#1F4C63] focus:ring-1 focus:ring-[#1F4C63] disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
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
        {error && <p className="text-[12px] text-red-600 mt-0.5">{error}</p>}
        {helperText && !error && <p className="text-[12px] text-ink-muted mt-0.5">{helperText}</p>}
      </div>
    );
  }
);
