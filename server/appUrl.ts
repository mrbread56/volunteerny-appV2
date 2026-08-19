/**
 * The origin the app is actually served from.
 *
 * Used for two things that were each defaulting to the WRONG host on their own:
 * the links inside outbound email, and the CORS allowed origin.
 *
 * Both previously fell back to "https://volunteernorthyork.indevs.in". That is
 * the MAIL_FROM domain — verified in Resend so it can send, and serving nothing
 * at all over HTTP. So every button in every transactional email pointed at a
 * domain that does not exist as a website. The emails arrived, the branding
 * looked right, and every call to action was a dead link.
 *
 * TWO separate causes, and fixing only the obvious one would not have worked:
 *
 *   1. APP_URL is declared `sync: false` in render.yaml and was never set in
 *      the deployment, so the fallback was in play at all.
 *   2. The old value was a MODULE-LEVEL const in emailTemplates.ts. Imports are
 *      evaluated before the importing module's body runs, and server.ts calls
 *      dotenv.config() in its body — so process.env.APP_URL was still undefined
 *      when that const was computed. Setting APP_URL would have changed
 *      nothing. That is why this is a function: it reads the environment when
 *      the email is rendered, not when the file is imported.
 *
 * The fallback is now the app's real canonical origin — the same value
 * index.html already declares in <link rel="canonical">, og:url, robots.txt and
 * sitemap.xml. Those are static files and cannot import this constant, so the
 * string is unavoidably duplicated; `npm run check:email` asserts they agree
 * rather than trusting anyone to remember.
 */
export const CANONICAL_APP_ORIGIN = 'https://volunteernorthyork.org';

/**
 * Origins the app is ALSO legitimately served from, besides the canonical one.
 *
 * The vercel.app address did not stop existing when the real domain arrived —
 * every deployment keeps it, old links point at it, and anyone who bookmarked
 * it lands there and gets a fully working site. A working site whose API calls
 * are then refused by CORS is worse than either redirecting or serving, so
 * these origins stay allowed. Canonical is what goes IN emails and links;
 * legacy is what is still ACCEPTED from a browser.
 */
export const LEGACY_APP_ORIGINS = ['https://volunteerny-app-v2.vercel.app'];

let warned = false;

/** APP_URL when set, otherwise the canonical origin. Never has a trailing slash. */
export function appOrigin(): string {
  const configured = process.env.APP_URL;
  if (!configured && !warned) {
    warned = true;
    console.warn(
      `[appUrl] APP_URL is not set — using ${CANONICAL_APP_ORIGIN} for email links and CORS. ` +
      'Set APP_URL in the deployment environment (Vercel > Settings > Environment Variables) ' +
      'so this does not depend on a hardcoded default.'
    );
  }
  return (configured || CANONICAL_APP_ORIGIN).replace(/\/+$/, '');
}
