/**
 * PromptTemplateLibrary - Collection of pre-built, tested prompt templates
 *
 * Contains built-in templates for:
 * - Code generation (function, class)
 * - Code review (security, performance)
 * - Debugging (error analysis)
 * - Architecture (system design)
 * - Testing (test suite generation)
 * - Refactoring (legacy code)
 * - Documentation (API docs)
 * - Data processing (pipeline design)
 * - Planning (sprint planning)
 *
 * @module core/intelligence/metaprompting/templates
 */

import type { PromptTemplate, TemplateCategory } from './types.js';

/**
 * PromptTemplateLibrary - Collection of pre-built, tested prompt templates
 */
export class PromptTemplateLibrary {
  private templates: Map<string, PromptTemplate> = new Map();
  private customTemplates: Map<string, PromptTemplate> = new Map();

  constructor() {
    this.initializeBuiltInTemplates();
  }

  /**
   * Initialize built-in templates
   */
  private initializeBuiltInTemplates(): void {
    const builtInTemplates: PromptTemplate[] = [
      // Code Generation Templates
      {
        id: 'code-gen-function',
        name: 'Function Generator',
        category: 'code_generation',
        description: 'Generates a well-documented function with error handling',
        template: `Jestes ekspertem w jezyku {{language}}.

ZADANIE: Napisz funkcje {{functionName}} ktora:
{{requirements}}

WYMAGANIA:
- Pelna obsluga bledow z odpowiednimi komunikatami
- Dokumentacja JSDoc/docstring
- Typowanie (jesli jezyk wspiera)
- Testy jednostkowe (3-5 przypadkow)
{{#if additionalConstraints}}
- {{additionalConstraints}}
{{/if}}

FORMAT ODPOWIEDZI:
1. Kod funkcji
2. Komentarze wyjasniajace kluczowe decyzje
3. Przyklady uzycia
4. Testy jednostkowe`,
        requiredVars: ['language', 'functionName', 'requirements'],
        optionalVars: { additionalConstraints: '' },
        tags: ['code', 'function', 'generation'],
        examples: [
          {
            vars: {
              language: 'TypeScript',
              functionName: 'calculateDiscount',
              requirements: '- Przyjmuje cene i procent rabatu\n- Zwraca cene po rabacie\n- Waliduje zakres rabatu (0-100%)'
            },
            result: '// Generated function with full implementation...'
          }
        ],
        rating: 0.92,
        usageCount: 0
      },
      {
        id: 'code-gen-class',
        name: 'Class Generator',
        category: 'code_generation',
        description: 'Generates a well-structured class with SOLID principles',
        template: `Jestes architektem oprogramowania specjalizujacym sie w {{language}}.

ZADANIE: Zaprojektuj i zaimplementuj klase {{className}} odpowiedzialna za:
{{responsibility}}

WYMAGANIA PROJEKTOWE:
- Single Responsibility Principle
- Dependency Injection dla zaleznosci
- Interfejsy dla abstrakcji
- Immutability gdzie mozliwe
- Builder pattern jesli konstruktor ma wiele parametrow

STRUKTURA ODPOWIEDZI:
1. Interfejs/kontrakt klasy
2. Implementacja klasy
3. Fabryka/Builder (jesli potrzebne)
4. Testy jednostkowe
5. Przyklad uzycia`,
        requiredVars: ['language', 'className', 'responsibility'],
        optionalVars: {},
        tags: ['code', 'class', 'oop', 'solid'],
        examples: [],
        rating: 0.89,
        usageCount: 0
      },

      // Code Review Templates
      {
        id: 'code-review-security',
        name: 'Security Code Review',
        category: 'code_review',
        description: 'Security-focused code review template',
        template: `Jestes ekspertem od bezpieczenstwa aplikacji (AppSec).

KOD DO PRZEGLADU:
\`\`\`{{language}}
{{code}}
\`\`\`

PRZEPROWADZ AUDYT BEZPIECZENSTWA:

1. **OWASP Top 10** - Sprawdz pod katem:
   - Injection (SQL, NoSQL, Command, LDAP)
   - Broken Authentication
   - Sensitive Data Exposure
   - XML External Entities (XXE)
   - Broken Access Control
   - Security Misconfiguration
   - XSS (Cross-Site Scripting)
   - Insecure Deserialization
   - Using Components with Known Vulnerabilities
   - Insufficient Logging & Monitoring

2. **Analiza danych wejsciowych** - Walidacja, sanityzacja

3. **Kryptografia** - Uzycie bezpiecznych algorytmow

4. **Secrets management** - Hardcoded credentials

5. **Error handling** - Information leakage

FORMAT ODPOWIEDZI:
| Severity | Kategoria | Linia | Opis | Rekomendacja |
|----------|-----------|-------|------|--------------|
| CRITICAL/HIGH/MEDIUM/LOW | ... | ... | ... | ... |`,
        requiredVars: ['language', 'code'],
        optionalVars: {},
        tags: ['security', 'review', 'owasp', 'audit'],
        examples: [],
        rating: 0.95,
        usageCount: 0
      },
      {
        id: 'code-review-performance',
        name: 'Performance Code Review',
        category: 'code_review',
        description: 'Performance-focused code review template',
        template: `Jestes ekspertem od wydajnosci i optymalizacji kodu.

KOD DO ANALIZY:
\`\`\`{{language}}
{{code}}
\`\`\`

KONTEKST: {{context}}

PRZEPROWADZ ANALIZE WYDAJNOSCI:

1. **Zlozonosc algorytmiczna**
   - Zlozonosc czasowa (Big O)
   - Zlozonosc pamieciowa
   - Potencjalne waskie gardla

2. **Wzorce anty-wydajnosciowe**
   - N+1 queries
   - Nadmierna alokacja pamieci
   - Blocking operations w async code
   - Unnecessary object creation
   - String concatenation w petlach

3. **Mozliwosci optymalizacji**
   - Caching
   - Lazy loading
   - Batch processing
   - Parallel processing

4. **Metryki do zmierzenia**
   - Sugerowane benchmarki
   - KPIs wydajnosci

ODPOWIEDZ W FORMACIE:
## Podsumowanie
[1-2 zdania]

## Problemy wydajnosciowe
| Priorytet | Problem | Lokalizacja | Potencjalny zysk |
|-----------|---------|-------------|------------------|

## Rekomendowane optymalizacje
[Lista z kodem przed/po]`,
        requiredVars: ['language', 'code'],
        optionalVars: { context: 'Aplikacja webowa' },
        tags: ['performance', 'optimization', 'review'],
        examples: [],
        rating: 0.91,
        usageCount: 0
      },

      // Debugging Templates
      {
        id: 'debug-error-analysis',
        name: 'Error Analysis',
        category: 'debugging',
        description: 'Systematic error analysis and debugging template',
        template: `Jestes doswiadczonym debuggerem i detektywem kodu.

BLAD/PROBLEM:
{{errorDescription}}

STACK TRACE (jesli dostepny):
\`\`\`
{{stackTrace}}
\`\`\`

RELEVANTNY KOD:
\`\`\`{{language}}
{{code}}
\`\`\`

KONTEKST SRODOWISKA:
{{environment}}

PRZEPROWADZ SLEDZTWO:

1. **Analiza bledu**
   - Typ bledu i jego znaczenie
   - Bezposrednia przyczyna
   - Glowna przyczyna (root cause)

2. **Hipotezy**
   - Lista mozliwych przyczyn (ranking prawdopodobienstwa)
   - Jak zweryfikowac kazda hipoteze

3. **Kroki debugowania**
   - Konkretne akcje do wykonania
   - Breakpointy do ustawienia
   - Logi do dodania

4. **Rozwiazanie**
   - Kod naprawiajacy problem
   - Testy weryfikujace naprawe
   - Zapobieganie regresji`,
        requiredVars: ['errorDescription', 'language', 'code'],
        optionalVars: { stackTrace: 'Brak', environment: 'Development' },
        tags: ['debug', 'error', 'troubleshooting'],
        examples: [],
        rating: 0.93,
        usageCount: 0
      },

      // Architecture Templates
      {
        id: 'arch-system-design',
        name: 'System Design',
        category: 'architecture',
        description: 'System design and architecture template',
        template: `Jestes glownym architektem oprogramowania.

WYMAGANIA SYSTEMU:
{{requirements}}

OGRANICZENIA:
- Skala: {{scale}}
- Budzet: {{budget}}
- Zespol: {{teamSize}} osob
- Deadline: {{deadline}}

ZAPROJEKTUJ ARCHITEKTURE:

1. **High-Level Architecture**
   - Diagram komponentow (ASCII art)
   - Przeplywy danych
   - Integracje zewnetrzne

2. **Wybor technologii**
   | Warstwa | Technologia | Uzasadnienie |
   |---------|-------------|--------------|

3. **Skalowanie**
   - Horizontal vs Vertical scaling
   - Caching strategy
   - Database sharding/replication

4. **Bezpieczenstwo**
   - Authentication/Authorization
   - Data encryption
   - Network security

5. **Monitoring & Observability**
   - Metryki do sledzenia
   - Alerting rules
   - Logging strategy

6. **Disaster Recovery**
   - Backup strategy
   - RTO/RPO
   - Failover procedures

7. **Estymacja kosztow**
   | Komponent | Miesieczny koszt | Roczny koszt |
   |-----------|------------------|--------------|`,
        requiredVars: ['requirements', 'scale'],
        optionalVars: {
          budget: 'Nieograniczony',
          teamSize: '5',
          deadline: '6 miesiecy'
        },
        tags: ['architecture', 'system-design', 'planning'],
        examples: [],
        rating: 0.94,
        usageCount: 0
      },

      // Testing Templates
      {
        id: 'test-generation',
        name: 'Test Suite Generator',
        category: 'testing',
        description: 'Comprehensive test suite generation template',
        template: `Jestes ekspertem od testowania oprogramowania.

KOD DO PRZETESTOWANIA:
\`\`\`{{language}}
{{code}}
\`\`\`

WYGENERUJ KOMPLEKSOWY ZESTAW TESTOW:

1. **Testy jednostkowe**
   - Happy path (3-5 przypadkow)
   - Edge cases (5-10 przypadkow)
   - Error cases (3-5 przypadkow)

2. **Testy parametryczne**
   - Data-driven tests dla roznych wejsc

3. **Testy integracyjne** (jesli dotyczy)
   - Interakcje miedzy komponentami

4. **Testy wydajnosciowe** (jesli dotyczy)
   - Benchmark dla duzych danych

5. **Testy bezpieczenstwa** (jesli dotyczy)
   - Fuzzing inputs
   - Boundary testing

FRAMEWORK: {{testFramework}}

FORMAT ODPOWIEDZI:
- Pelny kod testow gotowy do uruchomienia
- Komentarze wyjasniajace kazdy przypadek testowy
- Setup/teardown jesli potrzebne`,
        requiredVars: ['language', 'code', 'testFramework'],
        optionalVars: {},
        tags: ['testing', 'unit-tests', 'quality'],
        examples: [],
        rating: 0.90,
        usageCount: 0
      },

      // Refactoring Templates
      {
        id: 'refactor-legacy',
        name: 'Legacy Code Refactoring',
        category: 'refactoring',
        description: 'Safe refactoring of legacy code',
        template: `Jestes specjalista od refaktoryzacji legacy code.

LEGACY KOD:
\`\`\`{{language}}
{{code}}
\`\`\`

PROBLEMY DO ROZWIAZANIA:
{{problems}}

OGRANICZENIA:
- Brak regresji funkcjonalnej
- Zachowanie API (backward compatibility)
- Mozliwosc refaktora w iteracjach

PRZEPROWADZ REFAKTORYZACJE:

1. **Analiza stanu obecnego**
   - Code smells
   - Technical debt
   - Coupling/Cohesion

2. **Plan refaktoryzacji**
   - Kolejnosc zmian (od najbezpieczniejszych)
   - Punkty kontrolne (checkpoints)
   - Testy zabezpieczajace

3. **Refaktoryzacja krok po kroku**
   - Krok 1: [opis] + kod
   - Krok 2: [opis] + kod
   - ...

4. **Kod koncowy**
   - Pelny zrefaktoryzowany kod
   - Dokumentacja zmian
   - Testy regresji`,
        requiredVars: ['language', 'code'],
        optionalVars: { problems: 'Ogolna poprawa jakosci kodu' },
        tags: ['refactoring', 'legacy', 'clean-code'],
        examples: [],
        rating: 0.88,
        usageCount: 0
      },

      // Documentation Templates
      {
        id: 'doc-api',
        name: 'API Documentation',
        category: 'documentation',
        description: 'Comprehensive API documentation generator',
        template: `Jestes technical writerem specjalizujacym sie w dokumentacji API.

KOD API:
\`\`\`{{language}}
{{code}}
\`\`\`

WYGENERUJ DOKUMENTACJE W FORMACIE {{format}}:

1. **Przeglad API**
   - Cel i zastosowanie
   - Uwierzytelnianie
   - Limity i rate limiting

2. **Endpointy**
   Dla kazdego endpointu:
   - Metoda HTTP + sciezka
   - Opis
   - Parametry (query, path, body)
   - Odpowiedzi (200, 400, 401, 500)
   - Przyklady curl/fetch

3. **Modele danych**
   - Schematy JSON
   - Walidacje
   - Przykladowe dane

4. **Przyklady uzycia**
   - Typowe scenariusze
   - Best practices
   - Czeste bledy

5. **Changelog** (jesli dotyczy)`,
        requiredVars: ['language', 'code'],
        optionalVars: { format: 'Markdown' },
        tags: ['documentation', 'api', 'swagger'],
        examples: [],
        rating: 0.87,
        usageCount: 0
      },

      // Data Processing Templates
      {
        id: 'data-pipeline',
        name: 'Data Pipeline Design',
        category: 'data_processing',
        description: 'Data pipeline and ETL design template',
        template: `Jestes data engineerem specjalizujacym sie w pipelinach danych.

ZRODLO DANYCH:
{{dataSource}}

CEL PRZETWARZANIA:
{{objective}}

WYMAGANIA:
- Wolumen: {{volume}}
- Czestotliwosc: {{frequency}}
- SLA: {{sla}}

ZAPROJEKTUJ PIPELINE:

1. **Architektura**
   - Diagram przeplywu danych (ASCII)
   - Komponenty i ich odpowiedzialnosci

2. **Extract**
   - Zrodla danych
   - Metody ekstrakcji
   - Harmonogram

3. **Transform**
   - Reguly czyszczenia
   - Transformacje
   - Walidacje
   - Obsluga bledow

4. **Load**
   - Cel (warehouse, lake, mart)
   - Strategia ladowania (full, incremental, CDC)
   - Indeksy i partycjonowanie

5. **Monitoring**
   - Data quality checks
   - Alerting
   - Metryki SLA

6. **Implementacja**
   \`\`\`{{language}}
   [Kod pipeline'u]
   \`\`\``,
        requiredVars: ['dataSource', 'objective', 'language'],
        optionalVars: {
          volume: 'Sredni (GB/dzien)',
          frequency: 'Dzienny',
          sla: '99.9%'
        },
        tags: ['data', 'etl', 'pipeline', 'engineering'],
        examples: [],
        rating: 0.86,
        usageCount: 0
      },

      // Planning Templates
      {
        id: 'plan-sprint',
        name: 'Sprint Planning',
        category: 'planning',
        description: 'Sprint planning and task breakdown template',
        template: `Jestes doswiadczonym Scrum Masterem/Tech Leadem.

CEL SPRINTU:
{{sprintGoal}}

DOSTEPNY ZESPOL:
{{team}}

CZAS TRWANIA: {{duration}}

BACKLOG ITEMS:
{{backlogItems}}

PRZEPROWADZ PLANOWANIE:

1. **Analiza backloga**
   - Priorytetyzacja (MoSCoW)
   - Zaleznosci miedzy zadaniami
   - Ryzyka

2. **Podzial na zadania**
   | User Story | Task | Estymacja (h) | Assignee | Zaleznosci |
   |------------|------|---------------|----------|------------|

3. **Capacity planning**
   - Dostepnosc zespolu
   - Buffer na niespodzianki (20%)
   - Realistyczny commitment

4. **Definition of Done**
   - Kryteria akceptacji
   - Checklist techniczny

5. **Sprint timeline**
   - Daily milestones
   - Review/Retro terminy

6. **Ryzyka i mitygacje**
   | Ryzyko | Prawdopodobienstwo | Impact | Mitygacja |
   |--------|-------------------|--------|-----------|`,
        requiredVars: ['sprintGoal', 'backlogItems'],
        optionalVars: {
          team: '5 developerow',
          duration: '2 tygodnie'
        },
        tags: ['planning', 'sprint', 'agile', 'scrum'],
        examples: [],
        rating: 0.85,
        usageCount: 0
      }
    ];

    // Register all built-in templates
    for (const template of builtInTemplates) {
      this.templates.set(template.id, template);
    }
  }

