/**
 * QueryDecomposition - Feature #8 (Enhanced)
 * Decompose complex queries into sub-queries for parallel execution
 *
 * Improvements:
 * - Robust JSON parsing with multiple fallback strategies
 * - Query type detection (factual, analytical, creative, procedural)
 * - Hierarchical decomposition for complex queries
 * - Dependency graph visualization
 * - Smart merging of related sub-queries
 * - Caching for decomposition patterns
 */

import crypto from 'node:crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import { GEMINI_MODELS } from '../../config/models.config.js';
import { geminiSemaphore } from '../TrafficControl.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const INTELLIGENCE_MODEL = GEMINI_MODELS.FLASH;

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export type QueryType =
  | 'factual'
  | 'analytical'
  | 'creative'
  | 'procedural'
  | 'comparative'
  | 'exploratory'
  | 'hybrid';

export interface QueryTypeInfo {
  type: QueryType;
  confidence: number;
  characteristics: string[];
  suggestedDepth: number; // 1-3 levels of decomposition
}

export interface SubQuery {
  id: number;
  query: string;
  type: QueryType;
  priority: number; // 1-10, higher = more important
  estimatedComplexity: number; // 1-5
  parentId?: number; // For hierarchical decomposition
  level: number; // Hierarchy level (0 = top)
}

export interface DecomposedQuery {
  originalQuery: string;
  queryType: QueryTypeInfo;
  subQueries: SubQuery[];
  executionOrder: number[][]; // Groups that can run in parallel
  dependencies: Map<number, number[]>;
  hierarchy: HierarchyNode;
  mergedGroups: MergedGroup[];
  decompositionTime: number;
  fromCache: boolean;
}

export interface HierarchyNode {
  id: number;
  query: string;
  children: HierarchyNode[];
  level: number;
}

export interface MergedGroup {
  ids: number[];
  reason: string;
  combinedQuery: string;
}

interface DecompositionCacheEntry {
  pattern: string;
  result: Omit<DecomposedQuery, 'fromCache' | 'decompositionTime'>;
  timestamp: number;
  hitCount: number;
}

// =============================================================================
// ROBUST JSON PARSING
// =============================================================================

/**
 * Robust JSON parser with multiple extraction strategies
 */
export function robustJsonParse<T>(
  text: string,
  fallback: T,
): { result: T; strategy: string; success: boolean } {
  const strategies = [
    { name: 'direct', fn: () => JSON.parse(text) },
    { name: 'markdown_cleanup', fn: () => parseWithMarkdownCleanup(text) },
    { name: 'bracket_extraction', fn: () => extractJsonByBrackets(text) },
    { name: 'line_by_line', fn: () => parseLineByLine(text) },
    { name: 'regex_extraction', fn: () => extractJsonByRegex(text) },
    { name: 'partial_recovery', fn: () => recoverPartialJson(text) },
    { name: 'key_value_extraction', fn: () => extractKeyValues(text) },
  ];

  for (const strategy of strategies) {
    try {
      const result = strategy.fn();
      if (result && typeof result === 'object') {
        return { result: result as T, strategy: strategy.name, success: true };
      }
    } catch {
      // Try next strategy
    }
  }

  console.log(chalk.yellow(`[JSON Parse] All strategies failed, using fallback`));
  return { result: fallback, strategy: 'fallback', success: false };
}

function parseWithMarkdownCleanup(text: string): unknown {
  // Remove markdown code blocks and clean up
  let cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/^\s*[\r\n]+/gm, '')
    .trim();

  // Handle potential BOM or invisible characters
  cleaned = cleaned.replace(/^\uFEFF/, '');

  return JSON.parse(cleaned);
}

function extractJsonByBrackets(text: string): unknown {
  // Find the outermost JSON object or array
  const objectMatch = text.match(/\{[\s\S]*\}/);
  const arrayMatch = text.match(/\[[\s\S]*\]/);

  // Try object first (more common for our use case)
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      // Continue to array
    }
  }

  if (arrayMatch) {
    return JSON.parse(arrayMatch[0]);
  }

  throw new Error('No valid JSON structure found');
}

