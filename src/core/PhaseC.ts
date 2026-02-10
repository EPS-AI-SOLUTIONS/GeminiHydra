/**
 * PhaseC - Self-Healing Evaluation and Repair Loop
 * Ported from AgentSwarm.psm1 lines 820-875
 *
 * This phase runs AFTER execution to:
 * 1. Evaluate if the mission was successful
 * 2. Generate repair plans if needed
 * 3. Execute repairs (max 2 retries)
 * 4. Save lessons learned to memory
 */

import { Agent, AGENT_PERSONAS } from './agent/Agent.js';
import { ExecutionResult, SwarmTask, AgentRole } from '../types/index.js';
import chalk from 'chalk';

// Lista dostępnych agentów
const VALID_AGENTS = Object.keys(AGENT_PERSONAS) as AgentRole[];

/**
 * Configuration for Phase C
 */
export interface PhaseCConfig {
  enabled?: boolean;
  maxRetries?: number;
  saveLesson?: boolean;
  onLessonLearned?: (lesson: LessonLearned) => Promise<void>;
}

/**
 * Lesson learned from repair cycle
 */
export interface LessonLearned {
  objective: string;
  problem: string;
  solution: string;
  timestamp: Date;
  retryCount: number;
}

/**
 * Repair plan task
 */
export interface RepairTask {
  id: number;
  agent: AgentRole;
  task: string;
  dependencies: number[];
}

/**
 * Result of Phase C evaluation
 */
export interface PhaseCResult {
  success: boolean;
  finalResults: ExecutionResult[];
  repairCycles: number;
  lessons: LessonLearned[];
}

const DEFAULT_CONFIG: PhaseCConfig = {
  enabled: true,
  maxRetries: 3,    // Self-healing repair cycles (3 attempts before giving up)
  saveLesson: true
};

/**
 * Evaluation prompt template
 */
const EVALUATION_PROMPT = `CEL: {objective}

WYNIKI WYKONANIA (JSON):
{results}

INSTRUKCJE:
Jesteś Dijkstrą, Mistrzem Strategii. Przeanalizuj wyniki wykonania i oceń sukces misji.

KRYTERIA OCENY:
1. Czy osiągnęliśmy założony cel?
2. Czy są jakieś błędy lub nieudane zadania?
3. Czy brakuje krytycznych informacji?
4. Czy wyniki są kompletne i wykonalne?

DECYZJA:
- Jeśli misja jest UDANA i cel osiągnięty: Zwróć TYLKO tekst "STATUS: SUCCESS"
- Jeśli misja NIEUDANA lub NIEKOMPLETNA: Zwróć plan naprawy w formacie JSON

DOSTĘPNI AGENCI (UŻYWAJ TYLKO TYCH NAZW):
{agents}

FORMAT PLANU NAPRAWY (jeśli potrzebny):
[{"id":1,"agent":"NazwaAgenta","task":"konkretny opis naprawy po polsku","dependencies":[]}]

ZASADY PLANU NAPRAWY:
- Skup się na naprawie konkretnych błędów
- Używaj TYLKO agentów z powyższej listy
- Maksymalnie 3 zadania naprawcze
- Dobierz właściwego agenta do każdej naprawy:
  * Geralt - główny wykonawca, czytanie/pisanie plików, analiza kodu
  * Yennefer - architektura kodu, refaktoryzacja, złożone problemy
  * Triss - testy, walidacja, quality assurance
  * Lambert - debugowanie, analiza błędów, diagnostyka
  * Eskel - operacje DevOps, buildy, CI/CD, git
  * Ciri - proste, szybkie zadania, porządkowanie
  * Regis - głęboka analiza, synteza, dokumentacja
  * Vesemir - bezpieczeństwo, code review, mentoring
  * Philippa - integracje API, sieć, zewnętrzne serwisy

OPERACJE NA PLIKACH (NATYWNE NODE.JS API):
System automatycznie obsługuje operacje plikowe - NIE używaj MCP filesystem!
Wystarczy opisać operację naturalnym językiem:
- "Przeczytaj plik src/index.ts" → natywne fs.readFile()
- "Wylistuj katalog src/" → natywne fs.readdir()
- "Zapisz do pliku output.txt: [treść]" → natywne fs.writeFile()
- "Pokaż strukturę projektu" → natywne directoryTree()
- "Znajdź pliki *.ts w src/" → natywne glob()

EXEC: używaj TYLKO dla narzędzi systemowych:
- Git: git status, git commit, git push
- NPM: npm install, npm run build, npm test
- Inne CLI: tsc, eslint, prettier

ZABRONIONE:
- EXEC: cat, type, dir, ls (dla plików) → użyj natywnego API
- EXEC: echo > plik, > plik (dla zapisu) → użyj natywnego API
- MCP filesystem__* → ZASTĄPIONE przez natywne API

WYNIK: Albo "STATUS: SUCCESS" albo poprawna tablica JSON. Nic więcej.`;

