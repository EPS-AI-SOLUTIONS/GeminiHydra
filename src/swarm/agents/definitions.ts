/**
 * GeminiHydra - Witcher Swarm Agent Definitions
 * 12 specialized agents with 3-tier model hierarchy
 */

import type { AgentRole, AgentSpec, ModelTier } from '../../types/swarm.js';

/**
 * Model tiers for 3-level hierarchy
 */
export const MODEL_TIERS: Record<ModelTier, string> = {
  commander: 'gemini-3-pro-preview',     // Planning, assigning
  coordinator: 'gemini-3-pro-preview',  // Synthesis, analysis, summary
  executor: 'llama.cpp'                  // Local execution
};

/**
 * 12 Witcher Swarm Agent Specifications
 *
 * TIER 1: COMMANDER (1 agent) - Gemini Pro
 *   - Dijkstra: Master strategist, plans and assigns tasks
 *
 * TIER 2: COORDINATORS (3 agents) - Gemini Flash
 *   - Regis: Research and context gathering
 *   - Yennefer: Synthesis and architecture
 *   - Jaskier: Summary and documentation
 *
 * TIER 3: EXECUTORS (8 agents) - llama.cpp local
 *   - Geralt: Security and operations
 *   - Triss: QA and testing
 *   - Vesemir: Mentoring and code review
 *   - Ciri: Quick tasks and speed
 *   - Eskel: DevOps and infrastructure
 *   - Lambert: Debugging and profiling
 *   - Zoltan: Data and databases
 *   - Philippa: Integration and APIs
 */
