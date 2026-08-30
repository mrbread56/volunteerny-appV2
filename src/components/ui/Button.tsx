import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    /*
     * Motion: named properties, 120ms, ease-out — not `transition-all
     * duration-300`.
     *
     * 300ms is 3x Fluent's 100ms for a button state change and past Nielsen's
     * 0.1s "reacting instantaneously" limit, so the press visual was still
     * animating after the user had already judged the app slow. `all` also
     * animates layout properties and anything added later.
     *
     * active:scale-[0.98] is gone. None of Material, Carbon, Fluent, Polaris,
     * Apple or GOV.UK scales a button on press — the physical metaphor is a
     * button moving DOWN, not shrinking. It also opts into WCAG 2.3.3, whose
     * definition of motion animation excludes colour and opacity but includes
     * anything changing perceived size; and shrinking the element can pull its
     * edge out from under the pointer mid-click, so a press near the edge is
     * swallowed.
     */
    const motion = 'transition-[background-color,border-color,color,box-shadow] duration-[120ms] ease-out';

    const variants = {
      primary: `bg-blue-dark hover:bg-[#153343] active:bg-[#0F2632] text-white shadow-[0_1px_2px_rgba(31,76,99,0.2)] hover:shadow-[0_2px_6px_rgba(31,76,99,0.24)] ${motion}`,
      secondary: `bg-white text-ink border border-line hover:border-blue-dark hover:bg-blue-dark/[0.04] active:bg-blue-dark/[0.08] ${motion}`,
      outline: `border border-line bg-transparent text-ink hover:border-blue-dark hover:bg-blue-dark/[0.04] active:bg-blue-dark/[0.08] ${motion}`,
      // #DC2626 is 4.83:1 with white — AA but not AAA. #B91C1C is 7.0:1.
      danger: `bg-[#B91C1C] hover:bg-[#991B1B] active:bg-[#7F1D1D] text-white shadow-[0_1px_2px_rgba(185,28,28,0.2)] ${motion}`,
      ghost: `bg-transparent text-ink-soft hover:text-ink hover:bg-blue-dark/[0.06] active:bg-blue-dark/[0.10] ${motion}`,
    };

    /*
     * min-height, not padding, and 44px at the default size.
     *
     * The old default computed to about 40px, which clears WCAG 2.5.8's 24px
     * but misses Apple's 44pt and Material's 48dp — on a product whose primary
     * users are teenagers using it one-handed on a phone. Height is set by
     * min-height so the box does not drift when the font renders differently,
     * and the touch floor rises to 48px below the tablet breakpoint where
     * everyone is actually thumbing at it.
     */
    const sizes = {
      sm: 'min-h-[40px] md:min-h-[36px] px-4 text-[13px] font-medium',
      md: 'min-h-[48px] md:min-h-[44px] px-5 text-[15px] font-medium',
      lg: 'min-h-[52px] md:min-h-[48px] px-6 text-[16px] font-semibold',
      icon: 'min-h-[48px] min-w-[48px] md:min-h-[44px] md:min-w-[44px]',
    };

    return (
      <button
        ref={ref}
        /*
         * aria-disabled while loading, not `disabled`.
         *
         * The `disabled` attribute removes the element from the tab order, so
         * a keyboard user who pressed Enter had focus dropped to <body> the
         * instant the request started. aria-disabled keeps it focusable and
         * announced; the handler is guarded below instead.
         */
        disabled={disabled}
        aria-disabled={disabled || isLoading || undefined}
        aria-busy={isLoading || undefined}
        onClick={isLoading ? (e) => e.preventDefault() : props.onClick}
        className={cn(
          /*
           * outline: 3px solid transparent, not outline-none.
           *
           * A transparent outline is re-coloured by Windows High Contrast /
           * forced-colors mode; `outline: none` leaves nothing for it to
           * re-colour, so the focus indicator vanished entirely for those
           * users. GOV.UK's technique.
           *
           * The ring is doubled — white inner, blue outer — so one token works
           * on both grounds. A single blue-dark/40 ring is invisible on a
           * blue-dark primary button, which is exactly where it was.
           */
          'inline-flex items-center justify-center rounded-lg outline-3 outline-transparent focus-visible:ring-[3px] focus-visible:ring-blue-dark focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50 disabled:pointer-events-none',
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
