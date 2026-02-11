/**
 * ResponseDeduplicator - Solution 22 for GeminiHydra
 *
 * Prevents agents from repeating the same information multiple times
 * during swarm execution by detecting duplicate or near-duplicate responses.
 *
 * Features:
 * - Hash-based exact duplicate detection
 * - Jaccard similarity for near-duplicate detection
 * - Configurable similarity threshold (default: 0.8)
 * - Per-agent response tracking
 * - Duplicate warnings for synthesis phase
 */

/**
 * Result of adding a response to the deduplicator
 */
export interface DeduplicationResult {
  isDuplicate: boolean;
  similarity: number;
  matchedAgentId?: string;
  matchedHash?: string;
}

/**
 * Stored response entry with metadata
 */
interface ResponseEntry {
  agentId: string;
  content: string;
  hash: string;
  tokens: Set<string>;
  timestamp: number;
}

/**
 * Configuration for the deduplicator
 */
export interface DeduplicatorConfig {
  /** Similarity threshold for considering content as duplicate (0.0 - 1.0) */
  similarityThreshold: number;
  /** Minimum content length to check (skip very short responses) */
  minContentLength: number;
  /** Maximum number of responses to track (FIFO eviction) */
  maxTrackedResponses: number;
  /** Whether to normalize whitespace before comparison */
  normalizeWhitespace: boolean;
  /** Whether to ignore case when comparing */
  ignoreCase: boolean;
}

const DEFAULT_CONFIG: DeduplicatorConfig = {
  similarityThreshold: 0.8,
  minContentLength: 50,
  maxTrackedResponses: 100,
  normalizeWhitespace: true,
  ignoreCase: true,
};

/**
 * ResponseDeduplicator - Detects and tracks duplicate/near-duplicate responses
 */
export class ResponseDeduplicator {
  private responses: Map<string, ResponseEntry> = new Map();
  private hashIndex: Map<string, string[]> = new Map(); // hash -> [responseIds]
  private duplicateWarnings: string[] = [];
  private config: DeduplicatorConfig;
  private responseCount: number = 0;

  constructor(config: Partial<DeduplicatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add a response and check for duplicates
   *
   * @param agentId - Identifier of the agent that produced the response
   * @param content - The response content to check
   * @returns DeduplicationResult with duplicate status and similarity score
   */
  addResponse(agentId: string, content: string): DeduplicationResult {
    // Skip very short content
    if (content.length < this.config.minContentLength) {
      return { isDuplicate: false, similarity: 0 };
    }

    // Normalize content
    const normalizedContent = this.normalizeContent(content);

    // Calculate hash for exact match detection
    const hash = this.simpleHash(normalizedContent);

    // Check for exact duplicate (same hash)
    const existingHashIds = this.hashIndex.get(hash);
    if (existingHashIds) {
      const existingEntry = this.responses.get(existingHashIds[0]);

      if (existingEntry && existingEntry.agentId !== agentId) {
        const warning = `[Dedup] Agent "${agentId}" produced EXACT duplicate of agent "${existingEntry.agentId}" response`;
        this.duplicateWarnings.push(warning);

        return {
          isDuplicate: true,
          similarity: 1.0,
          matchedAgentId: existingEntry.agentId,
          matchedHash: hash,
        };
      }
    }

    // Tokenize for Jaccard similarity
    const tokens = this.tokenize(normalizedContent);

    // Check for near-duplicates using Jaccard similarity
    let maxSimilarity = 0;
    let mostSimilarEntry: ResponseEntry | null = null;

    for (const [_id, entry] of this.responses) {
      // Skip same agent (agent can repeat itself within a task)
      if (entry.agentId === agentId) continue;

      const similarity = this.jaccardSimilarity(tokens, entry.tokens);

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilarEntry = entry;
      }
    }

    // Check if similarity exceeds threshold
    const isDuplicate = maxSimilarity >= this.config.similarityThreshold;

    if (isDuplicate && mostSimilarEntry) {
      const warning = `[Dedup] Agent "${agentId}" response is ${(maxSimilarity * 100).toFixed(1)}% similar to agent "${mostSimilarEntry.agentId}" response`;
      this.duplicateWarnings.push(warning);
    }

    // Store the response
    const responseId = `${agentId}_${this.responseCount++}`;
    const entry: ResponseEntry = {
      agentId,
      content: normalizedContent.substring(0, 500), // Store truncated for memory efficiency
      hash,
      tokens,
      timestamp: Date.now(),
    };

    this.responses.set(responseId, entry);

    // Update hash index
    if (!this.hashIndex.has(hash)) {
      this.hashIndex.set(hash, []);
    }
    this.hashIndex.get(hash)?.push(responseId);

    // Evict old entries if over limit
    this.evictOldEntries();

    return {
      isDuplicate,
      similarity: maxSimilarity,
      matchedAgentId: mostSimilarEntry?.agentId,
      matchedHash: isDuplicate ? mostSimilarEntry?.hash : undefined,
    };
  }

