/**
 * Agent - Main Agent class
 *
 * The core Agent class with think(), geminiThink(), geminiFallback(),
 * dijkstraChainThink(), and quality estimation methods.
 *
 * @module core/agent/Agent
 */

import chalk from 'chalk';
import ollama from 'ollama';
import { GEMINI_MODELS } from '../../config/models.config.js';
import type { AgentPersona, AgentRole } from '../../types/index.js';
import { antiCreativityMode } from '../AntiCreativityMode.js';
import { logger } from '../LiveLogger.js';
import { promptInjectionDetector } from '../PromptInjectionDetector.js';
import { AGENT_SYSTEM_PROMPTS, EXECUTION_EVIDENCE_RULES } from '../PromptSystem.js';
import { geminiSemaphore, ollamaSemaphore } from '../TrafficControl.js';
import { AGENT_PERSONAS, DIJKSTRA_CHAIN, genAI, MODEL_TIERS } from './models.js';
import { getEnhancedAdaptiveTemperature, getTemperatureController } from './temperature.js';
import type { ThinkOptions } from './types.js';
import {
  calculateConfidenceScore as _calculateConfidenceScore,
  estimateResponseQuality as _estimateResponseQuality,
  validateCodeBlocks as _validateCodeBlocks,
} from './validation.js';

// ============================================================================
// AGENT CLASS
// ============================================================================

export class Agent {
  private persona: AgentPersona;
  private modelOverride?: string;

