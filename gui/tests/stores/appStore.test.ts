/**
 * AppStore (Zustand) Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../src/stores/appStore';

// Reset store before each test
beforeEach(() => {
  useAppStore.setState({
    agents: {
      geralt: { id: 'geralt', name: 'geralt', status: 'idle' },
      dijkstra: { id: 'dijkstra', name: 'dijkstra', status: 'idle' },
      yennefer: { id: 'yennefer', name: 'yennefer', status: 'idle' },
      regis: { id: 'regis', name: 'regis', status: 'idle' },
      triss: { id: 'triss', name: 'triss', status: 'idle' },
      vesemir: { id: 'vesemir', name: 'vesemir', status: 'idle' },
    },
    messages: [],
    currentPlan: null,
    settings: {
      theme: 'dark',
      streaming: true,
      verbose: false,
      language: 'pl',
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      maxTokens: 8192,
    },
    isSidebarOpen: true,
    isStreaming: false,
  });
});

describe('appStore', () => {
  describe('initial state', () => {
    it('has all agents with idle status', () => {
      const { agents } = useAppStore.getState();
      expect(Object.keys(agents)).toHaveLength(6);
      Object.values(agents).forEach(agent => {
        expect(agent.status).toBe('idle');
      });
    });

    it('has empty messages array', () => {
      const { messages } = useAppStore.getState();
      expect(messages).toEqual([]);
    });

    it('has default settings', () => {
      const { settings } = useAppStore.getState();
      expect(settings.theme).toBe('dark');
      expect(settings.streaming).toBe(true);
      expect(settings.model).toBe('gemini-2.5-flash');
    });

    it('has sidebar open by default', () => {
      const { isSidebarOpen } = useAppStore.getState();
      expect(isSidebarOpen).toBe(true);
    });

    it('is not streaming by default', () => {
      const { isStreaming } = useAppStore.getState();
      expect(isStreaming).toBe(false);
    });
  });

  describe('setAgentStatus', () => {
    it('updates agent status', () => {
      useAppStore.getState().setAgentStatus('geralt', 'thinking');
      const { agents } = useAppStore.getState();
      expect(agents.geralt.status).toBe('thinking');
    });

    it('does not affect other agents', () => {
      useAppStore.getState().setAgentStatus('geralt', 'thinking');
      const { agents } = useAppStore.getState();
      expect(agents.dijkstra.status).toBe('idle');
    });

    it('can set all status types', () => {
      const statuses = ['idle', 'thinking', 'done', 'error'] as const;
      statuses.forEach(status => {
        useAppStore.getState().setAgentStatus('geralt', status);
        expect(useAppStore.getState().agents.geralt.status).toBe(status);
      });
    });
  });

  describe('addMessage', () => {
    it('adds message with generated id and timestamp', () => {
      useAppStore.getState().addMessage({
        role: 'user',
        content: 'Hello',
      });

      const { messages } = useAppStore.getState();
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBeDefined();
      expect(messages[0].timestamp).toBeInstanceOf(Date);
      expect(messages[0].content).toBe('Hello');
    });

    it('adds multiple messages', () => {
      useAppStore.getState().addMessage({ role: 'user', content: 'Hello' });
      useAppStore.getState().addMessage({ role: 'assistant', content: 'Hi there' });

      const { messages } = useAppStore.getState();
      expect(messages).toHaveLength(2);
    });

    it('preserves message properties', () => {
      useAppStore.getState().addMessage({
        role: 'assistant',
        content: 'Response',
        agent: 'geralt',
        tokens: 150,
      });

      const { messages } = useAppStore.getState();
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].agent).toBe('geralt');
      expect(messages[0].tokens).toBe(150);
    });
  });

  describe('clearMessages', () => {
    it('removes all messages', () => {
      useAppStore.getState().addMessage({ role: 'user', content: 'Hello' });
      useAppStore.getState().addMessage({ role: 'assistant', content: 'Hi' });

      useAppStore.getState().clearMessages();

      const { messages } = useAppStore.getState();
      expect(messages).toEqual([]);
    });
  });

  describe('setCurrentPlan', () => {
    it('sets current plan', () => {
      const plan = {
        objective: 'Test objective',
        tasks: [],
        phase: 'A' as const,
        status: 'planning' as const,
      };

      useAppStore.getState().setCurrentPlan(plan);

      const { currentPlan } = useAppStore.getState();
      expect(currentPlan).toEqual(plan);
    });

    it('can set plan to null', () => {
      useAppStore.getState().setCurrentPlan({
        objective: 'Test',
        tasks: [],
        phase: 'A',
        status: 'planning',
      });
      useAppStore.getState().setCurrentPlan(null);

      const { currentPlan } = useAppStore.getState();
      expect(currentPlan).toBeNull();
    });
  });

  describe('updateTask', () => {
    it('updates task in current plan', () => {
      useAppStore.getState().setCurrentPlan({
        objective: 'Test',
        tasks: [
          { id: 1, agent: 'geralt', description: 'Task 1', status: 'pending' },
          { id: 2, agent: 'dijkstra', description: 'Task 2', status: 'pending' },
        ],
        phase: 'A',
        status: 'executing',
      });

      useAppStore.getState().updateTask(1, { status: 'completed', result: 'Done!' });

      const { currentPlan } = useAppStore.getState();
      expect(currentPlan?.tasks[0].status).toBe('completed');
      expect(currentPlan?.tasks[0].result).toBe('Done!');
    });

    it('does not affect other tasks', () => {
      useAppStore.getState().setCurrentPlan({
        objective: 'Test',
        tasks: [
          { id: 1, agent: 'geralt', description: 'Task 1', status: 'pending' },
          { id: 2, agent: 'dijkstra', description: 'Task 2', status: 'pending' },
        ],
        phase: 'A',
        status: 'executing',
      });

      useAppStore.getState().updateTask(1, { status: 'completed' });

      const { currentPlan } = useAppStore.getState();
      expect(currentPlan?.tasks[1].status).toBe('pending');
    });

    it('does nothing if no current plan', () => {
      useAppStore.getState().updateTask(1, { status: 'completed' });
      const { currentPlan } = useAppStore.getState();
      expect(currentPlan).toBeNull();
    });
  });

  describe('updateSettings', () => {
    it('merges new settings', () => {
      useAppStore.getState().updateSettings({ temperature: 0.9 });

      const { settings } = useAppStore.getState();
      expect(settings.temperature).toBe(0.9);
      expect(settings.streaming).toBe(true); // unchanged
    });

    it('can update multiple settings at once', () => {
      useAppStore.getState().updateSettings({
        streaming: false,
        verbose: true,
        maxTokens: 16384,
      });

      const { settings } = useAppStore.getState();
      expect(settings.streaming).toBe(false);
      expect(settings.verbose).toBe(true);
      expect(settings.maxTokens).toBe(16384);
    });
  });

  describe('toggleSidebar', () => {
    it('toggles sidebar from open to closed', () => {
      expect(useAppStore.getState().isSidebarOpen).toBe(true);
      useAppStore.getState().toggleSidebar();
      expect(useAppStore.getState().isSidebarOpen).toBe(false);
    });

    it('toggles sidebar from closed to open', () => {
      useAppStore.getState().toggleSidebar();
      useAppStore.getState().toggleSidebar();
      expect(useAppStore.getState().isSidebarOpen).toBe(true);
    });
  });

  describe('setIsStreaming', () => {
    it('sets streaming to true', () => {
      useAppStore.getState().setIsStreaming(true);
      expect(useAppStore.getState().isStreaming).toBe(true);
    });

    it('sets streaming to false', () => {
      useAppStore.getState().setIsStreaming(true);
      useAppStore.getState().setIsStreaming(false);
      expect(useAppStore.getState().isStreaming).toBe(false);
    });
  });
});
