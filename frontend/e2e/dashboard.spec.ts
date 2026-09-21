import { test, expect } from '@playwright/test';

test.describe('Dashboard and Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass auth and setup checks
    await page.route('**/api/auth/status', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { needs_setup: false } });
    });

    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { username: 'admin', role: 'admin' } });
    });

    // Mock system endpoints for clean overview bootstrap
    await page.route('**/api/system/customization', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: {} });
    });
    await page.route('**/api/system/settings', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          server_name: 'Saturn',
          port: 5172,
          default_page: '/',
          metrics_refresh_rate: 5,
          show_weather_card: true,
          weather_city: '',
          confirm_dangerous_actions: true,
          integrations: { homeassistant: true, pihole: true, cloudflare: true }
        }
      });
    });
    await page.route('**/api/system/version', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { version: '4.0.0', arch: 'x86_64' } });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('saturn_token', 'mocked_token');
    });

    // Mock typical dashboard endpoints
    await page.route('**/api/docker/containers', async route => {
      await route.fulfill({
        status: 200,
        json: [{
          id: '1234567890ab',
          name: 'nginx-test',
          image: 'nginx:latest',
          status: 'Up 2 hours',
          state: 'running',
          created: 1700000000,
          ports: []
        }]
      });
    });

    await page.route('**/api/docker/containers/stats/snapshot', async route => {
      await route.fulfill({
        status: 200,
        json: { cpu_percent: 15.5, memory_percent: 25.0, memory_used: 1024, memory_limit: 4096 }
      });
    });
  });

  test('should load overview widgets properly', async ({ page }) => {
    await page.goto('/');
    
    // Check if the page title is correct
    await expect(page).toHaveTitle(/Saturn/);

    // Ensure the main layout or sidebar is present
    await expect(page.locator('aside, nav, header').first()).toBeVisible();
  });

  test('should navigate to Containers page', async ({ page }) => {
    await page.goto('/');

    // Look for link to containers page
    const containersLink = page.locator('a[href="/containers"]').first();
    await expect(containersLink).toBeVisible();
    await containersLink.click();
    
    // Verify URL changed
    await expect(page).toHaveURL(/.*containers/);
  });
});
