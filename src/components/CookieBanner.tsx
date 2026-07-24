import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, X, ArrowRight } from 'lucide-react';
import { Button } from './ui/Button';
import { Link } from 'react-router-dom';

export default function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasConsented = localStorage.getItem('cookie_consent');
    if (!hasConsented) {
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem('cookie_consent', 'all');
    setIsVisible(false);
  };

  const handleAcceptEssential = () => {
    localStorage.setItem('cookie_consent', 'essential');
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-6 left-6 right-6 md:left-auto md:max-w-md z-[100]"
        >
          <div className="bg-slate-900/95 text-white p-6 rounded-sm shadow-card border border-slate-800 backdrop-blur-md">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 bg-primary-500/20 rounded-sm flex items-center justify-center border border-primary-500/30 shrink-0">
                <Shield className="w-6 h-6 text-primary-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold uppercase tracking-tight">Cookie Consent</h3>
                <p className="text-xs text-slate-200 font-medium leading-relaxed">
                  We use cookies to provide a secure and customized experience. Choose to accept all cookies or only the essential ones required for the site to function. Read our <Link to="/privacy" className="text-primary-300 hover:underline font-bold">Privacy Policy</Link>.
                </p>
              </div>
              <button 
                onClick={() => setIsVisible(false)}
                className="p-1 hover:bg-slate-800 rounded-sm transition-colors"
                aria-label="Close cookie consent banner"
                id="btn-close-cookie-banner"
              >
                <span className="sr-only">Close cookie consent banner</span>
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  onClick={handleAcceptAll}
                  className="flex-1 bg-white hover:bg-slate-100 text-primary-950 font-bold h-12 rounded-sm uppercase text-[10px] tracking-wide gap-2 cursor-pointer transition-all"
                >
                  Accept All <ArrowRight className="w-3 h-3" />
                </Button>
                <Button 
                  onClick={handleAcceptEssential}
                  className="flex-1 bg-slate-800 border border-slate-600 text-slate-100 hover:bg-slate-700 hover:text-white font-bold h-12 rounded-sm uppercase text-[10px] tracking-wide cursor-pointer transition-all "
                >
                  Essential Only
                </Button>
              </div>
              <div className="text-center pt-1">
                <Link to="/terms" className="text-[10px] text-slate-600 hover:text-white font-bold tracking-normalr font-mono">
                  View Terms of Service
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
