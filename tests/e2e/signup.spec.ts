import { test, expect } from '@playwright/test';

test.describe('E2E: Critical Workflows', () => {

  test('the home page offers both ways in, and they lead somewhere', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Volunteer North York').first()).toBeVisible();

    /*
     * This used to look for a "Demo as a student" button and wrap the entire
     * body in `if (await demoModeBtn.isVisible())`. No such button exists on the
     * home page — the only demo entry in the app is inside the developer
     * dashboard — so the body never ran and the test passed on the header check
     * alone, for as long as it has existed.
     *
     * These two are what the page actually offers, and they are the only routes
     * a real visitor has into the product.
     */
    const student = page.getByRole('link', { name: /continue as a student/i }).first();
    const org = page.getByRole('link', { name: /continue as an organi[sz]ation/i }).first();
    await expect(student, 'the student entry point must exist').toBeVisible();
    await expect(org, 'the organisation entry point must exist').toBeVisible();

    await student.click();
    await page.waitForURL(/\/(signup|login)/, { timeout: 20000 });
    expect(page.url()).toMatch(/\/(signup|login)/);
  });

  /*
   * "Race Condition Check: Double Application Submission" used to live here and
   * tested nothing. Its only assertion was expect(true).toBeTruthy(), its own
   * comment admitted it was "illustrative", it intercepted a wildcard route for
   * /api/applications (an endpoint that does not exist, since applications are a
   * Firestore write), and it navigated to /dashboard, which is not a route in
   * this app.
   *
   * The behaviour it named is genuinely covered: scripts/check-concurrency.ts
   * fires eight simultaneous applications at the real deterministic
   * {uid}_{oppId} document id and asserts exactly one document survives. A test
   * that cannot fail is worse than no test, because it counts toward a number
   * people trust.
   */
});
