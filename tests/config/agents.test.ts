/**
 * Tests for Agent Configuration
 */

import { describe, expect, it } from 'vitest';
import {
  AGENT_COLORS,
  AGENT_DESCRIPTIONS,
  AGENT_FALLBACK_CHAINS,
  AGENT_ROLES,
  getAgentColor,
  getAgentDescription,
  getAgentFallbackChain,
  getAgentForTask,
  getAllAgentRoles,
  resolveAgentRole,
  TASK_ROUTING,
} from '../../src/config/agents.config.js';

describe('AGENT_ROLES', () => {
  it('should define all 14 agents', () => {
    expect(Object.keys(AGENT_ROLES)).toHaveLength(14);
  });

  it('should have correct role values', () => {
    expect(AGENT_ROLES.DIJKSTRA).toBe('dijkstra');
    expect(AGENT_ROLES.GERALT).toBe('geralt');
    expect(AGENT_ROLES.YENNEFER).toBe('yennefer');
    expect(AGENT_ROLES.REGIS).toBe('regis');
  });
});

describe('AGENT_DESCRIPTIONS', () => {
  it('should have descriptions for all roles', () => {
    for (const role of Object.values(AGENT_ROLES)) {
      expect(AGENT_DESCRIPTIONS[role]).toBeDefined();
      expect(AGENT_DESCRIPTIONS[role].name).toBeDefined();
      expect(AGENT_DESCRIPTIONS[role].title).toBeDefined();
      expect(AGENT_DESCRIPTIONS[role].specialty).toBeDefined();
      expect(AGENT_DESCRIPTIONS[role].personality).toBeDefined();
    }
  });

  it('should define dijkstra description', () => {
    expect(AGENT_DESCRIPTIONS.dijkstra.name).toBe('Dijkstra');
    expect(AGENT_DESCRIPTIONS.dijkstra.title).toBe('Supreme Coordinator');
  });

  it('should define geralt description', () => {
    expect(AGENT_DESCRIPTIONS.geralt.name).toBe('Geralt');
    expect(AGENT_DESCRIPTIONS.geralt.title).toBe('Lead Developer');
  });
});

describe('AGENT_COLORS', () => {
  it('should have colors for all roles', () => {
    for (const role of Object.values(AGENT_ROLES)) {
      expect(AGENT_COLORS[role]).toBeDefined();
      expect(typeof AGENT_COLORS[role]).toBe('string');
    }
  });
});

describe('AGENT_FALLBACK_CHAINS', () => {
  it('should have fallback chains for all roles', () => {
    for (const role of Object.values(AGENT_ROLES)) {
      expect(AGENT_FALLBACK_CHAINS[role]).toBeDefined();
      expect(Array.isArray(AGENT_FALLBACK_CHAINS[role])).toBe(true);
    }
  });
});

describe('TASK_ROUTING', () => {
  it('should route coding to geralt', () => {
    expect(TASK_ROUTING.coding).toBe('geralt');
  });

  it('should route research to regis', () => {
    expect(TASK_ROUTING.research).toBe('regis');
  });
});

describe('getAgentDescription', () => {
  it('should return correct description', () => {
    const desc = getAgentDescription('dijkstra');
    expect(desc.name).toBe('Dijkstra');
  });
});

describe('getAgentColor', () => {
  it('should return color string', () => {
    expect(typeof getAgentColor('geralt')).toBe('string');
  });
});

describe('getAgentFallbackChain', () => {
  it('should return fallback array', () => {
    const chain = getAgentFallbackChain('dijkstra');
    expect(Array.isArray(chain)).toBe(true);
    expect(chain.length).toBeGreaterThan(0);
  });
});

describe('getAgentForTask', () => {
  it('should return agent for task category', () => {
    expect(getAgentForTask('coding')).toBe('geralt');
    expect(getAgentForTask('security')).toBe('lambert');
  });
});

describe('getAllAgentRoles', () => {
  it('should return all 14 roles', () => {
    expect(getAllAgentRoles()).toHaveLength(14);
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
    const agents = [
      'dijkstra',
      'regis',
      'geralt',
      'philippa',
      'yennefer',
      'triss',
      'jaskier',
      'vesemir',
      'ciri',
      'eskel',
      'lambert',
      'zoltan',
      'serena',
    ];

    for (const agent of agents) {
      expect(resolveAgentRole(agent)).toBe(agent);
    }
  });
});
