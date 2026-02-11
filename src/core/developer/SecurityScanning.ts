/**
 * SecurityScanning.ts - Feature #36: Security Scanning
 *
 * Scans code for security vulnerabilities using AI-powered analysis.
 * Detects common security issues including:
 * - Injection vulnerabilities (SQL, Command, XSS)
 * - Authentication/Authorization issues
 * - Sensitive data exposure
 * - Insecure configurations
 * - Known vulnerable patterns
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import 'dotenv/config';
import { GEMINI_MODELS } from '../../config/models.config.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const QUALITY_MODEL = GEMINI_MODELS.FLASH;

// ============================================================
// Types
// ============================================================

export interface SecurityVulnerability {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string; // OWASP category or CWE
  title: string;
  description: string;
  location: string;
  cwe?: string;
  remediation: string;
  references?: string[];
}

export interface SecurityScanResult {
  file: string;
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  vulnerabilities: SecurityVulnerability[];
  securePatterns: string[];
  recommendations: string[];
}

// ============================================================
// Prompts
// ============================================================

const SECURITY_SCAN_PROMPT = `You are a security expert. Scan the following code for security vulnerabilities.

FILE: {filename}

CODE:
\`\`\`
{code}
\`\`\`

Provide security analysis in JSON format:
{
  "riskLevel": "safe|low|medium|high|critical",
  "vulnerabilities": [
    {
      "severity": "low|medium|high|critical",
      "type": "OWASP category (e.g., Injection, XSS, CSRF)",
      "title": "Short vulnerability title",
      "description": "What the vulnerability is",
      "location": "file:line or function",
      "cwe": "CWE-XXX if applicable",
      "remediation": "How to fix it",
      "references": ["link to more info"]
    }
  ],
  "securePatterns": ["Good security practices found in the code"],
  "recommendations": ["General security recommendations"]
}

Focus on real security issues. Check for:
- Injection vulnerabilities (SQL, Command, XSS)
- Authentication/Authorization issues
- Sensitive data exposure
- Insecure configurations
- Known vulnerable patterns`;

// ============================================================
// Core Functions
// ============================================================

/**
 * Scans code for security vulnerabilities
 * @param code - Source code to scan
 * @param filename - Name of the file being scanned
 * @returns Security scan results including vulnerabilities and recommendations
 */
export async function scanSecurity(code: string, filename: string): Promise<SecurityScanResult> {
  console.log(chalk.cyan(`[Security] Scanning ${filename}...`));

  const prompt = SECURITY_SCAN_PROMPT.replace('{filename}', filename).replace('{code}', code);

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

    // Add IDs
    const vulnerabilities = (parsed.vulnerabilities || []).map((v: unknown, i: number) => ({
      ...(v as Record<string, unknown>),
      id: `vuln-${i + 1}`,
    }));

    const criticalCount = vulnerabilities.filter(
      (v: Record<string, unknown>) => v.severity === 'critical',
    ).length;
    const highCount = vulnerabilities.filter(
      (v: Record<string, unknown>) => v.severity === 'high',
    ).length;

    if (criticalCount > 0) {
      console.log(
        chalk.red(`[Security] CRITICAL: ${criticalCount} critical vulnerabilities found!`),
      );
    } else if (highCount > 0) {
      console.log(chalk.yellow(`[Security] WARNING: ${highCount} high severity issues found`));
    } else {
      console.log(chalk.green(`[Security] Risk level: ${parsed.riskLevel}`));
    }

    return {
      file: filename,
      riskLevel: parsed.riskLevel || 'low',
      vulnerabilities,
      securePatterns: parsed.securePatterns || [],
      recommendations: parsed.recommendations || [],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[Security] Scan failed: ${msg}`));
    return {
      file: filename,
      riskLevel: 'low',
      vulnerabilities: [],
      securePatterns: [],
      recommendations: [],
    };
  }
}

// ============================================================
// Formatting Functions
// ============================================================

/**
 * Formats security scan results for display
 * @param result - Security scan result to format
 * @returns Formatted string for console output
 */
export function formatSecurityScan(result: SecurityScanResult): string {
  const lines: string[] = [];

  // Header
  const riskColors: Record<string, (text: string) => string> = {
    safe: chalk.green,
    low: chalk.blue,
    medium: chalk.yellow,
    high: chalk.red,
    critical: chalk.bgRed.white,
  };

  const colorFn = riskColors[result.riskLevel] || chalk.white;
  lines.push(chalk.cyan(`\n🔒 SECURITY SCAN: ${result.file}`));
  lines.push(colorFn(`   Risk Level: ${result.riskLevel.toUpperCase()}`));
  lines.push('');

  // Vulnerabilities by severity
  const critical = result.vulnerabilities.filter((v) => v.severity === 'critical');
  const high = result.vulnerabilities.filter((v) => v.severity === 'high');
  const medium = result.vulnerabilities.filter((v) => v.severity === 'medium');
  const low = result.vulnerabilities.filter((v) => v.severity === 'low');

  if (critical.length > 0) {
    lines.push(chalk.bgRed.white(' CRITICAL VULNERABILITIES '));
    critical.forEach((v) => {
      lines.push(chalk.red(`  [${v.id}] ${v.title}`));
      lines.push(chalk.gray(`      Type: ${v.type}${v.cwe ? ` (${v.cwe})` : ''}`));
      lines.push(chalk.gray(`      Location: ${v.location}`));
      lines.push(chalk.white(`      ${v.description}`));
      lines.push(chalk.green(`      Fix: ${v.remediation}`));
      lines.push('');
    });
  }

  if (high.length > 0) {
    lines.push(chalk.red('🔴 HIGH SEVERITY:'));
    high.forEach((v) => {
      lines.push(`   [${v.id}] ${v.title} (${v.type})`);
      lines.push(chalk.gray(`   → ${v.remediation}`));
    });
    lines.push('');
  }

  if (medium.length > 0) {
    lines.push(chalk.yellow('🟡 MEDIUM SEVERITY:'));
    medium.forEach((v) => {
      lines.push(`   [${v.id}] ${v.title}`);
    });
    lines.push('');
  }

  if (low.length > 0) {
    lines.push(chalk.blue('🔵 LOW SEVERITY:'));
    low.forEach((v) => {
      lines.push(`   [${v.id}] ${v.title}`);
    });
    lines.push('');
  }

  // Secure patterns found
  if (result.securePatterns.length > 0) {
    lines.push(chalk.green('✅ SECURE PATTERNS FOUND:'));
    for (const p of result.securePatterns) lines.push(`   • ${p}`);
    lines.push('');
  }

  // Recommendations
  if (result.recommendations.length > 0) {
    lines.push(chalk.cyan('💡 RECOMMENDATIONS:'));
    for (const r of result.recommendations) lines.push(`   • ${r}`);
  }

  return lines.join('\n');
}

// ============================================================
// Default Export
// ============================================================

export default {
  scanSecurity,
  formatSecurityScan,
};
