/**
 * Chat E2E Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Chat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows welcome message', async ({ page }) => {
    await expect(page.getByText('Witaj w GeminiHydra')).toBeVisible();
    await expect(page.getByText(/System multi-agentowy/)).toBeVisible();
  });

  test('renders chat input', async ({ page }) => {
    const textarea = page.getByPlaceholder(/Napisz wiadomość/);
    await expect(textarea).toBeVisible();
  });

  test('renders send button', async ({ page }) => {
    const button = page.getByRole('button', { name: /Wyślij/ });
    await expect(button).toBeVisible();
  });

  test('send button is disabled when input empty', async ({ page }) => {
    const button = page.getByRole('button', { name: /Wyślij/ });
    await expect(button).toBeDisabled();
  });

  test('can type message in input', async ({ page }) => {
    const textarea = page.getByPlaceholder(/Napisz wiadomość/);
    await textarea.fill('Hello, this is a test message');
    await expect(textarea).toHaveValue('Hello, this is a test message');
  });

  test('send button is enabled when input has text', async ({ page }) => {
    const textarea = page.getByPlaceholder(/Napisz wiadomość/);
    await textarea.fill('Test message');

    const button = page.getByRole('button', { name: /Wyślij/ });
    await expect(button).not.toBeDisabled();
  });

  test('can send message via button', async ({ page }) => {
    const textarea = page.getByPlaceholder(/Napisz wiadomość/);
    await textarea.fill('Test message via button');

    const button = page.getByRole('button', { name: /Wyślij/ });
    await button.click();

    // Message should appear in chat
    await expect(page.getByText('Test message via button')).toBeVisible();

    // Input should be cleared
    await expect(textarea).toHaveValue('');
  });

  test('can send message via Enter key', async ({ page }) => {
    const textarea = page.getByPlaceholder(/Napisz wiadomość/);
    await textarea.fill('Test message via Enter');
    await textarea.press('Enter');

    // Message should appear in chat
    await expect(page.getByText('Test message via Enter')).toBeVisible();
  });

  test('Shift+Enter does not send message', async ({ page }) => {
    const textarea = page.getByPlaceholder(/Napisz wiadomość/);
    await textarea.fill('Line 1');
    await textarea.press('Shift+Enter');
    await page.keyboard.type('Line 2');

    // Input should still have text (message not sent)
    const value = await textarea.inputValue();
    expect(value).toContain('Line 1');
    expect(value).toContain('Line 2');
  });

  test('shows loading state during response', async ({ page }) => {
    const textarea = page.getByPlaceholder(/Napisz wiadomość/);
    await textarea.fill('Test loading');

    const button = page.getByRole('button', { name: /Wyślij/ });
    await button.click();

    // Should show loading indicator
    await expect(page.getByText('Agenci myślą...')).toBeVisible();
  });

  test('response appears after loading', async ({ page }) => {
    const textarea = page.getByPlaceholder(/Napisz wiadomość/);
    await textarea.fill('Test response');

    const button = page.getByRole('button', { name: /Wyślij/ });
    await button.click();

    // Wait for simulated response (1.5s timeout in component)
    await page.waitForTimeout(2000);

    // Response should appear
    await expect(page.getByText(/To jest przykładowa odpowiedź/)).toBeVisible();

    // Loading indicator should be gone
    await expect(page.getByText('Agenci myślą...')).not.toBeVisible();
  });

  test('shows keyboard shortcut help', async ({ page }) => {
    await expect(page.getByText(/Shift \+ Enter dla nowej linii/)).toBeVisible();
  });

  test('multiple messages appear in order', async ({ page }) => {
    const textarea = page.getByPlaceholder(/Napisz wiadomość/);
    const button = page.getByRole('button', { name: /Wyślij/ });

    // Send first message
    await textarea.fill('First message');
    await button.click();

    // Wait for first message to appear
    await expect(page.getByText('First message')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(2000); // Wait for response

    // Send second message
    await textarea.fill('Second message');
    await button.click();

    // Wait for second message to appear
    await expect(page.getByText('Second message')).toBeVisible({ timeout: 5000 });
  });

  test('welcome message hides after first message', async ({ page }) => {
    // Welcome should be visible initially
    await expect(page.getByText('Witaj w GeminiHydra')).toBeVisible();

    // Send a message
    const textarea = page.getByPlaceholder(/Napisz wiadomość/);
    await textarea.fill('Test');
    await textarea.press('Enter');

    // Welcome should be hidden
    await expect(page.getByText('Witaj w GeminiHydra')).not.toBeVisible();
  });
});
