/**
 * Swarm - Helper methods extracted from Swarm class
 *
 * buildMcpContext, generateNextStepSuggestions, checkMultiAgentConsensus,
 * cleanJson, and validateAgentResults.
 *
 * These are standalone functions that take dependencies as parameters
 * instead of relying on `this` context.
 *
 * @module core/swarm/helpers
 */

import chalk from 'chalk';
import type { ExecutionResult } from '../../types/index.js';
import { mcpManager } from '../../mcp/index.js';

// ============================================================================
// MCP CONTEXT
// ============================================================================

/**
 * Build MCP tools context for planning
 */
export function buildMcpContext(): string {
  const mcpTools = mcpManager.getAllTools();

  if (mcpTools.length === 0) return '';

  let context = `
AVAILABLE MCP TOOLS (Model Context Protocol):
These are external tools that agents can use. Assign Philippa for tasks requiring MCP tools.
`;

  // Group tools by server
  const toolsByServer: Map<string, string[]> = new Map();

  for (const tool of mcpTools) {
    if (!toolsByServer.has(tool.serverName)) {
      toolsByServer.set(tool.serverName, []);
    }
    const desc = tool.description?.substring(0, 60) || 'No description';
    toolsByServer.get(tool.serverName)!.push(`  - ${tool.name}: ${desc}...`);
  }

  for (const [server, tools] of toolsByServer) {
    context += `\n[${server}]:\n${tools.slice(0, 5).join('\n')}`;
    if (tools.length > 5) {
      context += `\n  ... and ${tools.length - 5} more tools`;
    }
  }

  context += `\n
To use an MCP tool, include in the task:
  "Use MCP tool: serverName__toolName with params: {...}"
`;

  return context;
}

// ============================================================================
// NEXT STEP SUGGESTIONS
// ============================================================================

/**
 * Generate 5 suggestions for next steps based on completed task
 */
export async function generateNextStepSuggestions(
  objective: string,
  _report: string,
  results: ExecutionResult[],
  success: boolean
): Promise<string[]> {
  const suggestions: string[] = [];
  const objectiveLower = objective.toLowerCase();
  const failedTasks = results.filter(r => !r.success);
  const successTasks = results.filter(r => r.success);

  // 1. Sugestie oparte na statusie wykonania
  if (!success || failedTasks.length > 0) {
    suggestions.push(`Napraw ${failedTasks.length} nieudanych zadań: "${failedTasks[0]?.error?.substring(0, 50)}..."`);
    suggestions.push('Uruchom ponownie z trybem debugowania: @lambert diagnozuj błędy');
  }

  // 2. Sugestie oparte na typie zadania
  if (objectiveLower.includes('walidacj') || objectiveLower.includes('pydantic') || objectiveLower.includes('schema')) {
    suggestions.push('Uruchom testy jednostkowe dla nowych schematów walidacji');
    suggestions.push('Dodaj walidację dla pozostałych narzędzi MCP');
    suggestions.push('Wygeneruj dokumentację API dla schematów Pydantic');
  }

  if (objectiveLower.includes('test') || objectiveLower.includes('regresj')) {
    suggestions.push('Uruchom pełen zestaw testów: npm test');
    suggestions.push('Sprawdź pokrycie kodu testami: npm run coverage');
    suggestions.push('Dodaj testy integracyjne dla edge cases');
  }

  if (objectiveLower.includes('cli') || objectiveLower.includes('pętl')) {
    suggestions.push('Przetestuj CLI w trybie interaktywnym');
    suggestions.push('Sprawdź obsługę błędów w różnych środowiskach (cmd, PowerShell, Git Bash)');
    suggestions.push('Dodaj testy E2E dla sekwencji komend');
  }

  if (objectiveLower.includes('mcp') || objectiveLower.includes('tool')) {
    suggestions.push('Zweryfikuj połączenie z serwerami MCP: /mcp status');
    suggestions.push('Przetestuj każde narzędzie MCP z przykładowymi danymi');
    suggestions.push('Dodaj retry logic dla niestabilnych połączeń MCP');
  }

  // 3. Sugestie generyczne (jeśli brakuje specyficznych)
  if (suggestions.length < 3) {
    suggestions.push('Zbuduj projekt i sprawdź błędy kompilacji: npm run build');
  }
  if (suggestions.length < 4) {
    suggestions.push('Sprawdź logi i metryki wykonania: /status');
  }
  if (suggestions.length < 5) {
    suggestions.push('Zaktualizuj dokumentację z wprowadzonymi zmianami');
  }

  // 4. Sugestie oparte na wynikach
  if (successTasks.length > 5) {
    suggestions.push(`Przejrzyj ${successTasks.length} ukończonych zadań i zoptymalizuj powtarzalne operacje`);
  }

  // Ogranicz do 5 sugestii
  return suggestions.slice(0, 5);
}

// ============================================================================
// MULTI-AGENT CONSENSUS (Solution 17)
// ============================================================================

/**
 * Solution 17: Check multi-agent consensus on key facts
 * Compares results from multiple agents to detect inconsistencies
 */
