/**
 * GeminiHydra - Prompt Classifier
 * Automatically classifies prompts and routes to appropriate agents
 */

import type {
  AgentRole,
  ModelTier,
  ComplexityLevel,
  ClassificationResult,
  ComplexityAnalysis
} from '../../types/swarm.js';
import { AGENT_SPECS, MODEL_TIERS, getAgentsByTier } from './definitions.js';

/**
 * Keywords for agent matching - weighted by priority
 * Higher priority keywords (2-word phrases, domain-specific terms) come first
 */
const AGENT_KEYWORDS: Record<AgentRole, string[]> = {
  // Commander
  dijkstra: [
    'project roadmap', 'migration strategy', 'sprint backlog', 'team tasks',
    'plan the', 'create a strategy', 'coordinate the', 'manage the',
    'orchestrate', 'assign', 'delegate', 'workflow', 'roadmap'
  ],

  // Coordinators
  regis: [
    'research the', 'market trends', 'latest developments', 'root cause',
    'research', 'investigate', 'study the', 'developments in',
    'analyze the', 'what are the'
  ],
  yennefer: [
    'system architecture', 'microservices structure', 'software design',
    'design the system', 'design the architecture', 'plan the software design',
    'codebase', 'refactor the codebase', 'architecture', 'refactor the', 'synthesize',
    'design', 'structure', 'microservice', 'components'
  ],
  jaskier: [
    'summarize this', 'write documentation', 'create a changelog', 'explain this',
    'summarize', 'documentation', 'changelog', 'explain',
    'present the', 'describe to'
  ],

  // Executors
  geralt: [
    'security vulnerabilities', 'authentication system', 'encryption implementation',
    'security threats', 'authentication bug',
    'security', 'vulnerability', 'vulnerabilities', 'authentication',
    'encrypt', 'audit', 'secure'
  ],
  triss: [
    'unit tests', 'test suite', 'integration tests', 'failing test',
    'add coverage', 'write tests',
    'test', 'tests', 'testing', 'coverage', 'spec'
  ],
  vesemir: [
    'pull request', 'best practices', 'code quality', 'good practice',
    'review this', 'review the', 'mentor me',
    'review', 'mentor', 'best practice', 'evaluate', 'critique'
  ],
  ciri: [
    'quickly format', 'fast answer', 'help me briefly', 'simple question',
    'quick', 'fast', 'quickly', 'briefly', 'simple'
  ],
  eskel: [
    'deploy the', 'ci/cd pipeline', 'docker containers', 'kubernetes manifest',
    'set up infrastructure', 'terraform',
    'deploy', 'ci/cd', 'docker', 'kubernetes', 'infrastructure', 'pipeline'
  ],
  lambert: [
    'debug this', 'application performance', 'function slow', 'trace the bug',
    'troubleshoot the',
    'debug', 'profile', 'performance', 'slow', 'troubleshoot', 'trace'
  ],
  zoltan: [
    'sql query', 'database schema', 'database query', 'create a migration',
    'postgresql indexes',
    'database', 'sql', 'schema', 'query', 'migration', 'postgresql', 'postgres'
  ],
  philippa: [
    'api endpoint', 'external service', 'rest api', 'webhooks for',
    'payment gateway',
    'api', 'endpoint', 'webhook', 'rest', 'graphql', 'integrate with', 'gateway'
  ]
};

/**
 * Technical terms for complexity analysis
 */
const TECHNICAL_TERMS = [
  'algorithm', 'microservice', 'distributed', 'concurrent', 'async',
  'polymorphism', 'inheritance', 'encapsulation', 'abstraction',
  'dependency injection', 'middleware', 'cache', 'queue', 'stream',
  'transaction', 'idempotent', 'stateless', 'scalable', 'resilient',
  'kubernetes', 'docker', 'terraform', 'ansible', 'prometheus',
  'graphql', 'grpc', 'websocket', 'oauth', 'jwt', 'ssl', 'tls',
  'nosql', 'mongodb', 'postgres', 'redis', 'elasticsearch',
  'react', 'vue', 'angular', 'nextjs', 'typescript', 'rust'
];

/**
 * Code indicators
 */
