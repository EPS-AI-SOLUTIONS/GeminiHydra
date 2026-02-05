/**
 * SettingsView Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsView } from '../../src/views/SettingsView';
import { createMockAppState, type MockAppState } from '../mocks/store';

// Mock framer-motion
vi.mock('framer-motion', async () => {
  const actual = await import('../mocks/framer-motion');
  return actual;
});

// Mock window.confirm
vi.stubGlobal('confirm', vi.fn(() => true));

// Create mock state
let mockState: MockAppState;

// Mock zustand store
vi.mock('../../src/stores/appStore', () => ({
  useAppStore: vi.fn((selector) => {
    if (selector) return selector(mockState);
    return mockState;
  }),
}));

// Mock theme context
const mockTheme = { theme: 'dark' as const, setTheme: vi.fn(), toggleTheme: vi.fn() };
vi.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: vi.fn(() => mockTheme),
}));

describe('SettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = createMockAppState();
    mockTheme.theme = 'dark';
  });

  describe('rendering', () => {
    it('renders page title', () => {
      render(<SettingsView />);
      expect(screen.getByText('Ustawienia')).toBeInTheDocument();
    });

    it('renders page subtitle', () => {
      render(<SettingsView />);
      expect(screen.getByText('Konfiguracja GeminiHydra')).toBeInTheDocument();
    });

    it('renders General section', () => {
      render(<SettingsView />);
      expect(screen.getByText('Ogólne')).toBeInTheDocument();
    });

    it('renders Model section', () => {
      render(<SettingsView />);
      // "Model" appears as both section header and label, so use getAllByText
      const modelTexts = screen.getAllByText('Model');
      expect(modelTexts.length).toBeGreaterThan(0);
    });

    it('renders version info', () => {
      render(<SettingsView />);
      expect(screen.getByText('GeminiHydra GUI')).toBeInTheDocument();
      expect(screen.getByText(/Wersja 0.1.0/)).toBeInTheDocument();
    });
  });

  describe('theme setting', () => {
    it('renders theme select', () => {
      render(<SettingsView />);
      expect(screen.getByText('Motyw')).toBeInTheDocument();
    });

    it('shows current theme', () => {
      render(<SettingsView />);
      const themeSelect = screen.getByDisplayValue('Ciemny');
      expect(themeSelect).toBeInTheDocument();
    });

    it('calls setTheme when changed', () => {
      render(<SettingsView />);
      const themeSelect = screen.getByDisplayValue('Ciemny');
      fireEvent.change(themeSelect, { target: { value: 'light' } });
      expect(mockTheme.setTheme).toHaveBeenCalledWith('light');
    });
  });

  describe('language setting', () => {
    it('renders language select', () => {
      render(<SettingsView />);
      expect(screen.getByText('Język')).toBeInTheDocument();
    });

    it('shows current language', () => {
      render(<SettingsView />);
      const langSelect = screen.getByDisplayValue('Polski');
      expect(langSelect).toBeInTheDocument();
    });

    it('calls updateSettings when changed', () => {
      render(<SettingsView />);
      const langSelect = screen.getByDisplayValue('Polski');
      fireEvent.change(langSelect, { target: { value: 'en' } });
      expect(mockState.updateSettings).toHaveBeenCalledWith({ language: 'en' });
    });
  });

  describe('streaming toggle', () => {
    it('renders streaming toggle', () => {
      render(<SettingsView />);
      expect(screen.getByText('Streaming')).toBeInTheDocument();
    });

    it('calls updateSettings when toggled', () => {
      render(<SettingsView />);
      const toggles = screen.getAllByRole('switch');
      fireEvent.click(toggles[0]); // First toggle is streaming
      expect(mockState.updateSettings).toHaveBeenCalledWith({ streaming: false });
    });
  });

  describe('verbose toggle', () => {
    it('renders verbose toggle', () => {
      render(<SettingsView />);
      expect(screen.getByText('Verbose')).toBeInTheDocument();
    });

    it('calls updateSettings when toggled', () => {
      render(<SettingsView />);
      const toggles = screen.getAllByRole('switch');
      fireEvent.click(toggles[1]); // Second toggle is verbose
      expect(mockState.updateSettings).toHaveBeenCalledWith({ verbose: true });
    });
  });

  describe('model setting', () => {
    it('renders model select', () => {
      render(<SettingsView />);
      // Find by label text
      const modelLabels = screen.getAllByText('Model');
      expect(modelLabels.length).toBeGreaterThan(0);
    });

    it('shows current model', () => {
      render(<SettingsView />);
      const modelSelect = screen.getByDisplayValue('Gemini 2.5 Flash');
      expect(modelSelect).toBeInTheDocument();
    });

    it('calls updateSettings when changed', () => {
      render(<SettingsView />);
      const modelSelect = screen.getByDisplayValue('Gemini 2.5 Flash');
      fireEvent.change(modelSelect, { target: { value: 'gemini-2.5-pro' } });
      expect(mockState.updateSettings).toHaveBeenCalledWith({ model: 'gemini-2.5-pro' });
    });
  });

  describe('temperature setting', () => {
    it('renders temperature slider', () => {
      render(<SettingsView />);
      expect(screen.getByText('Temperatura')).toBeInTheDocument();
    });

    it('shows current temperature', () => {
      render(<SettingsView />);
      expect(screen.getByText('0.7')).toBeInTheDocument();
    });

    it('calls updateSettings when changed', () => {
      render(<SettingsView />);
      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '1.0' } });
      expect(mockState.updateSettings).toHaveBeenCalledWith({ temperature: 1.0 });
    });
  });

  describe('max tokens setting', () => {
    it('renders max tokens select', () => {
      render(<SettingsView />);
      expect(screen.getByText('Max Tokens')).toBeInTheDocument();
    });

    it('shows current max tokens', () => {
      render(<SettingsView />);
      const select = screen.getByDisplayValue('8192');
      expect(select).toBeInTheDocument();
    });

    it('calls updateSettings when changed', () => {
      render(<SettingsView />);
      const select = screen.getByDisplayValue('8192');
      fireEvent.change(select, { target: { value: '16384' } });
      expect(mockState.updateSettings).toHaveBeenCalledWith({ maxTokens: 16384 });
    });
  });

  describe('reset functionality', () => {
    it('renders reset button', () => {
      render(<SettingsView />);
      expect(screen.getByText('Resetuj')).toBeInTheDocument();
    });

    it('shows confirmation on reset', () => {
      render(<SettingsView />);
      fireEvent.click(screen.getByText('Resetuj'));
      expect(window.confirm).toHaveBeenCalled();
    });

    it('resets settings when confirmed', () => {
      render(<SettingsView />);
      fireEvent.click(screen.getByText('Resetuj'));
      expect(mockState.updateSettings).toHaveBeenCalled();
      expect(mockTheme.setTheme).toHaveBeenCalledWith('dark');
    });

    it('does not reset when cancelled', () => {
      vi.mocked(window.confirm).mockReturnValueOnce(false);
      render(<SettingsView />);
      fireEvent.click(screen.getByText('Resetuj'));
      expect(mockState.updateSettings).not.toHaveBeenCalled();
    });
  });
});
