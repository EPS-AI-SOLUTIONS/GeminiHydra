/**
 * Swarm - Main orchestration engine for GeminiHydra
 * Full Node.js implementation with all phases from PowerShell
 *
 * Protocol v14.0 "School of the Wolf" (Node.js Full Edition)
 *
 * Phases:
 * - A: Dijkstra Planning
 * - B: Graph Processor Execution
 * - C: Self-Healing Evaluation & Repair
 * - D: Final Synthesis
 *
 * @module core/swarm/Swarm
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { GEMINI_MODELS } from '../../config/models.config.js';
import { mcpManager } from '../../mcp/index.js';
import { sessionCache } from '../../memory/SessionCache.js';
import {
  type AgentVectorMemory,
  agentVectorMemory,
  VectorStore,
} from '../../memory/VectorStore.js';
import {
  type ExecutionResult,
  resolveAgentRoleSafe,
  type SwarmPlan,
  type SwarmTask,
} from '../../types/index.js';
import { AGENT_PERSONAS, Agent, initializeGeminiModels } from '../agent/Agent.js';
import {
  codeAnalysisEngine,
  getCodeContext,
  shouldUseCodeAnalysis,
} from '../CodeAnalysisEngine.js';
import { initExecutionEngine } from '../execution/index.js';
import { validateFinalReport } from '../FinalReportValidator.js';
import { executeGraphTasks, GraphProcessor } from '../GraphProcessor.js';
import {
  contextManager,
  decomposeQuery,
  enhanceWithIntelligence,
  knowledgeGraph,
  selfReflect,
  semanticCache,
} from '../intelligence/index.js';
import { logger } from '../LiveLogger.js';
import { ollamaManager } from '../OllamaManager.js';
import { sanitizeOutput } from '../OutputSanitizer.js';
import { type LessonLearned, type RepairTask, selfHealingLoop } from '../PhaseC.js';
import { promptAudit } from '../PromptAudit.js';
import { buildPlanningPrompt } from '../PromptSystem.js';
// Anti-hallucination solutions (Solutions 21-24)
import { responseDeduplicator } from '../ResponseDeduplicator.js';
import { resultHashVerifier } from '../ResultHashVerifier.js';
// Verification Agent (Keira Metz - inter-phase quality gate)
import { type PhaseVerdict, VerificationAgent } from '../VerificationAgent.js';
import { BoundedResultStore } from './BoundedResultStore.js';
import {
  buildMcpContext,
  cleanJson,
  generateNextStepSuggestions,
  validateAgentResults,
} from './helpers.js';
// Local modules
import type { YoloConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

// ============================================================================
// SWARM CLASS
// ============================================================================

export class Swarm {
  private memory: VectorStore;
  private agentMemory: AgentVectorMemory;
  private config: YoloConfig;
  private graphProcessor: GraphProcessor;
  private abortController: AbortController | null = null;
  private resultStore: BoundedResultStore<ExecutionResult>;

  constructor(memoryPath: string, config: YoloConfig = {}) {
    this.memory = new VectorStore(memoryPath);
    this.agentMemory = agentVectorMemory;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize bounded result store (Fix #14)
    this.resultStore = new BoundedResultStore<ExecutionResult>(
      this.config.maxStoredResults ?? 500,
      this.config.resultTtlMs ?? 60 * 60 * 1000,
    );

    // Initialize default graph processor (will be recreated per-task with optimal model)
    this.graphProcessor = new GraphProcessor({
      yolo: this.config.yolo,
      maxConcurrency: this.config.maxConcurrency,
      rootDir: this.config.rootDir, // CRITICAL: Pass project root for path validation
    });
  }

  /**
   * Cancel the currently running objective (Fix #12)
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      logger.system('[Swarm] Cancellation requested', 'warn');
    }
  }

  /**
   * Create GraphProcessor with specific model for task
   * If forceOllama is enabled, all agents will use Ollama for parallel execution
   */
  private createGraphProcessor(preferredModel?: string): GraphProcessor {
    return new GraphProcessor({
      yolo: this.config.yolo,
      maxConcurrency: this.config.maxConcurrency,
      preferredModel: preferredModel,
      rootDir: this.config.rootDir, // CRITICAL: Pass project root for path validation
      forceOllama: this.config.forceOllama, // Phase B optimization
      ollamaModel: this.config.ollamaModel, // Specific Ollama model
    });
  }

  /**
   * Initialize all systems (PARALLEL for speed - saves ~500ms)
   */
  async initialize() {
    logger.system('[Swarm] Initializing systems...', 'debug');

    // PARALLEL INIT - all independent systems at once
    await Promise.all([
      // Group 1: Memory systems
      this.memory.load(),
      sessionCache.load(),

      // Group 2: Gemini (fast, just checks API)
      initializeGeminiModels(),

      // Group 3: Ollama (can be slow, but independent)
      ollamaManager
        .ensure()
        .then(() => {
          // Start health monitoring after Ollama is up
          ollamaManager.startMonitoring(15000); // Check every 15 seconds
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          logger.system(`[Swarm] Ollama warning: ${msg}`, 'warn');
        }),

      // Group 4: MCP (independent, parallel already)
      mcpManager.init({ projectRoot: this.config.rootDir }).catch(() => {
        logger.system('[Swarm] MCP initialization skipped', 'debug');
      }),

      // Group 5: Execution Engine (templates, etc.)
      this.config.enableExecutionEngine
        ? initExecutionEngine(this.config.executionEngineConfig)
        : Promise.resolve(),
    ]);

    logger.system('[Swarm] Systems ready', 'info');
  }

  /**
   * Execute an objective through the full protocol
   */
  async executeObjective(objective: string): Promise<string> {
    // === SOLUTION 1: IMMUTABLE ORIGINAL OBJECTIVE ===
    const ORIGINAL_OBJECTIVE: Readonly<string> = Object.freeze(objective);

    // Initialize prompt audit trail
    promptAudit.initialize(objective);

    const startTime = Date.now();

    // === FIX #12: TIMEOUT / CANCELLATION ===
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const totalTimeoutMs = this.config.totalTimeoutMs ?? 30 * 60 * 1000;
    const totalTimeoutHandle = setTimeout(() => {
      if (!signal.aborted) {
        logger.system(
          `[Swarm] TOTAL TIMEOUT reached (${(totalTimeoutMs / 60000).toFixed(0)} min). Aborting execution...`,
          'error',
        );
        this.abortController?.abort();
      }
    }, totalTimeoutMs);

    const checkAborted = (): boolean => {
      if (signal.aborted) {
        logger.system('[Swarm] Execution was cancelled or timed out', 'warn');
        return true;
      }
      return false;
    };

    const withTaskTimeout = <T>(
      promise: Promise<T>,
      label: string,
      timeoutMs?: number,
    ): Promise<T> => {
      const taskTimeoutMs = timeoutMs ?? this.config.taskTimeoutMs ?? 5 * 60 * 1000;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Task timeout after ${(taskTimeoutMs / 1000).toFixed(0)}s: ${label}`));
        }, taskTimeoutMs);

        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error(`Execution cancelled: ${label}`));
        };
        signal.addEventListener('abort', onAbort, { once: true });

        promise.then(
          (val) => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            resolve(val);
          },
          (err) => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            reject(err);
          },
        );
      });
    };

    try {
      logger.system('═'.repeat(60), 'info');
      logger.system('  SCHOOL OF THE WOLF: PROTOCOL v14.0 (Node.js Full)', 'info');
      logger.system('═'.repeat(60), 'info');

      // Initialize session
      await sessionCache.clear();
      await sessionCache.setObjective(ORIGINAL_OBJECTIVE);
      await sessionCache.appendChronicle('Mission started');

      const refinedObjective = objective;
      const selectedModel: string =
        this.config.forceModel === 'pro' ? GEMINI_MODELS.PRO : GEMINI_MODELS.FLASH;

      await sessionCache.setRefinedObjective(refinedObjective);

      // Intelligence: Query Decomposition
      let decomposedQueries: string[] = [refinedObjective];

      if (
        this.config.enableIntelligenceLayer &&
        this.config.intelligenceConfig?.useQueryDecomposition
      ) {
        logger.system('🧠 INTELLIGENCE: Query Decomposition', 'info');

        const decomposition = await decomposeQuery(refinedObjective);
        if (decomposition.subQueries.length > 1) {
          decomposedQueries = decomposition.subQueries.map((sq) => sq.query);
          logger.system(`   Decomposed into ${decomposedQueries.length} sub-queries`, 'debug');
          contextManager.add(
            `Zadanie rozłożone na: ${decomposedQueries.join('; ')}`,
            'system',
            0.7,
          );
        }
      }

      // =========================================
      // PHASE A: DIJKSTRA PLANNING
      // =========================================
      logger.phaseStart('A', 'DIJKSTRA PLANNING');

      const planner = new Agent('dijkstra');
      logger.agentStart('dijkstra', 'Creating execution plan', 'gemini-cloud');

      logger.agentThinking('dijkstra', 'Gathering memory context...');
      const legacyMemories = await this.memory.search(refinedObjective);
      const dijkstraMemories = await this.agentMemory.getContextual('dijkstra', refinedObjective);

      logger.agentThinking('dijkstra', 'Building MCP tools context...');
      const mcpContext = buildMcpContext();

      // Code Analysis (for code tasks)
      let codeAnalysisContext = '';
      const rootDir = this.config.rootDir || process.cwd();

      if (shouldUseCodeAnalysis(refinedObjective)) {
        logger.agentThinking(
          'dijkstra',
          'Detected code task - activating Gemini 3 + Serena analysis...',
        );
        logger.system('🔍 CODE ANALYSIS: Gemini 3 + Serena integration active', 'info');

        try {
          await codeAnalysisEngine.init(rootDir);
          codeAnalysisContext = await getCodeContext(refinedObjective, rootDir);

          if (codeAnalysisContext) {
            logger.system('[Phase A] Code context added via LSP/Serena', 'debug');
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.system(`   Code analysis skipped: ${msg}`, 'warn');
        }
      }

      const planPrompt = buildPlanningPrompt({
        objective: refinedObjective,
        availableAgents: Object.keys(AGENT_PERSONAS),
        mcpTools: mcpContext + codeAnalysisContext,
        memories: dijkstraMemories || JSON.stringify(legacyMemories),
      });

      logger.agentThinking('dijkstra', `Planning prompt: ${planPrompt.length} chars`);

      let plan: SwarmPlan;
      try {
        if (checkAborted()) {
          clearTimeout(totalTimeoutHandle);
          return 'Execution cancelled before planning phase.';
        }

        const planStart = Date.now();
        const planJsonRaw = await withTaskTimeout(
          planner.think(planPrompt),
          'Phase A: Dijkstra Planning',
        );
        const planTime = Date.now() - planStart;

        const jsonStr = cleanJson(planJsonRaw);
        plan = JSON.parse(jsonStr);

        if (!plan.tasks || !Array.isArray(plan.tasks)) {
          throw new Error('Invalid plan structure: missing tasks array');
        }

        // Normalize agent names
        const validAgentRoles = Object.keys(AGENT_PERSONAS);
        for (const task of plan.tasks) {
          if (task.agent) {
            const normalizedAgent = String(task.agent).toLowerCase();
            const resolved = resolveAgentRoleSafe(normalizedAgent);
            if (normalizedAgent !== resolved && !validAgentRoles.includes(normalizedAgent)) {
              logger.system(
                `[Swarm] Unknown agent "${task.agent}" -> mapping to ${resolved}`,
                'warn',
              );
            }
            task.agent = resolved;
          }
        }

        // Enhance vague tasks
        const taskRootDir = this.config.rootDir || process.cwd();
        for (const task of plan.tasks) {
          const taskLower = task.task.toLowerCase();

          const tooVaguePatterns = [
            {
              pattern: /^odczytaj\s+(kod|zawartość|plik)/i,
              fix: (t: string) => `${t} - użyj EXEC: type "ścieżka"`,
            },
            { pattern: /^przeanalizuj\s+/i, fix: (t: string) => `${t} w katalogu ${taskRootDir}` },
            {
              pattern: /^napraw\s+/i,
              fix: (t: string) => `${t} - najpierw odczytaj plik, potem użyj ===ZAPIS===`,
            },
            {
              pattern: /^zidentyfikuj\s+/i,
              fix: (t: string) => `${t} w plikach .ts w ${taskRootDir}/src`,
            },
          ];

          for (const { pattern, fix } of tooVaguePatterns) {
            if (
              pattern.test(task.task) &&
              !task.task.includes(taskRootDir) &&
              !task.task.includes('EXEC:')
            ) {
              const improved = fix(task.task);
              logger.system(
                `[Plan] Ulepszam zadanie: "${task.task.substring(0, 40)}..." → dodaję kontekst`,
                'debug',
              );
              task.task = improved;
            }
          }

          if (
            !task.task.includes(taskRootDir) &&
            !task.task.includes('src/') &&
            !task.task.includes('EXEC:')
          ) {
            if (/plik|kod|moduł|katalog|folder|directory/i.test(taskLower)) {
              task.task = `${task.task} (projekt: ${taskRootDir})`;
            }
          }

          if (/napisz|stwórz|zaimplementuj|dodaj.*funkcj|dodaj.*interfejs/i.test(taskLower)) {
            if (!task.task.includes('TypeScript') && !task.task.includes('.ts')) {
              task.task = `${task.task} [TypeScript, NIE Python/Ruby]`;
            }
          }
        }

        logger.agentSuccess('dijkstra', { chars: planJsonRaw.length, time: planTime });
        logger.system(
          `Plan created: ${plan.tasks.length} tasks in ${(planTime / 1000).toFixed(1)}s`,
          'info',
        );
        await sessionCache.setPlan(JSON.stringify(plan));
        await sessionCache.appendChronicle(`Plan created with ${plan.tasks.length} tasks`);

        logger.phaseEnd('A', { tasks: plan.tasks.length, success: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.agentError('dijkstra', msg, false);
        logger.phaseEnd('A', { success: false, error: msg });
        await sessionCache.appendChronicle(`Planning failed: ${msg}`);
        return `Critical Error: Planning failed - ${msg}`;
      }

      // =========================================
      // VERIFICATION GATE: Phase A (Keira Metz)
      // =========================================
      if (this.config.enableVerification) {
        const verifier = new VerificationAgent(this.config.verificationConfig);
        const phaseAVerdict: PhaseVerdict = await verifier.verifyPhaseA(plan, ORIGINAL_OBJECTIVE);
        if (!verifier.shouldContinue(phaseAVerdict)) {
          logger.system(
            `[Keira] Phase A FAILED verification (score: ${phaseAVerdict.score}). Aborting pipeline.`,
            'error',
          );
          clearTimeout(totalTimeoutHandle);
          return `Verification failed after Phase A (score: ${phaseAVerdict.score}/100): ${phaseAVerdict.issues.join('; ')}`;
        }
      }

      // =========================================
      // PHASE B: EXECUTION
      // =========================================

      if (checkAborted()) {
        clearTimeout(totalTimeoutHandle);
        return 'Execution cancelled before Phase B.';
      }

      const taskProcessor = this.createGraphProcessor(selectedModel);

      let executionResults: ExecutionResult[];
      try {
        executionResults = await withTaskTimeout(
          taskProcessor.process(plan.tasks),
          'Phase B: Task Execution',
          this.config.totalTimeoutMs ?? 30 * 60 * 1000,
        );
      } catch (phaseBError: unknown) {
        const phaseBMsg = phaseBError instanceof Error ? phaseBError.message : String(phaseBError);
        if (signal.aborted || phaseBMsg.includes('timeout')) {
          logger.system(
            `[Swarm] Phase B interrupted: ${phaseBMsg}. Gathering partial results...`,
            'warn',
          );
          const _partialStatus = taskProcessor.getStatus();
          executionResults = [] as ExecutionResult[];
          if (executionResults.length === 0) {
            executionResults = [
              {
                id: 0,
                success: false,
                error: `Phase B interrupted: ${phaseBMsg}`,
                logs: [
                  `Execution was interrupted after ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
                ],
              },
            ];
          }
          logger.system(`[Swarm] Recovered ${executionResults.length} partial results`, 'warn');
        } else {
          throw phaseBError;
        }
      }

      // Store results in bounded store (Fix #14)
      for (const result of executionResults) {
        this.resultStore.set(`task-${result.id}-${Date.now()}`, result);
      }

      await sessionCache.appendChronicle(
        `Execution completed: ${executionResults.length} tasks (model: ${selectedModel})`,
      );

      if (checkAborted()) {
        clearTimeout(totalTimeoutHandle);
        const partialReport =
          `Execution cancelled during Phase B.\n\nPartial results (${executionResults.length} tasks completed):\n` +
          executionResults
            .filter((r) => r.success)
            .map((r) => `- Task #${r.id}: ${(r.logs?.[0] || '').substring(0, 200)}`)
            .join('\n');
        return partialReport;
      }

      // =========================================
      // VERIFICATION GATE: Phase B (Keira Metz)
      // =========================================
      if (this.config.enableVerification) {
        const verifier = new VerificationAgent(this.config.verificationConfig);
        const phaseBVerdict: PhaseVerdict = await verifier.verifyPhaseB(
          executionResults,
          plan,
          ORIGINAL_OBJECTIVE,
        );
        // Phase B FAIL does NOT abort — proceeds to Phase C for self-healing
        if (phaseBVerdict.verdict === 'FAIL') {
          logger.system(
            `[Keira] Phase B verification: FAIL (score: ${phaseBVerdict.score}). Proceeding to Phase C for self-healing.`,
            'warn',
          );
        }
      }

      // =========================================
      // PHASE C: SELF-HEALING EVALUATION
      // =========================================
      logger.phaseStart('C', 'SELF-HEALING EVALUATION');

      let finalResults = executionResults;
      let missionSuccess = true;

      const hasRealErrors = executionResults.some((r) => {
        if (!r.success) return true;
        const logs = r.logs?.join(' ') || '';
        return /error|denied|not found|ENOENT|failed|outside allowed/i.test(logs);
      });

      const skipPhaseC =
        plan.tasks.length === 1 && executionResults.every((r) => r.success) && !hasRealErrors;

      if (this.config.enablePhaseC && !skipPhaseC) {
        logger.system(`Analyzing ${executionResults.length} task results for errors...`, 'info');
        const phaseCResult = await selfHealingLoop(
          refinedObjective,
          executionResults,
          {
            maxRetries: this.config.maxRepairCycles,
            saveLesson: true,
            onLessonLearned: async (lesson: LessonLearned) => {
              await this.agentMemory.add(
                'dijkstra',
                'LessonLearned',
                `Objective: ${lesson.objective}\nProblem: ${lesson.problem}\nSolution: ${lesson.solution}`,
                'lesson,repair,self-healing',
              );
            },
          },
          async (repairTasks: RepairTask[]) => {
            logger.system(`[PHASE C] Executing ${repairTasks.length} repair tasks...`, 'info');
            const fullTasks: SwarmTask[] = repairTasks.map((rt) => ({
              id: rt.id,
              agent: rt.agent,
              task: rt.task,
              dependencies: rt.dependencies || [],
              status: 'pending' as const,
              retryCount: 0,
            }));
            return executeGraphTasks(fullTasks, { yolo: this.config.yolo, maxRetries: 2 });
          },
        );

        finalResults = phaseCResult.finalResults;
        missionSuccess = phaseCResult.success;

        await sessionCache.appendChronicle(
          `Self-healing: ${phaseCResult.repairCycles} cycles, success: ${missionSuccess}`,
        );

        if (missionSuccess && plan.tasks.length > 1) {
          await this.agentMemory.add(
            'dijkstra',
            'WorkflowPattern',
            `Objective: ${refinedObjective}\nTasks: ${plan.tasks.map((t) => t.task).join('; ')}`,
            'workflow,success,pattern',
          );
        }
      } else if (skipPhaseC) {
        logger.system('Skipped (simple task or all tasks succeeded)', 'debug');
        missionSuccess = executionResults.every((r) => r.success);
      }

      logger.phaseEnd('C', { success: missionSuccess });

      if (!promptAudit.validateIntent(70)) {
        console.log(
          chalk.yellow('[WARNING] Prompt drift detected! Using original objective for synthesis.'),
        );
        console.log(promptAudit.getSummary());
      }

      // =========================================
      // VERIFICATION GATE: Phase C (Keira Metz)
      // =========================================
      if (this.config.enableVerification && this.config.enablePhaseC && !skipPhaseC) {
        const verifier = new VerificationAgent(this.config.verificationConfig);
        const _phaseCVerdict: PhaseVerdict = await verifier.verifyPhaseC(
          {
            repairCycles: 0,
            repairedTasks: finalResults.filter((r) => r.repairAttempt).length,
            successRateBefore: Math.round(
              (executionResults.filter((r) => r.success).length / executionResults.length) * 100,
            ),
            successRateAfter: Math.round(
              (finalResults.filter((r) => r.success).length / finalResults.length) * 100,
            ),
          },
          executionResults,
          ORIGINAL_OBJECTIVE,
        );
      }

      // =========================================
      // PHASE D: FINAL SYNTHESIS
      // =========================================
      logger.phaseStart('D', 'FINAL SYNTHESIS');

      const _synthesisSpinner = logger.spin('synthesis', 'Regis is synthesizing final report...');
      logger.agentStart('regis', 'Synthesizing final report', selectedModel);
      const synthesizer = new Agent('regis', selectedModel);

      // Validate results before synthesis
      const hallucinationWarnings: string[] = [];
      const validatedResults = validateAgentResults(finalResults, hallucinationWarnings);
      if (hallucinationWarnings.length > 0) {
        console.log(
          chalk.yellow('\n[OSTRZEŻENIE] Wykryto potencjalne halucynacje w wynikach agentów:'),
        );
        for (const w of hallucinationWarnings) console.log(chalk.yellow(`  ${w}`));
      }

      const synthesisResults = validatedResults.map((r) => ({
        id: r.id,
        success: r.success,
        content: (r.logs ?? [])[0]?.substring(0, 6000) || '',
        error: r.error,
      }));

      const _totalContentSize = synthesisResults.reduce((sum, r) => sum + r.content.length, 0);
      const successfulTasks = synthesisResults.filter((r) => r.success);

      // SMART PASSTHROUGH
      if (
        successfulTasks.length === 1 &&
        successfulTasks[0].content.length > 1000 &&
        missionSuccess
      ) {
        logger.spinSuccess('synthesis', 'Mission Complete (Direct Output)');

        const directResult = successfulTasks[0].content;
        const report = `🐺 **Misja zakończona sukcesem**\n\n${directResult}`;

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        await sessionCache.appendChronicle(
          `Mission completed in ${duration}s. Success: ${missionSuccess} (passthrough)`,
        );
        await sessionCache.flush();

        console.log(chalk.cyan(`\n${'='.repeat(60)}`));
        console.log(chalk.cyan('  MISSION SUCCESSFUL (DIRECT OUTPUT)'));
        console.log(chalk.gray(`  Original objective: "${objective.substring(0, 50)}..."`));
        console.log(chalk.gray(`  Duration: ${duration}s | Tasks: ${finalResults.length}`));
        console.log(chalk.cyan(`${'='.repeat(60)}\n`));

        return report;
      }

      const synthesisPrompt = `
═══════════════════════════════════════════════════════════════════
⛔ KRYTYCZNE ZASADY ANTY-HALUCYNACYJNE - PRZECZYTAJ PRZED SYNTEZĄ!
═══════════════════════════════════════════════════════════════════

BEZWZGLĘDNIE ZABRONIONYCH JEST:
1. WYMYŚLANIE nazw plików, klas, funkcji które NIE pojawiły się w wynikach agentów
2. GENEROWANIE kodu którego agent NIE dostarczył
3. PODAWANIE ścieżek do plików bez DOSŁOWNEGO cytowania z wyników
4. TWORZENIE fikcyjnych szczegółów implementacji
5. UŻYWANIE generycznych nazw jak: file1.ts, Class1.ts, test1.test.ts, helpers.ts

WYMAGANIA CYTOWANIA:
6. KAŻDA informacja MUSI być oznaczona źródłem: [Zadanie #X]
7. Format cytatu: "tekst dosłowny" [Zadanie #X]
8. Jeśli łączysz informacje z wielu zadań: [Zadania #X, #Y]
9. Bez cytatu = bez informacji - nie podawaj niczego co nie ma źródła
10. Przykład poprawny: "Plik został zmodyfikowany" [Zadanie #3]
11. Przykład niepoprawny: Plik został zmodyfikowany (brak źródła!)

OBOWIĄZKOWE:
- KAŻDA nazwa pliku w raporcie MUSI DOSŁOWNIE pochodzić z sekcji WYNIKI poniżej
- Gdy agent NIE podał szczegółów - pisz: "[Agenci nie dostarczyli szczegółów]"
- CYTUJ DOSŁOWNIE wyniki agentów lub NIE CYTUJ WCALE
- Jeśli nie ma konkretnych artefaktów - napisz to wprost

═══════════════════════════════════════════════════════════════════

ORYGINALNY CEL UŻYTKOWNIKA: ${objective}
CEL PO PRZETWORZENIU: ${refinedObjective}

WYNIKI WYKONANIA PRZEZ AGENTÓW:
${synthesisResults
  .map(
    (r) => `
