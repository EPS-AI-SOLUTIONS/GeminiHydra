/**
 * GeminiHydra - Statistics & Metrics
 * Prometheus-style metrics collection and time-series analytics
 */

// ============================================================================
// Rolling Statistics
// ============================================================================

/**
 * Rolling window statistics calculator
 */
export class RollingStats {
  private samples: number[] = [];
  private windowSize: number;

  constructor(windowSize = 100) {
    this.windowSize = windowSize;
  }

  /**
   * Add a sample
   */
  add(value: number): void {
    this.samples.push(value);
    if (this.samples.length > this.windowSize) {
      this.samples.shift();
    }
  }

  /**
   * Get average
   */
  average(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  /**
   * Get minimum
   */
  min(): number {
    if (this.samples.length === 0) return 0;
    return Math.min(...this.samples);
  }

  /**
   * Get maximum
   */
  max(): number {
    if (this.samples.length === 0) return 0;
    return Math.max(...this.samples);
  }

  /**
   * Get standard deviation
   */
  stdDev(): number {
    if (this.samples.length < 2) return 0;
    const avg = this.average();
    const squareDiffs = this.samples.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / (this.samples.length - 1));
  }

  /**
   * Get percentile
   */
  percentile(p: number): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get count
   */
  count(): number {
    return this.samples.length;
  }

  /**
   * Get all statistics
   */
  getStats(): RollingStatsData {
    return {
      count: this.count(),
      average: this.average(),
      min: this.min(),
      max: this.max(),
      stdDev: this.stdDev(),
      p50: this.percentile(50),
      p90: this.percentile(90),
      p95: this.percentile(95),
      p99: this.percentile(99)
    };
  }

  /**
   * Reset samples
   */
  reset(): void {
    this.samples = [];
  }
}

export interface RollingStatsData {
  count: number;
  average: number;
  min: number;
  max: number;
  stdDev: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

// ============================================================================
// Time Series Metrics
// ============================================================================

interface Bucket {
  count: number;
  sum: number;
  min: number;
  max: number;
  values: number[];
}

export interface TimeSeriesConfig {
  bucketSize?: number;  // ms (default: 60000 = 1 minute)
  retention?: number;   // number of buckets (default: 60)
}

export interface TimeSeriesPoint {
  timestamp: number;
  count: number;
  average: number;
  min: number;
  max: number;
}

export interface AggregatedMetrics {
  count: number;
  average: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Time-series metrics with bucketing
 */
export class TimeSeriesMetrics {
  private bucketSize: number;
  private retention: number;
  private buckets: Map<number, Bucket> = new Map();

  constructor(config: TimeSeriesConfig = {}) {
    this.bucketSize = config.bucketSize ?? 60000;
    this.retention = config.retention ?? 60;
  }

  /**
   * Get bucket key for timestamp
   */
  private getBucketKey(timestamp = Date.now()): number {
    return Math.floor(timestamp / this.bucketSize) * this.bucketSize;
  }

