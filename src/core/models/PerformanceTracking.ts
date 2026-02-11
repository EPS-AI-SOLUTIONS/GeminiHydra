/**
 * PerformanceTracking - Feature #14: Model Performance Tracking
 * Tracks model performance metrics for intelligent model selection
 */

export interface ModelMetrics {
  successCount: number;
  errorCount: number;
  totalLatency: number;
  avgLatency: number;
  lastUsed: Date;
  qualityScores: number[];
}

class ModelPerformanceTracker {
  private metrics: Map<string, ModelMetrics> = new Map();

  record(model: string, success: boolean, latency: number, qualityScore?: number): void {
    if (!this.metrics.has(model)) {
      this.metrics.set(model, {
        successCount: 0,
        errorCount: 0,
        totalLatency: 0,
        avgLatency: 0,
        lastUsed: new Date(),
        qualityScores: [],
      });
    }

    const m = this.metrics.get(model);
    if (!m) return;

    if (success) {
      m.successCount++;
    } else {
      m.errorCount++;
    }

    m.totalLatency += latency;
    m.avgLatency = m.totalLatency / (m.successCount + m.errorCount);
    m.lastUsed = new Date();

    if (qualityScore !== undefined) {
      m.qualityScores.push(qualityScore);
      // Keep only last 100 scores
      if (m.qualityScores.length > 100) {
        m.qualityScores.shift();
      }
    }
  }

  getMetrics(model: string): ModelMetrics | undefined {
    return this.metrics.get(model);
  }

  getAllMetrics(): Record<string, ModelMetrics> {
    const result: Record<string, ModelMetrics> = {};
    for (const [k, v] of this.metrics) result[k] = v;
    return result;
  }

  getSuccessRate(model: string): number {
    const m = this.metrics.get(model);
    if (!m) return 0;
    const total = m.successCount + m.errorCount;
    return total > 0 ? m.successCount / total : 0;
  }

  getAvgQuality(model: string): number {
    const m = this.metrics.get(model);
    if (!m || m.qualityScores.length === 0) return 0;
    return m.qualityScores.reduce((a, b) => a + b, 0) / m.qualityScores.length;
  }

  getBestModel(candidates: string[]): string {
    let best = candidates[0];
    let bestScore = -1;

    for (const model of candidates) {
      const successRate = this.getSuccessRate(model);
      const quality = this.getAvgQuality(model);
      const score = successRate * 0.6 + quality * 0.4;

      if (score > bestScore) {
        bestScore = score;
        best = model;
      }
    }

    return best;
  }
}

export const modelPerformance = new ModelPerformanceTracker();