=== ZADANIE #${r.id} (${r.success ? 'SUKCES' : 'BŁĄD'}) ===
${r.content}
${r.error ? `BŁĄD: ${r.error}` : ''}
`,
  )
  .join('\n')}

STATUS MISJI: ${missionSuccess ? 'SUKCES' : 'CZĘŚCIOWY/NIEUDANY'}

═══════════════════════════════════════════════════════════════════
OBOWIĄZKOWY FORMAT RAPORTU (5 SEKCJI):
═══════════════════════════════════════════════════════════════════

## Podsumowanie
[2-3 zdania - CZY cel "${objective}" został zrealizowany?]

## Zgodność z celem użytkownika
- **ORYGINALNY CEL UŻYTKOWNIKA (NIEZMIENIONY):** ${objective}
- **Cel po przetworzeniu:** ${refinedObjective}
- **Czy cel po przetworzeniu odpowiada oryginałowi?:** [TAK/NIE - jeśli NIE, opisz rozbieżność]
- **Zrealizowano oryginalny cel:** [TAK/NIE/CZĘŚCIOWO - oceniaj względem ORYGINALNEGO celu, nie przetworzonego!]
- **Dostarczone artefakty:** [TYLKO te które DOSŁOWNIE pojawiły się w wynikach]
- **Czego brakuje do pełnej realizacji ORYGINALNEGO celu:** [jeśli cokolwiek]

## Wyniki
[TYLKO DOSŁOWNE CYTATY z wyników agentów - KAŻDY z oznaczeniem [Zadanie #X]!]
[Format: "cytat" [Zadanie #X]]
[Jeśli agent podał listę - przepisz DOSŁOWNIE z [Zadanie #X]]
[Jeśli agent NIE podał szczegółów - napisz: "Brak szczegółów" [Zadanie #X]]
[NIE WYMYŚLAJ - każda informacja MUSI mieć źródło!]

## Problemy
[Cytuj błędy DOSŁOWNIE z wyników lub: "Brak problemów."]

## Rekomendacje
[Oparte TYLKO na faktycznych wynikach - nie wymyślaj co można zrobić]

ZASADY:
- PIERWSZA linia = ## Podsumowanie
- Pisz PO POLSKU
- NIE WYMYŚLAJ - tylko cytuj dosłownie
- Lepiej napisać "brak danych" niż wymyślić cokolwiek
`;

      let report = await synthesizer.think(synthesisPrompt, `Original objective: ${objective}`);

      // Anti-Hallucination: Solutions 21-24
      const deduplicationResult = responseDeduplicator.checkDuplicates(
        finalResults.map((r) => r.logs?.[0] || ''),
      );
      if (deduplicationResult.hasDuplicates) {
        console.log(
          chalk.yellow(
            `[Anti-Hallucination] Detected ${deduplicationResult.duplicates.length} duplicate responses`,
          ),
        );
        for (const d of deduplicationResult.duplicates) {
          console.log(
            chalk.gray(
              `  - Tasks ${d.indices.join(', ')}: ${(d.similarity * 100).toFixed(0)}% similarity`,
            ),
          );
        }
      }

      const hashResults = finalResults.map((r) => ({
        id: r.id,
        hash: resultHashVerifier.computeHash(r.logs?.[0] || ''),
        content: r.logs?.[0] || '',
      }));
      resultHashVerifier.registerHashes(hashResults.map((h) => ({ id: h.id, hash: h.hash })));

      const sanitizeResult = sanitizeOutput(report);
      report = sanitizeResult.content;

      const validationResult = validateFinalReport(report, ORIGINAL_OBJECTIVE, finalResults);
      if (!validationResult.isValid) {
        console.log(chalk.yellow(`[Anti-Hallucination] Report validation issues:`));
        for (const issue of validationResult.issues) {
          console.log(chalk.yellow(`  - ${issue}`));
        }

        if (validationResult.issues.length > 0) {
          report += `\n\n⚠️ **Ostrzeżenia walidacji:**\n${validationResult.issues.map((i) => `- ${i}`).join('\n')}`;
        }
      } else {
        console.log(
          chalk.green(
            `[Anti-Hallucination] Report validation passed (score: ${validationResult.score}%)`,
          ),
        );
      }

      // Self-Reflection
      if (
        this.config.enableAdvancedReasoning &&
        this.config.intelligenceConfig?.useSelfReflection
      ) {
        logger.spinUpdate('synthesis', 'Self-Reflection: improving final report...');
        try {
          const reflectionResult = await selfReflect(refinedObjective, report, 2);
          if (reflectionResult.confidenceImprovement > 15) {
            report = reflectionResult.improvedResponse;
            console.log(
              chalk.gray(
                `[Self-Reflect] Improved report by ${reflectionResult.confidenceImprovement}%`,
              ),
            );
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(chalk.yellow(`[Self-Reflect] Skipped: ${msg}`));
        }
      }

      // Intelligence Layer Enhancement
      if (this.config.enableIntelligenceLayer) {
        logger.spinUpdate('synthesis', 'Enhancing with Intelligence Layer...');

        const intelligenceConfig = {
          ...this.config.intelligenceConfig,
          useMultiPerspective: this.config.intelligenceConfig?.useMultiPerspective ?? false,
          useSelfReflection: false,
        };

        report = await enhanceWithIntelligence(refinedObjective, report, intelligenceConfig);
        knowledgeGraph.recordExecution(refinedObjective, report, missionSuccess);
        contextManager.add(report, 'result', missionSuccess ? 0.8 : 0.5);
      }

      logger.spinSuccess('synthesis', 'Mission Complete');
      logger.agentSuccess('regis', { chars: report.length, time: Date.now() - startTime });
      logger.phaseEnd('D', { success: true });

      // =========================================
      // VERIFICATION GATE: Phase D (Keira Metz)
      // =========================================
      if (this.config.enableVerification) {
        const verifier = new VerificationAgent(this.config.verificationConfig);
        const phaseDVerdict: PhaseVerdict = await verifier.verifyPhaseD(
          report,
          finalResults,
          ORIGINAL_OBJECTIVE,
        );
        if (phaseDVerdict.verdict === 'FAIL') {
          report += `\n\n⚠️ OSTRZEŻENIE KEIRA METZ: Raport nie przeszedł weryfikacji (${phaseDVerdict.score}/100)\n`;
          report += phaseDVerdict.issues.map((i) => `  ❌ ${i}`).join('\n');
        }
        // Generate and log overall mission verdict
        const missionVerdict = verifier.generateVerdict();
        logger.system(
          `[Keira] Mission verdict: ${missionVerdict.overallVerdict} (${missionVerdict.overallScore}/100)`,
          'info',
        );
      }

      // Solution 8: Show original objective in report
      const originalObjectiveHeader = `
═══════════════════════════════════════════════════════════════════
📋 ORYGINALNY CEL UŻYTKOWNIKA: ${objective}
═══════════════════════════════════════════════════════════════════

`;

      if (!report.includes('ORYGINALNY CEL UŻYTKOWNIKA')) {
        report = originalObjectiveHeader + report;
      }

      const duration = Date.now() - startTime;
      await sessionCache.appendChronicle(
        `Mission completed in ${(duration / 1000).toFixed(1)}s. Success: ${missionSuccess}`,
      );
      await sessionCache.flush();

      const successCount = finalResults.filter((r) => r.success).length;
      const failedCount = finalResults.length - successCount;
      const estimatedInputTokens = refinedObjective.length / 4 + plan.tasks.length * 500;
      const estimatedOutputTokens =
        report.length / 4 +
        finalResults.reduce((sum, r) => sum + (r.logs?.[0]?.length || 0) / 4, 0);

      logger.summary({
        totalTime: duration,
        phases: 4,
        tasks: { total: finalResults.length, success: successCount, failed: failedCount },
        tokens: {
          input: Math.round(estimatedInputTokens),
          output: Math.round(estimatedOutputTokens),
        },
        cost: (estimatedInputTokens * 0.000075 + estimatedOutputTokens * 0.0003) / 1000,
      });

      if (this.config.enableIntelligenceLayer) {
        const cacheStats = semanticCache.getStats();
        const graphStats = knowledgeGraph.getStats();
        logger.system(
          `Intelligence: Cache ${cacheStats.size} entries (${cacheStats.totalHits} hits) | Knowledge ${graphStats.nodes} nodes`,
          'debug',
        );
      }

      const suggestions = await generateNextStepSuggestions(
        refinedObjective,
        report,
        finalResults,
        missionSuccess,
      );
      if (suggestions.length > 0) {
        console.log('');
        console.log(chalk.cyan('════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan.bold('  💡 SUGESTIE DALSZYCH KROKÓW'));
        console.log(chalk.cyan('════════════════════════════════════════════════════════════'));
        for (let i = 0; i < suggestions.length; i++) {
          console.log(chalk.white(`  ${i + 1}. ${suggestions[i]}`));
        }
        console.log(chalk.cyan('────────────────────────────────────────────────────────────'));
        console.log(chalk.gray('  Wpisz numer lub opis aby kontynuować'));
        console.log('');
      }

      return report;
    } finally {
      clearTimeout(totalTimeoutHandle);
      this.abortController = null;
    }
  }

  // =========================================
  // YOLO Helper Methods
  // =========================================

  async readFile(filepath: string): Promise<string> {
    if (!this.config.fileAccess) throw new Error('File access disabled');
    return fs.readFile(filepath, 'utf-8');
  }

  async writeFile(filepath: string, content: string): Promise<void> {
    if (!this.config.fileAccess) throw new Error('File access disabled');
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, content, 'utf-8');
  }

  async executeCommand(command: string): Promise<string> {
    if (!this.config.shellAccess) throw new Error('Shell access disabled');
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);
    const { stdout, stderr } = await execAsync(command);
    return stdout + (stderr ? `\nSTDERR: ${stderr}` : '');
  }

  async fetchUrl(url: string): Promise<string> {
    if (!this.config.networkAccess) throw new Error('Network access disabled');
    const response = await fetch(url);
    return response.text();
  }

  getStoredResults(): ExecutionResult[] {
    return this.resultStore.getAll();
  }

  clearStoredResults(): void {
    this.resultStore.clear();
  }

  getStatus(): {
    config: YoloConfig;
    graphStatus: unknown;
    storedResults: number;
    isRunning: boolean;
  } {
    return {
      config: this.config,
      graphStatus: this.graphProcessor.getStatus(),
      storedResults: this.resultStore.size,
      isRunning: this.abortController !== null && !this.abortController.signal.aborted,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Factory function to create and initialize a Swarm instance
 * Used by CLI and API services
 */
export async function createSwarm(config?: Partial<YoloConfig>): Promise<Swarm> {
  const swarm = new Swarm('.gemini-memory', config);
  await swarm.initialize();
  return swarm;
}
