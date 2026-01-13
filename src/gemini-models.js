/**
 * Gemini Models Fetcher - Pobiera aktualną listę modeli z Gemini API
 *
 * Endpoints:
 * - GET /v1beta/models - Lista wszystkich modeli
 * - GET /v1beta/models/{model} - Szczegóły konkretnego modelu
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = CONFIG.CACHE_DIR || join(__dirname, '..', 'cache');
const MODELS_CACHE_FILE = join(CACHE_DIR, 'gemini-models.json');
const MODELS_CACHE_TTL = CONFIG.GEMINI_MODELS_CACHE_TTL_MS;

// Ensure cache directory exists
if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Get Gemini API key from environment or settings
 */
function getApiKey() {
  return process.env.GEMINI_API_KEY || null;
}

async function fetchWithRetry(url, options = {}, attempt = 0) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.GEMINI_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (error) {
    if (attempt >= CONFIG.GEMINI_FETCH_RETRIES) {
      throw error;
    }
    const backoffMs = Math.min(1000 * 2 ** attempt, 5000);
    await new Promise(resolve => setTimeout(resolve, backoffMs));
    return fetchWithRetry(url, options, attempt + 1);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch models from Gemini API
 */
export async function fetchGeminiModels(apiKey = null) {
  const key = apiKey || getApiKey();

  if (!key) {
    return {
      success: false,
      error: 'No API key found. Set GEMINI_API_KEY environment variable.',
      models: []
    };
  }

  try {
    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `API Error ${response.status}: ${errorText}`,
        models: []
      };
    }

    const data = await response.json();
    const models = (data.models || []).map(m => ({
      name: m.name.replace('models/', ''),
      displayName: m.displayName,
      description: m.description,
      inputTokenLimit: m.inputTokenLimit,
      outputTokenLimit: m.outputTokenLimit,
      supportedGenerationMethods: m.supportedGenerationMethods || [],
      temperature: m.temperature,
      topP: m.topP,
      topK: m.topK
    }));

    // Cache the results
    saveModelsCache(models);

    return {
      success: true,
      models,
      count: models.length,
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      models: []
    };
  }
}

/**
 * Get model details from Gemini API
 */
