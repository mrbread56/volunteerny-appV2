import { useEffect, useRef } from 'react';

/**
 * Keyboard and screen-reader plumbing that every modal in this app was missing.
 *
 * All four dialogs (ReportModal, ReceiptModal, RejectionDialog,
 * ApplicationReviewDialog) locked body scroll and stopped there: no
 * role="dialog", no aria-modal, no Escape, no focus trap, no focus restore.
 * A keyboard user could tab straight past the modal into the page behind it
 * with no way back and no way to close.
 *
 * Usage:
 *   const dialogRef = useDialog(isOpen, onClose);
 *   <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="…">
 *
 * Body scroll lock stays where it already is in each component — this hook
 * deliberately does not duplicate it.
 */
export function useDialog(isOpen: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusable = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // Move focus into the dialog. Without this, focus stays on the trigger
    // behind the overlay and the first Tab lands outside the modal.
    const first = focusable()[0];
    (first ?? ref.current)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === firstItem || !ref.current?.contains(active))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Return focus to whatever opened the dialog, so keyboard users do not
      // get dumped back at the top of the document.
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, onClose]);

  return ref;
}
