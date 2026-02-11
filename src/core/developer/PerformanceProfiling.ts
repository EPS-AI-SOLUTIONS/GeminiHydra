/**
 * PerformanceProfiling.ts - Feature #35: Performance Profiling
 *
 * Analyzes code for performance issues including:
 * - Memory leaks and inefficient memory usage
 * - CPU-intensive operations
 * - I/O bottlenecks
 * - Network inefficiencies
 * - Algorithm complexity issues
 *
 * Part of DeveloperTools module refactoring.
 */

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

export type PerformanceSeverity = 'info' | 'warning' | 'critical';

export type PerformanceCategory = 'memory' | 'cpu' | 'io' | 'network' | 'algorithm';

export interface PerformanceIssue {
  severity: PerformanceSeverity;
  category: PerformanceCategory;
  location: string;
  description: string;
  impact: string;
  suggestion: string;
}

export interface PerformanceHotspot {
  location: string;
  description: string;
}

export interface PerformanceOptimization {
  current: string;
  suggested: string;
  improvement: string;
}

export interface PerformanceProfile {
  file: string;
  overallScore: number; // 0-100
  issues: PerformanceIssue[];
  hotspots: PerformanceHotspot[];
  optimizations: PerformanceOptimization[];
}

// ============================================================
// Prompt Template
// ============================================================

const PERFORMANCE_PROMPT = `You are a performance optimization expert. Analyze the following code for performance issues.

FILE: {filename}

CODE:
\`\`\`
{code}
\`\`\`

Provide analysis in JSON format:
{
  "overallScore": 0-100,
  "issues": [
    {
      "severity": "info|warning|critical",
      "category": "memory|cpu|io|network|algorithm",
      "location": "line or function name",
      "description": "what the issue is",
      "impact": "how it affects performance",
      "suggestion": "how to fix"
    }
  ],
  "hotspots": [
    {"location": "function/line", "description": "why this is a hotspot"}
  ],
  "optimizations": [
    {"current": "current code pattern", "suggested": "better pattern", "improvement": "expected improvement"}
  ]
}

Focus on real performance issues, not micro-optimizations.`;

// ============================================================
// Core Functions
// ============================================================

/**
 * Profiles code for performance issues and optimization opportunities.
 * @param code - The source code to profile
 * @param filename - The name of the source file
 * @returns A PerformanceProfile with issues, hotspots, and optimizations
 */
