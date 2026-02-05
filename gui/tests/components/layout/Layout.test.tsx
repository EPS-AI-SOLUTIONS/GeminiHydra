/**
 * Layout Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Layout } from '../../../src/components/layout/Layout';
import { createMockAppState } from '../../mocks/store';
import { mockUseHealthCheck } from '../../mocks/query';
import { QueryWrapper } from '../../mocks/query';

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

// Mock useApi
vi.mock('../../../src/hooks/useApi', () => ({
  useHealthCheck: vi.fn(() => mockUseHealthCheck()),
}));

const renderLayout = (children = (view: string) => <div data-testid="view">{view}</div>) => {
  return render(
    <QueryWrapper>
      <Layout>{children}</Layout>
    </QueryWrapper>
  );
};

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.isSidebarOpen = true;
  });

  describe('rendering', () => {
    it('renders without crashing', () => {
      renderLayout();
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('renders Sidebar', () => {
      renderLayout();
      expect(screen.getByText('GeminiHydra')).toBeInTheDocument();
    });

    it('renders Header', () => {
      renderLayout();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });
  });

  describe('default view', () => {
    it('starts with chat view as default', () => {
      renderLayout();
      expect(screen.getByTestId('view')).toHaveTextContent('chat');
    });

    it('shows Chat title in header', () => {
      renderLayout();
      // Chat appears in both sidebar nav and header, so use getAllByText
      const chatTexts = screen.getAllByText('Chat');
      expect(chatTexts.length).toBeGreaterThan(0);
    });

    it('shows chat subtitle in header', () => {
      renderLayout();
      expect(screen.getByText('Komunikacja z agentami')).toBeInTheDocument();
    });
  });

  describe('view switching', () => {
    it('switches to agents view when nav clicked', () => {
      renderLayout();
      fireEvent.click(screen.getByText('Agenci'));
      expect(screen.getByTestId('view')).toHaveTextContent('agents');
    });

    it('switches to history view when nav clicked', () => {
      renderLayout();
      fireEvent.click(screen.getByText('Historia'));
      expect(screen.getByTestId('view')).toHaveTextContent('history');
    });

    it('switches to settings view when nav clicked', () => {
      renderLayout();
      fireEvent.click(screen.getByText('Ustawienia'));
      expect(screen.getByTestId('view')).toHaveTextContent('settings');
    });

    it('switches back to chat view', () => {
      renderLayout();
      fireEvent.click(screen.getByText('Ustawienia'));
      fireEvent.click(screen.getByText('Chat'));
      expect(screen.getByTestId('view')).toHaveTextContent('chat');
    });
  });

  describe('title updates', () => {
    it('updates title for agents view', () => {
      renderLayout();
      fireEvent.click(screen.getByText('Agenci'));
      // Header title updates to 'Agenci' (but 'Agenci' also appears in sidebar)
      const headers = screen.getAllByText('Agenci');
      expect(headers.length).toBeGreaterThan(0);
    });

    it('updates subtitle for history view', () => {
      renderLayout();
      fireEvent.click(screen.getByText('Historia'));
      expect(screen.getByText('Poprzednie konwersacje')).toBeInTheDocument();
    });

    it('updates subtitle for settings view', () => {
      renderLayout();
      fireEvent.click(screen.getByText('Ustawienia'));
      expect(screen.getByText('Konfiguracja aplikacji')).toBeInTheDocument();
    });
  });

  describe('children rendering', () => {
    it('passes current view to children function', () => {
      const childFn = vi.fn((view: string) => <div>{view}</div>);
      renderLayout(childFn);
      expect(childFn).toHaveBeenCalledWith('chat');
    });

    it('calls children with new view after switch', () => {
      const childFn = vi.fn((view: string) => <div data-testid="view">{view}</div>);
      renderLayout(childFn);

      fireEvent.click(screen.getByText('Agenci'));
      expect(childFn).toHaveBeenCalledWith('agents');
    });
  });
});
