/**
 * GeminiGUI - Tauri Service Tests
 * @module services/tauri.service.test
 *
 * Comprehensive test suite for the Tauri service layer.
 * Tests all service methods and their invoke calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BridgeService,
  ModelService,
  PromptService,
  SystemService,
  MemoryService,
  TauriService,
  type AgentMemory,
  type KnowledgeNode,
  type KnowledgeEdge,
} from './tauri.service';
import { TAURI_COMMANDS } from '../constants';
import type { BridgeState } from '../types';

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

const mockInvoke = invoke as ReturnType<typeof vi.fn>;

// ============================================================================
// BRIDGE SERVICE TESTS
// ============================================================================

describe('BridgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getState', () => {
    it('should call invoke with GET_BRIDGE_STATE command', async () => {
      const mockState: BridgeState = { auto_approve: false };
      mockInvoke.mockResolvedValueOnce(mockState);

      const result = await BridgeService.getState();

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.GET_BRIDGE_STATE);
      expect(result).toEqual(mockState);
    });

    it('should return BridgeState with auto_approve true', async () => {
      const mockState: BridgeState = { auto_approve: true };
      mockInvoke.mockResolvedValueOnce(mockState);

      const result = await BridgeService.getState();

      expect(result.auto_approve).toBe(true);
    });

    it('should handle invoke errors', async () => {
      const error = new Error('Tauri invoke failed');
      mockInvoke.mockRejectedValueOnce(error);

      await expect(BridgeService.getState()).rejects.toThrow(
        'Tauri invoke failed'
      );
    });
  });

  describe('setAutoApprove', () => {
    it('should call invoke with SET_AUTO_APPROVE command and enabled flag', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await BridgeService.setAutoApprove(true);

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.SET_AUTO_APPROVE, {
        enabled: true,
      });
    });

    it('should call invoke with enabled set to false', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await BridgeService.setAutoApprove(false);

      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.SET_AUTO_APPROVE, {
        enabled: false,
      });
    });
  });

  describe('approveRequest', () => {
    it('should call invoke with APPROVE_REQUEST command and requestId', async () => {
      const requestId = 'req-123';
      mockInvoke.mockResolvedValueOnce(undefined);

      await BridgeService.approveRequest(requestId);

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.APPROVE_REQUEST, {
        requestId,
      });
    });
  });

  describe('rejectRequest', () => {
    it('should call invoke with REJECT_REQUEST command and requestId', async () => {
      const requestId = 'req-456';
      mockInvoke.mockResolvedValueOnce(undefined);

      await BridgeService.rejectRequest(requestId);

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.REJECT_REQUEST, {
        requestId,
      });
    });
  });
});

// ============================================================================
// MODEL SERVICE TESTS
// ============================================================================

describe('ModelService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOllamaModels', () => {
    it('should call invoke with GET_OLLAMA_MODELS command', async () => {
      const mockModels = ['qwen3:4b', 'qwen3:1.7b'];
      mockInvoke.mockResolvedValueOnce(mockModels);

      const result = await ModelService.getOllamaModels();

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.GET_OLLAMA_MODELS);
      expect(result).toEqual(mockModels);
    });

    it('should return empty array when no models available', async () => {
      mockInvoke.mockResolvedValueOnce([]);

      const result = await ModelService.getOllamaModels();

      expect(result).toEqual([]);
    });
  });

  describe('getGeminiModels', () => {
    it('should call invoke with GET_GEMINI_MODELS command and apiKey', async () => {
      const apiKey = 'test-api-key-123';
      const mockModels = ['gemini-3-pro-preview', 'gemini-3-pro-preview'];
      mockInvoke.mockResolvedValueOnce(mockModels);

      const result = await ModelService.getGeminiModels(apiKey);

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.GET_GEMINI_MODELS, {
        apiKey,
      });
      expect(result).toEqual(mockModels);
    });

    it('should pass apiKey correctly to invoke', async () => {
      const apiKey = 'another-test-key';
      mockInvoke.mockResolvedValueOnce([]);

      await ModelService.getGeminiModels(apiKey);

      const callArgs = mockInvoke.mock.calls[0];
      expect(callArgs[1].apiKey).toBe(apiKey);
    });

    it('should handle invoke errors for invalid apiKey', async () => {
      const error = new Error('Invalid API key');
      mockInvoke.mockRejectedValueOnce(error);

      await expect(
        ModelService.getGeminiModels('invalid-key')
      ).rejects.toThrow('Invalid API key');
    });
  });

  describe('getGeminiModelsSorted', () => {
    it('should call invoke with GET_GEMINI_MODELS_SORTED command and apiKey', async () => {
      const apiKey = 'test-api-key-456';
      const mockModels = ['gemini-3-pro-preview', 'gemini-3-pro-preview'];
      mockInvoke.mockResolvedValueOnce(mockModels);

      const result = await ModelService.getGeminiModelsSorted(apiKey);

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(
        TAURI_COMMANDS.GET_GEMINI_MODELS_SORTED,
        { apiKey }
      );
      expect(result).toEqual(mockModels);
    });

    it('should return models sorted by capability', async () => {
      const mockModels = ['gemini-3-pro-preview', 'gemini-3-pro-preview'];
      mockInvoke.mockResolvedValueOnce(mockModels);

      const result = await ModelService.getGeminiModelsSorted('api-key');

      expect(result).toHaveLength(2);
      expect(result).toEqual(mockModels);
    });
  });
});

// ============================================================================
// PROMPT SERVICE TESTS
// ============================================================================

describe('PromptService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('promptOllama', () => {
    it('should call invoke with PROMPT_OLLAMA command and all parameters', async () => {
      const model = 'qwen3:4b';
      const prompt = 'Test prompt';
      const systemPrompt = 'You are a helpful assistant';
      mockInvoke.mockResolvedValueOnce('Response');

      const result = await PromptService.promptOllama(
        model,
        prompt,
        systemPrompt
      );

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.PROMPT_OLLAMA, {
        model,
        prompt,
        systemPrompt,
      });
      expect(result).toBe('Response');
    });

    it('should work without systemPrompt parameter', async () => {
      const model = 'qwen3:1.7b';
      const prompt = 'Another test';
      mockInvoke.mockResolvedValueOnce('Another response');

      const result = await PromptService.promptOllama(model, prompt);

      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.PROMPT_OLLAMA, {
        model,
        prompt,
        systemPrompt: undefined,
      });
      expect(result).toBe('Another response');
    });
  });

  describe('promptOllamaStream', () => {
    it('should call invoke with PROMPT_OLLAMA_STREAM command and all parameters', async () => {
      const model = 'qwen3:4b';
      const prompt = 'Write code';
      const systemPrompt = 'You are a code generator';
      mockInvoke.mockResolvedValueOnce(undefined);

      await PromptService.promptOllamaStream(model, prompt, systemPrompt);

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.PROMPT_OLLAMA_STREAM, {
        model,
        prompt,
        systemPrompt,
      });
    });

    it('should work without systemPrompt', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await PromptService.promptOllamaStream('qwen3:0.6b', 'Stream test');

      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.PROMPT_OLLAMA_STREAM, {
        model: 'qwen3:0.6b',
        prompt: 'Stream test',
        systemPrompt: undefined,
      });
    });
  });

  describe('promptGeminiStream', () => {
    it('should call invoke with PROMPT_GEMINI_STREAM command and all parameters', async () => {
      const model = 'gemini-3-pro-preview';
      const prompt = 'Test prompt';
      const apiKey = 'test-key-789';
      const systemPrompt = 'You are Jaskier';
      const imageBase64 = 'base64-encoded-image';
      mockInvoke.mockResolvedValueOnce(undefined);

      await PromptService.promptGeminiStream(
        model,
        prompt,
        apiKey,
        systemPrompt,
        imageBase64
      );

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(
        TAURI_COMMANDS.PROMPT_GEMINI_STREAM,
        {
          model,
          prompt,
          apiKey,
          systemPrompt,
          imageBase64,
        }
      );
    });

    it('should pass apiKey correctly to invoke', async () => {
      const apiKey = 'critical-api-key';
      mockInvoke.mockResolvedValueOnce(undefined);

      await PromptService.promptGeminiStream(
        'gemini-3-pro-preview',
        'prompt',
        apiKey
      );

      const callArgs = mockInvoke.mock.calls[0];
      expect(callArgs[1].apiKey).toBe(apiKey);
    });

    it('should handle optional systemPrompt and imageBase64', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await PromptService.promptGeminiStream(
        'gemini-3-pro-preview',
        'Simple prompt',
        'api-key'
      );

      const callArgs = mockInvoke.mock.calls[0];
      expect(callArgs[1].systemPrompt).toBeUndefined();
      expect(callArgs[1].imageBase64).toBeUndefined();
    });

    it('should handle invoke errors for invalid API key', async () => {
      const error = new Error('Unauthorized');
      mockInvoke.mockRejectedValueOnce(error);

      await expect(
        PromptService.promptGeminiStream(
          'gemini-3-pro-preview',
          'prompt',
          'invalid-key'
        )
      ).rejects.toThrow('Unauthorized');
    });
  });
});

// ============================================================================
// SYSTEM SERVICE TESTS
// ============================================================================

describe('SystemService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runCommand', () => {
    it('should call invoke with RUN_SYSTEM_COMMAND and command parameter', async () => {
      const command = 'echo "Hello World"';
      mockInvoke.mockResolvedValueOnce('Hello World');

      const result = await SystemService.runCommand(command);

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.RUN_SYSTEM_COMMAND, {
        command,
      });
      expect(result).toBe('Hello World');
    });

    it('should pass command correctly to invoke', async () => {
      const command = 'ls -la';
      mockInvoke.mockResolvedValueOnce('files...');

      await SystemService.runCommand(command);

      const callArgs = mockInvoke.mock.calls[0];
      expect(callArgs[1].command).toBe(command);
    });

    it('should handle complex commands', async () => {
      const command = 'wmic logicaldisk get size,freespace,caption';
      mockInvoke.mockResolvedValueOnce('Disk info');

      const result = await SystemService.runCommand(command);

      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.RUN_SYSTEM_COMMAND, {
        command,
      });
      expect(result).toBe('Disk info');
    });

    it('should handle invoke errors', async () => {
      const error = new Error('Command execution failed');
      mockInvoke.mockRejectedValueOnce(error);

      await expect(
        SystemService.runCommand('invalid-command')
      ).rejects.toThrow('Command execution failed');
    });
  });

  describe('spawnSwarmAgent', () => {
    it('should call invoke with SPAWN_SWARM_AGENT command and objective', async () => {
      const objective = 'Review code for security issues';
      mockInvoke.mockResolvedValueOnce(undefined);

      await SystemService.spawnSwarmAgent(objective);

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.SPAWN_SWARM_AGENT, {
        objective,
      });
    });
  });

  describe('saveFileContent', () => {
    it('should call invoke with SAVE_FILE_CONTENT command', async () => {
      const path = '/tmp/test.txt';
      const content = 'File content';
      mockInvoke.mockResolvedValueOnce(undefined);

      await SystemService.saveFileContent(path, content);

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.SAVE_FILE_CONTENT, {
        path,
        content,
      });
    });
  });

  describe('getEnvVars', () => {
    it('should call invoke with GET_ENV_VARS command', async () => {
      const mockEnvVars = {
        GEMINI_API_KEY: 'key123',
        OLLAMA_HOST: 'http://localhost:11434',
      };
      mockInvoke.mockResolvedValueOnce(mockEnvVars);

      const result = await SystemService.getEnvVars();

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.GET_ENV_VARS);
      expect(result).toEqual(mockEnvVars);
    });
  });

  describe('startOllamaServer', () => {
    it('should call invoke with START_OLLAMA_SERVER command', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await SystemService.startOllamaServer();

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.START_OLLAMA_SERVER);
    });
  });
});

// ============================================================================
// MEMORY SERVICE TESTS
// ============================================================================

describe('MemoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAgentMemories', () => {
    it('should call invoke with GET_AGENT_MEMORIES command and agentName', async () => {
      const agentName = 'Geralt';
      const mockMemories: AgentMemory[] = [
        {
          id: '1',
          agentName: 'Geralt',
          content: 'Memory 1',
          timestamp: Date.now(),
        },
      ];
      mockInvoke.mockResolvedValueOnce(mockMemories);

      const result = await MemoryService.getAgentMemories(agentName);

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.GET_AGENT_MEMORIES, {
        agentName,
      });
      expect(result).toEqual(mockMemories);
    });

    it('should pass agentName correctly to invoke', async () => {
      const agentName = 'Yennefer';
      mockInvoke.mockResolvedValueOnce([]);

      await MemoryService.getAgentMemories(agentName);

      const callArgs = mockInvoke.mock.calls[0];
      expect(callArgs[1].agentName).toBe(agentName);
    });

    it('should return empty array when no memories exist', async () => {
      mockInvoke.mockResolvedValueOnce([]);

      const result = await MemoryService.getAgentMemories('Ciri');

      expect(result).toEqual([]);
    });

    it('should handle memories with metadata', async () => {
      const mockMemories: AgentMemory[] = [
        {
          id: '1',
          agentName: 'Triss',
          content: 'Test memory',
          timestamp: Date.now(),
          metadata: { tags: ['important', 'security'] },
        },
      ];
      mockInvoke.mockResolvedValueOnce(mockMemories);

      const result = await MemoryService.getAgentMemories('Triss');

      expect(result[0].metadata).toEqual({ tags: ['important', 'security'] });
    });
  });

  describe('addAgentMemory', () => {
    it('should call invoke with ADD_AGENT_MEMORY command and all parameters', async () => {
      const agentName = 'Lambert';
      const content = 'New memory';
      const metadata = { priority: 'high' };
      mockInvoke.mockResolvedValueOnce(undefined);

      await MemoryService.addAgentMemory(agentName, content, metadata);

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.ADD_AGENT_MEMORY, {
        agentName,
        content,
        metadata,
      });
    });

    it('should work without metadata parameter', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await MemoryService.addAgentMemory('Eskel', 'Memory without meta');

      const callArgs = mockInvoke.mock.calls[0];
      expect(callArgs[1].metadata).toBeUndefined();
    });
  });

  describe('clearAgentMemories', () => {
    it('should call invoke with CLEAR_AGENT_MEMORIES command and agentName', async () => {
      const agentName = 'Zoltan';
      mockInvoke.mockResolvedValueOnce(undefined);

      await MemoryService.clearAgentMemories(agentName);

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(
        TAURI_COMMANDS.CLEAR_AGENT_MEMORIES,
        { agentName }
      );
    });
  });

  describe('getKnowledgeGraph', () => {
    it('should call invoke with GET_KNOWLEDGE_GRAPH command', async () => {
      const mockGraph = {
        nodes: [
          { id: '1', label: 'Node 1', type: 'concept' },
        ],
        edges: [
          { source: '1', target: '2', label: 'relates_to' },
        ],
      };
      mockInvoke.mockResolvedValueOnce(mockGraph);

      const result = await MemoryService.getKnowledgeGraph();

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.GET_KNOWLEDGE_GRAPH);
      expect(result).toEqual(mockGraph);
    });
  });

  describe('addKnowledgeNode', () => {
    it('should call invoke with ADD_KNOWLEDGE_NODE command', async () => {
      const node: KnowledgeNode = {
        id: 'node-1',
        label: 'Test Node',
        type: 'concept',
        data: { value: 'test' },
      };
      mockInvoke.mockResolvedValueOnce(undefined);

      await MemoryService.addKnowledgeNode(node);

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.ADD_KNOWLEDGE_NODE, {
        node,
      });
    });
  });

  describe('addKnowledgeEdge', () => {
    it('should call invoke with ADD_KNOWLEDGE_EDGE command', async () => {
      const edge: KnowledgeEdge = {
        source: 'node-1',
        target: 'node-2',
        label: 'connects_to',
      };
      mockInvoke.mockResolvedValueOnce(undefined);

      await MemoryService.addKnowledgeEdge(edge);

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith(TAURI_COMMANDS.ADD_KNOWLEDGE_EDGE, {
        edge,
      });
    });
  });
});

// ============================================================================
// UNIFIED TAURI SERVICE TESTS
// ============================================================================

describe('TauriService', () => {
  it('should provide access to all service modules', () => {
    expect(TauriService.bridge).toBeDefined();
    expect(TauriService.models).toBeDefined();
    expect(TauriService.prompts).toBeDefined();
    expect(TauriService.system).toBeDefined();
    expect(TauriService.memory).toBeDefined();
  });

  it('should expose BridgeService methods', () => {
    expect(TauriService.bridge.getState).toBeDefined();
    expect(TauriService.bridge.setAutoApprove).toBeDefined();
    expect(TauriService.bridge.approveRequest).toBeDefined();
    expect(TauriService.bridge.rejectRequest).toBeDefined();
  });

  it('should expose ModelService methods', () => {
    expect(TauriService.models.getOllamaModels).toBeDefined();
    expect(TauriService.models.getGeminiModels).toBeDefined();
    expect(TauriService.models.getGeminiModelsSorted).toBeDefined();
  });

  it('should expose PromptService methods', () => {
    expect(TauriService.prompts.promptOllama).toBeDefined();
    expect(TauriService.prompts.promptOllamaStream).toBeDefined();
    expect(TauriService.prompts.promptGeminiStream).toBeDefined();
  });

  it('should expose SystemService methods', () => {
    expect(TauriService.system.runCommand).toBeDefined();
    expect(TauriService.system.spawnSwarmAgent).toBeDefined();
    expect(TauriService.system.saveFileContent).toBeDefined();
    expect(TauriService.system.getEnvVars).toBeDefined();
    expect(TauriService.system.startOllamaServer).toBeDefined();
  });

  it('should expose MemoryService methods', () => {
    expect(TauriService.memory.getAgentMemories).toBeDefined();
    expect(TauriService.memory.addAgentMemory).toBeDefined();
    expect(TauriService.memory.clearAgentMemories).toBeDefined();
    expect(TauriService.memory.getKnowledgeGraph).toBeDefined();
    expect(TauriService.memory.addKnowledgeNode).toBeDefined();
    expect(TauriService.memory.addKnowledgeEdge).toBeDefined();
  });
});
