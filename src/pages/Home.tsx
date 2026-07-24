import type { FC, ReactNode } from 'react';
import { useRef, useState, useEffect } from 'react';
import { motion, useInView, AnimatePresence, useScroll, useTransform } from 'motion/react';
import { ArrowRight, ChevronRight, Play } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/* ── Reveal wrapper ── */
const Reveal: FC<{ children: ReactNode; className?: string; delay?: number }> = ({ children, className = '', delay = 0 }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
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

/* ═══════════════════════
   HOME
   ═══════════════════════ */
export default function Home() {
  const { user, userProfile, enableDemoMode } = useAuth();
  const navigate = useNavigate();
  const [factIdx, setFactIdx] = useState(0);
  const [isDemoLoading, setIsDemoLoading] = useState<'student' | 'org' | null>(null);
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.5], [0, -40]);

  useEffect(() => {
    const t = setInterval(() => setFactIdx((i) => (i + 1) % FACTS.length), 5000);
    return () => clearInterval(t);
  }, []);

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
  const fadeUp = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } } };

  return (
    <div className="min-h-screen bg-white overflow-hidden">

      {/* ── HERO ── */}
      <section ref={heroRef} className="relative pt-20 lg:pt-28 overflow-hidden">
        {/* Background image - full natural coverage */}
        <div className="absolute inset-0 bg-[url('/hero-bg.png')] bg-cover bg-center bg-no-repeat" />
        
        <motion.div style={{ opacity: heroOpacity, y: heroY }} className="max-w-6xl mx-auto px-6 relative z-10 pb-[56vw] sm:pb-[45vw] lg:pb-[38vw]">
          <motion.div variants={stagger} initial="hidden" animate="visible" className="flex flex-col items-center text-center">
            <motion.h1
              variants={fadeUp}
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
            <span className="inline-block text-[13px] font-semibold tracking-[0.12em] uppercase text-[#1F4C63] border border-[#1F4C63]/20 rounded-full px-5 py-1.5 mb-8">
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
              <Link to="/signup">
                <button className="group bg-[#1F4C63] text-white px-8 py-3.5 rounded-full text-[14px] font-medium tracking-[-0.01em] hover:bg-[#153343] transition-all duration-300 flex items-center gap-2.5 shadow-[0_2px_8px_rgba(31,76,99,0.2)]">
                  Continue as a student <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </Link>
              <Link to="/signup">
                <button className="group bg-white border border-gray-200 text-ink px-8 py-3.5 rounded-full text-[14px] font-medium tracking-[-0.01em] hover:border-[#1F4C63]/30 hover:bg-gray-50 transition-all duration-300 flex items-center gap-2 shadow-sm">
                  Continue as a organization <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </Link>
            </div>
            
            {/* Demo buttons */}
            {!user && (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
                <button
                  onClick={() => handleDemo('student')}
                  disabled={!!isDemoLoading}
                  className="text-ink-muted hover:text-[#1F4C63] text-[13px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  {isDemoLoading === 'student' ? 'Loading…' : 'Demo as a student'}
                </button>
                <span className="hidden sm:inline-block text-gray-300">|</span>
                <button
                  onClick={() => handleDemo('organization')}
                  disabled={!!isDemoLoading}
                  className="text-ink-muted hover:text-[#1F4C63] text-[13px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  {isDemoLoading === 'org' ? 'Loading…' : 'Demo as a organization'}
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
            <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#1F4C63]/60 mb-4">How it works</p>
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
                  <span className="text-[13px] font-semibold tracking-[0.06em] text-[#E08A3C]">{num}</span>
                  <div className="h-px flex-1 bg-gray-100 group-hover:bg-[#1F4C63]/10 transition-colors duration-500" />
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
            <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#1F4C63]/60 mb-4">The data</p>
            <h2 className="text-[1.75rem] sm:text-[2.5rem] font-semibold text-ink tracking-[-0.035em] leading-tight">
              Why volunteering{' '}
              <span className="font-display italic text-[#1F4C63]">matters</span>
            </h2>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="border border-gray-100 rounded-2xl p-10 md:p-16 min-h-[260px] relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={factIdx}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="flex items-baseline gap-4 mb-5">
                    <span className="text-[3.5rem] sm:text-[4.5rem] lg:text-[5rem] font-display font-bold text-[#1F4C63] tracking-[-0.04em] leading-none">
                      {FACTS[factIdx].stat}
                    </span>
                    <span className="text-[16px] sm:text-[18px] font-medium text-ink-soft tracking-[-0.02em]">
                      {FACTS[factIdx].label}
                    </span>
                  </div>
                  <p className="text-ink-soft text-[15px] sm:text-[17px] leading-[1.7] max-w-xl mb-8">
                    {FACTS[factIdx].text}
                  </p>
                  <p className="text-[11px] font-medium text-ink-muted tracking-[-0.01em]">
                    {FACTS[factIdx].source}
                  </p>
                </motion.div>
              </AnimatePresence>

              <div className="flex gap-2.5 mt-10">
                {FACTS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setFactIdx(i)}
                    className={`h-1 rounded-full transition-all duration-500 ${
                      i === factIdx ? 'bg-[#1F4C63] w-10' : 'bg-gray-200 hover:bg-gray-300 w-6'
                    }`}
                  />
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-5xl mx-auto px-6"><div className="h-px bg-gray-100" /></div>

      {/* ── FOR ORGANISATIONS ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0F1E29] via-[#1F4C63] to-[#153343]" />
        <div className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] bg-[#E08A3C]/[0.08] rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 py-28 lg:py-36 relative z-10">
          <Reveal>
            <div className="max-w-[560px]">
              <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-white/30 mb-5">For organisations</p>
              <h2 className="text-[1.75rem] sm:text-[2.5rem] font-semibold text-white tracking-[-0.035em] leading-tight mb-7">
                Empower your organisation<br />
                with a modern{' '}
                <span className="font-display italic text-[#E08A3C]">student pipeline</span>.
              </h2>
              <p className="text-white/50 text-[16px] leading-[1.7] mb-12 max-w-[460px]">
                Connect directly with safe, motivated high school volunteers, event hosts, and educators.
                Track check-ins, approve sessions, and share your mission, all in one place.
              </p>
              <Link to="/signup">
                <button className="group bg-white text-[#1F4C63] px-8 py-3.5 rounded-full text-[14px] font-medium hover:bg-white/90 transition-all duration-300 flex items-center gap-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
                  Register Your Organisation <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-28 lg:py-36 relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <Reveal>
            <div className="max-w-[560px]">
              <h2 className="text-[1.75rem] sm:text-[2.5rem] font-semibold text-ink tracking-[-0.035em] leading-tight mb-6">
                Ready to make a<br />
                <span className="font-display italic text-[#1F4C63]">difference</span>?
              </h2>
              <p className="text-[16px] text-ink-soft leading-[1.7] mb-12">
                Join hundreds of students and dozens of organisations already using Volunteer North York. Create your free account in under two minutes.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link to={user ? (userProfile?.role === 'student' ? '/student/dashboard' : '/org/dashboard') : '/signup'}>
                  <button className="group bg-[#1F4C63] text-white px-8 py-3.5 rounded-full text-[14px] font-medium tracking-[-0.01em] hover:bg-[#153343] transition-all duration-300 flex items-center gap-2.5 shadow-[0_1px_3px_rgba(31,76,99,0.2),0_8px_24px_rgba(31,76,99,0.12)]">
                    {user ? 'Go to Dashboard' : 'Create Free Account'} <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
