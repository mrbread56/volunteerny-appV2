import { useEffect, useRef } from 'react';
import { motionAllowed } from './useMotionAllowed';

/**
 * Number ticker — digits count up to a value when they scroll into view.
 *
 * Written against a ref rather than React state on purpose: a counter that
 * re-renders every frame would re-render the whole stats section 60 times a
 * second for a purely visual effect. Writing textContent directly touches one
 * text node and skips reconciliation entirely.
 *
 * The element must be server-rendered with its FINAL value, not a zero. If the
 * markup ships "0" and JS is slow, disabled, or errors, the page states a wrong
 * fact — "0% of Canadians volunteer" — instead of merely missing an animation.
 * This hook only ever animates from a starting value up to what is already
 * there, so the honest value is the fallback.
 */

export function useCountUp<T extends HTMLElement>(
  target: number,
  decimals = 0,
  durationMs = 1400,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const format = (v: number) => v.toFixed(decimals);
    const final = format(target);

    if (!motionAllowed()) {
      el.textContent = final;
      return;
    }

    let raf = 0;
    let started = false;

    const run = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / durationMs);
        // Ease-out: fast start, slow settle. A linear count reads like a loading
        // spinner rather than a value arriving.
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = format(target * eased);
        if (p < 1) raf = requestAnimationFrame(tick);
        else el.textContent = final;
      };
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started) return;
        started = true;
        io.disconnect();
        run();
      },
      { threshold: 0.4 },
    );

    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target, decimals, durationMs]);

  return ref;
}
