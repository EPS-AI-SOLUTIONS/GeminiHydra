/**
 * CodeAnalysisEngine - Gemini 3 + Serena/NativeCodeIntelligence Integration
 *
 * Provides enhanced code analysis during Phase A (Analysis) by combining:
 * - Gemini 3 Pro/Flash for intelligent reasoning and understanding
 * - Serena MCP / NativeCodeIntelligence for code symbol search and navigation
 *
 * GEMINI 3 OPTIMIZED: Uses temperature 1.0 for analytical tasks
 */

import { type GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

import { GEMINI_MODELS } from '../config/models.config.js';
import { TEMPERATURE_PRESETS } from '../config/temperatures.config.js';
import { mcpManager } from '../mcp/index.js';
import { nativeCodeIntelligence } from '../native/NativeCodeIntelligence.js';
import { logger } from './LiveLogger.js';

// ============================================================
// Types
// ============================================================

export interface CodeAnalysisRequest {
  objective: string;
  projectRoot: string;
  focusFiles?: string[];
  analysisDepth?: 'quick' | 'normal' | 'deep';
  includeSymbols?: boolean;
  includePatterns?: string[];
}

export interface CodeAnalysisResult {
  success: boolean;
  summary: string;
  relevantFiles: string[];
  symbols: SymbolInfo[];
  codeContext: string;
  suggestions: string[];
  analysisTime: number;
}

export interface SymbolInfo {
  name: string;
  kind: string;
  file: string;
  line: number;
  body?: string;
}

export interface CodeSearchResult {
  file: string;
  line: number;
  content: string;
  relevance: number;
}

// ============================================================
// CodeAnalysisEngine Class
// ============================================================

export class CodeAnalysisEngine {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private initialized: boolean = false;
  private useSerena: boolean = false;
  private useNative: boolean = false;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    this.model = this.genAI.getGenerativeModel({
      model: GEMINI_MODELS.FLASH,
      generationConfig: {
        temperature: 1.0, // Temperature locked at 1.0 for Gemini - do not change
        maxOutputTokens: 4096,
      },
    });
  }

  // ============================================================
  // Initialization
  // ============================================================

  async init(projectRoot: string): Promise<void> {
    if (this.initialized) return;

    logger.system('[CodeAnalysis] Initializing Gemini 3 + Serena integration...', 'info');

    // Check Serena MCP availability
    const serenaStatus = mcpManager.getServerStatus('serena');
    if (serenaStatus === 'connected') {
      this.useSerena = true;
      logger.system('[CodeAnalysis] Serena MCP available', 'info');
    }

    // Initialize NativeCodeIntelligence as fallback/primary
    try {
      await nativeCodeIntelligence.init(projectRoot);
      this.useNative = true;
      logger.system('[CodeAnalysis] NativeCodeIntelligence ready', 'info');
    } catch (_error) {
      logger.system('[CodeAnalysis] NativeCodeIntelligence not available', 'warn');
    }

    if (!this.useSerena && !this.useNative) {
      logger.system('[CodeAnalysis] No code intelligence available - using Gemini only', 'warn');
    }

    this.initialized = true;
  }

  // ============================================================
  // Main Analysis Method
  // ============================================================

  /**
   * Perform comprehensive code analysis using Gemini 3 + Serena
   */
  async analyzeCode(request: CodeAnalysisRequest): Promise<CodeAnalysisResult> {
    const startTime = Date.now();

    if (!this.initialized) {
      await this.init(request.projectRoot);
    }

    logger.agentThinking('system', 'Starting Gemini 3 + Serena code analysis...');

    // Step 1: Extract keywords and patterns from objective
    const keywords = await this.extractKeywords(request.objective);
    logger.system(`[CodeAnalysis] Keywords: ${keywords.join(', ')}`, 'debug');

    // Step 2: Search for relevant symbols using Serena/Native
    const symbols = await this.findRelevantSymbols(keywords, request);
    logger.system(`[CodeAnalysis] Found ${symbols.length} relevant symbols`, 'debug');

    // Step 3: Search for code patterns
    const patterns = request.includePatterns || this.derivePatterns(keywords);
    const searchResults = await this.searchCodePatterns(patterns, request);

    // Step 4: Build code context for Gemini
    const codeContext = await this.buildCodeContext(symbols, searchResults, request);

    // Step 5: Analyze with Gemini 3
    const analysis = await this.analyzeWithGemini(request.objective, codeContext, symbols);

    const analysisTime = Date.now() - startTime;

    return {
      success: true,
      summary: analysis.summary,
      relevantFiles: [...new Set(symbols.map((s) => s.file))],
      symbols,
      codeContext,
      suggestions: analysis.suggestions,
      analysisTime,
    };
  }

  // ============================================================
  // Keyword Extraction
  // ============================================================

  private async extractKeywords(objective: string): Promise<string[]> {
    const prompt = `Extract key programming terms, function names, class names, and technical concepts from this task description.
Return ONLY a JSON array of strings, nothing else.

Task: ${objective}

Keywords:`;

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text().trim();

      // Parse JSON array
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback: split by common delimiters
      return objective
        .split(/[\s,;:()]+/)
        .filter((w) => w.length > 3 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(w));
    } catch {
      // Fallback: simple word extraction
      return objective
        .split(/[\s,;:()]+/)
        .filter((w) => w.length > 3 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(w));
    }
  }

  // ============================================================
  // Symbol Search
  // ============================================================

  private async findRelevantSymbols(
    keywords: string[],
    request: CodeAnalysisRequest,
  ): Promise<SymbolInfo[]> {
    const symbols: SymbolInfo[] = [];

    for (const keyword of keywords.slice(0, 10)) {
      // Limit to 10 keywords
      // Try Serena MCP first
      if (this.useSerena) {
        const serenaSymbols = await this.searchWithSerena(keyword);
        symbols.push(...serenaSymbols);
      }
      // Fallback to NativeCodeIntelligence
      else if (this.useNative) {
        const nativeSymbols = await this.searchWithNative(keyword);
        symbols.push(...nativeSymbols);
      }
    }

    // Deduplicate and limit
    const unique = this.deduplicateSymbols(symbols);
    return unique.slice(0, request.analysisDepth === 'deep' ? 50 : 20);
  }

  private async searchWithSerena(keyword: string): Promise<SymbolInfo[]> {
    try {
      const result = await mcpManager.callTool('serena__find_symbol', { query: keyword });

      if (!result.success || !result.content) return [];

      // Parse Serena response
      const content = Array.isArray(result.content) ? result.content : [result.content];
      const symbols: SymbolInfo[] = [];

      for (const item of content) {
        if (typeof item === 'object' && item.text) {
          // Parse text response for symbols
          const lines = item.text.split('\n');
          for (const line of lines) {
            const match = line.match(/(\w+)\s+\((\w+)\)\s+in\s+(.+):(\d+)/);
            if (match) {
              symbols.push({
                name: match[1],
                kind: match[2],
                file: match[3],
                line: parseInt(match[4], 10),
              });
            }
          }
        }
      }

      return symbols;
    } catch (error) {
      logger.system(`[CodeAnalysis] Serena search error: ${error}`, 'debug');
      return [];
    }
  }

  private async searchWithNative(keyword: string): Promise<SymbolInfo[]> {
    try {
      const results = await nativeCodeIntelligence.findSymbol(keyword);

      return results.map((r) => ({
        name: r.name,
        kind: typeof r.kind === 'number' ? String(r.kind) : r.kind,
        file: r.location.uri.replace('file://', ''),
        line: r.location.range.start.line + 1,
      }));
    } catch (error) {
      logger.system(`[CodeAnalysis] Native search error: ${error}`, 'debug');
      return [];
    }
  }

  // ============================================================
  // Pattern Search
  // ============================================================

  private derivePatterns(keywords: string[]): string[] {
    return keywords.flatMap((k) => [
      k,
      `function ${k}`,
      `class ${k}`,
      `interface ${k}`,
      `const ${k}`,
      `export.*${k}`,
    ]);
  }

  private async searchCodePatterns(
    patterns: string[],
    request: CodeAnalysisRequest,
  ): Promise<CodeSearchResult[]> {
    const results: CodeSearchResult[] = [];

    for (const pattern of patterns.slice(0, 5)) {
      // Try Serena MCP
      if (this.useSerena) {
        try {
          const result = await mcpManager.callTool('serena__search_for_pattern', {
            pattern,
            path: request.projectRoot,
          });

          if (result.success && result.content) {
            // Parse results
            const content = Array.isArray(result.content) ? result.content : [result.content];
            for (const item of content) {
              if (typeof item === 'object' && item.text) {
                const lines = item.text.split('\n');
                for (const line of lines) {
                  const match = line.match(/(.+):(\d+):\s*(.+)/);
                  if (match) {
                    results.push({
                      file: match[1],
                      line: parseInt(match[2], 10),
                      content: match[3],
                      relevance: 0.8,
                    });
                  }
                }
              }
            }
          }
        } catch {
          // Continue with native
        }
      }

      // Fallback to Native
      if (this.useNative && results.length === 0) {
        try {
          const nativeResults = await nativeCodeIntelligence.searchPattern(pattern);
          for (const r of nativeResults) {
            results.push({
              file: r.file,
              line: r.line,
              content: r.text,
              relevance: 0.7,
            });
          }
        } catch {
          // Ignore
        }
      }
    }

    return results.slice(0, 30);
  }

  // ============================================================
  // Context Building
  // ============================================================

  private async buildCodeContext(
    symbols: SymbolInfo[],
    searchResults: CodeSearchResult[],
    request: CodeAnalysisRequest,
  ): Promise<string> {
    const contextParts: string[] = [];

    // Add symbol summaries
    if (symbols.length > 0) {
      contextParts.push('## Relevant Symbols Found:\n');
      for (const sym of symbols.slice(0, 15)) {
        contextParts.push(`- ${sym.name} (${sym.kind}) in ${sym.file}:${sym.line}`);
      }
    }

    // Add code snippets from search
    if (searchResults.length > 0) {
      contextParts.push('\n## Relevant Code Patterns:\n');
      for (const result of searchResults.slice(0, 10)) {
        contextParts.push(`### ${result.file}:${result.line}`);
        contextParts.push('```');
        contextParts.push(result.content);
        contextParts.push('```\n');
      }
    }

    // Read focus files if specified
    if (request.focusFiles && request.focusFiles.length > 0) {
      contextParts.push('\n## Focus Files Content:\n');
      for (const file of request.focusFiles.slice(0, 3)) {
        try {
          const content = await this.readFileContent(file);
          if (content) {
            contextParts.push(`### ${file}`);
            contextParts.push('```typescript');
            contextParts.push(content.substring(0, 2000)); // Limit size
            if (content.length > 2000) contextParts.push('// ... truncated');
            contextParts.push('```\n');
          }
        } catch {
          // Ignore read errors
        }
      }
    }

    return contextParts.join('\n');
  }

  private async readFileContent(filePath: string): Promise<string | null> {
    // Try Serena
    if (this.useSerena) {
      try {
        const result = await mcpManager.callTool('serena__read_file', { path: filePath });
        if (result.success && result.content) {
          const content = Array.isArray(result.content) ? result.content[0] : result.content;
          return typeof content === 'object' ? content.text : String(content);
        }
      } catch {
        // Fallback to native
      }
    }

    // Try Native
    if (this.useNative) {
      try {
        return await nativeCodeIntelligence.readFile(filePath);
      } catch {
        return null;
      }
    }

    return null;
  }

  // ============================================================
  // Gemini Analysis
  // ============================================================

  private async analyzeWithGemini(
    objective: string,
    codeContext: string,
    symbols: SymbolInfo[],
  ): Promise<{ summary: string; suggestions: string[] }> {
    const prompt = `You are an expert code analyst. Analyze the following codebase context to help with the given task.

## Task Objective:
${objective}

## Code Context:
${codeContext}

## Analysis Instructions:
1. Identify the most relevant code sections for this task
2. Explain the current code architecture related to the task
3. Suggest specific files and functions that need to be modified
4. Highlight any potential issues or considerations

Respond in JSON format:
{
  "summary": "Brief summary of the code analysis",
  "relevantModules": ["list of relevant modules/files"],
  "keyFunctions": ["important functions to consider"],
  "suggestions": ["specific actionable suggestions for the task"],
  "potentialIssues": ["any issues or risks to consider"]
}`;

    try {
      // Use Pro model for complex analysis
      const analysisModel = this.genAI.getGenerativeModel({
        model: GEMINI_MODELS.PRO,
        generationConfig: {
          temperature: TEMPERATURE_PRESETS.BALANCED, // 1.0 for Gemini 3
          maxOutputTokens: 4096,
        },
      });

      const result = await analysisModel.generateContent(prompt);
      const text = result.response.text();

      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || 'Analysis completed',
          suggestions: parsed.suggestions || [],
        };
      }

      return {
        summary: text.substring(0, 500),
        suggestions: [],
      };
    } catch (error) {
      logger.system(`[CodeAnalysis] Gemini analysis error: ${error}`, 'warn');
      return {
        summary: `Found ${symbols.length} relevant symbols for the task.`,
        suggestions: symbols.slice(0, 5).map((s) => `Review ${s.name} in ${s.file}`),
      };
    }
  }

  // ============================================================
  // Utilities
  // ============================================================

  private deduplicateSymbols(symbols: SymbolInfo[]): SymbolInfo[] {
    const seen = new Set<string>();
    return symbols.filter((s) => {
      const key = `${s.name}:${s.file}:${s.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Check if objective is likely a code-related task
   */
  isCodeTask(objective: string): boolean {
    const codeKeywords = [
      'kod',
      'code',
      'funkcj',
      'function',
      'class',
      'klasa',
      'napraw',
      'fix',
      'bug',
      'błąd',
      'error',
      'implement',
      'zaimplementuj',
      'dodaj',
      'add',
      'zmień',
      'change',
      'modify',
      'refactor',
      'test',
      'build',
      'kompilacj',
      'typescript',
      'javascript',
      'import',
      'export',
      'moduł',
      'module',
      'plik',
      'file',
      'src/',
      '.ts',
      '.js',
      '.tsx',
      '.jsx',
      'npm',
      'node',
    ];

    const objectiveLower = objective.toLowerCase();
    return codeKeywords.some((kw) => objectiveLower.includes(kw));
  }

  /**
   * Get quick code context for planning (lighter than full analysis)
   */
  async getQuickContext(objective: string, projectRoot: string): Promise<string> {
    if (!this.initialized) {
      await this.init(projectRoot);
    }

    const keywords = await this.extractKeywords(objective);
    const symbols = await this.findRelevantSymbols(keywords, {
      objective,
      projectRoot,
      analysisDepth: 'quick',
    });

    if (symbols.length === 0) {
      return '';
    }

    let context = '\n## Quick Code Context (via Serena/LSP):\n';
    for (const sym of symbols.slice(0, 10)) {
      context += `- ${sym.kind}: ${sym.name} @ ${sym.file}:${sym.line}\n`;
    }

    return context;
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const codeAnalysisEngine = new CodeAnalysisEngine();

/**
 * Quick helper to check if code analysis should be used
 */
export function shouldUseCodeAnalysis(objective: string): boolean {
  return codeAnalysisEngine.isCodeTask(objective);
}

/**
 * Quick helper to get code context for planning
 */
export async function getCodeContext(objective: string, projectRoot: string): Promise<string> {
  return codeAnalysisEngine.getQuickContext(objective, projectRoot);
}
