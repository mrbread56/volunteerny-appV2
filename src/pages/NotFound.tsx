import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * A real "not found" page.
 *
 * Every unknown URL used to <Navigate to="/" replace />, which silently
 * dropped the visitor on the marketing home page with no explanation and no
 * trace of where they had been trying to go. The realistic case is not someone
 * mistyping: it is a student opening a shared link to an opportunity that has
 * since been withdrawn, or a coordinator following a link from an old email.
 * Both were told, in effect, that the thing they were looking for had never
 * existed.
 *
 * The replace also erased the bad URL from history, so Back could not return
 * to wherever they came from.
 *
 * Where "home" goes depends on who is asking. A signed-in student has no use
 * for the marketing page.
 */
export default function NotFound() {
  const { userProfile } = useAuth();

  const home =
    userProfile?.role === 'organization' ? '/org/dashboard'
    : userProfile?.role === 'developer' ? '/developer/dashboard'
    : userProfile?.role === 'student' ? '/student/dashboard'
    : '/';

  return (
    <main id="main" tabIndex={-1} className="min-h-[70vh] flex items-center justify-center px-6 py-20">
      <div className="max-w-md text-center space-y-5">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Page not found
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight leading-tight">
          We couldn't find that page
        </h1>
        <p className="text-[15px] text-ink-soft leading-relaxed">
          The link may be out of date, or the opportunity behind it may have been
          withdrawn by the organization. Nothing has gone wrong with your account.
        </p>
        <div className="flex flex-wrap gap-3 justify-center pt-2">
          <Link
            to={home}
            className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-blue-dark text-white font-semibold text-sm hover:bg-[#153343] transition-colors"
          >
            {userProfile ? 'Back to your dashboard' : 'Back to the home page'}
          </Link>
          {userProfile?.role !== 'organization' && (
            <Link
              to="/student/opportunities"
              className="inline-flex items-center justify-center h-11 px-6 rounded-lg border border-line text-ink font-semibold text-sm hover:border-blue-dark hover:text-blue-dark transition-colors"
            >
              Browse opportunities
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