/**
 * Solution 18: Check if result aligns with task description
 * Verifies that the agent actually addressed the assigned task
 */
export function checkTaskResultAlignment(
  task: string,
  result: string
): {
  aligned: boolean;
  score: number;        // 0-100
  matchedKeywords: string[];
  missingKeywords: string[];
  warning?: string;
} {
  // Extract key action words from task
  const taskLower = task.toLowerCase();
  const resultLower = result.toLowerCase();

  // Keywords that should appear in both task and result
  const actionKeywords = [
    // English
    'create', 'add', 'remove', 'delete', 'modify', 'update', 'fix', 'implement',
    'write', 'read', 'list', 'find', 'search', 'analyze', 'test', 'build', 'run',
    // Polish
    'stwórz', 'dodaj', 'usuń', 'zmodyfikuj', 'zaktualizuj', 'napraw', 'zaimplementuj',
    'napisz', 'odczytaj', 'wylistuj', 'znajdź', 'szukaj', 'analizuj', 'testuj', 'zbuduj'
  ];

  // Extract keywords from task
  const taskKeywords = new Set<string>();
  for (const kw of actionKeywords) {
    if (taskLower.includes(kw)) {
      taskKeywords.add(kw);
    }
  }

  // Extract file/path references from task
  const taskPaths = task.match(/[\w\/-]+\.\w+/g) || [];
  taskPaths.forEach(p => taskKeywords.add(p.toLowerCase()));

  // Extract class/function names from task
  const taskNames = task.match(/\b[A-Z][a-zA-Z]+\b/g) || [];
  taskNames.forEach(n => taskKeywords.add(n.toLowerCase()));

  // Check which keywords appear in result
  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];

  for (const kw of taskKeywords) {
    if (resultLower.includes(kw)) {
      matchedKeywords.push(kw);
    } else {
      missingKeywords.push(kw);
    }
  }

  // Calculate alignment score
  const totalKeywords = taskKeywords.size;
  const matchedCount = matchedKeywords.length;

  let score = totalKeywords > 0
    ? Math.round((matchedCount / totalKeywords) * 100)
    : 50; // No keywords to match

  // Check for task-specific patterns
  const taskPatterns = [
    { pattern: /plik|file/i, resultPattern: /===ZAPIS===|odczytano|read|wrote|created/i },
    { pattern: /exec|uruchom|run/i, resultPattern: /EXEC:|executed|uruchomiono/i },
    { pattern: /test/i, resultPattern: /test|passed|failed|assert/i },
    { pattern: /list|wylistuj/i, resultPattern: /\n-|\n\*|\n\d\./i },
  ];

  for (const { pattern, resultPattern } of taskPatterns) {
    if (pattern.test(taskLower)) {
      if (!resultPattern.test(resultLower)) {
        score -= 20;
      } else {
        score += 10;
      }
    }
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine warning
  let warning: string | undefined;
  if (score < 30) {
    warning = 'Wynik nie adresuje zadania - prawdopodobna halucynacja';
  } else if (score < 50) {
    warning = 'Wynik częściowo niezgodny z zadaniem';
  } else if (missingKeywords.length > matchedKeywords.length) {
    warning = 'Brak niektórych kluczowych elementów';
  }

  return {
    aligned: score >= 50,
    score,
    matchedKeywords,
    missingKeywords,
    warning
  };
}

/**
 * Execute Phase C: Self-Healing Evaluation and Repair
 *
 * @param objective - Original objective
 * @param results - Execution results from Phase B
 * @param config - Optional configuration
 * @param executeRepair - Function to execute repair tasks
 * @returns Phase C result with final status
 */
