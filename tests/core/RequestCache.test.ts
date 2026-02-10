/**
 * GeminiHydra - RequestCache Unit Tests
 * Testy cache zapytan: RequestCache, RequestDeduplicator
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  RequestCache,
  RequestDeduplicator,
  type CacheEntry,
  type CacheOptions,
} from '../../src/core/RequestCache.js';

// Mock moduly zewnetrzne
vi.mock('chalk', () => ({
  default: {
    red: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    gray: (s: string) => s,
  },
}));

// ============================================================
// RequestCache
// ============================================================

describe('RequestCache', () => {
  let cache: RequestCache<string>;

  beforeEach(() => {
    cache = new RequestCache<string>({
      ttl: 5000,
      maxSize: 5,
    });
  });

  describe('set i get - podstawowe operacje', () => {
    it('powinien zapisac i odczytac wartosc', () => {
      cache.set({ query: 'test' }, 'result');
      const result = cache.get({ query: 'test' });
      expect(result).toBe('result');
    });

    it('powinien zwrocic undefined dla nieistniejacego klucza', () => {
      const result = cache.get({ query: 'nonexistent' });
      expect(result).toBeUndefined();
    });

    it('powinien nadpisac istniejaca wartosc', () => {
      cache.set({ key: 'test' }, 'old');
      cache.set({ key: 'test' }, 'new');
      expect(cache.get({ key: 'test' })).toBe('new');
    });

    it('powinien generowac ten sam klucz dla identycznych parametrow', () => {
      cache.set({ a: 1, b: 2 }, 'result');
      expect(cache.get({ a: 1, b: 2 })).toBe('result');
    });

    it('powinien generowac rozne klucze dla roznych parametrow', () => {
      cache.set({ a: 1 }, 'result-a');
      cache.set({ b: 2 }, 'result-b');
      expect(cache.get({ a: 1 })).toBe('result-a');
      expect(cache.get({ b: 2 })).toBe('result-b');
    });
  });

  describe('TTL - wygasanie wpisow', () => {
    it('powinien wygasic wpis po uplywie TTL', () => {
      cache.set({ key: 'expire' }, 'value');

      // Symuluj uplyw czasu
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6000);

      expect(cache.get({ key: 'expire' })).toBeUndefined();

      vi.restoreAllMocks();
    });

    it('powinien zachowac wpis przed uplywem TTL', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      cache.set({ key: 'fresh' }, 'value');

      vi.spyOn(Date, 'now').mockReturnValue(now + 3000);
      expect(cache.get({ key: 'fresh' })).toBe('value');

      vi.restoreAllMocks();
    });
  });

  describe('maxSize - limit rozmiaru', () => {
    it('powinien usunac najstarszy wpis po przekroczeniu limitu', () => {
      for (let i = 0; i < 6; i++) {
        cache.set({ index: i }, `value-${i}`);
      }

      // Pierwszy wpis powinien byc usuniety (FIFO eviction)
      expect(cache.get({ index: 0 })).toBeUndefined();
      // Ostatni powinien istniec
      expect(cache.get({ index: 5 })).toBe('value-5');
    });
  });

  describe('getOrCompute - lazy computation', () => {
    it('powinien zwrocic wartosc z cache jesli istnieje', async () => {
      cache.set({ key: 'cached' }, 'cached-value');
      const compute = vi.fn().mockResolvedValue('computed-value');

      const result = await cache.getOrCompute({ key: 'cached' }, compute);

      expect(result).toBe('cached-value');
      expect(compute).not.toHaveBeenCalled();
    });

    it('powinien obliczyc i zapisac wartosc jesli nie ma w cache', async () => {
      const compute = vi.fn().mockResolvedValue('computed-value');

      const result = await cache.getOrCompute({ key: 'new' }, compute);

      expect(result).toBe('computed-value');
      expect(compute).toHaveBeenCalledOnce();
      // Sprawdz czy zostalo zapisane
      expect(cache.get({ key: 'new' })).toBe('computed-value');
    });

    it('powinien propagowac bledy z compute', async () => {
      const compute = vi.fn().mockRejectedValue(new Error('compute failed'));

      await expect(
        cache.getOrCompute({ key: 'error' }, compute)
      ).rejects.toThrow('compute failed');
    });
  });

  describe('clear - czyszczenie', () => {
    it('powinien wyczyscic wszystkie wpisy', () => {
      cache.set({ a: 1 }, 'v1');
      cache.set({ b: 2 }, 'v2');

      cache.clear();

      expect(cache.get({ a: 1 })).toBeUndefined();
      expect(cache.get({ b: 2 })).toBeUndefined();
    });

    it('powinien zresetowac statystyki po wyczyszczeniu', () => {
      cache.set({ a: 1 }, 'v1');
      cache.get({ a: 1 }); // hit
      cache.get({ b: 2 }); // miss

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
    });
  });

  describe('prune - czyszczenie wygaslych', () => {
    it('powinien usunac wygasle wpisy', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      cache.set({ key: 'old' }, 'old-value');

      vi.spyOn(Date, 'now').mockReturnValue(now + 6000);

      const pruned = cache.prune();
      expect(pruned).toBe(1);

      vi.restoreAllMocks();
    });

    it('powinien zwrocic 0 gdy nic nie wygaslo', () => {
      cache.set({ key: 'fresh' }, 'value');

      const pruned = cache.prune();
      expect(pruned).toBe(0);
    });

    it('powinien zwrocic 0 gdy cache jest pusty', () => {
      const pruned = cache.prune();
      expect(pruned).toBe(0);
    });
  });

  describe('getStats - statystyki', () => {
    it('powinien sledzic trafienia i pudelka', () => {
      cache.set({ key: 'test' }, 'value');

      cache.get({ key: 'test' });   // hit
      cache.get({ key: 'test' });   // hit
      cache.get({ key: 'miss' });   // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667, 2);
    });

    it('powinien zwrocic hitRate 0 dla pustego cache', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it('powinien zwrocic poprawny rozmiar', () => {
      cache.set({ a: 1 }, 'v1');
      cache.set({ b: 2 }, 'v2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
    });
  });

  describe('callbacks onHit i onMiss', () => {
    it('powinien wywolac onHit callback', () => {
      const onHit = vi.fn();
      const callbackCache = new RequestCache<string>({ onHit });

      callbackCache.set({ key: 'test' }, 'value');
      callbackCache.get({ key: 'test' });

      expect(onHit).toHaveBeenCalledOnce();
    });

    it('powinien wywolac onMiss callback', () => {
      const onMiss = vi.fn();
      const callbackCache = new RequestCache<string>({ onMiss });

      callbackCache.get({ key: 'nonexistent' });

      expect(onMiss).toHaveBeenCalledOnce();
    });
  });

  describe('edge cases', () => {
    it('powinien obslugiwac null jako parametr', () => {
      cache.set(null, 'null-value');
      expect(cache.get(null)).toBe('null-value');
    });

    it('powinien obslugiwac pusty obiekt jako parametr', () => {
      cache.set({}, 'empty-value');
      expect(cache.get({})).toBe('empty-value');
    });

    it('powinien obslugiwac zagniezdzony obiekt', () => {
      const params = { a: { b: { c: 1 } } };
      cache.set(params, 'deep-value');
      expect(cache.get(params)).toBe('deep-value');
    });

    it('powinien dzialac z domyslnymi opcjami', () => {
      const defaultCache = new RequestCache<string>();
      defaultCache.set({ key: 'test' }, 'value');
      expect(defaultCache.get({ key: 'test' })).toBe('value');
    });
  });
});

// ============================================================
// RequestDeduplicator
// ============================================================

describe('RequestDeduplicator', () => {
  let dedup: RequestDeduplicator<string>;

  beforeEach(() => {
    dedup = new RequestDeduplicator<string>();
  });

  describe('execute - deduplikacja', () => {
    it('powinien wykonac funkcje i zwrocic wynik', async () => {
      const result = await dedup.execute(
        { query: 'test' },
        async () => 'result'
      );
      expect(result).toBe('result');
    });

    it('powinien zwrocic ten sam promise dla identycznych parametrow', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'result';
      };

      const promise1 = dedup.execute({ query: 'same' }, fn);
      const promise2 = dedup.execute({ query: 'same' }, fn);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe('result');
      expect(result2).toBe('result');
      expect(callCount).toBe(1); // Wywolanie bylo tylko raz
    });

    it('powinien wykonac oddzielnie dla roznych parametrow', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        return `result-${callCount}`;
      };

      const result1 = await dedup.execute({ query: 'a' }, fn);
      const result2 = await dedup.execute({ query: 'b' }, fn);

      expect(callCount).toBe(2);
    });

    it('powinien usunac in-flight po zakonczeniu', async () => {
      await dedup.execute({ query: 'done' }, async () => 'result');
      expect(dedup.getInFlightCount()).toBe(0);
    });

    it('powinien usunac in-flight po bledzie', async () => {
      try {
        await dedup.execute(
          { query: 'error' },
          async () => { throw new Error('fail'); }
        );
      } catch {}

      expect(dedup.getInFlightCount()).toBe(0);
    });
  });

  describe('getInFlightCount - aktywne zapytania', () => {
    it('powinien zwrocic 0 na poczatku', () => {
      expect(dedup.getInFlightCount()).toBe(0);
    });

    it('powinien sledzic aktywne zapytania', async () => {
      const slowFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'slow';
      };

      const promise = dedup.execute({ query: 'slow' }, slowFn);
      expect(dedup.getInFlightCount()).toBe(1);

      await promise;
      expect(dedup.getInFlightCount()).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('powinien propagowac bledy', async () => {
      await expect(
        dedup.execute({ key: 'err' }, async () => { throw new Error('boom'); })
      ).rejects.toThrow('boom');
    });
  });
});