  /**
   * Get all duplicate warnings accumulated during the session
   */
  getDuplicateWarnings(): string[] {
    return [...this.duplicateWarnings];
  }

  /**
   * Check if a specific content would be considered duplicate
   * without adding it to the tracker
   */
  checkDuplicate(content: string): DeduplicationResult {
    if (content.length < this.config.minContentLength) {
      return { isDuplicate: false, similarity: 0 };
    }

    const normalizedContent = this.normalizeContent(content);
    const hash = this.simpleHash(normalizedContent);

    // Check exact match
    const existingCheckIds = this.hashIndex.get(hash);
    if (existingCheckIds) {
      const existingEntry = this.responses.get(existingCheckIds[0]);

      if (existingEntry) {
        return {
          isDuplicate: true,
          similarity: 1.0,
          matchedAgentId: existingEntry.agentId,
          matchedHash: hash,
        };
      }
    }

    // Check Jaccard similarity
    const tokens = this.tokenize(normalizedContent);
    let maxSimilarity = 0;
    let mostSimilarEntry: ResponseEntry | null = null;

    for (const [, entry] of this.responses) {
      const similarity = this.jaccardSimilarity(tokens, entry.tokens);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilarEntry = entry;
      }
    }

    return {
      isDuplicate: maxSimilarity >= this.config.similarityThreshold,
      similarity: maxSimilarity,
      matchedAgentId: mostSimilarEntry?.agentId,
    };
  }

  /**
   * Get statistics about tracked responses
   */
  getStats(): {
    totalResponses: number;
    uniqueHashes: number;
    duplicatesFound: number;
    agentCounts: Record<string, number>;
  } {
    const agentCounts: Record<string, number> = {};

    for (const entry of this.responses.values()) {
      agentCounts[entry.agentId] = (agentCounts[entry.agentId] || 0) + 1;
    }

    return {
      totalResponses: this.responses.size,
      uniqueHashes: this.hashIndex.size,
      duplicatesFound: this.duplicateWarnings.length,
      agentCounts,
    };
  }

  /**
   * Check multiple responses for duplicates among each other
   * @param contents Array of content strings to check
   * @returns Object with hasDuplicates flag and duplicates array
   */
  checkDuplicates(contents: string[]): {
    hasDuplicates: boolean;
    duplicates: Array<{ indices: number[]; similarity: number; hash1: string; hash2: string }>;
    totalChecked: number;
  } {
    const duplicates: Array<{
      indices: number[];
      similarity: number;
      hash1: string;
      hash2: string;
    }> = [];
    const seen = new Map<number, { hash: string; tokens: Set<string> }>();
    const tokenCache = new Map<number, Set<string>>(); // Cache tokens for efficiency

    for (let i = 0; i < contents.length; i++) {
      const content = contents[i];
      if (!content || content.length < 10) continue;

      const normalized = this.normalizeContent(content);
      const hash = this.simpleHash(normalized);
      const tokens = this.tokenize(normalized);
      tokenCache.set(i, tokens);

      // Check against previously seen content
      for (const [j, prevData] of seen.entries()) {
        const prevTokens = tokenCache.get(j);
        if (!prevTokens) continue;
        const similarity = this.jaccardSimilarity(tokens, prevTokens);

        if (similarity >= this.config.similarityThreshold) {
          duplicates.push({
            indices: [j, i],
            similarity,
            hash1: prevData.hash,
            hash2: hash,
          });
        }
      }

      seen.set(i, { hash, tokens });
    }

    return {
      hasDuplicates: duplicates.length > 0,
      duplicates,
      totalChecked: contents.length,
    };
  }

  /**
   * Clear all tracked responses and warnings
   */
  clear(): void {
    this.responses.clear();
    this.hashIndex.clear();
    this.duplicateWarnings = [];
    this.responseCount = 0;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<DeduplicatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): DeduplicatorConfig {
    return { ...this.config };
  }

  // =========================================
  // Private Helper Methods
  // =========================================

  /**
   * Normalize content for comparison
   */
  private normalizeContent(content: string): string {
    let normalized = content;

    if (this.config.ignoreCase) {
      normalized = normalized.toLowerCase();
    }

    if (this.config.normalizeWhitespace) {
      // Replace multiple whitespace with single space
      normalized = normalized.replace(/\s+/g, ' ').trim();
    }

    // Remove common boilerplate patterns that don't affect meaning
    normalized = normalized
      .replace(/```[\w]*\n?/g, '') // Remove code fence markers
      .replace(/^\s*[-*]\s+/gm, '') // Remove list markers
      .replace(/^\s*\d+\.\s+/gm, '') // Remove numbered list markers
      .trim();

    return normalized;
  }

  /**
   * Simple hash function for exact match detection
   * Uses djb2 algorithm variant
   */
  private simpleHash(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) + hash + char; // hash * 33 + char
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Tokenize content for Jaccard similarity
   * Uses word-level tokens with optional n-grams
   */
  private tokenize(content: string): Set<string> {
    const tokens = new Set<string>();

    // Word tokens (filter out very short words)
    const words = content.split(/\s+/).filter((w) => w.length >= 3);
    for (const w of words) tokens.add(w);

    // Add bigrams for better similarity detection
    for (let i = 0; i < words.length - 1; i++) {
      tokens.add(`${words[i]}_${words[i + 1]}`);
    }

    // Add character trigrams for fuzzy matching
    for (let i = 0; i < content.length - 2; i++) {
      tokens.add(`_${content.substring(i, i + 3)}_`);
    }

    return tokens;
  }

  /**
   * Calculate Jaccard similarity between two token sets
   * J(A,B) = |A ∩ B| / |A ∪ B|
   */
  private jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 && set2.size === 0) return 1;
    if (set1.size === 0 || set2.size === 0) return 0;

    let intersectionSize = 0;
    const smallerSet = set1.size < set2.size ? set1 : set2;
    const largerSet = set1.size < set2.size ? set2 : set1;

    for (const token of smallerSet) {
      if (largerSet.has(token)) {
        intersectionSize++;
      }
    }

    const unionSize = set1.size + set2.size - intersectionSize;

    return unionSize > 0 ? intersectionSize / unionSize : 0;
  }

  /**
   * Evict old entries when over the limit (FIFO)
   */
  private evictOldEntries(): void {
    if (this.responses.size <= this.config.maxTrackedResponses) {
      return;
    }

    // Sort by timestamp and remove oldest
    const entries = Array.from(this.responses.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );

    const toRemove = entries.slice(0, entries.length - this.config.maxTrackedResponses);

    for (const [id, entry] of toRemove) {
      this.responses.delete(id);

      // Clean up hash index
      const hashEntries = this.hashIndex.get(entry.hash);
      if (hashEntries) {
        const filtered = hashEntries.filter((hid) => hid !== id);
        if (filtered.length === 0) {
          this.hashIndex.delete(entry.hash);
        } else {
          this.hashIndex.set(entry.hash, filtered);
        }
      }
    }
  }
}

// =========================================
// Singleton instance for use across modules
// =========================================

/** Global response deduplicator instance */
export const responseDeduplicator = new ResponseDeduplicator();

// =========================================
// Utility functions for integration
// =========================================

/**
 * Quick check if content is likely duplicate
 * Useful for fast filtering before detailed analysis
 */
export function isLikelyDuplicate(content: string, threshold: number = 0.8): boolean {
  return responseDeduplicator.checkDuplicate(content).similarity >= threshold;
}

/**
 * Add response and get formatted warning if duplicate
 */
export function addAndWarn(agentId: string, content: string): string | null {
  const result = responseDeduplicator.addResponse(agentId, content);

  if (result.isDuplicate) {
    return `Agent "${agentId}" produced content ${(result.similarity * 100).toFixed(0)}% similar to "${result.matchedAgentId}"`;
  }

  return null;
}

/**
 * Get deduplication summary for synthesis phase
 */
export function getDeduplicationSummary(): string {
  const stats = responseDeduplicator.getStats();
  const warnings = responseDeduplicator.getDuplicateWarnings();

  if (warnings.length === 0) {
    return '';
  }

  return `
=== RESPONSE DEDUPLICATION SUMMARY ===
Total Responses: ${stats.totalResponses}
Duplicates Found: ${stats.duplicatesFound}
Unique Content Hashes: ${stats.uniqueHashes}

Warnings:
${warnings.map((w) => `  - ${w}`).join('\n')}
======================================
`;
}
