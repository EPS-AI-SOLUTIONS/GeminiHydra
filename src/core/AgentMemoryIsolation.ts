/**
 * AgentMemoryIsolation - Solution 29
 *
 * Ensures agents don't "remember" or hallucinate context from previous tasks.
 * Each agent operates within an isolated memory context that strictly controls
 * what information is accessible during task execution.
 *
 * Features:
 * - Creates isolated contexts per agent/task combination
 * - Tracks allowed and blocked memory access
 * - Detects context leaks (agent referencing unauthorized information)
 * - Provides context clearing and reset functionality
 *
 * Usage in GraphProcessor.ts:
 *   const isolation = new AgentMemoryIsolation();
 *   const ctx = isolation.createIsolatedContext('geralt', 123);
 *   // ... agent executes task ...
 *   const leakCheck = isolation.validateContextLeak(response, ctx);
 *   if (leakCheck.leaked) { /* handle leak * / }
 *   isolation.clearAgentContext('geralt');
 */

import crypto from 'node:crypto';
import type { AgentRole } from '../types/index.js';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Isolated context for an agent's task execution
 * Contains strict boundaries on what the agent can access
 */
export interface IsolatedContext {
  /** Unique identifier for this isolation context */
  contextId: string;

  /** Agent that owns this context */
  agentId: string;

  /** Task ID this context is bound to */
  taskId: number;

  /** Memory keys/identifiers this agent is allowed to access */
  allowedMemories: string[];

  /** Memory keys/identifiers explicitly blocked from this agent */
  blockedMemories: string[];

  /** Timestamp when context was created */
  createdAt: number;

  /** Timestamp when context expires (auto-cleanup) */
  expiresAt: number;

  /** Parent context ID if this is a sub-task */
  parentContextId?: string;

  /** Previous task IDs whose results can be referenced (dependency chain) */
  allowedPreviousTasks: number[];

  /** Fingerprints of data injected into this context (for leak detection) */
  dataFingerprints: Map<string, string>;

  /** Whether this context is still active */
  active: boolean;
}

/**
 * Result of context leak validation
 */
export interface ContextLeakResult {
  /** Whether a leak was detected */
  leaked: boolean;

  /** Specific content that leaked */
  leakedContent: string[];

  /** Severity of the leak: low, medium, high, critical */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** Detailed explanation of detected leaks */
  details: string[];

  /** Confidence score of leak detection (0-100) */
  confidence: number;
}

/**
 * Memory entry that agents can access
 */
export interface MemoryEntry {
  /** Unique key for this memory */
  key: string;

  /** Memory content */
  content: string;

  /** Which agent created this memory */
  sourceAgent: string;

  /** Task ID that created this memory */
  sourceTaskId: number;

  /** Timestamp when memory was created */
  timestamp: number;

  /** Tags for categorization */
  tags: string[];

  /** Access level: public, task-chain, agent-only, private */
  accessLevel: 'public' | 'task-chain' | 'agent-only' | 'private';

  /** Fingerprint for leak detection */
  fingerprint: string;
}

/**
 * Configuration for AgentMemoryIsolation
 */
export interface MemoryIsolationConfig {
  /** Default context TTL in milliseconds (default: 30 minutes) */
  contextTtlMs: number;

  /** Enable strict mode - block all cross-task references by default */
  strictMode: boolean;

  /** Enable fingerprint-based leak detection */
  enableLeakDetection: boolean;

  /** Minimum confidence threshold for reporting leaks (0-100) */
  leakConfidenceThreshold: number;

  /** Maximum number of contexts per agent (prevents memory bloat) */
  maxContextsPerAgent: number;

