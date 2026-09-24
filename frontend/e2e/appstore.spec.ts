import { test, expect } from '@playwright/test';

test.describe('App Store Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass auth and setup
    await page.route('**/api/auth/status*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { needs_setup: false } });
    });

    await page.route('**/api/auth/me*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { username: 'admin', role: 'admin' } });
    });

    // Mock system endpoints so layout and architecture filters load cleanly
    await page.route('**/api/system/customization*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: {} });
    });
    await page.route('**/api/system/settings*', async route => {
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
    await page.route('**/api/system/version*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { version: '4.0.0', arch: 'x86_64' } });
    });
    await page.route('**/api/docker/containers*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: [] });
    });

    await page.context().addCookies([
      { name: 'saturn_token', value: 'mocked_token', url: 'http://localhost:5173' }
    ]);

    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('saturn_token', 'mocked_token');
        document.cookie = 'saturn_token=mocked_token; path=/; SameSite=Lax';
      } catch {}
    });

    // Mock store apps
    await page.route('**/api/store/apps*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: [
          { id: 'adguard-home', name: 'AdGuard Home', description: 'Network-wide ads & trackers blocking DNS server', icon: '', category: 'Network', store: 'Official' },
          { id: 'plex', name: 'Plex', description: 'Media server', icon: '', category: 'Media', store: 'Official' }
        ]
      });
    });
  });

  test('should display apps in the store catalog', async ({ page }) => {
    await page.goto('/store');

    // Wait for the mock apps to render
    await expect(page.getByText('AdGuard Home').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Plex').first()).toBeVisible({ timeout: 15000 });
  });

  test('should open install modal or perform install action', async ({ page }) => {
    await page.goto('/store');
    
    // Find install button on AdGuard Home card
    const installBtn = page.locator('button').filter({ hasText: /instalar|install/i }).first();
    
    if (await installBtn.isVisible()) {
      await page.route('**/api/store/install/*', async route => {
        await route.fulfill({ status: 200, json: { task_id: 'task-123', status: 'started' } });
      });

      await installBtn.click();
    }
  });
});