export async function profilePerformance(
  code: string,
  filename: string,
): Promise<PerformanceProfile> {
  console.log(chalk.cyan(`[Performance] Profiling ${filename}...`));

  const prompt = PERFORMANCE_PROMPT.replace('{filename}', filename).replace('{code}', code);

  try {
    const model = genAI.getGenerativeModel({
      model: QUALITY_MODEL,
      generationConfig: { temperature: 1.0, maxOutputTokens: 4096 }, // Temperature locked at 1.0 for Gemini - do not change
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const jsonStr = responseText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(jsonStr);

    console.log(
      chalk.green(
        `[Performance] Score: ${parsed.overallScore}/100, Issues: ${parsed.issues?.length || 0}`,
      ),
    );

    return {
      file: filename,
      overallScore: parsed.overallScore || 70,
      issues: parsed.issues || [],
      hotspots: parsed.hotspots || [],
      optimizations: parsed.optimizations || [],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[Performance] Profiling failed: ${msg}`));
    return {
      file: filename,
      overallScore: 0,
      issues: [],
      hotspots: [],
      optimizations: [],
    };
  }
}

/**
 * Formats the performance profile into a human-readable string.
 * @param profile - The PerformanceProfile to format
 * @returns A formatted string representation
 */
export function formatPerformanceProfile(profile: PerformanceProfile): string {
  const lines: string[] = [];

  // Header with score
  const scoreColor =
    profile.overallScore >= 80
      ? chalk.green
      : profile.overallScore >= 60
        ? chalk.yellow
        : chalk.red;

  lines.push(chalk.cyan(`\n[PERFORMANCE PROFILE] ${profile.file}`));
  lines.push(scoreColor(`   Score: ${profile.overallScore}/100`));
  lines.push('');

  // Critical issues
  const criticalIssues = profile.issues.filter((i) => i.severity === 'critical');
  const warningIssues = profile.issues.filter((i) => i.severity === 'warning');
  const infoIssues = profile.issues.filter((i) => i.severity === 'info');

  if (criticalIssues.length > 0) {
    lines.push(chalk.red('[!] CRITICAL PERFORMANCE ISSUES:'));
    criticalIssues.forEach((i) => {
      lines.push(`   [${i.category.toUpperCase()}] ${i.location}`);
      lines.push(chalk.gray(`      ${i.description}`));
      lines.push(chalk.gray(`      Impact: ${i.impact}`));
      lines.push(chalk.green(`      Fix: ${i.suggestion}`));
    });
    lines.push('');
  }

  if (warningIssues.length > 0) {
    lines.push(chalk.yellow('[*] WARNINGS:'));
    warningIssues.forEach((i) => {
      lines.push(`   [${i.category.toUpperCase()}] ${i.location}`);
      lines.push(chalk.gray(`      ${i.description}`));
      lines.push(chalk.green(`      Fix: ${i.suggestion}`));
    });
    lines.push('');
  }

  if (infoIssues.length > 0) {
    lines.push(chalk.blue('[i] SUGGESTIONS:'));
    infoIssues.forEach((i) => {
      lines.push(`   [${i.category.toUpperCase()}] ${i.location}: ${i.description}`);
    });
    lines.push('');
  }

  // Hotspots
  if (profile.hotspots.length > 0) {
    lines.push(chalk.magenta('[~] PERFORMANCE HOTSPOTS:'));
    profile.hotspots.forEach((h) => {
      lines.push(`   ${h.location}: ${h.description}`);
    });
    lines.push('');
  }

  // Optimizations
  if (profile.optimizations.length > 0) {
    lines.push(chalk.cyan('[>] OPTIMIZATION OPPORTUNITIES:'));
    profile.optimizations.forEach((o) => {
      lines.push(chalk.gray(`   Current: ${o.current}`));
      lines.push(chalk.green(`   Better:  ${o.suggested}`));
      lines.push(chalk.white(`   Improvement: ${o.improvement}`));
      lines.push('');
    });
  }

  return lines.join('\n');
}

/**
 * Filters issues by category.
 * @param profile - The PerformanceProfile
 * @param category - The category to filter by
 * @returns Filtered list of issues
 */
export function filterIssuesByCategory(
  profile: PerformanceProfile,
  category: PerformanceCategory,
): PerformanceIssue[] {
  return profile.issues.filter((i) => i.category === category);
}

/**
 * Gets a summary of issues by category.
 * @param profile - The PerformanceProfile
 * @returns A record of category counts
 */
export function getIssueSummaryByCategory(
  profile: PerformanceProfile,
): Record<PerformanceCategory, number> {
  const summary: Record<PerformanceCategory, number> = {
    memory: 0,
    cpu: 0,
    io: 0,
    network: 0,
    algorithm: 0,
  };

  profile.issues.forEach((issue) => {
    summary[issue.category]++;
  });

  return summary;
}

/**
 * Calculates a weighted severity score for the profile.
 * @param profile - The PerformanceProfile
 * @returns A severity score (higher = more severe issues)
 */
export function calculateSeverityScore(profile: PerformanceProfile): number {
  const weights: Record<PerformanceSeverity, number> = {
    info: 1,
    warning: 3,
    critical: 10,
  };

  return profile.issues.reduce((score, issue) => {
    return score + weights[issue.severity];
  }, 0);
}

/**
 * Checks if the profile has any critical issues.
 * @param profile - The PerformanceProfile
 * @returns True if there are critical issues
 */
export function hasCriticalIssues(profile: PerformanceProfile): boolean {
  return profile.issues.some((i) => i.severity === 'critical');
}

// ============================================================
// Default Export
// ============================================================

export default {
  profilePerformance,
  formatPerformanceProfile,
  filterIssuesByCategory,
  getIssueSummaryByCategory,
  calculateSeverityScore,
  hasCriticalIssues,
};