  /** Auto-cleanup interval in milliseconds */
  cleanupIntervalMs: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: MemoryIsolationConfig = {
  contextTtlMs: 30 * 60 * 1000, // 30 minutes
  strictMode: false,
  enableLeakDetection: true,
  leakConfidenceThreshold: 60,
  maxContextsPerAgent: 10,
  cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
};

// ============================================================================
// LEAK DETECTION PATTERNS
// ============================================================================

/**
 * Patterns that indicate potential context leakage
 * Agent referencing information it shouldn't have access to
 */
const LEAK_PATTERNS = {
  // References to previous tasks not in allowed list
  previousTaskReference: /(?:task|zadanie)\s*#?(\d+)|(?:from|z)\s+(?:previous|poprzedni)/gi,

  // Agent name mentions (might indicate cross-agent info sharing)
  agentCrossReference:
    /(?:geralt|yennefer|triss|dijkstra|vesemir|jaskier|ciri|eskel|lambert|zoltan|regis|philippa)\s+(?:said|mentioned|reported|powiedział|wspomniał)/gi,

  // File path patterns that suggest reading from unauthorized sources
  suspiciousFilePaths:
    /(?:read|accessed|opened|czytałem|otworzyłem)\s+(?:file|plik)?\s*['""]?([^'""]+)['""]?/gi,

  // Session or context IDs that don't match current
  foreignContextId: /context[_-]?id\s*[:=]\s*['"]?([a-f0-9-]+)['"]?/gi,

  // Memory access patterns
  memoryAccess: /(?:memory|pamięć|remembered|pamiętam)\s+(?:from|z|about|o)/gi,

  // Time references that suggest old data
  timeReferences: /(?:earlier|wcześniej|previously|poprzednio|before|przed)\s+(?:I|we|agent)/gi,

  // Explicit hallucination indicators
  hallucinationIndicators:
    /(?:I recall|pamiętam że|I remember|przypominam sobie|as mentioned before|jak wspomniałem)/gi,
};

// ============================================================================
// AGENT MEMORY ISOLATION CLASS
// ============================================================================

/**
 * AgentMemoryIsolation - Manages isolated memory contexts for agents
 * Prevents cross-task contamination and hallucination of previous context
 */
export class AgentMemoryIsolation {
  private config: MemoryIsolationConfig;

  /** Active contexts by contextId */
  private contexts: Map<string, IsolatedContext> = new Map();

  /** Agent -> List of contextIds mapping */
  private agentContexts: Map<string, string[]> = new Map();

  /** Global memory store */
  private memoryStore: Map<string, MemoryEntry> = new Map();

  /** Cleanup interval handle */
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  /** Statistics tracking */
  private stats = {
    contextsCreated: 0,
    contextsCleared: 0,
    leaksDetected: 0,
    leaksBlocked: 0,
  };

  constructor(config: Partial<MemoryIsolationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start cleanup interval
    this.startCleanupInterval();
  }

  // ==========================================================================
  // CONTEXT MANAGEMENT
  // ==========================================================================

  /**
   * Create an isolated context for an agent's task execution
   * @param agentId - The agent identifier
   * @param taskId - The task ID being executed
   * @param options - Additional context options
   * @returns The created isolated context
   */
  createIsolatedContext(
    agentId: string,
    taskId: number,
    options: {
      allowedPreviousTasks?: number[];
      parentContextId?: string;
      customTtlMs?: number;
    } = {},
  ): IsolatedContext {
    // Generate unique context ID
    const contextId = this.generateContextId(agentId, taskId);

    // Calculate expiration
    const now = Date.now();
    const ttl = options.customTtlMs || this.config.contextTtlMs;

    // Build allowed memories list based on allowed previous tasks
    const allowedMemories = this.buildAllowedMemories(agentId, options.allowedPreviousTasks || []);

    // Build blocked memories list (memories from unrelated tasks)
    const blockedMemories = this.buildBlockedMemories(
      agentId,
      taskId,
      options.allowedPreviousTasks || [],
    );

    // Create the isolated context
    const context: IsolatedContext = {
      contextId,
      agentId,
      taskId,
      allowedMemories,
      blockedMemories,
      createdAt: now,
      expiresAt: now + ttl,
      parentContextId: options.parentContextId,
      allowedPreviousTasks: options.allowedPreviousTasks || [],
      dataFingerprints: new Map(),
      active: true,
    };

    // Store context
    this.contexts.set(contextId, context);

    // Track agent's contexts
    const agentCtxList = this.agentContexts.get(agentId) || [];
    agentCtxList.push(contextId);
    this.agentContexts.set(agentId, agentCtxList);

    // Enforce max contexts per agent
    this.enforceMaxContexts(agentId);

    // Update stats
    this.stats.contextsCreated++;

    return context;
  }

  /**
   * Get an existing context by ID
   */
  getContext(contextId: string): IsolatedContext | undefined {
    const context = this.contexts.get(contextId);

    // Check if expired
    if (context && context.expiresAt < Date.now()) {
      this.deactivateContext(contextId);
      return undefined;
    }

    return context;
  }

  /**
   * Get the active context for an agent
   */
  getActiveContextForAgent(agentId: string): IsolatedContext | undefined {
    const contextIds = this.agentContexts.get(agentId) || [];

    // Find most recent active context
    for (let i = contextIds.length - 1; i >= 0; i--) {
      const ctx = this.contexts.get(contextIds[i]);
      if (ctx?.active && ctx.expiresAt > Date.now()) {
        return ctx;
      }
    }

    return undefined;
  }

  /**
   * Deactivate a context (marks as inactive but keeps for reference)
   */
  deactivateContext(contextId: string): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.active = false;
    }
  }

