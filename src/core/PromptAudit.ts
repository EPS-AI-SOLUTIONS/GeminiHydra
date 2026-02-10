/**
 * PromptAuditTrail - Tracks all transformations to user objectives
 * Solution 2: Anti-hallucination prompt tracking
 *
 * Records every modification to the original prompt with:
 * - Source (which phase/component made the change)
 * - Reason (why the change was made)
 * - Before/After comparison
 * - Drift score (how far from original)
 */

export interface PromptTransformation {
  timestamp: number;
  source: string;           // e.g., "ToT", "Dijkstra"
  reason: string;           // Why the change was made
  before: string;           // Text before transformation
  after: string;            // Text after transformation
  driftScore: number;       // 0-100, how different from original
}

export class PromptAuditTrail {
  private originalPrompt: string = '';
  private transformations: PromptTransformation[] = [];
  private currentPrompt: string = '';

  /**
   * Initialize audit trail with original user prompt
   * CRITICAL: This should be called ONCE at the start
   */
  initialize(originalPrompt: string): void {
    this.originalPrompt = originalPrompt;
    this.currentPrompt = originalPrompt;
    this.transformations = [];

    console.log(`[PromptAudit] Initialized with: "${originalPrompt.substring(0, 50)}..."`);
  }

  /**
   * Record a transformation to the prompt
   */
  recordTransformation(
    source: string,
    reason: string,
    newPrompt: string
  ): void {
    const driftScore = this.calculateDrift(this.originalPrompt, newPrompt);

    this.transformations.push({
      timestamp: Date.now(),
      source,
      reason,
      before: this.currentPrompt,
      after: newPrompt,
      driftScore
    });

    this.currentPrompt = newPrompt;

    // Warn if drift is too high
    if (driftScore > 50) {
      console.warn(`[PromptAudit] WARNING: High drift (${driftScore}%) from original prompt!`);
      console.warn(`[PromptAudit] Source: ${source}, Reason: ${reason}`);
    }
  }

  /**
   * Calculate semantic drift from original (simplified word overlap)
   */
  private calculateDrift(original: string, current: string): number {
    const originalWords = new Set(original.toLowerCase().split(/\s+/));
    const currentWords = new Set(current.toLowerCase().split(/\s+/));

    let overlap = 0;
    for (const word of originalWords) {
      if (currentWords.has(word)) overlap++;
    }

    const maxSize = Math.max(originalWords.size, currentWords.size);
    const similarity = maxSize > 0 ? (overlap / maxSize) * 100 : 100;

    return Math.round(100 - similarity);
  }

  /**
   * Get the original unmodified prompt
   */
  getOriginal(): string {
    return this.originalPrompt;
  }

  /**
   * Get current prompt after all transformations
   */
  getCurrent(): string {
    return this.currentPrompt;
  }

  /**
   * Get total drift from original
   */
  getTotalDrift(): number {
    return this.calculateDrift(this.originalPrompt, this.currentPrompt);
  }

  /**
   * Get full audit trail
   */
  getAuditTrail(): PromptTransformation[] {
    return [...this.transformations];
  }

  /**
   * Generate summary for debugging/logging
   */
  getSummary(): string {
    const lines = [
      `=== PROMPT AUDIT TRAIL ===`,
      `Original: "${this.originalPrompt.substring(0, 80)}..."`,
      `Current: "${this.currentPrompt.substring(0, 80)}..."`,
      `Total Drift: ${this.getTotalDrift()}%`,
      `Transformations: ${this.transformations.length}`,
    ];

    for (const t of this.transformations) {
      lines.push(`  - ${t.source}: ${t.reason} (drift: ${t.driftScore}%)`);
    }

    return lines.join('\n');
  }

  /**
   * Validate that current prompt still matches user intent
   * Returns false if drift exceeds threshold
   */
  validateIntent(maxDrift: number = 70): boolean {
    const drift = this.getTotalDrift();
    if (drift > maxDrift) {
      console.error(`[PromptAudit] INTENT VIOLATION: Drift ${drift}% exceeds threshold ${maxDrift}%`);
      return false;
    }
    return true;
  }
}

// Singleton instance for global access
export const promptAudit = new PromptAuditTrail();

export default promptAudit;
