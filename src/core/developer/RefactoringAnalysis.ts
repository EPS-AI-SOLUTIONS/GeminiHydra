/**
 * RefactoringAnalysis.ts - Feature #34: Refactoring Suggestions
 *
 * Suggests code refactoring opportunities including:
 * - Extract function/variable
 * - Rename for clarity
 * - Simplify complex code
 * - Apply design patterns
 * - Architecture improvements
 *
 * Part of DeveloperTools module refactoring.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import 'dotenv/config';
import { GEMINI_MODELS } from '../../config/models.config.js';

// ============================================================
// Configuration
// ============================================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const QUALITY_MODEL = GEMINI_MODELS.FLASH;

// ============================================================
// Interfaces
// ============================================================

export type RefactoringType =
  | 'extract-function'
  | 'extract-variable'
  | 'rename'
  | 'inline'
  | 'simplify'
  | 'pattern'
  | 'architecture';

export type RefactoringPriority = 'low' | 'medium' | 'high';

export type RefactoringEffort = 'trivial' | 'small' | 'medium' | 'large';

export interface RefactoringSuggestion {
  id: string;
  type: RefactoringType;
  priority: RefactoringPriority;
  title: string;
  description: string;
  before: string;
  after: string;
  effort: RefactoringEffort;
  benefits: string[];
}

export interface CodeMetrics {
  linesOfCode: number;
  functions: number;
  avgFunctionLength: number;
  cyclomaticComplexity: number;
}

export interface RefactoringAnalysis {
  file: string;
  complexity: number;
  suggestions: RefactoringSuggestion[];
  metrics: CodeMetrics;
}

// ============================================================
// Prompt Template
// ============================================================

const REFACTORING_PROMPT = `You are a refactoring expert. Analyze the following code and suggest refactoring opportunities.

FILE: {filename}

CODE:
\`\`\`
{code}
\`\`\`

Provide suggestions in JSON format:
{
  "complexity": 1-10,
  "suggestions": [
    {
      "type": "extract-function|extract-variable|rename|inline|simplify|pattern|architecture",
      "priority": "low|medium|high",
      "title": "Short title",
      "description": "Why this refactoring helps",
      "before": "code snippet before",
      "after": "code snippet after",
      "effort": "trivial|small|medium|large",
      "benefits": ["benefit 1", "benefit 2"]
    }
  ],
  "metrics": {
    "linesOfCode": number,
    "functions": number,
    "avgFunctionLength": number,
    "cyclomaticComplexity": number
  }
}

Focus on actionable suggestions that improve maintainability.`;

// ============================================================
// Core Functions
// ============================================================

/**
 * Analyzes code for refactoring opportunities.
 * @param code - The source code to analyze
 * @param filename - The name of the source file
 * @returns A RefactoringAnalysis with suggestions and metrics
 */
