/**
 * Production-ready fault-tolerant Google reCAPTCHA v3 integration helper.
 * Uses Google's official grecaptcha client library with custom verification scoring.
 * Displays real-time status and features graceful sandbox fallbacks to handle strict ad-blockers,
 * sandboxed iframe policies, and isolated development environments seamlessly.
 */

// Official client-side Google reCAPTCHA v3 Site Key placeholder
export const RECAPTCHA_SITE_KEY = "6Ldy-pIqAAAAAN4Yl6rV9_66Z6qisvO5wWhxG_qV";

let isScriptLoading = false;
let isScriptLoaded = false;

/**
 * Dynamically injects Google reCAPTCHA client script if not already present.
 */
export function loadRecaptchaScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }

    if ((window as any).grecaptcha) {
      isScriptLoaded = true;
      resolve(true);
      return;
    }

    if (isScriptLoaded) {
      resolve(true);
      return;
    }

    // If script is already in the process of injection, wait and resolve true
    if (isScriptLoading) {
      const interval = setInterval(() => {
        if ((window as any).grecaptcha) {
          clearInterval(interval);
          resolve(true);
        }
      }, 100);
      return;
    }

    isScriptLoading = true;

    try {
      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        isScriptLoading = false;
        isScriptLoaded = true;
        resolve(true);
      };
      script.onerror = () => {
        console.warn("reCAPTCHA v3 script failed to load. Operating in safe environment-isolation sandbox.");
        isScriptLoading = false;
        resolve(false);
      };
      document.head.appendChild(script);
    } catch (e) {
      console.warn("reCAPTCHA initialization failed. Operating in sandbox backup:", e);
      isScriptLoading = false;
      resolve(false);
    }
  });
}

/**
 * Executes reCAPTCHA action check and returns a real Google token.
 *
 * IMPORTANT: this only returns `source: "google"` with a real token when
 * Google's script actually verified the action. If the script is blocked,
 * fails to load, or errors out, this now fails CLOSED (source: "unavailable",
 * token: null) instead of fabricating a fake "verified" token with a
 * confidence score of 1.0. The previous fallback meant anyone who simply
 * blocked the reCAPTCHA script (an ad-blocker, or a deliberate bot) would
 * be treated as MORE trusted than a real user. Any server-side check must
 * still call Google's siteverify endpoint with the real token - this
 * function alone was never sufficient verification on its own.
 */
export async function executeRecaptcha(
  action: string
): Promise<{ token: string | null; source: "google" | "unavailable"; score: number }> {
  const loaded = await loadRecaptchaScript();
  const grecaptcha = (window as any).grecaptcha;

  if (loaded && grecaptcha) {
    return new Promise((resolve) => {
      grecaptcha.ready(() => {
        try {
          grecaptcha.execute(RECAPTCHA_SITE_KEY, { action })
            .then((token: string) => {
              resolve({ token, source: "google", score: 0 });
            })
            .catch((err: any) => {
              console.warn("Google reCAPTCHA token execution failed:", err);
              resolve({ token: null, source: "unavailable", score: 0 });
            });
        } catch (e) {
          resolve({ token: null, source: "unavailable", score: 0 });
        }
      });
    });
  }

  // Script blocked or unavailable - fail closed. Callers that gate on this
  // must not treat "unavailable" as equivalent to a verified human.
  return { token: null, source: "unavailable", score: 0 };
}
