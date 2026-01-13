/**
 * HYDRA Task Classifier v2 - LOCAL-FIRST AI Task Routing
 *
 * Features:
 * - Local model priority (Ollama first, always)
 * - Network connectivity detection
 * - Offline fallback with pattern matching
 * - AI-powered classification using local models
 * - Smart model selection based on task complexity
 *
 * @version 2.0.0
 */

import { checkHealth, generate, listModels } from './ollama-client.js';
import { CONFIG } from './config.js';

// Configuration - LOCAL FIRST
const ClassifierConfig = {
  // PRIMARY: Local Ollama models (preferred)
  localClassifier: {
    provider: 'ollama',
    models: [
      'llama3.2:3b',      // Best local classifier
      'phi3:mini',        // Fast alternative
      'qwen2.5:3b',       // Good reasoning
      'llama3.2:1b'       // Ultra-fast fallback
    ]
  },
  // Execution model preferences by tier
  executionModels: {
    lite: {
      local: ['llama3.2:1b', 'phi3:mini', 'qwen2.5:0.5b'],
      cloud: ['gemini-1.5-flash', 'gemini-2.0-flash-lite']
    },
    standard: {
      local: ['llama3.2:3b', 'qwen2.5-coder:7b', 'phi3:medium'],
      cloud: ['gemini-1.5-pro', 'gemini-2.0-flash']
    },
    pro: {
      local: ['llama3.3:70b', 'qwen2.5:32b', 'deepseek-coder:33b'],
      cloud: ['gemini-1.5-pro', 'gemini-2.5-pro']
    }
  },
  // Settings
  preferLocal: true,
  cacheEnabled: true,
  cacheTTLSeconds: 300,
  timeoutSeconds: 30
};

// State
const classificationCache = new Map();
let networkStatus = {
  online: null,
  lastCheck: null,
  ollamaAvailable: false,
  ollamaModels: []
};

// ============================================================================
// Network & Ollama Detection
// ============================================================================

/**
 * Test internet connectivity
 * @returns {Promise<boolean>}
 */
export async function testNetworkConnectivity() {
  // Use cached result if recent (within 30 seconds)
  if (networkStatus.lastCheck && Date.now() - networkStatus.lastCheck < 30000) {
    return networkStatus.online;
  }

  const testUrls = [
    'https://www.google.com',
    'https://api.github.com',
    'https://generativelanguage.googleapis.com'
  ];

  for (const url of testUrls) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        networkStatus.online = true;
        networkStatus.lastCheck = Date.now();
        return true;
      }
    } catch {
      // Try next URL
    }
  }

  networkStatus.online = false;
  networkStatus.lastCheck = Date.now();
  return false;
}

/**
 * Test Ollama availability and get models
 * @returns {Promise<boolean>}
 */
export async function testOllamaAvailability() {
  try {
    const health = await checkHealth();

    if (health.available) {
      networkStatus.ollamaAvailable = true;
      networkStatus.ollamaModels = health.models || [];
      return true;
    }

    networkStatus.ollamaAvailable = false;
    networkStatus.ollamaModels = [];
    return false;
  } catch {
    networkStatus.ollamaAvailable = false;
    networkStatus.ollamaModels = [];
    return false;
  }
}

/**
 * Get best available local model from preference list
 * @param {string[]} preferredModels - Models in order of preference
 * @returns {Promise<string|null>}
 */
export async function getAvailableLocalModel(preferredModels = null) {
  const models = preferredModels || ClassifierConfig.localClassifier.models;

  // Ensure we have current model list
  if (networkStatus.ollamaModels.length === 0) {
    await testOllamaAvailability();
  }

  if (!networkStatus.ollamaAvailable || networkStatus.ollamaModels.length === 0) {
    return null;
  }

  // Find first available model from preferences
  for (const preferred of models) {
    const found = networkStatus.ollamaModels.find(m =>
      m === preferred || m.startsWith(preferred.split(':')[0])
    );
    if (found) return found;
  }

  // Fallback: any available model
  return networkStatus.ollamaModels[0] || null;
}

/**
 * Get comprehensive connection status
 * @returns {Promise<Object>}
 */
export async function getConnectionStatus() {
  const [ollama, internet] = await Promise.all([
    testOllamaAvailability(),
    testNetworkConnectivity()
  ]);

  const mode = ollama && internet ? 'full'
    : ollama ? 'offline-local'
    : internet ? 'cloud-only'
    : 'offline-pattern';

  const localModel = ollama ? await getAvailableLocalModel() : null;

  return {
    localAvailable: ollama,
    ollamaAvailable: ollama,
    ollamaModels: networkStatus.ollamaModels,
    internetAvailable: internet,
    mode,
    localModel,
    recommendation: ollama ? 'local' : internet ? 'cloud' : 'pattern'
  };
}

// ============================================================================
// Classification
// ============================================================================

/**
 * Get best available classifier model - LOCAL FIRST
 * @param {Object} options
 * @returns {Promise<Object|null>}
 */
