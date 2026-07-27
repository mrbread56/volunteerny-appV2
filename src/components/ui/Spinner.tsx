import { cn } from '../../lib/utils';

const sizes = {
  sm: 'w-3.5 h-3.5 border-[1.5px]',
  md: 'w-5 h-5 border-2',
  lg: 'w-6 h-6 border-2',
} as const;

interface SpinnerProps {
  size?: keyof typeof sizes;
  className?: string;
  /** Announced to screen readers. Pass null for decorative spinners sitting next to their own label. */
  label?: string | null;
}

/**
 * The one loading indicator for the app.
 *
 * `data-motion="essential"` keeps it turning under
 * `prefers-reduced-motion: reduce` — see the media query in index.css. Without
 * it the global rule pins the animation to a single frame and the spinner
 * reads as a frozen app rather than a working one.
 */
export function Spinner({ size = 'md', className, label = 'Loading' }: SpinnerProps) {
  return (
    <span
      data-motion="essential"
      role={label ? 'status' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      className={cn(
        'inline-block rounded-full border-current/15 border-t-current animate-spin align-middle',
        sizes[size],
        className,
      )}
    />
  );
}

export default Spinner;