const CODE_PATTERNS = [
  /```[\s\S]*?```/,           // Code blocks
  /`[^`]+`/,                   // Inline code
  /function\s+\w+/,            // Function declarations
  /class\s+\w+/,               // Class declarations
  /const\s+\w+\s*=/,           // Const declarations
  /import\s+.*from/,           // ES imports
  /require\s*\(/,              // CommonJS requires
  /\w+\.\w+\(/,                // Method calls
  /=>\s*{/,                    // Arrow functions
  /if\s*\(/,                   // Conditionals
  /for\s*\(/,                  // Loops
];

/**
 * Multi-task indicators
 */
const MULTI_TASK_PATTERNS = [
  /\d+\./,                     // Numbered lists
  /first.*then/i,              // Sequential tasks
  /and\s+also/i,               // Multiple requirements
  /additionally/i,             // Added requirements
  /\bstep\s+\d/i,              // Step references
  /phase\s+\d/i,               // Phase references
];

/**
 * Analyze prompt complexity
 */
export function analyzeComplexity(prompt: string): ComplexityAnalysis {
  const lowerPrompt = prompt.toLowerCase();
  const words = prompt.split(/\s+/);
  const wordCount = words.length;

  // Check for code
  const hasCode = CODE_PATTERNS.some(pattern => pattern.test(prompt));

  // Check for multiple tasks
  const hasMultipleTasks = MULTI_TASK_PATTERNS.some(pattern => pattern.test(prompt));

  // Count technical terms
  const technicalTerms = TECHNICAL_TERMS.filter(term =>
    lowerPrompt.includes(term.toLowerCase())
  ).length;

  // Calculate complexity score
  let score = 0;

  // Word count scoring - more granular for short prompts
  if (wordCount <= 5) score += 1;
  else if (wordCount <= 10) score += 2;
  else if (wordCount < 20) score += 3;
  else if (wordCount < 50) score += 4;
  else if (wordCount < 100) score += 5;
  else score += 6;

  // Code scoring
  if (hasCode) score += 2;

  // Multi-task scoring
  if (hasMultipleTasks) score += 2;

  // Technical terms scoring
  score += Math.min(technicalTerms, 4);

  // Determine complexity level
  let level: ComplexityLevel;
  if (score <= 4) level = 'Simple';
  else if (score <= 7) level = 'Moderate';
  else if (score <= 10) level = 'Complex';
  else level = 'Advanced';

  // Recommend agent based on complexity
  let recommendedAgent: AgentRole;
  if (level === 'Simple') {
    recommendedAgent = 'ciri'; // Quick tasks
  } else if (level === 'Moderate') {
    recommendedAgent = 'geralt'; // General executor
  } else if (level === 'Complex') {
    recommendedAgent = 'regis'; // Research needed
  } else {
    recommendedAgent = 'dijkstra'; // Planning needed
  }

  return {
    score,
    level,
    wordCount,
    hasCode,
    hasMultipleTasks,
    technicalTerms,
    recommendedAgent
  };
}

/**
 * Calculate keyword match score for an agent
 * Multi-word phrases get higher scores
 */
function calculateAgentScore(prompt: string, role: AgentRole): number {
  const lowerPrompt = prompt.toLowerCase();
  const keywords = AGENT_KEYWORDS[role];

  let score = 0;
  for (const keyword of keywords) {
    if (lowerPrompt.includes(keyword.toLowerCase())) {
      // Multi-word phrases get higher score
      const wordCount = keyword.split(' ').length;
      score += wordCount >= 2 ? 3 : 1;
    }
  }

  return score;
}

/**
 * Classify prompt to best matching agent
 */
export function classifyPrompt(prompt: string): ClassificationResult {
  const complexity = analyzeComplexity(prompt);

  // If very complex, use commander for planning
  if (complexity.level === 'Advanced' && complexity.hasMultipleTasks) {
    return {
      prompt,
      agent: 'dijkstra',
      model: MODEL_TIERS.commander,
      tier: 'commander',
      confidence: 0.9
    };
  }

  // Calculate scores for all agents
  const scores: { role: AgentRole; score: number }[] = [];

  for (const role of Object.keys(AGENT_KEYWORDS) as AgentRole[]) {
    const score = calculateAgentScore(prompt, role);
    if (score > 0) {
      scores.push({ role, score });
    }
  }

  // Sort by score
  scores.sort((a, b) => b.score - a.score);

  // If we have matches, use the best one
  if (scores.length > 0 && scores[0].score >= 1) {
    const bestMatch = scores[0];
    const spec = AGENT_SPECS[bestMatch.role];
    const maxPossibleScore = AGENT_KEYWORDS[bestMatch.role].length;
    const confidence = Math.min(bestMatch.score / maxPossibleScore + 0.5, 0.95);

    return {
      prompt,
      agent: bestMatch.role,
      model: MODEL_TIERS[spec.tier],
      tier: spec.tier,
      confidence
    };
  }

  // Default to complexity-based recommendation
  const spec = AGENT_SPECS[complexity.recommendedAgent];

  return {
    prompt,
    agent: complexity.recommendedAgent,
    model: MODEL_TIERS[spec.tier],
    tier: spec.tier,
    confidence: 0.5
  };
}

/**
 * Get multiple agent candidates for a prompt
 */
export function getAgentCandidates(prompt: string, maxCandidates = 3): ClassificationResult[] {
  const scores: { role: AgentRole; score: number }[] = [];

  for (const role of Object.keys(AGENT_KEYWORDS) as AgentRole[]) {
    const score = calculateAgentScore(prompt, role);
    scores.push({ role, score });
  }

  scores.sort((a, b) => b.score - a.score);

  return scores.slice(0, maxCandidates).map(({ role, score }) => {
    const spec = AGENT_SPECS[role];
    const maxPossibleScore = AGENT_KEYWORDS[role].length;
    const confidence = score > 0 ? Math.min(score / maxPossibleScore + 0.3, 0.9) : 0.3;

    return {
      prompt,
      agent: role,
      model: MODEL_TIERS[spec.tier],
      tier: spec.tier,
      confidence
    };
  });
}

/**
 * Classify for specific tier
 */
export function classifyForTier(prompt: string, tier: ModelTier): ClassificationResult {
  const agentsInTier = getAgentsByTier(tier);

  let bestMatch: { role: AgentRole; score: number } = {
    role: agentsInTier[0],
    score: 0
  };

  for (const role of agentsInTier) {
    const score = calculateAgentScore(prompt, role);
    if (score > bestMatch.score) {
      bestMatch = { role, score };
    }
  }

  const spec = AGENT_SPECS[bestMatch.role];
  const maxPossibleScore = AGENT_KEYWORDS[bestMatch.role].length;
  const confidence = bestMatch.score > 0
    ? Math.min(bestMatch.score / maxPossibleScore + 0.4, 0.9)
    : 0.4;

  return {
    prompt,
    agent: bestMatch.role,
    model: MODEL_TIERS[tier],
    tier,
    confidence
  };
}

/**
 * Suggest agents for a complex task (for Dijkstra to use)
 */
export function suggestAgentsForTask(taskDescription: string): AgentRole[] {
  const candidates = getAgentCandidates(taskDescription, 5);
  const executors = candidates
    .filter(c => c.tier === 'executor' && c.confidence > 0.3)
    .map(c => c.agent);

  // Always include at least one executor
  if (executors.length === 0) {
    const complexity = analyzeComplexity(taskDescription);
    executors.push(complexity.recommendedAgent);
  }

  return executors;
}

/**
 * Check if prompt needs planning (should go to Dijkstra)
 */
export function needsPlanning(prompt: string): boolean {
  const complexity = analyzeComplexity(prompt);

  // Needs planning if:
  // - Advanced complexity
  // - Has multiple tasks
  // - Is very long
  return (
    complexity.level === 'Advanced' ||
    (complexity.hasMultipleTasks && complexity.wordCount > 50) ||
    complexity.wordCount > 200
  );
}

/**
 * Check if prompt needs research (should go to Regis first)
 */
export function needsResearch(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();

  const researchIndicators = [
    'what is', 'how does', 'explain', 'why', 'compare',
    'difference between', 'best practice', 'recommend',
    'pros and cons', 'alternatives', 'options'
  ];

  return researchIndicators.some(indicator => lowerPrompt.includes(indicator));
}

/**
 * Domain to agent mapping patterns
 */
export const DOMAIN_PATTERNS: Record<string, string[]> = {
  security: ['security', 'vulnerability', 'auth', 'encrypt', 'protect', 'audit'],
  testing: ['test', 'qa', 'quality', 'coverage', 'spec', 'unit', 'integration'],
  review: ['review', 'mentor', 'best practice', 'critique', 'evaluate'],
  quick: ['quick', 'fast', 'simple', 'basic', 'rapid', 'speed'],
  devops: ['devops', 'deploy', 'ci', 'cd', 'pipeline', 'docker', 'kubernetes', 'infrastructure'],
  debugging: ['debug', 'profile', 'performance', 'trace', 'troubleshoot', 'diagnose'],
  database: ['database', 'sql', 'nosql', 'data', 'schema', 'query', 'migration'],
  api: ['api', 'integration', 'webhook', 'rest', 'graphql', 'endpoint', 'service'],
  research: ['research', 'analyze', 'study', 'investigate', 'explore'],
  architecture: ['architecture', 'design', 'structure', 'pattern', 'synthesize'],
  communication: ['document', 'summarize', 'explain', 'report', 'write'],
  planning: ['plan', 'strategy', 'coordinate', 'orchestrate', 'organize']
};

/**
 * Domain to agent role mapping
 */
const DOMAIN_TO_AGENT: Record<string, AgentRole> = {
  security: 'geralt',
  testing: 'triss',
  review: 'vesemir',
  quick: 'ciri',
  devops: 'eskel',
  debugging: 'lambert',
  database: 'zoltan',
  api: 'philippa',
  research: 'regis',
  architecture: 'yennefer',
  communication: 'jaskier',
  planning: 'dijkstra'
};

/**
 * Get agent for a specific domain
 */
export function getAgentForDomain(domain: string): AgentRole {
  return DOMAIN_TO_AGENT[domain] ?? 'ciri';
}