  /**
   * Clear all contexts for a specific agent
   * Call this after an agent completes all its tasks
   */
  clearAgentContext(agentId: string): void {
    const contextIds = this.agentContexts.get(agentId) || [];

    for (const contextId of contextIds) {
      this.contexts.delete(contextId);
    }

    this.agentContexts.delete(agentId);
    this.stats.contextsCleared++;
  }

  /**
   * Clear all contexts (full reset)
   */
  clearAllContexts(): void {
    this.contexts.clear();
    this.agentContexts.clear();
    this.stats.contextsCleared += this.stats.contextsCreated;
  }

  // ==========================================================================
  // MEMORY MANAGEMENT
  // ==========================================================================

  /**
   * Register a memory entry that can be accessed by agents
   */
  registerMemory(entry: Omit<MemoryEntry, 'fingerprint'>): string {
    const fingerprint = this.generateFingerprint(entry.content);

    const fullEntry: MemoryEntry = {
      ...entry,
      fingerprint,
    };

    this.memoryStore.set(entry.key, fullEntry);
    return fingerprint;
  }

  /**
   * Inject data into a context (adds fingerprint for leak tracking)
   */
  injectDataIntoContext(contextId: string, dataKey: string, data: string): void {
    const context = this.contexts.get(contextId);
    if (!context || !context.active) {
      throw new Error(`Cannot inject data: context ${contextId} not found or inactive`);
    }

    const fingerprint = this.generateFingerprint(data);
    context.dataFingerprints.set(dataKey, fingerprint);
    context.allowedMemories.push(dataKey);
  }

  /**
   * Check if an agent can access specific memory
   */
  canAccessMemory(contextId: string, memoryKey: string): boolean {
    const context = this.contexts.get(contextId);
    if (!context || !context.active) {
      return false;
    }

    // Check blocked list first
    if (context.blockedMemories.includes(memoryKey)) {
      return false;
    }

    // Check allowed list
    if (context.allowedMemories.includes(memoryKey)) {
      return true;
    }

    // In strict mode, deny by default
    if (this.config.strictMode) {
      return false;
    }

    // Check if memory has public access
    const memory = this.memoryStore.get(memoryKey);
    return memory?.accessLevel === 'public';
  }

  // ==========================================================================
  // LEAK DETECTION
  // ==========================================================================

