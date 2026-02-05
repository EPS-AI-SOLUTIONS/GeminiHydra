/**
 * Tests for Agent Personas Configuration
 */

import { describe, it, expect } from 'vitest';
import {
  AGENT_PERSONAS,
  getAgentPersona,
  resolveAgentRole,
} from '../../src/config/agents.js';

describe('AGENT_PERSONAS', () => {
  it('should define dijkstra persona', () => {
    expect(AGENT_PERSONAS.dijkstra).toBeDefined();
    expect(AGENT_PERSONAS.dijkstra?.name).toBe('dijkstra');
    expect(AGENT_PERSONAS.dijkstra?.role).toBe('Strategist');
  });

  it('should define regis persona', () => {
    expect(AGENT_PERSONAS.regis).toBeDefined();
    expect(AGENT_PERSONAS.regis?.name).toBe('regis');
    expect(AGENT_PERSONAS.regis?.role).toBe('Synthesizer');
  });

  it('should define geralt persona', () => {
    expect(AGENT_PERSONAS.geralt).toBeDefined();
    expect(AGENT_PERSONAS.geralt?.name).toBe('geralt');
    expect(AGENT_PERSONAS.geralt?.role).toBe('Executor');
  });

  it('should define philippa persona', () => {
    expect(AGENT_PERSONAS.philippa).toBeDefined();
    expect(AGENT_PERSONAS.philippa?.name).toBe('philippa');
    expect(AGENT_PERSONAS.philippa?.role).toBe('API Specialist');
  });

  it('should define yennefer persona', () => {
    expect(AGENT_PERSONAS.yennefer).toBeDefined();
    expect(AGENT_PERSONAS.yennefer?.name).toBe('yennefer');
    expect(AGENT_PERSONAS.yennefer?.role).toBe('Translator');
  });

  it('should define triss persona', () => {
    expect(AGENT_PERSONAS.triss).toBeDefined();
    expect(AGENT_PERSONAS.triss?.name).toBe('triss');
    expect(AGENT_PERSONAS.triss?.role).toBe('Researcher');
  });

  it('should define jaskier persona', () => {
    expect(AGENT_PERSONAS.jaskier).toBeDefined();
    expect(AGENT_PERSONAS.jaskier?.name).toBe('jaskier');
    expect(AGENT_PERSONAS.jaskier?.role).toBe('Writer');
  });

  it('should define vesemir persona', () => {
    expect(AGENT_PERSONAS.vesemir).toBeDefined();
    expect(AGENT_PERSONAS.vesemir?.name).toBe('vesemir');
    expect(AGENT_PERSONAS.vesemir?.role).toBe('Mentor');
  });

  it('should define ciri persona', () => {
    expect(AGENT_PERSONAS.ciri).toBeDefined();
    expect(AGENT_PERSONAS.ciri?.name).toBe('ciri');
    expect(AGENT_PERSONAS.ciri?.role).toBe('Navigator');
  });

  it('should define eskel persona', () => {
    expect(AGENT_PERSONAS.eskel).toBeDefined();
    expect(AGENT_PERSONAS.eskel?.name).toBe('eskel');
    expect(AGENT_PERSONAS.eskel?.role).toBe('Builder');
  });

  it('should define lambert persona', () => {
    expect(AGENT_PERSONAS.lambert).toBeDefined();
    expect(AGENT_PERSONAS.lambert?.name).toBe('lambert');
    expect(AGENT_PERSONAS.lambert?.role).toBe('Tester');
  });

  it('should define zoltan persona', () => {
    expect(AGENT_PERSONAS.zoltan).toBeDefined();
    expect(AGENT_PERSONAS.zoltan?.name).toBe('zoltan');
    expect(AGENT_PERSONAS.zoltan?.role).toBe('Analyst');
  });

  it('all personas should have required fields', () => {
    for (const [key, persona] of Object.entries(AGENT_PERSONAS)) {
      expect(persona?.name).toBeDefined();
      expect(persona?.role).toBeDefined();
      expect(persona?.description).toBeDefined();
    }
  });
});

describe('getAgentPersona', () => {
  it('should return correct persona for valid role', () => {
    const dijkstra = getAgentPersona('dijkstra');
    expect(dijkstra.name).toBe('dijkstra');
    expect(dijkstra.role).toBe('Strategist');
  });

  it('should return geralt persona for unknown role', () => {
    const unknown = getAgentPersona('unknown' as any);
    expect(unknown.name).toBe('geralt');
  });

  it('should return geralt for all valid roles', () => {
    const roles = ['dijkstra', 'regis', 'geralt', 'philippa', 'yennefer',
                   'triss', 'jaskier', 'vesemir', 'ciri', 'eskel', 'lambert', 'zoltan'] as const;

    for (const role of roles) {
      const persona = getAgentPersona(role);
      expect(persona.name).toBe(role);
    }
  });
});

describe('resolveAgentRole', () => {
  it('should resolve valid role name', () => {
    expect(resolveAgentRole('dijkstra')).toBe('dijkstra');
    expect(resolveAgentRole('geralt')).toBe('geralt');
    expect(resolveAgentRole('yennefer')).toBe('yennefer');
  });

  it('should normalize case', () => {
    expect(resolveAgentRole('DIJKSTRA')).toBe('dijkstra');
    expect(resolveAgentRole('Geralt')).toBe('geralt');
    expect(resolveAgentRole('YeNnEfEr')).toBe('yennefer');
  });

  it('should return geralt for unknown role', () => {
    expect(resolveAgentRole('unknown')).toBe('geralt');
    expect(resolveAgentRole('notanagent')).toBe('geralt');
    expect(resolveAgentRole('')).toBe('geralt');
  });

  it('should handle all known agents', () => {
    const agents = ['dijkstra', 'regis', 'geralt', 'philippa', 'yennefer',
                    'triss', 'jaskier', 'vesemir', 'ciri', 'eskel', 'lambert', 'zoltan'];

    for (const agent of agents) {
      expect(resolveAgentRole(agent)).toBe(agent);
    }
  });
});
