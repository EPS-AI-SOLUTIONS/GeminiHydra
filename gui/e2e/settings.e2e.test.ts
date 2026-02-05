/**
 * Settings E2E Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('text=Ustawienia');
  });

  test('renders settings page', async ({ page }) => {
    // "Ustawienia" appears in sidebar and as page title
    await expect(page.getByText('Ustawienia').first()).toBeVisible();
    await expect(page.getByText('Konfiguracja GeminiHydra')).toBeVisible();
  });

  test('shows General section', async ({ page }) => {
    await expect(page.getByText('Ogólne')).toBeVisible();
    // These may have slight delays, use toBeVisible with timeout
    await expect(page.getByText('Motyw').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Język').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Streaming').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Verbose').first()).toBeVisible({ timeout: 5000 });
  });

  test('shows Model section', async ({ page }) => {
    // The word "Model" appears twice - in section header and as label
    const modelTexts = page.getByText('Model');
    await expect(modelTexts.first()).toBeVisible();
    await expect(page.getByText('Temperatura')).toBeVisible();
    await expect(page.getByText('Max Tokens')).toBeVisible();
  });

  test('can change theme', async ({ page }) => {
    // Find theme select
    const themeSelect = page.locator('select').first();

    // Change to light
    await themeSelect.selectOption('light');

    // HTML should have light class
    await expect(page.locator('html')).toHaveClass(/light/);

    // Change back to dark
    await themeSelect.selectOption('dark');

    // HTML should not have light class
    await expect(page.locator('html')).not.toHaveClass(/light/);
  });

  test('can change language', async ({ page }) => {
    // Find language select (second select in the form)
    const langSelect = page.locator('select').nth(1);

    // Should default to Polish
    await expect(langSelect).toHaveValue('pl');

    // Change to English
    await langSelect.selectOption('en');
    await expect(langSelect).toHaveValue('en');
  });

  test('can toggle streaming', async ({ page }) => {
    // Find first toggle switch
    const streamingToggle = page.getByRole('switch').first();

    // Should be on by default
    await expect(streamingToggle).toHaveAttribute('aria-checked', 'true');

    // Click to toggle off
    await streamingToggle.click();
    await expect(streamingToggle).toHaveAttribute('aria-checked', 'false');

    // Click to toggle back on
    await streamingToggle.click();
    await expect(streamingToggle).toHaveAttribute('aria-checked', 'true');
  });

  test('can toggle verbose', async ({ page }) => {
    // Find second toggle switch
    const verboseToggle = page.getByRole('switch').nth(1);

    // Should be off by default
    await expect(verboseToggle).toHaveAttribute('aria-checked', 'false');

    // Click to toggle on
    await verboseToggle.click();
    await expect(verboseToggle).toHaveAttribute('aria-checked', 'true');
  });

  test('can change model', async ({ page }) => {
    // Find model select (third select in form)
    const modelSelect = page.locator('select').nth(2);

    // Should default to gemini-2.5-flash
    await expect(modelSelect).toHaveValue('gemini-2.5-flash');

    // Change to pro
    await modelSelect.selectOption('gemini-2.5-pro');
    await expect(modelSelect).toHaveValue('gemini-2.5-pro');
  });

  test('can adjust temperature', async ({ page }) => {
    // Find temperature slider
    const slider = page.getByRole('slider');

    // Should default to 0.7
    await expect(slider).toHaveValue('0.7');

    // Change value using evaluate (fill doesn't work on range inputs)
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = '1';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(slider).toHaveValue('1');
  });

  test('can change max tokens', async ({ page }) => {
    // Find max tokens select (fourth select)
    const tokensSelect = page.locator('select').nth(3);

    // Should default to 8192
    await expect(tokensSelect).toHaveValue('8192');

    // Change to 16384
    await tokensSelect.selectOption('16384');
    await expect(tokensSelect).toHaveValue('16384');
  });

  test('reset button shows confirmation', async ({ page }) => {
    // Listen for dialog
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('przywrócić domyślne');
      await dialog.dismiss();
    });

    // Click reset button
    await page.click('text=Resetuj');
  });

  test('reset restores defaults when confirmed', async ({ page }) => {
    // Change some settings first
    const langSelect = page.locator('select').nth(1);
    await langSelect.selectOption('en');

    const verboseToggle = page.getByRole('switch').nth(1);
    await verboseToggle.click();

    // Accept confirmation
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Click reset
    await page.click('text=Resetuj');

    // Wait a moment for state to update
    await page.waitForTimeout(100);

    // Settings should be restored
    await expect(langSelect).toHaveValue('pl');
    await expect(verboseToggle).toHaveAttribute('aria-checked', 'false');
  });

  test('shows version info', async ({ page }) => {
    await expect(page.getByText('GeminiHydra GUI')).toBeVisible();
    await expect(page.getByText(/Wersja 0.1.0/)).toBeVisible();
    await expect(page.getByText(/React 19/)).toBeVisible();
  });
});
