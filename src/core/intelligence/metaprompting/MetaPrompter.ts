/**
 * MetaPrompter - Base class for prompt engineering through AI
 *
 * Uses AI to analyze, optimize, and generate prompts,
 * implementing meta-prompting techniques for improved LLM interactions.
 *
 * Methods:
 * - optimizePrompt: Improve an existing prompt
 * - generatePromptForTask: Generate an optimal prompt from scratch
 * - analyzePromptWeaknesses: Find issues in a prompt
 * - combinePrompts: Merge multiple prompts into one
 *
 * @module core/intelligence/metaprompting/MetaPrompter
 */

import { generate, selectModel } from '../../GeminiCLI.js';
import type { PromptOptimization, MetaPromptingConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

/**
 * MetaPrompter - Class for advanced prompt engineering through AI
 */
export class MetaPrompter {
  protected config: MetaPromptingConfig;

  constructor(config: Partial<MetaPromptingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Optimize an existing prompt based on context
   */
  async optimizePrompt(prompt: string, context: string): Promise<PromptOptimization> {
    const model = this.config.model || selectModel('analysis');
    const isPolish = this.config.language === 'pl';

    const metaPrompt = isPolish
      ? `Jestes ekspertem w inzynierii promptow (prompt engineering).

ZADANIE: Przeanalizuj i ulepsz ponizszy prompt, aby uzyskac lepsze wyniki z modeli jezykowych.

ORYGINALNY PROMPT:
"""
${prompt}
"""

KONTEKST ZADANIA:
${context || 'Brak dodatkowego kontekstu'}

ZASADY OPTYMALIZACJI:
1. Dodaj jasne instrukcje strukturalne
2. Usun niejednoznacznosci
3. Dodaj format oczekiwanej odpowiedzi
4. Uwzglednij edge cases
5. Uzyj technik Chain-of-Thought jesli stosowne
6. Zachowaj oryginalny cel prompta

ZWROC ODPOWIEDZ W FORMACIE JSON:
{
  "optimizedPrompt": "ulepszona wersja prompta",
  "improvements": ["lista ulepszen wprowadzonych"],
  "expectedGain": 0.0-1.0
}

Zwroc TYLKO JSON, bez dodatkowych komentarzy.`
      : `You are an expert in prompt engineering.

TASK: Analyze and improve the following prompt to achieve better results from language models.

ORIGINAL PROMPT:
"""
${prompt}
"""

TASK CONTEXT:
${context || 'No additional context provided'}

OPTIMIZATION RULES:
1. Add clear structural instructions
2. Remove ambiguities
3. Add expected response format
4. Consider edge cases
5. Use Chain-of-Thought techniques if appropriate
6. Preserve the original intent of the prompt

RETURN RESPONSE IN JSON FORMAT:
{
  "optimizedPrompt": "improved version of the prompt",
  "improvements": ["list of improvements made"],
  "expectedGain": 0.0-1.0
}

Return ONLY JSON, no additional comments.`;

    try {
      const response = await generate(metaPrompt, {
        model,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens
      });

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid response format - no JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        originalPrompt: prompt,
        optimizedPrompt: parsed.optimizedPrompt || prompt,
        improvements: parsed.improvements || [],
        expectedGain: Math.max(0, Math.min(1, parsed.expectedGain || 0.5))
      };
    } catch (error) {
      console.error('[MetaPrompter] Optimization failed:', error);
      return {
        originalPrompt: prompt,
        optimizedPrompt: prompt,
        improvements: [],
        expectedGain: 0
      };
    }
  }

  /**
   * Generate an optimal prompt for a given task description
   */
  async generatePromptForTask(taskDescription: string): Promise<string> {
    const model = this.config.model || selectModel('creative');
    const isPolish = this.config.language === 'pl';

    const metaPrompt = isPolish
      ? `Jestes ekspertem w tworzeniu promptow dla modeli jezykowych AI.

OPIS ZADANIA:
${taskDescription}

WYGENERUJ OPTYMALNY PROMPT, ktory:
1. Jest jasny i precyzyjny
2. Zawiera kontekst potrzebny do wykonania zadania
3. Okresla oczekiwany format odpowiedzi
4. Uzywa technik prompt engineering (few-shot, CoT, role-playing)
5. Uwzglednia potencjalne edge cases
6. Jest napisany w jezyku polskim

TECHNIKI DO ROZWAZENIA:
- Role-playing: "Jestes ekspertem w..."
- Chain-of-Thought: "Przeanalizuj krok po kroku..."
- Few-shot: Daj przyklady oczekiwanego wyniku
- Structured output: Zdefiniuj format odpowiedzi
- Constraints: Okresl ograniczenia i zasady

ZWROC TYLKO WYGENEROWANY PROMPT (bez dodatkowych komentarzy):`
      : `You are an expert in creating prompts for AI language models.

TASK DESCRIPTION:
${taskDescription}

GENERATE AN OPTIMAL PROMPT that:
1. Is clear and precise
2. Contains context needed for the task
3. Specifies expected response format
4. Uses prompt engineering techniques (few-shot, CoT, role-playing)
5. Considers potential edge cases
6. Is written in English

TECHNIQUES TO CONSIDER:
- Role-playing: "You are an expert in..."
- Chain-of-Thought: "Analyze step by step..."
- Few-shot: Provide examples of expected output
- Structured output: Define response format
- Constraints: Specify limitations and rules

RETURN ONLY THE GENERATED PROMPT (no additional comments):`;

    try {
      const response = await generate(metaPrompt, {
        model,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens
      });

      return response.trim();
    } catch (error) {
      console.error('[MetaPrompter] Prompt generation failed:', error);
      return isPolish
        ? `Wykonaj nastepujace zadanie:\n\n${taskDescription}\n\nOdpowiedz szczegolowo i precyzyjnie.`
        : `Complete the following task:\n\n${taskDescription}\n\nRespond with detailed and precise output.`;
    }
  }

  /**
   * Analyze weaknesses in a prompt
   */
  async analyzePromptWeaknesses(prompt: string): Promise<string[]> {
    const model = this.config.model || selectModel('analysis');
    const isPolish = this.config.language === 'pl';

    const metaPrompt = isPolish
      ? `Jestes ekspertem w analizie promptow dla modeli jezykowych.

PROMPT DO ANALIZY:
"""
${prompt}
"""

ZNAJDZ SLABOSCI tego prompta, uwzgledniajac:
1. Niejednoznacznosc - czy instrukcje sa jasne?
2. Brak kontekstu - czy model ma wystarczajace informacje?
3. Niejasny format - czy oczekiwany wynik jest okreslony?
4. Zbyt ogolne instrukcje - czy zadanie jest konkretne?
5. Brak przykladow - czy przyklady poprawilyby zrozumienie?
6. Problemy jezykowe - czy sformulowania sa precyzyjne?
7. Brak ograniczen - czy sa jasne granice?
8. Potencjalne halucynacje - czy cos moze prowadzic do nieprawdziwych odpowiedzi?
9. Brak Chain-of-Thought - czy rozumowanie powinno byc jawne?
10. Konflikt instrukcji - czy instrukcje sie nie wykluczaja?

ZWROC ODPOWIEDZ W FORMACIE JSON:
{
  "weaknesses": ["lista slabosci ze szczegolowymi opisami"]
}

Zwroc TYLKO JSON, bez dodatkowych komentarzy.`
      : `You are an expert in analyzing prompts for language models.

PROMPT TO ANALYZE:
"""
${prompt}
"""

FIND WEAKNESSES in this prompt, considering:
1. Ambiguity - are instructions clear?
2. Lack of context - does the model have enough information?
3. Unclear format - is expected output specified?
4. Too general instructions - is the task specific?
5. Lack of examples - would examples improve understanding?
6. Language issues - are formulations precise?
7. Missing constraints - are there clear boundaries?
8. Potential hallucinations - could something lead to false responses?
9. Missing Chain-of-Thought - should reasoning be explicit?
10. Conflicting instructions - do any instructions contradict each other?

RETURN RESPONSE IN JSON FORMAT:
{
  "weaknesses": ["list of weaknesses with detailed descriptions"]
}

Return ONLY JSON, no additional comments.`;

    try {
      const response = await generate(metaPrompt, {
        model,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid response format - no JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.weaknesses || [];
    } catch (error) {
      console.error('[MetaPrompter] Weakness analysis failed:', error);
      return [];
    }
  }

  /**
   * Combine multiple prompts into a single optimized prompt
   */
  async combinePrompts(prompts: string[]): Promise<string> {
    if (prompts.length === 0) {
      return '';
    }

    if (prompts.length === 1) {
      return prompts[0];
    }

    const model = this.config.model || selectModel('creative');
    const isPolish = this.config.language === 'pl';

    const promptsList = prompts.map((p, i) => `PROMPT ${i + 1}:\n"""\n${p}\n"""`).join('\n\n');

    const metaPrompt = isPolish
      ? `Jestes ekspertem w inzynierii promptow.

ZADANIE: Polacz ponizsze prompty w jeden optymalny prompt, biorac najlepsze elementy z kazdego.

${promptsList}

ZASADY LACZENIA:
1. Zidentyfikuj wspolny cel wszystkich promptow
2. Wybierz najlepsze sformulowania z kazdego
3. Usun redundancje i sprzecznosci
4. Zachowaj unikalne wartosciowe elementy
5. Utworz spojny, dobrze zorganizowany prompt
6. Dodaj brakujace elementy (format, przyklady) jesli potrzebne

KRYTERIA WYBORU NAJLEPSZYCH ELEMENTOW:
- Jasnosc i precyzja instrukcji
- Konkretnosc zadan
- Kompletnosc kontekstu
- Okreslony format wyjscia
- Przyklady i ograniczenia

ZWROC TYLKO POLACZONY PROMPT (bez dodatkowych komentarzy):`
      : `You are an expert in prompt engineering.

TASK: Combine the following prompts into a single optimal prompt, taking the best elements from each.

${promptsList}

COMBINATION RULES:
1. Identify common goal of all prompts
2. Select best formulations from each
3. Remove redundancies and contradictions
4. Keep unique valuable elements
5. Create a coherent, well-organized prompt
6. Add missing elements (format, examples) if needed

CRITERIA FOR SELECTING BEST ELEMENTS:
- Clarity and precision of instructions
- Specificity of tasks
- Completeness of context
- Defined output format
- Examples and constraints

RETURN ONLY THE COMBINED PROMPT (no additional comments):`;

    try {
      const response = await generate(metaPrompt, {
        model,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens
      });

      return response.trim();
    } catch (error) {
      console.error('[MetaPrompter] Prompt combination failed:', error);
      return prompts.join('\n\n---\n\n');
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MetaPromptingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): MetaPromptingConfig {
    return { ...this.config };
  }
}
