/**
 * GeminiHydra - CircuitBreaker Unit Tests
 * Testy wzorca Circuit Breaker: stany, przelaczanie, rejestr
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerRegistry,
  type CircuitState,
  type CircuitBreakerOptions,
} from '../../src/core/CircuitBreaker.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    red: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    gray: (s: string) => s,
    cyan: (s: string) => s,
  },
}));

// ============================================================
// CircuitBreaker
// ============================================================

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;
  let stateChanges: Array<{ from: CircuitState; to: CircuitState }>;

  beforeEach(() => {
    stateChanges = [];
    breaker = new CircuitBreaker('test-breaker', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      onStateChange: (from, to) => {
        stateChanges.push({ from, to });
      },
    });
  });

  describe('stan poczatkowy', () => {
    it('powinien rozpoczac w stanie CLOSED', () => {
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('powinien zwrocic poprawne statystyki poczatkowe', () => {
      const stats = breaker.getStats();
      expect(stats.state).toBe('CLOSED');
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
    });
  });

  describe('execute - udane wywolania', () => {
    it('powinien wykonac funkcje i zwrocic wynik', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('powinien pozostac w stanie CLOSED po udanym wywolaniu', async () => {
      await breaker.execute(async () => 'ok');
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('powinien zresetowac licznik bledow po udanym wywolaniu', async () => {
      // 2 bledy
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }
      expect(breaker.getStats().failures).toBe(2);

      // Udane wywolanie
      await breaker.execute(async () => 'ok');
      expect(breaker.getStats().failures).toBe(0);
    });
  });

  describe('execute - przejscie do stanu OPEN', () => {
    it('powinien otworzyc obwod po przekroczeniu progu bledow', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error(`fail ${i}`); });
        } catch {}
      }

      expect(breaker.getState()).toBe('OPEN');
      expect(stateChanges).toContainEqual({ from: 'CLOSED', to: 'OPEN' });
    });

    it('powinien odrzucac wywolania w stanie OPEN', async () => {
      // Otworz obwod
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }

      // Nastepne wywolanie powinno byc odrzucone
      await expect(
        breaker.execute(async () => 'should not run')
      ).rejects.toThrow('Circuit breaker test-breaker is OPEN');
    });

    it('powinien rzucic oryginalny blad (nie circuit breaker error) podczas zbierania bledow', async () => {
      try {
        await breaker.execute(async () => { throw new Error('original error'); });
      } catch (e: any) {
        expect(e.message).toBe('original error');
      }
    });
  });

  describe('execute - przejscie do HALF_OPEN po timeout', () => {
    it('powinien przejsc do HALF_OPEN po uplywie timeout', async () => {
      // Otworz obwod
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }
      expect(breaker.getState()).toBe('OPEN');

      // Symuluj uplyw czasu
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1500);

      // Nastepne wywolanie powinno przejsc do HALF_OPEN
      await breaker.execute(async () => 'recovery');
      expect(breaker.getState()).not.toBe('OPEN');

      vi.restoreAllMocks();
    });
  });

  describe('execute - przejscie HALF_OPEN -> CLOSED', () => {
    it('powinien zamknac obwod po wystarczajacej liczbie udanych wywolan w HALF_OPEN', async () => {
      // Otworz obwod
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }

      // Symuluj uplyw czasu
      const originalNow = Date.now;
      vi.spyOn(Date, 'now').mockReturnValue(originalNow() + 2000);

      // Wywolania w HALF_OPEN - potrzebne 2 sukcesy
      await breaker.execute(async () => 'ok1');
      await breaker.execute(async () => 'ok2');

      expect(breaker.getState()).toBe('CLOSED');
      expect(stateChanges).toContainEqual({ from: 'HALF_OPEN', to: 'CLOSED' });

      vi.restoreAllMocks();
    });
  });

  describe('execute - HALF_OPEN -> OPEN ponownie', () => {
    it('powinien ponownie otworzyc obwod po bledzie w HALF_OPEN', async () => {
      // Otworz obwod
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }

      // Symuluj uplyw czasu
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);

      // Blad w HALF_OPEN
      try {
        await breaker.execute(async () => { throw new Error('still failing'); });
      } catch {}

      expect(breaker.getState()).toBe('OPEN');

      vi.restoreAllMocks();
    });
  });

  describe('reset - resetowanie obwodu', () => {
    it('powinien zresetowac do stanu CLOSED', async () => {
      // Otworz obwod
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }
      expect(breaker.getState()).toBe('OPEN');

      breaker.reset();
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('powinien wyzerowac liczniki po resecie', () => {
      breaker.reset();
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
    });
  });

  describe('getStats - statystyki', () => {
    it('powinien sledzic liczbe bledow', async () => {
      try {
        await breaker.execute(async () => { throw new Error('fail'); });
      } catch {}

      const stats = breaker.getStats();
      expect(stats.failures).toBe(1);
    });

    it('powinien poprawnie raportowac stan', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }

      const stats = breaker.getStats();
      expect(stats.state).toBe('OPEN');
      expect(stats.failures).toBe(3);
    });
  });

  describe('onStateChange callback', () => {
    it('powinien wywolac callback przy zmianie stanu', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }

      expect(stateChanges.length).toBeGreaterThan(0);
      expect(stateChanges[0].from).toBe('CLOSED');
      expect(stateChanges[0].to).toBe('OPEN');
    });
  });

  describe('edge cases', () => {
    it('powinien dzialac z domyslnymi opcjami', () => {
      const defaultBreaker = new CircuitBreaker('default');
      expect(defaultBreaker.getState()).toBe('CLOSED');
    });

    it('powinien obslugiwac async exceptions', async () => {
      await expect(
        breaker.execute(async () => {
          throw new TypeError('type error');
        })
      ).rejects.toThrow('type error');
    });
  });
});

// ============================================================
// CircuitBreakerRegistry
// ============================================================

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  describe('getOrCreate - tworzenie i pobieranie', () => {
    it('powinien stworzyc nowy breaker', () => {
      const breaker = registry.getOrCreate('test');
      expect(breaker).toBeInstanceOf(CircuitBreaker);
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('powinien zwrocic istniejacy breaker', () => {
      const breaker1 = registry.getOrCreate('test');
      const breaker2 = registry.getOrCreate('test');
      expect(breaker1).toBe(breaker2);
    });

    it('powinien tworzyc rozne breakery dla roznych nazw', () => {
      const breaker1 = registry.getOrCreate('service-a');
      const breaker2 = registry.getOrCreate('service-b');
      expect(breaker1).not.toBe(breaker2);
    });

    it('powinien przekazac opcje przy tworzeniu', () => {
      const breaker = registry.getOrCreate('custom', {
        failureThreshold: 10,
        onStateChange: () => {},
      });
      expect(breaker).toBeDefined();
    });
  });

  describe('get - pobieranie', () => {
    it('powinien zwrocic undefined dla nieistniejacego breakera', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('powinien zwrocic istniejacy breaker', () => {
      registry.getOrCreate('test');
      expect(registry.get('test')).toBeDefined();
    });
  });

  describe('resetAll - resetowanie wszystkich', () => {
    it('powinien zresetowac wszystkie breakery', async () => {
      const breaker = registry.getOrCreate('test', {
        failureThreshold: 1,
        onStateChange: () => {},
      });

      try {
        await breaker.execute(async () => { throw new Error('fail'); });
      } catch {}

      expect(breaker.getState()).toBe('OPEN');

      registry.resetAll();
      expect(breaker.getState()).toBe('CLOSED');
    });
  });

  describe('getAllStats - statystyki wszystkich breakerow', () => {
    it('powinien zwrocic puste statystyki gdy brak breakerow', () => {
      const stats = registry.getAllStats();
      expect(Object.keys(stats)).toHaveLength(0);
    });

    it('powinien zwrocic statystyki wszystkich breakerow', () => {
      registry.getOrCreate('service-a');
      registry.getOrCreate('service-b');

      const stats = registry.getAllStats();
      expect(stats['service-a']).toBeDefined();
      expect(stats['service-b']).toBeDefined();
      expect(stats['service-a'].state).toBe('CLOSED');
    });
  });
});
