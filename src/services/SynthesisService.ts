/**
 * GeminiHydra - Synthesis Service
 * Handles result synthesis and summarization
 */

import { ExecutionResult } from '../types/index.js';
import { MIN_SINGLE_RESULT_LENGTH, RESULT_PREVIEW_LENGTH } from '../config/constants.js';

export class SynthesisService {
  /**
   * Check if synthesis is needed or single result can be returned
   */
  needsSynthesis(results: ExecutionResult[]): boolean {
    const successResults = results.filter(r => r.success);
    
    // Single successful result with sufficient content - no synthesis needed
    if (successResults.length === 1 && 
        successResults[0].content.length > MIN_SINGLE_RESULT_LENGTH) {
      return false;
    }
    
    return true;
  }

  /**
   * Get single result if no synthesis needed
   */
  getSingleResult(results: ExecutionResult[]): string | null {
    const successResults = results.filter(r => r.success);
    
    if (successResults.length === 1 && 
        successResults[0].content.length > MIN_SINGLE_RESULT_LENGTH) {
      return successResults[0].content;
    }
    
    return null;
  }

  /**
   * Build synthesis prompt
   */
  buildPrompt(objective: string, results: ExecutionResult[]): string {
    const resultsSummary = results
      .map(r => `[#${r.id}] ${r.success ? '✓' : '✗'}: ${r.content.substring(0, RESULT_PREVIEW_LENGTH)}`)
      .join('\n\n');

    return `
CEL: ${objective}

WYNIKI AGENTÓW:
${resultsSummary}

Napisz KRÓTKIE podsumowanie po polsku:
1. Czy cel został zrealizowany?
2. Kluczowe wyniki
3. Ewentualne problemy
`;
  }
}

export const synthesisService = new SynthesisService();
