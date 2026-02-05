/**
 * GeminiHydra - Agent Personas Configuration
 */

import { AgentRole, AgentPersona } from '../types/index.js';

export const AGENT_PERSONAS: Partial<Record<AgentRole, AgentPersona>> = {
  dijkstra: {
    name: 'dijkstra',
    role: 'Strategist',
    description: 'Creates execution plans and coordinates tasks'
  },
  regis: {
    name: 'regis',
    role: 'Synthesizer',
    description: 'Summarizes and synthesizes results'
  },
  geralt: {
    name: 'geralt',
    role: 'Executor',
    description: 'Performs general tasks and operations'
  },
  philippa: {
    name: 'philippa',
    role: 'API Specialist',
    description: 'Handles API calls and external integrations'
  },
  yennefer: {
    name: 'yennefer',
    role: 'Translator',
    description: 'Translates and refines objectives'
  },
  triss: {
    name: 'triss',
    role: 'Researcher',
    description: 'Gathers information and researches topics'
  },
  jaskier: {
    name: 'jaskier',
    role: 'Writer',
    description: 'Creates documentation and content'
  },
  vesemir: {
    name: 'vesemir',
    role: 'Mentor',
    description: 'Provides guidance and validates quality'
  },
  ciri: {
    name: 'ciri',
    role: 'Navigator',
    description: 'Handles file operations and navigation'
  },
  eskel: {
    name: 'eskel',
    role: 'Builder',
    description: 'Builds and compiles projects'
  },
  lambert: {
    name: 'lambert',
    role: 'Tester',
    description: 'Runs tests and validates results'
  },
  zoltan: {
    name: 'zoltan',
    role: 'Analyst',
    description: 'Analyzes data and provides insights'
  }
};

export function getAgentPersona(role: AgentRole): AgentPersona {
  return AGENT_PERSONAS[role] || AGENT_PERSONAS.geralt!;
}

export function resolveAgentRole(name: string): AgentRole {
  const normalized = name.toLowerCase() as AgentRole;
  return normalized in AGENT_PERSONAS ? normalized : 'geralt';
}
