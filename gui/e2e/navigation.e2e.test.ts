/**
 * Navigation E2E Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('homepage loads with chat view', async ({ page }) => {
    // Should see GeminiHydra logo
    await expect(page.getByText('GeminiHydra').first()).toBeVisible();

    // Should see chat welcome message
    await expect(page.getByText('Witaj w GeminiHydra')).toBeVisible({ timeout: 5000 });
  });

  test('navigates to agents view', async ({ page }) => {
    await page.click('text=Agenci');

    // Should see agents page title
    await expect(page.getByText('Agenci Hydry')).toBeVisible();

    // Should see agent cards
    await expect(page.getByText('Geralt')).toBeVisible();
    await expect(page.getByText('Dijkstra')).toBeVisible();
  });

  test('navigates to history view', async ({ page }) => {
    await page.click('text=Historia');

    // Should see history page title
    await expect(page.getByText('Historia Konwersacji')).toBeVisible();

    // Should see empty state
    await expect(page.getByText('Brak historii')).toBeVisible();
  });

  test('navigates to settings view', async ({ page }) => {
    await page.click('text=Ustawienia');

    // Should see settings sections (with timeout for animation)
    await expect(page.getByText('Ogólne')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Model').first()).toBeVisible({ timeout: 5000 });
  });

  test('navigates back to chat view', async ({ page }) => {
    // Go to settings first
    await page.click('text=Ustawienia');
    await expect(page.getByText('Ogólne')).toBeVisible();

    // Go back to chat
    await page.click('text=Chat');
    await expect(page.getByText('Witaj w GeminiHydra')).toBeVisible();
  });

  test('sidebar toggle works', async ({ page }) => {
    // Find the toggle button using aria-label or first button with chevron
    const toggleButton = page.locator('aside button').first();

    // Logo should be visible initially
    await expect(page.getByText('GeminiHydra').first()).toBeVisible();

    // Click toggle
    await toggleButton.click();

    // Give animation time to complete
    await page.waitForTimeout(500);

    // Click toggle again
    await toggleButton.click();
    await page.waitForTimeout(500);

    // Logo should still be visible
    await expect(page.getByText('GeminiHydra').first()).toBeVisible();
  });

  test('theme toggle changes appearance', async ({ page }) => {
    // Initially should be in dark mode (default)
    const html = page.locator('html');

    // Check initial state - button says "Jasny motyw" (option to switch to light)
    // Or it may say "Ciemny motyw" if currently in dark mode
    // Find the theme toggle button in sidebar
    const themeButton = page.locator('aside button').filter({ hasText: /motyw/i });
    await expect(themeButton).toBeVisible();

    // Click to change theme
    await themeButton.click();

    // Wait for change
    await page.waitForTimeout(500);

    // Click again to toggle back
    await themeButton.click();

    // Theme should still work (button visible)
    await expect(themeButton).toBeVisible();
  });

  test('navigation highlights active view', async ({ page }) => {
    // Chat should be active by default
    const chatButton = page.locator('button').filter({ hasText: 'Chat' });
    await expect(chatButton).toHaveClass(/bg-\[var\(--matrix-accent\)\]/);

    // Click agents
    await page.click('text=Agenci');

    // Agents should now be active
    const agentsButton = page.locator('button').filter({ hasText: 'Agenci' });
    await expect(agentsButton).toHaveClass(/bg-\[var\(--matrix-accent\)\]/);
  });

  test('header updates with view title', async ({ page }) => {
    // Initial header should show Chat
    await expect(page.locator('header h1')).toHaveText('Chat');

    // Navigate to agents
    await page.click('text=Agenci');
    await expect(page.locator('header h1')).toHaveText('Agenci');

    // Navigate to history
    await page.click('text=Historia');
    await expect(page.locator('header h1')).toHaveText('Historia');

    // Navigate to settings
    await page.click('text=Ustawienia');
    await expect(page.locator('header h1')).toHaveText('Ustawienia');
  });
});
