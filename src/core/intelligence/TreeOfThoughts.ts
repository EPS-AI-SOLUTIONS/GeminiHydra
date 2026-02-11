/**
 * TreeOfThoughts - Advanced Tree-of-Thought reasoning system
 *
 * Implements deliberate problem-solving through tree-based exploration
 * of intermediate reasoning steps. Enables looking ahead, backtracking,
 * parallel exploration and MCTS-based search.
 *
 * Based on: "Tree of Thoughts: Deliberate Problem Solving with Large Language Models"
 * https://arxiv.org/abs/2305.10601
 *
 * Features:
 * - Multiple search strategies: Beam, BFS, DFS, MCTS
 * - Parallel branch exploration
 * - Thought deduplication & aggregation
 * - Adaptive pruning
 * - Backtracking support
 * - Tree visualization
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import { GEMINI_MODELS } from '../../config/models.config.js';
import { geminiSemaphore } from '../TrafficControl.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const INTELLIGENCE_MODEL = GEMINI_MODELS.FLASH;

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export type SearchStrategy = 'beam' | 'bfs' | 'dfs' | 'mcts';

/**
 * Node in the thought tree
 */
export interface ThoughtNode {
  /** Unique identifier */
  id: string;
  /** Content/reasoning of this thought */
  thought: string;
  /** Alternative name for compatibility */
  content?: string;
  /** Evaluation score (0-100) */
  evaluation: number;
  /** Normalized score (0-1) for compatibility */
  score?: number;
  /** Child branches */
  children: ThoughtNode[];
  /** Whether this is a terminal/solution node */
  isTerminal: boolean;
  /** Reasoning for the evaluation */
  reasoning: string;
  /** Depth in tree (root = 0) */
  depth?: number;
  /** Parent node reference (for MCTS backpropagation) */
  parent?: ThoughtNode;
  /** MCTS: number of visits */
  visits?: number;
  /** MCTS: total accumulated reward */
  totalReward?: number;
  /** IDs of similar thoughts that were merged */
  similarTo?: string[];
  /** Metadata */
  metadata?: {
    createdAt: Date;
    model?: string;
    attempt?: number;
    scoreReasoning?: string;
    tags?: string[];
  };
}

/**
 * Configuration for Tree of Thoughts exploration
 */
export interface ToTOptions {
  /** Maximum depth to explore */
  maxDepth?: number;
  /** Number of branches per node / beam width */
  beamWidth?: number;
  /** Minimum score threshold to continue exploring */
  minScore?: number;
  /** Search strategy */
  strategy?: SearchStrategy;
  /** Temperature for generation */
  temperature?: number;
  /** MCTS: number of iterations */
  mctsIterations?: number;
  /** MCTS: UCB1 exploration parameter (default: 1.414) */
  explorationConstant?: number;
  /** Number of parallel branch explorations */
  parallelBranches?: number;
  /** Prune if score below this percentage of best */
  pruneThreshold?: number;
  /** Adjust threshold based on depth */
  dynamicPruning?: boolean;
  /** Similarity threshold for merging (0-1) */
  deduplicationThreshold?: number;
  /** Enable thought deduplication */
  enableDeduplication?: boolean;
  /** Enable backtracking on stagnation */
  enableBacktracking?: boolean;
  /** Backtrack after N iterations without improvement */
  backtrackOnStagnation?: number;
  /** Maximum total nodes to generate */
  maxNodes?: number;
  /** Callback for progress updates */
  onProgress?: (node: ThoughtNode, stats: ExplorationStats) => void;
}

/**
 * Statistics from exploration
 */
export interface ExplorationStats {
  /** Total nodes generated */
  totalNodes: number;
  /** Nodes evaluated */
  nodesEvaluated: number;
  /** Nodes pruned */
  nodesPruned: number;
  /** Maximum depth reached */
  maxDepthReached: number;
  /** Time taken (ms) */
  timeTakenMs: number;
  /** Merged similar thoughts */
  mergedThoughts: number;
  /** Backtrack count */
  backtrackCount: number;
  /** Parallel explorations performed */
  parallelExplorations: number;
  /** Average score at each depth */
  avgScoreByDepth: Map<number, number>;
}

/**
 * Result of ToT exploration
 */
export interface TreeOfThoughtsResult {
  /** Root thought content */
  rootThought: string;
  /** Best solution path */
  bestPath: ThoughtNode[];
  /** Best score achieved */
  bestScore: number;
  /** Final synthesized solution */
  finalSolution: string;
  /** All explored thoughts */
  allThoughts: ThoughtNode[];
  /** Number of paths explored */
  exploredPaths: number;
  /** Strategy used */
  strategy: SearchStrategy;
  /** Exploration statistics */
  stats: ExplorationStats;
}

/**
 * LLM interface for custom model integration
 */
export interface LLMInterface {
  generate(prompt: string, options?: { temperature?: number }): Promise<string>;
  evaluate(prompt: string): Promise<number>;
}

// =============================================================================
// DEFAULT OPTIONS
// =============================================================================

