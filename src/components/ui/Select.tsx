import React from 'react';
import { cn } from '../../lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder, ...props }, ref) => {
    // The label used to render without htmlFor and the select without an id, so
    // every Select in the app was programmatically unlabelled even when a label
    // was passed. Input already did this correctly; this matches it.
    const generatedId = React.useId();
    const id = props.id || generatedId;
    const errorId = `${id}-error`;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-ink">
            {label}
            {props.required && <span className="text-red-600 ml-1" aria-hidden="true">*</span>}
          </label>
        )}
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'flex h-11 w-full border border-line-control rounded-lg bg-white px-3.5 py-2 text-sm text-ink focus:outline-none focus:border-blue-dark focus:ring-1 focus:ring-blue-dark disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
            error ? 'border-red-500 focus:ring-red-500' : '',
            className
          )}
          ref={ref}
          {...props}
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p id={errorId} className="text-xs text-red-600 mt-0.5">{error}</p>}
      </div>
    );
  }
);
