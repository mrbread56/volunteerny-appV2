import { defineConfig } from '@playwright/test';

/**
 * The Firestore rules suite runs under its own config.
 *
 * It is a different kind of test from everything else in tests/: it drives no
 * browser and needs no dev server, only the Firestore emulator. The main config
 * excludes it (`testIgnore`) so a normal `npm test` does not fail on a machine
 * that has not started the emulator, and Playwright has no CLI flag to override
 * an ignore — hence a second config rather than a flag.
 *
 * Run it with `npm run test:rules`, which boots the emulator around it.
 *
 * Serial on purpose. Every test calls clearFirestore() and re-seeds in
 * beforeEach, so parallel workers sharing one emulator would wipe each other's
 * fixtures mid-assertion and fail in ways that look like rule bugs.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/firestore-rules.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 30000,
});
