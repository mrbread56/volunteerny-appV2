import type { FC, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { motion, useInView, AnimatePresence, useScroll, useTransform } from 'motion/react';
import { ArrowRight, ChevronRight, Play, UserCircle, Search, BadgeCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCarousel } from '../hooks/useCarousel';

/* ── Reveal wrapper ── */
const Reveal: FC<{ children: ReactNode; className?: string; delay?: number }> = ({ children, className = '', delay = 0 }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] as const }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

/* ── Researched volunteer facts ── */
const FACTS = [
  { stat: '4.1B', label: 'volunteer hours', text: 'contributed across Canada in 2023, with an estimated economic value exceeding $50 billion.', source: 'Statistics Canada' },
  { stat: '82%', label: 'of Canadians', text: 'engage in informal volunteering, helping neighbours, mentoring peers, or assisting community members.', source: 'Volunteer Canada, 2024' },
  { stat: '27%', label: 'more likely', text: 'to find employment after volunteering, according to longitudinal studies tracking youth who served in high school.', source: 'Corporation for National & Community Service, 2023' },
  { stat: '76%', label: 'of volunteers', text: 'report that regular service has improved their physical health and overall sense of well-being.', source: 'UnitedHealth Group, 2023' },
];

/* ── What people are saying ── */
const TESTIMONIALS = [
  {
    quote: 'This website is really helpful. It makes finding volunteer opportunities much easier, which can often be hard to find.',
    name: 'Arshan',
    role: 'Student',
  },
  {
    quote: 'What you are doing is extremely useful and I know of lots of high school kids (and community organizations!) that would be ready to use it immediately.',
    name: 'Dr. Marsha Chechik',
    role: 'Professor, Department of Computer Science\nUniversity of Toronto',
  },
  {
    quote: "This website makes it much easier for students to discover volunteer opportunities and connect with organizations that need help. It's a simple idea with real potential to make volunteering more accessible and encourage community involvement.",
    name: 'Caleb',
    role: 'Student',
  },
  {
    quote: 'It is an awesome platform! The design is great, the workflow seems smooth, and the functions are comprehensive.',
    // Anonymised at the reviewer's request. He gave permission to use the quote
    // but asked not to be named, so this is attributed by role and institution
    // only. Do not restore the name without asking him again.
    name: 'Professor at Waterloo',
    role: 'University of Waterloo',
  },
  {
    quote: 'Finding a place to volunteer for is one of the biggest challenges and this website solves that issue.',
    name: 'Roy',
    role: 'Student',
  },
  {
    quote: 'This is a very interesting project, and potentially very useful to schools and students.',
    name: 'Dr. Jeffery Avery',
    role: 'Associate Professor, Cheriton School of Computer Science\nUniversity of Waterloo',
  },
  {
    quote: "This volunteer website is really helpful because it makes it easy to find volunteer opportunities. It's a great way to give back to the community, gain valuable experience, and meet new people.",
    name: 'Thomas',
    role: 'Student',
  },
  {
    quote: 'This website does a great job of making it easier for students to find volunteer opportunities and connect with organizations that are looking for help. I think the idea has a lot of potential, as it removes many of the barriers to getting involved and encourages more students to participate in their communities.',
    name: 'Noah',
    role: 'Student',
  },
];

/* Paper tints for the note wall. Deliberately pale: the quotes are set in full
   ink, and every one of these grounds keeps that above 4.5:1. They stay inside
   the site's existing warm/cool range rather than introducing new hues. */
const NOTE_TINTS = [
  'bg-[#FFF3E2]',   // warm amber paper
  'bg-[#EAF2F7]',   // cool blue paper
  'bg-[#F4F1E6]',   // oat
  'bg-[#FBEEEE]',   // faded rose
  'bg-[#EDF3EC]',   // pale sage
  'bg-[#F1EEF8]',   // soft lilac
];

/* Small, fixed tilts — not random, so the wall looks the same on every render
   and does not reshuffle between visits. */
