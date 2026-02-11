/**
 * PromptInjectionDetector - Solution 27
 *
 * Detects and blocks prompt injection attempts in agent responses.
 * Provides multi-layer defense against prompt manipulation attacks.
 *
 * Features:
 * - Pattern-based detection for common injection techniques
 * - Hidden instruction detection (markdown, comments, encoded text)
 * - Role-switching attempt detection
 * - Content sanitization with severity classification
 * - Configurable detection sensitivity
 */

import chalk from 'chalk';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

/**
 * Severity levels for detected injections
 */
export type InjectionSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Result of injection detection analysis
 */
export interface InjectionResult {
  /** Whether an injection attempt was detected */
  detected: boolean;
  /** List of patterns that matched */
  patterns: string[];
  /** Severity level of the detection */
  severity: InjectionSeverity;
  /** Content with injections removed/neutralized */
  sanitizedContent: string;
  /** Detailed detection breakdown */
  details: InjectionDetail[];
  /** Overall risk score (0-100) */
  riskScore: number;
  /** Recommended action */
  action: 'allow' | 'warn' | 'block' | 'quarantine';
}

/**
 * Detailed information about a single detection
 */
export interface InjectionDetail {
  /** Type of injection detected */
  type: InjectionType;
  /** The pattern that matched */
  pattern: string;
  /** The matched content */
  matchedContent: string;
  /** Position in the content */
  position: { start: number; end: number };
  /** Severity of this specific detection */
  severity: InjectionSeverity;
  /** Description of the threat */
  description: string;
}

/**
 * Types of injection attacks
 */
export type InjectionType =
  | 'instruction_override' // "ignore previous instructions"
  | 'system_prompt_injection' // "new system prompt"
  | 'role_switching' // "you are now"
  | 'jailbreak_attempt' // jailbreak patterns
  | 'hidden_instruction' // hidden in markdown/comments
  | 'encoded_payload' // base64, unicode obfuscation
  | 'delimiter_attack' // breaking out of context
  | 'context_manipulation' // manipulating conversation context
  | 'privilege_escalation' // attempting admin/system access
  | 'data_exfiltration'; // attempting to extract data

/**
 * Configuration for the detector
 */
export interface DetectorConfig {
  /** Enable/disable specific detection types */
  enabledChecks: Partial<Record<InjectionType, boolean>>;
  /** Minimum severity to flag */
  minSeverity: InjectionSeverity;
  /** Custom patterns to add */
  customPatterns: InjectionPattern[];
  /** Patterns to whitelist (won't trigger detection) */
  whitelist: RegExp[];
  /** Whether to log detections */
  logDetections: boolean;
  /** Action thresholds by risk score */
  thresholds: {
    warn: number;
    block: number;
    quarantine: number;
  };
}

/**
 * A pattern for injection detection
 */
export interface InjectionPattern {
  /** Pattern name */
  name: string;
  /** Regex pattern to match */
  pattern: RegExp;
  /** Type of injection this detects */
  type: InjectionType;
  /** Severity if matched */
  severity: InjectionSeverity;
  /** Description of what this pattern detects */
  description: string;
  /** Risk score contribution (0-100) */
  riskScore: number;
}

// ============================================================================
// DEFAULT PATTERNS
// ============================================================================

/**
 * Comprehensive injection detection patterns
 */
