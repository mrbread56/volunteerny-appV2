import { useEffect, useState } from 'react';

/**
 * Is motion allowed right now?
 *
 * The OS preference is authoritative. `?motion=full` and `?motion=reduce`
 * override it for review, because a reduced-motion branch is otherwise
 * impossible to check: whichever setting the machine happens to have is the
 * only branch anyone on that machine ever sees. A developer on a reduced-motion
 * desktop cannot look at the animation they just wrote without changing an OS
 * setting and restarting the browser.
 *
 * This logic already existed, copied by hand into useCountUp and useTilt. Two
 * copies is a coincidence; three would be a convention, and they had already
 * started to drift from what Home.tsx was doing (`useReducedMotion()` from
 * motion/react, which honours no override at all). One source now.
 *
 * ── Why a hook and not the bare function ──
 *
 * The copies were plain functions read once during an effect, so a visitor who
 * changed the preference mid-session kept whatever branch they loaded with.
 * Subscribing to the media query means the UI follows the setting live, which
 * is also what makes the query-string override work without a reload.
 */
export function motionAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search).get('motion');
  if (q === 'full') return true;
  if (q === 'reduce') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useMotionAllowed(): boolean {
  /* Server and first client render must agree, so this starts false and the
     effect corrects it. Guessing true here would mean an element rendered in
     its animated-away state on the server and then snapped, which is the
     flash the whole reduced-motion path exists to avoid. */
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setAllowed(motionAllowed());
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return allowed;
}
