/**
 * GeminiHydra - Swarm Integration Tests
 * Tests for the Swarm orchestrator with mocked providers
 */

import { test, expect } from '@playwright/test';

// These tests are designed to run with the actual codebase
// They test integration between components

test.describe('Swarm Module Integration', () => {
  test('should import Swarm module without errors', async () => {
    // Dynamic import to test module loading
    const module = await import('../src/core/Swarm.js');

    expect(module.Swarm).toBeDefined();
    expect(module.createSwarm).toBeDefined();
    expect(typeof module.Swarm).toBe('function');
    expect(typeof module.createSwarm).toBe('function');
  });

  test('should import Agent module without errors', async () => {
    const module = await import('../src/core/Agent.js');

    expect(module.Agent).toBeDefined();
    expect(typeof module.Agent).toBe('function');
  });

  test('should import GraphProcessor module without errors', async () => {
    const module = await import('../src/core/GraphProcessor.js');

    expect(module.GraphProcessor).toBeDefined();
    expect(typeof module.GraphProcessor).toBe('function');
  });
});

test.describe('Provider Module Integration', () => {
  test('should import McpLlamaProvider without errors', async () => {
    const module = await import('../src/providers/McpLlamaProvider.js');

    expect(module.McpLlamaProvider).toBeDefined();
    expect(module.createMcpLlamaProvider).toBeDefined();
    expect(module.createMcpLlamaProviders).toBeDefined();
    expect(module.setMcpToolCaller).toBeDefined();
    expect(module.getMcpToolCaller).toBeDefined();
  });

  test('should import LlamaCppProvider without errors', async () => {
    const module = await import('../src/providers/LlamaCppProvider.js');

    expect(module.LlamaCppProvider).toBeDefined();
    expect(module.createLlamaCppProvider).toBeDefined();
    expect(module.LLAMA_CPP_MODELS).toBeDefined();
  });
});

test.describe('Service Module Integration', () => {
  test('should import PlanningService without errors', async () => {
    const module = await import('../src/services/PlanningService.js');

    expect(module.PlanningService).toBeDefined();
    expect(module.planningService).toBeDefined();
  });

  test('should import SynthesisService without errors', async () => {
    const module = await import('../src/services/SynthesisService.js');

    expect(module.SynthesisService).toBeDefined();
    expect(module.synthesisService).toBeDefined();
  });

  test('should import HealingService without errors', async () => {
    const module = await import('../src/services/HealingService.js');

    expect(module.HealingService).toBeDefined();
    expect(module.getHealingService).toBeDefined();
  });

  test('should import RefinementService without errors', async () => {
    const module = await import('../src/services/RefinementService.js');

    expect(module.RefinementService).toBeDefined();
    expect(module.getRefinementService).toBeDefined();
  });

  test('should import Logger without errors', async () => {
    const module = await import('../src/services/Logger.js');

    expect(module.Logger).toBeDefined();
    expect(module.logger).toBeDefined();
  });
});

test.describe('Config Module Integration', () => {
  test('should import agents config without errors', async () => {
    const module = await import('../src/config/agents.js');

    expect(module.AGENT_PERSONAS).toBeDefined();
    expect(module.getAgentPersona).toBeDefined();
    expect(module.resolveAgentRole).toBeDefined();
  });

  test('should import constants without errors', async () => {
    const module = await import('../src/config/constants.js');

    expect(module.MAX_TASKS).toBeDefined();
    expect(module.PHASES).toBeDefined();
    expect(module.PIPELINE_MODELS).toBeDefined();
  });
});

test.describe('Core Error Module Integration', () => {
  test('should import all error classes', async () => {
    const module = await import('../src/core/errors.js');

    expect(module.HydraError).toBeDefined();
    expect(module.ProviderError).toBeDefined();
    expect(module.NetworkError).toBeDefined();
    expect(module.TimeoutError).toBeDefined();
    expect(module.ConfigurationError).toBeDefined();
    expect(module.ValidationError).toBeDefined();
  });

  test('should import error utility functions', async () => {
    const module = await import('../src/core/errors.js');

    expect(module.normalizeError).toBeDefined();
    expect(module.isRetryable).toBeDefined();
    expect(module.isRecoverable).toBeDefined();
    expect(module.getErrorCode).toBeDefined();
  });
});

test.describe('Utils Module Integration', () => {
  test('should import string utilities', async () => {
    const module = await import('../src/utils/strings.js');

    expect(module.truncate).toBeDefined();
    expect(module.truncateObjective).toBeDefined();
    expect(module.truncateTask).toBeDefined();
  });

  test('should import task sorter utilities', async () => {
    const module = await import('../src/utils/taskSorter.js');

    expect(module.topologicalSort).toBeDefined();
    expect(module.validateDependencies).toBeDefined();
    expect(module.hasCircularDependency).toBeDefined();
  });
});

test.describe('Main Index Integration', () => {
  test('should export all public APIs from main index', async () => {
    const module = await import('../src/index.js');

    // Core exports
    expect(module.Swarm).toBeDefined();
    expect(module.Agent).toBeDefined();
    expect(module.GraphProcessor).toBeDefined();

    // Error exports
    expect(module.HydraError).toBeDefined();

    // Provider exports
    expect(module.McpLlamaProvider).toBeDefined();
  });
});
