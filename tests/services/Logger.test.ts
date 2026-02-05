/**
 * Tests for Logger Service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger, logger } from '../../src/services/Logger.js';

describe('Logger', () => {
  let testLogger: Logger;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testLogger = Logger.getInstance();
    testLogger.configure({ level: 'debug', headless: false, verbose: true });
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    stdoutSpy.mockRestore();
    testLogger.configure({ level: 'info', headless: false, verbose: false });
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('configure', () => {
    it('should configure log level', () => {
      testLogger.configure({ level: 'error' });
      testLogger.info('test');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should configure headless mode', () => {
      testLogger.configure({ headless: true });
      testLogger.info('test');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should configure verbose mode', () => {
      testLogger.configure({ verbose: false });
      testLogger.agentThinking('test');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('shouldLog', () => {
    it('should not log in headless mode except errors', () => {
      testLogger.configure({ headless: true });

      testLogger.info('info');
      testLogger.warn('warn');
      testLogger.debug('debug');

      // Only error should log
      expect(consoleSpy).not.toHaveBeenCalled();

      testLogger.error('error');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should respect log level hierarchy', () => {
      testLogger.configure({ level: 'warn', headless: false });

      testLogger.debug('debug');
      testLogger.info('info');
      expect(consoleSpy).not.toHaveBeenCalled();

      testLogger.warn('warn');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not log when level is silent', () => {
      testLogger.configure({ level: 'silent' });

      testLogger.debug('debug');
      testLogger.info('info');
      testLogger.warn('warn');
      testLogger.error('error');

      // Only taskFailed and agentError bypass shouldLog for errors
      expect(consoleSpy).toHaveBeenCalledTimes(1); // error logs directly
    });
  });

  describe('phase', () => {
    it('should log phase with message', () => {
      testLogger.phase('A', 'Planning');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      // PHASES['A'] = 'Phase A: Dijkstra Planning'
      expect(call).toContain('Dijkstra');
      expect(call).toContain('Planning');
    });

    it('should log phase without message', () => {
      testLogger.phase('B', undefined);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle custom phase names', () => {
      testLogger.phase('CUSTOM', 'Custom phase');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      expect(call).toContain('CUSTOM');
    });
  });

  describe('task', () => {
    it('should log task', () => {
      testLogger.task(1, 'geralt', 'Test task');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      expect(call).toContain('Task #1');
      expect(call).toContain('geralt');
      expect(call).toContain('Test task');
    });
  });

  describe('taskComplete', () => {
    it('should log completed task', () => {
      testLogger.taskComplete(1);
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      expect(call).toContain('Task #1');
      expect(call).toContain('Completed');
    });
  });

  describe('taskFailed', () => {
    it('should log failed task', () => {
      testLogger.taskFailed(1, 'Connection error');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      expect(call).toContain('Task #1');
      expect(call).toContain('Failed');
      expect(call).toContain('Connection error');
    });

    it('should log even in headless mode', () => {
      testLogger.configure({ headless: true });
      testLogger.taskFailed(1, 'Error');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('agentThinking', () => {
    it('should log when verbose', () => {
      testLogger.configure({ verbose: true });
      testLogger.agentThinking('geralt');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      expect(call).toContain('geralt');
      expect(call).toContain('Thinking');
    });

    it('should not log when not verbose', () => {
      testLogger.configure({ verbose: false });
      testLogger.agentThinking('geralt');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('agentDone', () => {
    it('should log with duration', () => {
      testLogger.configure({ verbose: true });
      testLogger.agentDone('geralt', 500, 1500);
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      expect(call).toContain('geralt');
      expect(call).toContain('Done');
      expect(call).toContain('500 chars');
      expect(call).toContain('1.5s');
    });

    it('should log without duration', () => {
      testLogger.configure({ verbose: true });
      testLogger.agentDone('geralt', 500);
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      expect(call).not.toContain('in ');
    });
  });

  describe('agentError', () => {
    it('should log agent error', () => {
      testLogger.agentError('geralt', 'Something went wrong');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      expect(call).toContain('geralt');
      expect(call).toContain('Error');
      expect(call).toContain('Something went wrong');
    });
  });

  describe('plan', () => {
    it('should log plan with task count', () => {
      testLogger.plan(5);
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      expect(call).toContain('Plan');
      expect(call).toContain('5 tasks');
    });
  });

  describe('planTask', () => {
    it('should log plan task', () => {
      testLogger.planTask(1, 'geralt', 'Test task description');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      expect(call).toContain('#1');
      expect(call).toContain('geralt');
      expect(call).toContain('Test task description');
    });
  });

  describe('debug', () => {
    it('should log debug message', () => {
      testLogger.configure({ level: 'debug' });
      testLogger.debug('Debug info');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      expect(call).toContain('[DEBUG]');
      expect(call).toContain('Debug info');
    });
  });

  describe('info', () => {
    it('should log info message', () => {
      testLogger.info('Info message');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('should log success message', () => {
      testLogger.success('Success!');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should always log error', () => {
      testLogger.configure({ level: 'silent' });
      testLogger.error('Error message');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should log warning', () => {
      testLogger.warn('Warning message');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('banner', () => {
    it('should log banner', () => {
      testLogger.banner('GEMINI HYDRA');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      expect(call).toContain('=');
    });
  });

  describe('separator', () => {
    it('should log separator', () => {
      testLogger.separator();
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      expect(call).toContain('-');
    });
  });

  describe('duration', () => {
    it('should log duration', () => {
      testLogger.duration(5.5);
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      expect(call).toContain('5.5s');
    });
  });

  describe('streamChunk', () => {
    it('should write to stdout', () => {
      testLogger.streamChunk('chunk');
      expect(stdoutSpy).toHaveBeenCalledWith('chunk');
    });

    it('should not write in headless mode', () => {
      testLogger.configure({ headless: true });
      testLogger.streamChunk('chunk');
      expect(stdoutSpy).not.toHaveBeenCalled();
    });
  });

  describe('singleton export', () => {
    it('should export logger instance', () => {
      expect(logger).toBeInstanceOf(Logger);
      expect(logger).toBe(Logger.getInstance());
    });
  });
});
