/**
 * Load environment variables, then trim them.
 *
 * Import this instead of calling dotenv.config() directly:
 *
 *   import './env';
 *
 * Why the trim matters. Secrets pasted into the GitHub Actions UI very often
 * carry a trailing newline — the copy took the line ending with it, and the
 * field accepts it silently. Nothing complains until the value reaches a place
 * that forbids control characters, and then the failure looks unrelated to
 * configuration:
 *
 *   Error: Metadata string value "***\n" contains illegal characters
 *       at createMetadata (@firebase/firestore/src/platform/node/grpc_connection.ts)
 *
 * gRPC rejects newlines in metadata headers, so the Firestore client dies the
 * instant it opens a stream. Every adversarial security check in CI failed this
 * way for five consecutive runs, and the value is masked in the logs, so the
 * only visible clue was a stray line break inside the quotes.
 *
 * Trailing whitespace is never meaningful in any variable this project reads —
 * project ids, database ids, API keys, URLs, email addresses — so stripping it
 * is safe and removes an entire class of "works locally, fails in CI".
 */
import dotenv from 'dotenv';

dotenv.config();

let trimmed = 0;
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value !== 'string') continue;

  // Trim, strip line breaks anywhere in the value, then remove wrapping quotes.
  //
  // Each of these was a real CI failure, in this order:
  //
  //   1. A trailing newline from a copy that took the line ending with it.
  //   2. A line break in the MIDDLE, from a value wrapping in a narrow field —
  //      .trim() does not touch that, and gRPC rejects it in metadata headers.
  //   3. Surrounding quotes. .env files often quote long values and dotenv
  //      strips them on the way in; GitHub secrets are stored raw, so the
  //      quotes survive. FIREBASE_SERVICE_ACCOUNT_KEY arrived as
  //      '{"type":"service_account"...}' — apostrophes included — JSON.parse
  //      threw, Firebase Admin never initialised, and every API route answered
  //      500 instead of its real status. The security suite reported that as
  //      "a student can grant themselves graduation hours", which was alarming
  //      and entirely a configuration artefact.
  //
  // That third one is exactly why the suite passed locally and failed in CI.
  let next = value.trim().replace(/[\r\n]+/g, '');
  if (next.length > 1 && ((next.startsWith("'") && next.endsWith("'")) || (next.startsWith('"') && next.endsWith('"')))) {
    next = next.slice(1, -1).trim();
  }
  if (next === value) continue;

  // The service account key is JSON. Removing real line breaks between tokens
  // is harmless, but if the result stops parsing, the original was structured
  // in a way this must not touch — keep it and let the caller fail loudly.
  if (key === 'FIREBASE_SERVICE_ACCOUNT_KEY') {
    try {
      JSON.parse(next);
    } catch {
      next = value.trim();
    }
  }

  process.env[key] = next;
  trimmed++;
  // Name the variable, never the value — these are secrets.
  console.warn(`[env] ${key} contained whitespace or line breaks, which have been removed.`);
}
if (trimmed && process.env.GITHUB_ACTIONS) {
  console.log(
    `::warning title=environment::${trimmed} secret(s) contained surrounding whitespace. ` +
    'They work now because they are trimmed at load, but re-paste them without the trailing newline.',
  );
}
