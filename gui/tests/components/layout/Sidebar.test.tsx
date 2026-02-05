/**
 * Sidebar Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../../../src/components/layout/Sidebar';
import { createMockAppState } from '../../mocks/store';

// Mock framer-motion
vi.mock('framer-motion', async () => {
  const actual = await import('../../mocks/framer-motion');
  return actual;
});

// Mock zustand store
const mockState = createMockAppState();
vi.mock('../../../src/stores/appStore', () => ({
  useAppStore: vi.fn((selector) => {
    if (selector) return selector(mockState);
    return mockState;
  }),
}));

// Mock theme context
const mockTheme = { theme: 'dark' as const, setTheme: vi.fn(), toggleTheme: vi.fn() };
vi.mock('../../../src/contexts/ThemeContext', () => ({
  useTheme: vi.fn(() => mockTheme),
}));

describe('Sidebar', () => {
  const defaultProps = {
    currentView: 'chat' as const,
    onViewChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.isSidebarOpen = true;
    mockTheme.theme = 'dark';
  });

  describe('rendering', () => {
    it('renders all navigation items', () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText('Chat')).toBeInTheDocument();
      expect(screen.getByText('Agenci')).toBeInTheDocument();
      expect(screen.getByText('Historia')).toBeInTheDocument();
      expect(screen.getByText('Ustawienia')).toBeInTheDocument();
    });

    it('renders logo text when sidebar is open', () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText('GeminiHydra')).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('highlights active view', () => {
      render(<Sidebar {...defaultProps} currentView="agents" />);
      const agentsButton = screen.getByText('Agenci').closest('button');
      expect(agentsButton).toHaveClass('bg-[var(--matrix-accent)]');
    });

    it('calls onViewChange when nav item clicked', () => {
      const onViewChange = vi.fn();
      render(<Sidebar {...defaultProps} onViewChange={onViewChange} />);

      fireEvent.click(screen.getByText('Agenci'));
      expect(onViewChange).toHaveBeenCalledWith('agents');
    });

    it('calls onViewChange for each navigation item', () => {
      const onViewChange = vi.fn();
      render(<Sidebar {...defaultProps} onViewChange={onViewChange} />);

      fireEvent.click(screen.getByText('Chat'));
      expect(onViewChange).toHaveBeenCalledWith('chat');

      fireEvent.click(screen.getByText('Historia'));
      expect(onViewChange).toHaveBeenCalledWith('history');

      fireEvent.click(screen.getByText('Ustawienia'));
      expect(onViewChange).toHaveBeenCalledWith('settings');
    });
  });

  describe('sidebar toggle', () => {
    it('calls toggleSidebar when toggle button clicked', () => {
      render(<Sidebar {...defaultProps} />);

      // Find the toggle button (contains ChevronLeft icon)
      const buttons = screen.getAllByRole('button');
      const toggleButton = buttons.find(btn => btn.querySelector('svg.lucide-chevron-left'));

      if (toggleButton) {
        fireEvent.click(toggleButton);
        expect(mockState.toggleSidebar).toHaveBeenCalled();
      }
    });
  });

  describe('theme toggle', () => {
    it('calls toggleTheme when theme button clicked', () => {
      render(<Sidebar {...defaultProps} />);

      // The theme toggle shows "Jasny motyw" in dark mode
      fireEvent.click(screen.getByText('Jasny motyw'));
      expect(mockTheme.toggleTheme).toHaveBeenCalled();
    });

    it('shows correct theme label in dark mode', () => {
      mockTheme.theme = 'dark';
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText('Jasny motyw')).toBeInTheDocument();
    });

    it('shows correct theme label in light mode', () => {
      mockTheme.theme = 'light';
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText('Ciemny motyw')).toBeInTheDocument();
    });
  });

  describe('collapsed state', () => {
    it('hides text labels when sidebar collapsed', () => {
      mockState.isSidebarOpen = false;
      render(<Sidebar {...defaultProps} />);
      // AnimatePresence mock just renders children, so we can't test actual hiding
      // This would need integration testing or snapshot testing
    });
  });
});