  /**
   * Get or create bucket
   */
  private getOrCreateBucket(key: number): Bucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        values: []
      };
      this.buckets.set(key, bucket);
      this.prune();
    }
    return bucket;
  }

  /**
   * Remove old buckets
   */
  private prune(): void {
    const cutoff = this.getBucketKey() - (this.retention * this.bucketSize);
    for (const key of this.buckets.keys()) {
      if (key < cutoff) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Record a value
   */
  record(value: number, timestamp = Date.now()): void {
    const key = this.getBucketKey(timestamp);
    const bucket = this.getOrCreateBucket(key);

    bucket.count++;
    bucket.sum += value;
    bucket.min = Math.min(bucket.min, value);
    bucket.max = Math.max(bucket.max, value);
    bucket.values.push(value);
  }

  /**
   * Get aggregated metrics for time range
   */
  getMetrics(startTime = 0, endTime = Date.now()): AggregatedMetrics {
    let totalCount = 0;
    let totalSum = 0;
    let min = Infinity;
    let max = -Infinity;
    const allValues: number[] = [];

    for (const [key, bucket] of this.buckets) {
      if (key >= startTime && key <= endTime) {
        totalCount += bucket.count;
        totalSum += bucket.sum;
        min = Math.min(min, bucket.min);
        max = Math.max(max, bucket.max);
        allValues.push(...bucket.values);
      }
    }

    if (totalCount === 0) {
      return { count: 0, average: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }

    allValues.sort((a, b) => a - b);

    return {
      count: totalCount,
      average: totalSum / totalCount,
      min: min === Infinity ? 0 : min,
      max: max === -Infinity ? 0 : max,
      p50: allValues[Math.floor(allValues.length * 0.5)] || 0,
      p95: allValues[Math.floor(allValues.length * 0.95)] || 0,
      p99: allValues[Math.floor(allValues.length * 0.99)] || 0
    };
  }

  /**
   * Get time series data
   */
  getTimeSeries(startTime = 0, endTime = Date.now()): TimeSeriesPoint[] {
    const series: TimeSeriesPoint[] = [];

    for (const [key, bucket] of this.buckets) {
      if (key >= startTime && key <= endTime) {
        series.push({
          timestamp: key,
          count: bucket.count,
          average: bucket.count > 0 ? bucket.sum / bucket.count : 0,
          min: bucket.min === Infinity ? 0 : bucket.min,
          max: bucket.max === -Infinity ? 0 : bucket.max
        });
      }
    }

    return series.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Clear all data
   */
  reset(): void {
    this.buckets.clear();
  }
}

// ============================================================================
// Prometheus-style Metrics
// ============================================================================

export interface LabeledValue {
  labels: Record<string, string>;
  value: number;
}

/**
 * Counter with labels (Prometheus-style)
 */
export class Counter {
  readonly name: string;
  readonly description: string;
  private values: Map<string, number> = new Map();

  constructor(name: string, description = '') {
    this.name = name;
    this.description = description;
  }

  /**
   * Generate label key
   */
  private labelKey(labels: Record<string, string> = {}): string {
    return JSON.stringify(Object.entries(labels).sort());
  }

  /**
   * Increment counter
   */
  inc(value = 1, labels: Record<string, string> = {}): void {
    const key = this.labelKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current + value);
  }

  /**
   * Get counter value
   */
  get(labels: Record<string, string> = {}): number {
    const key = this.labelKey(labels);
    return this.values.get(key) || 0;
  }

  /**
   * Get all values with labels
   */
  getAll(): LabeledValue[] {
    const result: LabeledValue[] = [];
    for (const [key, value] of this.values) {
      const entries = JSON.parse(key) as [string, string][];
      const labels = entries.reduce<Record<string, string>>((acc, [k, v]) => {
        acc[k] = v;
        return acc;
      }, {});
      result.push({ labels, value });
    }
    return result;
  }

  /**
   * Get total across all labels
   */
  total(): number {
    let sum = 0;
    for (const value of this.values.values()) {
      sum += value;
    }
    return sum;
  }

  /**
   * Reset counter
   */
  reset(): void {
    this.values.clear();
  }
}

/**
 * Gauge metric (can go up and down)
 */
export class Gauge {
  readonly name: string;
  readonly description: string;
  private values: Map<string, number> = new Map();

  constructor(name: string, description = '') {
    this.name = name;
    this.description = description;
  }

  private labelKey(labels: Record<string, string> = {}): string {
    return JSON.stringify(Object.entries(labels).sort());
  }

  set(value: number, labels: Record<string, string> = {}): void {
    const key = this.labelKey(labels);
    this.values.set(key, value);
  }

  inc(value = 1, labels: Record<string, string> = {}): void {
    const key = this.labelKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current + value);
  }

  dec(value = 1, labels: Record<string, string> = {}): void {
    const key = this.labelKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current - value);
  }

  get(labels: Record<string, string> = {}): number {
    const key = this.labelKey(labels);
    return this.values.get(key) || 0;
  }

  getAll(): LabeledValue[] {
    const result: LabeledValue[] = [];
    for (const [key, value] of this.values) {
      const entries = JSON.parse(key) as [string, string][];
      const labels = entries.reduce<Record<string, string>>((acc, [k, v]) => {
        acc[k] = v;
        return acc;
      }, {});
      result.push({ labels, value });
    }
    return result;
  }

  reset(): void {
    this.values.clear();
  }
}

export interface HistogramBucket {
  le: number | '+Inf';
  count: number;
}

export interface HistogramData {
  name: string;
  buckets: HistogramBucket[];
  sum: number;
  count: number;
  average: number;
}

/**
 * Histogram for latency tracking
 */
export class Histogram {
  readonly name: string;
  private readonly buckets: number[];
  private counts: number[];
  private sum = 0;
  private _count = 0;