export async function getClassifierModel(options = {}) {
  const { preferCloud = false } = options;

  // Check Ollama first (unless cloud preferred)
  if (!preferCloud) {
    const localModel = await getAvailableLocalModel(ClassifierConfig.localClassifier.models);
    if (localModel) {
      return {
        provider: 'ollama',
        model: localModel,
        isLocal: true
      };
    }
  }

  // No local model available
  return null;
}

/**
 * Classification prompt for AI
 */
const CLASSIFICATION_PROMPT = `Analyze this task and respond ONLY with a JSON object (no markdown, no explanation):
{
  "category": "simple|complex|code|analysis|creative|data",
  "complexity": 1-10,
  "capabilities": ["reasoning", "code", "math", "creative", "factual"],
  "localSuitable": true/false,
  "tier": "lite|standard|pro",
  "reasoning": "brief explanation"
}

Task: `;

/**
 * AI-powered task classification
 * @param {string} prompt - The prompt to classify
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function classifyTask(prompt, options = {}) {
  const {
    forQueue = false,
    preferLocal = true,
    skipCache = false
  } = options;

  // Check cache first
  const cacheKey = `classify:${prompt.substring(0, 100)}`;
  if (!skipCache && classificationCache.has(cacheKey)) {
    const cached = classificationCache.get(cacheKey);
    if (Date.now() - cached.timestamp < ClassifierConfig.cacheTTLSeconds * 1000) {
      return { ...cached.data, fromCache: true };
    }
    classificationCache.delete(cacheKey);
  }

  // Get classifier model (LOCAL FIRST)
  const classifier = preferLocal ? await getClassifierModel() : null;

  let classification;

  if (classifier && classifier.isLocal) {
    // Use local AI classification
    console.log(`[TaskClassifier] Using LOCAL ${classifier.provider}/${classifier.model}`);

    try {
      const response = await generate(classifier.model, CLASSIFICATION_PROMPT + prompt, {
        temperature: 0.1,
        maxTokens: 256,
        timeout: ClassifierConfig.timeoutSeconds * 1000
      });

      // Parse JSON response
      const jsonMatch = response.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        classification = {
          category: parsed.category || 'simple',
          complexity: Math.min(10, Math.max(1, parseInt(parsed.complexity) || 5)),
          capabilities: parsed.capabilities || [],
          localSuitable: parsed.localSuitable !== false,
          tier: parsed.tier || 'standard',
          reasoning: parsed.reasoning || '',
          classifierModel: `${classifier.provider}/${classifier.model}`,
          classifierType: 'ai-local'
        };
      } else {
        throw new Error('Invalid JSON response');
      }
    } catch (error) {
      console.warn(`[TaskClassifier] AI classification failed: ${error.message}, using pattern fallback`);
      classification = getPatternBasedClassification(prompt);
    }
  } else {
    // Use pattern-based classification (offline fallback)
    console.log('[TaskClassifier] Using pattern-based classification (no local AI available)');
    classification = getPatternBasedClassification(prompt);
  }

  // Add queue-specific fields
  if (forQueue) {
    classification.queuePriority = complexityToPriority(classification.complexity);
    classification.estimatedTokens = estimateTokens(prompt);
  }

  // Cache result
  if (ClassifierConfig.cacheEnabled) {
    classificationCache.set(cacheKey, {
      data: classification,
      timestamp: Date.now()
    });
  }

  // Log result
  const tierLabel = classification.tier || 'standard';
  const localLabel = classification.localSuitable ? 'LOCAL' : 'CLOUD';
  console.log(`[TaskClassifier] ${classification.category} | Complexity: ${classification.complexity}/10 | Tier: ${tierLabel} | Target: ${localLabel}`);

  return { ...classification, fromCache: false };
}

/**
 * Pattern-based classification (offline fallback)
 * @param {string} prompt
 * @returns {Object}
 */
export function getPatternBasedClassification(prompt) {
  const lowerPrompt = prompt.toLowerCase();

  // Category detection patterns
  const patterns = {
    code: /\b(write|code|function|implement|script|program|class|method|api|debug|fix bug|refactor|syntax|compile)\b/i,
    analysis: /\b(analyze|explain|compare|evaluate|review|assess|examine|investigate|study|research)\b/i,
    creative: /\b(create|design|imagine|brainstorm|invent|compose|write story|poem|creative)\b/i,
    data: /\b(data|csv|json|xml|parse|extract|transform|aggregate|statistics|chart|graph)\b/i,
    simple: /\b(what is|who is|when|where|define|list|name|how many|translate)\b/i
  };

  // Detect category
  let category = 'simple';
  for (const [cat, pattern] of Object.entries(patterns)) {
    if (pattern.test(lowerPrompt)) {
      category = cat;
      break;
    }
  }

  // Complexity estimation
  let complexity = 5;
  const complexityFactors = {
    high: /\b(complex|advanced|optimize|architecture|system|comprehensive|detailed|full)\b/i,
    low: /\b(simple|basic|quick|short|brief|easy|small)\b/i
  };

  if (complexityFactors.high.test(lowerPrompt)) complexity += 2;
  if (complexityFactors.low.test(lowerPrompt)) complexity -= 2;
  if (prompt.length > 500) complexity += 1;
  if (prompt.length > 1000) complexity += 1;

  complexity = Math.min(10, Math.max(1, complexity));

  // Determine tier
  const tier = complexity <= 3 ? 'lite'
    : complexity <= 7 ? 'standard'
    : 'pro';

  // Local suitability (most tasks are local-suitable)
  const localSuitable = complexity <= 7 || category === 'simple';

  return {
    category,
    complexity,
    capabilities: detectCapabilities(lowerPrompt),
    localSuitable,
    tier,
    reasoning: 'Pattern-based classification',
    classifierModel: 'pattern-matcher',
    classifierType: 'pattern'
  };
}

