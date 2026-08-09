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
  if (typeof value === 'string' && value !== value.trim()) {
    process.env[key] = value.trim();
    trimmed++;
    // Name the variable, never the value — these are secrets.
    console.warn(`[env] ${key} had surrounding whitespace, which has been trimmed.`);
  }
}
if (trimmed && process.env.GITHUB_ACTIONS) {
  console.log(
    `::warning title=environment::${trimmed} secret(s) contained surrounding whitespace. ` +
    'They work now because they are trimmed at load, but re-paste them without the trailing newline.',
  );
}