export const AGENT_SPECS: Record<AgentRole, AgentSpec> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1: COMMANDER (Gemini Pro) - Strategic planning and task assignment
  // ═══════════════════════════════════════════════════════════════════════════

  dijkstra: {
    persona: 'Spymaster & Master Strategist',
    focus: 'Strategic Planning, Task Assignment, Workflow Orchestration',
    skills: [
      'Breaking complex problems into subtasks',
      'Assigning agents based on expertise',
      'Identifying dependencies and parallelization opportunities',
      'Creating execution plans with priorities',
      'Risk assessment and contingency planning'
    ],
    tier: 'commander'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2: COORDINATORS (Gemini Flash) - Synthesis, analysis, communication
  // ═══════════════════════════════════════════════════════════════════════════

  regis: {
    persona: 'Sage & Researcher',
    focus: 'Research, Context Gathering, Knowledge Analysis',
    skills: [
      'Deep research and fact-finding',
      'Context analysis and summarization',
      'Pattern recognition across data',
      'Historical analysis and trends',
      'Expert knowledge synthesis'
    ],
    tier: 'coordinator'
  },

  yennefer: {
    persona: 'Sorceress & Architect',
    focus: 'Synthesis, Architecture Design, Result Integration',
    skills: [
      'Merging multiple results into coherent whole',
      'System architecture and design patterns',
      'Cross-cutting concern analysis',
      'Quality assessment of solutions',
      'Final answer formulation'
    ],
    tier: 'coordinator'
  },

  jaskier: {
    persona: 'Bard & Chronicler',
    focus: 'Documentation, Summary, Communication',
    skills: [
      'Creating clear and concise summaries',
      'Technical writing and documentation',
      'Session logging and transcription',
      'User-friendly explanations',
      'Narrative structure and flow'
    ],
    tier: 'coordinator'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3: EXECUTORS (llama.cpp local) - Task execution specialists
  // ═══════════════════════════════════════════════════════════════════════════

  geralt: {
    persona: 'White Wolf & Security Expert',
    focus: 'Security, Operations, Critical Systems',
    skills: [
      'Security analysis and vulnerability detection',
      'Safe code practices and hardening',
      'Operational procedures and monitoring',
      'Incident response and mitigation',
      'Authentication and authorization'
    ],
    tier: 'executor'
  },

  triss: {
    persona: 'Healer & Quality Assurance',
    focus: 'Testing, Quality Assurance, Validation',
    skills: [
      'Test case design and execution',
      'Quality assurance processes',
      'Bug detection and reporting',
      'Code coverage analysis',
      'Regression testing strategies'
    ],
    tier: 'executor'
  },

  vesemir: {
    persona: 'Mentor & Code Reviewer',
    focus: 'Code Review, Mentoring, Best Practices',
    skills: [
      'Code review and critique',
      'Best practices enforcement',
      'Teaching and explanations',
      'Legacy code understanding',
      'Technical debt assessment'
    ],
    tier: 'executor'
  },

  ciri: {
    persona: 'Prodigy & Speed Specialist',
    focus: 'Quick Tasks, Speed Optimization, Rapid Prototyping',
    skills: [
      'Fast task execution',
      'Quick prototyping and POCs',
      'Simple implementations',
      'Rapid iteration',
      'Time-critical operations'
    ],
    tier: 'executor'
  },

  eskel: {
    persona: 'Pragmatist & DevOps Engineer',
    focus: 'DevOps, Infrastructure, CI/CD',
    skills: [
      'Infrastructure as code',
      'CI/CD pipeline design',
      'Container orchestration',
      'Cloud platform management',
      'Deployment automation'
    ],
    tier: 'executor'
  },

  lambert: {
    persona: 'Skeptic & Debug Master',
    focus: 'Debugging, Profiling, Performance Analysis',
    skills: [
      'Root cause analysis',
      'Performance profiling',
      'Memory leak detection',
      'Stack trace analysis',
      'Cynical code review'
    ],
    tier: 'executor'
  },

  zoltan: {
    persona: 'Craftsman & Data Engineer',
    focus: 'Data, Databases, ETL Pipelines',
    skills: [
      'Database design and optimization',
      'SQL and NoSQL expertise',
      'Data migration and ETL',
      'Data modeling',
      'Query optimization'
    ],
    tier: 'executor'
  },

  philippa: {
    persona: 'Strategist & Integration Expert',
    focus: 'API Integration, External Systems, MCP',
    skills: [
      'API design and integration',
      'Third-party service integration',
      'MCP server connections',
      'Protocol implementation',
      'System interoperability'
    ],
    tier: 'executor'
  },

  serena: {
    persona: 'Code Intelligence Agent',
    focus: 'Code Navigation, Symbol Search, Semantic Analysis',
    skills: [
      'Find symbol definitions and references',
      'Code navigation and go-to-definition',
      'Semantic code search',
      'Symbol renaming across project',
      'LSP-based code intelligence'
    ],
    tier: 'executor'
  }
};

/**
 * Get all agent roles
 */
export function getAgentRoles(): AgentRole[] {
  return Object.keys(AGENT_SPECS) as AgentRole[];
}

/**
 * Get agents by tier
 */
export function getAgentsByTier(tier: ModelTier): AgentRole[] {
  return getAgentRoles().filter(role => AGENT_SPECS[role].tier === tier);
}

/**
 * Get commander agents (Tier 1)
 */
export function getCommanders(): AgentRole[] {
  return getAgentsByTier('commander');
}

/**
 * Get coordinator agents (Tier 2)
 */
export function getCoordinators(): AgentRole[] {
  return getAgentsByTier('coordinator');
}

/**
 * Get executor agents (Tier 3)
 */
export function getExecutors(): AgentRole[] {
  return getAgentsByTier('executor');
}

/**
 * Get agent spec by role
 */
export function getAgentSpec(role: AgentRole): AgentSpec {
  return AGENT_SPECS[role];
}

/**
 * Get model for agent
 */
export function getAgentModel(role: AgentRole): string {
  const spec = AGENT_SPECS[role];
  return MODEL_TIERS[spec.tier];
}

/**
 * Get agent tier
 */
export function getAgentTier(role: AgentRole): ModelTier {
  return AGENT_SPECS[role].tier;
}

/**
 * Check if agent exists
 */
export function isValidAgent(role: string): role is AgentRole {
  return role in AGENT_SPECS;
}

/**
 * Get agent prompt prefix (persona context)
 */
export function getAgentPromptPrefix(role: AgentRole): string {
  const spec = AGENT_SPECS[role];
  return `You are ${role.charAt(0).toUpperCase() + role.slice(1)}, the ${spec.persona}.
Your focus area is: ${spec.focus}.
Your key skills are:
${spec.skills.map(s => `- ${s}`).join('\n')}

Respond in character, leveraging your expertise.`;
}

/**
 * Agent summary for display
 */
export interface AgentSummary {
  role: AgentRole;
  persona: string;
  focus: string;
  tier: ModelTier;
  model: string;
}

/**
 * Get all agent summaries
 */
export function getAgentSummaries(): AgentSummary[] {
  return getAgentRoles().map(role => ({
    role,
    persona: AGENT_SPECS[role].persona,
    focus: AGENT_SPECS[role].focus,
    tier: AGENT_SPECS[role].tier,
    model: MODEL_TIERS[AGENT_SPECS[role].tier]
  }));
}

/**
 * Print agent roster (for CLI display)
 */
export function getAgentRosterDisplay(): string {
  const lines: string[] = [];

  lines.push('╔════════════════════════════════════════════════════════════╗');
  lines.push('║              WITCHER SWARM - AGENT ROSTER                  ║');
  lines.push('╠════════════════════════════════════════════════════════════╣');

  // Tier 1
  lines.push('║ TIER 1: COMMANDER (Gemini Pro)                             ║');
  lines.push('║ ──────────────────────────────────────────────────────────║');
  for (const role of getCommanders()) {
    const spec = AGENT_SPECS[role];
    lines.push(`║ • ${role.padEnd(10)} │ ${spec.persona.padEnd(30)} ║`);
  }

  lines.push('║                                                            ║');
  lines.push('║ TIER 2: COORDINATORS (Gemini Flash)                        ║');
  lines.push('║ ──────────────────────────────────────────────────────────║');
  for (const role of getCoordinators()) {
    const spec = AGENT_SPECS[role];
    lines.push(`║ • ${role.padEnd(10)} │ ${spec.persona.padEnd(30)} ║`);
  }

  lines.push('║                                                            ║');
  lines.push('║ TIER 3: EXECUTORS (llama.cpp)                              ║');
  lines.push('║ ──────────────────────────────────────────────────────────║');
  for (const role of getExecutors()) {
    const spec = AGENT_SPECS[role];
    lines.push(`║ • ${role.padEnd(10)} │ ${spec.persona.padEnd(30)} ║`);
  }

  lines.push('╚════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}
