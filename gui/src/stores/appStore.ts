/**
 * Main Application Store - Zustand
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Agent, AgentRole, Message, Task, ExecutionPlan, Settings } from '../types';

// Agent definitions
const AGENTS: Record<AgentRole, Agent> = {
  geralt: { id: 'geralt', name: 'geralt', status: 'idle' },
  dijkstra: { id: 'dijkstra', name: 'dijkstra', status: 'idle' },
  yennefer: { id: 'yennefer', name: 'yennefer', status: 'idle' },
  regis: { id: 'regis', name: 'regis', status: 'idle' },
  triss: { id: 'triss', name: 'triss', status: 'idle' },
  vesemir: { id: 'vesemir', name: 'vesemir', status: 'idle' },
};

interface AppState {
  // Agents
  agents: Record<AgentRole, Agent>;
  setAgentStatus: (agent: AgentRole, status: Agent['status']) => void;

  // Messages
  messages: Message[];
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;

  // Current execution
  currentPlan: ExecutionPlan | null;
  setCurrentPlan: (plan: ExecutionPlan | null) => void;
  updateTask: (taskId: number, updates: Partial<Task>) => void;

  // Settings
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;

  // UI State
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  isStreaming: boolean;
  setIsStreaming: (streaming: boolean) => void;
}

const defaultSettings: Settings = {
  theme: 'dark',
  streaming: true,
  verbose: false,
  language: 'pl',
  model: 'gemini-3-pro-preview',
  temperature: 0.7,
  maxTokens: 8192,
};

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        // Agents
        agents: AGENTS,
        setAgentStatus: (agent, status) =>
          set((state) => ({
            agents: {
              ...state.agents,
              [agent]: { ...state.agents[agent], status },
            },
          })),

        // Messages
        messages: [],
        addMessage: (message) =>
          set((state) => ({
            messages: [
              ...state.messages,
              {
                ...message,
                id: crypto.randomUUID(),
                timestamp: new Date(),
              },
            ],
          })),
        clearMessages: () => set({ messages: [] }),

        // Current execution
        currentPlan: null,
        setCurrentPlan: (plan) => set({ currentPlan: plan }),
        updateTask: (taskId, updates) =>
          set((state) => {
            if (!state.currentPlan) return state;
            return {
              currentPlan: {
                ...state.currentPlan,
                tasks: state.currentPlan.tasks.map((task) =>
                  task.id === taskId ? { ...task, ...updates } : task
                ),
              },
            };
          }),

        // Settings
        settings: defaultSettings,
        updateSettings: (updates) =>
          set((state) => ({
            settings: { ...state.settings, ...updates },
          })),

        // UI State
        isSidebarOpen: true,
        toggleSidebar: () =>
          set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
        isStreaming: false,
        setIsStreaming: (streaming) => set({ isStreaming: streaming }),
      }),
      {
        name: 'gemini-hydra-store',
        partialize: (state) => ({
          settings: state.settings,
          isSidebarOpen: state.isSidebarOpen,
        }),
      }
    ),
    { name: 'GeminiHydra' }
  )
);
