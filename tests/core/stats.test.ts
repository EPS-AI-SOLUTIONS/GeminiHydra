/**
 * Tests for Statistics & Metrics
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RollingStats,
  TimeSeriesMetrics,
  Counter,
  Gauge,
  Histogram,
  StatsCollector,
  getStatsCollector,
  resetStatsCollector,
} from '../../src/core/stats.js';

describe('RollingStats', () => {
  let stats: RollingStats;

  beforeEach(() => {
    stats = new RollingStats(5);
  });

  describe('constructor', () => {
    it('should use default window size', () => {
      const defaultStats = new RollingStats();
      // Add more than default (100) samples
      for (let i = 0; i < 150; i++) {
        defaultStats.add(i);
      }
      expect(defaultStats.count()).toBe(100);
    });

    it('should use custom window size', () => {
      for (let i = 0; i < 10; i++) {
        stats.add(i);
      }
      expect(stats.count()).toBe(5);
    });
  });

  describe('add', () => {
    it('should add values', () => {
      stats.add(1);
      stats.add(2);
      expect(stats.count()).toBe(2);
    });

    it('should maintain window size', () => {
      for (let i = 1; i <= 10; i++) {
        stats.add(i);
      }
      expect(stats.count()).toBe(5);
      // Should have values 6-10 (last 5)
      expect(stats.min()).toBe(6);
      expect(stats.max()).toBe(10);
    });
  });

  describe('average', () => {
    it('should return 0 for empty samples', () => {
      expect(stats.average()).toBe(0);
    });

    it('should calculate average correctly', () => {
      stats.add(10);
      stats.add(20);
      stats.add(30);
      expect(stats.average()).toBe(20);
    });
  });

  describe('min', () => {
    it('should return 0 for empty samples', () => {
      expect(stats.min()).toBe(0);
    });

    it('should return minimum value', () => {
      stats.add(5);
      stats.add(2);
      stats.add(8);
      expect(stats.min()).toBe(2);
    });
  });

  describe('max', () => {
    it('should return 0 for empty samples', () => {
      expect(stats.max()).toBe(0);
    });

    it('should return maximum value', () => {
      stats.add(5);
      stats.add(2);
      stats.add(8);
      expect(stats.max()).toBe(8);
    });
  });

  describe('stdDev', () => {
    it('should return 0 for less than 2 samples', () => {
      expect(stats.stdDev()).toBe(0);
      stats.add(5);
      expect(stats.stdDev()).toBe(0);
    });

    it('should calculate standard deviation', () => {
      stats.add(2);
      stats.add(4);
      stats.add(4);
      stats.add(4);
      stats.add(6);
      // Mean = 4, variance = 2, stdDev ≈ 1.414
      expect(stats.stdDev()).toBeCloseTo(1.414, 2);
    });
  });

  describe('percentile', () => {
    it('should return 0 for empty samples', () => {
      expect(stats.percentile(50)).toBe(0);
    });

    it('should calculate percentiles', () => {
      // Add 1-5
      for (let i = 1; i <= 5; i++) {
        stats.add(i);
      }
      expect(stats.percentile(50)).toBe(3);
      expect(stats.percentile(100)).toBe(5);
      expect(stats.percentile(0)).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return all statistics', () => {
      stats.add(1);
      stats.add(2);
      stats.add(3);
      stats.add(4);
      stats.add(5);

      const result = stats.getStats();

      expect(result.count).toBe(5);
      expect(result.average).toBe(3);
      expect(result.min).toBe(1);
      expect(result.max).toBe(5);
      expect(result.stdDev).toBeGreaterThan(0);
      expect(result.p50).toBeDefined();
      expect(result.p90).toBeDefined();
      expect(result.p95).toBeDefined();
      expect(result.p99).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should clear all samples', () => {
      stats.add(1);
      stats.add(2);
      stats.reset();
      expect(stats.count()).toBe(0);
      expect(stats.average()).toBe(0);
    });
  });
});

describe('TimeSeriesMetrics', () => {
  let metrics: TimeSeriesMetrics;

  beforeEach(() => {
    vi.useRealTimers();
    metrics = new TimeSeriesMetrics({ bucketSize: 1000, retention: 60 });
  });

  describe('constructor', () => {
    it('should use default config', () => {
      const defaultMetrics = new TimeSeriesMetrics();
      // Just verify it creates without error
      defaultMetrics.record(1);
      expect(defaultMetrics.getMetrics().count).toBe(1);
    });
  });

  describe('record', () => {
    it('should record values in buckets', () => {
      const now = Date.now();
      metrics.record(10, now);
      metrics.record(20, now);

      const aggregated = metrics.getMetrics(now - 1000, now + 1000);
      expect(aggregated.count).toBe(2);
      expect(aggregated.average).toBe(15);
    });

    it('should group by bucket timestamp', () => {
      const now = Date.now();
      // Use bucket-aligned timestamps
      const bucket1 = Math.floor(now / 1000) * 1000;
      const bucket2 = bucket1 + 1000;

      metrics.record(10, bucket1);
      metrics.record(20, bucket1 + 100); // Same bucket
      metrics.record(30, bucket2);

      const series = metrics.getTimeSeries(bucket1 - 100, bucket2 + 100);
      expect(series.length).toBe(2); // Two buckets
    });
  });

  describe('getMetrics', () => {
    it('should return empty metrics for no data', () => {
      const result = metrics.getMetrics();
      expect(result.count).toBe(0);
      expect(result.average).toBe(0);
      expect(result.min).toBe(0);
      expect(result.max).toBe(0);
    });

    it('should aggregate metrics across buckets', () => {
      const now = Date.now();
      const bucket1 = Math.floor(now / 1000) * 1000;

      metrics.record(10, bucket1);
      metrics.record(20, bucket1 + 1000);
      metrics.record(30, bucket1 + 2000);

      const result = metrics.getMetrics(bucket1 - 100, bucket1 + 3000);
      expect(result.count).toBe(3);
      expect(result.average).toBe(20);
      expect(result.min).toBe(10);
      expect(result.max).toBe(30);
    });

    it('should filter by time range', () => {
      const now = Date.now();
      const bucket1 = Math.floor(now / 1000) * 1000;

      metrics.record(10, bucket1);
      metrics.record(20, bucket1 + 1000);
      metrics.record(30, bucket1 + 2000);

      // Filter to only include bucket with value 20
      const result = metrics.getMetrics(bucket1 + 500, bucket1 + 1500);
      expect(result.count).toBe(1);
      expect(result.average).toBe(20);
    });
  });

  describe('getTimeSeries', () => {
    it('should return sorted time series', () => {
      const now = Date.now();
      const bucket1 = Math.floor(now / 1000) * 1000;

      metrics.record(30, bucket1 + 2000);
      metrics.record(10, bucket1);
      metrics.record(20, bucket1 + 1000);

      const series = metrics.getTimeSeries(bucket1 - 100, bucket1 + 3000);
      expect(series.length).toBe(3);
      expect(series[0].timestamp).toBeLessThan(series[1].timestamp);
      expect(series[1].timestamp).toBeLessThan(series[2].timestamp);
    });
  });

  describe('reset', () => {
    it('should clear all buckets', () => {
      metrics.record(10);
      metrics.record(20);
      metrics.reset();

      expect(metrics.getMetrics().count).toBe(0);
    });
  });

  describe('pruning', () => {
    it('should remove old buckets beyond retention', () => {
      vi.useFakeTimers();
      const shortRetention = new TimeSeriesMetrics({ bucketSize: 1000, retention: 5 });

      // Record at time 0
      vi.setSystemTime(0);
      shortRetention.record(10);

      // Move time forward beyond retention (5 buckets * 1000ms = 5000ms)
      vi.setSystemTime(10000);
      shortRetention.record(20);

      // Old bucket should be pruned
      const series = shortRetention.getTimeSeries(0, 15000);
      expect(series.length).toBe(1);

      vi.useRealTimers();
    });
  });
});

describe('Counter', () => {
  let counter: Counter;

  beforeEach(() => {
    counter = new Counter('test_counter', 'Test counter');
  });

  describe('constructor', () => {
    it('should set name and description', () => {
      expect(counter.name).toBe('test_counter');
      expect(counter.description).toBe('Test counter');
    });

    it('should use empty description by default', () => {
      const c = new Counter('simple');
      expect(c.description).toBe('');
    });
  });

  describe('inc', () => {
    it('should increment by 1 by default', () => {
      counter.inc();
      expect(counter.get()).toBe(1);
    });

    it('should increment by specified value', () => {
      counter.inc(5);
      expect(counter.get()).toBe(5);
    });

    it('should support labels', () => {
      counter.inc(1, { provider: 'gemini' });
      counter.inc(2, { provider: 'ollama' });

      expect(counter.get({ provider: 'gemini' })).toBe(1);
      expect(counter.get({ provider: 'ollama' })).toBe(2);
    });
  });

  describe('get', () => {
    it('should return 0 for non-existent label', () => {
      expect(counter.get({ nonexistent: 'label' })).toBe(0);
    });
  });

  describe('getAll', () => {
    it('should return all labeled values', () => {
      counter.inc(1, { provider: 'a' });
      counter.inc(2, { provider: 'b' });

      const all = counter.getAll();
      expect(all.length).toBe(2);
      expect(all.some(v => v.labels.provider === 'a' && v.value === 1)).toBe(true);
      expect(all.some(v => v.labels.provider === 'b' && v.value === 2)).toBe(true);
    });
  });

  describe('total', () => {
    it('should sum all values', () => {
      counter.inc(1, { provider: 'a' });
      counter.inc(2, { provider: 'b' });
      counter.inc(3, { provider: 'c' });

      expect(counter.total()).toBe(6);
    });
  });

  describe('reset', () => {
    it('should clear all values', () => {
      counter.inc(5);
      counter.reset();
      expect(counter.total()).toBe(0);
    });
  });
});

describe('Gauge', () => {
  let gauge: Gauge;

  beforeEach(() => {
    gauge = new Gauge('test_gauge', 'Test gauge');
  });

  describe('constructor', () => {
    it('should set name and description', () => {
      expect(gauge.name).toBe('test_gauge');
      expect(gauge.description).toBe('Test gauge');
    });
  });

  describe('set', () => {
    it('should set value', () => {
      gauge.set(10);
      expect(gauge.get()).toBe(10);
    });

    it('should support labels', () => {
      gauge.set(5, { instance: 'a' });
      gauge.set(10, { instance: 'b' });

      expect(gauge.get({ instance: 'a' })).toBe(5);
      expect(gauge.get({ instance: 'b' })).toBe(10);
    });
  });

  describe('inc', () => {
    it('should increment by 1 by default', () => {
      gauge.inc();
      expect(gauge.get()).toBe(1);
    });

    it('should increment by specified value', () => {
      gauge.set(5);
      gauge.inc(3);
      expect(gauge.get()).toBe(8);
    });
  });

  describe('dec', () => {
    it('should decrement by 1 by default', () => {
      gauge.set(5);
      gauge.dec();
      expect(gauge.get()).toBe(4);
    });

    it('should decrement by specified value', () => {
      gauge.set(10);
      gauge.dec(3);
      expect(gauge.get()).toBe(7);
    });
  });

  describe('getAll', () => {
    it('should return all labeled values', () => {
      gauge.set(1, { a: '1' });
      gauge.set(2, { b: '2' });

      const all = gauge.getAll();
      expect(all.length).toBe(2);
    });
  });

  describe('reset', () => {
    it('should clear all values', () => {
      gauge.set(5);
      gauge.reset();
      expect(gauge.get()).toBe(0);
    });
  });
});

describe('Histogram', () => {
  let histogram: Histogram;

  beforeEach(() => {
    histogram = new Histogram('test_histogram', [10, 50, 100, 500]);
  });

  describe('constructor', () => {
    it('should set name', () => {
      expect(histogram.name).toBe('test_histogram');
    });

    it('should use default buckets', () => {
      const h = new Histogram('default');
      h.observe(5);
      const data = h.getData();
      expect(data.buckets.length).toBeGreaterThan(0);
    });
  });

  describe('observe', () => {
    it('should count observations in correct buckets', () => {
      histogram.observe(5);   // <= 10
      histogram.observe(30);  // <= 50
      histogram.observe(75);  // <= 100
      histogram.observe(200); // <= 500
      histogram.observe(1000); // > 500 (+Inf)

      const data = histogram.getData();
      expect(data.count).toBe(5);
    });

    it('should track sum and average', () => {
      histogram.observe(10);
      histogram.observe(20);
      histogram.observe(30);

      const data = histogram.getData();
      expect(data.sum).toBe(60);
      expect(data.average).toBe(20);
    });
  });

  describe('getData', () => {
    it('should return cumulative bucket counts', () => {
      histogram.observe(5);
      histogram.observe(5);
      histogram.observe(30);

      const data = histogram.getData();

      // Find bucket <= 10
      const bucket10 = data.buckets.find(b => b.le === 10);
      expect(bucket10?.count).toBe(2);

      // Find bucket <= 50 (cumulative, includes bucket 10)
      const bucket50 = data.buckets.find(b => b.le === 50);
      expect(bucket50?.count).toBe(3);
    });

    it('should include +Inf bucket', () => {
      histogram.observe(1000);

      const data = histogram.getData();
      const infBucket = data.buckets.find(b => b.le === '+Inf');

      expect(infBucket).toBeDefined();
      expect(infBucket?.count).toBe(1);
    });

    it('should return 0 average for no observations', () => {
      const data = histogram.getData();
      expect(data.average).toBe(0);
    });
  });

  describe('reset', () => {
    it('should clear all data', () => {
      histogram.observe(10);
      histogram.observe(20);
      histogram.reset();

      const data = histogram.getData();
      expect(data.count).toBe(0);
      expect(data.sum).toBe(0);
    });
  });
});

describe('StatsCollector', () => {
  let collector: StatsCollector;

  beforeEach(() => {
    collector = new StatsCollector();
  });

  describe('recordRequest', () => {
    it('should record successful request', () => {
      collector.recordRequest({
        provider: 'gemini',
        category: 'chat',
        latency: 100,
        cost: 0.001,
        tokens: 500,
        success: true,
      });

      const summary = collector.getSummary();
      expect(summary.requests.total).toBe(1);
      expect(summary.requests.byProvider.gemini).toBe(1);
      expect(summary.requests.byCategory.chat).toBe(1);
      expect(summary.latency.histogram.count).toBe(1);
      expect(summary.cost.total).toBe(0.001);
      expect(summary.tokens.total).toBe(500);
    });

    it('should record failed request', () => {
      collector.recordRequest({
        provider: 'ollama',
        success: false,
        error: { type: 'timeout' },
      });

      const summary = collector.getSummary();
      expect(summary.errors.total).toBe(1);
      expect(summary.errors.byType.timeout).toBe(1);
    });

    it('should record savings', () => {
      collector.recordRequest({
        provider: 'local',
        success: true,
        savings: 0.05,
      });

      const summary = collector.getSummary();
      expect(summary.cost.savings).toBe(0.05);
    });

    it('should handle missing optional fields', () => {
      collector.recordRequest({
        provider: 'test',
        success: true,
      });

      const summary = collector.getSummary();
      expect(summary.requests.total).toBe(1);
    });
  });

  describe('recordRouting', () => {
    it('should record routing decision', () => {
      collector.recordRouting({
        latency: 5,
        category: 'code',
        provider: 'gemini',
        complexity: 3,
      });

      expect(collector.routingLatency.getData().count).toBe(1);
    });

    it('should handle missing latency', () => {
      collector.recordRouting({
        category: 'chat',
        provider: 'local',
      });

      expect(collector.routingLatency.getData().count).toBe(0);
    });
  });

  describe('getSummary', () => {
    it('should return comprehensive summary', () => {
      collector.recordRequest({
        provider: 'a',
        category: 'x',
        latency: 100,
        cost: 0.01,
        tokens: 100,
        success: true,
      });

      collector.recordRequest({
        provider: 'b',
        category: 'y',
        latency: 200,
        cost: 0.02,
        tokens: 200,
        success: false,
        error: { type: 'network' },
      });

      const summary = collector.getSummary();

      expect(summary.requests.total).toBe(2);
      expect(summary.requests.byProvider.a).toBe(1);
      expect(summary.requests.byProvider.b).toBe(1);
      expect(summary.errors.total).toBe(1);
      expect(summary.latency.histogram.count).toBe(2);
      expect(summary.cost.total).toBe(0.03);
      expect(summary.tokens.total).toBe(300);
    });
  });

  describe('getTrends', () => {
    it('should return trend data', () => {
      vi.useFakeTimers();

      collector.recordRequest({
        provider: 'test',
        latency: 100,
        success: true,
      });

      const trends = collector.getTrends(60000);

      expect(trends.latency).toBeDefined();
      expect(trends.requests).toBeDefined();
      expect(trends.aggregated.latency).toBeDefined();
      expect(trends.aggregated.requests).toBeDefined();

      vi.useRealTimers();
    });
  });

  describe('exportPrometheus', () => {
    it('should export in Prometheus format', () => {
      collector.recordRequest({
        provider: 'gemini',
        category: 'chat',
        latency: 100,
        success: true,
      });

      collector.activeConnections.set(5, { provider: 'gemini' });

      const output = collector.exportPrometheus();

      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
      expect(output).toContain('hydra_requests_total');
      expect(output).toContain('hydra_request_latency_ms');
      expect(output).toContain('hydra_active_connections');
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      collector.recordRequest({
        provider: 'test',
        latency: 100,
        cost: 0.01,
        success: true,
      });

      collector.reset();

      const summary = collector.getSummary();
      expect(summary.requests.total).toBe(0);
      expect(summary.latency.histogram.count).toBe(0);
      expect(summary.cost.total).toBe(0);
    });
  });
});

describe('getStatsCollector', () => {
  beforeEach(() => {
    resetStatsCollector();
  });

  it('should return singleton instance', () => {
    const a = getStatsCollector();
    const b = getStatsCollector();
    expect(a).toBe(b);
  });

  it('should create instance on first call', () => {
    const collector = getStatsCollector();
    expect(collector).toBeInstanceOf(StatsCollector);
  });
});

describe('resetStatsCollector', () => {
  it('should reset singleton instance', () => {
    const collector = getStatsCollector();
    collector.recordRequest({ provider: 'test', success: true });

    resetStatsCollector();

    expect(collector.getSummary().requests.total).toBe(0);
  });

  it('should not throw if no instance exists', () => {
    expect(() => resetStatsCollector()).not.toThrow();
  });
});
