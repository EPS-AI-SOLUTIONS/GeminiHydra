/**
 * TestGeneration.ts - Feature #32: Test Generation
 *
 * Automatically generates unit tests for code.
 * Supports multiple testing frameworks and languages.
 *
 * Part of DeveloperTools module refactoring.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import 'dotenv/config';
import { GEMINI_MODELS } from '../../config/models.config.js';

import { detectLanguage } from './CodeReview.js';

// ============================================================
// Configuration
// ============================================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const QUALITY_MODEL = GEMINI_MODELS.FLASH;

// ============================================================
// Interfaces
// ============================================================

export interface GeneratedTest {
  name: string;
  description: string;
  code: string;
  coverage: string[];
}

export interface TestGenerationResult {
  targetFile: string;
  testFile: string;
  framework: string;
  tests: GeneratedTest[];
  setupCode?: string;
  teardownCode?: string;
}

export interface TestGenerationOptions {
  framework?: string;
  language?: string;
}

// ============================================================
// Prompt Template
// ============================================================

const TEST_GENERATION_PROMPT = `You are an expert test engineer. Generate comprehensive unit tests for the following code.

FILE: {filename}
LANGUAGE: {language}
FRAMEWORK: {framework}

CODE TO TEST:
\`\`\`{language}
{code}
\`\`\`

Generate tests in the following JSON format:
{
  "tests": [
    {
      "name": "test name",
      "description": "what this test verifies",
      "code": "full test code",
      "coverage": ["function/method names covered"]
    }
  ],
  "setupCode": "any setup/beforeEach code needed",
  "teardownCode": "any cleanup/afterEach code needed"
}

Guidelines:
- Test edge cases and error conditions
- Use descriptive test names
- Include both positive and negative tests
- Mock external dependencies
- Aim for high coverage`;

// ============================================================
// Helper Functions
// ============================================================

/**
 * Returns the default test framework for a given programming language.
 * @param language - The programming language
 * @returns The recommended test framework name
 */
export function getDefaultTestFramework(language: string): string {
  const frameworks: Record<string, string> = {
    typescript: 'vitest',
    javascript: 'jest',
    python: 'pytest',
    rust: 'cargo test',
    go: 'testing',
    java: 'junit',
    csharp: 'xunit',
  };
  return frameworks[language] || 'unknown';
}

/**
 * Generates the test file name based on the source file name.
 * @param filename - The source file name
 * @returns The corresponding test file name
 */
export function getTestFileName(filename: string): string {
  return filename.replace(/\.(ts|js|py)$/, `.test.$1`);
}

// ============================================================
// Core Functions
// ============================================================

/**
 * Generates unit tests for the provided code.
 * @param code - The source code to generate tests for
 * @param filename - The name of the source file
 * @param options - Optional configuration (framework, language)
 * @returns A TestGenerationResult with generated tests
 */
export async function generateTests(
  code: string,
  filename: string,
  options: TestGenerationOptions = {},
): Promise<TestGenerationResult> {
  const language = options.language || detectLanguage(filename);
  const framework = options.framework || getDefaultTestFramework(language);

  console.log(chalk.cyan(`[TestGen] Generating tests for ${filename} using ${framework}...`));

  const prompt = TEST_GENERATION_PROMPT.replace('{filename}', filename)
    .replace(/{language}/g, language)
    .replace('{framework}', framework)
    .replace('{code}', code);

  try {
    const model = genAI.getGenerativeModel({
      model: QUALITY_MODEL,
      generationConfig: { temperature: 1.0, maxOutputTokens: 8192 }, // Temperature locked at 1.0 for Gemini - do not change
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const jsonStr = responseText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(jsonStr);

    const testFile = getTestFileName(filename);

    console.log(chalk.green(`[TestGen] Generated ${parsed.tests?.length || 0} tests`));

    return {
      targetFile: filename,
      testFile,
      framework,
      tests: parsed.tests || [],
      setupCode: parsed.setupCode,
      teardownCode: parsed.teardownCode,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[TestGen] Failed: ${msg}`));
    return {
      targetFile: filename,
      testFile: getTestFileName(filename),
      framework,
      tests: [],
    };
  }
}

/**
 * Formats the test generation result into a human-readable string.
 * @param result - The TestGenerationResult to format
 * @returns A formatted string representation
 */
export function formatGeneratedTests(result: TestGenerationResult): string {
  const lines: string[] = [];

  lines.push(chalk.cyan(`\n[TEST GENERATION] ${result.targetFile}`));
  lines.push(chalk.gray(`   Framework: ${result.framework}`));
  lines.push(chalk.gray(`   Output: ${result.testFile}`));
  lines.push('');

  if (result.setupCode) {
    lines.push(chalk.yellow('Setup:'));
    lines.push(result.setupCode);
    lines.push('');
  }

  for (const test of result.tests) {
    lines.push(chalk.green(`[+] ${test.name}`));
    lines.push(chalk.gray(`  ${test.description}`));
    lines.push(chalk.gray(`  Covers: ${test.coverage.join(', ')}`));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generates the full test file content from the test generation result.
 * @param result - The TestGenerationResult
 * @returns The complete test file content as a string
 */
export function generateTestFileContent(result: TestGenerationResult): string {
  const lines: string[] = [];

  // Add framework-specific imports
  if (result.framework === 'vitest') {
    lines.push(`import { describe, it, expect, beforeEach, afterEach } from 'vitest';`);
  } else if (result.framework === 'jest') {
    lines.push(`// Jest test file`);
  } else if (result.framework === 'pytest') {
    lines.push(`import pytest`);
  }

  lines.push('');

  // Add setup code
  if (result.setupCode) {
    lines.push(result.setupCode);
    lines.push('');
  }

  // Add test cases
  for (const test of result.tests) {
    lines.push(`// ${test.description}`);
    lines.push(test.code);
    lines.push('');
  }

  // Add teardown code
  if (result.teardownCode) {
    lines.push(result.teardownCode);
  }

  return lines.join('\n');
}

// ============================================================
// Default Export
// ============================================================

export default {
  generateTests,
  formatGeneratedTests,
  generateTestFileContent,
  getDefaultTestFramework,
  getTestFileName,
};