const DEFAULT_INJECTION_PATTERNS: InjectionPattern[] = [
  // === INSTRUCTION OVERRIDE PATTERNS (HIGH SEVERITY) ===
  {
    name: 'ignore_previous',
    pattern: /ignore\s+(all\s+)?previous\s+(instructions?|prompts?|rules?|constraints?)/gi,
    type: 'instruction_override',
    severity: 'high',
    description: 'Attempt to override previous instructions',
    riskScore: 80,
  },
  {
    name: 'disregard_above',
    pattern: /disregard\s+(everything|all|the)\s+(above|before|previous)/gi,
    type: 'instruction_override',
    severity: 'high',
    description: 'Attempt to disregard prior context',
    riskScore: 80,
  },
  {
    name: 'forget_instructions',
    pattern: /forget\s+(all\s+)?(your|the|previous)\s+(instructions?|rules?|training)/gi,
    type: 'instruction_override',
    severity: 'high',
    description: 'Attempt to make AI forget instructions',
    riskScore: 85,
  },
  {
    name: 'override_directive',
    pattern:
      /override\s+(all\s+)?(safety|security|previous)\s+(measures?|directives?|protocols?)/gi,
    type: 'instruction_override',
    severity: 'critical',
    description: 'Explicit override attempt',
    riskScore: 95,
  },
  {
    name: 'new_instructions',
    pattern: /(?:here\s+are\s+)?(?:your\s+)?new\s+instructions?\s*:/gi,
    type: 'instruction_override',
    severity: 'high',
    description: 'Attempt to inject new instructions',
    riskScore: 85,
  },

  // === SYSTEM PROMPT INJECTION (CRITICAL SEVERITY) ===
  {
    name: 'system_prompt_start',
    pattern: /\[\s*(?:system|SYSTEM)\s*(?:prompt|message|instruction)?\s*\]/gi,
    type: 'system_prompt_injection',
    severity: 'critical',
    description: 'Fake system prompt marker',
    riskScore: 90,
  },
  {
    name: 'system_colon',
    pattern: /^(?:system|SYSTEM)\s*:\s*.+/gm,
    type: 'system_prompt_injection',
    severity: 'high',
    description: 'System role injection attempt',
    riskScore: 85,
  },
  {
    name: 'developer_mode',
    pattern: /(?:enable|enter|activate)\s+(?:developer|dev|admin|root)\s+mode/gi,
    type: 'system_prompt_injection',
    severity: 'critical',
    description: 'Developer mode activation attempt',
    riskScore: 95,
  },
  {
    name: 'system_override',
    pattern: /\[SYSTEM\s+OVERRIDE\]/gi,
    type: 'system_prompt_injection',
    severity: 'critical',
    description: 'System override tag',
    riskScore: 100,
  },

  // === ROLE SWITCHING (HIGH SEVERITY) ===
  {
    name: 'you_are_now',
    pattern: /you\s+are\s+now\s+(?:a|an|the)?\s*(?!going|about|ready)/gi,
    type: 'role_switching',
    severity: 'high',
    description: 'Role switching attempt',
    riskScore: 75,
  },
  {
    name: 'act_as',
    pattern: /(?:from\s+now\s+on\s+)?act\s+(?:as|like)\s+(?:a|an|the)?/gi,
    type: 'role_switching',
    severity: 'medium',
    description: 'Role acting instruction',
    riskScore: 60,
  },
  {
    name: 'pretend_to_be',
    pattern: /pretend\s+(?:to\s+be|you\s+are|you're)\s+(?:a|an|the)?/gi,
    type: 'role_switching',
    severity: 'medium',
    description: 'Pretend instruction',
    riskScore: 55,
  },
  {
    name: 'roleplay_as',
    pattern: /roleplay\s+as\s+(?:a|an|the)?/gi,
    type: 'role_switching',
    severity: 'medium',
    description: 'Roleplay instruction',
    riskScore: 50,
  },
  {
    name: 'assume_identity',
    pattern: /assume\s+(?:the\s+)?(?:role|identity|persona)\s+of/gi,
    type: 'role_switching',
    severity: 'high',
    description: 'Identity assumption attempt',
    riskScore: 70,
  },

  // === JAILBREAK ATTEMPTS (CRITICAL) ===
  {
    name: 'dan_jailbreak',
    pattern: /\bDAN\b.*(?:do\s+anything\s+now|jailbreak)/gi,
    type: 'jailbreak_attempt',
    severity: 'critical',
    description: 'DAN jailbreak pattern',
    riskScore: 100,
  },
  {
    name: 'jailbreak_keyword',
    pattern: /jailbreak(?:ing|ed)?\s+(?:the\s+)?(?:ai|model|system|assistant)/gi,
    type: 'jailbreak_attempt',
    severity: 'critical',
    description: 'Explicit jailbreak mention',
    riskScore: 95,
  },
  {
    name: 'unlock_abilities',
    pattern: /unlock\s+(?:your|all|hidden)\s+(?:abilities|capabilities|potential)/gi,
    type: 'jailbreak_attempt',
    severity: 'high',
    description: 'Capability unlock attempt',
    riskScore: 80,
  },
  {
    name: 'no_restrictions',
    pattern:
      /(?:without|ignore|bypass|disable)\s+(?:any\s+)?(?:restrictions?|limitations?|filters?|safeguards?)/gi,
    type: 'jailbreak_attempt',
    severity: 'critical',
    description: 'Restriction bypass attempt',
    riskScore: 90,
  },

  // === HIDDEN INSTRUCTIONS ===
  {
    name: 'html_comment_instruction',
    pattern: /<!--\s*(?:instruction|command|execute|system)[:\s].*?-->/gis,
    type: 'hidden_instruction',
    severity: 'high',
    description: 'Hidden instruction in HTML comment',
    riskScore: 75,
  },
  {
    name: 'markdown_hidden',
    pattern: /\[(?:hidden|invisible|secret)\]:\s*#\s*\(.+?\)/gi,
    type: 'hidden_instruction',
    severity: 'high',
    description: 'Hidden markdown reference',
    riskScore: 70,
  },
  {
    name: 'zero_width_chars',
    pattern: /[\u200B-\u200D\uFEFF\u2060\u180E]/g,
    type: 'hidden_instruction',
    severity: 'medium',
    description: 'Zero-width characters detected',
    riskScore: 50,
  },
  {
    name: 'invisible_text',
    pattern:
      /<span[^>]*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0)[^>]*>.*?<\/span>/gis,
    type: 'hidden_instruction',
    severity: 'high',
    description: 'Invisible text in HTML',
    riskScore: 75,
  },

  // === ENCODED PAYLOADS ===
  {
    name: 'base64_instruction',
    pattern: /(?:decode|execute|run)\s+(?:this\s+)?base64[:\s]+[A-Za-z0-9+/=]{20,}/gi,
    type: 'encoded_payload',
    severity: 'high',
    description: 'Base64 encoded instruction',
    riskScore: 80,
  },
  {
    name: 'unicode_escape',
    pattern: /(?:\\u[0-9a-fA-F]{4}){5,}/g,
    type: 'encoded_payload',
    severity: 'medium',
    description: 'Unicode escape sequence chain',
    riskScore: 55,
  },
  {
    name: 'hex_encoded',
    pattern: /(?:0x[0-9a-fA-F]{2}){10,}/g,
    type: 'encoded_payload',
    severity: 'medium',
    description: 'Hex encoded data',
    riskScore: 50,
  },

  // === DELIMITER ATTACKS ===
  {
    name: 'triple_backtick_break',
    pattern: /```\s*(?:end|exit|break|escape)\s*```/gi,
    type: 'delimiter_attack',
    severity: 'high',
    description: 'Code block delimiter attack',
    riskScore: 70,
  },
  {
    name: 'prompt_delimiter',
    pattern: /(?:###|===|---)\s*(?:END|STOP|BREAK)\s*(?:OF\s+)?(?:PROMPT|INSTRUCTION|SYSTEM)/gi,
    type: 'delimiter_attack',
    severity: 'high',
    description: 'Prompt delimiter injection',
    riskScore: 75,
  },
  {
    name: 'xml_tag_injection',
    pattern: /<\/?(?:system|user|assistant|prompt|instruction)[^>]*>/gi,
    type: 'delimiter_attack',
    severity: 'high',
    description: 'XML tag injection for context manipulation',
    riskScore: 80,
  },

  // === CONTEXT MANIPULATION ===
  {
    name: 'conversation_reset',
    pattern: /(?:reset|clear|erase)\s+(?:the\s+)?(?:conversation|context|memory|history)/gi,
    type: 'context_manipulation',
    severity: 'medium',
    description: 'Conversation reset attempt',
    riskScore: 60,
  },
  {
    name: 'start_over',
    pattern:
      /(?:let's\s+)?start\s+(?:over|fresh|anew)\s+(?:with\s+)?(?:new\s+)?(?:instructions?)?/gi,
    type: 'context_manipulation',
    severity: 'medium',
    description: 'Context restart attempt',
    riskScore: 55,
  },

  // === PRIVILEGE ESCALATION ===
  {
    name: 'admin_access',
    pattern:
      /(?:give|grant)\s+(?:me\s+)?(?:admin|root|superuser|elevated)\s+(?:access|privileges?|permissions?)/gi,
    type: 'privilege_escalation',
    severity: 'critical',
    description: 'Admin privilege request',
    riskScore: 90,
  },
  {
    name: 'sudo_mode',
    pattern: /(?:enable|enter|activate)\s+(?:sudo|admin|root)\s+mode/gi,
    type: 'privilege_escalation',
    severity: 'critical',
    description: 'Sudo mode activation',
    riskScore: 95,
  },

  // === DATA EXFILTRATION ===
  {
    name: 'reveal_prompt',
    pattern:
      /(?:reveal|show|tell|display|output)\s+(?:me\s+)?(?:your\s+)?(?:system\s+)?(?:prompt|instructions?|rules?)/gi,
    type: 'data_exfiltration',
    severity: 'high',
    description: 'System prompt reveal request',
    riskScore: 75,
  },
  {
    name: 'extract_training',
    pattern: /(?:extract|reveal|show)\s+(?:your\s+)?(?:training\s+)?(?:data|weights|parameters)/gi,
    type: 'data_exfiltration',
    severity: 'high',
    description: 'Training data extraction attempt',
    riskScore: 80,
  },
  {
    name: 'repeat_everything',
    pattern: /repeat\s+(?:everything|all)\s+(?:you\s+)?(?:know|have|were\s+told)/gi,
    type: 'data_exfiltration',
    severity: 'medium',
    description: 'Information dump request',
    riskScore: 60,
  },
];

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: DetectorConfig = {
  enabledChecks: {
    instruction_override: true,
    system_prompt_injection: true,
    role_switching: true,
    jailbreak_attempt: true,
    hidden_instruction: true,
    encoded_payload: true,
    delimiter_attack: true,
    context_manipulation: true,
    privilege_escalation: true,
    data_exfiltration: true,
  },
  minSeverity: 'low',
  customPatterns: [],
  whitelist: [],
  logDetections: true,
  thresholds: {
    warn: 40,
    block: 70,
    quarantine: 90,
  },
};

// ============================================================================
// PROMPT INJECTION DETECTOR CLASS
// ============================================================================

/**
 * PromptInjectionDetector - Detects and sanitizes prompt injection attempts
 */
export class PromptInjectionDetector {
  private config: DetectorConfig;
  private patterns: InjectionPattern[];
  private detectionHistory: Map<string, InjectionResult[]> = new Map();

  constructor(config: Partial<DetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.patterns = [...DEFAULT_INJECTION_PATTERNS, ...this.config.customPatterns];
  }

  /**
   * Detect prompt injection attempts in content
   */
  detectInjection(content: string): InjectionResult {
    const details: InjectionDetail[] = [];
    const matchedPatterns: string[] = [];
    let totalRiskScore = 0;

    // Skip if content is empty
    if (!content || content.trim().length === 0) {
      return this.createSafeResult(content);
    }

    // Check each pattern
    for (const patternDef of this.patterns) {
      // Skip disabled checks
      if (!this.config.enabledChecks[patternDef.type]) {
        continue;
      }

      // Skip patterns below minimum severity
      if (!this.meetsMinSeverity(patternDef.severity)) {
        continue;
      }

      // Reset regex lastIndex for global patterns
      patternDef.pattern.lastIndex = 0;

      // Find all matches
      for (
        let match = patternDef.pattern.exec(content);
        match !== null;
        match = patternDef.pattern.exec(content)
      ) {
        // Check whitelist
        if (this.isWhitelisted(match[0])) {
          continue;
        }

        details.push({
          type: patternDef.type,
          pattern: patternDef.name,
          matchedContent: match[0],
          position: { start: match.index, end: match.index + match[0].length },
          severity: patternDef.severity,
          description: patternDef.description,
        });

        matchedPatterns.push(patternDef.name);
        totalRiskScore += patternDef.riskScore;

        // Prevent infinite loops for zero-width matches
        if (match[0].length === 0) {
          patternDef.pattern.lastIndex++;
        }
      }
    }

    // Additional checks
    const additionalDetails = this.performAdditionalChecks(content);
    details.push(...additionalDetails);
    totalRiskScore += additionalDetails.reduce(
      (sum, d) => sum + this.getSeverityScore(d.severity),
      0,
    );

    // Determine overall severity
    const severity = this.calculateOverallSeverity(details);

    // Determine action
    const action = this.determineAction(totalRiskScore);

    // Create sanitized content
    const sanitizedContent = this.sanitize(content, details);

    const result: InjectionResult = {
      detected: details.length > 0,
      patterns: [...new Set(matchedPatterns)],
      severity,
      sanitizedContent,
      details,
      riskScore: Math.min(100, totalRiskScore),
      action,
    };

    // Log detection if enabled
    if (this.config.logDetections && result.detected) {
      this.logDetection(result);
    }

    return result;
  }

  /**
   * Sanitize content by removing or neutralizing detected injections
   */
  sanitize(content: string, details?: InjectionDetail[]): string {
    if (!details) {
      const result = this.detectInjection(content);
      details = result.details;
    }

    if (details.length === 0) {
      return content;
    }

    let sanitized = content;

    // Sort by position (descending) to replace from end to start
    const sortedDetails = [...details].sort((a, b) => b.position.start - a.position.start);

    for (const detail of sortedDetails) {
      const before = sanitized.substring(0, detail.position.start);
      const after = sanitized.substring(detail.position.end);

      // Replace based on severity
      switch (detail.severity) {
        case 'critical':
        case 'high':
          // Remove completely
          sanitized = before + after;
          break;
        case 'medium':
          // Replace with placeholder
          sanitized = `${before}[REDACTED]${after}`;
          break;
        case 'low':
          // Escape/neutralize
          sanitized = before + this.escapeContent(detail.matchedContent) + after;
          break;
      }
    }

    // Additional sanitization
    sanitized = this.sanitizeHiddenCharacters(sanitized);
    sanitized = this.sanitizeEncodedContent(sanitized);

    return sanitized;
  }

  /**
   * Quick check if content is likely safe (for performance)
   */
  quickCheck(content: string): boolean {
    // Fast checks for obvious patterns
    const quickPatterns = [
      /ignore\s+previous/i,
      /system\s*:/i,
      /\[system\]/i,
      /you\s+are\s+now/i,
      /jailbreak/i,
      /DAN/,
    ];

    return !quickPatterns.some((p) => p.test(content));
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DetectorConfig>): void {
    this.config = { ...this.config, ...config };
    this.patterns = [...DEFAULT_INJECTION_PATTERNS, ...this.config.customPatterns];
  }

  /**
   * Add custom pattern
   */
  addPattern(pattern: InjectionPattern): void {
    this.config.customPatterns.push(pattern);
    this.patterns.push(pattern);
  }

  /**
   * Add whitelist pattern
   */
  addWhitelist(pattern: RegExp): void {
    this.config.whitelist.push(pattern);
  }

  /**
   * Get detection statistics
   */
  getStatistics(): {
    totalDetections: number;
    byType: Record<InjectionType, number>;
    bySeverity: Record<InjectionSeverity, number>;
    recentDetections: InjectionResult[];
  } {
    const allDetections = Array.from(this.detectionHistory.values()).flat();
    const byType: Record<InjectionType, number> = {} as Record<InjectionType, number>;
    const bySeverity: Record<InjectionSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const detection of allDetections) {
      for (const detail of detection.details) {
        byType[detail.type] = (byType[detail.type] || 0) + 1;
        bySeverity[detail.severity]++;
      }
    }

    return {
      totalDetections: allDetections.length,
      byType,
      bySeverity,
      recentDetections: allDetections.slice(-10),
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createSafeResult(content: string): InjectionResult {
    return {
      detected: false,
      patterns: [],
      severity: 'low',
      sanitizedContent: content,
      details: [],
      riskScore: 0,
      action: 'allow',
    };
  }

  private meetsMinSeverity(severity: InjectionSeverity): boolean {
    const severityOrder: InjectionSeverity[] = ['low', 'medium', 'high', 'critical'];
    return severityOrder.indexOf(severity) >= severityOrder.indexOf(this.config.minSeverity);
  }

  private isWhitelisted(content: string): boolean {
    return this.config.whitelist.some((pattern) => pattern.test(content));
  }

  private performAdditionalChecks(content: string): InjectionDetail[] {
    const details: InjectionDetail[] = [];

    // Check for suspicious character sequences
    const suspiciousSequences = this.detectSuspiciousSequences(content);
    details.push(...suspiciousSequences);

    // Check for base64-encoded content that might contain instructions
    const base64Checks = this.checkBase64Content(content);
    details.push(...base64Checks);

    // Check for homoglyph attacks
    const homoglyphChecks = this.checkHomoglyphs(content);
    details.push(...homoglyphChecks);

    return details;
  }

  private detectSuspiciousSequences(content: string): InjectionDetail[] {
    const details: InjectionDetail[] = [];

    // BUG-004 FIX: Check for repeated special characters that might be delimiter attacks
    // EXCLUDING common formatting characters used in reports:
    // - Box drawing: ═ ─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ (Unicode U+2500-U+257F)
    // - Horizontal lines commonly used in markdown/ASCII art
    const repeatedChars = /([#*_`~]{10,})/g; // Removed = and - which are common in reports
    for (
      let match = repeatedChars.exec(content);
      match !== null;
      match = repeatedChars.exec(content)
    ) {
      // Additional check: skip if it looks like a markdown header or separator
      const context = content.substring(
        Math.max(0, match.index - 5),
        match.index + match[0].length + 5,
      );
      const isMarkdownFormatting = /^[\s\n]*(#{1,6}\s|[-=]{3,}\s*$)/m.test(context);

      if (!isMarkdownFormatting) {
        details.push({
          type: 'delimiter_attack',
          pattern: 'repeated_special_chars',
          matchedContent: match[0],
          position: { start: match.index, end: match.index + match[0].length },
          severity: 'low',
          description: 'Repeated special characters (potential delimiter attack)',
        });
      }
    }

    return details;
  }

  private checkBase64Content(content: string): InjectionDetail[] {
    const details: InjectionDetail[] = [];

    // Look for base64-like strings
    const base64Pattern = /[A-Za-z0-9+/]{40,}={0,2}/g;

    for (
      let match = base64Pattern.exec(content);
      match !== null;
      match = base64Pattern.exec(content)
    ) {
      try {
        const decoded = atob(match[0]);
        // Check if decoded content contains injection patterns
        const quickResult = this.quickCheck(decoded);
        if (!quickResult) {
          details.push({
            type: 'encoded_payload',
            pattern: 'base64_hidden_injection',
            matchedContent: `${match[0].substring(0, 50)}...`,
            position: { start: match.index, end: match.index + match[0].length },
            severity: 'high',
            description: 'Base64 encoded content contains potential injection',
          });
        }
      } catch {
        // Not valid base64, ignore
      }
    }

    return details;
  }

  private checkHomoglyphs(content: string): InjectionDetail[] {
    const details: InjectionDetail[] = [];

    // Common homoglyph replacements
    const homoglyphPatterns = [
      { char: '\u0430', latin: 'a' }, // Cyrillic а
      { char: '\u0435', latin: 'e' }, // Cyrillic е
      { char: '\u043E', latin: 'o' }, // Cyrillic о
      { char: '\u0440', latin: 'p' }, // Cyrillic р
      { char: '\u0441', latin: 'c' }, // Cyrillic с
      { char: '\u0445', latin: 'x' }, // Cyrillic х
      { char: '\u0443', latin: 'y' }, // Cyrillic у
    ];

    for (const { char, latin } of homoglyphPatterns) {
      const index = content.indexOf(char);
      if (index !== -1) {
        details.push({
          type: 'encoded_payload',
          pattern: 'homoglyph_attack',
          matchedContent: `Cyrillic '${char}' instead of Latin '${latin}'`,
          position: { start: index, end: index + 1 },
          severity: 'medium',
          description: 'Homoglyph character detected (potential obfuscation)',
        });
      }
    }

    return details;
  }

  private calculateOverallSeverity(details: InjectionDetail[]): InjectionSeverity {
    if (details.length === 0) return 'low';

    const severities = details.map((d) => d.severity);

    if (severities.includes('critical')) return 'critical';
    if (severities.includes('high')) return 'high';
    if (severities.includes('medium')) return 'medium';
    return 'low';
  }

  private getSeverityScore(severity: InjectionSeverity): number {
    switch (severity) {
      case 'critical':
        return 40;
      case 'high':
        return 25;
      case 'medium':
        return 15;
      case 'low':
        return 5;
    }
  }

  private determineAction(riskScore: number): 'allow' | 'warn' | 'block' | 'quarantine' {
    const { thresholds } = this.config;

    if (riskScore >= thresholds.quarantine) return 'quarantine';
    if (riskScore >= thresholds.block) return 'block';
    if (riskScore >= thresholds.warn) return 'warn';
    return 'allow';
  }

  private escapeContent(content: string): string {
    // Escape special characters to neutralize potential injection
    return content
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/:/g, '&#58;');
  }

  private sanitizeHiddenCharacters(content: string): string {
    // Remove zero-width and invisible characters
    return content.replace(/[\u200B-\u200D\uFEFF\u2060\u180E\u00AD]/g, '');
  }

  private sanitizeEncodedContent(content: string): string {
    // Normalize unicode escape sequences
    return content.replace(/\\u([0-9a-fA-F]{4})/g, (_match, code) => {
      const charCode = parseInt(code, 16);
      // Only allow printable ASCII range
      if (charCode >= 32 && charCode <= 126) {
        return String.fromCharCode(charCode);
      }
      return '';
    });
  }

  private logDetection(result: InjectionResult): void {
    const severityColor = {
      low: chalk.yellow,
      medium: chalk.hex('#FFA500'),
      high: chalk.red,
      critical: chalk.bgRed.white,
    };

    console.log(
      severityColor[result.severity](
        `[PromptInjectionDetector] ${result.severity.toUpperCase()} - ` +
          `Detected ${result.details.length} potential injection(s), ` +
          `Risk Score: ${result.riskScore}, Action: ${result.action}`,
      ),
    );

    for (const detail of result.details) {
      console.log(
        chalk.gray(`  - ${detail.type}: ${detail.description} ` + `(pattern: ${detail.pattern})`),
      );
    }

    // Store in history
    const key = new Date().toISOString().split('T')[0];
    const existing = this.detectionHistory.get(key) || [];
    existing.push(result);
    this.detectionHistory.set(key, existing);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Default singleton instance of PromptInjectionDetector
 */
export const promptInjectionDetector = new PromptInjectionDetector();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick detection function
 */
export function detectInjection(content: string): InjectionResult {
  return promptInjectionDetector.detectInjection(content);
}

/**
 * Quick sanitization function
 */
export function sanitizeInjection(content: string): string {
  return promptInjectionDetector.sanitize(content);
}

/**
 * Quick safety check (fast, for performance-critical paths)
 */
export function isContentSafe(content: string): boolean {
  return promptInjectionDetector.quickCheck(content);
}

/**
 * Process agent response with injection detection
 */
export function processAgentResponse(response: string): {
  safe: boolean;
  content: string;
  warning?: string;
} {
  const result = promptInjectionDetector.detectInjection(response);

  if (!result.detected) {
    return { safe: true, content: response };
  }

  switch (result.action) {
    case 'allow':
      return { safe: true, content: response };

    case 'warn':
      return {
        safe: true,
        content: response,
        warning: `Low-risk injection patterns detected (risk: ${result.riskScore})`,
      };

    case 'block':
      return {
        safe: false,
        content: result.sanitizedContent,
        warning: `Injection attempt blocked (risk: ${result.riskScore})`,
      };

    case 'quarantine':
      return {
        safe: false,
        content: '[Content quarantined due to critical injection attempt]',
        warning: `Critical injection attempt quarantined (risk: ${result.riskScore})`,
      };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  PromptInjectionDetector,
  promptInjectionDetector,
  detectInjection,
  sanitizeInjection,
  isContentSafe,
  processAgentResponse,
};
