/**
 * HYDRA Smart Queue - Intelligent Prompt Queue with Parallel Execution
 *
 * Features:
 * - AI-powered task classification before queuing
 * - Local-first model routing
 * - Parallel execution (local + cloud simultaneously)
 * - Automatic offline fallback
 * - Real-time progress feedback
 *
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import { PromptQueue, Priority } from './prompt-queue.js';
import { classifyTask, getOptimalExecutionModel, getConnectionStatus, testOllamaAvailability } from './task-classifier.js';
import { generate } from './ollama-client.js';

// Smart Queue Configuration
const SmartQueueConfig = {
  maxConcurrentLocal: 2,      // Max parallel Ollama requests
  maxConcurrentCloud: 4,      // Max parallel cloud requests
  maxConcurrentTotal: 5,      // Total max parallel
  defaultTimeout: 120000,     // 2 minutes per request
  retryAttempts: 2,
  enableParallel: true,
  classifyBeforeQueue: true
};

/**
 * Smart Queue Manager with intelligent routing
 */
export class SmartQueue extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = { ...SmartQueueConfig, ...options };

    // Create separate queues for local and cloud
    this.localQueue = new PromptQueue({
      maxConcurrent: this.config.maxConcurrentLocal,
      maxRetries: this.config.retryAttempts,
      timeout: this.config.defaultTimeout
    });

    this.cloudQueue = new PromptQueue({
      maxConcurrent: this.config.maxConcurrentCloud,
      maxRetries: this.config.retryAttempts,
      timeout: this.config.defaultTimeout
    });

    // Set handlers
    this.localQueue.setHandler(this._localHandler.bind(this));
    this.cloudQueue.setHandler(this._cloudHandler.bind(this));

    // Statistics
    this.stats = {
      totalQueued: 0,
      totalCompleted: 0,
      totalFailed: 0,
      localExecutions: 0,
      cloudExecutions: 0,
      startTime: Date.now()
    };

    // Results storage
    this.results = new Map();

    // Forward events
    this._setupEventForwarding();
  }

  /**
   * Add prompt to smart queue with AI classification
   * @param {string} prompt
   * @param {Object} options
   * @returns {Promise<string>}
   */
  async enqueue(prompt, options = {}) {
    const {
      priority = 'normal',
      tag = 'default',
      skipClassification = false,
      preferLocal = true
    } = options;

    const id = this._generateId();

    // Convert string priority to number
    const priorityNum = this._parsePriority(priority);

    // Classify task (if enabled)
    let classification = null;
    if (this.config.classifyBeforeQueue && !skipClassification) {
      console.log(`[SmartQueue] Classifying prompt ${id}...`);
      classification = await classifyTask(prompt, { forQueue: true, preferLocal });
    }

    // Determine target (local or cloud)
    const optimalModel = await getOptimalExecutionModel(classification || { tier: 'standard' }, { preferLocal });

    const item = {
      id,
      prompt,
      priority: classification?.queuePriority ?? priorityNum,
      classification,
      model: optimalModel?.model,
      isLocal: optimalModel?.isLocal ?? true,
      tag,
      queuedAt: Date.now()
    };

    // Route to appropriate queue
    if (item.isLocal && optimalModel) {
      this.localQueue.enqueue(prompt, {
        priority: item.priority,
        model: item.model,
        metadata: { smartQueueId: id, classification, tag }
      });
      console.log(`[SmartQueue] Added #${id} to LOCAL queue | Model: ${item.model} | Priority: ${item.priority}`);
    } else {
      this.cloudQueue.enqueue(prompt, {
        priority: item.priority,
        model: item.model || 'gemini-1.5-flash',
        metadata: { smartQueueId: id, classification, tag }
      });
      console.log(`[SmartQueue] Added #${id} to CLOUD queue | Model: ${item.model || 'gemini'} | Priority: ${item.priority}`);
    }

    this.stats.totalQueued++;
    return id;
  }

  /**
   * Add multiple prompts with parallel classification
   * @param {string[]} prompts
   * @param {Object} options
   * @returns {Promise<string[]>}
   */
  async enqueueBatch(prompts, options = {}) {
    const { parallelClassify = true } = options;

    if (parallelClassify) {
      // Classify all prompts in parallel
      const classificationPromises = prompts.map(p => classifyTask(p, { forQueue: true }));
      const classifications = await Promise.all(classificationPromises);

      // Enqueue with classifications
      const ids = [];
      for (let i = 0; i < prompts.length; i++) {
        const id = await this.enqueue(prompts[i], {
          ...options,
          skipClassification: true, // Already classified
          _preClassification: classifications[i]
        });
        ids.push(id);
      }
      return ids;
    } else {
      // Sequential processing
      const ids = [];
      for (const prompt of prompts) {
        ids.push(await this.enqueue(prompt, options));
      }
      return ids;
    }
  }

  /**
   * Get queue status
   * @returns {Object}
   */
  getStatus() {
    const localStatus = this.localQueue.getStatus();
    const cloudStatus = this.cloudQueue.getStatus();

    return {
      queueSize: localStatus.queued + cloudStatus.queued,
      pending: localStatus.queued + cloudStatus.queued,
      running: localStatus.running + cloudStatus.running,
      completed: this.stats.totalCompleted,
      failed: this.stats.totalFailed,
      local: {
        queued: localStatus.queued,
        running: localStatus.running,
        executions: this.stats.localExecutions
      },
      cloud: {
        queued: cloudStatus.queued,
        running: cloudStatus.running,
        executions: this.stats.cloudExecutions
      },
      stats: { ...this.stats },
      uptime: Date.now() - this.stats.startTime
    };
  }

  /**
   * Get results
   * @param {Object} options
   * @returns {Array}
   */
  getResults(options = {}) {
    const { completedOnly = false, failedOnly = false } = options;

    let results = Array.from(this.results.values());

    if (completedOnly) results = results.filter(r => r.status === 'completed');
    if (failedOnly) results = results.filter(r => r.status === 'failed');

    return results;
  }

  /**
   * Clear results
   */
  clearResults() {
    const count = this.results.size;
    this.results.clear();
    this.stats = {
      totalQueued: 0,
      totalCompleted: 0,
      totalFailed: 0,
      localExecutions: 0,
      cloudExecutions: 0,
      startTime: Date.now()
    };
    console.log(`[SmartQueue] Cleared ${count} results`);
  }

  /**
   * Pause all queues
   */
  pause() {
    this.localQueue.pause();
    this.cloudQueue.pause();
    this.emit('paused');
  }

  /**
   * Resume all queues
   */
  resume() {
    this.localQueue.resume();
    this.cloudQueue.resume();
    this.emit('resumed');
  }

  /**
   * Cancel all items
   */
  cancelAll() {
    const localCancelled = this.localQueue.cancelAll();
    const cloudCancelled = this.cloudQueue.cancelAll();
    return [...localCancelled, ...cloudCancelled];
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Handler for local queue (Ollama)
   */
  async _localHandler(prompt, model, metadata) {
    const startTime = Date.now();

    try {
      const response = await generate(model, prompt, {
        timeout: this.config.defaultTimeout
      });

      this.stats.localExecutions++;

      const result = {
        id: metadata.smartQueueId,
        status: 'completed',
        response: response.response,
        model,
        isLocal: true,
        duration: Date.now() - startTime,
        classification: metadata.classification
      };

      this.results.set(metadata.smartQueueId, result);
      this.stats.totalCompleted++;

      return result;
    } catch (error) {
      const result = {
        id: metadata.smartQueueId,
        status: 'failed',
        error: error.message,
        model,
        isLocal: true,
        duration: Date.now() - startTime
      };

      this.results.set(metadata.smartQueueId, result);
      this.stats.totalFailed++;

      throw error;
    }
  }

  /**
   * Handler for cloud queue (placeholder - needs Gemini integration)
   */
  async _cloudHandler(prompt, model, metadata) {
    const startTime = Date.now();

    // For now, fallback to local if available
    const localAvailable = await testOllamaAvailability();

    if (localAvailable) {
      console.log(`[SmartQueue] Cloud handler falling back to local`);
      return this._localHandler(prompt, 'llama3.2:3b', metadata);
    }

    // Placeholder for Gemini API integration
    throw new Error('Cloud handler not implemented - Gemini API integration required');
  }

  /**
   * Setup event forwarding from sub-queues
   */
  _setupEventForwarding() {
    const forwardEvent = (source, eventName) => {
      source.on(eventName, (data) => {
        this.emit(eventName, { ...data, source: source === this.localQueue ? 'local' : 'cloud' });
      });
    };

    ['enqueued', 'started', 'completed', 'failed', 'retrying'].forEach(event => {
      forwardEvent(this.localQueue, event);
      forwardEvent(this.cloudQueue, event);
    });
  }

  /**
   * Generate unique ID
   */
  _generateId() {
    return Math.random().toString(36).substring(2, 10);
  }

  /**
   * Parse priority string to number
   */
  _parsePriority(priority) {
    const map = {
      urgent: Priority.URGENT,
      high: Priority.HIGH,
      normal: Priority.NORMAL,
      low: Priority.LOW,
      background: Priority.BACKGROUND,
      0: Priority.URGENT,
      1: Priority.HIGH,
      2: Priority.NORMAL,
      3: Priority.LOW,
      4: Priority.BACKGROUND
    };
    return map[priority] ?? Priority.NORMAL;
  }
}

// Singleton instance
let smartQueueInstance = null;

/**
 * Get or create smart queue instance
 */
export function getSmartQueue(options = {}) {
  if (!smartQueueInstance) {
    smartQueueInstance = new SmartQueue(options);
  }
  return smartQueueInstance;
}

/**
 * Quick enqueue function
 */
export function smartEnqueue(prompt, options = {}) {
  return getSmartQueue().enqueue(prompt, options);
}

/**
 * Quick batch enqueue
 */
export function smartEnqueueBatch(prompts, options = {}) {
  return getSmartQueue().enqueueBatch(prompts, options);
}

/**
 * Get smart queue status
 */
export function getSmartQueueStatus() {
  return getSmartQueue().getStatus();
}

/**
 * Get results
 */
export function getSmartQueueResults(options = {}) {
  return getSmartQueue().getResults(options);
}

/**
 * Clear results
 */
export function clearSmartQueue() {
  return getSmartQueue().clearResults();
}

export { SmartQueueConfig };