  /**
   * Get a template by ID
   */
  getTemplate(id: string): PromptTemplate | undefined {
    return this.templates.get(id) || this.customTemplates.get(id);
  }

  /**
   * Get all templates in a category
   */
  getTemplatesByCategory(category: TemplateCategory): PromptTemplate[] {
    const results: PromptTemplate[] = [];

    for (const template of this.templates.values()) {
      if (template.category === category) {
        results.push(template);
      }
    }

    for (const template of this.customTemplates.values()) {
      if (template.category === category) {
        results.push(template);
      }
    }

    return results.sort((a, b) => b.rating - a.rating);
  }

  /**
   * Search templates by tags
   */
  searchByTags(tags: string[]): PromptTemplate[] {
    const results: PromptTemplate[] = [];
    const tagSet = new Set(tags.map(t => t.toLowerCase()));

    const allTemplates = [...this.templates.values(), ...this.customTemplates.values()];

    for (const template of allTemplates) {
      const matchCount = template.tags.filter(t => tagSet.has(t.toLowerCase())).length;
      if (matchCount > 0) {
        results.push({ ...template, rating: template.rating * (matchCount / tags.length) });
      }
    }

    return results.sort((a, b) => b.rating - a.rating);
  }

  /**
   * Apply a template with variables
   */
  applyTemplate(id: string, variables: Record<string, string>): string {
    const template = this.getTemplate(id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }

    // Check required variables
    for (const reqVar of template.requiredVars) {
      if (!(reqVar in variables)) {
        throw new Error(`Missing required variable: ${reqVar}`);
      }
    }

    // Merge with defaults
    const allVars = { ...template.optionalVars, ...variables };

    // Apply template
    let result = template.template;

    // Handle conditional blocks {{#if var}}...{{/if}}
    result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, varName, content) => {
      return allVars[varName] && allVars[varName].trim() ? content : '';
    });

    // Replace variables
    for (const [key, value] of Object.entries(allVars)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    // Update usage count
    template.usageCount++;

    return result;
  }

  /**
   * Add a custom template
   */
  addCustomTemplate(template: Omit<PromptTemplate, 'usageCount'>): void {
    const fullTemplate: PromptTemplate = {
      ...template,
      usageCount: 0
    };
    this.customTemplates.set(template.id, fullTemplate);
  }

  /**
   * List all templates
   */
  listTemplates(): Array<{ id: string; name: string; category: TemplateCategory; rating: number }> {
    const allTemplates = [...this.templates.values(), ...this.customTemplates.values()];
    return allTemplates.map(t => ({
      id: t.id,
      name: t.name,
      category: t.category,
      rating: t.rating
    }));
  }

  /**
   * Get template statistics
   */
  getStats(): { totalTemplates: number; byCategory: Record<string, number>; mostUsed: string[] } {
    const allTemplates = [...this.templates.values(), ...this.customTemplates.values()];
    const byCategory: Record<string, number> = {};

    for (const t of allTemplates) {
      byCategory[t.category] = (byCategory[t.category] || 0) + 1;
    }

    const mostUsed = [...allTemplates]
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 5)
      .map(t => t.id);

    return {
      totalTemplates: allTemplates.length,
      byCategory,
      mostUsed
    };
  }
}
