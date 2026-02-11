/**
 * Agent - Main Agent class
 *
 * The core Agent class with think(), geminiThink(), geminiFallback(),
 * dijkstraChainThink(), and quality estimation methods.
 *
 * @module core/agent/Agent
 */

import ollama from 'ollama';
import { GEMINI_MODELS } from '../../config/models.config.js';
import type { AgentPersona, AgentRole } from '../../types/index.js';
import { antiCreativityMode } from '../AntiCreativityMode.js';
import { CircuitOpenError, getErrorMessage } from '../errors.js';
import { logger } from '../LiveLogger.js';
import { promptInjectionDetector } from '../PromptInjectionDetector.js';
import { AGENT_SYSTEM_PROMPTS, EXECUTION_EVIDENCE_RULES } from '../PromptSystem.js';
import { CircuitBreaker as ModernCircuitBreaker } from '../retry.js';
import { geminiSemaphore, ollamaSemaphore } from '../TrafficControl.js';
import {
  AGENT_PERSONAS,
  DIJKSTRA_CHAIN,
  genAI,
  initializeGeminiModels,
  MODEL_TIERS,
} from './models.js';

// Re-export symbols that consumers expect to import from this module
export { AGENT_PERSONAS, initializeGeminiModels };

import { getEnhancedAdaptiveTemperature, getTemperatureController } from './temperature.js';
import type { ThinkOptions } from './types.js';
import {
  calculateConfidenceScore as _calculateConfidenceScore,
  estimateResponseQuality as _estimateResponseQuality,
  validateCodeBlocks as _validateCodeBlocks,
} from './validation.js';

// ============================================================================
// CONSTANTS (FIX #28: Extract magic numbers)
// ============================================================================

/** Maximum output tokens for Gemini API calls */
const GEMINI_MAX_OUTPUT_TOKENS = 8192;
/** Maximum output tokens for Ollama local models */
const OLLAMA_MAX_PREDICT_TOKENS = 4096;
/** Default timeout for agent think() calls (ms) */
const DEFAULT_THINK_TIMEOUT_MS = 180000;
/** Maximum retry attempts for Ollama before Gemini fallback */
const MAX_OLLAMA_RETRIES = 2;
/** Fallback temperature safety multiplier */
const FALLBACK_TEMP_SAFETY_FACTOR = 0.85;
/** Minimum fallback temperature */
const MIN_FALLBACK_TEMPERATURE = 0.3;

/**
 * FIX #27: DRY - Centralized Ollama model detection
 * Checks if a model string refers to an Ollama/local model (vs Gemini cloud)
 */
function isOllamaModel(model: string | undefined): boolean {
  if (!model) return false;
  return (
    model.includes(':') ||
    model.startsWith('qwen') ||
    model.startsWith('llama') ||
    model.startsWith('mistral') ||
    model.startsWith('codellama') ||
    model.startsWith('deepseek') ||
    model.startsWith('phi')
  );
}

// ============================================================================
// CIRCUIT BREAKERS (#22: Provider-level circuit breakers)
// ============================================================================

/** Circuit breaker for Ollama provider - trips after 3 consecutive failures */
const ollamaCircuit = new ModernCircuitBreaker({
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 60000, // 60s cooldown before retry
  halfOpenMaxCalls: 1,
});

/** Circuit breaker for Gemini provider - trips after 5 consecutive failures */
const _geminiCircuit = new ModernCircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000, // 30s cooldown
  halfOpenMaxCalls: 2,
});

// ============================================================================
// AGENT INSTANCE CACHE (FIX #7: Reuse Agent instances)
// ============================================================================

const agentCache = new Map<string, Agent>();

/**
 * Get or create an Agent instance for the given role.
 * Reuses cached instances to avoid repeated construction overhead.
 */
export function getAgent(role: AgentRole, modelOverride?: string): Agent {
  const cacheKey = `${role}:${modelOverride || ''}`;
  let agent = agentCache.get(cacheKey);
  if (!agent) {
    agent = new Agent(role, modelOverride);
    agentCache.set(cacheKey, agent);
  }
  return agent;
}

// ============================================================================
// AGENT CLASS
// ============================================================================

export class Agent {
  private persona: AgentPersona;
  private modelOverride?: string;