function parseLineByLine(text: string): unknown {
  const lines = text.split('\n');
  let jsonContent = '';
  let inJson = false;
  let braceCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inJson && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
      inJson = true;
    }

    if (inJson) {
      jsonContent += `${line}\n`;
      braceCount += (line.match(/[{[]/g) || []).length;
      braceCount -= (line.match(/[}\]]/g) || []).length;

      if (braceCount === 0 && jsonContent.trim()) {
        break;
      }
    }
  }

  return JSON.parse(jsonContent);
}

function extractJsonByRegex(text: string): unknown {
  // Try to extract JSON-like structures with regex
  const patterns = [
    /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, // Nested objects
    /\[[^[\]]*(?:\[[^[\]]*\][^[\]]*)*\]/g, // Nested arrays
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        try {
          const parsed = JSON.parse(match);
          if (parsed.subQueries || parsed.executionOrder) {
            return parsed;
          }
        } catch {
          // Try next match
        }
      }
    }
  }

  throw new Error('No valid JSON found via regex');
}

function recoverPartialJson(text: string): unknown {
  // Try to fix common JSON issues
  let fixed = text;

  // Remove trailing commas
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');

  // Add missing closing brackets
  const openBraces = (fixed.match(/\{/g) || []).length;
  const closeBraces = (fixed.match(/\}/g) || []).length;
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/\]/g) || []).length;

  fixed += '}'.repeat(Math.max(0, openBraces - closeBraces));
  fixed += ']'.repeat(Math.max(0, openBrackets - closeBrackets));

  // Fix unquoted keys
  fixed = fixed.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');

  // Try to extract and parse
  const match = fixed.match(/\{[\s\S]*\}/);
  if (match) {
    return JSON.parse(match[0]);
  }

  throw new Error('Could not recover partial JSON');
}

