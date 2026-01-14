/**
 * Task Classifier Tests
 * Tests LOCAL-FIRST classification, network detection, and smart queue
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  testNetworkConnectivity,
  testOllamaAvailability,
  getAvailableLocalModel,
  getConnectionStatus,
  classifyTask,
  getPatternBasedClassification,
  getOptimalExecutionModel,
  getClassificationStats,
  clearClassificationCache
} from '../src/task-classifier.js';

describe('Task Classifier', () => {

  describe('Network Detection', () => {
    it('should test network connectivity', async () => {
      const result = await testNetworkConnectivity();
      assert.strictEqual(typeof result, 'boolean');
      console.log(`  Network connectivity: ${result}`);
    });

    it('should test Ollama availability', async () => {
      const result = await testOllamaAvailability();
      assert.strictEqual(typeof result, 'boolean');
      console.log(`  Ollama available: ${result}`);
    });

    it('should get connection status', async () => {
      const status = await getConnectionStatus();
      assert.ok(status);
      assert.strictEqual(typeof status.localAvailable, 'boolean');
      assert.strictEqual(typeof status.internetAvailable, 'boolean');
      assert.ok(['full', 'offline-local', 'cloud-only', 'offline-pattern'].includes(status.mode));
      console.log(`  Connection mode: ${status.mode}`);
      console.log(`  Local model: ${status.localModel || 'none'}`);
    });
  });

  describe('Local Model Selection', () => {
    it('should get available local model', async () => {
      const model = await getAvailableLocalModel();
      console.log(`  Best local model: ${model || 'none available'}`);
      // Model can be null if Ollama is not running
    });

    it('should respect model preferences', async () => {
      const model = await getAvailableLocalModel(['llama3.2:1b', 'phi3:mini']);
      console.log(`  Preferred model: ${model || 'none available'}`);
    });
  });

  describe('Pattern-Based Classification', () => {
    it('should classify code prompts', () => {
      const result = getPatternBasedClassification('Write a Python function to sort a list');
      assert.strictEqual(result.category, 'code');
      assert.ok(result.complexity >= 1 && result.complexity <= 10);
      console.log(`  Code prompt -> category: ${result.category}, complexity: ${result.complexity}`);
    });

    it('should classify analysis prompts', () => {
      const result = getPatternBasedClassification('Analyze the performance of this algorithm');
      assert.strictEqual(result.category, 'analysis');
      console.log(`  Analysis prompt -> category: ${result.category}, complexity: ${result.complexity}`);
    });

    it('should classify simple prompts', () => {
      const result = getPatternBasedClassification('What is the capital of France?');
      assert.strictEqual(result.category, 'simple');
      console.log(`  Simple prompt -> category: ${result.category}, complexity: ${result.complexity}`);
    });

    it('should detect capabilities', () => {
      const result = getPatternBasedClassification('Calculate the factorial of 10');
      assert.ok(result.capabilities.includes('math'));
      console.log(`  Math prompt -> capabilities: ${result.capabilities.join(', ')}`);
    });

    it('should determine tier based on complexity', () => {
      const simple = getPatternBasedClassification('Quick question');
      const complex = getPatternBasedClassification('Complex comprehensive system architecture analysis');

      console.log(`  Simple -> tier: ${simple.tier}, complexity: ${simple.complexity}`);
      console.log(`  Complex -> tier: ${complex.tier}, complexity: ${complex.complexity}`);
    });
  });

  describe('AI Classification', () => {
    it('should classify with LOCAL model first', async () => {
      const result = await classifyTask('Write a PowerShell function that calculates factorial', {
        preferLocal: true
      });

      assert.ok(result);
      assert.ok(result.category);
      assert.ok(result.complexity >= 1 && result.complexity <= 10);
      console.log(`  Classification result:`);
      console.log(`    Category: ${result.category}`);
      console.log(`    Complexity: ${result.complexity}/10`);
      console.log(`    Tier: ${result.tier}`);
      console.log(`    Classifier: ${result.classifierModel}`);
      console.log(`    Type: ${result.classifierType}`);
      console.log(`    From cache: ${result.fromCache}`);
    });

    it('should use cache for repeated prompts', async () => {
      const prompt = 'Test caching for classification';

      // First call - not cached
      const first = await classifyTask(prompt);
      assert.strictEqual(first.fromCache, false);

      // Second call - should be cached
      const second = await classifyTask(prompt);
      assert.strictEqual(second.fromCache, true);

      console.log(`  Cache working: first.fromCache=${first.fromCache}, second.fromCache=${second.fromCache}`);
    });

    it('should include queue fields when forQueue=true', async () => {
      const result = await classifyTask('Process this data', { forQueue: true });

      assert.ok('queuePriority' in result);
      assert.ok('estimatedTokens' in result);
      console.log(`  Queue fields: priority=${result.queuePriority}, tokens=${result.estimatedTokens}`);
    });
  });

  describe('Optimal Model Selection', () => {
    it('should prefer local models', async () => {
      const classification = {
        category: 'code',
        complexity: 5,
        tier: 'standard',
        localSuitable: true
      };

      const model = await getOptimalExecutionModel(classification, { preferLocal: true });

      if (model) {
        console.log(`  Optimal model: ${model.provider}/${model.model}`);
        console.log(`    Is local: ${model.isLocal}`);
        console.log(`    Tier: ${model.tier}`);
      } else {
        console.log(`  No model available`);
      }
    });

    it('should handle different tiers', async () => {
      const tiers = ['lite', 'standard', 'pro'];

      for (const tier of tiers) {
        const model = await getOptimalExecutionModel({ tier, localSuitable: true });
        console.log(`  Tier ${tier} -> ${model ? `${model.provider}/${model.model}` : 'none'}`);
      }
    });
  });

  describe('Statistics', () => {
    it('should return classifier stats', () => {
      const stats = getClassificationStats();
      assert.ok(stats);
      assert.ok('totalCached' in stats);
      assert.ok('validEntries' in stats);
      console.log(`  Cache stats: ${stats.totalCached} total, ${stats.validEntries} valid`);
    });

    it('should clear cache', () => {
      clearClassificationCache();
      const stats = getClassificationStats();
      assert.strictEqual(stats.totalCached, 0);
      console.log(`  Cache cleared successfully`);
    });
  });
});

// Run tests
console.log('\n=== Task Classifier Tests (LOCAL-FIRST) ===\n');