const NOTE_TILT = [-1.5, 1.1, -0.7, 1.6, -1.2, 0.8];

/* ═══════════════════════
   HOME
   ═══════════════════════ */
export default function Home() {
  const { user, userProfile, enableDemoMode } = useAuth();
  const navigate = useNavigate();
  const facts = useCarousel(FACTS.length);
  const [isDemoLoading, setIsDemoLoading] = useState<'student' | 'org' | null>(null);
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.5], [0, -40]);

  const handleDemo = async (role: 'student' | 'organization') => {
    setIsDemoLoading(role === 'student' ? 'student' : 'org');
    try {
      await enableDemoMode(role);
      navigate(role === 'student' ? '/student/dashboard' : '/org/dashboard');
    } catch {
      setIsDemoLoading(null);
    }
  };

  const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } } };
  const fadeUp = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const } } };
  // Same motion, but opacity stays at 1. The hero headline is the largest text
  // on the page, and fading it in from opacity: 0 behind a 0.15s stagger delay
  // plus a 0.8s tween left it unpainted until ~1.70s — the browser cannot count
  // an invisible element toward Largest Contentful Paint, so the animation
  // itself was the mobile LCP. Sliding without fading keeps the entrance while
  // letting the text paint on the first frame.
  const riseUp = { hidden: { y: 24 }, visible: { y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const } } };

  // No overflow clipping on this wrapper.
  //
  // It was `overflow-hidden`, which makes the element a scroll container — and
  // a scroll container silently disables `position: sticky` for every
  // descendant. `overflow-x: clip` is not a safe swap either; measured at an
  // identical scroll position, a sticky element sat at -800px with clip and
  // pinned correctly at 135px without it.
  //
  // Four things in this app depend on sticky and were all quietly broken by it:
  // the site navbar (Navbar.tsx, `sticky top-0`) and the sidebar cards on
  // OrgProfile, StudentProfile and StudentOpportunityDetail. Nothing here needs
  // page-level clipping: the hero and the facts carousel carry their own
  // `overflow-hidden`, which is the right scope. No horizontal overflow at 375,
  // 768 or 1440.
  return (
    <div className="min-h-screen bg-white">

      {/* ── HERO ── */}
      <section ref={heroRef} className="relative pt-20 lg:pt-28 overflow-hidden">
        {/* Background image - full natural coverage. bg-blue-dark is the
            fallback: the headline above it is white, so if hero-bg.png ever
            fails to load (bad deploy, blocked asset, flaky network) the text
            would render white-on-white and the hero would read as empty. */}
        <div className="absolute inset-0 bg-blue-dark bg-[url('/hero-bg.png')] bg-cover bg-center bg-no-repeat" />
        
        <motion.div style={{ opacity: heroOpacity, y: heroY }} className="max-w-6xl mx-auto px-6 relative z-10 pb-[56vw] sm:pb-[45vw] lg:pb-[38vw]">
          <motion.div variants={stagger} initial="hidden" animate="visible" className="flex flex-col items-center text-center">
            <motion.h1
              variants={riseUp}
              className="text-[2.25rem] sm:text-[3rem] lg:text-[3.5rem] font-semibold text-white tracking-[-0.03em] leading-[1.2] drop-shadow-[0_2px_12px_rgba(0,0,0,0.15)]"
            >
              Your community needs you.
              <br />
              <span className="font-display italic text-white">
                Find where you belong.
              </span>
            </motion.h1>
          </motion.div>
        </motion.div>

        {/* Bottom fade to white.
            Was h-32 from-white: a linear ramp over 128px, which is too short
            and too even for a photograph — the eye reads the point where the
            gradient starts as a hard horizontal band across the image. Taller,
            and stepped through a mid stop so the falloff is gradual at the top
            and quick at the bottom, which is how light actually falls off. */}
        <div className="absolute bottom-0 left-0 right-0 h-56 sm:h-64 bg-[linear-gradient(to_top,#fff_0%,#fff_18%,rgba(255,255,255,0.82)_42%,rgba(255,255,255,0.35)_72%,rgba(255,255,255,0)_100%)] pointer-events-none z-10" />
      </section>

      {/* ── OUR PURPOSE ──
          Was a centred column: eyebrow, heading, paragraph and buttons all
          stacked down the middle on plain white. Symmetry like that is the
          default every page falls into, and there was nothing for the eye to
          land on between the hero and the steps.

          Now asymmetric — the claim on the left, the detail and the actions on
          the right — with the three things a student actually wants to know
          carried as proof points underneath. */}
      <section className="py-24 lg:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-[0.92fr_1.08fr] gap-10 lg:gap-16 items-start">
            <div>
              <Reveal>
                <span className="inline-flex items-center gap-2.5 text-[13px] font-semibold tracking-[0.14em] uppercase text-blue-accent">
                  <span aria-hidden="true" className="w-7 h-px bg-blue-accent" />
                  Our Purpose
                </span>
              </Reveal>
              <Reveal delay={0.08}>
                {/* h1, not h2. Heading level is the primary way a screen-reader
                    user navigates a page, and this file contained no h1 at all —
                    so the landing page had no top level to jump to. Visual size
                    is unchanged; only the tag differs. */}
                <h1 className="mt-5 text-[2rem] sm:text-[2.6rem] lg:text-[3rem] font-bold text-ink leading-[1.05]">
                  Connecting students with communities that need them
                </h1>
              </Reveal>
            </div>

            <div className="lg:pt-2">
              <Reveal delay={0.14}>
                <p className="text-[17px] sm:text-[19px] text-ink-soft leading-[1.65]">
                  A Toronto-wide platform rooted in North York, connecting high school
                  students with local nonprofits. Whether you&apos;re in our home
                  community or anywhere across the city, join us to build skills, fulfill
                  your 40 mandatory hours, and make a real impact.
                </p>
              </Reveal>

              <Reveal delay={0.2}>
                <div className="mt-9 flex flex-col sm:flex-row gap-3.5">
                  {/* These were <Link><button>…</button></Link>: nested interactive
                      elements, which is invalid HTML and gives unpredictable
                      keyboard behaviour. The anchor now carries the styling. */}
                  <Link
                    to="/signup"
                    className="group bg-blue-dark text-white px-6 py-3.5 rounded-[10px] text-[16px] font-semibold tracking-[-0.01em] hover:bg-[#153343] transition-all duration-300 inline-flex items-center justify-center gap-2.5 shadow-[0_3px_6px_rgba(0,0,0,0.15)]"
                  >
                    Continue as a student <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  <Link
                    to="/signup"
                    className="group bg-white border border-line text-ink px-6 py-3.5 rounded-[10px] text-[16px] font-semibold tracking-[-0.01em] hover:border-blue-dark/40 hover:bg-paper-2 transition-all duration-300 inline-flex items-center justify-center gap-2 shadow-[0_1px_10px_rgba(0,0,0,0.06)]"
                  >
                    Continue as an organization <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>

                {/* The demo pair. Previously two bare text buttons separated by a
                    literal "|" character — a pipe is not a divider, and it left
                    the two most-clicked links on the page looking like an
                    afterthought. Now a labelled row of real chips. */}
                {!user && (
                  <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-[13px] text-ink-muted">Just looking?</span>
                    <button
                      onClick={() => handleDemo('student')}
                      disabled={!!isDemoLoading}
                      className="min-h-[44px] px-4 rounded-[10px] border border-line bg-white text-ink-soft hover:text-blue-dark hover:border-blue-dark/35 text-[14px] font-medium inline-flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {isDemoLoading === 'student' ? 'Loading…' : 'Demo as a student'}
                    </button>
                    <button
                      onClick={() => handleDemo('organization')}
                      disabled={!!isDemoLoading}
                      className="min-h-[44px] px-4 rounded-[10px] border border-line bg-white text-ink-soft hover:text-blue-dark hover:border-blue-dark/35 text-[14px] font-medium inline-flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {isDemoLoading === 'org' ? 'Loading…' : 'Demo as an organization'}
                    </button>
                  </div>
                )}
              </Reveal>
            </div>
          </div>

        </div>
      </section>

      {/* Divider */}
      <div className="max-w-5xl mx-auto px-6"><div className="h-px bg-gray-100" /></div>

      {/* ── HOW IT WORKS ── */}
      <section className="py-28 lg:py-44">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal className="mb-20">
            <h2 className="text-[1.75rem] sm:text-[2.5rem] font-bold text-ink tracking-[-0.035em] leading-tight">
              Three steps to<br className="hidden sm:block" /> real impact.
            </h2>
          </Reveal>

          {/* Real cards, not three panels divided by hairlines — that reads as a
              table. Everything interactive here is colour, border, shadow and
              opacity, deliberately: those transitions survive
              prefers-reduced-motion, so the cards feel alive for everyone
              rather than only for people who have animation switched on. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { num: '01', Icon: UserCircle, title: 'Create your profile', body: 'Tell us your school, interests, and availability. It takes under two minutes to get started.' },
              { num: '02', Icon: Search, title: 'Discover opportunities', body: 'Browse volunteer roles near you. Filter by category, distance, or schedule to find the right fit.' },
              { num: '03', Icon: BadgeCheck, title: 'Make a real impact', body: 'Show up, contribute, and build skills that matter. Organisations verify your work, and your portfolio grows with every role.' },
            ].map(({ num, Icon, title, body }, i) => (
              <Reveal key={num} delay={i * 0.1}>
                <article className="group relative h-full overflow-hidden rounded-2xl border border-line bg-white p-8 lg:p-9 shadow-[0_1px_2px_rgba(26,43,54,0.05)] hover:border-blue-dark/25 hover:shadow-[0_2px_4px_rgba(26,43,54,0.06),0_14px_32px_-12px_rgba(26,43,54,0.20)] transition-[border-color,box-shadow] duration-500">
                  {/* Accent rail along the top. Transparent until hover, then it
                      washes in — a colour change, so it plays regardless of
                      motion settings. */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-dark via-blue-accent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  />

                  {/* Oversized ghost numeral, low contrast so it never competes
                      with the heading. Deepens slightly on hover. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none select-none absolute -right-3 -bottom-8 text-[8rem] leading-none font-bold tracking-[-0.05em] text-blue-dark/[0.04] group-hover:text-blue-dark/[0.07] transition-colors duration-500"
                  >
                    {num}
                  </span>

                  <div className="relative">
                    <span className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-dark group-hover:bg-blue-dark group-hover:text-white transition-colors duration-500">
                      <Icon className="w-[22px] h-[22px]" strokeWidth={1.9} />
                    </span>

                    <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted group-hover:text-blue-accent transition-colors duration-500">
                      Step {num}
                    </p>
                    <h3 className="mt-2 text-[21px] font-bold text-ink">{title}</h3>
                    <p className="mt-3 text-[16px] text-ink-soft leading-[1.65]">{body}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-5xl mx-auto px-6"><div className="h-px bg-gray-100" /></div>

      {/* ── FACTS ── */}
      <section className="py-28 lg:py-44 relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <Reveal className="mb-16">
            <h2 className="text-[1.75rem] sm:text-[2.5rem] font-bold text-ink tracking-[-0.035em] leading-tight">
              Why volunteering{' '}
              <span className="font-display italic text-blue-dark">matters</span>
            </h2>
          </Reveal>

          <Reveal delay={0.1}>
            <div
              className="border border-gray-100 rounded-2xl p-10 md:p-16 min-h-[260px] relative"
              {...facts.pauseProps}
              aria-roledescription="carousel"
              aria-label="Volunteering statistics"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={facts.index}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }}
                >
                  <div className="flex items-baseline gap-4 mb-5">
                    <span className="text-[3.5rem] sm:text-[4.5rem] lg:text-[5rem] font-display font-bold text-blue-dark tracking-[-0.04em] leading-none">
                      {FACTS[facts.index].stat}
                    </span>
                    <span className="text-[16px] sm:text-[18px] font-medium text-ink-soft tracking-[-0.02em]">
                      {FACTS[facts.index].label}
                    </span>
                  </div>
                  <p className="text-ink-soft text-[15px] sm:text-[17px] leading-[1.7] max-w-xl mb-8">
                    {FACTS[facts.index].text}
                  </p>
                  <p className="text-xs font-medium text-ink-muted tracking-[-0.01em]">
                    {FACTS[facts.index].source}
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* These were 4px-tall unlabelled buttons — no accessible name at
                  all, and far under the 24×24 WCAG 2.5.8 target minimum. The
                  bar is now the visual, wrapped in a 24px-tall hit area. */}
              <div className="flex gap-1 mt-8 -mb-2">
                {FACTS.map((fact, i) => (
                  <button
                    key={fact.stat}
                    onClick={() => facts.go(i)}
                    aria-label={`Show statistic ${i + 1} of ${FACTS.length}: ${fact.stat} ${fact.label}`}
                    aria-current={i === facts.index ? 'true' : undefined}
                    className="h-6 flex items-center px-0.5 group/dot"
                  >
                    <span
                      className={`block h-1 rounded-full transition-all duration-500 ${
                        i === facts.index ? 'bg-blue-dark w-10' : 'bg-gray-200 group-hover/dot:bg-gray-400 w-6'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-5xl mx-auto px-6"><div className="h-px bg-gray-100" /></div>

      {/* ── TESTIMONIALS ── */}
      <section className="py-28 lg:py-36">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal className="mb-16">
            <h2 className="text-[1.75rem] sm:text-[2.5rem] font-bold text-ink tracking-[-0.035em] leading-tight">
              What people are{' '}
              <span className="font-display italic text-blue-dark">saying</span>
            </h2>
          </Reveal>

          {/* A wall of notes rather than a carousel.
              A carousel showed one quote at a time behind a click; eight people
              vouching for this project is the actual asset, so all of them are
              on the page at once. The tilt and the paper tints are what make it
              read as pinned-up notes instead of a grid of boxes.

              CSS columns rather than a grid: the quotes vary from one line to
              five, and columns let each note keep its natural height instead of
              being padded out to match its row. */}
          <Reveal delay={0.1}>
            <ul className="columns-1 md:columns-2 lg:columns-3 gap-5 list-none p-0 m-0">
              {TESTIMONIALS.map((t, i) => (
                <li
                  key={t.name}
                  className="break-inside-avoid mb-5"
                  /* Tilt is per-note and deliberately small. Rotated text is
                     harder to read, so this stays under 2deg — enough to feel
                     hand-placed, not enough to fight the reader. It is also a
                     static transform, not an animation, so reduced-motion
                     users see the same layout as everyone else. */
                  style={{ transform: `rotate(${NOTE_TILT[i % NOTE_TILT.length]}deg)` }}
                >
                  <figure
                    className={`h-full rounded-xl p-6 sm:p-7 shadow-[0_1px_2px_rgba(26,43,54,0.05),0_10px_24px_-14px_rgba(26,43,54,0.25)] hover:shadow-[0_2px_4px_rgba(26,43,54,0.07),0_16px_34px_-14px_rgba(26,43,54,0.32)] transition-shadow duration-500 ${NOTE_TINTS[i % NOTE_TINTS.length]}`}
                  >
                    <blockquote className="text-[15.5px] sm:text-[16px] text-ink leading-[1.6]">
                      {t.quote}
                    </blockquote>
                    <figcaption className="mt-5 pt-4 border-t border-ink/10">
                      <span className="block text-[14px] font-semibold text-ink">{t.name}</span>
                      <span className="block text-[13px] text-ink/80 leading-[1.45] mt-0.5 whitespace-pre-line">
                        {t.role}
                      </span>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
