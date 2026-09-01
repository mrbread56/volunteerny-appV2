import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Shield } from 'lucide-react';
import { Button } from './ui/Button';
import { Link } from 'react-router-dom';

/**
 * A notice about what this site stores. NOT a consent choice.
 *
 * It used to offer "Accept All" and "Essential Only". Those two buttons wrote
 * different strings to `cookie_consent` and **nothing anywhere read that key** —
 * so they were behaviourally identical. A visitor who deliberately chose
 * "Essential Only" to limit what we collect was told they had achieved
 * something. They had not, and in fairness they lost nothing either, because
 * there was never anything extra to decline. The harm was the false statement,
 * made to minors, in a box headed "Cookie Consent".
 *
 * The fix is to remove the fake choice, not to add tracking so the choice
 * becomes real. This site sets no advertising or analytics cookies at all, and
 * the OPC's position on services aimed at children is that operators "should
 * not permit the placement of any kind of tracking technologies on the site".
 * Keeping that posture and telling the truth about it is the correct outcome.
 *
 * No consent banner is legally required in Canada for storage that is strictly
 * necessary to deliver what the user asked for — there is no Canadian
 * equivalent of the EU ePrivacy Directive, and PIPEDA requires a genuine choice
 * only for collection that is NOT integral to the service. Everything listed
 * below is integral. So this is a notice, and it says exactly what is stored.
 *
 * The banner is `fixed`, so it floats OVER the page rather than displacing it,
 * and on a phone it spans nearly the full width. Nothing reserved the space it
 * covers, so on /signup it sat directly on top of "Already have an account?
 * Sign in" — verified with document.elementFromPoint, which returned this
 * component's own <p> at the centre of that link. A returning student tapping
 * to sign in hit the notice instead, and short pages could not be scrolled far
 * enough to escape it. That is the same defect as the invisible click trap
 * described below, in its visible form: this component covering controls that
 * belong to the page. The effect below reserves exactly the height it occupies
 * for as long as it is on screen, and gives it back on dismissal.
 *
 * Deliberately NOT wrapped in <AnimatePresence>. It used to be, with an exit
 * animation. Under `prefers-reduced-motion: reduce` that exit applied its styles
 * but never completed, so AnimatePresence kept the node mounted forever at
 * opacity 0 — and opacity does not stop pointer events. The result was an
 * invisible 448x264 click trap pinned to the bottom-right of EVERY page, right
 * where the opportunity page puts Save, Share and Report Safety Concern. Those
 * buttons were simply dead. Dismissing now unmounts instantly.
 */
export default function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Reserve the space this notice covers, for as long as it covers it.
   *
   * Measured rather than hard-coded: the text wraps to different heights at
   * different widths and font sizes, and a fixed guess would be wrong on the
   * narrow phones that need it most. The ResizeObserver keeps it right through
   * rotation and text reflow.
   */
  useEffect(() => {
    if (!isVisible) return;
    const el = bannerRef.current;
    if (!el) return;
    const apply = () => {
      // + 24px so the content clears the notice rather than touching it.
      document.body.style.paddingBottom = `${el.offsetHeight + 24}px`;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.body.style.paddingBottom = '';
    };
  }, [isVisible]);

  useEffect(() => {
    const seen = localStorage.getItem('storage_notice_seen');
    if (!seen) {
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem('storage_notice_seen', 'true');
    } catch {
      /* storage blocked — see src/lib/storageFallback.ts. The notice simply
         reappears next visit, which is harmless. */
    }
    setIsVisible(false);
  };

  return (
    <>
      {isVisible && (
        <motion.div
          ref={bannerRef}
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          role="region"
          aria-label="What this site stores"
          className="fixed bottom-6 left-6 right-6 md:left-auto md:max-w-md z-[100]"
        >
          <div className="bg-ink/95 text-white p-6 rounded-lg shadow-card border border-ink-soft backdrop-blur-md">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 shrink-0 mt-0.5 text-white/80" aria-hidden="true" />
              <div className="space-y-3">
                <h2 className="font-bold text-sm">What this site stores</h2>
                <p className="text-xs leading-relaxed text-paper-2">
                  We keep you signed in, remember your theme, and save a draft of
                  an opportunity while you are writing one. That is all — there
                  are <strong>no advertising or analytics trackers</strong> on
                  this site, and nothing here follows you to other websites.
                </p>
                <p className="text-sm leading-relaxed text-paper-3">
                  There is nothing to turn off, so we are not going to pretend to
                  offer you a choice about it.
                </p>
                <div className="flex items-center gap-4 pt-1">
                  <Button
                    onClick={dismiss}
                    className="bg-white hover:bg-paper-3 text-primary-950 font-bold h-11 px-6 rounded-lg uppercase text-xs tracking-wide cursor-pointer transition-all"
                  >
                    Got it
                  </Button>
                  {/* paper-3, not ink-muted: ink-muted is a token for muted
                      text on the PAPER background and measures 3.3:1 against
                      this dark panel. */}
                  <Link
                    to="/privacy"
                    className="text-xs text-paper-3 hover:text-white font-bold underline underline-offset-2"
                  >
                    Read the privacy policy
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
}
