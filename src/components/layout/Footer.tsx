import { Link } from 'react-router-dom';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-gradient-to-b from-[#1F2E38] to-[#1A2830] text-paper/80 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-[-60px] left-[30%] w-[300px] h-[200px] bg-[#1F4C63]/[0.06] rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6 relative z-10">
        {/* Main */}
        <div className="py-20 grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-5">
              <img src="/logo.png" alt="VNY Logo" className="w-7 h-7 object-contain" />
              <span className="text-[15px] font-semibold tracking-[-0.02em] text-paper">
                Volunteer North York
              </span>
            </div>
            <p className="text-paper/30 text-[13px] leading-[1.7] max-w-[240px]">
              Connecting Ontario high school students with meaningful volunteer opportunities.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-[11px] font-semibold tracking-[0.1em] uppercase text-paper/20 mb-5">Product</h4>
            <ul className="space-y-3">
              <li><Link to="/student/opportunities" className="text-[13px] text-paper/40 hover:text-paper transition-colors duration-200">Browse Opportunities</Link></li>
              <li><Link to="/signup" className="text-[13px] text-paper/40 hover:text-paper transition-colors duration-200">Join as Organisation</Link></li>
              <li><Link to="/login" className="text-[13px] text-paper/40 hover:text-paper transition-colors duration-200">Sign In</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-[11px] font-semibold tracking-[0.1em] uppercase text-paper/20 mb-5">Support</h4>
            <ul className="space-y-3">
              <li><Link to="/feedback" className="text-[13px] text-paper/40 hover:text-paper transition-colors duration-200">Feedback</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-[11px] font-semibold tracking-[0.1em] uppercase text-paper/20 mb-5">Legal</h4>
            <ul className="space-y-3">
              <li><Link to="/terms" className="text-[13px] text-paper/40 hover:text-paper transition-colors duration-200">Terms of Service</Link></li>
              <li><Link to="/privacy" className="text-[13px] text-paper/40 hover:text-paper transition-colors duration-200">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-paper/[0.06] py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[12px] text-paper/20">
            © {year} Volunteer North York. All rights reserved.
          </p>
          <p className="text-[12px] text-paper/20">
            North York, Ontario, Canada
          </p>
        </div>
      </div>
    </footer>
  );
}
