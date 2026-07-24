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
    // Check if the logo image is present and has the correct src
    const logo = page.locator('img[alt="Volunteer North York"]').first();
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('src', '/logo.png');
    
    // Click login link and verify navigation
    await page.click('text=Login');
    await expect(page).toHaveURL(/.*\/login/);
  });
});
