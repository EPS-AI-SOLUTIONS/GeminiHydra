import { describe, it, expect, beforeEach } from 'vitest';
import { useClaudeStore } from './claudeStore';

describe('claudeStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useClaudeStore.setState({
      status: {
        is_active: false,
        pending_approval: false,
        auto_approve_all: false,
        approved_count: 0,
        denied_count: 0,
        auto_approved_count: 0,
      },
      isConnecting: false,
      outputLines: [],
      pendingApproval: null,
      history: [],
      rules: [],
      currentView: 'terminal',
    });
  });

  describe('initial state', () => {
    it('should have correct initial status', () => {
      const { status } = useClaudeStore.getState();
      expect(status.is_active).toBe(false);
      expect(status.pending_approval).toBe(false);
      expect(status.auto_approve_all).toBe(false);
    });

    it('should start with empty output lines', () => {
      const { outputLines } = useClaudeStore.getState();
      expect(outputLines).toHaveLength(0);
    });

    it('should have terminal as default view', () => {
      const { currentView } = useClaudeStore.getState();
      expect(currentView).toBe('terminal');
    });
  });

  describe('setStatus', () => {
    it('should update status correctly', () => {
      const { setStatus } = useClaudeStore.getState();

      setStatus({
        is_active: true,
        pending_approval: true,
        auto_approve_all: false,
        approved_count: 5,
        denied_count: 2,
        auto_approved_count: 3,
      });

      const { status } = useClaudeStore.getState();
      expect(status.is_active).toBe(true);
      expect(status.approved_count).toBe(5);
    });
  });

  describe('addOutputLine', () => {
    it('should add output line with generated id and timestamp', () => {
      const { addOutputLine } = useClaudeStore.getState();

      addOutputLine({
        type: 'output',
        content: 'Test message',
      });

      const { outputLines } = useClaudeStore.getState();
      expect(outputLines).toHaveLength(1);
      expect(outputLines[0].content).toBe('Test message');
      expect(outputLines[0].id).toBeDefined();
      expect(outputLines[0].timestamp).toBeInstanceOf(Date);
    });

    it('should keep only last 500 lines', () => {
      const { addOutputLine } = useClaudeStore.getState();

      // Add 510 lines
      for (let i = 0; i < 510; i++) {
        addOutputLine({
          type: 'output',
          content: `Line ${i}`,
        });
      }

      const { outputLines } = useClaudeStore.getState();
      expect(outputLines.length).toBeLessThanOrEqual(501);
    });
  });

  describe('clearOutput', () => {
    it('should clear all output lines', () => {
      const { addOutputLine, clearOutput } = useClaudeStore.getState();

      addOutputLine({ type: 'output', content: 'Test' });
      addOutputLine({ type: 'error', content: 'Error' });

      clearOutput();

      const { outputLines } = useClaudeStore.getState();
      expect(outputLines).toHaveLength(0);
    });
  });

  describe('setCurrentView', () => {
    it('should change view correctly', () => {
      const { setCurrentView } = useClaudeStore.getState();

      setCurrentView('settings');
      expect(useClaudeStore.getState().currentView).toBe('settings');

      setCurrentView('history');
      expect(useClaudeStore.getState().currentView).toBe('history');
    });
  });

  describe('setApiKey', () => {
    it('should update API key for specific provider', () => {
      const { setApiKey } = useClaudeStore.getState();

      setApiKey('anthropic', 'test-key-123');

      const { apiKeys } = useClaudeStore.getState();
      expect(apiKeys.anthropic).toBe('test-key-123');
    });

    it('should not affect other API keys', () => {
      const { setApiKey } = useClaudeStore.getState();

      setApiKey('anthropic', 'anthropic-key');
      setApiKey('openai', 'openai-key');

      const { apiKeys } = useClaudeStore.getState();
      expect(apiKeys.anthropic).toBe('anthropic-key');
      expect(apiKeys.openai).toBe('openai-key');
    });
  });

  describe('resetSession', () => {
    it('should reset session state', () => {
      const { setStatus, setConnecting, resetSession } = useClaudeStore.getState();

      setStatus({
        is_active: true,
        pending_approval: true,
        auto_approve_all: true,
        approved_count: 10,
        denied_count: 5,
        auto_approved_count: 3,
      });
      setConnecting(true);

      resetSession();

      const state = useClaudeStore.getState();
      expect(state.status.is_active).toBe(false);
      expect(state.status.approved_count).toBe(0);
      expect(state.isConnecting).toBe(false);
    });
  });

  describe('history management', () => {
    it('should add history entry', () => {
      const { addHistoryEntry } = useClaudeStore.getState();

      addHistoryEntry({
        id: 'test-1',
        timestamp: new Date().toISOString(),
        action: 'approved',
        approval_type: { type: 'bash_command', command: 'ls -la' },
        auto_approved: false,
      });

      const { history } = useClaudeStore.getState();
      expect(history).toHaveLength(1);
      expect(history[0].action).toBe('approved');
    });

    it('should keep only last 100 history entries', () => {
      const { addHistoryEntry } = useClaudeStore.getState();

      for (let i = 0; i < 110; i++) {
        addHistoryEntry({
          id: `test-${i}`,
          timestamp: new Date().toISOString(),
          action: 'approved',
          approval_type: { type: 'bash_command', command: `cmd ${i}` },
          auto_approved: false,
        });
      }

      const { history } = useClaudeStore.getState();
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });
});
