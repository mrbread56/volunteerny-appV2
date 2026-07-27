import { test, expect } from '@playwright/test';

// Define the pages to test
const PAGES = [
  { path: '/', name: 'Home' },
  { path: '/login', name: 'Login' },
  { path: '/signup', name: 'Signup' },
  { path: '/privacy', name: 'Privacy Policy' },
  { path: '/terms', name: 'Terms of Service' },
  // These pages require auth but we can test that they correctly redirect or load the UI shell
  { path: '/student/dashboard', name: 'Student Dashboard' },
  { path: '/student/opportunities', name: 'Student Opportunities' },
  { path: '/org/dashboard', name: 'Org Dashboard' },
  { path: '/developer/dashboard', name: 'Developer Dashboard' },
];

test.describe('Comprehensive Site Audit (Tens of Tests)', () => {
  PAGES.forEach(({ path, name }) => {
    test(`Page Loads Successfully: ${name}`, async ({ page }) => {
      
      const errors: string[] = [];
      page.on('pageerror', (exception) => {
        errors.push(`Uncaught exception: "${exception}"`);
      });

      page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(`Console Error: "${msg.text()}"`);
        }
      });

      // Navigate to the page
      const response = await page.goto(path, { waitUntil: 'load' });
      
      // We expect the server to return 200 OK
      expect(response?.status(), `Server should respond with 200 for ${path}`).toBe(200);

      // Verify no critical frontend rendering errors (React Error Boundary shouldn't trigger)
      const bodyText = await page.innerText('body');
      expect(bodyText).not.toContain('Something went wrong');
      
      // Log any errors found
      if (errors.length > 0) {
        console.error(`Errors found on ${name}:`, errors);
      }
      
      // Certain generic errors from third parties might happen, but React shouldn't crash
      expect(errors.filter(e => e.includes('Minified React error'))).toHaveLength(0);
    });
  });

  test('Login UI Elements', async ({ page }) => {
    await page.goto('/login');
    // Ensure the Google button is present
    await expect(page.locator('button:has-text("Google")')).toBeVisible();
    
    // Ensure email/password inputs are present
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('Navbar Logo and Routing', async ({ page }) => {
    await page.goto('/');

    // The logo image is intentionally decorative (alt="") — the adjacent brand
    // text names the link, so alt text would double-announce it. This asserted
    // img[alt="Volunteer North York"], which stopped matching once that was
    // fixed. Assert the thing that actually matters: the link has an
    // accessible name, and it carries the logo.
    const home = page.getByRole('link', { name: 'Volunteer North York' }).first();
    await expect(home).toBeVisible();
    await expect(home.locator('img')).toHaveAttribute('src', '/logo.png');

    // Click login link and verify navigation. The nav renders "Log in"; this
    // matched on 'text=Login' and never fired, but the assertion above failed
    // first so the timeout here stayed hidden.
    await page.getByRole('link', { name: 'Log in' }).first().click();
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('Navbar logo link is still labelled on mobile', async ({ page }) => {
    // Regression guard: the brand text is `hidden sm:inline`, so below 640px
    // the anchor previously had no accessible name whatsoever.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Volunteer North York' }).first()).toBeVisible();
  });
});