  constructor(role: AgentRole, modelOverride?: string) {
    this.persona = AGENT_PERSONAS[role];
    // FIX #4: Log warning with structured info when persona not found
    if (!this.persona) {
      const validRoles = Object.keys(AGENT_PERSONAS).join(', ');
      logger.agentError(
        role,
        `Invalid agent role "${role}" — valid roles: [${validRoles}]. Falling back to geralt.`,
        false,
      );
      this.persona = AGENT_PERSONAS.geralt;
    }
    this.modelOverride = modelOverride;
  }

  /**
   * Execute thinking/reasoning with timeout support
   * @param prompt - The prompt to process
   * @param context - Optional context string
   * @param options - Timeout and abort options
   */
  async think(prompt: string, context: string = '', options?: ThinkOptions): Promise<string> {
    const timeoutMs = options?.timeout || DEFAULT_THINK_TIMEOUT_MS;
    const externalSignal = options?.signal;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Agent ${this.persona.name} timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      if (externalSignal) {
        externalSignal.addEventListener(
          'abort',
          () => {
            clearTimeout(timeoutId);
            reject(new Error(`Agent ${this.persona.name} aborted by external signal`));
          },
          { once: true },
        );
      }
    });

    try {
      const result = await Promise.race([this.thinkInternal(prompt, context), timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      const msg = getErrorMessage(error);
      if (msg.includes('timeout') || msg.includes('aborted')) {
        logger.agentError(this.persona.name, msg, false);
      }
      throw error;
    }
  }

  /**
   * Internal thinking logic (separated for timeout wrapper)
   * Tasks are passed as JSON for Ollama parallel execution
   * Solution 20: Now includes EXECUTION_EVIDENCE_RULES to prevent hallucinations
   * Solutions 25-26: AntiCreativityMode and PromptInjectionDetector
   */
  private async thinkInternal(prompt: string, context: string): Promise<string> {
    // Solution 26: Check for prompt injection attacks
    // Enabled by default. Set DISABLE_PROMPT_INJECTION_DETECTION=true to turn off
    const enableInjectionDetection = process.env.DISABLE_PROMPT_INJECTION_DETECTION !== 'true';

    if (enableInjectionDetection) {
      const injectionCheck = promptInjectionDetector.detectInjection(prompt);
      if (injectionCheck.detected) {
        // (#29) Use logger instead of console.log
        logger.system(
          `[PromptInjection] Detected! Severity: ${injectionCheck.severity}, Risk: ${injectionCheck.riskScore}`,
          'warn',
        );
        injectionCheck.details.forEach((d) => {
          logger.system(`  [Injection] ${d.type}: ${d.description}`, 'warn');
        });

        // For high/critical severity, reject the prompt entirely
        if (injectionCheck.severity === 'high' || injectionCheck.severity === 'critical') {
          throw new Error(
            `Prompt injection detected (${injectionCheck.severity}): ${injectionCheck.details.map((d) => d.type).join(', ')}`,
          );
        }

        // For medium severity, sanitize the prompt
        if (injectionCheck.sanitizedContent && injectionCheck.severity === 'medium') {
          prompt = injectionCheck.sanitizedContent;
          logger.system(
            '[PromptInjection] Prompt sanitized, continuing with cleaned version',
            'info',
          );
        }
      }
    }

    // Solution 25: Apply AntiCreativityMode for read/analysis tasks
    // SKIP for dijkstra (needs JSON output) and other structured-output agents
    const skipAntiCreativity = ['dijkstra', 'yennefer'].includes(this.persona.name);
    const taskLower = prompt.toLowerCase();
    const isReadOrAnalysisTask =
      taskLower.includes('odczytaj') ||
      taskLower.includes('przeczytaj') ||
      taskLower.includes('przeanalizuj') ||
      taskLower.includes('zidentyfikuj') ||
      taskLower.includes('sprawdź') ||
      taskLower.includes('read') ||
      taskLower.includes('analyze') ||
      taskLower.includes('check');

    if (isReadOrAnalysisTask && !skipAntiCreativity) {
      const wrappedPrompt = antiCreativityMode.conditionalWrap(prompt, prompt);
      if (wrappedPrompt !== prompt) {
        prompt = wrappedPrompt;
        logger.agentThinking(this.persona.name, '[AntiCreativity] Strict factual mode applied');
      }
    }

    // Użyj polskiego promptu systemowego z PromptSystem.ts
    const polishSystemPrompt =
      AGENT_SYSTEM_PROMPTS[this.persona.name] ||
      `Jesteś ${this.persona.name} (${this.persona.role}). ${this.persona.description}`;

    // Build JSON task structure for Ollama
    const taskJson = JSON.stringify({
      agent: this.persona.name,
      role: this.persona.role,
      task: prompt,
      context: context || null,
    });

    // DIJKSTRA: Use dedicated Gemini-only chain with CLEAN prompt (no EXEC rules - needs pure JSON output)
    if (this.persona.name === 'dijkstra') {
      // Dijkstra gets clean prompt - the planning prompt already contains JSON format instructions
      return this.dijkstraChainThink(prompt);
    }

    // Solution 20: Include execution evidence rules to prevent hallucinations (for non-dijkstra agents)
    // Identity context (TOŻSAMOŚĆ) is injected centrally via sessionMemory init message — see getIdentityContext()
    const fullPrompt = `
SYSTEM: ${polishSystemPrompt}

${EXECUTION_EVIDENCE_RULES}

TASK_JSON: ${taskJson}
INSTRUKCJA: Wykonaj zadanie z TASK_JSON. Odpowiadaj PO POLSKU. Zwróć tylko wynik, bez markdown.
WAŻNE: Dołącz dowody wykonania (===ZAPIS===, [ODCZYTANO], EXEC:, [MCP:], etc.)!
    `.trim();

    // REGIS: Use standard Gemini (cloud model) for deep research
    if (this.persona.model === 'gemini-cloud') {
      return this.geminiThink(fullPrompt);
    }

    // (#22) Check circuit breaker - if Ollama circuit is open, skip directly to Gemini fallback
    if (ollamaCircuit.getState() === 'open') {
      logger.agentFallback(this.persona.name, 'Ollama (circuit open)', 'Gemini');
      return this.geminiFallback(fullPrompt);
    }

    // OTHER AGENTS: Primary Ollama with retry + Gemini fallback
    for (let attempt = 1; attempt <= MAX_OLLAMA_RETRIES; attempt++) {
      try {
        // Get adaptive temperature for this agent
        const tempResult = getEnhancedAdaptiveTemperature(this.persona.name, prompt, {
          taskType: 'general',
        });

        // FIX #27: Use centralized isOllamaModel() helper instead of duplicated logic
        const modelToUse: string = isOllamaModel(this.modelOverride)
          ? (this.modelOverride ?? '')
          : this.persona.model && this.persona.model !== 'gemini-cloud'
            ? this.persona.model
            : 'qwen3:4b';

        const startTime = Date.now();

        // Enhanced logging with LiveLogger
        if (attempt === 1) {
          logger.apiCall('ollama', modelToUse, 'start');
          logger.agentStart(this.persona.name, prompt.substring(0, 80), modelToUse);
          logger.agentThinking(
            this.persona.name,
            `Temperature: ${tempResult.temperature} | Prompt: ${fullPrompt.length} chars`,
          );
        } else {
          logger.agentRetry(
            this.persona.name,
            attempt,
            MAX_OLLAMA_RETRIES,
            'Previous attempt failed',
          );
        }

        // (#22) Use circuit breaker + semaphore to limit concurrent Ollama requests
        const responseText = await ollamaCircuit.execute(() =>
          ollamaSemaphore.withPermit(async () => {
            logger.agentThinking(this.persona.name, 'Acquired semaphore, streaming...');

            // Stream response for live output
            let fullResponse = '';
            let tokenCount = 0;
            let lastPreview = '';
            const _streamStart = Date.now();

            const stream = await ollama.generate({
              model: modelToUse,
              prompt: fullPrompt,
              stream: true,
              options: {
                temperature: tempResult.temperature,
                num_predict: OLLAMA_MAX_PREDICT_TOKENS,
              },
            });

            for await (const chunk of stream) {
              fullResponse += chunk.response;
              tokenCount++;

              // Show live streaming with content preview every 10 tokens
              if (tokenCount % 10 === 0) {
                const newContent = fullResponse.substring(lastPreview.length);
                logger.agentStream(this.persona.name, newContent.substring(0, 50), tokenCount);
                lastPreview = fullResponse;
              }
            }

            logger.agentStreamEnd(this.persona.name);
            return fullResponse;
          }),
        );

        const elapsed = Date.now() - startTime;
        logger.agentSuccess(this.persona.name, {
          chars: responseText.length,
          tokens: Math.round(responseText.length / 4),
          time: elapsed,
        });
        logger.apiCall(
          'ollama',
          modelToUse,
          'end',
          `${responseText.length} chars in ${(elapsed / 1000).toFixed(1)}s`,
        );

        return responseText;
      } catch (error: unknown) {
        // (#22) If circuit breaker tripped, go directly to fallback
        if (error instanceof CircuitOpenError) {
          logger.agentFallback(this.persona.name, 'Ollama (circuit tripped)', 'Gemini');
          return this.geminiFallback(fullPrompt);
        }

        const errorMsg = getErrorMessage(error); // (#16) type-safe error extraction
        const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT');
        const isConnection =
          errorMsg.includes('ECONNREFUSED') ||
          errorMsg.includes('ECONNRESET') ||
          errorMsg.includes('fetch failed');
        const isBusy = errorMsg.includes('busy') || errorMsg.includes('overloaded');
        const isModelNotFound = errorMsg.includes('not found') || errorMsg.includes('model');

        // (#23) Detailed error categorization with user-friendly messages
        let errorType = 'UNKNOWN';
        let userHint = '';
        if (isTimeout) {
          errorType = 'TIMEOUT';
          userHint = 'Ollama is responding too slowly. Check if model is loaded: `ollama list`';
        } else if (isConnection) {
          errorType = 'CONNECTION';
          userHint = 'Cannot connect to Ollama. Is it running? Start with: `ollama serve`';
        } else if (isBusy) {
          errorType = 'BUSY';
          userHint = 'Ollama is overloaded. Too many concurrent requests.';
        } else if (isModelNotFound) {
          errorType = 'MODEL_NOT_FOUND';
          userHint = `Model not found. Pull it with: \`ollama pull ${this.modelOverride || 'qwen3:4b'}\``;
        }

        // (#22) Note: Circuit breaker state is checked at loop entry

        const willRetry = attempt < MAX_OLLAMA_RETRIES;
        logger.agentError(
          this.persona.name,
          `Ollama ${errorType}: ${errorMsg.substring(0, 100)}${userHint ? ` | 💡 ${userHint}` : ''}`,
          willRetry,
        );
        logger.apiCall(
          'ollama',
          'unknown',
          'error',
          `${errorType} - attempt ${attempt}/${MAX_OLLAMA_RETRIES}`,
        );

        // If last attempt, fallback to Gemini
        if (attempt === MAX_OLLAMA_RETRIES) {
          logger.agentFallback(this.persona.name, 'Ollama', 'Gemini');
          return this.geminiFallback(fullPrompt);
        }

        // Wait before retry (exponential backoff: 1s, 2s)
        const waitMs = attempt * 1000;
        logger.agentThinking(this.persona.name, `Waiting ${waitMs}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    // Should never reach here, but just in case
    return this.geminiFallback(fullPrompt);
  }

  private async geminiThink(prompt: string): Promise<string> {
    try {
      // OPTIMIZATION: Skip initializeGeminiModels() - already done in Swarm.initialize()

      // FIX #27: Use centralized isOllamaModel() helper
      // PER-AGENT MODEL SELECTION: Use geminiTier from AgentPersona
      // Pro agents (geralt, yennefer, dijkstra) get Gemini 3 Pro
      // Flash agents (lambert, triss, jaskier, etc.) get Gemini 3 Flash
      let selectedModel: string;
      if (this.modelOverride && !isOllamaModel(this.modelOverride)) {
        selectedModel = this.modelOverride;
      } else if (this.persona.geminiTier === 'pro') {
        selectedModel = MODEL_TIERS.pro; // gemini-3-pro-preview
      } else {
        selectedModel = MODEL_TIERS.fast; // gemini-3-flash-preview (default)
      }

      // ENHANCED ADAPTIVE TEMPERATURE v2.0:
      // Use agent-specific temperature profile with context awareness
      const tempResult = getEnhancedAdaptiveTemperature(this.persona.name, prompt, {
        taskType: 'general',
      });

      // Enhanced logging
      const tierLabel = this.persona.geminiTier === 'pro' ? '🔷 PRO' : '⚡ FLASH';
      logger.apiCall('gemini', selectedModel, 'start');
      logger.agentStart(this.persona.name, prompt.substring(0, 80), selectedModel);
      logger.agentThinking(
        this.persona.name,
        `${tierLabel} | Task: ${tempResult.taskType} | Temp: ${tempResult.temperature} | MaxTokens: 8192`,
      );

      // Execute with selected model and adaptive temperature
      const model = genAI.getGenerativeModel({
        model: selectedModel,
        generationConfig: {
          temperature: tempResult.temperature,
          maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        },
      });

      const startTime = Date.now();
      logger.agentThinking(this.persona.name, 'Sending request to Gemini API...');

      const result = await model.generateContent(prompt);
      const response = result.response;
      const responseText = response.text();
      const responseTime = Date.now() - startTime;

      // Log success with details
      const tokenEstimate = Math.round(responseText.length / 4);
      logger.agentSuccess(this.persona.name, {
        chars: responseText.length,
        tokens: tokenEstimate,
        time: responseTime,
      });
      logger.apiCall(
        'gemini',
        selectedModel,
        'end',
        `${responseText.length} chars | ~${tokenEstimate} tokens | ${(responseTime / 1000).toFixed(1)}s`,
      );

      // Learn from this generation (quality estimated from response length/structure)
      const estimatedQuality = this.estimateResponseQuality(responseText, prompt);
      const controller = getTemperatureController();
      controller.learnFromResult(
        this.persona.name,
        tempResult.temperature,
        tempResult.taskType,
        estimatedQuality,
        responseTime,
        true,
      );

      return responseText;
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logger.agentError(this.persona.name, `Gemini API: ${msg}`, false);
      logger.apiCall('gemini', 'unknown', 'error', msg);
      throw error;
    }
  }

  /**
   * Estimate response quality for temperature learning
   * @see validation.ts for implementation
   */
  private estimateResponseQuality(response: string, prompt: string): number {
    return _estimateResponseQuality(response, prompt);
  }

  /**
   * Validate code blocks in response
   * @see validation.ts for implementation
   */
  validateCodeBlocks(response: string) {
    return _validateCodeBlocks(response);
  }

  /**
   * Calculate confidence score for response
   * @see validation.ts for implementation
   */
  calculateConfidenceScore(response: string, task: string) {
    return _calculateConfidenceScore(response, task);
  }

  private async geminiFallback(prompt: string): Promise<string> {
    // FIX #27: Use centralized isOllamaModel() helper
    // For fallback, use Flash (fast + cheap) regardless of agent tier
    const fallbackModel =
      this.modelOverride && !isOllamaModel(this.modelOverride)
        ? this.modelOverride
        : GEMINI_MODELS.FLASH;

    // FIX: Use agent-specific adaptive temperature instead of hardcoded 0.3
    // Slightly reduce temperature for fallback (safety margin) but preserve agent personality
    const tempResult = getEnhancedAdaptiveTemperature(this.persona.name, prompt, {
      taskType: 'general',
      retryCount: 2, // Signal this is a fallback attempt
      confidenceLevel: 0.6, // Lower confidence since Ollama already failed
    });
    // Apply safety reduction for fallback, but never below minimum
    const fallbackTemp = Math.max(
      MIN_FALLBACK_TEMPERATURE,
      Math.round(tempResult.temperature * FALLBACK_TEMP_SAFETY_FACTOR * 100) / 100,
    );

    return geminiSemaphore.withPermit(async () => {
      try {
        logger.apiCall('gemini', fallbackModel, 'start');
        logger.agentThinking(
          this.persona.name,
          `Fallback to Gemini: ${fallbackModel} | Temp: ${fallbackTemp} (adaptive)`,
        );

        const startTime = Date.now();
        const model = genAI.getGenerativeModel({
          model: fallbackModel,
          generationConfig: {
            temperature: fallbackTemp,
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
          },
        });

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const elapsed = Date.now() - startTime;

        logger.agentSuccess(this.persona.name, {
          chars: responseText.length,
          tokens: Math.round(responseText.length / 4),
          time: elapsed,
        });
        logger.apiCall(
          'gemini',
          fallbackModel,
          'end',
          `Fallback success: ${responseText.length} chars in ${(elapsed / 1000).toFixed(1)}s`,
        );

        // Learn from fallback result for temperature optimization
        const estimatedQuality = this.estimateResponseQuality(responseText, prompt);
        const controller = getTemperatureController();
        controller.learnFromResult(
          this.persona.name,
          fallbackTemp,
          tempResult.taskType,
          estimatedQuality,
          elapsed,
          true,
        );

        return responseText;
      } catch (err: unknown) {
        const msg = getErrorMessage(err);
        logger.agentError(this.persona.name, `Gemini fallback failed: ${msg}`, false);
        logger.apiCall('gemini', fallbackModel, 'error', 'Agent Lobotomized');
        throw new Error(`Agent Lobotomized: Gemini fallback failed - ${msg}`);
      }
    });
  }

  /**
   * DIJKSTRA GEMINI-ONLY CHAIN v2.0
   * Strategic planning ONLY uses Gemini - never Ollama
   * Tries models in order: Pro → 2.5 Pro → Flash → 2.5 Flash
   * Uses ENHANCED ADAPTIVE TEMPERATURE with:
   * - Agent-specific profile for Dijkstra
   * - Temperature annealing across chain
   * - Uncertainty boost on retries
   * - Learning from results
   * Ported from AgentSwarm.psm1 lines 354-427
   */
  private async dijkstraChainThink(prompt: string): Promise<string> {
    logger.system(`[Dijkstra] Activating Gemini Strategic Chain v2.0...`, 'info');

    const controller = getTemperatureController();

    // Track results for context-aware temperature adjustment
    const chainResults: Array<{
      temperature: number;
      quality: number;
      wasSuccessful: boolean;
    }> = [];

    // Get Dijkstra-specific base temperature
    const tempResult = getEnhancedAdaptiveTemperature('dijkstra', prompt, {
      taskType: 'planning',
      totalSteps: DIJKSTRA_CHAIN.length,
    });

    logger.system(
      `[Dijkstra] Base Adaptive Temperature: ${tempResult.temperature} | ` +
        `Adjustments: ${tempResult.adjustments.join(', ')}`,
      'debug',
    );

    const chainExecution = async (): Promise<string> => {
      for (let i = 0; i < DIJKSTRA_CHAIN.length; i++) {
        const modelConfig = DIJKSTRA_CHAIN[i];

        try {
          // Calculate temperature with full context
          const stepTempResult = getEnhancedAdaptiveTemperature('dijkstra', prompt, {
            taskType: 'planning',
            currentStep: i,
            totalSteps: DIJKSTRA_CHAIN.length,
            previousResults: chainResults,
            // Confidence decreases with each retry
            confidenceLevel: 1 - i * 0.2,
            retryCount: i,
          });

          const currentTemp = stepTempResult.temperature;

          logger.system(
            `[Dijkstra] Attempting: ${modelConfig.name} [${modelConfig.role}] | ` +
              `Temp: ${currentTemp} | Step: ${i + 1}/${DIJKSTRA_CHAIN.length}`,
            'debug',
          );

          const startTime = Date.now();

          const result = await geminiSemaphore.withPermit(async () => {
            const model = genAI.getGenerativeModel({
              model: modelConfig.name,
              generationConfig: {
                temperature: currentTemp,
                maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
              },
            });

            return model.generateContent(prompt);
          });

          const response = result.response.text().trim();
          const responseTime = Date.now() - startTime;

          if (!response) {
            throw new Error('Empty response');
          }

          // Estimate quality and record for learning
          const estimatedQuality = this.estimateResponseQuality(response, prompt);

          // Record successful result
          chainResults.push({
            temperature: currentTemp,
            quality: estimatedQuality,
            wasSuccessful: true,
          });

          // Learn from successful generation
          controller.learnFromResult(
            'dijkstra',
            currentTemp,
            'planning',
            estimatedQuality,
            responseTime,
            true,
          );

          logger.system(
            `[Dijkstra] ✓ SUCCESS with ${modelConfig.name} | ` +
              `Temp: ${currentTemp} | Quality: ${(estimatedQuality * 100).toFixed(0)}% | ` +
              `Time: ${responseTime}ms`,
            'info',
          );

          return response;
        } catch (error: unknown) {
          const errMsg = getErrorMessage(error);
          // Record failed attempt
          chainResults.push({
            temperature: tempResult.temperature + i * 0.05,
            quality: 0,
            wasSuccessful: false,
          });

          // Learn from failure
          controller.learnFromResult(
            'dijkstra',
            tempResult.temperature + i * 0.05,
            'planning',
            0,
            0,
            false,
          );

          logger.system(
            `[Dijkstra] ${modelConfig.name} failed: ${errMsg} | ` +
              `Attempting next model with adjusted temperature...`,
            'warn',
          );
          // Continue to next model in chain
        }
      }

      throw new Error(
        'CRITICAL ERROR: Dijkstra chain exhausted. All Gemini models failed. Check API key and network.',
      );
    };

    // Wrap chain in timeout to prevent indefinite blocking
    const CHAIN_TIMEOUT_MS = 5 * 60 * 1000;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Dijkstra chain timeout after ${CHAIN_TIMEOUT_MS}ms`)),
        CHAIN_TIMEOUT_MS,
      );
    });

    try {
      const result = await Promise.race([chainExecution(), timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
