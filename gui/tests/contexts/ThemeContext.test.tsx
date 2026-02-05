/**
 * ThemeContext Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../../src/contexts/ThemeContext';

// Test component that uses the theme hook
function TestComponent() {
  const { theme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setTheme('light')}>Set Light</button>
      <button onClick={() => setTheme('dark')}>Set Dark</button>
      <button onClick={toggleTheme}>Toggle</button>
    </div>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset document class
    document.documentElement.classList.remove('light');
    vi.clearAllMocks();
  });

  describe('ThemeProvider', () => {
    it('renders children', () => {
      render(
        <ThemeProvider>
          <div data-testid="child">Child content</div>
        </ThemeProvider>
      );
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('defaults to dark theme', () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );
      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    });

    it('reads initial theme from localStorage', () => {
      localStorage.setItem('gemini-hydra-theme', 'light');
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );
      expect(screen.getByTestId('theme')).toHaveTextContent('light');
    });
  });

  describe('setTheme', () => {
    it('changes theme to light', () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByText('Set Light'));
      expect(screen.getByTestId('theme')).toHaveTextContent('light');
    });

    it('changes theme to dark', () => {
      localStorage.setItem('gemini-hydra-theme', 'light');
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByText('Set Dark'));
      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    });

    it('persists theme to localStorage', () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByText('Set Light'));
      expect(localStorage.setItem).toHaveBeenCalledWith('gemini-hydra-theme', 'light');
    });
  });

  describe('toggleTheme', () => {
    it('toggles from dark to light', () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByText('Toggle'));
      expect(screen.getByTestId('theme')).toHaveTextContent('light');
    });

    it('toggles from light to dark', () => {
      localStorage.setItem('gemini-hydra-theme', 'light');
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByText('Toggle'));
      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    });
  });

  describe('document class', () => {
    it('adds light class for light theme', () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByText('Set Light'));
      expect(document.documentElement.classList.contains('light')).toBe(true);
    });

    it('removes light class for dark theme', () => {
      document.documentElement.classList.add('light');
      localStorage.setItem('gemini-hydra-theme', 'light');

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByText('Set Dark'));
      expect(document.documentElement.classList.contains('light')).toBe(false);
    });
  });

  describe('useTheme hook', () => {
    it('throws when used outside ThemeProvider', () => {
      // Suppress console.error for this test
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useTheme must be used within a ThemeProvider');

      spy.mockRestore();
    });

    it('returns theme context value', () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      expect(screen.getByTestId('theme')).toBeInTheDocument();
      expect(screen.getByText('Set Light')).toBeInTheDocument();
      expect(screen.getByText('Toggle')).toBeInTheDocument();
    });
  });
});
