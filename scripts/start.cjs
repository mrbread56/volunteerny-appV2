/*
 * Production launcher for the built server.
 *
 * `npm start` was `node build/server.cjs` with NODE_ENV UNSET, and README calls
 * it "Runs the production bundle". Every production guard in server.ts is
 * `process.env.NODE_ENV === 'production'`, so on any box started that way — a
 * self-hosted instance, a staging VM, anything not Vercel — four things were
 * simultaneously true:
 *
 *   - `Authorization: Bearer demo-mode-token-developer` was accepted FROM ANYONE
 *   - every second-factor code was logged in plaintext beside the address it
 *     was sent to, so anyone with log access could complete any user's sign-in
 *   - CORS stayed at '*'
 *   - the HTTPS redirect was disabled
 *
 * A cross-platform npm script cannot set an environment variable inline (cmd.exe
 * does not understand `VAR=x cmd`), and cross-env is not a dependency here, so
 * this five-line file does it instead. It defaults rather than forces, so an
 * operator can still run the bundle in another mode deliberately.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
require('../build/server.cjs');
