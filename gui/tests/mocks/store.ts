/**
 * Zustand Store Mock Utilities
 */

import { vi } from 'vitest';
import type { Agent, AgentRole, Message, ExecutionPlan, Settings } from '../../src/types';

export interface MockAppState {
  // Agents
  agents: Record<AgentRole, Agent>;
  setAgentStatus: ReturnType<typeof vi.fn>;

  // Messages
  messages: Message[];
  addMessage: ReturnType<typeof vi.fn>;
  clearMessages: ReturnType<typeof vi.fn>;

  // Execution
  currentPlan: ExecutionPlan | null;
  setCurrentPlan: ReturnType<typeof vi.fn>;
  updateTask: ReturnType<typeof vi.fn>;

  // Settings
  settings: Settings;
  updateSettings: ReturnType<typeof vi.fn>;

  // UI State
  isSidebarOpen: boolean;
  toggleSidebar: ReturnType<typeof vi.fn>;
  isStreaming: boolean;
  setIsStreaming: ReturnType<typeof vi.fn>;
}

export const createMockAppState = (overrides: Partial<MockAppState> = {}): MockAppState => ({
  // Agents
  agents: {
    geralt: { id: 'geralt', name: 'geralt', status: 'idle' },
    dijkstra: { id: 'dijkstra', name: 'dijkstra', status: 'idle' },
    yennefer: { id: 'yennefer', name: 'yennefer', status: 'idle' },
    regis: { id: 'regis', name: 'regis', status: 'idle' },
    triss: { id: 'triss', name: 'triss', status: 'idle' },
    vesemir: { id: 'vesemir', name: 'vesemir', status: 'idle' },
  },
  setAgentStatus: vi.fn(),

  // Messages
  messages: [],
  addMessage: vi.fn(),
  clearMessages: vi.fn(),

  // Execution
  currentPlan: null,
  setCurrentPlan: vi.fn(),
  updateTask: vi.fn(),

  // Settings
  settings: {
    theme: 'dark',
    streaming: true,
    verbose: false,
    language: 'pl',
    model: 'gemini-3-pro-preview',
    temperature: 0.7,
    maxTokens: 8192,
  },
  updateSettings: vi.fn(),

  // UI State
  isSidebarOpen: true,
  toggleSidebar: vi.fn(),
  isStreaming: false,
  setIsStreaming: vi.fn(),

  ...overrides,
});

// Create mock store selector
export const createMockUseAppStore = (overrides: Partial<MockAppState> = {}) => {
  const state = createMockAppState(overrides);
  return vi.fn((selector?: (state: MockAppState) => unknown) => {
    if (selector) {
      return selector(state);
    }
    return state;
  });
};