export async function selfHealingLoop(
  objective: string,
  results: ExecutionResult[],
  config: PhaseCConfig = {},
  executeRepair?: (tasks: RepairTask[]) => Promise<ExecutionResult[]>
): Promise<PhaseCResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Skip if disabled
  if (!cfg.enabled) {
    console.log(chalk.gray('[PHASE C] Self-healing disabled'));
    return {
      success: true,
      finalResults: results,
      repairCycles: 0,
      lessons: []
    };
  }

  console.log(chalk.cyan('\n--- PHASE C: EVALUATION & REPAIR ---'));

  const dijkstra = new Agent('dijkstra');
  let aggregatedResults = [...results];
  let repairCycles = 0;
  const lessons: LessonLearned[] = [];

  while (repairCycles < cfg.maxRetries!) {
    repairCycles++;

    // Minimize results for context (prevent token overflow)
    const minimizedResults = aggregatedResults.map(r => ({
      id: r.id,
      success: r.success,
      error: r.error || undefined,
      summary: (r.logs ?? [])[0]?.substring(0, 300) || ''
    }));

    // Build evaluation prompt with agent list
    const agentList = VALID_AGENTS.join(', ');
    const evalPrompt = EVALUATION_PROMPT
      .replace('{objective}', objective)
      .replace('{results}', JSON.stringify(minimizedResults, null, 2))
      .replace('{agents}', agentList);

    console.log(chalk.gray(`[PHASE C] Evaluation cycle ${repairCycles}/${cfg.maxRetries}...`));

    try {
      const evalResponse = await dijkstra.think(evalPrompt);

      // Check for success
      if (evalResponse.includes('STATUS: SUCCESS')) {
        console.log(chalk.green('[PHASE C] Mission evaluated as SUCCESS!'));
        return {
          success: true,
          finalResults: aggregatedResults,
          repairCycles,
          lessons
        };
      }

      // Parse repair plan
      console.log(chalk.yellow('[PHASE C] Issues detected. Generating repair plan...'));

      const repairPlan = parseRepairPlan(evalResponse);

      if (!repairPlan || repairPlan.length === 0) {
        console.log(chalk.yellow('[PHASE C] Could not generate valid repair plan.'));
        break;
      }

      console.log(chalk.cyan(`[PHASE C] Repair plan: ${repairPlan.length} tasks`));

      // Execute repair if handler provided
      if (executeRepair) {
        const repairResults = await executeRepair(repairPlan);
        aggregatedResults.push(...repairResults);

        // Create lesson learned
        if (cfg.saveLesson) {
          const lesson: LessonLearned = {
            objective,
            problem: `Failed tasks: ${results.filter(r => !r.success).map(r => r.id).join(', ')}`,
            solution: `Repair plan: ${JSON.stringify(repairPlan.map(t => t.task))}`,
            timestamp: new Date(),
            retryCount: repairCycles
          };
          lessons.push(lesson);

          if (cfg.onLessonLearned) {
            await cfg.onLessonLearned(lesson);
          }
        }
      } else {
        // No repair handler, just log the plan
        console.log(chalk.gray('[PHASE C] Repair plan generated but no executor provided:'));
        repairPlan.forEach(t => {
          console.log(chalk.gray(`  - [${t.agent}] ${t.task.substring(0, 50)}...`));
        });
        break;
      }

    } catch (error: any) {
      console.log(chalk.red(`[PHASE C] Evaluation error: ${error.message}`));
      break;
    }
  }

  // Max retries reached or repair failed
  const hasFailures = aggregatedResults.some(r => !r.success);
  console.log(chalk.yellow(`[PHASE C] Completed after ${repairCycles} cycles. Success: ${!hasFailures}`));

  return {
    success: !hasFailures,
    finalResults: aggregatedResults,
    repairCycles,
    lessons
  };
}

/**
 * Map invalid agent names to valid ones
 */
