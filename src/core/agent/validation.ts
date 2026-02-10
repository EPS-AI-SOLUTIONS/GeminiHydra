/**
 * GeminiHydra - Agent Response Validation
 * Functions for evaluating response quality, confidence scoring, and code block validation.
 * Extracted from Agent.ts to reduce class complexity.
 */

export interface ConfidenceResult {
  score: number; // 0-100
  factors: { name: string; impact: number; reason: string }[];
  recommendation: string;
}

export interface CodeBlockValidation {
  valid: boolean;
  codeBlocks: { language: string; lines: number; complete: boolean }[];
  warnings: string[];
}

/**
 * Calculate confidence score for an agent's response
 */
export function calculateConfidenceScore(response: string, task: string): ConfidenceResult {
  const factors: { name: string; impact: number; reason: string }[] = [];
  let baseScore = 70; // Start with neutral-positive

  // Factor 1: Response length relative to task complexity
  const taskWords = task.split(/\s+/).length;
  const responseWords = response.split(/\s+/).length;
  const lengthRatio = responseWords / Math.max(taskWords, 1);

  if (lengthRatio < 0.5) {
    factors.push({ name: 'length', impact: -15, reason: 'Odpowiedź bardzo krótka' });
    baseScore -= 15;
  } else if (lengthRatio > 5) {
    factors.push({ name: 'length', impact: 5, reason: 'Szczegółowa odpowiedź' });
    baseScore += 5;
  }

  // Factor 2: Contains specific file paths (not generic)
  const hasSpecificPaths = /(?:src|lib|app|components)\/[\w/-]+\.\w+/.test(response);
  const hasGenericPaths = /(?:file\d+|path\/to|example\.)/.test(response);

  if (hasSpecificPaths && !hasGenericPaths) {
    factors.push({ name: 'paths', impact: 10, reason: 'Konkretne ścieżki plików' });
    baseScore += 10;
  } else if (hasGenericPaths) {
    factors.push({ name: 'paths', impact: -20, reason: 'Generyczne/fikcyjne ścieżki' });
    baseScore -= 20;
  }

  // Factor 3: Contains actual code blocks
  const codeBlockCount = (response.match(/```[\s\S]*?```/g) || []).length;
  if (codeBlockCount > 0) {
    factors.push({ name: 'code', impact: 10, reason: `${codeBlockCount} bloków kodu` });
    baseScore += Math.min(codeBlockCount * 5, 15);
  }

  // Factor 4: Contains uncertainty markers
  const uncertaintyMarkers =
    response.match(
      /\b(?:I think|maybe|probably|might|could be|myślę|prawdopodobnie|może|chyba)\b/gi,
    ) || [];
  if (uncertaintyMarkers.length > 2) {
    factors.push({ name: 'uncertainty', impact: -10, reason: 'Wiele wskaźników niepewności' });
    baseScore -= 10;
  }

  // Factor 5: Contains action evidence (EXEC, ===ZAPIS===)
  const hasExecEvidence = /EXEC:|===ZAPIS===|wykonano|created|modified|saved/.test(response);
  if (hasExecEvidence) {
    factors.push({ name: 'evidence', impact: 15, reason: 'Dowody wykonania akcji' });
    baseScore += 15;
  }

  // Factor 6: Contains "I will" / future tense (bad)
  const futureTense =
    response.match(/\b(?:I will|I would|Let me|I'll|I'm going to|Mogę|Będę|Zamierzam)\b/gi) || [];
  if (futureTense.length > 1) {
    factors.push({ name: 'future', impact: -20, reason: 'Czas przyszły zamiast wykonania' });
    baseScore -= 20;
  }

  // Clamp score to 0-100
  const score = Math.max(0, Math.min(100, baseScore));

  // Recommendation
  let recommendation: string;
  if (score >= 80) {
    recommendation = 'Wysoka pewność - odpowiedź wiarygodna';
  } else if (score >= 60) {
    recommendation = 'Średnia pewność - wymaga weryfikacji';
  } else if (score >= 40) {
    recommendation = 'Niska pewność - podejrzana odpowiedź';
  } else {
    recommendation = 'Bardzo niska pewność - prawdopodobna halucynacja';
  }

  return { score, factors, recommendation };
}