  constructor(name: string, buckets = [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    this.name = name;
    this.buckets = buckets.sort((a, b) => a - b);
    this.counts = new Array(buckets.length + 1).fill(0);
  }

  /**
   * Observe a value
   */
  observe(value: number): void {
    this.sum += value;
    this._count++;

    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        this.counts[i]++;
        return;
      }
    }
    this.counts[this.counts.length - 1]++;
  }

  /**
   * Get histogram data
   */
  getData(): HistogramData {
    const bucketData: HistogramBucket[] = this.buckets.map((boundary, i) => ({
      le: boundary,
      count: this.counts.slice(0, i + 1).reduce((a, b) => a + b, 0)
    }));

    bucketData.push({
      le: '+Inf',
      count: this._count
    });

    return {
      name: this.name,
      buckets: bucketData,
      sum: this.sum,
      count: this._count,
      average: this._count > 0 ? this.sum / this._count : 0
    };
  }

  /**
   * Reset histogram
   */
  reset(): void {
    this.counts = new Array(this.buckets.length + 1).fill(0);
    this.sum = 0;
    this._count = 0;
  }
}

// ============================================================================
// Stats Collector
// ============================================================================

export interface RequestData {
  provider: string;
  category?: string;
  latency?: number;
  cost?: number;
  savings?: number;
  tokens?: number;
  success: boolean;
  error?: { type: string };
}

export interface RoutingData {
  latency?: number;
  category: string;
  provider: string;
  complexity?: number;
}

export interface StatsSummary {
  requests: {
    total: number;
    byProvider: Record<string, number>;
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
  };
  latency: {
    histogram: HistogramData;
    recent: RollingStatsData;
  };
  cost: {
    total: number;
    byProvider: Record<string, number>;
    savings: number;
  };
  tokens: {
    total: number;
    byProvider: Record<string, number>;
  };
}

export interface TrendData {
  latency: TimeSeriesPoint[];
  requests: TimeSeriesPoint[];
  aggregated: {
    latency: AggregatedMetrics;
    requests: AggregatedMetrics;
  };
}

/**
 * GeminiHydra Stats Collector - Central statistics collection
 */
export class StatsCollector {
  // Request counters
  readonly requests = new Counter('hydra_requests_total', 'Total number of requests');
  readonly errors = new Counter('hydra_errors_total', 'Total number of errors');

  // Latency histograms
  readonly latency = new Histogram('hydra_request_latency_ms');
  readonly routingLatency = new Histogram('hydra_routing_latency_ms', [1, 5, 10, 25, 50, 100]);

  // Cost tracking
  readonly cost = new Counter('hydra_cost_total', 'Total estimated cost');
  readonly savings = new Counter('hydra_savings_total', 'Total estimated savings');

  // Token tracking
  readonly tokens = new Counter('hydra_tokens_total', 'Total tokens used');

  // Active connections
  readonly activeConnections = new Gauge('hydra_active_connections', 'Current active connections');

  // Rolling stats for recent data
  readonly recentLatency = new RollingStats(100);
  readonly recentCost = new RollingStats(100);

  // Time series for trends
  readonly latencyTimeSeries = new TimeSeriesMetrics();
  readonly requestTimeSeries = new TimeSeriesMetrics();

  /**
   * Record a request
   */
  recordRequest(data: RequestData): void {
    const { provider, category, latency, cost, savings, tokens, success, error } = data;

    // Increment counters
    this.requests.inc(1, {
      provider,
      category: category ?? 'unknown',
      status: success ? 'success' : 'failure'
    });

    if (!success) {
      this.errors.inc(1, {
        provider,
        category: category ?? 'unknown',
        error_type: error?.type ?? 'unknown'
      });
    }

    // Record latency
    if (latency !== undefined) {
      this.latency.observe(latency);
      this.recentLatency.add(latency);
      this.latencyTimeSeries.record(latency);
    }

    // Record cost
    if (cost !== undefined) {
      this.cost.inc(cost, { provider });
      this.recentCost.add(cost);
    }

    // Record savings
    if (savings !== undefined) {
      this.savings.inc(savings);
    }

    // Record tokens
    if (tokens !== undefined) {
      this.tokens.inc(tokens, { provider });
    }

    // Record for time series
    this.requestTimeSeries.record(1);
  }