  constructor(role: AgentRole, modelOverride?: string) {
    this.persona = AGENT_PERSONAS[role];
    // Defensive check: fallback to geralt if persona not found (prevents "Cannot read properties of undefined")
    if (!this.persona) {
      console.log(chalk.yellow(`[Agent] Invalid role "${role}" - falling back to geralt`));
      this.persona = AGENT_PERSONAS['geralt'];
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
    const timeoutMs = options?.timeout || 180000; // Default 180 seconds (3 min) for Ollama
    const externalSignal = options?.signal;

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Agent ${this.persona.name} timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Clear timeout if external signal aborts
      if (externalSignal) {
        externalSignal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new Error(`Agent ${this.persona.name} aborted by external signal`));
        });
      }
    });

    // Execute actual thinking with timeout race
    try {
      return await Promise.race([this.thinkInternal(prompt, context), timeoutPromise]);
    } catch (error: any) {
      // Re-throw with better context
      if (error.message.includes('timeout') || error.message.includes('aborted')) {
        console.log(chalk.red(`[${this.persona.name}] ${error.message}`));
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
        console.log(chalk.red(`[PromptInjection] Detected potential injection attack!`));
        console.log(
          chalk.yellow(
            `[PromptInjection] Severity: ${injectionCheck.severity}, Risk Score: ${injectionCheck.riskScore}`,
          ),
        );
        injectionCheck.details.forEach((d) => {
          console.log(chalk.gray(`  - ${d.type}: ${d.description}`));
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
          console.log(
            chalk.yellow(`[PromptInjection] Prompt sanitized, continuing with cleaned version`),
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
        console.log(
          chalk.gray(`[AntiCreativity] Applied strict factual mode for ${this.persona.name}`),
        );
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

    // OTHER AGENTS: Primary Ollama with retry + Gemini fallback
    const MAX_OLLAMA_RETRIES = 2;

    for (let attempt = 1; attempt <= MAX_OLLAMA_RETRIES; attempt++) {
      try {
        // Get adaptive temperature for this agent
        const tempResult = getEnhancedAdaptiveTemperature(this.persona.name, prompt, {
          taskType: 'general',
        });

        // Use modelOverride only if it's a valid Ollama model, otherwise use persona model or default
        // Ollama models typically contain ':' (e.g., llama3.2:3b) or start with known prefixes
        const isOllamaModelOverride =
          this.modelOverride &&
          (this.modelOverride.includes(':') ||
            this.modelOverride.startsWith('qwen') ||
            this.modelOverride.startsWith('llama') ||
            this.modelOverride.startsWith('mistral') ||
            this.modelOverride.startsWith('codellama') ||
            this.modelOverride.startsWith('deepseek') ||
            this.modelOverride.startsWith('phi'));
        const modelToUse: string = isOllamaModelOverride
          ? this.modelOverride!
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

        // Use semaphore to limit concurrent Ollama requests
        const responseText = await ollamaSemaphore.withPermit(async () => {
          logger.agentThinking(this.persona.name, 'Acquired semaphore, streaming...');

          // Stream response for live output
          let fullResponse = '';
          let tokenCount = 0;
          let lastPreview = '';
          const streamStart = Date.now();

          const stream = await ollama.generate({
            model: modelToUse,
            prompt: fullPrompt,
            stream: true,
            options: {
              temperature: tempResult.temperature,
              num_predict: 4096,
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
        });

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
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT');
        const isConnection =
          errorMsg.includes('ECONNREFUSED') ||
          errorMsg.includes('ECONNRESET') ||
          errorMsg.includes('fetch failed');
        const isBusy = errorMsg.includes('busy') || errorMsg.includes('overloaded');
        const isModelNotFound = errorMsg.includes('not found') || errorMsg.includes('model');

        // Detailed error logging
        let errorType = 'UNKNOWN';
        if (isTimeout) errorType = 'TIMEOUT';
        else if (isConnection) errorType = 'CONNECTION';
        else if (isBusy) errorType = 'BUSY';
        else if (isModelNotFound) errorType = 'MODEL_NOT_FOUND';

        const willRetry = attempt < MAX_OLLAMA_RETRIES;
        logger.agentError(
          this.persona.name,
          `Ollama ${errorType}: ${errorMsg.substring(0, 100)}`,
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
      // OPTIMIZATION: Skip per-task classification - use PRE-A result or safe default

      // IMPORTANT: Don't use modelOverride if it's an Ollama model (not valid for Gemini API)
      const isOllamaModel =
        this.modelOverride?.includes(':') ||
        this.modelOverride?.startsWith('llama') ||
        this.modelOverride?.startsWith('qwen');
      const selectedModel =
        this.modelOverride && !isOllamaModel ? this.modelOverride : MODEL_TIERS.fast;

      // ENHANCED ADAPTIVE TEMPERATURE v2.0:
      // Use agent-specific temperature profile with context awareness
      const tempResult = getEnhancedAdaptiveTemperature(this.persona.name, prompt, {
        taskType: 'general',
      });

      // Enhanced logging
      logger.apiCall('gemini', selectedModel, 'start');
      logger.agentStart(this.persona.name, prompt.substring(0, 80), selectedModel);
      logger.agentThinking(
        this.persona.name,
        `Task: ${tempResult.taskType} | Temp: ${tempResult.temperature} | MaxTokens: 8192`,
      );

      // Execute with selected model and adaptive temperature
      const model = genAI.getGenerativeModel({
        model: selectedModel,
        generationConfig: {
          temperature: tempResult.temperature, // Agent-specific adaptive temperature
          maxOutputTokens: 8192, // Increased for longer reports
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
    } catch (error: any) {
      logger.agentError(this.persona.name, `Gemini API: ${error.message}`, false);
      logger.apiCall('gemini', 'unknown', 'error', error.message);
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
    // IMPORTANT: Don't use modelOverride if it's an Ollama model (not valid for Gemini API)
    const isOllamaModel =
      this.modelOverride?.includes(':') ||
      this.modelOverride?.startsWith('llama') ||
      this.modelOverride?.startsWith('qwen');
    const fallbackModel =
      this.modelOverride && !isOllamaModel ? this.modelOverride : GEMINI_MODELS.FLASH;

    return geminiSemaphore.withPermit(async () => {
      try {
        logger.apiCall('gemini', fallbackModel, 'start');
        logger.agentThinking(this.persona.name, `Fallback to Gemini: ${fallbackModel} | Temp: 0.3`);

        const startTime = Date.now();
        const model = genAI.getGenerativeModel({
          model: fallbackModel,
          generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
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

        return responseText;
      } catch (err: any) {
        logger.agentError(this.persona.name, `Gemini fallback failed: ${err.message}`, false);
        logger.apiCall('gemini', fallbackModel, 'error', 'Agent Lobotomized');
        throw new Error(`Agent Lobotomized: Gemini fallback failed - ${err.message}`);
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
    console.log(chalk.magenta(`[Dijkstra] Activating Gemini Strategic Chain v2.0...`));

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

    console.log(
      chalk.gray(
        `[Dijkstra] Base Adaptive Temperature: ${tempResult.temperature} | ` +
          `Adjustments: ${tempResult.adjustments.join(', ')}`,
      ),
    );

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

        console.log(
          chalk.gray(
            `[Dijkstra] Attempting: ${modelConfig.name} [${modelConfig.role}] | ` +
              `Temp: ${currentTemp} | Step: ${i + 1}/${DIJKSTRA_CHAIN.length}`,
          ),
        );

        const startTime = Date.now();

        const result = await geminiSemaphore.withPermit(async () => {
          const model = genAI.getGenerativeModel({
            model: modelConfig.name,
            generationConfig: {
              temperature: currentTemp, // Context-aware adaptive temperature
              maxOutputTokens: 8192,
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

        console.log(
          chalk.green(
            `[Dijkstra] SUCCESS with ${modelConfig.name} | ` +
              `Temp: ${currentTemp} | Quality: ${(estimatedQuality * 100).toFixed(0)}% | ` +
              `Time: ${responseTime}ms`,
          ),
        );

        return response;
      } catch (error: any) {
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

        console.log(
          chalk.yellow(
            `[Dijkstra] ${modelConfig.name} failed: ${error.message} | ` +
              `Attempting next model with adjusted temperature...`,
          ),
        );
        // Continue to next model in chain
      }
    }

    throw new Error(
      'CRITICAL ERROR: Dijkstra chain exhausted. All Gemini models failed. Check API key and network.',
    );
  }
}
