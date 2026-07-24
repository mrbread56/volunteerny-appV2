import React from 'react';
import { cn } from '../../lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-[13px] font-medium text-ink">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <select
          className={cn(
            'flex h-11 w-full border border-line bg-white px-3.5 py-2 text-[14px] text-ink focus:outline-none focus:border-[#1F4C63] focus:ring-1 focus:ring-[#1F4C63] disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
            error ? 'border-red-500 focus:ring-red-500' : '',
            className
          )}
          ref={ref}
          {...props}
        >
          {props.placeholder && <option value="" disabled>{props.placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-[12px] text-red-600 mt-0.5">{error}</p>}
      </div>
    );
  }
);