  /**
   * Record routing decision
   */
  recordRouting(data: RoutingData): void {
    const { latency, category, provider, complexity } = data;

    if (latency !== undefined) {
      this.routingLatency.observe(latency);
    }

    this.requests.inc(1, {
      type: 'routing',
      category,
      provider,
      complexity: complexity?.toString() ?? 'unknown'
    });
  }

  /**
   * Get summary statistics
   */
  getSummary(): StatsSummary {
    return {
      requests: {
        total: this.requests.total(),
        byProvider: this.aggregateByLabel(this.requests.getAll(), 'provider'),
        byCategory: this.aggregateByLabel(this.requests.getAll(), 'category'),
        byStatus: this.aggregateByLabel(this.requests.getAll(), 'status')
      },
      errors: {
        total: this.errors.total(),
        byType: this.aggregateByLabel(this.errors.getAll(), 'error_type')
      },
      latency: {
        histogram: this.latency.getData(),
        recent: this.recentLatency.getStats()
      },
      cost: {
        total: this.cost.total(),
        byProvider: this.aggregateByLabel(this.cost.getAll(), 'provider'),
        savings: this.savings.get()
      },
      tokens: {
        total: this.tokens.total(),
        byProvider: this.aggregateByLabel(this.tokens.getAll(), 'provider')
      }
    };
  }

  /**
   * Aggregate counter values by label
   */
  private aggregateByLabel(data: LabeledValue[], labelKey: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const item of data) {
      const key = item.labels[labelKey] ?? 'unknown';
      result[key] = (result[key] ?? 0) + item.value;
    }
    return result;
  }

  /**
   * Get time-based trends
   */
  getTrends(period = 3600000): TrendData {
    const endTime = Date.now();
    const startTime = endTime - period;

    return {
      latency: this.latencyTimeSeries.getTimeSeries(startTime, endTime),
      requests: this.requestTimeSeries.getTimeSeries(startTime, endTime),
      aggregated: {
        latency: this.latencyTimeSeries.getMetrics(startTime, endTime),
        requests: this.requestTimeSeries.getMetrics(startTime, endTime)
      }
    };
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    // Requests counter
    lines.push(`# HELP ${this.requests.name} ${this.requests.description}`);
    lines.push(`# TYPE ${this.requests.name} counter`);
    for (const item of this.requests.getAll()) {
      const labels = Object.entries(item.labels).map(([k, v]) => `${k}="${v}"`).join(',');
      lines.push(`${this.requests.name}{${labels}} ${item.value}`);
    }

    // Latency histogram
    const histData = this.latency.getData();
    lines.push(`# HELP ${this.latency.name} Request latency in milliseconds`);
    lines.push(`# TYPE ${this.latency.name} histogram`);
    for (const bucket of histData.buckets) {
      lines.push(`${this.latency.name}_bucket{le="${bucket.le}"} ${bucket.count}`);
    }
    lines.push(`${this.latency.name}_sum ${histData.sum}`);
    lines.push(`${this.latency.name}_count ${histData.count}`);

    // Active connections gauge
    lines.push(`# HELP ${this.activeConnections.name} ${this.activeConnections.description}`);
    lines.push(`# TYPE ${this.activeConnections.name} gauge`);
    for (const item of this.activeConnections.getAll()) {
      const labels = Object.entries(item.labels).map(([k, v]) => `${k}="${v}"`).join(',');
      lines.push(`${this.activeConnections.name}{${labels}} ${item.value}`);
    }

    return lines.join('\n');
  }

  /**
   * Reset all statistics
   */
  reset(): void {
    this.requests.reset();
    this.errors.reset();
    this.latency.reset();
    this.routingLatency.reset();
    this.cost.reset();
    this.savings.reset();
    this.tokens.reset();
    this.activeConnections.reset();
    this.recentLatency.reset();
    this.recentCost.reset();
    this.latencyTimeSeries.reset();
    this.requestTimeSeries.reset();
  }
}

// Singleton instance
let statsCollectorInstance: StatsCollector | null = null;

/**
 * Get or create stats collector singleton
 */
export function getStatsCollector(): StatsCollector {
  if (!statsCollectorInstance) {
    statsCollectorInstance = new StatsCollector();
  }
  return statsCollectorInstance;
}

/**
 * Reset the stats collector singleton
 */
export function resetStatsCollector(): void {
  if (statsCollectorInstance) {
    statsCollectorInstance.reset();
  }
}