  /**
   * Validate if a response contains context leaks
   * Detects when an agent references information outside its isolated context
   *
   * @param response - The agent's response text
   * @param isolatedContext - The context the agent was operating in
   * @returns Leak detection result
   */
  validateContextLeak(response: string, isolatedContext: IsolatedContext): ContextLeakResult {
    if (!this.config.enableLeakDetection) {
      return {
        leaked: false,
        leakedContent: [],
        severity: 'low',
        details: ['Leak detection disabled'],
        confidence: 0,
      };
    }

    const leakedContent: string[] = [];
    const details: string[] = [];
    let totalScore = 0;
    let checkCount = 0;

    // 1. Check for references to tasks not in allowed list
    const taskRefs = this.extractTaskReferences(response);
    for (const taskId of taskRefs) {
      if (
        !isolatedContext.allowedPreviousTasks.includes(taskId) &&
        taskId !== isolatedContext.taskId
      ) {
        leakedContent.push(`Task #${taskId}`);
        details.push(`References unauthorized task #${taskId}`);
        totalScore += 30;
      }
      checkCount++;
    }

    // 2. Check for foreign context IDs
    const foreignIds = this.extractForeignContextIds(response, isolatedContext.contextId);
    for (const foreignId of foreignIds) {
      leakedContent.push(`Context: ${foreignId}`);
      details.push(`References foreign context ID: ${foreignId}`);
      totalScore += 40;
      checkCount++;
    }

    // 3. Check for blocked memory references
    for (const blockedKey of isolatedContext.blockedMemories) {
      if (response.toLowerCase().includes(blockedKey.toLowerCase())) {
        leakedContent.push(`Memory: ${blockedKey}`);
        details.push(`References blocked memory: ${blockedKey}`);
        totalScore += 25;
        checkCount++;
      }
    }

    // 4. Check for fingerprint matches from other contexts
    const fingerprintLeaks = this.detectFingerprintLeaks(response, isolatedContext);
    for (const leak of fingerprintLeaks) {
      leakedContent.push(leak.match);
      details.push(`Fingerprint match: ${leak.source}`);
      totalScore += leak.score;
      checkCount++;
    }

    // 5. Check for hallucination indicators
    const hallucinationScore = this.detectHallucinationPatterns(response);
    if (hallucinationScore > 0) {
      details.push(`Hallucination patterns detected (score: ${hallucinationScore})`);
      totalScore += hallucinationScore;
      checkCount++;
    }

    // 6. Check for cross-agent information sharing patterns
    const crossAgentScore = this.detectCrossAgentPatterns(response, isolatedContext.agentId);
    if (crossAgentScore > 0) {
      details.push(`Cross-agent reference patterns (score: ${crossAgentScore})`);
      totalScore += crossAgentScore;
      checkCount++;
    }

    // Calculate final confidence score
    const confidence = checkCount > 0 ? Math.min(100, (totalScore / checkCount) * 10) : 0;
    const leaked = confidence >= this.config.leakConfidenceThreshold;

    // Determine severity
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (confidence >= 90) severity = 'critical';
    else if (confidence >= 70) severity = 'high';
    else if (confidence >= 50) severity = 'medium';

    // Update stats
    if (leaked) {
      this.stats.leaksDetected++;
    }

    return {
      leaked,
      leakedContent,
      severity,
      details,
      confidence: Math.round(confidence),
    };
  }

  /**
   * Sanitize a response by removing leaked content
   * @param response - Original response
   * @param leakResult - Result from validateContextLeak
   * @returns Sanitized response
   */
  sanitizeLeakedContent(response: string, leakResult: ContextLeakResult): string {
    if (!leakResult.leaked || leakResult.leakedContent.length === 0) {
      return response;
    }

    let sanitized = response;

    for (const leak of leakResult.leakedContent) {
      // Escape special regex characters
      const escaped = leak.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'gi');
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    this.stats.leaksBlocked++;
    return sanitized;
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Generate a unique context ID
   */
  private generateContextId(agentId: string, taskId: number): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `ctx_${agentId}_${taskId}_${timestamp}_${random}`;
  }

  /**
   * Generate a fingerprint for data (for leak detection)
   */
  private generateFingerprint(data: string): string {
    // Use content-based hashing with some normalization
    const normalized = data.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 500); // Use first 500 chars for fingerprint

