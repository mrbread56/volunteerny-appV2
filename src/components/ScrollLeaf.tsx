import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

export default function ScrollLeaf() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  // Animation phases mapped to scroll progress
  const lineHeight = useTransform(scrollYProgress, [0, 0.3], ["0%", "100%"]);
  const leafOpacity = useTransform(scrollYProgress, [0.15, 0.35], [0, 1]);
  const leftColorOpacity = useTransform(scrollYProgress, [0.25, 0.5], [0, 1]);
  const rightColorOpacity = useTransform(scrollYProgress, [0.3, 0.55], [0, 1]);
  const leafScale = useTransform(scrollYProgress, [0, 0.4], [0.85, 1]);
  const leafRotate = useTransform(scrollYProgress, [0, 0.5], [-5, 0]);

  return (
    <div ref={containerRef} className="hidden lg:flex items-center justify-center relative h-[420px] w-full">
      <motion.div 
        className="relative w-[320px] h-[380px]"
        style={{ scale: leafScale, rotate: leafRotate }}
      >
        {/* Center line that draws down */}
        <div className="absolute left-1/2 -translate-x-1/2 top-0 w-[2px] h-full overflow-hidden z-20">
          <motion.div 
            className="w-full  from-[#1F4C63] via-[#1F4C63] to-[#E08A3C]"
            style={{ height: lineHeight }}
          />
        </div>

        {/* Leaf SVG - outline first, then fills */}
        <svg viewBox="0 0 320 380" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Leaf outline (always visible, fades in) */}
          <motion.path
            d="M160 20 
               C140 20, 80 60, 60 100 
               C40 140, 30 160, 40 180 
               C50 200, 70 200, 80 190 
               C70 220, 50 240, 40 260 
               C30 280, 35 300, 50 300 
               C65 300, 80 280, 90 260 
               C95 280, 100 310, 110 330 
               C120 350, 140 360
               160 380
               180 360, 200 350, 210 330
               220 310, 225 280, 230 260
               240 280, 255 300, 270 300
               285 300, 290 280, 280 260
               270 240, 250 220, 240 190
               250 200, 270 200, 280 180
               290 160, 280 140, 260 100
               240 60, 180 20, 160 20 Z"
            stroke="#1F4C63"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: leafOpacity }}
          />
          {/* Left half fill */}
          <motion.path
            d="M160 20 
               C140 20, 80 60, 60 100 
               C40 140, 30 160, 40 180 
               C50 200, 70 200, 80 190 
               C70 220, 50 240, 40 260 
               C30 280, 35 300, 50 300 
               C65 300, 80 280, 90 260 
               C95 280, 100 310, 110 330 
               C120 350, 140 360, 160 380 Z"
            fill="#1F4C63"
            style={{ opacity: leftColorOpacity }}
          />
          {/* Right half fill */}
          <motion.path
            d="M160 20
               C180 20, 240 60, 260 100
               C280 140, 290 160, 280 180
               C270 200, 250 200, 240 190
               C250 220, 270 240, 280 260
               C290 280, 285 300, 270 300
               C255 300, 240 280, 230 260
               C225 280, 220 310, 210 330
               C200 350, 180 360, 160 380 Z"
            fill="#E08A3C"
            style={{ opacity: rightColorOpacity }}
          />
        </svg>
      </motion.div>
    </div>
  );
}