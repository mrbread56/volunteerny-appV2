import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Sparkles, ArrowRight, TrendingUp, MapPin, Search, Calendar, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import ScrollLeaf from '../components/ScrollLeaf';

function Interactive3DCard({ children, className = "", spotlightColor = "rgba(59, 130, 246, 0.15)" }: { children: React.ReactNode, className?: string, spotlightColor?: string }) {
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  
  const rotateX = useTransform(y, [0, 1], [8, -8]);
  const rotateY = useTransform(x, [0, 1], [-8, 8]);
  const springRotateX = useSpring(rotateX, { stiffness: 150, damping: 20 });
  const springRotateY = useSpring(rotateY, { stiffness: 150, damping: 20 });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    x.set(mouseX / width);
    y.set(mouseY / height);
  }

  function handleMouseLeave() {
    x.set(0.5);
    y.set(0.5);
  }

  const background = useTransform(
    [x, y],
    ([latestX, latestY]) => `radial-gradient(400px circle at ${latestX * 100}% ${latestY * 100}%, ${spotlightColor}, transparent 80%)`
  );

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX: springRotateX, rotateY: springRotateY, transformStyle: "preserve-3d" }}
      className={`relative group overflow-hidden ${className}`}
    >
      <motion.div 
        className="absolute inset-0 z-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background }}
      />
      <div className="relative z-10" style={{ transform: "translateZ(30px)" }}>
        {children}
      </div>
    </motion.div>
  );
}

export default function Home() {
  const { user, userProfile } = useAuth();
  const isStudent = userProfile?.role === 'student';

  return (
    <div className="min-h-screen bg-slate-50 relative">
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-32 bg-white border-b border-slate-100">
        <div className="absolute top-0 right-1/4 w-[550px] h-[550px] bg-blue-200/25 rounded-full blur-[100px] -z-10 pointer-events-none" />
        <div className="absolute top-1/3 left-1/4 w-[450px] h-[450px] bg-orange-200/20 rounded-full blur-[100px] -z-10 pointer-events-none" />
        <div className="absolute top-10 left-1/2 w-[350px] h-[350px] bg-orange-100/15 rounded-full blur-[90px] -z-10 pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
             
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-primary-950 tracking-tight leading-[1.1] mb-6">
              Your community{' '}
              <span className="font-display italic text-[#1F4C63]">needs</span>{' '}you.
              <br />
              <span className="font-display italic bg-gradient-to-r from-[#1F4C63] to-[#E08A3C] bg-clip-text text-transparent">Find where you belong.</span>
            </h1>
            
            <p className="text-lg text-slate-600 max-w-xl leading-relaxed mb-10">
              Volunteer North York connects high school students with trusted nonprofits. Build skills, fulfill hours, and make a real impact in your neighborhood.
            </p>
            
            <div className="flex flex-wrap items-center gap-4">
              {user ? (
                <Link to={userProfile?.role === 'student' ? '/student/dashboard' : '/org/dashboard'}>
                  <Button size="lg" className="h-12 px-8 text-[15px]">
                     Go to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/student/opportunities">
                    <Button size="lg" className="h-12 px-8 text-[15px] bg-[#1F4C63] hover:bg-[#1F4C63]/90 text-white border-0 shadow-lg shadow-[#1F4C63]/20">
                      Explore Opportunities <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                  <Link to="/signup">
                    <Button size="lg" variant="ghost" className="h-12 px-6 text-slate-600 hover:bg-slate-100">
                      For Organizations
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </motion.div>
          <div className="relative lg:ml-auto w-full max-w-md hidden lg:block">
             <ScrollLeaf />
          </div>
        </div>
      </div>
      </section>
