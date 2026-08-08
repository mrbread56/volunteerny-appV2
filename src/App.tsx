import React, { useEffect } from 'react';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { AuthProvider } from './contexts/AuthContext';
import { GlobalAuthGuard } from './routes/guards';
import AppRoutes from './routes/AppRoutes';

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  public state = { hasError: false, error: null as Error | null };

  constructor(props: {children: React.ReactNode}) {
    super(props);
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 font-sans text-slate-900">
          <div className="max-w-md w-full bg-white p-8 rounded-sm  text-center space-y-6 border border-red-100">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-sm flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">Something went wrong</h1>
            <p className="text-sm font-medium text-slate-600">We've encountered an unexpected error. Our team has been notified. Please try refreshing the page.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 w-full h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-full font-bold uppercase tracking-widest text-xs transition-colors cursor-pointer"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function App() {
  return (
    <ErrorBoundary>
      {/*
        The prefers-reduced-motion media query in index.css only reaches CSS
        animations and transitions — it cannot touch the JS-driven transforms
        that motion/react writes straight to style. Every reveal, parallax and
        page transition therefore ran at full amplitude for users who had asked
        the OS for reduced motion. reducedMotion="user" makes the library honour
        that setting globally, so the CSS rule and the JS animations finally
        agree. SplashScreen was a no-op pass-through wrapper and is gone.
      */}
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <Router>
            <ScrollToTop />
            <GlobalAuthGuard>
              <AppRoutes />
            </GlobalAuthGuard>
          </Router>
        </AuthProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}

export default App;
