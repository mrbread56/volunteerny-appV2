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

  // Trim the ends, then strip embedded newlines and carriage returns.
  //
  // Trimming alone is not enough. A value pasted into a narrow secret field can
  // pick up a line break in the MIDDLE, and .trim() only touches the ends — the
  // gRPC metadata error survives it. None of the variables this project reads
  // may legitimately contain a line break.
  let next = value.trim().replace(/[\r\n]+/g, '');
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
