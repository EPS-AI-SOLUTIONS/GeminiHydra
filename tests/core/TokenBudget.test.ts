/**
 * GeminiHydra - TokenBudget Unit Tests
 * Testy zarządzania budżetem tokenów: tracking, limity, ostrzeżenia
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TokenBudgetManager,
  type BudgetConfig,
  type TokenUsage,
} from '../../src/core/TokenBudget.js';

// Mock moduly zewnetrzne
vi.mock('chalk', () => ({
  default: {
    red: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    gray: (s: string) => s,
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('not found')),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/config/paths.config.js', () => ({
  GEMINIHYDRA_DIR: '/tmp/geminihydra-test',
}));

// ============================================================
// TokenBudgetManager
// ============================================================

describe('TokenBudgetManager', () => {
  let manager: TokenBudgetManager;
  let limitReachedCalls: Array<{ type: string; used: number; limit: number }>;
  let warningCalls: Array<{ type: string; used: number; limit: number }>;

  beforeEach(() => {
    limitReachedCalls = [];
    warningCalls = [];

    manager = new TokenBudgetManager({
      dailyLimit: 10000,
      sessionLimit: 5000,
      taskLimit: 2000,
      warningThreshold: 0.8,
      onLimitReached: (type, used, limit) => {
        limitReachedCalls.push({ type, used, limit });
      },
      onWarning: (type, used, limit) => {
        warningCalls.push({ type, used, limit });
      },
    });
  });

  describe('tworzenie instancji', () => {
    it('powinien stworzyc manager z domyslnymi opcjami', () => {
      const defaultManager = new TokenBudgetManager();
      expect(defaultManager).toBeDefined();
      expect(defaultManager).toBeInstanceOf(TokenBudgetManager);
    });

    it('powinien stworzyc manager z niestandardowymi opcjami', () => {
      expect(manager).toBeDefined();
    });
  });

  describe('track - sledzenie uzycia tokenow', () => {
    it('powinien sledzic uzycie tokenow per task', () => {
      manager.track('task-1', { input: 100, output: 50, total: 150 });

      const stats = manager.getStats();
      expect(stats.daily.used).toBe(150);
      expect(stats.session.used).toBe(150);
    });

    it('powinien kumulowac uzycie dla tego samego taska', () => {
      manager.track('task-1', { input: 100, output: 50, total: 150 });
      manager.track('task-1', { input: 200, output: 100, total: 300 });

      const stats = manager.getStats();
      expect(stats.daily.used).toBe(450);
      expect(stats.session.used).toBe(450);
    });

    it('powinien sledzic uzycie wielu taskow niezaleznie', () => {
      manager.track('task-1', { input: 100, output: 50, total: 150 });
      manager.track('task-2', { input: 200, output: 100, total: 300 });

      const stats = manager.getStats();
      expect(stats.daily.used).toBe(450);
    });

    it('powinien wywolac onWarning po przekroczeniu progu ostrzezenia', () => {
      // Task limit = 2000, warning at 80% = 1600
      manager.track('task-1', { input: 900, output: 800, total: 1700 });

      const taskWarnings = warningCalls.filter(c => c.type === 'task');
      expect(taskWarnings.length).toBeGreaterThan(0);
    });

    it('powinien wywolac onLimitReached po przekroczeniu limitu', () => {
      // Task limit = 2000
      manager.track('task-1', { input: 1500, output: 600, total: 2100 });

      const taskLimits = limitReachedCalls.filter(c => c.type === 'task');
      expect(taskLimits.length).toBeGreaterThan(0);
    });

    it('powinien wywolac onLimitReached dla session', () => {
      // Session limit = 5000
      manager.track('task-1', { input: 3000, output: 2500, total: 5500 });

      const sessionLimits = limitReachedCalls.filter(c => c.type === 'session');
      expect(sessionLimits.length).toBeGreaterThan(0);
    });

    it('powinien wywolac onLimitReached dla daily', () => {
      // Daily limit = 10000
      manager.track('task-1', { input: 6000, output: 5000, total: 11000 });

      const dailyLimits = limitReachedCalls.filter(c => c.type === 'daily');
      expect(dailyLimits.length).toBeGreaterThan(0);
    });
  });

  describe('canProceed - sprawdzanie dostepnosci budzetu', () => {
    it('powinien pozwolic gdy jest budzet', () => {
      const result = manager.canProceed(100);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('powinien zablokowac gdy dzienny limit przekroczony', () => {
      manager.track('task-big', { input: 5000, output: 5000, total: 10000 });

      const result = manager.canProceed(100);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily limit');
    });

    it('powinien zablokowac gdy limit sesji przekroczony', () => {
      manager.track('task-med', { input: 2500, output: 2500, total: 5000 });

      const result = manager.canProceed(100);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Session limit');
    });

    it('powinien pozwolic bez szacowanych tokenow (domyslnie 0)', () => {
      const result = manager.canProceed();
      expect(result.allowed).toBe(true);
    });

    it('powinien uwzgledniac szacowane tokeny', () => {
      manager.track('task', { input: 2000, output: 2500, total: 4500 });

      // Zostalo 500 w sesji, ale szacujemy 600
      const result = manager.canProceed(600);
      expect(result.allowed).toBe(false);
    });
  });

  describe('getRemaining - pozostaly budzet', () => {
    it('powinien zwrocic pelny budzet na poczatku', () => {
      const remaining = manager.getRemaining();
      expect(remaining.daily).toBe(10000);
      expect(remaining.session).toBe(5000);
    });

    it('powinien zmniejszac remaining po uzyciu', () => {
      manager.track('task-1', { input: 500, output: 500, total: 1000 });

      const remaining = manager.getRemaining();
      expect(remaining.daily).toBe(9000);
      expect(remaining.session).toBe(4000);
    });

    it('powinien zwrocic 0 gdy limit wyczerpany (nie ujemna)', () => {
      manager.track('task-big', { input: 6000, output: 5000, total: 11000 });

      const remaining = manager.getRemaining();
      expect(remaining.daily).toBe(0);
      expect(remaining.session).toBe(0);
    });
  });

  describe('getStats - statystyki', () => {
    it('powinien zwrocic poprawne statystyki poczatkowe', () => {
      const stats = manager.getStats();
      expect(stats.daily.used).toBe(0);
      expect(stats.daily.limit).toBe(10000);
      expect(stats.daily.percentage).toBe(0);
      expect(stats.session.used).toBe(0);
      expect(stats.session.limit).toBe(5000);
      expect(stats.session.percentage).toBe(0);
    });

    it('powinien obliczac procent uzycia', () => {
      manager.track('task', { input: 500, output: 500, total: 1000 });

      const stats = manager.getStats();
      expect(stats.daily.percentage).toBe(10); // 1000/10000 * 100
      expect(stats.session.percentage).toBe(20); // 1000/5000 * 100
    });
  });

  describe('resetSession - resetowanie sesji', () => {
    it('powinien zresetowac uzycie sesji', () => {
      manager.track('task', { input: 1000, output: 1000, total: 2000 });

      manager.resetSession();

      const stats = manager.getStats();
      expect(stats.session.used).toBe(0);
      // Daily powinno zostac
      expect(stats.daily.used).toBe(2000);
    });

    it('powinien wyczyscic taski po resecie sesji', () => {
      manager.track('task-1', { input: 500, output: 500, total: 1000 });
      manager.resetSession();

      // Nowy track powinien dzialac od zera
      manager.track('task-1', { input: 100, output: 100, total: 200 });

      const stats = manager.getStats();
      expect(stats.session.used).toBe(200);
    });
  });

  describe('setLimits - zmiana limitow', () => {
    it('powinien zmieniac dzienny limit', () => {
      manager.setLimits({ dailyLimit: 20000 });

      const stats = manager.getStats();
      expect(stats.daily.limit).toBe(20000);
    });

    it('powinien zmieniac limit sesji', () => {
      manager.setLimits({ sessionLimit: 10000 });

      const stats = manager.getStats();
      expect(stats.session.limit).toBe(10000);
    });

    it('powinien zmieniac limit taska', () => {
      manager.setLimits({ taskLimit: 5000 });
      // Teraz tracking z wiekszym limitem
      manager.track('task-big', { input: 3000, output: 1500, total: 4500 });

      // Nie powinno byc limit reached dla taska (4500 < 5000)
      const taskLimits = limitReachedCalls.filter(c => c.type === 'task');
      expect(taskLimits.length).toBe(0);
    });
  });

  describe('estimateTokens - szacowanie tokenow', () => {
    it('powinien szacowac tokeny na podstawie dlugosci tekstu', () => {
      const estimate = TokenBudgetManager.estimateTokens('Hello world');
      expect(estimate).toBeGreaterThan(0);
      // ~4 znaki per token, 11 znakow -> ~3 tokeny
      expect(estimate).toBeCloseTo(3, 0);
    });

    it('powinien zwrocic 0 dla pustego tekstu', () => {
      const estimate = TokenBudgetManager.estimateTokens('');
      expect(estimate).toBe(0);
    });

    it('powinien szacowac proporcjonalnie do dlugosci', () => {
      const short = TokenBudgetManager.estimateTokens('abc');
      const long = TokenBudgetManager.estimateTokens('a'.repeat(100));
      expect(long).toBeGreaterThan(short);
    });
  });

  describe('suggestModel - sugestia modelu', () => {
    it('powinien sugerowac "pro" gdy duzo budzetu', () => {
      const suggestion = manager.suggestModel(100);
      expect(suggestion).toBe('pro');
    });

    it('powinien sugerowac "local" gdy bardzo maly budzet dzienny', () => {
      manager.track('big', { input: 5000, output: 4950, total: 9950 });

      const suggestion = manager.suggestModel(100);
      expect(suggestion).toBe('local');
    });

    it('powinien sugerowac "flash" gdy maly budzet sesji', () => {
      // Session limit = 5000, po uzyciu 4900 zostaje 100
      // suggestModel: remaining.session (100) < estimatedTokens (50) * 3 (150) -> flash
      manager.track('med', { input: 2500, output: 2400, total: 4900 });

      const suggestion = manager.suggestModel(50);
      expect(suggestion).toBe('flash');
    });
  });

  describe('load / save - operacje na pliku', () => {
    it('powinien obslugiwac brak pliku stanu (fallback do domyslnych)', async () => {
      // readFile jest zamockowany na reject - load powinien nie rzucic bledu
      await expect(manager.load()).resolves.not.toThrow();
    });

    it('powinien zapisac stan do pliku', async () => {
      await expect(manager.save()).resolves.not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('powinien obslugiwac zerowe uzycie tokenow', () => {
      manager.track('task', { input: 0, output: 0, total: 0 });

      const stats = manager.getStats();
      expect(stats.daily.used).toBe(0);
    });

    it('powinien obslugiwac wiele szybkich trackow', () => {
      for (let i = 0; i < 100; i++) {
        manager.track(`task-${i}`, { input: 10, output: 10, total: 20 });
      }

      const stats = manager.getStats();
      expect(stats.daily.used).toBe(2000);
      expect(stats.session.used).toBe(2000);
    });
  });
});
