import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should show error on invalid credentials', async ({ page }) => {
    // Mock setup status (setup already done)
    await page.route('**/api/auth/status', async route => {
      await route.fulfill({ status: 200, json: { needs_setup: false } });
    });

    // Mock the backend API response for a failed login
    await page.route('**/api/auth/login', async route => {
      await route.fulfill({ status: 401, json: { error: 'Credenciais inválidas.' } });
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
    await page.route('**/api/auth/status', async route => {
      await route.fulfill({ status: 200, json: { needs_setup: false } });
    });

    // Mock successful login
    await page.route('**/api/auth/login', async route => {
      await route.fulfill({ status: 200, json: { token: 'mock-token-123' } });
    });

    // Mock me endpoint
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, json: { username: 'admin' } });
    });

    // Mock docker containers
    await page.route('**/api/docker/containers', async route => {
      await route.fulfill({ status: 200, json: [] });
    });

    await page.goto('/login');
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('correctpassword');
    await page.locator('button[type="submit"]').click();

    // Verify redirection. The URL should not be /login anymore.
    await expect(page).not.toHaveURL(/.*login/, { timeout: 15000 });
  });
});
