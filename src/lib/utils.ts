import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date, or return '' if there isn't one.
 *
 * Intl.DateTimeFormat.format() THROWS RangeError on an Invalid Date rather
 * than returning a useless string, and every caller of this runs inside
 * render. So a single opportunity saved without a `dateTime` — a field the
 * Opportunity type marks optional and firestore.rules does not require — took
 * down the WHOLE browse page for every student with a blank screen, not just
 * that one card. Found when a test seeded an opportunity without a date.
 *
 * Guarding here rather than at each call site because every caller routes
 * through this one function, and the next one to be written would have the
 * same bug.
 */
export function formatDate(date: string | number | Date | null | undefined) {
  if (date === null || date === undefined || date === '') return '';
  const d = new Date(date as string | number | Date);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn("navigator.clipboard failed, trying fallback...", e);
    }
  }

  // Fallback method using temporary element selection
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error("Fallback clipboard copy failed:", err);
    return false;
  }
}
