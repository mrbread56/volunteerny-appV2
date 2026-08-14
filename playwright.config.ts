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
  retries: process.env.CI ? 2 : 0,
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
    },
  ],
});
