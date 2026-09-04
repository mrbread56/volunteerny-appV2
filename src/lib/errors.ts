/**
 * One place that turns a thrown value into something safe to show a person.
 *
 * Before this, error handling was four unrelated habits: 85 console.error calls
 * a user never sees, 42 setError, 20 setErrorMessage, and 12 browser alert()s.
 * Login and Signup each kept their own private map of Firebase auth codes,
 * overlapping on three of them and disagreeing on the wording, and neither
 * covered Firestore errors at all — so a permission-denied surfaced as
 * "Something went wrong" or, worse, as the raw SDK string.
 *
 * Two rules this exists to enforce:
 *
 *   1. Never show a raw error to a user. Firebase messages name internal
 *      collections and SDK internals; provider messages cite their own
 *      documentation. Neither means anything to a student, and both leak
 *      structure. Log the original, show the mapping.
 *
 *   2. Never fail silently. A catch that only calls console.error is a button
 *      that does nothing, which is the single most common bug this codebase has
 *      produced. If a user action can fail, the user has to be told.
 */

/** Firebase Auth. Wording is the sign-in/sign-up copy these pages already used. */
const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password. Please try again.',
  'auth/user-not-found': 'No account found with this email. Please sign up first.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/email-already-in-use': 'This email is already registered. Please sign in instead.',
  'auth/weak-password': 'Password is too weak. Please use at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/user-disabled': 'This account has been disabled. Please contact support.',
  'auth/network-request-failed': 'Network error. Please check your internet connection.',
  'auth/popup-blocked': 'Pop-up was blocked by your browser. Please allow pop-ups and try again.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
  'auth/operation-not-allowed': 'Sign-up is temporarily unavailable. Please try again later.',
  'auth/account-exists-with-different-credential':
    'An account already exists with this email using a different sign-in method.',
  'auth/requires-recent-login': 'Please sign in again before making this change.',
};

/**
 * Firestore. These were previously handled ad hoc or not at all.
 *
 * permission-denied is the important one: it almost always means the rules and
 * the code disagree, not that the user did anything wrong, so the message must
 * not accuse them.
 */
const FIRESTORE_MESSAGES: Record<string, string> = {
  'permission-denied': "You don't have permission to do that. If you think you should, please contact support.",
  unauthenticated: 'Your session has expired. Please sign in again.',
  unavailable: 'We could not reach the server. Please check your connection and try again.',
  'deadline-exceeded': 'That took too long to complete. Please try again.',
  'not-found': 'We could not find that item. It may have been removed.',
  'already-exists': 'That already exists.',
  'resource-exhausted': 'The service is busy right now. Please try again in a moment.',
  cancelled: 'That request was cancelled.',
  'failed-precondition': 'That could not be completed right now. Please refresh and try again.',
};

/**
 * A message safe to show a user.
 *
 * @param err       whatever was thrown or rejected — Error, Firebase error, string, anything
 * @param fallback  what to say when the error is unrecognised. Make it specific
 *                  to the action ("Couldn't save your profile") rather than
 *                  generic; "Something went wrong" tells a person nothing about
 *                  whether to retry.
 */
export function toUserMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const code = (err as any)?.code;

  if (typeof code === 'string') {
    if (AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
    if (FIRESTORE_MESSAGES[code]) return FIRESTORE_MESSAGES[code];
    // Firestore sometimes prefixes: "firestore/permission-denied".
    const bare = code.includes('/') ? code.split('/').pop()! : code;
    if (FIRESTORE_MESSAGES[bare]) return FIRESTORE_MESSAGES[bare];
  }

  // A string thrown deliberately by our own code is already user-facing —
  // our fetch helpers reject with messages written for exactly this.
  if (typeof err === 'string' && err.trim()) return err;

  // An Error we raised ourselves. Anything carrying a `code` came from a
  // provider SDK and was handled above, so this is our own message. Length is
  // capped because a stack-like string is not a sentence.
  if (err instanceof Error && err.message && !code && err.message.length < 200) {
    return err.message;
  }

  return fallback;
}

/**
 * Log the real error, return the safe one.
 *
 *   catch (err) { setErrorMessage(reportError('save profile', err, "Couldn't save your profile.")); }
 *
 * The pairing is the point: the developer keeps the detail, the user gets a
 * sentence, and it is harder to write a catch that shows the user nothing.
 */
export function reportError(context: string, err: unknown, fallback?: string): string {
  console.error(`[${context}]`, err);
  sendToServer(context, err);
  return toUserMessage(err, fallback);
}

/**
 * Forward the error to the server so somebody can actually see it.
 *
 * Before this, every reportError call ended at console.error, which means it
 * ended nowhere: with one developer and no log drain, the only way to learn
 * that a student's hours submission had failed was for that student to write
 * in. The crash screen even claimed "our team has been notified", which was
 * true of nobody.
 *
 * Fire and forget, and silent on failure. Reporting an error must never
 * produce a second one, and must never delay whatever the caller does next.
 * `keepalive` lets it survive the page unloading, which is exactly when a
 * navigation-triggered failure would otherwise be lost.
 */
function sendToServer(context: string, err: unknown): void {
  try {
    // Browser only. This module is also imported by node-run check scripts,
    // and `import.meta.env` is a Vite construct that throws under plain node —
    // importing lib/config at the top of this file broke check:errors for
    // exactly that reason.
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;

    const message = err instanceof Error ? err.message : String(err ?? '');
    if (!message) return;

    let base = '';
    try {
      base = (import.meta as any)?.env?.VITE_API_URL || '';
    } catch {
      base = '';
    }

    void fetch(`${base}/api/log/client-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        context,
        message: message.slice(0, 1000),
        stack: err instanceof Error ? err.stack?.slice(0, 4000) : undefined,
        path: typeof location !== 'undefined' ? location.pathname : '',
      }),
    }).catch(() => {});
  } catch {
    /* never let logging break the thing it is logging */
  }
}
