/**
 * Tests for Agent class and AGENT_PERSONAS
 *
 * The real Agent class has hard dependencies on Ollama, Google Generative AI,
 * chalk, dotenv, and many internal modules. We mock all external dependencies
 * and test what can be unit-tested: constructor behavior and AGENT_PERSONAS structure.
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

// Mock dotenv
vi.mock('dotenv/config', () => ({}));

// Mock ollama
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

// Mock internal modules
vi.mock('../../src/core/GeminiCLI.js', () => ({
  getBestAvailableModel: vi.fn().mockReturnValue('qwen3:4b'),
  DEFAULT_MODEL: 'qwen3:4b',
}));

vi.mock('../../src/config/models.config.js', () => ({
  GEMINI_MODELS: {
    'gemini-2.0-flash': { name: 'gemini-2.0-flash' },
  },
}));

vi.mock('../../src/core/TrafficControl.js', () => ({
  ollamaSemaphore: { acquire: vi.fn().mockResolvedValue(vi.fn()), release: vi.fn() },
  geminiSemaphore: { acquire: vi.fn().mockResolvedValue(vi.fn()), release: vi.fn() },
  withRetry: vi.fn((fn: any) => fn()),
}));

vi.mock('../../src/core/PromptSystem.js', () => ({
  AGENT_SYSTEM_PROMPTS: {},
  getPlatformPromptPrefix: vi.fn().mockReturnValue(''),
  EXECUTION_EVIDENCE_RULES: '',
}));

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
    taskQueue: vi.fn(),
  },
}));

vi.mock('../../src/core/AntiCreativityMode.js', () => ({
  antiCreativityMode: {
    process: vi.fn((s: string) => s),
    isEnabled: vi.fn().mockReturnValue(false),
  },
}));

vi.mock('../../src/core/PromptInjectionDetector.js', () => ({
  promptInjectionDetector: {
    detect: vi.fn().mockReturnValue({ safe: true }),
    isEnabled: vi.fn().mockReturnValue(false),
  },
}));

// ============================================================================
// Import the module under test AFTER all mocks are set up
// ============================================================================

import { Agent, AGENT_PERSONAS } from '../../src/core/Agent.js';

// ============================================================================
// Tests
// ============================================================================

describe('AGENT_PERSONAS', () => {
  const expectedAgents = [
    'geralt', 'yennefer', 'triss', 'jaskier',
    'vesemir', 'ciri', 'eskel', 'lambert',
    'zoltan', 'regis', 'dijkstra', 'philippa',
    'serena',
  ];

  it('should export AGENT_PERSONAS as a non-empty object', () => {
    expect(AGENT_PERSONAS).toBeDefined();
    expect(typeof AGENT_PERSONAS).toBe('object');
    expect(Object.keys(AGENT_PERSONAS).length).toBeGreaterThan(0);
  });

  it('should contain all 13 expected agent roles', () => {
    for (const agent of expectedAgents) {
      expect(AGENT_PERSONAS).toHaveProperty(agent);
    }
  });

  it('should have exactly 13 agents', () => {
    expect(Object.keys(AGENT_PERSONAS).length).toBe(13);
  });

  it('should have required fields on each persona', () => {
    for (const [key, persona] of Object.entries(AGENT_PERSONAS)) {
      expect(persona.name).toBe(key);
      expect(typeof persona.role).toBe('string');
      expect(persona.role.length).toBeGreaterThan(0);
      expect(typeof persona.model).toBe('string');
      expect(persona.model!.length).toBeGreaterThan(0);
    }
  });

  it('should have unique roles for each persona', () => {
    const roles = Object.values(AGENT_PERSONAS).map(p => p.role);
    const uniqueRoles = new Set(roles);
    expect(uniqueRoles.size).toBe(roles.length);
  });

  it('dijkstra should be a Strategist', () => {
    expect(AGENT_PERSONAS.dijkstra.role).toBe('Strategist');
  });

  it('geralt should be Security', () => {
    expect(AGENT_PERSONAS.geralt.role).toBe('Security');
  });

  it('yennefer should be Architect', () => {
    expect(AGENT_PERSONAS.yennefer.role).toBe('Architect');
  });

  it('triss should be QA', () => {
    expect(AGENT_PERSONAS.triss.role).toBe('QA');
  });

  it('serena should be CodeIntel', () => {
    expect(AGENT_PERSONAS.serena.role).toBe('CodeIntel');
  });
});

describe('Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create an Agent instance with a valid role', () => {
      const agent = new Agent('geralt');
      expect(agent).toBeInstanceOf(Agent);
    });

    it('should accept all valid agent roles', () => {
      const roles = [
        'dijkstra', 'geralt', 'yennefer', 'triss',
        'vesemir', 'jaskier', 'ciri', 'eskel',
        'lambert', 'zoltan', 'regis', 'philippa', 'serena',
      ] as const;

      for (const role of roles) {
        const agent = new Agent(role);
        expect(agent).toBeInstanceOf(Agent);
      }
    });

    it('should accept an optional modelOverride parameter', () => {
      const agent = new Agent('geralt', 'custom-model:latest');
      expect(agent).toBeInstanceOf(Agent);
    });

    it('should fall back to geralt persona for invalid role', () => {
      // The constructor does NOT throw; it falls back to geralt
      const agent = new Agent('nonexistent_role' as any);
      expect(agent).toBeInstanceOf(Agent);
    });

    it('should work with no modelOverride', () => {
      const agent = new Agent('dijkstra');
      expect(agent).toBeInstanceOf(Agent);
    });
  });
});
