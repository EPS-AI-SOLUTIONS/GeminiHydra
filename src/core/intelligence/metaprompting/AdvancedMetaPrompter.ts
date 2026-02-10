/**
 * AdvancedMetaPrompter - Extended MetaPrompter with advanced features
 *
 * Features:
 * - Recursive meta-prompting (self-optimization)
 * - Prompt evolution with genetic algorithms
 * - A/B testing for prompt comparison
 * - Prompt compression
 * - Domain-specific optimization
 * - Few-shot injection
 *
 * @module core/intelligence/metaprompting/AdvancedMetaPrompter
 */

import { generate, selectModel } from '../../GeminiCLI.js';
import {
  getFewShotExamples,
  mapTaskTypeToExampleCategory,
} from '../../PromptSystem.js';
import type {
  MetaPromptingConfig,
  EvolutionConfig,
  ABTestResult,
  CompressionResult,
  DomainOptimizationResult,
  DomainType,
  RecursiveOptimizationResult,
  PromptIndividual,
} from './types.js';
import { DEFAULT_EVOLUTION_CONFIG } from './types.js';
import { MetaPrompter } from './MetaPrompter.js';
import { PromptTemplateLibrary } from './templates.js';

/**
 * AdvancedMetaPrompter - Extended MetaPrompter with advanced features
 */
export class AdvancedMetaPrompter extends MetaPrompter {
  private templateLibrary: PromptTemplateLibrary;
  private evolutionConfig: EvolutionConfig;

  constructor(
    config: Partial<MetaPromptingConfig> = {},
    evolutionConfig: Partial<EvolutionConfig> = {}
  ) {
    super(config);
    this.templateLibrary = new PromptTemplateLibrary();
    this.evolutionConfig = { ...DEFAULT_EVOLUTION_CONFIG, ...evolutionConfig };
  }

  // ==========================================================================
  // RECURSIVE META-PROMPTING
  // ==========================================================================

  /**
   * Recursively optimize a prompt until convergence or max iterations
   */
  async recursiveOptimize(
    prompt: string,
    context: string,
    maxIterations: number = 5,
    convergenceThreshold: number = 0.05
  ): Promise<RecursiveOptimizationResult> {
    const iterations: RecursiveOptimizationResult['iterations'] = [];
    let currentPrompt = prompt;
    let previousScore = 0;
    let converged = false;

    const initialScore = await this.scorePrompt(prompt, context);
    iterations.push({
      iteration: 0,
      prompt: prompt,
      score: initialScore,
      improvements: ['Initial prompt']
    });
    previousScore = initialScore;

    for (let i = 1; i <= maxIterations; i++) {
      const optimization = await this.optimizePrompt(currentPrompt, context);
      const newScore = await this.scorePrompt(optimization.optimizedPrompt, context);

      iterations.push({
        iteration: i,
        prompt: optimization.optimizedPrompt,
        score: newScore,
        improvements: optimization.improvements
      });

      const improvement = newScore - previousScore;
      if (improvement < convergenceThreshold) {
        converged = true;
        break;
      }

      currentPrompt = optimization.optimizedPrompt;
      previousScore = newScore;
    }

    const finalIteration = iterations[iterations.length - 1];

    return {
      originalPrompt: prompt,
      finalPrompt: finalIteration.prompt,
      iterations,
      totalImprovement: finalIteration.score - initialScore,
      converged,
      iterationsPerformed: iterations.length - 1
    };
  }

