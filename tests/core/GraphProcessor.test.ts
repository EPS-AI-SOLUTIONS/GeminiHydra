/**
 * Tests for GraphProcessor
 *
 * The real GraphProcessor has heavy dependencies on Agent, TrafficControl,
 * PromptSystem, MCP, SecuritySystem, NativeFileSystem, LiveLogger, ora,
 * chalk, p-limit, fs, child_process, and more.
 *
 * We mock all external dependencies and test the constructor, configuration
 * defaults, and basic structure.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// Mock ALL external dependencies BEFORE importing the module under test
// ============================================================================

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    yellow: vi.fn((s: string) => s),
    green: vi.fn((s: string) => s),
    red: vi.fn((s: string) => s),
    blue: vi.fn((s: string) => s),
    gray: vi.fn((s: string) => s),
    dim: vi.fn((s: string) => s),
    bold: vi.fn((s: string) => s),
    cyan: vi.fn((s: string) => s),
    magenta: vi.fn((s: string) => s),
    white: vi.fn((s: string) => s),
  },
}));

// Mock dotenv (might be pulled in transitively)
vi.mock('dotenv/config', () => ({}));

// Mock ora (spinner)
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

// Mock p-limit
vi.mock('p-limit', () => ({
  default: vi.fn((_n: number) => (fn: any) => fn()),
}));

// Mock Agent module
vi.mock('../../src/core/Agent.js', () => ({
  Agent: vi.fn().mockImplementation(() => ({
    think: vi.fn().mockResolvedValue('Mocked agent response'),
  })),
  AGENT_PERSONAS: {
    geralt: { name: 'geralt', role: 'Security', model: 'qwen3:4b', description: 'Security' },
    dijkstra: { name: 'dijkstra', role: 'Strategist', model: 'gemini-cloud', description: 'Strategist' },
    yennefer: { name: 'yennefer', role: 'Architect', model: 'qwen3:4b', description: 'Architect' },
    triss: { name: 'triss', role: 'QA', model: 'qwen3:4b', description: 'QA' },
    vesemir: { name: 'vesemir', role: 'Mentor', model: 'qwen3:4b', description: 'Mentor' },
  },
}));

// Mock TrafficControl
vi.mock('../../src/core/TrafficControl.js', () => ({
  ollamaSemaphore: { acquire: vi.fn().mockResolvedValue(vi.fn()), release: vi.fn() },
  geminiSemaphore: { acquire: vi.fn().mockResolvedValue(vi.fn()), release: vi.fn() },
  withRetry: vi.fn((fn: any) => fn()),
}));

// Mock PromptSystem
vi.mock('../../src/core/PromptSystem.js', () => ({
  getPlatformPromptPrefix: vi.fn().mockReturnValue(''),
  loadGrimoires: vi.fn().mockReturnValue(''),
  getFewShotExamples: vi.fn().mockReturnValue(''),
  mapTaskTypeToExampleCategory: vi.fn().mockReturnValue('general'),
  getEnhancedFewShotExamples: vi.fn().mockReturnValue(''),
  getAgentSpecificExamples: vi.fn().mockReturnValue(''),
  AGENT_SYSTEM_PROMPTS: {},
  EXECUTION_EVIDENCE_RULES: '',
}));

// Mock MCP
vi.mock('../../src/mcp/index.js', () => ({
  mcpManager: { executeTool: vi.fn(), getAvailableTools: vi.fn().mockReturnValue([]) },
}));

// Mock SecuritySystem
vi.mock('../../src/core/SecuritySystem.js', () => ({
  sanitizer: {
    sanitize: vi.fn((s: string) => s),
    sanitizePath: vi.fn((s: string) => ({ sanitized: s, warnings: [], blocked: false })),
    sanitizeInput: vi.fn((s: string) => ({ sanitized: s, warnings: [], blocked: false })),
  },
}));

// Mock NativeFileSystem
vi.mock('../../src/native/NativeFileSystem.js', () => ({
  NativeFileSystem: vi.fn().mockImplementation(() => ({
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
  })),
}));

// Mock LiveLogger
vi.mock('../../src/core/LiveLogger.js', () => ({
  logger: {
    task: vi.fn(),
    taskComplete: vi.fn(),
    taskFailed: vi.fn(),
    agentThinking: vi.fn(),
    agentDone: vi.fn(),
    agentError: vi.fn(),
    system: vi.fn(),
    phaseStart: vi.fn(),
    phaseEnd: vi.fn(),
    taskQueue: vi.fn(),
    progress: vi.fn(),
  },
}));

// Mock AgentMemoryIsolation
vi.mock('../../src/core/AgentMemoryIsolation.js', () => ({
  getAgentMemoryIsolation: vi.fn().mockReturnValue({
    getContext: vi.fn().mockReturnValue(''),
    addResult: vi.fn(),
  }),
}));

// Mock FactualGrounding
vi.mock('../../src/core/FactualGrounding.js', () => ({
  factualGroundingChecker: {
    check: vi.fn().mockResolvedValue({ valid: true, warnings: [] }),
  },
}));

// Mock ollama (transitive dependency via Agent)
vi.mock('ollama', () => ({
  default: {
    chat: vi.fn().mockResolvedValue({ message: { content: 'mocked' } }),
    list: vi.fn().mockResolvedValue({ models: [] }),
  },
}));

// Mock @google/generative-ai (must be a real class for `new` to work at module level)
vi.mock('@google/generative-ai', () => {
  class MockGoogleGenerativeAI {
    constructor(_apiKey: string) {}
    getGenerativeModel() {
      return {
        generateContent: vi.fn().mockResolvedValue({
          response: { text: () => 'mocked' },
        }),
        generateContentStream: vi.fn().mockResolvedValue({
          stream: (async function* () { yield { text: () => 'mocked' }; })(),
        }),
      };
    }
  }
  return { GoogleGenerativeAI: MockGoogleGenerativeAI };
});

// Mock GeminiCLI (transitive dependency via Agent)
vi.mock('../../src/core/GeminiCLI.js', () => ({
  getBestAvailableModel: vi.fn().mockReturnValue('qwen3:4b'),
  DEFAULT_MODEL: 'qwen3:4b',
}));

// Mock models config (transitive dependency)
vi.mock('../../src/config/models.config.js', () => ({
  GEMINI_MODELS: {},
}));

// Mock AntiCreativityMode (transitive dependency via Agent)
vi.mock('../../src/core/AntiCreativityMode.js', () => ({
  antiCreativityMode: {
    process: vi.fn((s: string) => s),
    isEnabled: vi.fn().mockReturnValue(false),
  },
}));

// Mock PromptInjectionDetector (transitive dependency via Agent)
vi.mock('../../src/core/PromptInjectionDetector.js', () => ({
  promptInjectionDetector: {
    detect: vi.fn().mockReturnValue({ safe: true }),
    isEnabled: vi.fn().mockReturnValue(false),
  },
}));

// ============================================================================
// Import the module under test AFTER all mocks are set up
// ============================================================================

import { GraphProcessor } from '../../src/core/GraphProcessor.js';
import type { GraphProcessorConfig } from '../../src/core/GraphProcessor.js';

// ============================================================================
// Tests
// ============================================================================

describe('GraphProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a GraphProcessor instance with default config', () => {
      const processor = new GraphProcessor();
      expect(processor).toBeInstanceOf(GraphProcessor);
    });

    it('should create a GraphProcessor instance with custom config', () => {
      const config: GraphProcessorConfig = {
        yolo: true,
        maxConcurrency: 4,
        taskTimeout: 60000,
        maxRetries: 1,
      };
      const processor = new GraphProcessor(config);
      expect(processor).toBeInstanceOf(GraphProcessor);
    });

    it('should accept an empty config object', () => {
      const processor = new GraphProcessor({});
      expect(processor).toBeInstanceOf(GraphProcessor);
    });

    it('should accept yolo mode config', () => {
      const processor = new GraphProcessor({ yolo: true });
      expect(processor).toBeInstanceOf(GraphProcessor);
    });

    it('should accept forceOllama config', () => {
      const processor = new GraphProcessor({ forceOllama: true, ollamaModel: 'qwen3:4b' });
      expect(processor).toBeInstanceOf(GraphProcessor);
    });

    it('should accept rootDir config', () => {
      const processor = new GraphProcessor({ rootDir: '/tmp/test' });
      expect(processor).toBeInstanceOf(GraphProcessor);
    });
  });

  describe('process', () => {
    it('should have a process method', () => {
      const processor = new GraphProcessor();
      expect(typeof processor.process).toBe('function');
    });

    it('should return an array when given empty task list', async () => {
      const processor = new GraphProcessor();
      const results = await processor.process([]);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  describe('exports', () => {
    it('should export GraphProcessor class', () => {
      expect(GraphProcessor).toBeDefined();
      expect(typeof GraphProcessor).toBe('function');
    });
  });
});
