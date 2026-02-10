/**
 * GeminiHydra - TaskPriority Unit Tests
 * Testy systemu priorytetyzacji: kolejka, detekcja priorytetu, sortowanie
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TaskPriorityQueue,
  detectPriority,
  prioritizeTasks,
  type Priority,
  type PrioritizedTask,
} from '../../src/core/TaskPriority.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    red: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    gray: (s: string) => s,
  },
}));

// ============================================================
// TaskPriorityQueue
// ============================================================

describe('TaskPriorityQueue', () => {
  let queue: TaskPriorityQueue;

  beforeEach(() => {
    queue = new TaskPriorityQueue();
  });

  describe('add - dodawanie taskow', () => {
    it('powinien dodac task do kolejki', () => {
      queue.add({ id: 1, priority: 'high', task: 'test' });
      expect(queue.size()).toBe(1);
    });

    it('powinien zachowac kolejnosc priorytetow', () => {
      queue.add({ id: 1, priority: 'low', task: 'low task' });
      queue.add({ id: 2, priority: 'critical', task: 'critical task' });
      queue.add({ id: 3, priority: 'medium', task: 'medium task' });

      const next = queue.peek();
      expect(next?.priority).toBe('critical');
    });
  });

  describe('addAll - dodawanie wielu taskow', () => {
    it('powinien dodac wiele taskow na raz', () => {
      queue.addAll([
        { id: 1, priority: 'high', task: 'a' },
        { id: 2, priority: 'low', task: 'b' },
        { id: 3, priority: 'medium', task: 'c' },
      ]);
      expect(queue.size()).toBe(3);
    });

    it('powinien posortowac taski po dodaniu', () => {
      queue.addAll([
        { id: 1, priority: 'low', task: 'a' },
        { id: 2, priority: 'critical', task: 'b' },
      ]);
      expect(queue.peek()?.priority).toBe('critical');
    });
  });

  describe('getNext - pobieranie nastepnego taska', () => {
    it('powinien zwrocic task o najwyzszym priorytecie', () => {
      queue.add({ id: 1, priority: 'low', task: 'low' });
      queue.add({ id: 2, priority: 'high', task: 'high' });

      const next = queue.getNext();
      expect(next?.id).toBe(2);
      expect(next?.priority).toBe('high');
    });

    it('powinien usunac zwrocony task z kolejki', () => {
      queue.add({ id: 1, priority: 'high', task: 'test' });
      expect(queue.size()).toBe(1);

      queue.getNext();
      expect(queue.size()).toBe(0);
    });

    it('powinien zwrocic undefined dla pustej kolejki', () => {
      expect(queue.getNext()).toBeUndefined();
    });

    it('powinien respektowac zależnosci (dependencies)', () => {
      queue.add({ id: 1, priority: 'low', task: 'first' });
      queue.add({ id: 2, priority: 'critical', task: 'depends', dependencies: [1] });

      // Task 2 ma wyzszy priorytet, ale zalezy od taska 1
      const next = queue.getNext();
      expect(next?.id).toBe(1); // powinien byc task 1
    });

    it('powinien zwrocic task z zaleznoscia po oznaczeniu ja jako ukonczona', () => {
      queue.add({ id: 1, priority: 'low', task: 'first' });
      queue.add({ id: 2, priority: 'critical', task: 'depends', dependencies: [1] });

      // Pobierz i ukoncz task 1
      queue.getNext();
      queue.complete(1);

      // Teraz task 2 powinien byc dostepny
      const next = queue.getNext();
      expect(next?.id).toBe(2);
    });
  });

  describe('getAllExecutable - pobieranie wszystkich wykonywalnych', () => {
    it('powinien zwrocic wszystkie taski bez zaleznosci', () => {
      queue.addAll([
        { id: 1, priority: 'high', task: 'a' },
        { id: 2, priority: 'medium', task: 'b' },
        { id: 3, priority: 'low', task: 'c' },
      ]);

      const executable = queue.getAllExecutable();
      expect(executable).toHaveLength(3);
    });

    it('powinien respektowac maxCount', () => {
      queue.addAll([
        { id: 1, priority: 'high', task: 'a' },
        { id: 2, priority: 'medium', task: 'b' },
        { id: 3, priority: 'low', task: 'c' },
      ]);

      const executable = queue.getAllExecutable(2);
      expect(executable).toHaveLength(2);
    });

    it('powinien usunac wykonywalne taski z kolejki', () => {
      queue.addAll([
        { id: 1, priority: 'high', task: 'a' },
        { id: 2, priority: 'medium', task: 'b' },
      ]);

      queue.getAllExecutable();
      expect(queue.size()).toBe(0);
    });

    it('nie powinien zwrocic taskow z nieukonczonymi zalezosciami', () => {
      queue.addAll([
        { id: 1, priority: 'low', task: 'a' },
        { id: 2, priority: 'high', task: 'b', dependencies: [3] }, // task 3 nie istnieje
      ]);

      const executable = queue.getAllExecutable();
      expect(executable).toHaveLength(1);
      expect(executable[0].id).toBe(1);
    });
  });

  describe('complete - oznaczanie jako ukonczone', () => {
    it('powinien oznaczyc task jako ukonczony', () => {
      queue.add({ id: 1, priority: 'high', task: 'test' });
      queue.getNext();
      queue.complete(1);

      // Task z zaleznoscia od 1 powinien byc teraz dostepny
      queue.add({ id: 2, priority: 'high', task: 'depends', dependencies: [1] });
      const next = queue.getNext();
      expect(next?.id).toBe(2);
    });

    it('powinien obslugiwac stringowe ID', () => {
      queue.add({ id: 'task-a', priority: 'high', task: 'test' });
      queue.getNext();
      queue.complete('task-a');

      queue.add({ id: 'task-b', priority: 'high', task: 'depends', dependencies: ['task-a'] });
      const next = queue.getNext();
      expect(next?.id).toBe('task-b');
    });
  });

  describe('fail - obsluga bledow taskow', () => {
    it('powinien ponownie dodac task do kolejki z requeue=true', () => {
      const task: PrioritizedTask = { id: 1, priority: 'high', task: 'test' };
      queue.fail(task, true);

      expect(queue.size()).toBe(1);
      expect(task.retryCount).toBe(1);
    });

    it('nie powinien dodawac taska z requeue=false', () => {
      const task: PrioritizedTask = { id: 1, priority: 'high', task: 'test' };
      queue.fail(task, false);

      expect(queue.size()).toBe(0);
    });

    it('powinien degradowac priorytet po 2 retry', () => {
      const task: PrioritizedTask = { id: 1, priority: 'high', task: 'test', retryCount: 1 };
      queue.fail(task, true);

      expect(task.priority).toBe('medium');
      expect(task.retryCount).toBe(2);
    });

    it('powinien ustawic low priorytet po 3+ retry', () => {
      const task: PrioritizedTask = { id: 1, priority: 'high', task: 'test', retryCount: 2 };
      queue.fail(task, true);

      expect(task.priority).toBe('low');
      expect(task.retryCount).toBe(3);
    });

    it('nie powinien degradowac critical po 2 retry', () => {
      const task: PrioritizedTask = { id: 1, priority: 'critical', task: 'test', retryCount: 1 };
      queue.fail(task, true);

      expect(task.priority).toBe('critical');
    });

    it('powinien degradowac critical do low po 3+ retry', () => {
      const task: PrioritizedTask = { id: 1, priority: 'critical', task: 'test', retryCount: 2 };
      queue.fail(task, true);

      expect(task.priority).toBe('low');
    });
  });

  describe('next - alias z zewnetrznym zbiorem ukonczonych', () => {
    it('powinien uzywac zewnetrznego zbioru ukonczonych', () => {
      queue.addAll([
        { id: 1, priority: 'low', task: 'a' },
        { id: 2, priority: 'high', task: 'b', dependencies: [1] },
      ]);

      const externalCompleted = new Set<number | string>([1]);
      const next = queue.next(externalCompleted);
      expect(next?.id).toBe(2);
    });

    it('powinien zwrocic undefined jesli brak wykonywalnych', () => {
      queue.add({ id: 1, priority: 'high', task: 'a', dependencies: [99] });

      const next = queue.next();
      expect(next).toBeUndefined();
    });
  });

  describe('size / isEmpty / peek / clear', () => {
    it('size powinien zwrocic liczbe taskow', () => {
      expect(queue.size()).toBe(0);
      queue.add({ id: 1, priority: 'high', task: 'a' });
      expect(queue.size()).toBe(1);
    });

    it('isEmpty powinien zwrocic true dla pustej kolejki', () => {
      expect(queue.isEmpty()).toBe(true);
    });

    it('isEmpty powinien zwrocic false dla niepustej kolejki', () => {
      queue.add({ id: 1, priority: 'high', task: 'a' });
      expect(queue.isEmpty()).toBe(false);
    });

    it('peek powinien zwrocic nastepny task bez usuwania', () => {
      queue.add({ id: 1, priority: 'high', task: 'test' });
      const peeked = queue.peek();
      expect(peeked?.id).toBe(1);
      expect(queue.size()).toBe(1); // nie usuniety
    });

    it('peek powinien zwrocic undefined dla pustej kolejki', () => {
      expect(queue.peek()).toBeUndefined();
    });

    it('clear powinien wyczyscic kolejke', () => {
      queue.addAll([
        { id: 1, priority: 'high', task: 'a' },
        { id: 2, priority: 'low', task: 'b' },
      ]);
      queue.complete(1);

      queue.clear();

      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });
  });

  describe('getStats - statystyki', () => {
    it('powinien zwrocic poprawne statystyki', () => {
      queue.addAll([
        { id: 1, priority: 'critical', task: 'a' },
        { id: 2, priority: 'high', task: 'b' },
        { id: 3, priority: 'high', task: 'c' },
        { id: 4, priority: 'medium', task: 'd' },
        { id: 5, priority: 'low', task: 'e' },
      ]);

      queue.getNext();
      queue.complete(1);

      const stats = queue.getStats();
      expect(stats.total).toBe(4);
      expect(stats.completed).toBe(1);
      expect(stats.byPriority.high).toBe(2);
      expect(stats.byPriority.medium).toBe(1);
      expect(stats.byPriority.low).toBe(1);
      expect(stats.byPriority.critical).toBe(0);
    });

    it('powinien zwrocic zerowe statystyki dla pustej kolejki', () => {
      const stats = queue.getStats();
      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.byPriority.critical).toBe(0);
      expect(stats.byPriority.high).toBe(0);
    });
  });

  describe('sortowanie - wielokryteriowe', () => {
    it('powinien sortowac po priorytecie', () => {
      queue.addAll([
        { id: 1, priority: 'low', task: 'a' },
        { id: 2, priority: 'critical', task: 'b' },
        { id: 3, priority: 'high', task: 'c' },
        { id: 4, priority: 'medium', task: 'd' },
      ]);

      expect(queue.peek()?.id).toBe(2); // critical first
    });

    it('powinien sortowac po deadline przy rownych priorytetach', () => {
      const soon = new Date(Date.now() + 1000);
      const later = new Date(Date.now() + 100000);

      queue.addAll([
        { id: 1, priority: 'high', task: 'a', deadline: later },
        { id: 2, priority: 'high', task: 'b', deadline: soon },
      ]);

      expect(queue.peek()?.id).toBe(2); // wczesniejszy deadline
    });

    it('powinien preferowac taski z deadline nad taski bez', () => {
      const deadline = new Date(Date.now() + 1000);

      queue.addAll([
        { id: 1, priority: 'high', task: 'a' },
        { id: 2, priority: 'high', task: 'b', deadline },
      ]);

      expect(queue.peek()?.id).toBe(2);
    });

    it('powinien preferowac taski z mniejsza liczba zaleznosci', () => {
      queue.addAll([
        { id: 1, priority: 'high', task: 'a', dependencies: [10, 20, 30] },
        { id: 2, priority: 'high', task: 'b', dependencies: [10] },
      ]);

      // Bez ukoncoznych deps, ale sortowanie powinno preferowac mniej deps
      // Jednak oba maja niespelnione deps wiec getNext zwroci undefined
      expect(queue.peek()?.id).toBe(2);
    });
  });
});

// ============================================================
// detectPriority
// ============================================================

describe('detectPriority', () => {
  describe('detekcja priorytetow - angielski', () => {
    it('powinien wykryc critical', () => {
      expect(detectPriority('This is a critical issue')).toBe('critical');
      expect(detectPriority('Fix this ASAP')).toBe('critical');
      expect(detectPriority('Urgent bug fix needed')).toBe('critical');
      expect(detectPriority('Do this immediately')).toBe('critical');
      expect(detectPriority('Emergency deployment')).toBe('critical');
    });

    it('powinien wykryc high', () => {
      expect(detectPriority('This is important')).toBe('high');
      expect(detectPriority('High priority task')).toBe('high');
    });

    it('powinien wykryc low', () => {
      expect(detectPriority('Low priority cleanup')).toBe('low');
      expect(detectPriority('Nice to have feature')).toBe('low');
    });

    it('powinien zwrocic medium jako domyslny', () => {
      expect(detectPriority('Regular task')).toBe('medium');
      expect(detectPriority('Implement feature X')).toBe('medium');
    });
  });

  describe('detekcja priorytetow - polski', () => {
    it('powinien wykryc krytyczny (critical)', () => {
      expect(detectPriority('To jest krytyczny blad')).toBe('critical');
      expect(detectPriority('Pilne naprawienie')).toBe('critical');
    });

    it('powinien wykryc wazne (high)', () => {
      expect(detectPriority('Ważne zadanie')).toBe('high');
      expect(detectPriority('Wysoki priorytet')).toBe('high');
    });

    it('powinien wykryc niski priorytet (low)', () => {
      expect(detectPriority('Niski priorytet')).toBe('low');
      expect(detectPriority('Opcjonalnie do zrobienia')).toBe('low');
    });
  });

  describe('edge cases', () => {
    it('powinien zwrocic medium dla pustego stringa', () => {
      expect(detectPriority('')).toBe('medium');
    });

    it('powinien byc case-insensitive', () => {
      expect(detectPriority('CRITICAL')).toBe('critical');
      expect(detectPriority('IMPORTANT')).toBe('high');
      expect(detectPriority('LOW PRIORITY')).toBe('low');
    });
  });
});

// ============================================================
// prioritizeTasks
// ============================================================

describe('prioritizeTasks', () => {
  it('powinien przypisac priorytety na podstawie tekstu taska', () => {
    const tasks = [
      { id: 1, task: 'Regular feature implementation' },
      { id: 2, task: 'Critical bug fix needed ASAP' },
      { id: 3, task: 'Nice to have improvement' },
    ];

    const prioritized = prioritizeTasks(tasks);

    expect(prioritized[0].priority).toBe('critical');
    expect(prioritized[0].id).toBe(2);
  });

  it('powinien sortowac od najwyzszego priorytetu', () => {
    const tasks = [
      { id: 1, task: 'Low priority task' },
      { id: 2, task: 'Critical emergency' },
      { id: 3, task: 'Medium importance' },
      { id: 4, task: 'Important high priority' },
    ];

    const prioritized = prioritizeTasks(tasks);

    expect(prioritized[0].priority).toBe('critical');
    expect(prioritized[prioritized.length - 1].priority).toBe('low');
  });

  it('powinien ustawic retryCount na 0', () => {
    const tasks = [{ id: 1, task: 'Some task' }];
    const prioritized = prioritizeTasks(tasks);
    expect(prioritized[0].retryCount).toBe(0);
  });

  it('powinien obslugiwac pole content zamiast task', () => {
    const tasks = [{ id: 1, content: 'Critical issue' }];
    const prioritized = prioritizeTasks(tasks);
    expect(prioritized[0].priority).toBe('critical');
  });

  it('powinien obslugiwac pole objective zamiast task', () => {
    const tasks = [{ id: 1, objective: 'Urgent delivery' }];
    const prioritized = prioritizeTasks(tasks);
    expect(prioritized[0].priority).toBe('critical');
  });

  it('powinien zwrocic medium gdy brak tekstu', () => {
    const tasks = [{ id: 1 }];
    const prioritized = prioritizeTasks(tasks as any);
    expect(prioritized[0].priority).toBe('medium');
  });

  it('powinien obslugiwac pusta tablice', () => {
    const prioritized = prioritizeTasks([]);
    expect(prioritized).toHaveLength(0);
  });

  it('powinien zachowac oryginalne pola', () => {
    const tasks = [{ id: 42, task: 'test', extra: 'data' }];
    const prioritized = prioritizeTasks(tasks);
    expect(prioritized[0].id).toBe(42);
    expect(prioritized[0].task).toBe('test');
    expect((prioritized[0] as any).extra).toBe('data');
  });
});