/**
 * Estimate response quality (0-1 score)
 */
export function estimateResponseQuality(response: string, prompt: string): number {
  let quality = 0.5; // Base quality

  // Length check - too short or too long reduces quality
  const responseLength = response.length;
  const promptLength = prompt.length;
  const lengthRatio = responseLength / Math.max(promptLength, 100);

  if (lengthRatio > 0.5 && lengthRatio < 5) {
    quality += 0.1; // Good length ratio
  } else if (lengthRatio < 0.1 || lengthRatio > 20) {
    quality -= 0.2; // Suspicious length
  }

  // Check for code blocks if code-related task
  const hasCodeBlocks = response.includes('```');
  const isCodeTask =
    prompt.toLowerCase().includes('kod') ||
    prompt.toLowerCase().includes('code') ||
    prompt.toLowerCase().includes('function') ||
    prompt.toLowerCase().includes('implement');
  if (isCodeTask && hasCodeBlocks) {
    quality += 0.15;
  }

  // Check for structure (headers, lists)
  if (response.includes('##') || response.includes('- ') || response.includes('1.')) {
    quality += 0.1; // Has structure
  }

  // Check for error indicators
  if (
    response.toLowerCase().includes('error') ||
    response.toLowerCase().includes('cannot') ||
    response.toLowerCase().includes('unable')
  ) {
    quality -= 0.1;
  }

  // Check for JSON if expected
  const expectsJson = prompt.toLowerCase().includes('json');
  if (expectsJson) {
    try {
      // Try to find and parse JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        JSON.parse(jsonMatch[0]);
        quality += 0.2; // Valid JSON found
      }
    } catch {
      quality -= 0.1; // Invalid JSON when expected
    }
  }

  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, quality));
}

/**
 * Validate code blocks in a response
 */
export function validateCodeBlocks(response: string): CodeBlockValidation {
  const warnings: string[] = [];
  const codeBlocks: { language: string; lines: number; complete: boolean }[] = [];

  // Extract code blocks (```language ... ```)
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let match: RegExpExecArray | null = codeBlockRegex.exec(response);

  while (match !== null) {
    const language = match[1] || 'unknown';
    const code = match[2];
    const lines = code.split('\n').length;

    // Check for truncation indicators
    const truncationPatterns = [
      /\.\.\.$/m, // Ends with ...
      /\/\/ \.\.\./m, // // ...
      /# \.\.\./m, // # ...
      /\/\* \.\.\. \*\//m, // /* ... */
      /\.\.\. more code/i, // ... more code
      /\.\.\. kontynuacja/i, // ... kontynuacja
      /\(truncated\)/i, // (truncated)
      /\(skrócone\)/i, // (skrócone)
    ];

    const isTruncated = truncationPatterns.some((p) => p.test(code));

    // Check for incomplete syntax
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    const openParens = (code.match(/\(/g) || []).length;
    const closeParens = (code.match(/\)/g) || []).length;

    const hasUnbalancedBraces = Math.abs(openBraces - closeBraces) > 1;
    const hasUnbalancedParens = Math.abs(openParens - closeParens) > 2;

    const complete = !isTruncated && !hasUnbalancedBraces && !hasUnbalancedParens;

    codeBlocks.push({ language, lines, complete });

    if (isTruncated) {
      warnings.push(`Blok kodu ${language} wygląda na obcięty`);
    }
    if (hasUnbalancedBraces) {
      warnings.push(`Blok kodu ${language} ma niezbalansowane nawiasy {}`);
    }
    if (hasUnbalancedParens) {
      warnings.push(`Blok kodu ${language} ma niezbalansowane nawiasy ()`);
    }

    match = codeBlockRegex.exec(response);
  }

  // Check for code without proper blocks
  if (codeBlocks.length === 0 && response.includes('function ')) {
    warnings.push('Kod bez bloku ``` może być źle sformatowany');
  }

  return {
    valid: warnings.length === 0,
    codeBlocks,
    warnings,
  };
}
