/**
 * GeminiHydra - Swarm Orchestrator
 * Main orchestrator for the 6-step Witcher Swarm protocol
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';

import {
  AGENT_SPECS,
  MODEL_TIERS,
  getAgentPromptPrefix
} from './agents/definitions.js';
import {
  classifyPrompt,
  analyzeComplexity,
  needsPlanning,
  needsResearch
} from './agents/classifier.js';
import {
  STEP_PROMPTS,
  PROTOCOL_STEPS,
  parsePlan,
  createSimplePlan,
  getNextParallelGroup,
  updateTaskStatus,
  isPlanComplete,
  createTranscript,
  formatTranscriptMarkdown,
  type ProtocolStep
} from './protocol/steps.js';

import { GeminiProvider, type GeminiTier } from '../providers/gemini-provider.js';
import { LlamaCppProvider } from '../providers/llamacpp-provider.js';
import { ConnectionPool } from '../core/pool.js';

import type {
  AgentRole,
  SwarmPlan,
  SwarmTask,
  AgentResult,
  TranscriptStep,
  SwarmTranscript,
  SwarmResult,
  SwarmOptions,
  SwarmModeSettings
} from '../types/swarm.js';

/**
 * Default swarm mode settings
 */
export const DEFAULT_SWARM_SETTINGS: SwarmModeSettings = {
  maxConcurrency: 4,
  safetyBlocking: true,
  retryAttempts: 2,
  timeoutSeconds: 120
};

/**
 * Swarm execution mode
 */
export type SwarmMode = 'basic' | 'enhanced' | 'full';

/**
 * Swarm Orchestrator
 * Coordinates the 6-step protocol execution
 */
export class SwarmOrchestrator {
  private geminiProvider: GeminiProvider;
  private llamaProvider: LlamaCppProvider | null = null;
  private executorPool: ConnectionPool;
  private archivePath: string;
  private settings: SwarmModeSettings;
  private verbose: boolean;

  constructor(options: {
    geminiConfig?: ConstructorParameters<typeof GeminiProvider>[0];
    llamaConfig?: ConstructorParameters<typeof LlamaCppProvider>[0];
    archivePath?: string;
    settings?: Partial<SwarmModeSettings>;
    verbose?: boolean;
  } = {}) {
    // Initialize providers
    this.geminiProvider = new GeminiProvider(options.geminiConfig);

    // LlamaCpp is optional
    if (options.llamaConfig?.modelPath) {
      this.llamaProvider = new LlamaCppProvider(options.llamaConfig);
    }

    // Executor pool for parallel execution
    this.executorPool = new ConnectionPool({
      maxConcurrent: options.settings?.maxConcurrency ?? DEFAULT_SWARM_SETTINGS.maxConcurrency,
      maxQueueSize: 50
    });

    this.archivePath = options.archivePath ?? './.swarm/sessions';
    this.settings = { ...DEFAULT_SWARM_SETTINGS, ...options.settings };
    this.verbose = options.verbose ?? false;
  }

