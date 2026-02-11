/**
 * CodeReview.ts - Feature #31: Code Review Agent
 *
 * Automated code review with actionable feedback.
 * Analyzes code for bugs, security issues, performance problems,
 * style violations, and maintainability concerns.
 *
 * Part of DeveloperTools module refactoring.
 */

import path from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import 'dotenv/config';
import { GEMINI_MODELS } from '../../config/models.config.js';

// ============================================================
// Configuration
// ============================================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const QUALITY_MODEL = GEMINI_MODELS.FLASH;

// ============================================================
// Interfaces
// ============================================================

export interface CodeReviewIssue {
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  category: 'bug' | 'security' | 'performance' | 'style' | 'maintainability' | 'best-practice';
  line?: number;
  lineEnd?: number;
  message: string;
  suggestion?: string;
  code?: string;
}

export interface CodeReviewResult {
  file: string;
  language: string;
  score: number; // 0-100
  issues: CodeReviewIssue[];
  summary: string;
  positives: string[];
  recommendations: string[];
}

// ============================================================
// Prompt Template
// ============================================================

const CODE_REVIEW_PROMPT = `You are an expert code reviewer. Analyze the following code and provide detailed feedback.

FILE: {filename}
LANGUAGE: {language}

CODE:
\`\`\`{language}
{code}
\`\`\`

Provide your review in the following JSON format:
{
  "score": 0-100,
  "issues": [
    {
      "severity": "critical|major|minor|suggestion",
      "category": "bug|security|performance|style|maintainability|best-practice",
      "line": number or null,
      "message": "Description of the issue",
      "suggestion": "How to fix it",
      "code": "suggested code fix if applicable"
    }
  ],
  "summary": "Overall assessment in 2-3 sentences",
  "positives": ["Good things about the code"],
  "recommendations": ["High-level recommendations"]
}

Be thorough but fair. Focus on real issues, not nitpicking.`;

// ============================================================
// Helper Functions
// ============================================================

/**
 * Detects the programming language based on file extension.
 * @param filename - The name of the file to analyze
 * @returns The detected language name
 */
export function detectLanguage(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.sql': 'sql',
    '.sh': 'bash',
    '.ps1': 'powershell',
  };
  return langMap[ext] || 'unknown';
}

// ============================================================
// Core Functions
// ============================================================

/**
 * Reviews code and provides detailed feedback with issues and recommendations.
 * @param code - The source code to review
 * @param filename - The name of the file being reviewed
 * @param language - Optional language override (auto-detected if not provided)
 * @returns A CodeReviewResult with score, issues, and recommendations
 */
export async function reviewCode(
  code: string,
  filename: string,
  language?: string,
): Promise<CodeReviewResult> {
  const detectedLanguage = language || detectLanguage(filename);

  console.log(chalk.cyan(`[CodeReview] Reviewing ${filename} (${detectedLanguage})...`));

  const prompt = CODE_REVIEW_PROMPT.replace('{filename}', filename)
    .replace(/{language}/g, detectedLanguage)
    .replace('{code}', code);

  try {
    const model = genAI.getGenerativeModel({
      model: QUALITY_MODEL,
      generationConfig: { temperature: 1.0, maxOutputTokens: 4096 }, // Temperature locked at 1.0 for Gemini - do not change
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON response
    const jsonStr = responseText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(jsonStr);

    console.log(
      chalk.gray(`[CodeReview] Score: ${parsed.score}/100, Issues: ${parsed.issues?.length || 0}`),
    );

    return {
      file: filename,
      language: detectedLanguage,
      score: parsed.score || 70,
      issues: parsed.issues || [],
      summary: parsed.summary || 'Review completed',
      positives: parsed.positives || [],
      recommendations: parsed.recommendations || [],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[CodeReview] Failed: ${msg}`));
    return {
      file: filename,
      language: detectedLanguage,
      score: 0,
      issues: [],
      summary: `Review failed: ${msg}`,
      positives: [],
      recommendations: [],
    };
  }
}

/**
 * Formats a code review result into a human-readable string with colors.
 * @param review - The CodeReviewResult to format
 * @returns A formatted string representation of the review
 */
export function formatCodeReview(review: CodeReviewResult): string {
  const lines: string[] = [];

  // Header
  const scoreColor =
    review.score >= 80 ? chalk.green : review.score >= 60 ? chalk.yellow : chalk.red;
  lines.push(chalk.cyan(`\n[CODE REVIEW] ${review.file}`));
  lines.push(scoreColor(`   Score: ${review.score}/100`));
  lines.push('');

  // Summary
  lines.push(chalk.white(review.summary));
  lines.push('');

  // Issues by severity
  const criticalIssues = review.issues.filter((i) => i.severity === 'critical');
  const majorIssues = review.issues.filter((i) => i.severity === 'major');
  const minorIssues = review.issues.filter((i) => i.severity === 'minor');

  if (criticalIssues.length > 0) {
    lines.push(chalk.red('[!] CRITICAL ISSUES:'));
    criticalIssues.forEach((i) => {
      lines.push(`   Line ${i.line || '?'}: ${i.message}`);
      if (i.suggestion) lines.push(chalk.gray(`   -> ${i.suggestion}`));
    });
    lines.push('');
  }

  if (majorIssues.length > 0) {
    lines.push(chalk.yellow('[*] MAJOR ISSUES:'));
    majorIssues.forEach((i) => {
      lines.push(`   Line ${i.line || '?'}: ${i.message}`);
      if (i.suggestion) lines.push(chalk.gray(`   -> ${i.suggestion}`));
    });
    lines.push('');
  }

  if (minorIssues.length > 0) {
    lines.push(chalk.blue('[i] MINOR ISSUES:'));
    minorIssues.forEach((i) => {
      lines.push(`   Line ${i.line || '?'}: ${i.message}`);
    });
    lines.push('');
  }

  // Positives
  if (review.positives.length > 0) {
    lines.push(chalk.green('[+] POSITIVES:'));
    for (const p of review.positives) lines.push(`   - ${p}`);
    lines.push('');
  }

  // Recommendations
  if (review.recommendations.length > 0) {
    lines.push(chalk.cyan('[>] RECOMMENDATIONS:'));
    for (const r of review.recommendations) lines.push(`   - ${r}`);
  }

  return lines.join('\n');
}

// ============================================================
// Default Export
// ============================================================

export default {
  reviewCode,
  formatCodeReview,
  detectLanguage,
};