    return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
  }

  /**
   * Build list of allowed memories for a context
   */
  private buildAllowedMemories(agentId: string, allowedTaskIds: number[]): string[] {
    const allowed: string[] = [];

    // Add memories from allowed previous tasks
    for (const [key, memory] of this.memoryStore) {
      if (allowedTaskIds.includes(memory.sourceTaskId)) {
        allowed.push(key);
      }
      // Add agent's own memories
      if (memory.sourceAgent === agentId && memory.accessLevel !== 'private') {
        allowed.push(key);
      }
      // Add public memories
      if (memory.accessLevel === 'public') {
        allowed.push(key);
      }
    }

    return [...new Set(allowed)];
  }

  /**
   * Build list of blocked memories for a context
   */
  private buildBlockedMemories(
    agentId: string,
    taskId: number,
    allowedTaskIds: number[],
  ): string[] {
    const blocked: string[] = [];

    for (const [key, memory] of this.memoryStore) {
      // Block memories from non-allowed tasks (that aren't public)
      if (
        !allowedTaskIds.includes(memory.sourceTaskId) &&
        memory.sourceTaskId !== taskId &&
        memory.accessLevel !== 'public'
      ) {
        blocked.push(key);
      }
      // Block other agents' private memories
      if (memory.sourceAgent !== agentId && memory.accessLevel === 'private') {
        blocked.push(key);
      }
    }

    return [...new Set(blocked)];
  }

  /**
   * Enforce maximum contexts per agent
   */
  private enforceMaxContexts(agentId: string): void {
    const contextIds = this.agentContexts.get(agentId) || [];

    if (contextIds.length > this.config.maxContextsPerAgent) {
      // Remove oldest contexts
      const toRemove = contextIds.length - this.config.maxContextsPerAgent;
      const removed = contextIds.splice(0, toRemove);

      for (const ctxId of removed) {
        this.contexts.delete(ctxId);
      }

      this.agentContexts.set(agentId, contextIds);
    }
  }

  /**
   * Extract task ID references from text
   */
  private extractTaskReferences(text: string): number[] {
    const taskIds: number[] = [];
    const pattern = /(?:task|zadanie)\s*#?(\d+)/gi;

    for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
      const taskId = parseInt(match[1], 10);
      if (!Number.isNaN(taskId) && taskId > 0 && taskId < 10000) {
        taskIds.push(taskId);
      }
    }

    return [...new Set(taskIds)];
  }

  /**
   * Extract foreign context IDs from text
   */
  private extractForeignContextIds(text: string, currentContextId: string): string[] {
    const foreignIds: string[] = [];
    const pattern = /ctx_[a-z]+_\d+_\d+_[a-f0-9]+/gi;

    for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
      const ctxId = match[0];
      if (ctxId !== currentContextId) {
        foreignIds.push(ctxId);
      }
    }

    return foreignIds;
  }

  /**
   * Detect fingerprint leaks from other contexts
   */
  private detectFingerprintLeaks(
    response: string,
    currentContext: IsolatedContext,
  ): Array<{ match: string; source: string; score: number }> {
    const leaks: Array<{ match: string; source: string; score: number }> = [];
    const responseFingerprint = this.generateFingerprint(response);

    // Check against fingerprints from other contexts
    for (const [ctxId, ctx] of this.contexts) {
      if (ctxId === currentContext.contextId) continue;
      if (ctx.agentId !== currentContext.agentId) continue; // Only check same agent's other contexts

      for (const [dataKey, fingerprint] of ctx.dataFingerprints) {
        // Check if current context has access to this data
        if (!currentContext.allowedMemories.includes(dataKey)) {
          // Simple fingerprint similarity check
          const similarity = this.fingerprintSimilarity(responseFingerprint, fingerprint);
          if (similarity > 0.3) {
            leaks.push({
              match: dataKey,
              source: ctxId,
              score: Math.round(similarity * 50),
            });
          }
        }
      }
    }

    return leaks;
  }

  /**
   * Calculate fingerprint similarity (simple character overlap)
   */
  private fingerprintSimilarity(fp1: string, fp2: string): number {
    if (fp1 === fp2) return 1.0;

    let matches = 0;
    for (let i = 0; i < Math.min(fp1.length, fp2.length); i++) {
      if (fp1[i] === fp2[i]) matches++;
    }

    return matches / Math.max(fp1.length, fp2.length);
  }

  /**
   * Detect hallucination patterns in response
   */
  private detectHallucinationPatterns(response: string): number {
    let score = 0;

    // Check each hallucination pattern
    for (const [name, pattern] of Object.entries(LEAK_PATTERNS)) {
      if (
        name === 'hallucinationIndicators' ||
        name === 'memoryAccess' ||
        name === 'timeReferences'
      ) {
        const matches = response.match(pattern);
        if (matches) {
          score += matches.length * 10;
        }
      }
    }

    // Additional checks for specific phrases
    const hallucPhases = [
      'as I mentioned',
      'jak wspomniałem',
      'from our previous',
      'z poprzedniej',
      'you told me before',
      'earlier in our conversation',
      'wcześniej w rozmowie',
    ];

    for (const phrase of hallucPhases) {
      if (response.toLowerCase().includes(phrase.toLowerCase())) {
        score += 15;
      }
    }

    return Math.min(50, score); // Cap at 50
  }

  /**
   * Detect cross-agent reference patterns
   */
  private detectCrossAgentPatterns(response: string, currentAgent: string): number {
    let score = 0;

    const agentNames: AgentRole[] = [
      'dijkstra',
      'geralt',
      'yennefer',
      'triss',
      'vesemir',
      'jaskier',
      'ciri',
      'eskel',
      'lambert',
      'zoltan',
      'regis',
      'philippa',
    ];

    for (const agent of agentNames) {
      if (agent === currentAgent) continue;

      // Check for patterns like "Geralt said...", "Yennefer reported..."
      const patterns = [
        new RegExp(`${agent}\\s+(?:said|mentioned|reported|found|discovered)`, 'gi'),
        new RegExp(`${agent}\\s+(?:powiedział|wspomniał|zgłosił|znalazł)`, 'gi'),
        new RegExp(`(?:according to|według)\\s+${agent}`, 'gi'),
        new RegExp(`${agent}'s\\s+(?:analysis|report|findings)`, 'gi'),
      ];

      for (const pattern of patterns) {
        if (pattern.test(response)) {
          score += 20;
        }
      }
    }

    return Math.min(40, score); // Cap at 40
  }

  /**
   * Start the cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredContexts();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Clean up expired contexts
   */
  private cleanupExpiredContexts(): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [contextId, context] of this.contexts) {
      if (context.expiresAt < now) {
        expiredIds.push(contextId);
      }
    }

    for (const contextId of expiredIds) {
      const ctx = this.contexts.get(contextId);
      if (ctx) {
        // Remove from agent's list
        const agentContexts = this.agentContexts.get(ctx.agentId) || [];
        const idx = agentContexts.indexOf(contextId);
        if (idx >= 0) {
          agentContexts.splice(idx, 1);
          this.agentContexts.set(ctx.agentId, agentContexts);
        }
      }
      this.contexts.delete(contextId);
    }
  }

  /**
   * Stop the cleanup interval (call when shutting down)
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // ==========================================================================
  // STATISTICS & DEBUGGING
  // ==========================================================================

  /**
   * Get current statistics
   */
  getStats(): typeof this.stats & {
    activeContexts: number;
    totalMemories: number;
    agentsWithContexts: number;
  } {
    return {
      ...this.stats,
      activeContexts: Array.from(this.contexts.values()).filter((c) => c.active).length,
      totalMemories: this.memoryStore.size,
      agentsWithContexts: this.agentContexts.size,
    };
  }

  /**
   * Debug: Get context details for an agent
   */
  debugAgentContexts(agentId: string): {
    contextCount: number;
    activeCount: number;
    contexts: Array<{
      contextId: string;
      taskId: number;
      active: boolean;
      allowedMemoryCount: number;
      blockedMemoryCount: number;
      age: number;
    }>;
  } {
    const contextIds = this.agentContexts.get(agentId) || [];
    const now = Date.now();

    const contexts = contextIds.map((ctxId) => {
      const ctx = this.contexts.get(ctxId);
      if (!ctx) throw new Error(`Context ${ctxId} not found`);
      return {
        contextId: ctx.contextId,
        taskId: ctx.taskId,
        active: ctx.active,
        allowedMemoryCount: ctx.allowedMemories.length,
        blockedMemoryCount: ctx.blockedMemories.length,
        age: Math.round((now - ctx.createdAt) / 1000),
      };
    });

    return {
      contextCount: contexts.length,
      activeCount: contexts.filter((c) => c.active).length,
      contexts,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/** Global singleton instance for easy access */
let globalInstance: AgentMemoryIsolation | null = null;

/**
 * Get the global AgentMemoryIsolation instance
 */
export function getAgentMemoryIsolation(): AgentMemoryIsolation {
  if (!globalInstance) {
    globalInstance = new AgentMemoryIsolation();
  }
  return globalInstance;
}

/**
 * Initialize AgentMemoryIsolation with custom config
 */
export function initializeAgentMemoryIsolation(
  config?: Partial<MemoryIsolationConfig>,
): AgentMemoryIsolation {
  globalInstance = new AgentMemoryIsolation(config);
  return globalInstance;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { AgentMemoryIsolation as default, LEAK_PATTERNS };