/**
 * Detect required capabilities from prompt
 * @param {string} prompt
 * @returns {string[]}
 */
function detectCapabilities(prompt) {
  const capabilities = [];

  if (/\b(code|function|script|program|debug|api)\b/i.test(prompt)) capabilities.push('code');
  if (/\b(math|calculate|compute|formula|equation)\b/i.test(prompt)) capabilities.push('math');
  if (/\b(reason|logic|think|analyze|evaluate)\b/i.test(prompt)) capabilities.push('reasoning');
  if (/\b(create|imagine|story|poem|design)\b/i.test(prompt)) capabilities.push('creative');
  if (/\b(fact|data|information|who|what|when|where)\b/i.test(prompt)) capabilities.push('factual');

  return capabilities.length > 0 ? capabilities : ['factual'];
}

/**
 * Convert complexity to queue priority
 * @param {number} complexity
 * @returns {number}
 */
function complexityToPriority(complexity) {
  if (complexity <= 2) return 3; // LOW
  if (complexity <= 5) return 2; // NORMAL
  if (complexity <= 8) return 1; // HIGH
  return 0; // URGENT for very complex tasks
}

/**
 * Estimate token count for prompt
 * @param {string} prompt
 * @returns {number}
 */
function estimateTokens(prompt) {
  // Rough estimation: ~4 chars per token
  return Math.ceil(prompt.length / 4);
}

// ============================================================================
// Model Selection
// ============================================================================

/**
 * Get optimal execution model based on classification - LOCAL FIRST
 * @param {Object} classification
 * @param {Object} options
 * @returns {Promise<Object|null>}
 */
export async function getOptimalExecutionModel(classification, options = {}) {
  const { preferLocal = true, preferCheapest = false } = options;

  // Support both tier and recommendedTier keys
  let tier = classification.tier || classification.recommendedTier || 'standard';

  // Default localSuitable based on complexity
  const localSuitable = classification.localSuitable !== false &&
    (!classification.complexity || classification.complexity <= 7);

  // Validate tier exists in config
  if (!ClassifierConfig.executionModels[tier]) {
    tier = 'standard';
  }

  const tierConfig = ClassifierConfig.executionModels[tier];

  // Try local first if suitable and preferred
  if (preferLocal && localSuitable) {
    const localModel = await getAvailableLocalModel(tierConfig.local);
    if (localModel) {
      return {
        provider: 'ollama',
        model: localModel,
        isLocal: true,
        tier,
        cost: 0
      };
    }
  }

  // Fall back to cloud (Gemini)
  const hasInternet = await testNetworkConnectivity();
  if (hasInternet) {
    const cloudModel = preferCheapest ? tierConfig.cloud[tierConfig.cloud.length - 1] : tierConfig.cloud[0];
    return {
      provider: 'gemini',
      model: cloudModel,
      isLocal: false,
      tier,
      cost: 0.001 // Placeholder
    };
  }

  // Last resort: any local model
  const anyLocal = await getAvailableLocalModel(['llama3.2:1b', 'phi3:mini']);
  if (anyLocal) {
    return {
      provider: 'ollama',
      model: anyLocal,
      isLocal: true,
      tier: 'lite',
      cost: 0
    };
  }

  return null;
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Clear classification cache
 */
export function clearClassificationCache() {
  classificationCache.clear();
  console.log('[TaskClassifier] Cache cleared');
}

/**
 * Get classification statistics
 * @returns {Object}
 */
export function getClassificationStats() {
  const now = Date.now();
  let validEntries = 0;
  let expiredEntries = 0;

  for (const [, value] of classificationCache) {
    if (now - value.timestamp < ClassifierConfig.cacheTTLSeconds * 1000) {
      validEntries++;
    } else {
      expiredEntries++;
    }
  }

  return {
    totalCached: classificationCache.size,
    validEntries,
    expiredEntries,
    cacheTTLSeconds: ClassifierConfig.cacheTTLSeconds,
    classifierConfig: {
      preferLocal: ClassifierConfig.preferLocal,
      localModels: ClassifierConfig.localClassifier.models
    }
  };
}

// Export default config for external use
export { ClassifierConfig };