const DEFAULT_OPTIONS: Required<ToTOptions> = {
  maxDepth: 3,
  beamWidth: 3,
  minScore: 40,
  strategy: 'beam',
  temperature: 0.7,
  mctsIterations: 50,
  explorationConstant: Math.SQRT2,
  parallelBranches: 3,
  pruneThreshold: 0.5,
  dynamicPruning: true,
  deduplicationThreshold: 0.7,
  enableDeduplication: true,
  enableBacktracking: true,
  backtrackOnStagnation: 5,
  maxNodes: 100,
  onProgress: undefined as unknown as (node: ThoughtNode, stats: ExplorationStats) => void,
};

// =============================================================================
// THOUGHT GENERATION
// =============================================================================

/**
 * Generate child thoughts from a parent thought using Gemini API
 */
async function generateChildThoughts(
  task: string,
  parentThought: string,
  depth: number,
  breadth: number = 3,
  existingThoughts: string[] = [],
): Promise<ThoughtNode[]> {
  const existingContext =
    existingThoughts.length > 0
      ? `\n\nUNIKAJ POWTARZANIA tych myśli (już eksplorowane):\n${existingThoughts
          .slice(-10)
          .map((t) => `- ${t.substring(0, 100)}`)
          .join('\n')}`
      : '';

  const prompt = `Jesteś ekspertem w rozwiązywaniu problemów metodą TREE-OF-THOUGHTS.

ZADANIE GŁÓWNE: ${task}

OBECNA MYŚL (krok ${depth}): ${parentThought}
${existingContext}

INSTRUKCJE:
1. Wygeneruj ${breadth} RÓŻNYCH kontynuacji tej myśli
2. Każda kontynuacja to INNY KIERUNEK rozwiązania
3. Oceń każdą kontynuację (0-100) - jak blisko rozwiązania?
4. Określ czy to już FINALNE rozwiązanie
5. UNIKAJ powtarzania podobnych myśli

FORMAT (JSON):
{
  "children": [
    {
      "thought": "Kontynuacja myśli 1",
      "evaluation": 75,
      "isTerminal": false,
      "reasoning": "Dlaczego ta ścieżka jest obiecująca"
    }
  ]
}

Odpowiadaj PO POLSKU. Zwróć TYLKO JSON.`;

  try {
    const response = await geminiSemaphore.withPermit(async () => {
      const model = genAI.getGenerativeModel({
        model: INTELLIGENCE_MODEL,
        generationConfig: { temperature: 1.0, maxOutputTokens: 2048 }, // Temperature locked at 1.0 for Gemini - do not change
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    });

    const jsonStr = response
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const parsed = JSON.parse(jsonStr);

    return (parsed.children || []).map((child: Record<string, unknown>, index: number) => ({
      id: uuidv4(),
      thought: child.thought,
      content: child.thought,
      evaluation: Math.min(100, Math.max(0, (child.evaluation as number) || 50)),
      score: Math.min(100, Math.max(0, (child.evaluation as number) || 50)) / 100,
      children: [],
      isTerminal: child.isTerminal || false,
      reasoning: child.reasoning || '',
      depth,
      visits: 0,
      totalReward: 0,
      metadata: {
        createdAt: new Date(),
        attempt: index + 1,
      },
    }));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[ToT] Child generation failed: ${msg}`));
    return [];
  }
}

/**
 * Extract final solution from best path
 */
async function extractSolution(task: string, bestPath: ThoughtNode[]): Promise<string> {
  const pathSummary = bestPath.map((node, i) => `Krok ${i + 1}: ${node.thought}`).join('\n');

  const prompt = `Na podstawie ścieżki rozumowania, sformułuj FINALNE ROZWIĄZANIE.

ZADANIE: ${task}

ŚCIEŻKA ROZUMOWANIA:
${pathSummary}

INSTRUKCJE:
Napisz KONKRETNE, WYKONALNE rozwiązanie zadania.
Nie opisuj procesu myślowego - daj ODPOWIEDŹ.

Odpowiadaj PO POLSKU.`;

  try {
    const response = await geminiSemaphore.withPermit(async () => {
      const model = genAI.getGenerativeModel({
        model: INTELLIGENCE_MODEL,
        generationConfig: { temperature: 1.0, maxOutputTokens: 2048 }, // Temperature locked at 1.0 for Gemini - do not change
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    });

    return response.trim();
  } catch (_error: unknown) {
    return bestPath[bestPath.length - 1]?.thought || task;
  }
}

// =============================================================================
// THOUGHT SIMILARITY & DEDUPLICATION
// =============================================================================

/**
 * Calculate similarity between two thoughts using Jaccard similarity
 */
function calculateThoughtSimilarity(thought1: string, thought2: string): number {
  const t1 = thought1.toLowerCase();
  const t2 = thought2.toLowerCase();

  const words1 = new Set(t1.split(/\s+/).filter((w) => w.length > 3));
  const words2 = new Set(t2.split(/\s+/).filter((w) => w.length > 3));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Deduplicate thoughts by merging similar ones
 */
function deduplicateThoughts(
  thoughts: ThoughtNode[],
  threshold: number = 0.7,
): { deduplicated: ThoughtNode[]; mergedCount: number } {
  if (thoughts.length <= 1) {
    return { deduplicated: thoughts, mergedCount: 0 };
  }

  const merged: ThoughtNode[] = [];
  const usedIndices = new Set<number>();
  let mergedCount = 0;

  for (let i = 0; i < thoughts.length; i++) {
    if (usedIndices.has(i)) continue;

    const current = thoughts[i];
    const similar: number[] = [i];

    for (let j = i + 1; j < thoughts.length; j++) {
      if (usedIndices.has(j)) continue;

      const similarity = calculateThoughtSimilarity(current.thought, thoughts[j].thought);
      if (similarity >= threshold) {
        similar.push(j);
        usedIndices.add(j);
      }
    }

    if (similar.length > 1) {
      const bestIdx = similar.reduce(
        (best, idx) => (thoughts[idx].evaluation > thoughts[best].evaluation ? idx : best),
        similar[0],
      );

      const mergedThought = { ...thoughts[bestIdx] };
      mergedThought.similarTo = similar
        .filter((idx) => idx !== bestIdx)
        .map((idx) => thoughts[idx].id);
      mergedThought.evaluation = Math.max(...similar.map((idx) => thoughts[idx].evaluation));
      merged.push(mergedThought);
      mergedCount += similar.length - 1;
    } else {
      merged.push(current);
    }

    usedIndices.add(i);
  }

  return { deduplicated: merged, mergedCount };
}

/**
 * Aggregate similar thoughts into a combined insight
 */
async function aggregateThoughts(
  task: string,
  thoughts: ThoughtNode[],
): Promise<ThoughtNode | null> {
  if (thoughts.length < 2) return null;

  const thoughtSummary = thoughts
    .map((t, i) => `${i + 1}. ${t.thought} (ocena: ${t.evaluation})`)
    .join('\n');

  const prompt = `Połącz poniższe podobne myśli w JEDNĄ, SILNIEJSZĄ myśl.

ZADANIE: ${task}

MYŚLI DO POŁĄCZENIA:
${thoughtSummary}

FORMAT (JSON):
{
  "aggregatedThought": "Połączona myśl...",
  "evaluation": 80,
  "reasoning": "Dlaczego ta połączona myśl jest lepsza"
}

Zwróć TYLKO JSON.`;

  try {
    const response = await geminiSemaphore.withPermit(async () => {
      const model = genAI.getGenerativeModel({
        model: INTELLIGENCE_MODEL,
        generationConfig: { temperature: 1.0, maxOutputTokens: 1024 }, // Temperature locked at 1.0 for Gemini - do not change
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    });

    const jsonStr = response
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const parsed = JSON.parse(jsonStr);

    return {
      id: uuidv4(),
      thought: parsed.aggregatedThought,
      content: parsed.aggregatedThought,
      evaluation: Math.min(100, Math.max(0, parsed.evaluation || 70)),
      score: Math.min(100, Math.max(0, parsed.evaluation || 70)) / 100,
      children: [],
      isTerminal: false,
      reasoning: parsed.reasoning || 'Agregacja myśli',
      similarTo: thoughts.map((t) => t.id),
      visits: 0,
      totalReward: 0,
      metadata: { createdAt: new Date() },
    };
  } catch {
    return null;
  }
}

// =============================================================================
// PRUNING STRATEGIES
// =============================================================================

/**
 * Calculate dynamic prune threshold based on depth and best score
 */
function calculatePruneThreshold(
  bestScore: number,
  depth: number,
  maxDepth: number,
  basePruneThreshold: number,
): number {
  const depthFactor = 1 + (depth / maxDepth) * 0.3;
  return bestScore * basePruneThreshold * depthFactor;
}

/**
 * Prune unpromising branches
 */
function pruneNodes(
  nodes: ThoughtNode[],
  threshold: number,
): { pruned: ThoughtNode[]; prunedCount: number } {
  const pruned = nodes.filter((n) => n.evaluation >= threshold);
  return {
    pruned,
    prunedCount: nodes.length - pruned.length,
  };
}

// =============================================================================
// MONTE CARLO TREE SEARCH (MCTS)
// =============================================================================

/**
 * UCB1 (Upper Confidence Bound) formula for MCTS
 */
function ucb1(node: ThoughtNode, parentVisits: number, explorationConstant: number): number {
  if (!node.visits || node.visits === 0) {
    return Infinity;
  }

  const exploitation = (node.totalReward || 0) / node.visits;
  const exploration = explorationConstant * Math.sqrt(Math.log(parentVisits) / node.visits);

  return exploitation + exploration;
}

/**
 * Select best child using UCB1
 */
function selectBestChild(node: ThoughtNode, explorationConstant: number): ThoughtNode | null {
  if (node.children.length === 0) return null;

  const parentVisits = node.visits || 1;

  let bestChild = node.children[0];
  let bestUcb = ucb1(bestChild, parentVisits, explorationConstant);

  for (const child of node.children.slice(1)) {
    const ucbValue = ucb1(child, parentVisits, explorationConstant);
    if (ucbValue > bestUcb) {
      bestUcb = ucbValue;
      bestChild = child;
    }
  }

  return bestChild;
}

/**
 * MCTS Selection phase - traverse tree to find node to expand
 */
function mctsSelect(root: ThoughtNode, explorationConstant: number): ThoughtNode {
  let current = root;

  while (current.children.length > 0 && !current.isTerminal) {
    const bestChild = selectBestChild(current, explorationConstant);
    if (!bestChild) break;
    current = bestChild;
  }

  return current;
}

/**
 * MCTS Backpropagation - update statistics up the tree
 */
function mctsBackpropagate(node: ThoughtNode, reward: number): void {
  let current: ThoughtNode | undefined = node;

  while (current) {
    current.visits = (current.visits || 0) + 1;
    current.totalReward = (current.totalReward || 0) + reward;
    current = current.parent;
  }
}

/**
 * Monte Carlo Tree Search exploration
 */
async function mctsExplore(
  task: string,
  options: Required<ToTOptions>,
  existingThoughts: string[],
  stats: ExplorationStats,
): Promise<{
  bestPath: ThoughtNode[];
  bestScore: number;
  allThoughts: ThoughtNode[];
}> {
  const { mctsIterations, explorationConstant, maxDepth, beamWidth } = options;

  const rootNode: ThoughtNode = {
    id: uuidv4(),
    thought: `Analizuję zadanie: ${task}`,
    content: `Analizuję zadanie: ${task}`,
    evaluation: 50,
    score: 0.5,
    children: [],
    isTerminal: false,
    reasoning: 'Początek eksploracji MCTS',
    visits: 0,
    totalReward: 0,
    depth: 0,
    metadata: { createdAt: new Date() },
  };

  const allThoughts: ThoughtNode[] = [rootNode];
  let bestScore = 0;
  let bestPath: ThoughtNode[] = [rootNode];

  console.log(chalk.magenta(`[ToT-MCTS] Starting ${mctsIterations} iterations...`));

  for (let iter = 0; iter < mctsIterations; iter++) {
    const selectedNode = mctsSelect(rootNode, explorationConstant);

    if (!selectedNode.isTerminal && (selectedNode.depth || 0) < maxDepth) {
      const children = await generateChildThoughts(
        task,
        selectedNode.thought,
        (selectedNode.depth || 0) + 1,
        beamWidth,
        existingThoughts.concat(allThoughts.map((t) => t.thought)),
      );

      for (const child of children) {
        child.parent = selectedNode;
        child.depth = (selectedNode.depth || 0) + 1;
      }

      selectedNode.children = children;
      allThoughts.push(...children);
      stats.totalNodes += children.length;
      stats.nodesEvaluated += children.length;
    }

    const leafNode =
      selectedNode.children.length > 0
        ? selectedNode.children.reduce((best, c) => (c.evaluation > best.evaluation ? c : best))
        : selectedNode;

    const reward = leafNode.evaluation / 100;
    mctsBackpropagate(leafNode, reward);

    if (leafNode.evaluation > bestScore) {
      bestScore = leafNode.evaluation;
      bestPath = getPathFromRoot(leafNode);
      stats.maxDepthReached = Math.max(stats.maxDepthReached, leafNode.depth || 0);
    }

    if ((iter + 1) % 10 === 0) {
      console.log(
        chalk.gray(`[ToT-MCTS] Iteration ${iter + 1}/${mctsIterations}, best score: ${bestScore}%`),
      );
    }

    if (bestScore >= 95) {
      console.log(chalk.green(`[ToT-MCTS] Found excellent solution at iteration ${iter + 1}`));
      break;
    }

    if (options.onProgress) {
      options.onProgress(leafNode, stats);
    }
  }

  return { bestPath, bestScore, allThoughts };
}

/**
 * Get path from root to node by following parent references
 */
function getPathFromRoot(target: ThoughtNode): ThoughtNode[] {
  const path: ThoughtNode[] = [];
  let current: ThoughtNode | undefined = target;

  while (current) {
    path.unshift(current);
    current = current.parent;
  }

  return path;
}

// =============================================================================
// BREADTH-FIRST SEARCH (BFS)
// =============================================================================

/**
 * BFS exploration - explores all nodes at each depth before moving deeper
 */
async function bfsExplore(
  task: string,
  options: Required<ToTOptions>,
  existingThoughts: string[],
  stats: ExplorationStats,
): Promise<{
  bestPath: ThoughtNode[];
  bestScore: number;
  allThoughts: ThoughtNode[];
}> {
  const {
    maxDepth,
    beamWidth,
    minScore,
    pruneThreshold,
    dynamicPruning,
    enableDeduplication,
    deduplicationThreshold,
  } = options;

  const rootNode: ThoughtNode = {
    id: uuidv4(),
    thought: `Analizuję zadanie: ${task}`,
    content: `Analizuję zadanie: ${task}`,
    evaluation: 50,
    score: 0.5,
    children: [],
    isTerminal: false,
    reasoning: 'Początek eksploracji BFS',
    depth: 0,
    metadata: { createdAt: new Date() },
  };

  const allThoughts: ThoughtNode[] = [rootNode];
  let bestScore = 0;
  let bestPath: ThoughtNode[] = [rootNode];
  let currentLevel: ThoughtNode[] = [rootNode];

  console.log(chalk.magenta('[ToT-BFS] Starting Breadth-First Search...'));

  for (let depth = 1; depth <= maxDepth; depth++) {
    console.log(
      chalk.gray(`[ToT-BFS] Depth ${depth}/${maxDepth}, exploring ${currentLevel.length} nodes...`),
    );

    const nextLevel: ThoughtNode[] = [];
    const thoughtTexts = existingThoughts.concat(allThoughts.map((t) => t.thought));

    for (const node of currentLevel) {
      if (node.isTerminal) continue;

      const children = await generateChildThoughts(
        task,
        node.thought,
        depth,
        beamWidth,
        thoughtTexts,
      );

      for (const child of children) {
        child.parent = node;
        child.depth = depth;
      }

      node.children = children;
      allThoughts.push(...children);
      stats.totalNodes += children.length;
      stats.nodesEvaluated += children.length;

      for (const child of children) {
        if (child.evaluation > bestScore) {
          bestScore = child.evaluation;
          bestPath = getPathFromRoot(child);
          stats.maxDepthReached = Math.max(stats.maxDepthReached, depth);
        }
      }

      const threshold = dynamicPruning
        ? calculatePruneThreshold(bestScore, depth, maxDepth, pruneThreshold)
        : minScore;

      const { pruned, prunedCount } = pruneNodes(children, threshold);
      stats.nodesPruned += prunedCount;

      nextLevel.push(...pruned.filter((c) => !c.isTerminal));

      if (options.onProgress) {
        options.onProgress(node, stats);
      }
    }

    if (enableDeduplication && nextLevel.length > 0) {
      const { deduplicated, mergedCount } = deduplicateThoughts(nextLevel, deduplicationThreshold);
      stats.mergedThoughts += mergedCount;
      if (mergedCount > 0) {
        console.log(chalk.gray(`[ToT-BFS] Merged ${mergedCount} similar thoughts`));
      }
      currentLevel = deduplicated;
    } else {
      currentLevel = nextLevel;
    }

    if (bestScore >= 90) {
      console.log(chalk.green(`[ToT-BFS] Found high-confidence solution (${bestScore}%)`));
      break;
    }

    if (currentLevel.length === 0) {
      console.log(chalk.gray('[ToT-BFS] No promising paths remaining'));
      break;
    }
  }

  return { bestPath, bestScore, allThoughts };
}

// =============================================================================
// DEPTH-FIRST SEARCH (DFS)
// =============================================================================

/**
 * DFS exploration - explores depth-first with greedy ordering
 */
async function dfsExplore(
  task: string,
  options: Required<ToTOptions>,
  existingThoughts: string[],
  stats: ExplorationStats,
): Promise<{
  bestPath: ThoughtNode[];
  bestScore: number;
  allThoughts: ThoughtNode[];
}> {
  const { maxDepth, beamWidth, minScore, pruneThreshold, maxNodes } = options;

  const rootNode: ThoughtNode = {
    id: uuidv4(),
    thought: `Analizuję zadanie: ${task}`,
    content: `Analizuję zadanie: ${task}`,
    evaluation: 50,
    score: 0.5,
    children: [],
    isTerminal: false,
    reasoning: 'Początek eksploracji DFS',
    depth: 0,
    metadata: { createdAt: new Date() },
  };

  const allThoughts: ThoughtNode[] = [rootNode];
  let bestScore = 0;
  let bestPath: ThoughtNode[] = [rootNode];

  console.log(chalk.magenta('[ToT-DFS] Starting Depth-First Search...'));

  const dfs = async (node: ThoughtNode): Promise<void> => {
    if (stats.totalNodes >= maxNodes) return;

    const depth = node.depth || 0;
    if (depth >= maxDepth) {
      node.isTerminal = true;
      if (node.evaluation > bestScore) {
        bestScore = node.evaluation;
        bestPath = getPathFromRoot(node);
      }
      stats.maxDepthReached = Math.max(stats.maxDepthReached, depth);
      return;
    }

    const thoughtTexts = existingThoughts.concat(allThoughts.map((t) => t.thought));
    const children = await generateChildThoughts(
      task,
      node.thought,
      depth + 1,
      beamWidth,
      thoughtTexts,
    );

    for (const child of children) {
      child.parent = node;
      child.depth = depth + 1;
    }

    stats.totalNodes += children.length;
    stats.nodesEvaluated += children.length;

    // Sort by evaluation (greedy DFS)
    children.sort((a, b) => b.evaluation - a.evaluation);

    for (const child of children) {
      if (stats.totalNodes >= maxNodes) break;

      if (child.evaluation < (pruneThreshold * bestScore) / 100 || child.evaluation < minScore) {
        stats.nodesPruned++;
        continue;
      }

      node.children.push(child);
      allThoughts.push(child);

      if (child.evaluation > bestScore) {
        bestScore = child.evaluation;
        bestPath = getPathFromRoot(child);
      }

      if (options.onProgress) {
        options.onProgress(child, stats);
      }

      await dfs(child);
    }

    stats.maxDepthReached = Math.max(stats.maxDepthReached, depth);
  };

  await dfs(rootNode);
  return { bestPath, bestScore, allThoughts };
}

// =============================================================================
// BEAM SEARCH (Enhanced)
// =============================================================================

/**
 * Enhanced Beam Search with backtracking and parallel exploration
 */
async function beamExplore(
  task: string,
  options: Required<ToTOptions>,
  existingThoughts: string[],
  stats: ExplorationStats,
): Promise<{
  bestPath: ThoughtNode[];
  bestScore: number;
  allThoughts: ThoughtNode[];
}> {
  const {
    maxDepth,
    beamWidth,
    minScore,
    parallelBranches,
    pruneThreshold,
    dynamicPruning,
    enableDeduplication,
    deduplicationThreshold,
    enableBacktracking,
    backtrackOnStagnation,
  } = options;

  const rootThought = `Analizuję zadanie: ${task}`;
  const rootNode: ThoughtNode = {
    id: uuidv4(),
    thought: rootThought,
    content: rootThought,
    evaluation: 50,
    score: 0.5,
    children: [],
    isTerminal: false,
    reasoning: 'Początek eksploracji',
    depth: 0,
    metadata: { createdAt: new Date() },
  };

  const allThoughts: ThoughtNode[] = [rootNode];
  let currentLevel: ThoughtNode[] = [rootNode];
  let bestPath: ThoughtNode[] = [rootNode];
  let bestScore = 0;

  const explorationHistory: Array<{ depth: number; nodes: ThoughtNode[]; bestScore: number }> = [];
  let stagnationCounter = 0;
  let previousBestScore = 0;

  console.log(chalk.magenta('[ToT-Beam] Starting enhanced Beam Search...'));

  for (let depth = 1; depth <= maxDepth; depth++) {
    console.log(
      chalk.gray(
        `[ToT-Beam] Depth ${depth}/${maxDepth}, exploring ${currentLevel.length} nodes...`,
      ),
    );

    explorationHistory.push({
      depth: depth - 1,
      nodes: [...currentLevel],
      bestScore,
    });

    let nextLevel: ThoughtNode[] = [];
    const thoughtTexts = existingThoughts.concat(allThoughts.map((t) => t.thought));

    // Parallel exploration
    const explorationPromises: Promise<ThoughtNode[]>[] = [];

    for (const node of currentLevel) {
      if (node.isTerminal) continue;

      const branchCount = Math.min(parallelBranches, beamWidth);
      for (let branch = 0; branch < branchCount; branch++) {
        explorationPromises.push(
          generateChildThoughts(
            task,
            node.thought,
            depth,
            Math.ceil(beamWidth / branchCount),
            thoughtTexts,
          ).then((children) => {
            children.forEach((c) => {
              c.parent = node;
              c.depth = depth;
            });
            return children;
          }),
        );
        stats.parallelExplorations++;
      }
    }

    const childrenArrays = await Promise.all(explorationPromises);

    for (let i = 0; i < currentLevel.length; i++) {
      const node = currentLevel[i];
      if (node.isTerminal) continue;

      const nodeChildren: ThoughtNode[] = [];
      const branchCount = Math.min(parallelBranches, beamWidth);

      for (let branch = 0; branch < branchCount; branch++) {
        const idx = i * branchCount + branch;
        if (idx < childrenArrays.length) {
          nodeChildren.push(...childrenArrays[idx]);
        }
      }

      node.children = nodeChildren;
      allThoughts.push(...nodeChildren);
      stats.totalNodes += nodeChildren.length;
      stats.nodesEvaluated += nodeChildren.length;

      for (const child of nodeChildren) {
        if (child.evaluation > bestScore) {
          bestScore = child.evaluation;
          bestPath = getPathFromRoot(child);
          stats.maxDepthReached = Math.max(stats.maxDepthReached, depth);
        }
      }

      const threshold = dynamicPruning
        ? calculatePruneThreshold(bestScore, depth, maxDepth, pruneThreshold)
        : minScore;

      const { pruned, prunedCount } = pruneNodes(nodeChildren, threshold);
      stats.nodesPruned += prunedCount;

      nextLevel.push(...pruned.filter((c) => !c.isTerminal));

      if (options.onProgress) {
        options.onProgress(node, stats);
      }
    }

    if (enableDeduplication && nextLevel.length > 0) {
      const { deduplicated, mergedCount } = deduplicateThoughts(nextLevel, deduplicationThreshold);
      stats.mergedThoughts += mergedCount;
      nextLevel = deduplicated;

      if (mergedCount > 0) {
        console.log(chalk.gray(`[ToT-Beam] Merged ${mergedCount} similar thoughts`));
      }
    }

    if (bestScore >= 90) {
      console.log(chalk.green(`[ToT-Beam] Found high-confidence solution (${bestScore}%)`));
      break;
    }

    // Backtracking check
    if (enableBacktracking) {
      if (bestScore <= previousBestScore) {
        stagnationCounter++;
      } else {
        stagnationCounter = 0;
      }

      if (stagnationCounter >= backtrackOnStagnation && explorationHistory.length > 1) {
        console.log(chalk.yellow(`[ToT-Beam] Stagnation detected, backtracking...`));

        const backtrackState = explorationHistory[Math.max(0, explorationHistory.length - 2)];

        const alternativeChildren = await generateChildThoughts(
          task,
          backtrackState.nodes[0]?.thought || rootThought,
          backtrackState.depth + 1,
          beamWidth * 2,
          thoughtTexts,
        );

        nextLevel.push(...alternativeChildren.filter((c) => c.evaluation >= minScore));
        allThoughts.push(...alternativeChildren);
        stats.totalNodes += alternativeChildren.length;

        stats.backtrackCount++;
        stagnationCounter = 0;
      }

      previousBestScore = bestScore;
    }

    nextLevel.sort((a, b) => b.evaluation - a.evaluation);
    currentLevel = nextLevel.slice(0, beamWidth);

    if (currentLevel.length === 0) {
      console.log(chalk.gray('[ToT-Beam] No promising paths remaining'));
      break;
    }
  }

  return { bestPath, bestScore, allThoughts };
}

// =============================================================================
// TREE VISUALIZATION
// =============================================================================

/**
 * Visualize the tree structure
 */
function visualizeTree(root: ThoughtNode, maxDepth: number = 5): string {
  const lines: string[] = [];

  const visualizeNode = (node: ThoughtNode, prefix: string = '', isLast: boolean = true): void => {
    const depth = node.depth || 0;
    if (depth > maxDepth) return;

    const connector = isLast ? '└── ' : '├── ';
    const scoreColor =
      node.evaluation >= 70 ? chalk.green : node.evaluation >= 40 ? chalk.yellow : chalk.red;

    const truncatedContent =
      node.thought.length > 60 ? `${node.thought.substring(0, 57)}...` : node.thought;

    lines.push(
      `${prefix}${depth === 0 ? '' : connector}` +
        `[${scoreColor(node.evaluation.toString().padStart(3))}%] ` +
        `${truncatedContent}`,
    );

    const childPrefix = prefix + (isLast ? '    ' : '│   ');

    for (let i = 0; i < node.children.length; i++) {
      visualizeNode(node.children[i], childPrefix, i === node.children.length - 1);
    }
  };

  visualizeNode(root);
  return lines.join('\n');
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

/**
 * Tree-of-Thoughts exploration for complex problems
 * Supports multiple search strategies: beam, bfs, dfs, mcts
 */
export async function treeOfThoughts(
  task: string,
  options: ToTOptions = {},
): Promise<TreeOfThoughtsResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options } as Required<ToTOptions>;
  const { strategy } = opts;

  const startTime = Date.now();

  const stats: ExplorationStats = {
    totalNodes: 1,
    nodesEvaluated: 0,
    nodesPruned: 0,
    maxDepthReached: 0,
    timeTakenMs: 0,
    mergedThoughts: 0,
    backtrackCount: 0,
    parallelExplorations: 0,
    avgScoreByDepth: new Map(),
  };

  console.log(
    chalk.magenta(`[ToT] Starting Tree-of-Thoughts with ${strategy.toUpperCase()} strategy...`),
  );

  const existingThoughts: string[] = [];
  let result: {
    bestPath: ThoughtNode[];
    bestScore: number;
    allThoughts: ThoughtNode[];
  };

  switch (strategy) {
    case 'mcts':
      result = await mctsExplore(task, opts, existingThoughts, stats);
      break;
    case 'bfs':
      result = await bfsExplore(task, opts, existingThoughts, stats);
      break;
    case 'dfs':
      result = await dfsExplore(task, opts, existingThoughts, stats);
      break;
    default:
      result = await beamExplore(task, opts, existingThoughts, stats);
      break;
  }

  stats.timeTakenMs = Date.now() - startTime;

  const finalSolution = await extractSolution(task, result.bestPath);

  console.log(
    chalk.green(
      `[ToT] Completed: ${stats.totalNodes} nodes explored, best score: ${result.bestScore}%`,
    ),
  );

  return {
    rootThought: result.allThoughts[0]?.thought || task,
    bestPath: result.bestPath,
    bestScore: result.bestScore,
    finalSolution,
    allThoughts: result.allThoughts,
    exploredPaths: stats.totalNodes,
    strategy,
    stats,
  };
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Quick Tree-of-Thoughts for simpler problems
 */
export async function quickTreeOfThoughts(task: string): Promise<string> {
  const result = await treeOfThoughts(task, {
    maxDepth: 2,
    beamWidth: 2,
    minScore: 30,
    strategy: 'beam',
  });
  return result.finalSolution;
}

/**
 * MCTS-based Tree-of-Thoughts for complex exploration
 */
export async function mctsTreeOfThoughts(
  task: string,
  iterations: number = 50,
): Promise<TreeOfThoughtsResult> {
  return treeOfThoughts(task, {
    strategy: 'mcts',
    mctsIterations: iterations,
    maxDepth: 4,
    beamWidth: 3,
  });
}

/**
 * BFS-based Tree-of-Thoughts for thorough exploration
 */
export async function bfsTreeOfThoughts(
  task: string,
  maxDepth: number = 3,
): Promise<TreeOfThoughtsResult> {
  return treeOfThoughts(task, {
    strategy: 'bfs',
    maxDepth,
    beamWidth: 3,
    enableDeduplication: true,
  });
}

/**
 * DFS-based Tree-of-Thoughts for depth-first exploration
 */
export async function dfsTreeOfThoughts(
  task: string,
  maxDepth: number = 4,
): Promise<TreeOfThoughtsResult> {
  return treeOfThoughts(task, {
    strategy: 'dfs',
    maxDepth,
    beamWidth: 3,
  });
}

/**
 * Parallel exploration with aggressive pruning
 */
export async function parallelTreeOfThoughts(
  task: string,
  parallelBranches: number = 4,
): Promise<TreeOfThoughtsResult> {
  return treeOfThoughts(task, {
    strategy: 'beam',
    parallelBranches,
    dynamicPruning: true,
    enableBacktracking: true,
    maxDepth: 4,
    beamWidth: 4,
  });
}

/**
 * Format ToT result for display
 */
export function formatToTResult(result: TreeOfThoughtsResult): string {
  const lines: string[] = [];

  lines.push(chalk.bold.blue('\n=== Tree of Thoughts Result ===\n'));

  lines.push(chalk.bold('Best Reasoning Path:'));
  for (let i = 0; i < result.bestPath.length; i++) {
    const node = result.bestPath[i];
    const scoreColor =
      node.evaluation >= 70 ? chalk.green : node.evaluation >= 40 ? chalk.yellow : chalk.red;
    lines.push(
      `  ${i + 1}. [${scoreColor(`${node.evaluation}%`)}] ${node.thought.substring(0, 80)}${node.thought.length > 80 ? '...' : ''}`,
    );
  }

  lines.push(chalk.bold('\nExploration Statistics:'));
  lines.push(`  Strategy: ${result.strategy.toUpperCase()}`);
  lines.push(`  Total nodes: ${result.stats.totalNodes}`);
  lines.push(`  Nodes evaluated: ${result.stats.nodesEvaluated}`);
  lines.push(`  Nodes pruned: ${result.stats.nodesPruned}`);
  lines.push(`  Max depth reached: ${result.stats.maxDepthReached}`);
  lines.push(`  Merged thoughts: ${result.stats.mergedThoughts}`);
  lines.push(`  Backtrack count: ${result.stats.backtrackCount}`);
  lines.push(`  Time taken: ${result.stats.timeTakenMs}ms`);

  lines.push(chalk.bold('\nFinal Solution:'));
  lines.push(result.finalSolution);

  return lines.join('\n');
}

// =============================================================================
// CLASS-BASED API (for compatibility)
// =============================================================================

/**
 * TreeOfThoughts class for object-oriented usage
 */
export class TreeOfThoughts {
  private defaultOptions: ToTOptions;

  constructor(options?: ToTOptions) {
    this.defaultOptions = options || {};
  }

  async explore(task: string, options?: ToTOptions): Promise<TreeOfThoughtsResult> {
    return treeOfThoughts(task, { ...this.defaultOptions, ...options });
  }

  async quick(task: string): Promise<string> {
    return quickTreeOfThoughts(task);
  }

  visualize(root: ThoughtNode, maxDepth?: number): string {
    return visualizeTree(root, maxDepth);
  }

  format(result: TreeOfThoughtsResult): string {
    return formatToTResult(result);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  generateChildThoughts,
  extractSolution,
  calculateThoughtSimilarity,
  deduplicateThoughts,
  aggregateThoughts,
  pruneNodes,
  calculatePruneThreshold,
  visualizeTree,
  mctsExplore,
  bfsExplore,
  dfsExplore,
  beamExplore,
  getPathFromRoot,
};

export default {
  treeOfThoughts,
  quickTreeOfThoughts,
  mctsTreeOfThoughts,
  bfsTreeOfThoughts,
  dfsTreeOfThoughts,
  parallelTreeOfThoughts,
  formatToTResult,
  visualizeTree,
  TreeOfThoughts,
};
