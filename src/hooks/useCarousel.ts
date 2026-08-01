import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * Index + autoplay for the home page carousels.
 *
 * The fiddly part here is WCAG 2.2.2: auto-advancing content must be pausable,
 * and manual selection must not be overridden a second later by an interval
 * that kept running. `index` sits in the dep array so choosing a slide restarts
 * the clock, and `pauseProps` covers hover, keyboard focus, and
 * prefers-reduced-motion. Both carousels share this so neither can drift out of
 * compliance on its own.
 *
 * `dir` is +1 or -1 so slide transitions know which way to travel.
 */
export function useCarousel(length: number, intervalMs = 5000) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const step = (delta: number) => {
    setDir(delta > 0 ? 1 : -1);
    setIndex((i) => (i + delta + length) % length);
  };

  const go = (next: number) => {
    setDir(next > index ? 1 : -1);
    setIndex(next);
  };

  useEffect(() => {
    if (paused || prefersReducedMotion) return;
    const t = setTimeout(() => step(1), intervalMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, prefersReducedMotion, length, intervalMs]);

  const pauseProps = {
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onFocusCapture: () => setPaused(true),
    onBlurCapture: () => setPaused(false),
  };

  // Callers multiply their travel distance by this: reduced-motion users get a
  // plain cross-fade instead of a slide. Stopping autoplay alone is not enough —
  // clicking an arrow still animates.
  const travel = prefersReducedMotion ? 0 : 1;

  return { index, dir, travel, go, next: () => step(1), prev: () => step(-1), pauseProps };
}
