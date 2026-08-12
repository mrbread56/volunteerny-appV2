import type { FC, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { motion, useInView, AnimatePresence, useScroll, useTransform } from 'motion/react';
import { ArrowRight, ChevronRight, Play, ChevronLeft } from 'lucide-react';
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
    name: 'Dr. Edith Law',
    role: 'Associate Professor, Cheriton School of Computer Science\nUniversity of Waterloo',
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

/* Shared by the visible slide and the invisible height sizer below it, so the
   two can never disagree about how tall a quote is. */
const Quote: FC<{ testimonial: (typeof TESTIMONIALS)[number] }> = ({ testimonial }) => (
  <>
    <blockquote className="text-ink-soft text-[16px] sm:text-[19px] leading-[1.7] max-w-2xl">
      {testimonial.quote}
    </blockquote>
    <figcaption className="mt-7">
      <span className="block text-[15px] font-semibold text-ink tracking-[-0.02em]">{testimonial.name}</span>
      <span className="block text-[13px] text-ink-muted leading-[1.5] mt-1 whitespace-pre-line">{testimonial.role}</span>
    </figcaption>
  </>
);

/* Slides travel in the direction you asked for: next enters from the right,
   previous from the left. Needs to be variants rather than inline objects —
   AnimatePresence only passes `custom` to variant functions. */
const slide = {
  enter: (d: number) => ({ opacity: 0, x: d * 40 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
  exit: (d: number) => ({ opacity: 0, x: d * -40, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } }),
};

/* ═══════════════════════
   HOME
   ═══════════════════════ */
export default function Home() {
  const { user, userProfile, enableDemoMode } = useAuth();
  const navigate = useNavigate();
  const facts = useCarousel(FACTS.length);
  const reviews = useCarousel(TESTIMONIALS.length, 6500);
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

  return (
    <div className="min-h-screen bg-white overflow-hidden">

      {/* ── HERO ── */}
      <section ref={heroRef} className="relative pt-20 lg:pt-28 overflow-hidden">
        {/* Background image - full natural coverage */}
        <div className="absolute inset-0 bg-[url('/hero-bg.png')] bg-cover bg-center bg-no-repeat" />
        
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

        {/* Bottom fade to white */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent pointer-events-none z-10" />
      </section>

      {/* ── OUR PURPOSE ── */}
      <section className="py-24 lg:py-32">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Reveal>
            <span className="inline-block text-[13px] font-semibold tracking-[0.12em] uppercase text-blue-dark border border-blue-dark/20 rounded-full px-5 py-1.5 mb-8">
              Our Purpose
            </span>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="text-[1.75rem] sm:text-[2.5rem] lg:text-[3rem] font-semibold text-ink tracking-[-0.035em] leading-tight mb-6">
              Connecting students with communities that need them
            </h2>
          </Reveal>
          <Reveal delay={0.2}>
              <p className="text-[16px] sm:text-[18px] text-ink-soft leading-[1.7] max-w-2xl mx-auto">
                A Toronto-wide platform rooted in North York, connecting high school students with verified local nonprofits. Whether you're in our home community or anywhere across the city, join us to build skills, fulfill your 40 mandatory hours, and make a real impact.
              </p>
          </Reveal>
          
          <Reveal delay={0.3}>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              {/* These were <Link><button>…</button></Link>: nested interactive
                  elements, which is invalid HTML and gives unpredictable
                  keyboard behaviour. The anchor now carries the styling. */}
              <Link
                to="/signup"
                className="group bg-blue-dark text-white px-8 py-3.5 rounded-full text-[14px] font-medium tracking-[-0.01em] hover:bg-[#153343] transition-all duration-300 inline-flex items-center gap-2.5 shadow-[0_2px_8px_rgba(31,76,99,0.2)]"
              >
                Continue as a student <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                to="/signup"
                className="group bg-white border border-gray-200 text-ink px-8 py-3.5 rounded-full text-[14px] font-medium tracking-[-0.01em] hover:border-blue-dark/30 hover:bg-gray-50 transition-all duration-300 inline-flex items-center gap-2 shadow-sm"
              >
                Continue as an organization <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
            
            {/* Demo buttons */}
            {!user && (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
                <button
                  onClick={() => handleDemo('student')}
                  disabled={!!isDemoLoading}
                  className="min-h-[44px] px-2 text-ink-muted hover:text-blue-dark text-[13px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  {isDemoLoading === 'student' ? 'Loading…' : 'Demo as a student'}
                </button>
                <span className="hidden sm:inline-block text-gray-300">|</span>
                <button
                  onClick={() => handleDemo('organization')}
                  disabled={!!isDemoLoading}
                  className="min-h-[44px] px-2 text-ink-muted hover:text-blue-dark text-[13px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  {isDemoLoading === 'org' ? 'Loading…' : 'Demo as an organization'}
                </button>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-5xl mx-auto px-6"><div className="h-px bg-gray-100" /></div>

      {/* ── HOW IT WORKS ── */}
      <section className="py-28 lg:py-36">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal className="mb-20">
            <h2 className="text-[1.75rem] sm:text-[2.5rem] font-semibold text-ink tracking-[-0.035em] leading-tight">
              Three steps to<br className="hidden sm:block" /> real impact.
            </h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-gray-100">
            {[
              { num: '01', title: 'Create your profile', body: 'Tell us your school, interests, and availability. It takes under two minutes to get started.' },
              { num: '02', title: 'Discover opportunities', body: 'Browse verified volunteer roles near you. Filter by category, distance, or schedule to find the right fit.' },
              { num: '03', title: 'Make a real impact', body: 'Show up, contribute, and build skills that matter. Organisations verify your work, and your portfolio grows with every role.' },
            ].map(({ num, title, body }, i) => (
              <Reveal key={num} delay={i * 0.1} className="bg-white p-10 md:p-12 group hover:bg-gray-50/50 transition-colors duration-500">
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-[13px] font-semibold tracking-[0.06em] text-amber-dark">{num}</span>
                  <div className="h-px flex-1 bg-gray-100 group-hover:bg-blue-dark/10 transition-colors duration-500" />
                </div>
                <h3 className="text-[18px] font-semibold text-ink tracking-[-0.02em] mb-3">{title}</h3>
                <p className="text-[14px] text-ink-soft leading-[1.7]">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-5xl mx-auto px-6"><div className="h-px bg-gray-100" /></div>

      {/* ── FACTS ── */}
      <section className="py-28 lg:py-36 relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <Reveal className="mb-16">
            <h2 className="text-[1.75rem] sm:text-[2.5rem] font-semibold text-ink tracking-[-0.035em] leading-tight">
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
            <h2 className="text-[1.75rem] sm:text-[2.5rem] font-semibold text-ink tracking-[-0.035em] leading-tight">
              What people are{' '}
              <span className="font-display italic text-blue-dark">saying</span>
            </h2>
          </Reveal>

          {/* One slide at a time: stacking every quote made the section as tall
              as the hero, and it only gets worse as reviews are added. */}
          <Reveal delay={0.1}>
            <div
              className="border border-gray-100 rounded-2xl p-10 md:p-16 min-h-[300px] sm:min-h-[280px] relative overflow-hidden"
              {...reviews.pauseProps}
              aria-roledescription="carousel"
              aria-label="What people are saying"
            >
              <span aria-hidden="true" className="block font-display text-[3.5rem] leading-none text-amber-dark/25 mb-1">
                &ldquo;
              </span>

              {/* Every quote is rendered, stacked in one grid cell, so the card
                  is always as tall as the longest one. Without this the card
                  resized between slides and the controls jumped under the
                  cursor mid-autoplay. Sizing off the real quotes rather than a
                  hardcoded min-height means it stays right as reviews are
                  added. */}
              <div className="grid">
                {TESTIMONIALS.map((t) => (
                  <figure key={t.name} aria-hidden="true" className="[grid-area:1/1] invisible">
                    <Quote testimonial={t} />
                  </figure>
                ))}

                <AnimatePresence mode="wait" custom={reviews.dir * reviews.travel}>
                  <motion.figure
                    key={reviews.index}
                    className="[grid-area:1/1]"
                    custom={reviews.dir * reviews.travel}
                    variants={slide}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <Quote testimonial={TESTIMONIALS[reviews.index]} />
                  </motion.figure>
                </AnimatePresence>
              </div>

              <div className="flex items-center justify-between gap-3 mt-10 -mb-2">
                {/* flex-wrap + min-w-0 because the dots are fixed-width (w-6,
                    w-10 when active) and this row is justify-between against
                    the arrows. That fitted the original four testimonials and
                    silently stopped fitting as the list grew: at eight, the row
                    measured 268px inside a 190px container at 320px wide, and
                    the last two dots were clipped outside the card. Wrapping
                    keeps it correct for any number of quotes. */}
                <div className="flex gap-0.5 sm:gap-1 flex-wrap min-w-0">
                  {TESTIMONIALS.map((t, i) => (
                    <button
                      key={t.name}
                      onClick={() => reviews.go(i)}
                      aria-label={`Show review ${i + 1} of ${TESTIMONIALS.length}, from ${t.name}`}
                      aria-current={i === reviews.index ? 'true' : undefined}
                      className="h-6 flex items-center px-0.5 group/dot"
                    >
                      <span
                        className={`block h-1 rounded-full transition-all duration-500 ${
                          i === reviews.index
                            ? 'bg-blue-dark w-6 sm:w-10'
                            : 'bg-gray-200 group-hover/dot:bg-gray-400 w-3 sm:w-6'
                        }`}
                      />
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={reviews.prev}
                    aria-label="Previous review"
                    className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-ink-muted hover:text-blue-dark hover:border-blue-dark/30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={reviews.next}
                    aria-label="Next review"
                    className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-ink-muted hover:text-blue-dark hover:border-blue-dark/30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
