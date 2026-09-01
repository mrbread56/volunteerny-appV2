import { useEffect } from 'react';

const SUFFIX = 'Volunteer NY';

/**
 * Set the document title for a screen.
 *
 * The app shipped one static <title> in index.html for every route, so every
 * browser tab, every bookmark and every history entry read "Volunteer-NY
 * Toronto". That matters more than it sounds: browsing is a recurrent activity
 * — Tauscher & Greenberg (IJHCS 1997) measured a 58% page revisit rate, with
 * Back at ~32% of navigation actions — and a history list of identical strings
 * is unusable for returning to anything.
 *
 * Format follows NN/g's microcontent guidance: 40 to 60 characters, the
 * information-carrying words FIRST, no leading articles. Their eyetracking on
 * scanning found users take about the first two words of a list item, so the
 * specific part leads and the product name trails.
 *
 * Where a screen has a number worth knowing, put it in the title. A returning
 * student reads "Hours: 12 of 40" in the tab strip without opening anything,
 * which is the job the deleted overview screen was trying to do, for free.
 *
 * Passing an empty title restores the default, so a route can opt out.
 */
export function usePageTitle(title?: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
