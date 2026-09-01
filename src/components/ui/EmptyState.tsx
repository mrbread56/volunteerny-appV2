import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * One empty state, used everywhere.
 *
 * The app had five of these and rendered them five different ways: padding of
 * p-8, none at all, py-12, py-12 and py-6; three different border treatments;
 * one with no container whatsoever; and one with a pulsing icon. Same concept,
 * five appearances, so "nothing here" looked like a different kind of event
 * depending on which screen you were on.
 *
 * The shape follows NN/g's three requirements for an empty state: say what the
 * state IS (so it does not read as an error or as still loading), say what
 * would appear here and how it gets there, and offer the action that resolves
 * it. A bare "No results" satisfies only the first, and an empty region with no
 * explanation reads as a broken account rather than a new one.
 *
 * `action` is deliberately optional: a filtered-to-nothing list wants a "clear
 * filters" button, a genuinely new account wants a link, and a queue that is
 * empty because the moderator cleared it wants neither.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  /** What the state is, in a few words. Not "Error", not "Loading". */
  title: string;
  /** What would appear here, and how it gets here. */
  body?: string;
  action?: { label: string; to?: string; onClick?: () => void };
}) {
  return (
    <div className="px-6 py-14 text-center">
      {icon && (
        <div className="mb-3 flex justify-center text-ink-muted" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body && (
        <p className="mt-2 text-[13px] text-ink-soft leading-relaxed max-w-sm mx-auto">
          {body}
        </p>
      )}
      {action && (
        <div className="mt-4">
          {action.to ? (
            <Link
              to={action.to}
              className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-lg bg-blue-dark text-white text-[15px] font-medium hover:bg-[#153343] transition-colors"
            >
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-lg bg-blue-dark text-white text-[15px] font-medium hover:bg-[#153343] transition-colors"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