  /**
   * Score a prompt based on quality criteria
   */
  private async scorePrompt(prompt: string, context: string): Promise<number> {
    const model = this.config.model || selectModel('analysis');
    const isPolish = this.config.language === 'pl';

    const scoringPrompt = isPolish
      ? `Ocen jakosc ponizszego prompta w skali 0.0 - 1.0.

PROMPT:
"""
${prompt}
"""

KONTEKST UZYCIA:
${context}

KRYTERIA OCENY (kazde 0-1, srednia = wynik koncowy):
1. Jasnosc instrukcji
2. Kompletnosc kontekstu
3. Precyzja formatu wyjscia
4. Obsluga edge cases
5. Efektywnosc (brak zbednych slow)
6. Struktura i organizacja
7. Potencjal do dobrych odpowiedzi

ZWROC TYLKO JSON:
{"score": 0.XX, "breakdown": {"clarity": 0.X, "context": 0.X, "format": 0.X, "edgeCases": 0.X, "efficiency": 0.X, "structure": 0.X, "potential": 0.X}}`
      : `Rate the quality of the following prompt on a scale of 0.0 - 1.0.

PROMPT:
"""
${prompt}
"""

USAGE CONTEXT:
${context}

SCORING CRITERIA (each 0-1, average = final score):
1. Clarity of instructions
2. Completeness of context
3. Precision of output format
4. Edge case handling
5. Efficiency (no unnecessary words)
6. Structure and organization
7. Potential for good responses

RETURN ONLY JSON:
{"score": 0.XX, "breakdown": {"clarity": 0.X, "context": 0.X, "format": 0.X, "edgeCases": 0.X, "efficiency": 0.X, "structure": 0.X, "potential": 0.X}}`;

    try {
      const response = await generate(scoringPrompt, {
        model,
        temperature: 0.2,
        maxTokens: 500
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return 0.5;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return Math.max(0, Math.min(1, parsed.score || 0.5));
    } catch {
      return 0.5;
    }
  }

  // ==========================================================================
  // PROMPT EVOLUTION (Genetic Algorithm)
  // ==========================================================================

  /**
   * Evolve a prompt using genetic algorithm principles
   */
  async evolvePrompt(
    prompt: string,
    context: string,
    config?: Partial<EvolutionConfig>
  ): Promise<{
    bestPrompt: string;
    bestFitness: number;
    generations: Array<{ generation: number; bestFitness: number; avgFitness: number }>;
    lineage: string[];
  }> {
    const evoConfig = { ...this.evolutionConfig, ...config };
    const generations: Array<{ generation: number; bestFitness: number; avgFitness: number }> = [];

    let population = await this.initializePopulation(prompt, context, evoConfig.populationSize);

    for (const individual of population) {
      individual.fitness = await this.scorePrompt(individual.prompt, context);
    }

    population.sort((a, b) => b.fitness - a.fitness);

    generations.push({
      generation: 0,
      bestFitness: population[0].fitness,
      avgFitness: population.reduce((sum, p) => sum + p.fitness, 0) / population.length
    });

    for (let gen = 1; gen <= evoConfig.generations; gen++) {
      const newPopulation: PromptIndividual[] = [];

      for (let i = 0; i < evoConfig.elitismCount; i++) {
        newPopulation.push({ ...population[i], generation: gen });
      }

      while (newPopulation.length < evoConfig.populationSize) {
        const parent1 = this.tournamentSelect(population, evoConfig.selectionPressure);
        const parent2 = this.tournamentSelect(population, evoConfig.selectionPressure);

        let offspring: PromptIndividual;

        if (Math.random() < evoConfig.crossoverRate) {
          offspring = await this.crossover(parent1, parent2, gen);
        } else {
          offspring = { ...parent1, generation: gen, id: this.generateId() };
        }

        if (Math.random() < evoConfig.mutationRate) {
          offspring = await this.mutate(offspring, context);
        }

        offspring.fitness = await this.scorePrompt(offspring.prompt, context);
        newPopulation.push(offspring);
      }

      population = newPopulation;
      population.sort((a, b) => b.fitness - a.fitness);

      generations.push({
        generation: gen,
        bestFitness: population[0].fitness,
        avgFitness: population.reduce((sum, p) => sum + p.fitness, 0) / population.length
      });
    }

    const best = population[0];
    const lineage = this.traceLineage(best, population);

    return {
      bestPrompt: best.prompt,
      bestFitness: best.fitness,
      generations,
      lineage
    };
  }

  /**
   * Initialize population with variations of seed prompt
   */
  private async initializePopulation(
    seedPrompt: string,
    context: string,
    size: number
  ): Promise<PromptIndividual[]> {
    const population: PromptIndividual[] = [];

    population.push({
      prompt: seedPrompt,
      fitness: 0,
      generation: 0,
      parents: [],
      id: this.generateId(),
      mutations: []
    });

    const variationPrompt = this.config.language === 'pl'
      ? `Wygeneruj ${size - 1} roznych wariantow ponizszego prompta.
Kazdy wariant powinien zachowac oryginalny cel, ale roznowac sie:
- Struktura
- Sformulowania
- Dodatkowe instrukcje
- Styl

ORYGINALNY PROMPT:
"""
${seedPrompt}
"""

KONTEKST: ${context}

ZWROC JSON:
{"variants": ["wariant1", "wariant2", ...]}`
      : `Generate ${size - 1} different variants of the following prompt.
Each variant should preserve the original goal but vary in:
- Structure
- Wording
- Additional instructions
- Style

ORIGINAL PROMPT:
"""
${seedPrompt}
"""

CONTEXT: ${context}

RETURN JSON:
{"variants": ["variant1", "variant2", ...]}`;

    try {
      const response = await generate(variationPrompt, {
        model: this.config.model || selectModel('creative'),
        temperature: 0.8,
        maxTokens: this.config.maxTokens
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const variants = parsed.variants || [];

        for (const variant of variants.slice(0, size - 1)) {
          population.push({
            prompt: variant,
            fitness: 0,
            generation: 0,
            parents: [population[0].id],
            id: this.generateId(),
            mutations: ['initial_variation']
          });
        }
      }
    } catch (error) {
      console.error('[AdvancedMetaPrompter] Population initialization failed:', error);
    }

    while (population.length < size) {
      const base = population[Math.floor(Math.random() * population.length)];
      population.push({
        prompt: this.simpleTextMutation(base.prompt),
        fitness: 0,
        generation: 0,
        parents: [base.id],
        id: this.generateId(),
        mutations: ['simple_mutation']
      });
    }

    return population;
  }

  /**
   * Tournament selection
   */
  private tournamentSelect(population: PromptIndividual[], pressure: number): PromptIndividual {
    const tournamentSize = Math.max(2, Math.floor(pressure));
    let best: PromptIndividual | null = null;

    for (let i = 0; i < tournamentSize; i++) {
      const candidate = population[Math.floor(Math.random() * population.length)];
      if (!best || candidate.fitness > best.fitness) {
        best = candidate;
      }
    }

    return best!;
  }

  /**
   * Crossover two prompts
   */
  private async crossover(
    parent1: PromptIndividual,
    parent2: PromptIndividual,
    generation: number
  ): Promise<PromptIndividual> {
    const crossoverPrompt = this.config.language === 'pl'
      ? `Polacz te dwa prompty w jeden, biorac najlepsze elementy z kazdego:

PROMPT A:
"""
${parent1.prompt}
"""

PROMPT B:
"""
${parent2.prompt}
"""

Stworz nowy prompt ktory laczy mocne strony obu. ZWROC TYLKO nowy prompt, bez komentarzy.`
      : `Combine these two prompts into one, taking the best elements from each:

PROMPT A:
"""
${parent1.prompt}
"""

PROMPT B:
"""
${parent2.prompt}
"""

Create a new prompt that combines the strengths of both. RETURN ONLY the new prompt, no comments.`;

    try {
      const response = await generate(crossoverPrompt, {
        model: this.config.model || selectModel('creative'),
        temperature: 0.5,
        maxTokens: this.config.maxTokens
      });

      return {
        prompt: response.trim(),
        fitness: 0,
        generation,
        parents: [parent1.id, parent2.id],
        id: this.generateId(),
        mutations: ['crossover']
      };
    } catch {
      const p1Parts = parent1.prompt.split('\n\n');
      const p2Parts = parent2.prompt.split('\n\n');
      const combined = p1Parts.map((part, i) =>
        Math.random() < 0.5 ? part : (p2Parts[i] || part)
      ).join('\n\n');

      return {
        prompt: combined,
        fitness: 0,
        generation,
        parents: [parent1.id, parent2.id],
        id: this.generateId(),
        mutations: ['simple_crossover']
      };
    }
  }

  /**
   * Mutate a prompt
   */
  private async mutate(
    individual: PromptIndividual,
    context: string
  ): Promise<PromptIndividual> {
    const mutationTypes = [
      'rephrase', 'add_constraint', 'add_example', 'restructure',
      'simplify', 'elaborate', 'change_format'
    ];
    const mutationType = mutationTypes[Math.floor(Math.random() * mutationTypes.length)];

    const mutationPrompt = this.config.language === 'pl'
      ? `Zmutuj (zmodyfikuj) ponizszy prompt stosujac operacje: ${mutationType}

PROMPT:
"""
${individual.prompt}
"""

KONTEKST: ${context}

OPERACJE MUTACJI:
- rephrase: Przeformuluj instrukcje innymi slowami
- add_constraint: Dodaj nowe ograniczenie lub regule
- add_example: Dodaj przyklad oczekiwanego wyniku
- restructure: Zmien strukture/kolejnosc sekcji
- simplify: Uprosci przekaz, usun zbedne elementy
- elaborate: Rozwin krotkie instrukcje
- change_format: Zmien format wyjscia (np. lista -> tabela)

ZWROC TYLKO zmutowany prompt, bez komentarzy.`
      : `Mutate (modify) the following prompt using operation: ${mutationType}

PROMPT:
"""
${individual.prompt}
"""

CONTEXT: ${context}

MUTATION OPERATIONS:
- rephrase: Rephrase instructions with different words
- add_constraint: Add a new constraint or rule
- add_example: Add an example of expected output
- restructure: Change structure/order of sections
- simplify: Simplify the message, remove unnecessary elements
- elaborate: Expand short instructions
- change_format: Change output format (e.g., list -> table)

RETURN ONLY the mutated prompt, no comments.`;

    try {
      const response = await generate(mutationPrompt, {
        model: this.config.model || selectModel('creative'),
        temperature: 0.7,
        maxTokens: this.config.maxTokens
      });

      return {
        prompt: response.trim(),
        fitness: 0,
        generation: individual.generation,
        parents: individual.parents,
        id: this.generateId(),
        mutations: [...individual.mutations, mutationType]
      };
    } catch {
      return {
        ...individual,
        prompt: this.simpleTextMutation(individual.prompt),
        mutations: [...individual.mutations, 'simple_text_mutation']
      };
    }
  }

  /**
   * Simple text-based mutation (fallback)
   */
  private simpleTextMutation(prompt: string): string {
    const mutations = [
      (p: string) => p.replace(/(\w+)/i, '**$1**'),
      (p: string) => p + '\n\nBadz precyzyjny w odpowiedzi.',
      (p: string) => {
        const sentences = p.split('. ');
        const i = Math.floor(Math.random() * sentences.length);
        const j = Math.floor(Math.random() * sentences.length);
        [sentences[i], sentences[j]] = [sentences[j], sentences[i]];
        return sentences.join('. ');
      }
    ];

    const mutation = mutations[Math.floor(Math.random() * mutations.length)];
    return mutation(prompt);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `ind_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Trace lineage of an individual
   */
  private traceLineage(individual: PromptIndividual, population: PromptIndividual[]): string[] {
    const lineage: string[] = [individual.prompt];
    return [...individual.mutations, ...lineage];
  }

  // ==========================================================================
  // A/B TESTING
  // ==========================================================================

  /**
   * A/B test two prompts and determine the better one
   */
  async abTestPrompts(
    variantA: string,
    variantB: string,
    context: string,
    testCases?: string[]
  ): Promise<ABTestResult> {
    const model = this.config.model || selectModel('analysis');
    const isPolish = this.config.language === 'pl';

    const scoreA = await this.scorePrompt(variantA, context);
    const scoreB = await this.scorePrompt(variantB, context);

    const comparisonPrompt = isPolish
      ? `Porownaj te dwa prompty i okresli ktory jest lepszy dla zadania.

WARIANT A:
"""
${variantA}
"""

WARIANT B:
"""
${variantB}
"""

KONTEKST ZADANIA: ${context}

${testCases ? `PRZYPADKI TESTOWE:\n${testCases.join('\n')}\n` : ''}

PRZEANALIZUJ:
1. Jasnosc instrukcji (ktory jest klarowniejszy?)
2. Kompletnosc (ktory ma wiecej niezbednych informacji?)
3. Struktura (ktory jest lepiej zorganizowany?)
4. Potencjal odpowiedzi (ktory da lepsze wyniki?)
5. Efektywnosc (ktory jest bardziej zwiezly bez utraty jakosci?)

ZWROC JSON:
{
  "winner": "A" lub "B" lub "tie",
  "confidence": 0.0-1.0,
  "analysis": "szczegolowa analiza porownawcza",
  "recommendations": ["lista rekomendacji dla poprawy obu wariantow"]
}`
      : `Compare these two prompts and determine which is better for the task.

VARIANT A:
"""
${variantA}
"""

VARIANT B:
"""
${variantB}
"""

TASK CONTEXT: ${context}

${testCases ? `TEST CASES:\n${testCases.join('\n')}\n` : ''}

ANALYZE:
1. Clarity of instructions (which is clearer?)
2. Completeness (which has more necessary information?)
3. Structure (which is better organized?)
4. Response potential (which will yield better results?)
5. Efficiency (which is more concise without losing quality?)

RETURN JSON:
{
  "winner": "A" or "B" or "tie",
  "confidence": 0.0-1.0,
  "analysis": "detailed comparative analysis",
  "recommendations": ["list of recommendations for improving both variants"]
}`;

    try {
      const response = await generate(comparisonPrompt, {
        model,
        temperature: 0.3,
        maxTokens: this.config.maxTokens
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid response format');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        variantA,
        variantB,
        scoreA,
        scoreB,
        winner: parsed.winner || (scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'tie'),
        confidence: parsed.confidence || Math.abs(scoreA - scoreB),
        analysis: parsed.analysis || '',
        recommendations: parsed.recommendations || []
      };
    } catch (error) {
      console.error('[AdvancedMetaPrompter] A/B test failed:', error);

      return {
        variantA,
        variantB,
        scoreA,
        scoreB,
        winner: scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'tie',
        confidence: Math.abs(scoreA - scoreB),
        analysis: 'Comparison based on automated scoring only.',
        recommendations: []
      };
    }
  }

  // ==========================================================================
  // PROMPT COMPRESSION
  // ==========================================================================

  /**
   * Compress a prompt while preserving semantic meaning
   */
  async compressPrompt(
    prompt: string,
    targetRatio: number = 0.7
  ): Promise<CompressionResult> {
    const model = this.config.model || selectModel('analysis');
    const isPolish = this.config.language === 'pl';
    const originalTokens = this.estimateTokens(prompt);

    const compressionPrompt = isPolish
      ? `Skompresuj ponizszy prompt zachowujac jego PELNE znaczenie semantyczne.

ORYGINALNY PROMPT:
"""
${prompt}
"""

DOCELOWA KOMPRESJA: ${Math.round(targetRatio * 100)}% oryginalnej dlugosci

ZASADY KOMPRESJI:
1. Usun zbedne slowa (bardzo, naprawde, absolutnie)
2. Polacz powtarzajace sie instrukcje
3. Uzyj list zamiast zdani opisowych
4. Zachowaj WSZYSTKIE kluczowe wymagania
5. Nie usuwaj informacji o formacie wyjscia
6. Zachowaj przyklady (skrocone jesli mozliwe)

ZWROC JSON:
{
  "compressedPrompt": "skompresowany prompt",
  "removedElements": ["lista usunietych elementow"],
  "semanticPreservation": 0.0-1.0
}`
      : `Compress the following prompt while preserving its FULL semantic meaning.

ORIGINAL PROMPT:
"""
${prompt}
"""

TARGET COMPRESSION: ${Math.round(targetRatio * 100)}% of original length

COMPRESSION RULES:
1. Remove unnecessary words (very, really, absolutely)
2. Combine repeating instructions
3. Use lists instead of descriptive sentences
4. Preserve ALL key requirements
5. Don't remove output format information
6. Keep examples (shortened if possible)

RETURN JSON:
{
  "compressedPrompt": "compressed prompt",
  "removedElements": ["list of removed elements"],
  "semanticPreservation": 0.0-1.0
}`;

    try {
      const response = await generate(compressionPrompt, {
        model,
        temperature: 0.3,
        maxTokens: this.config.maxTokens
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid response format');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const compressedTokens = this.estimateTokens(parsed.compressedPrompt);

      return {
        originalPrompt: prompt,
        compressedPrompt: parsed.compressedPrompt,
        compressionRatio: originalTokens / compressedTokens,
        semanticPreservation: parsed.semanticPreservation || 0.9,
        removedElements: parsed.removedElements || [],
        originalTokens,
        compressedTokens
      };
    } catch (error) {
      console.error('[AdvancedMetaPrompter] Compression failed:', error);

      const simpleCompressed = this.simpleCompress(prompt);

      return {
        originalPrompt: prompt,
        compressedPrompt: simpleCompressed,
        compressionRatio: prompt.length / simpleCompressed.length,
        semanticPreservation: 0.8,
        removedElements: ['Redundant whitespace', 'Filler words'],
        originalTokens,
        compressedTokens: this.estimateTokens(simpleCompressed)
      };
    }
  }

  /**
   * Simple compression fallback
   */
  private simpleCompress(prompt: string): string {
    return prompt
      .replace(/\s+/g, ' ')
      .replace(/\b(bardzo|naprawde|absolutnie|calkowicie|szczegolnie)\b/gi, '')
      .replace(/\s+([.,!?])/g, '$1')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // ==========================================================================
  // DOMAIN-SPECIFIC OPTIMIZATION
  // ==========================================================================

  /**
   * Optimize a prompt for a specific domain
   */
  async optimizeForDomain(
    prompt: string,
    domain: DomainType
  ): Promise<DomainOptimizationResult> {
    const model = this.config.model || selectModel('analysis');
    const isPolish = this.config.language === 'pl';

    const domainContext = this.getDomainContext(domain);

    const domainPrompt = isPolish
      ? `Zoptymalizuj ponizszy prompt dla domeny: ${domain}

ORYGINALNY PROMPT:
"""
${prompt}
"""

KONTEKST DOMENY:
${domainContext.description}

SLOWNICTWO DOMENOWE:
${domainContext.vocabulary.join(', ')}

BEST PRACTICES DLA TEJ DOMENY:
${domainContext.bestPractices.join('\n')}

ZADANIE:
1. Wzbogac prompt o terminologie domenowa
2. Dodaj domain-specific constraints
3. Uwzglednij typowe wzorce tej domeny
4. Zachowaj oryginalny cel prompta

ZWROC JSON:
{
  "optimizedPrompt": "zoptymalizowany prompt",
  "enhancements": ["lista wprowadzonych ulepszen"],
  "vocabularyInjected": ["lista dodanych terminow"],
  "domainRelevance": 0.0-1.0
}`
      : `Optimize the following prompt for domain: ${domain}

ORIGINAL PROMPT:
"""
${prompt}
"""

DOMAIN CONTEXT:
${domainContext.description}

DOMAIN VOCABULARY:
${domainContext.vocabulary.join(', ')}

BEST PRACTICES FOR THIS DOMAIN:
${domainContext.bestPractices.join('\n')}

TASK:
1. Enrich prompt with domain terminology
2. Add domain-specific constraints
3. Include typical patterns of this domain
4. Preserve the original goal of the prompt

RETURN JSON:
{
  "optimizedPrompt": "optimized prompt",
  "enhancements": ["list of enhancements made"],
  "vocabularyInjected": ["list of added terms"],
  "domainRelevance": 0.0-1.0
}`;

    try {
      const response = await generate(domainPrompt, {
        model,
        temperature: 0.4,
        maxTokens: this.config.maxTokens
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid response format');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        domain,
        originalPrompt: prompt,
        optimizedPrompt: parsed.optimizedPrompt || prompt,
        enhancements: parsed.enhancements || [],
        vocabularyInjected: parsed.vocabularyInjected || [],
        domainRelevance: parsed.domainRelevance || 0.7
      };
    } catch (error) {
      console.error('[AdvancedMetaPrompter] Domain optimization failed:', error);

      return {
        domain,
        originalPrompt: prompt,
        optimizedPrompt: prompt,
        enhancements: [],
        vocabularyInjected: [],
        domainRelevance: 0.5
      };
    }
  }

  /**
   * Get domain context information
   */
  private getDomainContext(domain: DomainType): {
    description: string;
    vocabulary: string[];
    bestPractices: string[];
  } {
    const domains: Record<DomainType, { description: string; vocabulary: string[]; bestPractices: string[] }> = {
      'web-development': {
        description: 'Tworzenie aplikacji webowych, frontend i backend',
        vocabulary: ['API', 'REST', 'GraphQL', 'SPA', 'SSR', 'CSR', 'responsive', 'accessibility', 'SEO', 'PWA', 'WebSocket', 'CORS', 'JWT', 'OAuth'],
        bestPractices: [
          'Uwzgledniaj rozne przegladarki i urzadzenia',
          'Pamietaj o dostepnosci (WCAG)',
          'Optymalizuj wydajnosc (Core Web Vitals)',
          'Stosuj bezpieczne praktyki (OWASP)'
        ]
      },
      'data-science': {
        description: 'Analiza danych, machine learning, statystyka',
        vocabulary: ['DataFrame', 'feature engineering', 'overfitting', 'cross-validation', 'hyperparameter', 'pipeline', 'EDA', 'correlation', 'regression', 'classification'],
        bestPractices: [
          'Zawsze rozpoczynaj od eksploracji danych (EDA)',
          'Dziel dane na train/validation/test',
          'Dokumentuj transformacje i preprocessing',
          'Wybieraj metryki odpowiednie do problemu'
        ]
      },
      'devops': {
        description: 'Infrastruktura, CI/CD, automatyzacja operacji',
        vocabulary: ['container', 'orchestration', 'pipeline', 'artifact', 'deployment', 'rollback', 'monitoring', 'alerting', 'IaC', 'GitOps', 'SRE', 'SLA/SLO'],
        bestPractices: [
          'Infrastructure as Code - wszystko w repo',
          'Immutable infrastructure',
          'Blue-green/canary deployments',
          'Comprehensive monitoring and logging'
        ]
      },
      'security': {
        description: 'Cyberbezpieczenstwo, pentesting, compliance',
        vocabulary: ['vulnerability', 'exploit', 'CVE', 'CVSS', 'zero-day', 'hardening', 'encryption', 'authentication', 'authorization', 'audit', 'compliance', 'SIEM'],
        bestPractices: [
          'Defense in depth - wiele warstw ochrony',
          'Principle of least privilege',
          'Regularne audyty i testy penetracyjne',
          'Security by design'
        ]
      },
      'mobile': {
        description: 'Aplikacje mobilne (iOS, Android, cross-platform)',
        vocabulary: ['native', 'hybrid', 'React Native', 'Flutter', 'widget', 'state management', 'push notification', 'deep linking', 'app store', 'APK', 'IPA'],
        bestPractices: [
          'Mobile-first design',
          'Optymalizacja zuzycia baterii',
          'Offline-first architecture',
          'Testowanie na roznych urzadzeniach'
        ]
      },
      'database': {
        description: 'Bazy danych, SQL, NoSQL, optymalizacja zapytan',
        vocabulary: ['index', 'query optimization', 'normalization', 'denormalization', 'sharding', 'replication', 'ACID', 'CAP theorem', 'transaction', 'deadlock', 'schema'],
        bestPractices: [
          'Projektuj schema pod query patterns',
          'Indeksuj madrze (nie wszystko)',
          'Monitoruj slow queries',
          'Planuj backup i disaster recovery'
        ]
      },
      'ai-ml': {
        description: 'Sztuczna inteligencja, deep learning, NLP, computer vision',
        vocabulary: ['neural network', 'transformer', 'attention', 'embedding', 'fine-tuning', 'inference', 'GPU', 'tensor', 'gradient descent', 'loss function', 'epoch', 'batch'],
        bestPractices: [
          'Zaczynaj od prostych baseline models',
          'Dokumentuj eksperymenty (MLflow, W&B)',
          'Monitoruj drift w production',
          'Uwzgledniaj etyczne aspekty AI'
        ]
      },
      'general': {
        description: 'Ogolne programowanie i inzynieria oprogramowania',
        vocabulary: ['algorithm', 'data structure', 'complexity', 'design pattern', 'refactoring', 'debugging', 'testing', 'documentation', 'version control', 'code review'],
        bestPractices: [
          'Clean code i SOLID principles',
          'Test-driven development',
          'Code review jako standard',
          'Continuous learning'
        ]
      }
    };

    return domains[domain] || domains['general'];
  }

  // ==========================================================================
  // FEW-SHOT INJECTION
  // ==========================================================================

  /**
   * Automatically inject relevant few-shot examples into a prompt
   */
  async injectFewShot(
    prompt: string,
    taskType?: string,
    exampleCount: number = 2
  ): Promise<string> {
    const detectedType = taskType || await this.detectTaskType(prompt);
    const exampleCategory = mapTaskTypeToExampleCategory(detectedType);

    if (!exampleCategory) {
      return prompt;
    }

    const examples = getFewShotExamples(exampleCategory, exampleCount);

    if (!examples) {
      return prompt;
    }

    const isPolish = this.config.language === 'pl';
    const header = isPolish
      ? '\n\n--- UCZ SIE Z PONIZSZYCH PRZYKLADOW ---\n'
      : '\n\n--- LEARN FROM THE FOLLOWING EXAMPLES ---\n';

    const footer = isPolish
      ? '\n--- KONIEC PRZYKLADOW ---\n\nTERAZ WYKONAJ NASTEPUJACE ZADANIE:\n\n'
      : '\n--- END OF EXAMPLES ---\n\nNOW COMPLETE THE FOLLOWING TASK:\n\n';

    return `${header}${examples}${footer}${prompt}`;
  }

  /**
   * Detect task type from prompt content
   */
  private async detectTaskType(prompt: string): Promise<string> {
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes('napraw') || lowerPrompt.includes('fix') || lowerPrompt.includes('bug')) {
      return 'code';
    }
    if (lowerPrompt.includes('przeanalizuj') || lowerPrompt.includes('review') || lowerPrompt.includes('analiz')) {
      return 'analysis';
    }
    if (lowerPrompt.includes('lista') || lowerPrompt.includes('wymien') || lowerPrompt.includes('list') || lowerPrompt.includes('zaproponuj')) {
      return 'list';
    }
    if (lowerPrompt.includes('architektur') || lowerPrompt.includes('zaprojektuj') || lowerPrompt.includes('design')) {
      return 'proposal';
    }

    return 'general';
  }

  /**
   * Generate custom few-shot examples for a specific task
   */
  async generateFewShotExamples(
    taskDescription: string,
    count: number = 3
  ): Promise<Array<{ input: string; output: string }>> {
    const model = this.config.model || selectModel('creative');
    const isPolish = this.config.language === 'pl';

    const generationPrompt = isPolish
      ? `Wygeneruj ${count} przykladow few-shot dla nastepujacego typu zadania:

OPIS ZADANIA:
${taskDescription}

Dla kazdego przykladu stworz:
1. INPUT: Konkretne zadanie tego typu
2. OUTPUT: Idealny przyklad odpowiedzi

ZWROC JSON:
{
  "examples": [
    {"input": "przyklad zadania", "output": "idealna odpowiedz"},
    ...
  ]
}`
      : `Generate ${count} few-shot examples for the following task type:

TASK DESCRIPTION:
${taskDescription}

For each example create:
1. INPUT: A specific task of this type
2. OUTPUT: An ideal example response

RETURN JSON:
{
  "examples": [
    {"input": "example task", "output": "ideal response"},
    ...
  ]
}`;

    try {
      const response = await generate(generationPrompt, {
        model,
        temperature: 0.7,
        maxTokens: this.config.maxTokens
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.examples || [];
    } catch (error) {
      console.error('[AdvancedMetaPrompter] Few-shot generation failed:', error);
      return [];
    }
  }

  // ==========================================================================
  // TEMPLATE LIBRARY ACCESS
  // ==========================================================================

  /**
   * Get the template library instance
   */
  getTemplateLibrary(): PromptTemplateLibrary {
    return this.templateLibrary;
  }

  /**
   * Apply a template with automatic few-shot injection
   */
  async applyTemplateWithFewShot(
    templateId: string,
    variables: Record<string, string>,
    injectExamples: boolean = true
  ): Promise<string> {
    let prompt = this.templateLibrary.applyTemplate(templateId, variables);

    if (injectExamples) {
      prompt = await this.injectFewShot(prompt);
    }

    return prompt;
  }

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  /**
   * Update evolution configuration
   */
  updateEvolutionConfig(config: Partial<EvolutionConfig>): void {
    this.evolutionConfig = { ...this.evolutionConfig, ...config };
  }

  /**
   * Get current evolution configuration
   */
  getEvolutionConfig(): EvolutionConfig {
    return { ...this.evolutionConfig };
  }
}