function mapToValidAgent(agentName: string): AgentRole | null {
  // Direct match (case insensitive)
  const directMatch = VALID_AGENTS.find(
    a => a.toLowerCase() === agentName.toLowerCase()
  );
  if (directMatch) return directMatch;

  // Common mappings for hallucinated agent names
  const agentMappings: Record<string, AgentRole> = {
    // File operations -> geralt (main executor with native fs)
    'filesystem': 'geralt',
    'fileoperator': 'geralt',
    'file_agent': 'geralt',
    'fileagent': 'geralt',
    'reader': 'geralt',
    'writer': 'geralt',

    // System/shell operations -> eskel (DevOps)
    'system_operator': 'eskel',
    'systemoperator': 'eskel',
    'shell': 'eskel',
    'devops': 'eskel',
    'builder': 'eskel',

    // Memory/knowledge -> regis (deep analysis)
    'memory': 'regis',
    'memory_archivist': 'regis',
    'memoryarchivist': 'regis',
    'memoryarchitect': 'regis',
    'knowledgeagent': 'regis',
    'knowledge_agent': 'regis',

    // API/network -> philippa
    'api': 'philippa',
    'network': 'philippa',
    'integration': 'philippa',

    // Debug/repair -> lambert
    'debugger': 'lambert',
    'fixer': 'lambert',
    'repair': 'lambert',
    'responder': 'lambert',
    'diagnostic': 'lambert',

    // Testing -> triss
    'tester': 'triss',
    'validator': 'triss',
    'qa': 'triss',

    // Generic/executor -> ciri (fast)
    'executor': 'ciri',
    'worker': 'ciri',
    'agent': 'ciri',
    'generic': 'ciri',
    'helper': 'ciri',

    // Analyst -> regis
    'analyst': 'regis',
    'researcher': 'regis',

    // Security -> vesemir
    'security': 'vesemir',
    'reviewer': 'vesemir',
  };

  const lowerName = agentName.toLowerCase().replace(/[-_\s]/g, '');
  if (agentMappings[lowerName]) {
    return agentMappings[lowerName];
  }

  // Partial match
  for (const [key, value] of Object.entries(agentMappings)) {
    if (lowerName.includes(key) || key.includes(lowerName)) {
      return value;
    }
  }

  // Default fallback to Geralt for unknown agents (main executor)
  console.log(chalk.yellow(`[PHASE C] Nieznany agent "${agentName}" -> mapowanie na geralt`));
  return 'geralt';
}

/**
 * Parse repair plan from Dijkstra's response
 */
function parseRepairPlan(response: string): RepairTask[] | null {
  try {
    // Try to find JSON array in response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    let jsonStr = jsonMatch[0];

    // Clean up common issues
    jsonStr = jsonStr
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const plan = JSON.parse(jsonStr);

    // Validate structure
    if (!Array.isArray(plan)) return null;

    const validPlan: RepairTask[] = [];
    for (const task of plan) {
      if (task.id && task.agent && task.task) {
        // Map agent name to valid agent
        const validAgent = mapToValidAgent(String(task.agent));
        if (!validAgent) continue;

        validPlan.push({
          id: typeof task.id === 'number' ? task.id : parseInt(task.id),
          agent: validAgent,
          task: String(task.task),
          dependencies: Array.isArray(task.dependencies) ? task.dependencies : []
        });
      }
    }

    return validPlan.length > 0 ? validPlan : null;

  } catch (error) {
    return null;
  }
}

/**
 * Quick evaluation (single check, no repair)
 */
export async function quickEvaluate(
  objective: string,
  results: ExecutionResult[]
): Promise<boolean> {
  // Simple heuristic evaluation
  const failedCount = results.filter(r => !r.success).length;
  const successCount = results.filter(r => r.success).length;

  // Success if majority succeeded and no critical failures
  if (failedCount === 0) return true;
  if (successCount === 0) return false;
  if (failedCount <= successCount * 0.2) return true; // Max 20% failure rate

  // Need deeper evaluation
  const dijkstra = new Agent('dijkstra');
  const quickPrompt = `
Objective: ${objective}
Results: ${successCount} success, ${failedCount} failed

Is this mission successful? Answer only YES or NO.`;

  try {
    const response = await dijkstra.think(quickPrompt);
    return response.toLowerCase().includes('yes');
  } catch {
    return failedCount === 0;
  }
}

export default {
  selfHealingLoop,
  quickEvaluate,
  parseRepairPlan,
  checkTaskResultAlignment
};
