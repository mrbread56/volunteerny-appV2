import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

/**
 * A button that fires only after being clicked several times.
 *
 * The developer console suspends a real person's account on ONE click, in six
 * places, with nothing between the pointer and the consequence. Suspension
 * takes away an organisation's ability to accept students and a student's
 * ability to apply, and the person it happens to is not asked and not warned.
 * A slip on a dense list of rows does it silently.
 *
 * Repeated clicks rather than a modal, because the two failure modes are
 * different. A modal is dismissed by the same reflex that opened it: on a list
 * where a coordinator confirms things all afternoon, "are you sure" becomes a
 * second click in the same muscle movement. Requiring the SAME button to be
 * hit again, after its label has changed under the cursor, breaks the
 * movement instead of extending it.
 *
 * The count resets on a four second pause, when the pointer leaves, and on
 * blur, so a half-finished action never sits armed waiting for an unrelated
 * click later.
 *
 * ACCESSIBILITY. The accessible name is fixed by `confirmLabel` and does not
 * change as the count goes down: a name that mutates mid-interaction is
 * announced as a new control each time, which is disorienting exactly when the
 * user most needs to know what they are operating. Progress is announced
 * through a polite live region instead, which is what live regions are for.
 */
export function ConfirmButton({
  clicks = 2,
  onConfirm,
  children,
  confirmLabel,
  className,
  armedClassName,
  disabled,
  resetMs = 4000,
}: {
  /** Total clicks required, including the first. */
  clicks?: number;
  onConfirm: () => void;
  children: React.ReactNode;
  /** Stable accessible name, e.g. "Suspend Alex Li". Required: the visible
   *  label changes while arming, so it cannot be the accessible name. */
  confirmLabel: string;
  className?: string;
  /** Extra classes once the button is armed, to make the state obvious. */
  armedClassName?: string;
  disabled?: boolean;
  resetMs?: number;
}) {
  const [remaining, setRemaining] = useState(clicks);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const reset = () => { clear(); setRemaining(clicks); };

  // A pending timer must not fire into an unmounted component, and an armed
  // button must not survive the row being re-rendered for another account.
  useEffect(() => reset, [clicks]);
  useEffect(() => clear, []);

  const handle = () => {
    if (disabled) return;
    const left = remaining - 1;
    if (left <= 0) {
      reset();
      onConfirm();
      return;
    }
    setRemaining(left);
    clear();
    timer.current = setTimeout(() => setRemaining(clicks), resetMs);
  };

  const armed = remaining < clicks;

  return (
    <>
      <button
        type="button"
        onClick={handle}
        onPointerLeave={armed ? reset : undefined}
        onBlur={armed ? reset : undefined}
        disabled={disabled}
        aria-label={confirmLabel}
        data-armed={armed || undefined}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold',
          'transition-colors duration-[120ms] cursor-pointer',
          'focus-visible:outline-3 focus-visible:outline-blue-dark focus-visible:outline-offset-2',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          className,
          armed && armedClassName,
        )}
      >
        {armed
          ? (remaining === 1 ? 'Click once more' : `Click ${remaining} more times`)
          : children}
      </button>
      <span aria-live="polite" className="sr-only">
        {armed
          ? `${confirmLabel}. ${remaining} more ${remaining === 1 ? 'click' : 'clicks'} to confirm. Move away to cancel.`
          : ''}
      </span>
    </>
  );
}
