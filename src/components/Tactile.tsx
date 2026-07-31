import type { FC, ReactNode } from 'react';
import { useRef, useCallback } from 'react';
import { motionAllowed } from '../hooks/useMotionAllowed';
import { useTilt } from '../hooks/useTilt';

/**
 * Tactile primitives — surfaces and controls that respond to the pointer as
 * physical objects rather than as flat regions that change colour.
 *
 * Everything here writes transforms straight to the DOM node instead of going
 * through React state. These handlers run on every pointermove; routing them
 * through a setState would re-render a subtree sixty times a second to move one
 * element a few pixels. All of it is transform and opacity only, so it stays on
 * the compositor.
 *
 * Every effect is gated on `motionAllowed()` and on a mouse pointer. Touch has
 * no hover, so a magnetic pull or a tilt would fire as a lurch at the moment of
 * tap; worse, `pointerleave` is not guaranteed on touch, which would strand an
 * element mid-transform with no event coming to reset it.
 */

/**
 * Magnetic — the control leans toward the cursor before it is reached.
 *
 * The sensing area is deliberately larger than the button. `p-4 -m-4` inflates
 * the padding box by 16px and pulls the margin box back by the same amount, so
 * the wrapper listens across a wider field while occupying exactly the space it
 * did before — no flex gap or line box shifts. Sensing only inside the button
 * would mean the pull starts at the instant the cursor is already on target,
 * which is the moment it stops being useful.
 *
 * `strength` is the fraction of the cursor's offset the button travels. Above
 * about 0.5 the control outruns the pointer and reads as evasive rather than
 * attracted.
 */
export const Magnetic: FC<{ children: ReactNode; strength?: number; className?: string }> = ({
  children,
  strength = 0.32,
  className = '',
}) => {
  const inner = useRef<HTMLSpanElement>(null);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    const el = inner.current;
    if (!el || e.pointerType !== 'mouse' || !motionAllowed()) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate3d(${dx * strength}px, ${dy * strength}px, 0)`;
    el.style.transitionDuration = '110ms';
  }, [strength]);

  const onPointerLeave = useCallback(() => {
    const el = inner.current;
    if (!el) return;
    el.style.transform = 'translate3d(0, 0, 0)';
    /* Exponential ease-out, no overshoot, and the same curve TiltCard returns
       on — one release vocabulary across every tactile surface.

       This used to overshoot on a bespoke bounce curve. Overshoot has to be
       earned by momentum the user actually supplied: a flick, a throw, a drag
       release. Moving the cursor away supplies none — the control is simply
       returning to rest — so the bounce was decoration, and on a button it
       reads as rubbery rather than physical. What makes this feel like a real
       object is the 1:1 pull above, not an elastic snap on the way home. */
    el.style.transitionDuration = '520ms';
  }, []);

  return (
    <span
      className={`inline-flex p-4 -m-4 ${className}`}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <span
        ref={inner}
        className="inline-flex will-change-transform [transition-property:transform] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]"
      >
        {children}
      </span>
    </span>
  );
};

/**
 * TiltCard — a panel that leans toward the cursor with a specular highlight
 * travelling across it.
 *
 * The glare is what sells the tilt. Rotation alone is ambiguous at these angles;
 * a highlight that slides as the surface turns is the cue that reads as a solid
 * object catching light, and it is the difference between "this moved" and
 * "this has a surface".
 *
 * `overflow-hidden` clips the highlight to the panel, and `isolate` keeps the
 * blend mode from reaching through to whatever sits behind the card.
 */
type TiltCardProps = Omit<React.ComponentPropsWithoutRef<'div'>, 'ref'> & { maxDeg?: number };

export const TiltCard: FC<TiltCardProps> = ({ children, className = '', maxDeg = 7, ...rest }) => {
  const { ref, glareRef, onPointerMove, onPointerLeave } = useTilt<HTMLDivElement>(maxDeg);

  return (
    /* `rest` is spread first so the tilt's own pointer handlers cannot be
       silently replaced by a caller's. Everything else a caller needs to put on
       this element — the carousel's hover/focus pause handlers, its ARIA
       carousel roles — passes straight through. */
    <div
      {...rest}
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={`relative isolate overflow-hidden will-change-transform [transition-property:transform] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${className}`}
    >
      <div
        ref={glareRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 -z-10 h-[420px] w-[420px] rounded-full opacity-0 [transition:opacity_500ms_ease] [background:radial-gradient(circle,rgba(224,138,60,0.20),rgba(224,138,60,0)_62%)]"
      />
      {children}
    </div>
  );
};
