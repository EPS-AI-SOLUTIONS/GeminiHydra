/**
 * Tauri E2E Tests - Real Application
 *
 * These tests run against the REAL Tauri binary with the actual Rust backend.
 * No mocks - full integration testing via tauri-driver + WebDriver.
 */

describe('GeminiGUI - Real Tauri App', () => {
  // =====================================================
  // App Launch & UI
  // =====================================================

  describe('App Launch', () => {
    it('should load the main window', async () => {
      // The app should display the header with the logo
      const header = await $('header');
      await expect(header).toBeDisplayed();
    });

    it('should show the chat input', async () => {
      const textarea = await $('textarea');
      await expect(textarea).toBeDisplayed();
    });

    it('should show the session sidebar', async () => {
      const sidebar = await $('aside');
      await expect(sidebar).toBeDisplayed();
    });

    it('should show the status footer', async () => {
      const footer = await $('footer');
      await expect(footer).toExist();
    });
  });

  // =====================================================
  // Chat Input
  // =====================================================

  describe('Chat Input', () => {
    it('should accept text input', async () => {
      const textarea = await $('textarea');
      await textarea.setValue('Test message');
      const value = await textarea.getValue();
      expect(value).toBe('Test message');
    });

    it('should have a send button', async () => {
      const sendButton = await $('button[type="submit"]');
      await expect(sendButton).toBeDisplayed();
    });

    it('should clear input after sending', async () => {
      const textarea = await $('textarea');
      await textarea.setValue('Hello Gemini');

      const sendButton = await $('button[type="submit"]');
      await sendButton.click();

      // Wait for the input to clear
      await browser.waitUntil(
        async () => {
          const val = await textarea.getValue();
          return val === '';
        },
        { timeout: 5000, timeoutMsg: 'Input did not clear after sending' }
      );
    });
  });

  // =====================================================
  // Session Management
  // =====================================================

  describe('Sessions', () => {
    it('should have at least one session by default', async () => {
      const sessions = await $$('[class*="cursor-pointer"]');
      expect(sessions.length).toBeGreaterThanOrEqual(1);
    });

    it('should create a new session', async () => {
      // Count existing sessions
      const beforeSessions = await $$('[class*="cursor-pointer"]');
      const beforeCount = beforeSessions.length;

      // Click the create session button (+ button)
      const createBtn = await $('button*=Nowa');
      if (await createBtn.isExisting()) {
        await createBtn.click();
      } else {
        // Try finding by icon
        const plusBtn = await $('aside button');
        await plusBtn.click();
      }

      // Wait for new session to appear
      await browser.waitUntil(
        async () => {
          const afterSessions = await $$('[class*="cursor-pointer"]');
          return afterSessions.length > beforeCount;
        },
        { timeout: 5000, timeoutMsg: 'New session was not created' }
      );
    });
  });

  // =====================================================
  // Settings
  // =====================================================

  describe('Settings', () => {
    it('should open settings with keyboard shortcut', async () => {
      // Ctrl+, opens settings
      await browser.keys(['Control', ',']);

      // Wait for settings modal
      const modal = await $('*=Konfiguracja');
      await expect(modal).toBeDisplayed();
    });

    it('should have API key input field', async () => {
      const apiKeyInput = await $('input[type="password"]');
      await expect(apiKeyInput).toBeDisplayed();
    });

    it('should have system prompt textarea', async () => {
      // There should be a textarea in the settings for system prompt
      const textareas = await $$('.fixed textarea');
      expect(textareas.length).toBeGreaterThanOrEqual(1);
    });

    it('should close settings with Cancel button', async () => {
      // The SettingsModal has an "Anuluj" (Cancel) button
      const cancelBtn = await $('button*=Anuluj');
      await expect(cancelBtn).toBeDisplayed();
      await cancelBtn.click();

      // Wait for modal to close
      await browser.waitUntil(
        async () => {
          const modal = await $('.fixed.inset-0');
          if (!(await modal.isExisting())) return true;
          return !(await modal.isDisplayed());
        },
        { timeout: 5000, timeoutMsg: 'Settings modal did not close' }
      );
    });
  });

  // =====================================================
  // Theme Toggle
  // =====================================================

  describe('Theme', () => {
    it('should toggle between dark and light theme', async () => {
      // Ensure no modal is blocking
      const overlay = await $('.fixed.inset-0');
      if (await overlay.isExisting() && await overlay.isDisplayed()) {
        await browser.keys('Escape');
        await browser.pause(500);
      }

      // Get current background state
      const mainEl = await $('main');
      const classBefore = await mainEl.getAttribute('class');

      // Click theme toggle button
      const themeBtn = await $('button[title*="Motyw"]');
      if (await themeBtn.isExisting()) {
        await themeBtn.click();
      }

      // Verify class changed
      await browser.pause(500); // Wait for transition
      const classAfter = await mainEl.getAttribute('class');
      expect(classAfter).not.toBe(classBefore);
    });
  });

  // =====================================================
  // Tauri Backend Integration
  // =====================================================

  describe('Tauri Backend', () => {
    it('should detect Tauri environment (not Web mode)', async () => {
      // In real Tauri, the status should show "Gemini Ready" or similar
      // NOT the web simulation mode
      const body = await $('body');
      const text = await body.getText();
      expect(text).not.toContain('SYMULACJA TRYBU WEB');
    });

    it('should have Tauri IPC available', async () => {
      // Check that __TAURI_INTERNALS__ is available in the window
      const hasTauri = await browser.execute(() => {
        return !!(window as any).__TAURI_INTERNALS__;
      });
      expect(hasTauri).toBe(true);
    });
  });
});
