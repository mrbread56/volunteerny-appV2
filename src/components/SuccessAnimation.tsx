import React from 'react';
import { motion } from 'motion/react';

interface SuccessAnimationProps {
  message: string;
  onClose?: () => void;
}

export default function SuccessAnimation({ message, onClose }: SuccessAnimationProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.85, y: 15 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.85, y: 15 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="bg-white rounded-sm p-8 max-w-sm w-full text-center  border border-slate-100 flex flex-col items-center relative overflow-hidden"
      >
        {/* Colorful top sparkle lights banner */}
        <div className="absolute top-0 inset-x-0 h-1.5   " />
        
        <div className="relative w-20 h-20 mb-5 flex items-center justify-center">
          {/* Animated concentric soft green ripple rings */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1.4, opacity: [0, 0.45, 0] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: "easeOut" }}
            className="absolute inset-0 bg-emerald-100 rounded-sm"
          />
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1.25, opacity: [0, 0.35, 0] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: "easeOut", delay: 0.6 }}
            className="absolute inset-0 bg-teal-100 rounded-sm"
          />
          
          {/* Checkmark Base Circle */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 14 }}
            className="w-16 h-16    rounded-sm flex items-center justify-center  shadow-emerald-500/20 z-10"
          >
            <svg
              className="w-8 h-8 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <motion.path
                d="M20 6L9 17L4 12"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 0.2, ease: "easeInOut" }}
              />
            </svg>
          </motion.div>
        </div>

        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-xl font-black text-slate-800 tracking-tight"
        >
          Operation Successful
        </motion.h3>
        
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-sm text-slate-600 mt-2 font-semibold whitespace-normal leading-relaxed"
        >
          {message}
        </motion.p>

        {onClose && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            onClick={onClose}
            className="mt-6 px-8 py-3    hover:opacity-90 text-white rounded-sm text-xs font-black uppercase tracking-widest transition-all  shadow-emerald-500/10 cursor-pointer"
          >
            Dismiss Dialog
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
}
