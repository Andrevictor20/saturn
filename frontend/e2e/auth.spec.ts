import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should show error on invalid credentials', async ({ page }) => {
    // Mock setup status (setup already done)
    await page.route(url => url.pathname.includes('/api/auth/status'), async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { needs_setup: false } });
    });

    // Mock the backend API response for a failed login
    await page.route(url => url.pathname.includes('/api/auth/login'), async route => {
      await route.fulfill({ status: 401, contentType: 'application/json', json: { error: 'Credenciais inválidas.' } });
    });

    await page.goto('/login');
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    // Verify error message is displayed
    await expect(page.getByText('Credenciais inválidas.')).toBeVisible();
  });

  test('should redirect to dashboard on successful login', async ({ page }) => {
    // Mock setup status (setup already done)
    await page.route(url => url.pathname.includes('/api/auth/status'), async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { needs_setup: false } });
    });

    // Mock successful login
    await page.route(url => url.pathname.includes('/api/auth/login'), async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { token: 'mock-token-123' } });
    });

    // Mock me endpoint
    await page.route(url => url.pathname.includes('/api/auth/me'), async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { username: 'admin', role: 'admin' } });
    });

    // Mock system endpoints for smooth dashboard bootstrap
    await page.route(url => url.pathname.includes('/api/system/customization'), async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: {} });
    });
    await page.route(url => url.pathname.includes('/api/system/settings'), async route => {
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
    await page.route(url => url.pathname.includes('/api/system/version'), async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { version: '4.0.0', arch: 'x86_64' } });
    });

    // Mock docker containers
    await page.route(url => url.pathname.includes('/api/docker/'), async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: [] });
    });

    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('correctpassword');

    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/auth/login')),
      page.locator('button[type="submit"]').click(),
    ]);

    // Verify redirection. The URL should not be /login anymore.
    await expect(page).not.toHaveURL(/.*login/, { timeout: 15000 });
  });
});
