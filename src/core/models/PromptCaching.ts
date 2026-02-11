/**
 * PromptCaching - Feature #15: Prompt Caching
 * Caches compiled prompts to avoid redundant template processing
 */

import crypto from 'node:crypto';

interface CachedPrompt {
  hash: string;
  compiled: string;
  timestamp: number;
  hits: number;
}

class PromptCache {
  private cache: Map<string, CachedPrompt> = new Map();
  private maxSize = 100;
  private ttl = 30 * 60 * 1000; // 30 minutes

  private hash(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
  }

  get(template: string, variables: Record<string, unknown>): string | undefined {
    const key = this.hash(template + JSON.stringify(variables));
    const cached = this.cache.get(key);

    if (!cached) return undefined;

    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    cached.hits++;
    return cached.compiled;
  }

  set(template: string, variables: Record<string, unknown>, compiled: string): void {
    const key = this.hash(template + JSON.stringify(variables));

    if (this.cache.size >= this.maxSize) {
      // Remove oldest
      const oldest = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp,
      )[0];
      if (oldest) this.cache.delete(oldest[0]);
    }

    this.cache.set(key, {
      hash: key,
      compiled,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  compile(template: string, variables: Record<string, unknown>): string {
    const cached = this.get(template, variables);
    if (cached) return cached;

    let compiled = template;
    for (const [key, value] of Object.entries(variables)) {
      compiled = compiled.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    }

    this.set(template, variables, compiled);
    return compiled;
  }

  getStats(): { size: number; totalHits: number } {
    let totalHits = 0;
    for (const c of this.cache.values()) totalHits += c.hits;
    return { size: this.cache.size, totalHits };
  }

  clear(): void {
    this.cache.clear();
  }
}

export const promptCache = new PromptCache();
