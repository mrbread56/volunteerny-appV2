import { useRef, useCallback } from 'react';
import { motionAllowed } from './useMotionAllowed';

/**
 * 3D tilt — a card leans toward the cursor, then springs back on leave, with an
 * optional specular glare that tracks the pointer across the surface.
 *
 * Written with direct style writes rather than React state: a tilt that set
 * state on every pointermove would re-render the card dozens of times a second
 * for a purely visual effect. This touches one element's transform, which the
 * compositor can handle without layout or paint.
 *
 * The glare is a translated element, never a repainted gradient. Writing a new
 * `background: radial-gradient(...)` string on every move would repaint the
 * card's whole surface each frame; moving one pre-rendered soft circle with
 * `translate3d` stays on the compositor. Same picture, no paint.
 *
 * Gated to fine pointers. On touch there is no hover, so the tilt would only
 * ever fire as a jarring lurch at the moment of tap; and `pointerleave` is not
 * guaranteed to arrive on touch, which would leave the card stuck mid-tilt.
 */
export function useTilt<T extends HTMLElement>(maxDeg = 6) {
  const ref = useRef<T>(null);
  const glareRef = useRef<HTMLDivElement>(null);

  const onPointerMove = useCallback((e: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse' || !motionAllowed()) return;

    const r = el.getBoundingClientRect();
    // -0.5..0.5 from the card's centre, so the tilt follows which side the
    // cursor is on rather than raw viewport position.
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;

    // rotateX is negated: moving the pointer DOWN should push the bottom edge
    // away from the viewer, which is a negative X rotation.
    el.style.transform =
      `perspective(900px) rotateY(${px * maxDeg}deg) rotateX(${-py * maxDeg}deg) translateZ(0)`;
    // Fast while tracking, so the card stays glued to the cursor.
    el.style.transitionDuration = '80ms';

    const g = glareRef.current;
    if (g) {
      // The -50% keeps the highlight centred on the pointer. It has to live
      // inside the transform rather than as a Tailwind translate utility,
      // because writing `style.transform` here would overwrite that utility.
      g.style.transform =
        `translate3d(calc(${e.clientX - r.left}px - 50%), calc(${e.clientY - r.top}px - 50%), 0)`;
      g.style.opacity = '1';
    }
  }, [maxDeg]);

  const onPointerLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(900px) rotateY(0deg) rotateX(0deg) translateZ(0)';
    // Slow, springy settle on the way back — the release is the interface
    // answering, not the user acting.
    el.style.transitionDuration = '600ms';

    const g = glareRef.current;
    // The highlight fades rather than sliding home: a light source does not
    // travel back to the middle of a surface, it just stops falling on it.
    if (g) g.style.opacity = '0';
  }, []);

  return { ref, glareRef, onPointerMove, onPointerLeave };
}