export function checkMultiAgentConsensus(results: ExecutionResult[]): {
  hasConsensus: boolean;
  agreements: string[];
  conflicts: { topic: string; agents: string[]; values: string[] }[];
  consensusScore: number;
} {
  const agreements: string[] = [];
  const conflicts: { topic: string; agents: string[]; values: string[] }[] = [];

  // Extract key facts from each result
  const factsByAgent = new Map<number, Set<string>>();

  for (const result of results) {
    if (!result.success || !(result.logs ?? [])[0]) continue;

    const content = (result.logs ?? [])[0];
    const facts = new Set<string>();

    // Extract file paths mentioned
    const filePaths = content.match(/(?:src|lib|app)\/[\w\/-]+\.\w+/g) || [];
    filePaths.forEach(p => facts.add(`file:${p}`));

    // Extract function/class names
    const definitions = content.match(/(?:function|class|interface|type)\s+(\w+)/g) || [];
    definitions.forEach(d => facts.add(`def:${d}`));

    // Extract commands executed
    const commands = content.match(/EXEC:\s*([^\n]+)/g) || [];
    commands.forEach(c => facts.add(`cmd:${c}`));

    factsByAgent.set(result.id, facts);
  }

  // Find agreements (facts mentioned by multiple agents)
  const allFacts = new Map<string, number[]>();
  for (const [taskId, facts] of factsByAgent) {
    for (const fact of facts) {
      if (!allFacts.has(fact)) {
        allFacts.set(fact, []);
      }
      allFacts.get(fact)!.push(taskId);
    }
  }

  for (const [fact, taskIds] of allFacts) {
    if (taskIds.length > 1) {
      agreements.push(`${fact} (Zadania: ${taskIds.join(', ')})`);
    }
  }

  // Detect conflicts (same file, different content claims)
  const fileVersions = new Map<string, Map<number, string>>();
  for (const result of results) {
    const firstLog = (result.logs ?? [])[0];
    if (!result.success || !firstLog) continue;

    // Look for file write operations
    const writeOps = firstLog.match(/===ZAPIS===\s*([^\n]+)\n([\s\S]*?)(?====|$)/g) || [];
    for (const op of writeOps) {
      const match = op.match(/===ZAPIS===\s*([^\n]+)/);
      if (match) {
        const filePath = match[1].trim();
        if (!fileVersions.has(filePath)) {
          fileVersions.set(filePath, new Map());
        }
        fileVersions.get(filePath)!.set(result.id, op.substring(0, 100));
      }
    }
  }

  // Check for conflicting file versions
  for (const [file, versions] of fileVersions) {
    if (versions.size > 1) {
      conflicts.push({
        topic: `Plik: ${file}`,
        agents: Array.from(versions.keys()).map(id => `Zadanie #${id}`),
        values: Array.from(versions.values())
      });
    }
  }

  // Calculate consensus score
  const totalFacts = allFacts.size;
  const agreedFacts = agreements.length;
  const conflictCount = conflicts.length;

  let consensusScore = 100;
  if (totalFacts > 0) {
    consensusScore = Math.round((agreedFacts / totalFacts) * 100);
  }
  consensusScore -= conflictCount * 20;
  consensusScore = Math.max(0, Math.min(100, consensusScore));

  return {
    hasConsensus: conflicts.length === 0 && consensusScore >= 50,
    agreements,
    conflicts,
    consensusScore
  };
}

// ============================================================================
// VALIDATION (Anti-hallucination)
// ============================================================================

/**
 * Validate agent results for potential hallucinations before synthesis
 */
export function validateAgentResults(
  results: ExecutionResult[],
  hallucinationWarnings: string[]
): ExecutionResult[] {
  return results.map(r => {
    const content = r.logs?.[0] || '';

    // Wzorce sugerujące że agent "proponuje" zamiast faktycznie wykonuje
    const suspiciousPatterns = [
      { pattern: /(?:Oto|Tutaj|Poniżej).*(?:przykład|propozycja|implementacja)/i,
        warning: 'Agent mógł wygenerować PRZYKŁADOWY kod zamiast rzeczywistych zmian' },
      { pattern: /(?:można|należy|warto|sugeruję|zalecam).*(?:dodać|zaimplementować|stworzyć)/i,
        warning: 'Agent opisał co MOŻNA zrobić zamiast CO FAKTYCZNIE ZROBIŁ' },
      { pattern: /(?:w pliku|do pliku|plik)\s+[a-zA-Z]+\d+\.(ts|js|tsx|jsx)/i,
        warning: 'Agent użył GENERYCZNEJ nazwy pliku (file1.ts, Class1.ts) - prawdopodobnie halucynacja' },
      { pattern: /(?:Class|File|Test|Helper|Utils?)\d+\.(ts|js|tsx)/i,
        warning: 'Wykryto generyczną nazwę klasy/pliku - może być halucynacja' }
    ];

    for (const { pattern, warning } of suspiciousPatterns) {
      if (pattern.test(content)) {
        hallucinationWarnings.push(`⚠️ Zadanie #${r.id}: ${warning}`);
      }
    }

    return r;
  });
}

// ============================================================================
// JSON CLEANING
// ============================================================================

/**
 * Clean JSON string from markdown and artifacts
 */
export function cleanJson(raw: string): string {
  return raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .replace(/^\s*[\r\n]+/gm, '')
    .trim();
}
