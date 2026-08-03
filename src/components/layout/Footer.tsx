import { Link } from 'react-router-dom';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-gradient-to-b from-[#1F2E38] to-[#1A2830] text-paper/80 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-[-60px] left-[30%] w-[300px] h-[200px] bg-blue-dark/[0.06] rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6 relative z-10">
        {/* Main */}
        <div className="py-20 grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-5">
              {/* Decorative: the brand name is right beside it, and "Logo" in
                  alt text is redundant to a screen reader that already says
                  "image". */}
              <img src="/logo.png" alt="" className="w-7 h-7 object-contain" />
              <span className="text-[15px] font-semibold tracking-[-0.02em] text-paper">
                Volunteer North York
              </span>
            </div>
            <p className="text-paper/70 text-[13px] leading-[1.7] max-w-[240px]">
              Connecting Ontario high school students with meaningful volunteer opportunities.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-xs font-semibold tracking-[0.1em] uppercase text-paper/60 mb-5">Product</h4>
            {/* Tighter than it looks: the links below carry py-1.5, so the
                visual rhythm is unchanged while each tap target clears the
                24px minimum. They were 15px tall — the height of the text
                itself — which is hard to hit accurately on a phone. */}
            <ul className="space-y-1">
              {/* /student/opportunities is a PrivateRoute and is Disallow'd in
                  robots.txt, so this bounced anonymous visitors to /login. */}
              <li><Link to="/signup" className="inline-block py-1.5 text-[13px] text-paper/75 hover:text-paper transition-colors duration-200">Browse Opportunities</Link></li>
              <li><Link to="/signup" className="inline-block py-1.5 text-[13px] text-paper/75 hover:text-paper transition-colors duration-200">Join as Organisation</Link></li>
              <li><Link to="/login" className="inline-block py-1.5 text-[13px] text-paper/75 hover:text-paper transition-colors duration-200">Sign In</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-xs font-semibold tracking-[0.1em] uppercase text-paper/60 mb-5">Support</h4>
            {/* Tighter than it looks: the links below carry py-1.5, so the
                visual rhythm is unchanged while each tap target clears the
                24px minimum. They were 15px tall — the height of the text
                itself — which is hard to hit accurately on a phone. */}
            <ul className="space-y-1">
              <li><Link to="/feedback" className="inline-block py-1.5 text-[13px] text-paper/75 hover:text-paper transition-colors duration-200">Feedback</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-semibold tracking-[0.1em] uppercase text-paper/60 mb-5">Legal</h4>
            {/* Tighter than it looks: the links below carry py-1.5, so the
                visual rhythm is unchanged while each tap target clears the
                24px minimum. They were 15px tall — the height of the text
                itself — which is hard to hit accurately on a phone. */}
            <ul className="space-y-1">
              <li><Link to="/terms" className="inline-block py-1.5 text-[13px] text-paper/75 hover:text-paper transition-colors duration-200">Terms of Service</Link></li>
              <li><Link to="/privacy" className="inline-block py-1.5 text-[13px] text-paper/75 hover:text-paper transition-colors duration-200">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-paper/[0.06] py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[12px] text-paper/60">
            © {year} Volunteer North York. All rights reserved.
          </p>
          <p className="text-[12px] text-paper/60">
            North York, Ontario, Canada
          </p>
        </div>
      </div>
    </footer>
  );
}