function extractKeyValues(text: string): unknown {
  // Last resort: extract key-value pairs manually
  const result: {
    subQueries: string[];
    executionOrder: number[][];
    dependencies: Record<string, unknown>;
  } = { subQueries: [], executionOrder: [[0]], dependencies: {} };

  // Extract subQueries array
  const subQueriesMatch = text.match(/subQueries['":\s]*\[([\s\S]*?)\]/i);
  if (subQueriesMatch) {
    const items = subQueriesMatch[1].match(/"([^"]+)"/g);
    if (items) {
      result.subQueries = items.map((item) => item.replace(/"/g, ''));
    }
  }

  // Extract executionOrder
  const execOrderMatch = text.match(/executionOrder['":\s]*\[([\s\S]*?)\]/i);
  if (execOrderMatch) {
    try {
      result.executionOrder = JSON.parse(`[${execOrderMatch[1]}]`);
    } catch {
      // Keep default
    }
  }

  // Extract dependencies
  const depsMatch = text.match(/dependencies['":\s]*\{([\s\S]*?)\}/i);
  if (depsMatch) {
    try {
      result.dependencies = JSON.parse(`{${depsMatch[1]}}`);
    } catch {
      // Keep default
    }
  }

  if (result.subQueries.length === 0) {
    throw new Error('Could not extract key values');
  }

  return result;
}

// =============================================================================
// QUERY TYPE DETECTION
// =============================================================================

const QUERY_TYPE_PATTERNS: Record<QueryType, RegExp[]> = {
  factual: [
    /co\s+to\s+jest/i,
    /czym\s+jest/i,
    /what\s+is/i,
    /define/i,
    /explain\s+(?:what|how)/i,
    /ile\s+(?:jest|wynosi)/i,
    /kiedy\s+(?:był|była|było)/i,
    /kto\s+(?:jest|był)/i,
    /gdzie\s+(?:jest|znajduje)/i,
  ],
  analytical: [
    /dlaczego/i,
    /why/i,
    /analyze/i,
    /analizuj/i,
    /porównaj/i,
    /compare/i,
    /evaluate/i,
    /oceń/i,
    /jak\s+wpływa/i,
    /jakie\s+są\s+przyczyny/i,
    /what\s+(?:causes|factors)/i,
  ],
  creative: [
    /napisz/i,
    /stwórz/i,
    /wymyśl/i,
    /zaproponuj/i,
    /write/i,
    /create/i,
    /generate/i,
    /design/i,
    /imagine/i,
    /brainstorm/i,
  ],
  procedural: [
    /jak\s+(?:zrobić|wykonać|stworzyć)/i,
    /how\s+to/i,
    /step\s+by\s+step/i,
    /krok\s+po\s+kroku/i,
    /instrukcja/i,
    /tutorial/i,
    /guide/i,
    /przeprowadź/i,
    /zaimplementuj/i,
    /implement/i,
  ],
  comparative: [
    /versus|vs\.?/i,
    /różnica\s+między/i,
    /difference\s+between/i,
    /lepszy|lepsza|lepsze/i,
    /better/i,
    /porównanie/i,
    /comparison/i,
    /co\s+wybrać/i,
    /which\s+(?:is|should)/i,
  ],
  exploratory: [
    /jakie\s+są\s+możliwości/i,
    /what\s+are\s+(?:the\s+)?options/i,
    /zbadaj/i,
    /explore/i,
    /discover/i,
    /find\s+(?:out|all)/i,
    /research/i,
    /investigate/i,
    /jakie\s+mam\s+opcje/i,
  ],
  hybrid: [], // Detected when multiple types match
};

/**
 * Detect query type with confidence scoring
 */
export function detectQueryType(query: string): QueryTypeInfo {
  const scores: Record<QueryType, number> = {
    factual: 0,
    analytical: 0,
    creative: 0,
    procedural: 0,
    comparative: 0,
    exploratory: 0,
    hybrid: 0,
  };

  const matchedCharacteristics: string[] = [];

  for (const [type, patterns] of Object.entries(QUERY_TYPE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        scores[type as QueryType] += 1;
        matchedCharacteristics.push(`${type}: ${pattern.source}`);
      }
    }
  }

  // Check complexity indicators
  const hasMultipleParts = /\s+(?:i|oraz|a\s+także|and|also|additionally)\s+/i.test(query);
  const hasConditional = /\s+(?:jeśli|jeżeli|gdy|if|when|unless)\s+/i.test(query);
  const wordCount = query.split(/\s+/).length;

  // Determine primary type
  const entries = Object.entries(scores).filter(([type]) => type !== 'hybrid');
  const maxScore = Math.max(...entries.map(([, score]) => score));
  const matchingTypes = entries.filter(([, score]) => score === maxScore && score > 0);

  let primaryType: QueryType;
  let confidence: number;

  if (matchingTypes.length > 1 || hasMultipleParts) {
    primaryType = 'hybrid';
    confidence = 60;
    matchedCharacteristics.push('Multiple query types detected');
  } else if (maxScore === 0) {
    // Default to analytical for complex queries, factual for simple ones
    primaryType = wordCount > 15 ? 'analytical' : 'factual';
    confidence = 40;
    matchedCharacteristics.push('Default classification');
  } else {
    primaryType = matchingTypes[0][0] as QueryType;
    confidence = Math.min(95, 50 + maxScore * 15);
  }

  // Adjust confidence based on query complexity
  if (hasConditional) {
    confidence = Math.max(confidence - 10, 30);
    matchedCharacteristics.push('Contains conditional');
  }

  // Determine decomposition depth
  let suggestedDepth = 1;
  if (wordCount > 30 || hasMultipleParts) suggestedDepth = 2;
  if (wordCount > 60 || (hasMultipleParts && hasConditional)) suggestedDepth = 3;

  return {
    type: primaryType,
    confidence,
    characteristics: matchedCharacteristics,
    suggestedDepth,
  };
}

// =============================================================================
// DECOMPOSITION CACHE
// =============================================================================

class DecompositionCache {
  private cache: Map<string, DecompositionCacheEntry> = new Map();
  private maxSize: number = 50;
  private ttlMs: number = 60 * 60 * 1000; // 1 hour

  private generatePatternHash(query: string): string {
    // Normalize query to create reusable patterns
    const normalized = query
      .toLowerCase()
      .replace(/[0-9]+/g, 'NUM')
      .replace(/["'][^"']+["']/g, 'STR')
      .replace(/\s+/g, ' ')
      .trim();

    return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
  }

  get(query: string): Omit<DecomposedQuery, 'fromCache' | 'decompositionTime'> | null {
    const hash = this.generatePatternHash(query);
    const entry = this.cache.get(hash);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(hash);
      return null;
    }

    entry.hitCount++;
    console.log(chalk.green(`[Decompose Cache] HIT (hits: ${entry.hitCount})`));

    // Clone and update original query
    const result = JSON.parse(JSON.stringify(entry.result));
    result.originalQuery = query;
    result.dependencies = new Map(Object.entries(result.dependencies || {}));

    return result;
  }

  set(query: string, result: Omit<DecomposedQuery, 'fromCache' | 'decompositionTime'>): void {
    // Evict old entries if needed
    if (this.cache.size >= this.maxSize) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }

    const hash = this.generatePatternHash(query);

    // Convert Map to object for storage
    const storable = {
      ...result,
      dependencies: Object.fromEntries(result.dependencies),
    };

    this.cache.set(hash, {
      pattern: hash,
      result: storable as unknown as Omit<DecomposedQuery, 'fromCache' | 'decompositionTime'>,
      timestamp: Date.now(),
      hitCount: 0,
    });

    console.log(chalk.gray(`[Decompose Cache] Stored (size: ${this.cache.size})`));
  }

  getStats(): { size: number; totalHits: number } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hitCount;
    }
    return { size: this.cache.size, totalHits };
  }

  clear(): void {
    this.cache.clear();
  }
}

// Singleton cache instance
export const decompositionCache = new DecompositionCache();

// =============================================================================
// HIERARCHICAL DECOMPOSITION
// =============================================================================

/**
 * Perform hierarchical decomposition for complex queries
 */
export async function hierarchicalDecompose(
  query: string,
  maxDepth: number = 2,
  currentDepth: number = 0,
  parentId?: number,
): Promise<SubQuery[]> {
  if (currentDepth >= maxDepth) {
    return [];
  }

  const queryType = detectQueryType(query);
  const subQueries: SubQuery[] = [];

  const prompt = `Rozłóż zapytanie na 2-4 GŁÓWNE komponenty (nie więcej!).

ZAPYTANIE: ${query}
TYP ZAPYTANIA: ${queryType.type}
POZIOM GŁĘBOKOŚCI: ${currentDepth}/${maxDepth}

Odpowiedz TYLKO jako JSON:
{
  "components": [
    {
      "query": "Pod-zapytanie 1",
      "priority": 8,
      "complexity": 3,
      "needsFurtherDecomposition": true
    }
  ]
}

ZASADY:
- priority: 1-10 (10 = najważniejsze)
- complexity: 1-5 (5 = najbardziej złożone)
- needsFurtherDecomposition: true jeśli zapytanie jest nadal złożone
- Nie twórz więcej niż 4 komponentów!`;

  try {
    const result = await geminiSemaphore.withPermit(async () => {
      const model = genAI.getGenerativeModel({
        model: INTELLIGENCE_MODEL,
        generationConfig: { temperature: 1.0, maxOutputTokens: 1024 }, // Temperature locked at 1.0 for Gemini - do not change
      });
      const res = await model.generateContent(prompt);
      return res.response.text();
    });

    const { result: parsed, success } = robustJsonParse<{
      components: {
        query?: string;
        priority?: number;
        complexity?: number;
        needsFurtherDecomposition?: boolean;
      }[];
    }>(result, {
      components: [{ query, priority: 5, complexity: 3, needsFurtherDecomposition: false }],
    });

    if (!success || !parsed.components || parsed.components.length === 0) {
      return [
        {
          id: subQueries.length,
          query,
          type: queryType.type,
          priority: 5,
          estimatedComplexity: 3,
          parentId,
          level: currentDepth,
        },
      ];
    }

    for (const comp of parsed.components) {
      const id = subQueries.length;
      const subQuery: SubQuery = {
        id,
        query: comp.query || query,
        type: detectQueryType(comp.query || query).type,
        priority: comp.priority || 5,
        estimatedComplexity: comp.complexity || 3,
        parentId,
        level: currentDepth,
      };
      subQueries.push(subQuery);

      // Recursively decompose if needed
      if (
        comp.needsFurtherDecomposition &&
        (comp.complexity ?? 0) >= 3 &&
        currentDepth < maxDepth - 1
      ) {
        const childQueries = await hierarchicalDecompose(
          comp.query ?? query,
          maxDepth,
          currentDepth + 1,
          id,
        );

        // Update IDs and add to list
        for (const child of childQueries) {
          child.id = subQueries.length;
          child.parentId = id;
          subQueries.push(child);
        }
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[Hierarchical] Level ${currentDepth} failed: ${msg}`));
    subQueries.push({
      id: 0,
      query,
      type: queryType.type,
      priority: 5,
      estimatedComplexity: 3,
      parentId,
      level: currentDepth,
    });
  }

  return subQueries;
}

/**
 * Build hierarchy tree from flat SubQuery array
 */
export function buildHierarchyTree(subQueries: SubQuery[]): HierarchyNode {
  const nodeMap = new Map<number, HierarchyNode>();

  // Create nodes
  for (const sq of subQueries) {
    nodeMap.set(sq.id, {
      id: sq.id,
      query: sq.query,
      children: [],
      level: sq.level,
    });
  }

  // Build tree
  let root: HierarchyNode | null = null;

  for (const sq of subQueries) {
    const node = nodeMap.get(sq.id);
    if (!node) continue;

    if (sq.parentId !== undefined) {
      const parent = nodeMap.get(sq.parentId);
      if (parent) {
        parent.children.push(node);
      }
    } else if (sq.level === 0) {
      if (!root) {
        root = { id: -1, query: '', children: [], level: -1 };
      }
      root.children.push(node);
    }
  }

  return root || { id: -1, query: '', children: [], level: -1 };
}

// =============================================================================
// SMART MERGING
// =============================================================================

/**
 * Merge related sub-queries to reduce redundancy
 */
export async function mergeRelatedQueries(subQueries: SubQuery[]): Promise<MergedGroup[]> {
  if (subQueries.length <= 2) {
    return []; // No need to merge
  }

  const mergedGroups: MergedGroup[] = [];
  const processed = new Set<number>();

  // Simple similarity check based on word overlap
  for (let i = 0; i < subQueries.length; i++) {
    if (processed.has(subQueries[i].id)) continue;

    const words1 = new Set(subQueries[i].query.toLowerCase().split(/\s+/));
    const similar: number[] = [subQueries[i].id];

    for (let j = i + 1; j < subQueries.length; j++) {
      if (processed.has(subQueries[j].id)) continue;

      const words2 = new Set(subQueries[j].query.toLowerCase().split(/\s+/));
      const intersection = [...words1].filter((w) => words2.has(w) && w.length > 3);
      const similarity = intersection.length / Math.min(words1.size, words2.size);

      if (similarity > 0.4) {
        similar.push(subQueries[j].id);
        processed.add(subQueries[j].id);
      }
    }

    if (similar.length > 1) {
      const queries = similar.map((id) => subQueries.find((sq) => sq.id === id)?.query);
      mergedGroups.push({
        ids: similar,
        reason: `High word overlap (${similar.length} queries)`,
        combinedQuery: queries.join(' ORAZ '),
      });
      processed.add(subQueries[i].id);
    }
  }

  if (mergedGroups.length > 0) {
    console.log(chalk.cyan(`[Merge] Created ${mergedGroups.length} merged group(s)`));
  }

  return mergedGroups;
}

// =============================================================================
// DEPENDENCY GRAPH VISUALIZATION
// =============================================================================

/**
 * Generate ASCII visualization of dependency graph
 */
export function visualizeDependencyGraph(decomposed: DecomposedQuery): string {
  const lines: string[] = [];
  lines.push('DEPENDENCY GRAPH:');
  lines.push('=================');

  // Show execution order groups
  for (let groupIdx = 0; groupIdx < decomposed.executionOrder.length; groupIdx++) {
    const group = decomposed.executionOrder[groupIdx];
    lines.push(`\nPhase ${groupIdx + 1} (parallel):`);

    for (const id of group) {
      const sq = decomposed.subQueries.find((s) => s.id === id);
      if (sq) {
        const deps = decomposed.dependencies.get(id);
        const depStr = deps && deps.length > 0 ? ` <- depends on [${deps.join(', ')}]` : '';
        const typeIcon = getTypeIcon(sq.type);
        lines.push(`  ${typeIcon} [${id}] ${sq.query.substring(0, 50)}...${depStr}`);
      }
    }
  }

  // Show hierarchy if exists
  if (decomposed.hierarchy.children.length > 0) {
    lines.push('\nHIERARCHY:');
    lines.push('---------');
    visualizeHierarchyNode(decomposed.hierarchy, lines, 0);
  }

  // Show merged groups if any
  if (decomposed.mergedGroups.length > 0) {
    lines.push('\nMERGED GROUPS:');
    lines.push('--------------');
    for (const group of decomposed.mergedGroups) {
      lines.push(`  IDs [${group.ids.join(', ')}]: ${group.reason}`);
    }
  }

  return lines.join('\n');
}

function getTypeIcon(type: QueryType): string {
  const icons: Record<QueryType, string> = {
    factual: '[F]',
    analytical: '[A]',
    creative: '[C]',
    procedural: '[P]',
    comparative: '[~]',
    exploratory: '[?]',
    hybrid: '[H]',
  };
  return icons[type] || '[?]';
}

function visualizeHierarchyNode(node: HierarchyNode, lines: string[], indent: number): void {
  const prefix = '  '.repeat(indent);

  if (node.id >= 0) {
    lines.push(`${prefix}+-- [${node.id}] ${node.query.substring(0, 40)}...`);
  }

  for (const child of node.children) {
    visualizeHierarchyNode(child, lines, indent + 1);
  }
}

// =============================================================================
// MAIN DECOMPOSITION FUNCTION
// =============================================================================

/**
 * Decompose complex query into sub-queries (Enhanced version)
 */
export async function decomposeQuery(
  query: string,
  options: {
    useCache?: boolean;
    maxDepth?: number;
    enableMerging?: boolean;
    verbose?: boolean;
  } = {},
): Promise<DecomposedQuery> {
  const startTime = Date.now();
  const {
    useCache = true,
    maxDepth: _maxDepth = 2,
    enableMerging = true,
    verbose = false,
  } = options;

  console.log(chalk.magenta('[Decompose] Breaking down complex query...'));

  // Check cache first
  if (useCache) {
    const cached = decompositionCache.get(query);
    if (cached) {
      return {
        ...cached,
        fromCache: true,
        decompositionTime: Date.now() - startTime,
      };
    }
  }

  // Detect query type
  const queryType = detectQueryType(query);
  if (verbose) {
    console.log(chalk.gray(`[Decompose] Query type: ${queryType.type} (${queryType.confidence}%)`));
  }

  // Determine if decomposition is needed
  const wordCount = query.split(/\s+/).length;
  const isSimple = wordCount < 10 && queryType.suggestedDepth === 1;

  if (isSimple) {
    console.log(chalk.green(`[Decompose] Query is simple, no decomposition needed`));

    const result: DecomposedQuery = {
      originalQuery: query,
      queryType,
      subQueries: [
        {
          id: 0,
          query,
          type: queryType.type,
          priority: 10,
          estimatedComplexity: 1,
          level: 0,
        },
      ],
      executionOrder: [[0]],
      dependencies: new Map(),
      hierarchy: { id: 0, query, children: [], level: 0 },
      mergedGroups: [],
      decompositionTime: Date.now() - startTime,
      fromCache: false,
    };

    if (useCache) {
      decompositionCache.set(query, result);
    }

    return result;
  }

  // Main decomposition prompt
  const prompt = `Rozłóż poniższe złożone zapytanie na PROSTSZE POD-ZAPYTANIA.

ZAPYTANIE: ${query}
TYP ZAPYTANIA: ${queryType.type}
GŁĘBOKOŚĆ: ${queryType.suggestedDepth}

INSTRUKCJE:
1. Zidentyfikuj NIEZALEŻNE części zapytania
2. Określ ZALEŻNOŚCI między częściami (które wymagają wyników innych)
3. Pogrupuj części które można wykonać RÓWNOLEGLE
4. Przypisz PRIORYTETY (1-10) i ZŁOŻONOŚĆ (1-5)

FORMAT JSON (STRICT - zwróć TYLKO ten JSON, bez dodatkowego tekstu):
{
  "subQueries": [
    {"query": "Pod-zapytanie 1", "priority": 8, "complexity": 2},
    {"query": "Pod-zapytanie 2", "priority": 6, "complexity": 3},
    {"query": "Pod-zapytanie 3", "priority": 5, "complexity": 1}
  ],
  "executionOrder": [[0], [1, 2]],
  "dependencies": {"2": [0]}
}

ZASADY:
- Maksymalnie 5 pod-zapytań
- Jeśli zapytanie jest PROSTE - zwróć je jako jedyne pod-zapytanie
- executionOrder: grupy ID które można wykonać równolegle
- dependencies: które pod-zapytania zależą od innych (klucz zależy od wartości)

Odpowiadaj TYLKO poprawnym JSON bez formatowania markdown.`;

  try {
    const result = await geminiSemaphore.withPermit(async () => {
      const model = genAI.getGenerativeModel({
        model: INTELLIGENCE_MODEL,
        generationConfig: { temperature: 1.0, maxOutputTokens: 2048 }, // Temperature locked at 1.0 for Gemini - do not change
      });
      const res = await model.generateContent(prompt);
      return res.response.text();
    });

    // Use robust JSON parsing
    const fallback = {
      subQueries: [{ query, priority: 5, complexity: 3 }],
      executionOrder: [[0]],
      dependencies: {},
    };

    const { result: parsed, strategy, success: _success } = robustJsonParse(result, fallback);

    if (verbose) {
      console.log(chalk.gray(`[Decompose] JSON parsed via strategy: ${strategy}`));
    }

    // Build SubQuery array with proper structure
    const subQueries: SubQuery[] = [];

    if (Array.isArray(parsed.subQueries)) {
      for (let i = 0; i < parsed.subQueries.length; i++) {
        const sq = parsed.subQueries[i];
        const queryText = typeof sq === 'string' ? sq : sq.query || query;

        subQueries.push({
          id: i,
          query: queryText,
          type: detectQueryType(queryText).type,
          priority: typeof sq === 'object' ? sq.priority || 5 : 5,
          estimatedComplexity: typeof sq === 'object' ? sq.complexity || 3 : 3,
          level: 0,
        });
      }
    } else {
      subQueries.push({
        id: 0,
        query,
        type: queryType.type,
        priority: 5,
        estimatedComplexity: 3,
        level: 0,
      });
    }

    // Convert dependencies to Map
    const deps = new Map<number, number[]>();
    if (parsed.dependencies && typeof parsed.dependencies === 'object') {
      for (const [key, value] of Object.entries(parsed.dependencies)) {
        const keyNum = parseInt(key, 10);
        if (!Number.isNaN(keyNum) && Array.isArray(value)) {
          deps.set(
            keyNum,
            value.map((v) => (typeof v === 'number' ? v : parseInt(v, 10))),
          );
        }
      }
    }

    // Validate and fix execution order
    let executionOrder: number[][] = [];
    if (Array.isArray(parsed.executionOrder)) {
      executionOrder = parsed.executionOrder.filter(Array.isArray);
    }

    if (executionOrder.length === 0) {
      // Generate execution order from dependencies
      executionOrder = generateExecutionOrder(subQueries, deps);
    }

    // Build hierarchy tree
    const hierarchy = buildHierarchyTree(subQueries);

    // Merge related queries if enabled
    let mergedGroups: MergedGroup[] = [];
    if (enableMerging && subQueries.length > 2) {
      mergedGroups = await mergeRelatedQueries(subQueries);
    }

    console.log(
      chalk.green(
        `[Decompose] Split into ${subQueries.length} sub-queries (strategy: ${strategy})`,
      ),
    );

    const decomposedResult: DecomposedQuery = {
      originalQuery: query,
      queryType,
      subQueries,
      executionOrder,
      dependencies: deps,
      hierarchy,
      mergedGroups,
      decompositionTime: Date.now() - startTime,
      fromCache: false,
    };

    // Cache the result
    if (useCache) {
      decompositionCache.set(query, decomposedResult);
    }

    return decomposedResult;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[Decompose] Failed: ${msg}`));

    // Return safe fallback
    return {
      originalQuery: query,
      queryType,
      subQueries: [
        {
          id: 0,
          query,
          type: queryType.type,
          priority: 5,
          estimatedComplexity: 3,
          level: 0,
        },
      ],
      executionOrder: [[0]],
      dependencies: new Map(),
      hierarchy: { id: 0, query, children: [], level: 0 },
      mergedGroups: [],
      decompositionTime: Date.now() - startTime,
      fromCache: false,
    };
  }
}

/**
 * Generate execution order based on dependencies
 */
function generateExecutionOrder(subQueries: SubQuery[], deps: Map<number, number[]>): number[][] {
  const order: number[][] = [];
  const executed = new Set<number>();
  const allIds = subQueries.map((sq) => sq.id);

  while (executed.size < allIds.length) {
    const phase: number[] = [];

    for (const id of allIds) {
      if (executed.has(id)) continue;

      const dependencies = deps.get(id) || [];
      const allDepsExecuted = dependencies.every((depId) => executed.has(depId));

      if (allDepsExecuted) {
        phase.push(id);
      }
    }

    if (phase.length === 0 && executed.size < allIds.length) {
      // Circular dependency detected, add remaining
      for (const id of allIds) {
        if (!executed.has(id)) {
          phase.push(id);
        }
      }
    }

    for (const id of phase) {
      executed.add(id);
    }

    if (phase.length > 0) {
      order.push(phase);
    }
  }

  return order;
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

/**
 * Quick decomposition check - returns true if query should be decomposed
 */
export function shouldDecompose(query: string): boolean {
  const wordCount = query.split(/\s+/).length;
  const hasConjunctions = /\s+(?:i|oraz|a\s+także|and|also|additionally|plus)\s+/i.test(query);
  const hasMultipleQuestions = (query.match(/\?/g) || []).length > 1;
  const queryType = detectQueryType(query);

  return wordCount > 15 || hasConjunctions || hasMultipleQuestions || queryType.suggestedDepth > 1;
}

/**
 * Get decomposition cache statistics
 */
export function getDecompositionCacheStats(): { size: number; totalHits: number } {
  return decompositionCache.getStats();
}

/**
 * Clear decomposition cache
 */
export function clearDecompositionCache(): void {
  decompositionCache.clear();
}

// Default export with all functions
export default {
  decomposeQuery,
  detectQueryType,
  hierarchicalDecompose,
  mergeRelatedQueries,
  buildHierarchyTree,
  visualizeDependencyGraph,
  shouldDecompose,
  robustJsonParse,
  decompositionCache,
  getDecompositionCacheStats,
  clearDecompositionCache,
};
