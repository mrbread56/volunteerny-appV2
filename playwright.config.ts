import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  // The rules suite talks to the Firestore EMULATOR, not to a browser or the
  // dev server, and the emulator is a Java process that only `npm run
  // test:rules` starts. Left in the default run it would fail with a connection
  // error on every machine that has not booted it, which reads as broken tests
  // rather than a missing service.
  testIgnore: '**/firestore-rules.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  /**
   * One local retry, two in CI.
   *
   * This does NOT hide failures: Playwright reports a test that passes on retry
   * as FLAKY, in its own section, which is louder than a silent pass and more
   * useful than a red run. It distinguishes "this is broken" from "this timed
   * out while eight workers competed for the same Firebase project", and only
   * the first of those is worth stopping for.
   *
   * Measured: across four consecutive full runs (544 test executions) exactly
   * one visual-sweep case failed, and that same spec passed six times out of six
   * when run alone. Locally we run fully parallel; CI runs single-worker, which
   * is why it needs fewer excuses and gets more retries anyway.
   */
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  // Without this, every spec depended on someone having started a dev server by
  // hand: forget, and the whole suite fails with ERR_CONNECTION_REFUSED, which
  // reads like broken tests rather than a missing server. reuseExistingServer
  // means a server you already have running is used as-is.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // A project-level testIgnore REPLACES the top-level one rather than
      // adding to it, so the emulator-only rules spec has to be repeated here
      // or it starts running under Chromium with no emulator behind it.
      testIgnore: ['**/webkit-safari.spec.ts', '**/firestore-rules.spec.ts'],
    },
    {
      // Every browser on iOS is WebKit, including the one called Chrome, and
      // these users are phone-first teenagers — so this is the engine most of
      // them will actually use. It ran zero tests until now.
      //
      // Scoped to the Safari-specific spec rather than the whole suite: the
      // rest is engine-agnostic product logic already covered under Chromium,
      // and doubling a two-minute suite to re-prove it would buy nothing.
      name: 'webkit',
      use: { ...devices['iPhone 13'] },
      testMatch: '**/webkit-safari.spec.ts',
    },
  ],
});