export async function analyzeRefactoring(
  code: string,
  filename: string,
): Promise<RefactoringAnalysis> {
  console.log(chalk.cyan(`[Refactoring] Analyzing ${filename}...`));

  const prompt = REFACTORING_PROMPT.replace('{filename}', filename).replace('{code}', code);

  try {
    const model = genAI.getGenerativeModel({
      model: QUALITY_MODEL,
      generationConfig: { temperature: 1.0, maxOutputTokens: 4096 }, // Temperature locked at 1.0 for Gemini - do not change
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const jsonStr = responseText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(jsonStr);

    // Add IDs to suggestions
    const suggestions = (parsed.suggestions || []).map((s: unknown, i: number) => ({
      ...(s as Record<string, unknown>),
      id: `refactor-${i + 1}`,
    }));

    console.log(chalk.green(`[Refactoring] Found ${suggestions.length} opportunities`));

    return {
      file: filename,
      complexity: parsed.complexity || 5,
      suggestions,
      metrics: parsed.metrics || {
        linesOfCode: code.split('\n').length,
        functions: 0,
        avgFunctionLength: 0,
        cyclomaticComplexity: 0,
      },
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[Refactoring] Analysis failed: ${msg}`));
    return {
      file: filename,
      complexity: 0,
      suggestions: [],
      metrics: {
        linesOfCode: code.split('\n').length,
        functions: 0,
        avgFunctionLength: 0,
        cyclomaticComplexity: 0,
      },
    };
  }
}

/**
 * Formats the refactoring analysis into a human-readable string.
 * @param analysis - The RefactoringAnalysis to format
 * @returns A formatted string representation
 */
export function formatRefactoringAnalysis(analysis: RefactoringAnalysis): string {
  const lines: string[] = [];

  lines.push(chalk.cyan(`\n[REFACTORING ANALYSIS] ${analysis.file}`));
  lines.push(chalk.gray(`   Complexity: ${analysis.complexity}/10`));
  lines.push(chalk.gray(`   Lines of Code: ${analysis.metrics.linesOfCode}`));
  lines.push(chalk.gray(`   Functions: ${analysis.metrics.functions}`));
  lines.push('');

  // Group by priority
  const highPriority = analysis.suggestions.filter((s) => s.priority === 'high');
  const mediumPriority = analysis.suggestions.filter((s) => s.priority === 'medium');
  const lowPriority = analysis.suggestions.filter((s) => s.priority === 'low');

  if (highPriority.length > 0) {
    lines.push(chalk.red('[!] HIGH PRIORITY:'));
    highPriority.forEach((s) => {
      lines.push(`   ${s.id}: ${s.title} (${s.type})`);
      lines.push(chalk.gray(`      ${s.description}`));
      lines.push(chalk.gray(`      Effort: ${s.effort}`));
    });
    lines.push('');
  }

  if (mediumPriority.length > 0) {
    lines.push(chalk.yellow('[*] MEDIUM PRIORITY:'));
    mediumPriority.forEach((s) => {
      lines.push(`   ${s.id}: ${s.title} (${s.type})`);
      lines.push(chalk.gray(`      ${s.description}`));
    });
    lines.push('');
  }

  if (lowPriority.length > 0) {
    lines.push(chalk.blue('[i] LOW PRIORITY:'));
    lowPriority.forEach((s) => {
      lines.push(`   ${s.id}: ${s.title} (${s.type})`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Gets a specific suggestion by ID and shows before/after comparison.
 * @param analysis - The RefactoringAnalysis containing suggestions
 * @param suggestionId - The ID of the suggestion to detail
 * @returns A detailed comparison string or null if not found
 */
export function getSuggestionDetails(
  analysis: RefactoringAnalysis,
  suggestionId: string,
): string | null {
  const suggestion = analysis.suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) return null;

  const lines: string[] = [];

  lines.push(chalk.cyan(`\n[REFACTORING DETAILS] ${suggestion.title}`));
  lines.push(
    chalk.gray(
      `Type: ${suggestion.type} | Priority: ${suggestion.priority} | Effort: ${suggestion.effort}`,
    ),
  );
  lines.push('');
  lines.push(chalk.white(suggestion.description));
  lines.push('');

  lines.push(chalk.red('BEFORE:'));
  lines.push('```');
  lines.push(suggestion.before);
  lines.push('```');
  lines.push('');

  lines.push(chalk.green('AFTER:'));
  lines.push('```');
  lines.push(suggestion.after);
  lines.push('```');
  lines.push('');

  lines.push(chalk.cyan('BENEFITS:'));
  for (const b of suggestion.benefits) lines.push(`   - ${b}`);

  return lines.join('\n');
}

/**
 * Filters suggestions by type.
 * @param analysis - The RefactoringAnalysis
 * @param type - The type of refactoring to filter by
 * @returns Filtered list of suggestions
 */
export function filterSuggestionsByType(
  analysis: RefactoringAnalysis,
  type: RefactoringType,
): RefactoringSuggestion[] {
  return analysis.suggestions.filter((s) => s.type === type);
}

/**
 * Calculates the total estimated effort for all suggestions.
 * @param suggestions - List of suggestions
 * @returns Total effort in arbitrary units
 */
export function calculateTotalEffort(suggestions: RefactoringSuggestion[]): number {
  const effortMap: Record<RefactoringEffort, number> = {
    trivial: 1,
    small: 2,
    medium: 5,
    large: 10,
  };

  return suggestions.reduce((total, s) => total + effortMap[s.effort], 0);
}

// ============================================================
// Default Export
// ============================================================

export default {
  analyzeRefactoring,
  formatRefactoringAnalysis,
  getSuggestionDetails,
  filterSuggestionsByType,
  calculateTotalEffort,
};