  /**
   * Execute full swarm protocol
   */
  async execute(query: string, options: SwarmOptions = {}): Promise<SwarmResult> {
    const sessionId = uuidv4().slice(0, 8);
    const startTime = Date.now();
    const mode = options.yoloMode ? 'yolo' : 'full';

    this.log(`Starting swarm session ${sessionId}`);
    this.log(`Query: ${query.substring(0, 100)}${query.length > 100 ? '...' : ''}`);

    // Create transcript
    const transcript = createTranscript(sessionId, query, mode);

    try {
      // Analyze complexity
      const complexity = analyzeComplexity(query);
      this.log(`Complexity: ${complexity.level} (score: ${complexity.score})`);

      // STEP 1: SPECULATE (if needed)
      if (!options.skipResearch && needsResearch(query)) {
        this.log('Step 1: Speculation (Regis)...');
        transcript.steps.speculate = await this.stepSpeculate(query);
      }

      // STEP 2: PLAN
      this.log('Step 2: Planning (Dijkstra)...');
      const speculationContext = transcript.steps.speculate?.response;
      const planResult = await this.stepPlan(query, speculationContext);
      const parsedResult = planResult.success ? parsePlan(planResult.response || '') : null;
      transcript.steps.plan = {
        result: planResult,
        parsedPlan: parsedResult ?? undefined
      };

      // Use simple plan if parsing failed
      let plan = transcript.steps.plan.parsedPlan;
      if (!plan) {
        this.log('Using simple plan (parsing failed)');
        plan = createSimplePlan(query, complexity.recommendedAgent);
        transcript.steps.plan.parsedPlan = plan;
      }

      // STEP 3: EXECUTE
      this.log(`Step 3: Executing ${plan.tasks.length} tasks...`);
      transcript.steps.execute = await this.stepExecute(plan, speculationContext);

      // STEP 4: SYNTHESIZE
      this.log('Step 4: Synthesizing results (Yennefer)...');
      transcript.steps.synthesize = await this.stepSynthesize(
        query,
        transcript.steps.execute
      );

      // STEP 5: LOG
      this.log('Step 5: Creating summary (Jaskier)...');
      transcript.steps.log = await this.stepLog(query, transcript);

      // STEP 6: ARCHIVE
      const archiveFile = await this.stepArchive(transcript);

      const duration = Date.now() - startTime;
      this.log(`Session complete in ${duration}ms`);

      return {
        success: true,
        sessionId,
        query,
        finalAnswer: transcript.steps.synthesize?.response || 'No answer generated',
        summary: transcript.steps.log?.response || '',
        duration,
        archiveFile,
        transcript
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.log(`Session failed: ${errorMessage}`);

      return {
        success: false,
        sessionId,
        query,
        finalAnswer: `Error: ${errorMessage}`,
        summary: '',
        duration,
        transcript
      };
    }
  }

  /**
   * Execute in basic mode (single agent, no protocol)
   */
  async executeBasic(query: string): Promise<SwarmResult> {
    const sessionId = uuidv4().slice(0, 8);
    const startTime = Date.now();

    // Classify and route to single agent
    const classification = classifyPrompt(query);

    this.log(`Basic mode: ${classification.agent} (${classification.tier})`);

    try {
      const result = await this.invokeAgent(
        classification.agent,
        query,
        undefined
      );

      const duration = Date.now() - startTime;

      const transcript = createTranscript(sessionId, query, 'basic');
      transcript.steps.execute = [result];

      return {
        success: result.success,
        sessionId,
        query,
        finalAnswer: result.response || result.error || '',
        summary: `Executed by ${classification.agent}`,
        duration,
        transcript
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        success: false,
        sessionId,
        query,
        finalAnswer: `Error: ${error instanceof Error ? error.message : String(error)}`,
        summary: '',
        duration,
        transcript: createTranscript(sessionId, query, 'basic')
      };
    }
  }

  /**
   * Step 1: SPECULATE
   */
  private async stepSpeculate(query: string): Promise<TranscriptStep> {
    const startTime = Date.now();

    try {
      const prompt = STEP_PROMPTS.speculate(query);
      const result = await this.geminiProvider.generateWithTier(prompt, 'coordinator');

      return {
        success: true,
        response: result.content,
        duration: Date.now() - startTime,
        agent: 'regis'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        agent: 'regis'
      };
    }
  }

  /**
   * Step 2: PLAN
   */
  private async stepPlan(query: string, context?: string): Promise<TranscriptStep> {
    const startTime = Date.now();

    try {
      const prompt = STEP_PROMPTS.plan(query, context);
      const result = await this.geminiProvider.generateWithTier(prompt, 'commander');

      return {
        success: true,
        response: result.content,
        duration: Date.now() - startTime,
        agent: 'dijkstra'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        agent: 'dijkstra'
      };
    }
  }

  /**
   * Step 3: EXECUTE
   */
  private async stepExecute(plan: SwarmPlan, context?: string): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    const completedIds: number[] = [];

    // Process parallel groups
    while (!isPlanComplete(plan)) {
      const group = getNextParallelGroup(plan, completedIds);
      if (!group || group.length === 0) break;

      this.log(`Executing parallel group: [${group.join(', ')}]`);

      // Execute tasks in parallel within group
      const groupPromises = group.map(taskId => {
        const task = plan.tasks.find(t => t.id === taskId)!;
        return this.executorPool.execute(() =>
          this.executeTask(task, context)
        );
      });

      const groupResults = await Promise.all(groupPromises);

      // Update results and completed IDs
      for (const result of groupResults) {
        results.push(result);
        if (result.success) {
          completedIds.push(result.taskId!);
          plan = updateTaskStatus(plan, result.taskId!, 'completed');
        } else {
          plan = updateTaskStatus(plan, result.taskId!, 'failed');
        }
      }
    }

    return results;
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: SwarmTask, context?: string): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      const agentRole = task.agent as import('../types/index.js').AgentRole;
      const result = await this.invokeAgent(agentRole, task.task, context);
      return {
        ...result,
        taskId: task.id
      };
    } catch (error) {
      const agentRole = task.agent as import('../types/index.js').AgentRole;
      const agentSpec = AGENT_SPECS[agentRole];
      const model = agentSpec ? MODEL_TIERS[agentSpec.tier] : 'unknown';
      return {
        success: false,
        agent: agentRole,
        model,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        taskId: task.id
      };
    }
  }

  /**
   * Invoke an agent
   */
  private async invokeAgent(
    agent: AgentRole,
    task: string,
    context?: string
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const spec = AGENT_SPECS[agent];
    const tier = spec.tier;

    try {
      const prompt = STEP_PROMPTS.execute(agent, task, context);
      let result;

      if (tier === 'executor' && this.llamaProvider) {
        // Use local llama.cpp for executors
        result = await this.llamaProvider.generate(prompt);
      } else {
        // Use Gemini for coordinators and commander
        const geminiTier: GeminiTier =
          tier === 'commander' ? 'commander' :
          tier === 'coordinator' ? 'coordinator' : 'executor';
        result = await this.geminiProvider.generateWithTier(prompt, geminiTier);
      }

      return {
        success: true,
        agent,
        model: result.model,
        response: result.content,
        duration: Date.now() - startTime,
        tokens: result.tokens
      };

    } catch (error) {
      return {
        success: false,
        agent,
        model: MODEL_TIERS[tier],
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Step 4: SYNTHESIZE
   */
  private async stepSynthesize(
    query: string,
    results: AgentResult[]
  ): Promise<TranscriptStep> {
    const startTime = Date.now();

    try {
      const prompt = STEP_PROMPTS.synthesize(query, results);
      const result = await this.geminiProvider.generateWithTier(prompt, 'coordinator');

      return {
        success: true,
        response: result.content,
        duration: Date.now() - startTime,
        agent: 'yennefer'
      };
    } catch (error) {
      // Fallback: combine results manually
      const combined = results
        .filter(r => r.success && r.response)
        .map(r => r.response)
        .join('\n\n---\n\n');

      return {
        success: false,
        response: combined || 'No results to synthesize',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        agent: 'yennefer'
      };
    }
  }

  /**
   * Step 5: LOG
   */
  private async stepLog(
    query: string,
    transcript: SwarmTranscript
  ): Promise<TranscriptStep> {
    const startTime = Date.now();

    try {
      const prompt = STEP_PROMPTS.log(query, transcript);
      const result = await this.geminiProvider.generateWithTier(prompt, 'coordinator');

      return {
        success: true,
        response: result.content,
        duration: Date.now() - startTime,
        agent: 'jaskier'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        agent: 'jaskier'
      };
    }
  }

  /**
   * Step 6: ARCHIVE
   */
  private async stepArchive(transcript: SwarmTranscript): Promise<string | undefined> {
    try {
      // Ensure archive directory exists
      await fs.mkdir(this.archivePath, { recursive: true });

      // Generate filename
      const filename = `${transcript.sessionId}_${new Date().toISOString().slice(0, 10)}.md`;
      const filepath = path.join(this.archivePath, filename);

      // Write markdown
      const markdown = formatTranscriptMarkdown(transcript);
      await fs.writeFile(filepath, markdown, 'utf-8');

      this.log(`Archived to ${filepath}`);
      return filepath;

    } catch (error) {
      this.log(`Archive failed: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  /**
   * Log message (if verbose)
   */
  private log(message: string): void {
    if (this.verbose) {
      console.log(`[Swarm] ${message}`);
    }
  }

  /**
   * Shutdown orchestrator
   */
  async shutdown(): Promise<void> {
    this.executorPool.drain();
    await this.geminiProvider.shutdown();
    if (this.llamaProvider) {
      await this.llamaProvider.shutdown();
    }
  }
}

/**
 * Create swarm orchestrator instance
 */
export function createSwarmOrchestrator(
  options?: ConstructorParameters<typeof SwarmOrchestrator>[0]
): SwarmOrchestrator {
  return new SwarmOrchestrator(options);
}