export async function getModelDetails(modelName, apiKey = null) {
  const key = apiKey || getApiKey();

  if (!key) {
    return {
      success: false,
      error: 'No API key found'
    };
  }

  // Normalize model name
  const model = modelName.startsWith('models/') ? modelName : `models/${modelName}`;

  try {
    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/${model}?key=${key}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `API Error ${response.status}: ${errorText}`
      };
    }

    const data = await response.json();
    return {
      success: true,
      model: {
        name: data.name.replace('models/', ''),
        displayName: data.displayName,
        description: data.description,
        version: data.version,
        inputTokenLimit: data.inputTokenLimit,
        outputTokenLimit: data.outputTokenLimit,
        supportedGenerationMethods: data.supportedGenerationMethods || [],
        temperature: data.temperature,
        topP: data.topP,
        topK: data.topK
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Save models to cache
 */
function saveModelsCache(models) {
  try {
    writeFileSync(MODELS_CACHE_FILE, JSON.stringify({
      models,
      cachedAt: Date.now()
    }, null, 2), 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Load models from cache
 */
export function loadModelsCache() {
  try {
    if (!existsSync(MODELS_CACHE_FILE)) {
      return { valid: false, models: [], reason: 'Cache file not found' };
    }

    const data = JSON.parse(readFileSync(MODELS_CACHE_FILE, 'utf-8'));
    const age = Date.now() - data.cachedAt;

    if (age > MODELS_CACHE_TTL) {
      return {
        valid: false,
        models: data.models,
        reason: 'Cache expired',
        ageMinutes: Math.round(age / 60000)
      };
    }

    return {
      valid: true,
      models: data.models,
      cachedAt: new Date(data.cachedAt).toISOString(),
      ageMinutes: Math.round(age / 60000)
    };
  } catch (e) {
    return { valid: false, models: [], reason: e.message };
  }
}

/**
 * Get models - from cache if valid, otherwise fetch fresh
 */
export async function getGeminiModels(forceRefresh = false, apiKey = null) {
  if (!forceRefresh) {
    const cached = loadModelsCache();
    if (cached.valid) {
      return {
        success: true,
        source: 'cache',
        models: cached.models,
        count: cached.models.length,
        cachedAt: cached.cachedAt,
        ageMinutes: cached.ageMinutes
      };
    }
  }

  const result = await fetchGeminiModels(apiKey);
  if (result.success) {
    result.source = 'api';
  }
  return result;
}

/**
 * Filter models by capability
 */
export function filterModelsByCapability(models, capability) {
  const validCapabilities = [
    'generateContent',
    'countTokens',
    'embedContent',
    'generateAnswer',
    'batchEmbedContents'
  ];

  if (!validCapabilities.includes(capability)) {
    return { error: `Invalid capability. Valid: ${validCapabilities.join(', ')}` };
  }

  return models.filter(m =>
    m.supportedGenerationMethods &&
    m.supportedGenerationMethods.includes(capability)
  );
}

/**
 * Get recommended models for different use cases
 */
export function getRecommendedModels(models) {
  const recommendations = {
    code: [],
    fast: [],
    pro: [],
    flash: [],
    experimental: []
  };

  for (const model of models) {
    const name = model.name.toLowerCase();
    const displayName = (model.displayName || '').toLowerCase();

    if (name.includes('code') || displayName.includes('code')) {
      recommendations.code.push(model.name);
    }
    if (name.includes('flash') || name.includes('lite')) {
      recommendations.fast.push(model.name);
    }
    if (name.includes('pro')) {
      recommendations.pro.push(model.name);
    }
    if (name.includes('flash')) {
      recommendations.flash.push(model.name);
    }
    if (name.includes('exp') || name.includes('preview') || name.includes('latest')) {
      recommendations.experimental.push(model.name);
    }
  }

  return recommendations;
}

/**
 * Get models summary for quick display
 */
export function getModelsSummary(models) {
  const summary = {
    total: models.length,
    byFamily: {},
    byCapability: {},
    largestContext: null,
    newest: []
  };

  for (const model of models) {
    // Group by family (gemini-1.5, gemini-2.0, etc.)
    const family = model.name.split('-').slice(0, 2).join('-');
    summary.byFamily[family] = (summary.byFamily[family] || 0) + 1;

    // Count by capability
    for (const cap of (model.supportedGenerationMethods || [])) {
      summary.byCapability[cap] = (summary.byCapability[cap] || 0) + 1;
    }

    // Track largest context
    if (!summary.largestContext || model.inputTokenLimit > summary.largestContext.inputTokenLimit) {
      summary.largestContext = {
        name: model.name,
        inputTokenLimit: model.inputTokenLimit,
        outputTokenLimit: model.outputTokenLimit
      };
    }
  }

  // Find newest (by version or name pattern)
  summary.newest = models
    .filter(m => m.name.includes('2.5') || m.name.includes('latest'))
    .map(m => m.name)
    .slice(0, 5);

  return summary;
}

/**
 * Initialize models at startup - call this from server.js
 */
export async function initializeModels() {
  console.error('[HYDRA] Initializing Gemini models...');

  const result = await getGeminiModels(false);

  if (result.success) {
    console.error(`[HYDRA] Loaded ${result.count} models from ${result.source}`);
    if (result.source === 'cache') {
      console.error(`[HYDRA] Cache age: ${result.ageMinutes} minutes`);
    }

    const summary = getModelsSummary(result.models);
    console.error(`[HYDRA] Model families: ${Object.keys(summary.byFamily).join(', ')}`);

    if (summary.largestContext) {
      console.error(`[HYDRA] Largest context: ${summary.largestContext.name} (${summary.largestContext.inputTokenLimit} tokens)`);
    }
  } else {
    console.error(`[HYDRA] Failed to load models: ${result.error}`);
    console.error('[HYDRA] Models will be fetched on first request');
  }

  return result;
}
