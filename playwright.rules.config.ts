import { defineConfig } from '@playwright/test';

/**
 * The config for the two EMULATOR-BACKED rules suites, and nothing else.
 *
 * These specs exist outside the main config on purpose. They talk to the
 * Firestore and Storage emulators — Java and Node processes that only
 * `firebase emulators:exec` boots — so inside the default run they fail with
 * connection errors on any machine that has not started them. Worse than
 * failing: their assertFails() tests would FALSE-PASS on those connection
 * errors, which is how a broken emulator setup could masquerade as passing
 * security tests.
 *
 * The main config therefore testIgnores them unconditionally, and the npm
 * scripts (`test:rules`, `test:storage-rules`) point here with --config. That
 * is deliberate over CLI path filtering, whose interaction with testIgnore
 * proved inconsistent enough to burn an hour on: an explicit file argument
 * sometimes ran an ignored spec and sometimes reported "No tests found", and a
 * mechanism that behaves inconsistently is not one to build a security suite
 * on.
 *
 * No webServer: nothing here touches the app. No projects: the emulator does
 * not care which browser the runner pretends to be.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/firestore-rules.spec.ts', '**/storage-rules.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  timeout: 60_000,
});
