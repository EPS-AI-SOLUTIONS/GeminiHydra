#!/usr/bin/env node
import 'dotenv/config';
/**
 * HYDRA Ollama MCP Server
 *
 * Provides Ollama integration for Gemini CLI with:
 * - Speculative decoding (parallel model racing)
 * - Self-correction (agentic code validation)
 * - SHA256 response caching
 * - Batch processing
 * - Prompt optimization
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { generate, checkHealth, listModels, pullModel } from './ollama-client.js';
import { speculativeGenerate, modelRace, consensusGenerate } from './speculative.js';
import { selfCorrect, generateWithCorrection } from './self-correction.js';
import { getCache, setCache, getCacheStats } from './cache.js';
import { CONFIG } from './config.js';
import { createLogger } from './logger.js';
import {
  optimizePrompt,
  getBetterPrompt,
  testPromptQuality,
  optimizePromptBatch,
  analyzePrompt,
  getSuggestions,
  getSmartSuggestions,
  getAutoCompletions,
  getPromptTemplate,
  autoFixPrompt
} from './prompt-optimizer.js';
import {
  getGeminiModels,
  getModelDetails,
  filterModelsByCapability,
  getRecommendedModels,
  getModelsSummary,
  initializeModels
} from './gemini-models.js';
import {
  Priority,
  getQueue,
  enqueue,
  enqueueBatch,
  getQueueStatus,
  cancelItem,
  pauseQueue,
  resumeQueue
} from './prompt-queue.js';
import { TOOLS } from './tools.js';
import { resolveNodeEngines, resolveServerVersion } from './version.js';
import { buildToolValidators } from './tool-validator.js';

const logger = createLogger('server');
const SERVER_VERSION = resolveServerVersion();

// Server instance
const server = new Server(
  {
    name: 'ollama-hydra',
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const toolByName = new Map(TOOLS.map(tool => [tool.name, tool]));
const toolValidators = buildToolValidators(TOOLS);
const modelCache = { models: null, updatedAt: 0 };

const createErrorResponse = (code, message, tool, requestId, details = null) => {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: message, code, tool, requestId, details })
      }
    ],
    isError: true
  };
};

const validateToolArgs = (toolName, args) => {
  const validator = toolValidators.get(toolName);
  if (!validator) return [];
  const valid = validator(args);
  if (valid) return [];
  return (validator.errors || []).map(error => `${error.instancePath || error.schemaPath} ${error.message}`.trim());
};

const validatePromptLength = (value, fieldName) => {
  if (!value) return [];
  if (value.length <= CONFIG.PROMPT_MAX_LENGTH) return [];
  return [`Pole ${fieldName} przekracza limit ${CONFIG.PROMPT_MAX_LENGTH} znaków.`];
};

const getCachedModels = async () => {
  const now = Date.now();
  if (modelCache.models && now - modelCache.updatedAt < CONFIG.MODEL_CACHE_TTL_MS) {
    return modelCache.models;
  }

  const health = await checkHealth();
  if (!health.available) {
    modelCache.models = [];
    modelCache.updatedAt = now;
    return modelCache.models;
  }

  modelCache.models = await listModels();
  modelCache.updatedAt = now;
  return modelCache.models;
};

const resolveModelOrFallback = async (requestedModel) => {
  if (!requestedModel) {
    return { model: CONFIG.DEFAULT_MODEL, fallbackUsed: false };
  }
  const models = await getCachedModels();
  const available = models.map(model => model.name ?? model.model).filter(Boolean);
  const allowlist = CONFIG.MODEL_ALLOWLIST
    ? CONFIG.MODEL_ALLOWLIST.split(',').map(item => item.trim()).filter(Boolean)
    : [];
  const denylist = CONFIG.MODEL_DENYLIST
    ? CONFIG.MODEL_DENYLIST.split(',').map(item => item.trim()).filter(Boolean)
    : [];
  if (denylist.includes(requestedModel)) {
    logger.warn('Requested model is denylisted, falling back', {
      requestedModel,
      fallbackModel: CONFIG.DEFAULT_MODEL
    });
    return { model: CONFIG.DEFAULT_MODEL, fallbackUsed: true };
  }
  if (allowlist.length > 0 && !allowlist.includes(requestedModel)) {
    logger.warn('Requested model not allowlisted, falling back', {
      requestedModel,
      fallbackModel: CONFIG.DEFAULT_MODEL
    });
    return { model: CONFIG.DEFAULT_MODEL, fallbackUsed: true };
  }
  if (available.includes(requestedModel)) {
    return { model: requestedModel, fallbackUsed: false };
  }
  logger.warn('Requested model not available, falling back', {
    requestedModel,
    fallbackModel: CONFIG.DEFAULT_MODEL
  });
  return { model: CONFIG.DEFAULT_MODEL, fallbackUsed: true };
};

const getMajorVersion = (version) => {
  const match = `${version}`.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const detectPromptRisk = (prompt) => {
  if (!prompt) return [];
  const checks = [
    { pattern: /ignore (all|previous|earlier) instructions/i, message: 'Wykryto możliwą próbę obejścia instrukcji.' },
    { pattern: /system prompt/i, message: 'Wykryto prośbę o ujawnienie promptu systemowego.' },
    { pattern: /exfiltrate|leak|steal/i, message: 'Wykryto możliwą próbę eksfiltracji danych.' }
  ];
  return checks.filter(({ pattern }) => pattern.test(prompt)).map(({ message }) => message);
};

const enforcePromptRiskPolicy = (toolName, requestId, warnings) => {
  if (!CONFIG.PROMPT_RISK_BLOCK || warnings.length === 0) return null;
  return createErrorResponse(
    'HYDRA_PROMPT_BLOCKED',
    'Prompt zablokowany przez politykę bezpieczeństwa.',
    toolName,
    requestId,
    { warnings }
  );
};

const runAiHandler = async (prompt, options = {}) => {
  const optimization = optimizePrompt(prompt);
  const category = optimization.category;

  let model = options.model;
  if (!model) {
    if (category === 'code') model = CONFIG.CODER_MODEL;
    else if (category === 'question') model = CONFIG.FAST_MODEL;
    else model = CONFIG.DEFAULT_MODEL;
  }

  let result;
  if (category !== 'code') {
    result = await speculativeGenerate(optimization.optimizedPrompt);
  } else {
    result = await generateWithCorrection(optimization.optimizedPrompt, {
      generatorModel: model
    });
  }

  return {
    ...result,
    optimization
  };
};

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params ?? {};
  const startedAt = Date.now();
  const safeArgs = args ?? {};
  const requestId = request.id ?? null;
  const tool = toolByName.get(name);

  try {
    if (!tool) {
      return createErrorResponse('HYDRA_TOOL_UNKNOWN', 'Nieznane narzędzie.', name, requestId);
    }

    const validationErrors = validateToolArgs(name, safeArgs);
    const lengthErrors = [
      ...validatePromptLength(safeArgs.prompt, 'prompt'),
      ...validatePromptLength(safeArgs.code, 'code')
    ];
    const allErrors = [...validationErrors, ...lengthErrors];
    if (allErrors.length > 0) {
      return createErrorResponse('HYDRA_TOOL_INVALID', allErrors.join(' '), name, requestId);
    }

    let result;

    switch (name) {
      // === GENERATION TOOLS ===
      case 'ollama_generate': {
        let prompt = safeArgs.prompt;
        const securityWarnings = detectPromptRisk(prompt);
        const blocked = enforcePromptRiskPolicy(name, requestId, securityWarnings);
        if (blocked) return blocked;
        if (securityWarnings.length) {
          logger.warn('Potential prompt risk detected', { tool: name, requestId });
        }

        // Optimize prompt if requested
        if (safeArgs.optimize) {
          const optimized = optimizePrompt(prompt, { model: safeArgs.model });
          prompt = optimized.optimizedPrompt;
        }

        // Check cache first
        if (safeArgs.useCache !== false) {
          const cached = getCache(prompt, safeArgs.model);
          if (cached) {
            result = { ...cached, fromCache: true };
            break;
          }
        }

        const resolved = await resolveModelOrFallback(safeArgs.model);
        const response = await generate(
          resolved.model,
          prompt,
          { temperature: safeArgs.temperature, maxTokens: safeArgs.maxTokens }
        );

        // Save to cache
        if (safeArgs.useCache !== false) {
          setCache(prompt, response.response, resolved.model);
        }

        result = {
          ...response,
          fallbackUsed: resolved.fallbackUsed,
          model: resolved.model,
          securityWarnings
        };
        break;
      }

      case 'ollama_smart': {
        // Smart generation: optimize → detect category → select model → generate
        const securityWarnings = detectPromptRisk(safeArgs.prompt);
        const blocked = enforcePromptRiskPolicy(name, requestId, securityWarnings);
        if (blocked) return blocked;
        if (securityWarnings.length) {
          logger.warn('Potential prompt risk detected', { tool: name, requestId });
        }
        result = await runAiHandler(safeArgs.prompt, { model: safeArgs.model });
        result.securityWarnings = securityWarnings;
        break;
      }

      case 'ollama_speculative':
        {
          const securityWarnings = detectPromptRisk(safeArgs.prompt);
          const blocked = enforcePromptRiskPolicy(name, requestId, securityWarnings);
          if (blocked) return blocked;
          result = await speculativeGenerate(safeArgs.prompt, safeArgs);
          result.securityWarnings = securityWarnings;
        }
        break;

      case 'ollama_race':
        {
          const securityWarnings = detectPromptRisk(safeArgs.prompt);
          const blocked = enforcePromptRiskPolicy(name, requestId, securityWarnings);
          if (blocked) return blocked;
          result = await modelRace(
            safeArgs.prompt,
            safeArgs.models || [CONFIG.FAST_MODEL, 'phi3:mini', CONFIG.DEFAULT_MODEL],
            { firstWins: safeArgs.firstWins ?? true }
          );
          result.securityWarnings = securityWarnings;
        }
        break;

      case 'ollama_consensus':
        {
          const securityWarnings = detectPromptRisk(safeArgs.prompt);
          const blocked = enforcePromptRiskPolicy(name, requestId, securityWarnings);
          if (blocked) return blocked;
          result = await consensusGenerate(
            safeArgs.prompt,
            safeArgs.models || [CONFIG.DEFAULT_MODEL, 'phi3:mini']
          );
          result.securityWarnings = securityWarnings;
        }
        break;

      // === CODE TOOLS ===
      case 'ollama_code':
        {
          const securityWarnings = detectPromptRisk(safeArgs.prompt);
          const blocked = enforcePromptRiskPolicy(name, requestId, securityWarnings);
          if (blocked) return blocked;
          result = await generateWithCorrection(safeArgs.prompt, {
            generatorModel: safeArgs.model || CONFIG.DEFAULT_MODEL,
            coderModel: safeArgs.coderModel || CONFIG.CODER_MODEL
          });
          result.securityWarnings = securityWarnings;
        }
        break;

      case 'ollama_validate':
        result = await selfCorrect(safeArgs.code, {
          language: safeArgs.language,
          maxAttempts: safeArgs.maxAttempts
        });
        break;

      // === PROMPT OPTIMIZATION TOOLS ===
      case 'prompt_optimize':
        result = optimizePrompt(safeArgs.prompt, {
          model: safeArgs.model,
          category: safeArgs.category,
          addExamples: safeArgs.addExamples
        });
        break;

      case 'prompt_analyze':
        result = analyzePrompt(safeArgs.prompt);
        break;

      case 'prompt_quality':
        result = testPromptQuality(safeArgs.prompt);
        break;

      case 'prompt_suggest':
        result = getSuggestions(safeArgs.prompt, safeArgs.model);
        break;

      case 'prompt_batch_optimize':
        result = optimizePromptBatch(safeArgs.prompts, { model: safeArgs.model });
        break;

      case 'prompt_smart_suggest':
        result = {
          prompt: safeArgs.prompt.substring(0, 50) + (safeArgs.prompt.length > 50 ? '...' : ''),
          analysis: analyzePrompt(safeArgs.prompt),
          smartSuggestions: getSmartSuggestions(safeArgs.prompt),
          standardSuggestions: getSuggestions(safeArgs.prompt)
        };
        break;

      case 'prompt_autocomplete':
        result = getAutoCompletions(safeArgs.partial);
        break;

      case 'prompt_autofix':
        result = autoFixPrompt(safeArgs.prompt);
        break;

      case 'prompt_template':
        const template = getPromptTemplate(safeArgs.category, safeArgs.variant || 'basic');
        result = {
          category: safeArgs.category,
          variant: safeArgs.variant || 'basic',
          template: template,
          available: template !== null
        };
        break;

      // === BATCH & UTILITY TOOLS ===
      case 'ollama_batch': {
        const maxConcurrent = safeArgs.maxConcurrent || CONFIG.QUEUE_MAX_CONCURRENT;
        const resolved = await resolveModelOrFallback(safeArgs.model);
        const model = resolved.model;
        let prompts = safeArgs.prompts;
        const securityWarnings = prompts.flatMap(prompt => detectPromptRisk(prompt));
        const blocked = enforcePromptRiskPolicy(name, requestId, securityWarnings);
        if (blocked) return blocked;

        // Optimize prompts if requested
        if (safeArgs.optimize) {
          prompts = prompts.map(p => getBetterPrompt(p, model));
        }

        // Process in batches
        const results = [];
        for (let i = 0; i < prompts.length; i += maxConcurrent) {
          const batch = prompts.slice(i, i + maxConcurrent);
          const batchResults = await Promise.all(
            batch.map(prompt => generate(model, prompt).catch(e => ({ error: e.message })))
          );
          results.push(...batchResults);
        }

        result = {
          results: results.map((r, i) => ({
            prompt: safeArgs.prompts[i].substring(0, 50) + '...',
            response: r.response || null,
            error: r.error || null
          })),
          total: prompts.length,
          successful: results.filter(r => r.response).length,
          optimized: safeArgs.optimize || false,
          fallbackUsed: resolved.fallbackUsed,
          securityWarnings
        };
        break;
      }

      case 'ollama_status': {
        const health = await checkHealth();
        const models = health.available ? await listModels() : [];
        const cacheStats = getCacheStats();

        result = {
          ollama: health,
          models: models,
          cache: cacheStats,
          config: {
            defaultModel: CONFIG.DEFAULT_MODEL,
            fastModel: CONFIG.FAST_MODEL,
            coderModel: CONFIG.CODER_MODEL
          },
          features: {
            promptOptimizer: true,
            speculativeDecoding: true,
            selfCorrection: true,
            caching: true,
            batchProcessing: true
          },
          apiVersion: CONFIG.API_VERSION,
          serverVersion: SERVER_VERSION
        };
        break;
      }

      case 'ollama_pull':
        const success = await pullModel(safeArgs.model);
        result = { model: safeArgs.model, pulled: success };
        break;

      case 'ollama_cache_clear': {
        const { readdirSync, unlinkSync, statSync } = await import('fs');
        const { join } = await import('path');
        const cacheDir = CONFIG.CACHE_DIR || './cache';
        const olderThan = safeArgs.olderThan ? safeArgs.olderThan * 1000 : 0;
        const now = Date.now();
        let cleared = 0;

        try {
          const files = readdirSync(cacheDir).filter(f => f.endsWith('.json'));
          for (const file of files) {
            const path = join(cacheDir, file);
            const stat = statSync(path);
            if (olderThan === 0 || (now - stat.mtimeMs) > olderThan) {
              unlinkSync(path);
              cleared++;
            }
          }
        } catch {}

        result = { cleared, cacheDir };
        break;
      }

      // === GEMINI MODELS TOOLS ===
      case 'gemini_models': {
        result = await getGeminiModels(safeArgs.forceRefresh || false, safeArgs.apiKey);
        break;
      }

      case 'gemini_model_details': {
        result = await getModelDetails(safeArgs.model, safeArgs.apiKey);
        break;
      }

      case 'gemini_models_summary': {
        const modelsResult = await getGeminiModels(safeArgs.forceRefresh || false);
        if (modelsResult.success) {
          result = {
            source: modelsResult.source,
            summary: getModelsSummary(modelsResult.models)
          };
        } else {
          result = modelsResult;
        }
        break;
      }

      case 'gemini_models_recommend': {
        const modelsResult = await getGeminiModels(safeArgs.forceRefresh || false);
        if (modelsResult.success) {
          result = {
            source: modelsResult.source,
            recommendations: getRecommendedModels(modelsResult.models)
          };
        } else {
          result = modelsResult;
        }
        break;
      }

      case 'gemini_models_filter': {
        const modelsResult = await getGeminiModels(safeArgs.forceRefresh || false);
        if (modelsResult.success) {
          const filtered = filterModelsByCapability(modelsResult.models, safeArgs.capability);
          result = {
            capability: safeArgs.capability,
            count: filtered.length,
            models: filtered.map(m => ({
              name: m.name,
              displayName: m.displayName,
              inputTokenLimit: m.inputTokenLimit,
              outputTokenLimit: m.outputTokenLimit
            }))
          };
        } else {
          result = modelsResult;
        }
        break;
      }

      // === QUEUE MANAGEMENT TOOLS ===
      case 'queue_enqueue': {
        const priorityMap = {
          urgent: Priority.URGENT,
          high: Priority.HIGH,
          normal: Priority.NORMAL,
          low: Priority.LOW,
          background: Priority.BACKGROUND
        };
        const id = enqueue(safeArgs.prompt, {
          model: safeArgs.model || CONFIG.DEFAULT_MODEL,
          priority: priorityMap[safeArgs.priority] ?? Priority.NORMAL,
          metadata: safeArgs.metadata || {}
        });
        result = {
          id,
          status: 'queued',
          priority: safeArgs.priority || 'normal',
          model: safeArgs.model || CONFIG.DEFAULT_MODEL
        };
        break;
      }

      case 'queue_batch': {
        const priorityMap = {
          urgent: Priority.URGENT,
          high: Priority.HIGH,
          normal: Priority.NORMAL,
          low: Priority.LOW,
          background: Priority.BACKGROUND
        };
        const ids = enqueueBatch(safeArgs.prompts, {
          model: safeArgs.model || CONFIG.DEFAULT_MODEL,
          priority: priorityMap[safeArgs.priority] ?? Priority.NORMAL
        });
        result = {
          ids,
          count: ids.length,
          priority: safeArgs.priority || 'normal',
          model: safeArgs.model || CONFIG.DEFAULT_MODEL
        };
        break;
      }

      case 'queue_status': {
        result = getQueueStatus();
        break;
      }

      case 'queue_item': {
        const item = getQueue().getItem(safeArgs.id);
        if (item) {
          result = {
            id: item.id,
            status: item.status,
            priority: item.priority,
            attempts: item.attempts,
            prompt: item.prompt.substring(0, 100) + (item.prompt.length > 100 ? '...' : ''),
            result: item.result,
            error: item.error,
            createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
            startedAt: item.startedAt ? new Date(item.startedAt).toISOString() : null,
            completedAt: item.completedAt ? new Date(item.completedAt).toISOString() : null
          };
        } else {
          result = { error: `Nie znaleziono elementu ${safeArgs.id}` };
        }
        break;
      }

      case 'queue_cancel': {
        const cancelled = cancelItem(safeArgs.id);
        result = { id: safeArgs.id, cancelled };
        break;
      }

      case 'queue_cancel_all': {
        const cancelled = getQueue().cancelAll();
        result = { cancelled: cancelled.length, ids: cancelled };
        break;
      }

      case 'queue_pause': {
        pauseQueue();
        result = { paused: true };
        break;
      }

      case 'queue_resume': {
        resumeQueue();
        result = { resumed: true };
        break;
      }

      case 'queue_wait': {
        try {
          const item = await getQueue().waitFor(safeArgs.id, safeArgs.timeout || CONFIG.QUEUE_TIMEOUT_MS);
          result = {
            id: item.id,
            status: item.status,
            result: item.result,
            error: item.error,
            duration: item.completedAt ? item.completedAt - item.startedAt : null
          };
        } catch (e) {
          result = { error: `Nie udało się pobrać wyniku: ${e.message}` };
        }
        break;
      }

      case 'hydra_health': {
        const health = await checkHealth();
        const cacheStats = getCacheStats();
        const queueStatus = getQueueStatus();
        const nodeEngines = resolveNodeEngines();
        result = {
          status: health.available ? 'ok' : 'degraded',
          ollama: health,
          queue: queueStatus,
          cache: cacheStats,
          version: SERVER_VERSION,
          apiVersion: CONFIG.API_VERSION,
          providers: {
            fallbackOrder: CONFIG.AI_PROVIDER_FALLBACK.split(',').map(p => p.trim()).filter(Boolean),
            allowlist: CONFIG.MODEL_ALLOWLIST,
            denylist: CONFIG.MODEL_DENYLIST
          },
          node: {
            runtime: process.versions.node,
            engines: nodeEngines
          }
        };
        break;
      }

      case 'hydra_config': {
        result = {
          apiVersion: CONFIG.API_VERSION,
          defaults: {
            defaultModel: CONFIG.DEFAULT_MODEL,
            fastModel: CONFIG.FAST_MODEL,
            coderModel: CONFIG.CODER_MODEL
          },
          limits: {
            promptMaxLength: CONFIG.PROMPT_MAX_LENGTH,
            promptRiskBlock: CONFIG.PROMPT_RISK_BLOCK
          },
          providers: {
            fallbackOrder: CONFIG.AI_PROVIDER_FALLBACK.split(',').map(p => p.trim()).filter(Boolean),
            allowlist: CONFIG.MODEL_ALLOWLIST,
            denylist: CONFIG.MODEL_DENYLIST
          },
          cache: {
            enabled: CONFIG.CACHE_ENABLED,
            ttlMs: CONFIG.CACHE_TTL_MS,
            dir: CONFIG.CACHE_DIR,
            encrypted: Boolean(CONFIG.CACHE_ENCRYPTION_KEY),
            maxEntryBytes: CONFIG.CACHE_MAX_ENTRY_BYTES,
            cleanupIntervalMs: CONFIG.CACHE_CLEANUP_INTERVAL_MS,
            maxTotalMb: CONFIG.CACHE_MAX_TOTAL_MB
          },
          queue: {
            maxConcurrent: CONFIG.QUEUE_MAX_CONCURRENT,
            maxRetries: CONFIG.QUEUE_MAX_RETRIES,
            retryDelayBase: CONFIG.QUEUE_RETRY_DELAY_BASE,
            timeoutMs: CONFIG.QUEUE_TIMEOUT_MS,
            rateLimit: {
              tokens: CONFIG.QUEUE_RATE_LIMIT_TOKENS,
              refillRate: CONFIG.QUEUE_RATE_LIMIT_REFILL
            },
            persistence: {
              enabled: CONFIG.QUEUE_PERSISTENCE_ENABLED,
              path: CONFIG.QUEUE_PERSISTENCE_PATH
            }
          }
        };
        break;
      }

      default:
        return createErrorResponse('HYDRA_TOOL_UNKNOWN', 'Nieznane narzędzie.', name);
    }

    logger.info('Tool executed', {
      tool: name,
      durationMs: Date.now() - startedAt,
      requestId
    });

    return {
      content: [
        {
          type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      }
    ]
  };

  } catch (error) {
    logger.error('Tool execution failed', { tool: name, error: error.message, requestId });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: `Wystąpił błąd podczas przetwarzania: ${error.message}`,
            tool: name,
            code: 'HYDRA_TOOL_ERROR',
            requestId
          })
        }
      ],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();

  const cacheStats = getCacheStats();
  logger.info('Cache warmup completed', {
    totalEntries: cacheStats.totalEntries,
    validEntries: cacheStats.validEntries
  });

  // Initialize Gemini models at startup (from cache or API)
  const engines = resolveNodeEngines();
  const runtimeMajor = getMajorVersion(process.versions.node);
  const engineMajor = engines ? getMajorVersion(engines) : null;
  if (engineMajor && runtimeMajor && runtimeMajor < engineMajor) {
    logger.warn('Node runtime may not satisfy engines requirement', {
      runtime: process.versions.node,
      engines
    });
  }

  const modelsInit = await initializeModels();
  if (modelsInit.success) {
    logger.info('Gemini models ready', { count: modelsInit.count });
  }

  // Initialize prompt queue with AI handler
  const queue = getQueue({
    maxConcurrent: CONFIG.QUEUE_MAX_CONCURRENT,
    maxRetries: CONFIG.QUEUE_MAX_RETRIES,
    retryDelayBase: CONFIG.QUEUE_RETRY_DELAY_BASE,
    timeout: CONFIG.QUEUE_TIMEOUT_MS,
    rateLimit: { maxTokens: CONFIG.QUEUE_RATE_LIMIT_TOKENS, refillRate: CONFIG.QUEUE_RATE_LIMIT_REFILL },
    persistence: {
      enabled: CONFIG.QUEUE_PERSISTENCE_ENABLED,
      path: CONFIG.QUEUE_PERSISTENCE_PATH
    }
  });

  // Set default handler for prompt processing
  queue.setHandler(async (prompt, model, metadata) => {
    const response = await runAiHandler(prompt, { model });
    return response.response;
  });

  // Log queue events
  queue.on('completed', ({ id, duration }) => {
    logger.info('Queue item completed', { id, duration });
  });
  queue.on('failed', ({ id, error }) => {
    logger.error('Queue item failed', { id, error });
  });
  queue.on('retrying', ({ id, attempt, delay }) => {
    logger.warn('Queue item retrying', { id, attempt, delay });
  });

  logger.info('Prompt queue initialized', {
    maxConcurrent: CONFIG.QUEUE_MAX_CONCURRENT,
    retries: CONFIG.QUEUE_MAX_RETRIES
  });

  if (CONFIG.CACHE_CLEANUP_INTERVAL_MS > 0) {
    const { cleanupCache } = await import('./cache.js');
    const cacheInterval = setInterval(() => {
      cleanupCache();
    }, CONFIG.CACHE_CLEANUP_INTERVAL_MS);
    cacheInterval.unref?.();
  }

  await server.connect(transport);
  logger.info('HYDRA Ollama MCP Server running on stdio', { version: SERVER_VERSION });
}

main().catch((error) => {
  logger.error('Server failed to start', { error: error.message });
});
