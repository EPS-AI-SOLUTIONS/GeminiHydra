/**
 * GeminiHydra - Classifier Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  classifyPrompt,
  analyzeComplexity,
  getAgentForDomain,
  AGENT_SPECS,
  DOMAIN_PATTERNS,
  MODEL_TIERS
} from '../../src/swarm/agents/index.js';
import type { AgentRole, ModelTier } from '../../src/types/swarm.js';

describe('classifyPrompt', () => {
  describe('security/ops prompts (Geralt)', () => {
    it('should classify security prompts to Geralt', () => {
      const prompts = [
        'Check for security vulnerabilities in my code',
        'Audit the authentication system',
        'Review the encryption implementation',
        'Analyze potential security threats',
        'Fix the authentication bug'
      ];

      for (const prompt of prompts) {
        const result = classifyPrompt(prompt);
        expect(result.agent).toBe('geralt');
        expect(result.tier).toBe('executor');
      }
    });
  });

  describe('testing/QA prompts (Triss)', () => {
    it('should classify testing prompts to Triss', () => {
      const prompts = [
        'Write unit tests for the UserService',
        'Run the test suite',
        'Create integration tests',
        'Debug the failing test',
        'Add coverage for the API module'
      ];

      for (const prompt of prompts) {
        const result = classifyPrompt(prompt);
        expect(result.agent).toBe('triss');
        expect(result.tier).toBe('executor');
      }
    });
  });

  describe('code review prompts (Vesemir)', () => {
    it('should classify review prompts to Vesemir', () => {
      const prompts = [
        'Review this pull request',
        'Check best practices in my code',
        'Mentor me on clean code',
        'Evaluate the code quality',
        'Is this pattern a good practice?'
      ];

      for (const prompt of prompts) {
        const result = classifyPrompt(prompt);
        expect(result.agent).toBe('vesemir');
        expect(result.tier).toBe('executor');
      }
    });
  });

  describe('quick tasks (Ciri)', () => {
    it('should classify quick prompts to Ciri', () => {
      const prompts = [
        'Quickly format this JSON',
        'Fast answer: what is 2+2?',
        'Help me briefly with this',
        'Simple question about TypeScript'
      ];

      for (const prompt of prompts) {
        const result = classifyPrompt(prompt);
        expect(result.agent).toBe('ciri');
        expect(result.tier).toBe('executor');
      }
    });
  });

  describe('devops prompts (Eskel)', () => {
    it('should classify devops prompts to Eskel', () => {
      const prompts = [
        'Deploy the application to production',
        'Set up the CI/CD pipeline',
        'Configure Docker containers',
        'Write a Kubernetes manifest',
        'Set up infrastructure with Terraform'
      ];

      for (const prompt of prompts) {
        const result = classifyPrompt(prompt);
        expect(result.agent).toBe('eskel');
        expect(result.tier).toBe('executor');
      }
    });
  });

  describe('debugging prompts (Lambert)', () => {
    it('should classify debugging prompts to Lambert', () => {
      const prompts = [
        'Debug this error in my code',
        'Profile the application performance',
        'Why is this function slow?',
        'Trace the bug in my application',
        'Troubleshoot the crash'
      ];

      for (const prompt of prompts) {
        const result = classifyPrompt(prompt);
        expect(result.agent).toBe('lambert');
        expect(result.tier).toBe('executor');
      }
    });
  });

  describe('database prompts (Zoltan)', () => {
    it('should classify database prompts to Zoltan', () => {
      const prompts = [
        'Write a SQL query for users',
        'Design the database schema',
        'Optimize this database query',
        'Create a migration for the table',
        'Set up PostgreSQL indexes'
      ];

      for (const prompt of prompts) {
        const result = classifyPrompt(prompt);
        expect(result.agent).toBe('zoltan');
        expect(result.tier).toBe('executor');
      }
    });
  });

  describe('API/integration prompts (Philippa)', () => {
    it('should classify API prompts to Philippa', () => {
      const prompts = [
        'Create an API endpoint for users',
        'Integrate with the external service',
        'Design the REST API',
        'Set up webhooks for notifications',
        'Connect to the payment gateway'
      ];

      for (const prompt of prompts) {
        const result = classifyPrompt(prompt);
        expect(result.agent).toBe('philippa');
        expect(result.tier).toBe('executor');
      }
    });
  });

  describe('research prompts (Regis)', () => {
    it('should classify research prompts to Regis', () => {
      const prompts = [
        'Research the best framework for this',
        'Analyze the market trends',
        'What are the latest developments in AI?',
        'Investigate the root cause',
        'Study the documentation'
      ];

      for (const prompt of prompts) {
        const result = classifyPrompt(prompt);
        expect(result.agent).toBe('regis');
        expect(result.tier).toBe('coordinator');
      }
    });
  });

  describe('architecture prompts (Yennefer)', () => {
    it('should classify architecture prompts to Yennefer', () => {
      const prompts = [
        'Design the system architecture',
        'Create a microservices structure',
        'Refactor the codebase',
        'Plan the software design',
        'Synthesize the components'
      ];

      for (const prompt of prompts) {
        const result = classifyPrompt(prompt);
        expect(result.agent).toBe('yennefer');
        expect(result.tier).toBe('coordinator');
      }
    });
  });

  describe('communication prompts (Jaskier)', () => {
    it('should classify communication prompts to Jaskier', () => {
      const prompts = [
        'Summarize this document',
        'Write documentation for the API',
        'Create a changelog entry',
        'Explain this code to a beginner',
        'Present the findings'
      ];

      for (const prompt of prompts) {
        const result = classifyPrompt(prompt);
        expect(result.agent).toBe('jaskier');
        expect(result.tier).toBe('coordinator');
      }
    });
  });

  describe('planning prompts (Dijkstra)', () => {
    it('should classify planning prompts to Dijkstra', () => {
      const prompts = [
        'Plan the project roadmap',
        'Create a strategy for migration',
        'Coordinate the team tasks',
        'Manage the sprint backlog',
        'Orchestrate the deployment'
      ];

      for (const prompt of prompts) {
        const result = classifyPrompt(prompt);
        expect(result.agent).toBe('dijkstra');
        expect(result.tier).toBe('commander');
      }
    });
  });

  describe('default classification', () => {
    it('should default to Ciri for ambiguous prompts', () => {
      const prompts = [
        'Hello',
        'What time is it?',
        'Tell me a joke'
      ];

      for (const prompt of prompts) {
        const result = classifyPrompt(prompt);
        expect(result.agent).toBe('ciri'); // Default executor
      }
    });
  });

  describe('classification metadata', () => {
    it('should include confidence score', () => {
      const result = classifyPrompt('Write unit tests');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should include model tier', () => {
      const result = classifyPrompt('Plan the architecture');
      expect(['commander', 'coordinator', 'executor']).toContain(result.tier);
    });

    it('should include model name', () => {
      const result = classifyPrompt('Test the code');
      expect(result.model).toBeDefined();
    });
  });
});

describe('analyzeComplexity', () => {
  describe('simple prompts', () => {
    it('should classify short prompts as Simple', () => {
      const result = analyzeComplexity('Hello world');
      expect(result.level).toBe('Simple');
      expect(result.score).toBeLessThanOrEqual(3);
    });

    it('should have low word count', () => {
      const result = analyzeComplexity('Fix the bug');
      expect(result.wordCount).toBeLessThan(10);
    });
  });

  describe('moderate prompts', () => {
    it('should classify medium prompts as Simple or Moderate', () => {
      const prompt = 'Create a function that takes an array of numbers and returns the sum of all even numbers';
      const result = analyzeComplexity(prompt);
      expect(['Simple', 'Moderate']).toContain(result.level);
    });
  });

  describe('complex prompts', () => {
    it('should classify long prompts with technical terms as Complex or Advanced', () => {
      const prompt = `
        Design and implement a comprehensive user authentication system that includes:
        1. Email/password registration and login
        2. OAuth2 integration with Google and GitHub
        3. JWT token management with refresh tokens
        4. Password reset functionality
        5. Two-factor authentication
        6. Session management and logout

        The system should follow security best practices and be scalable.
      `;
      const result = analyzeComplexity(prompt);
      expect(['Complex', 'Advanced']).toContain(result.level);
      expect(result.score).toBeGreaterThanOrEqual(5);
    });

    it('should detect code in prompts', () => {
      const prompt = `
        Fix this code:
        \`\`\`javascript
        function add(a, b) {
          return a + b;
        }
        \`\`\`
      `;
      const result = analyzeComplexity(prompt);
      expect(result.hasCode).toBe(true);
    });

    it('should detect multiple tasks', () => {
      const prompt = `
        1. First, create the database schema
        2. Then, implement the API endpoints
        3. Finally, write the tests
      `;
      const result = analyzeComplexity(prompt);
      expect(result.hasMultipleTasks).toBe(true);
    });
  });

  describe('complexity scoring', () => {
    it('should increase score for longer prompts', () => {
      const short = analyzeComplexity('Hello');
      const long = analyzeComplexity('This is a much longer prompt that contains many words and should have a higher complexity score');

      expect(long.score).toBeGreaterThan(short.score);
    });

    it('should increase score for code presence', () => {
      const withoutCode = analyzeComplexity('Write a function');
      const withCode = analyzeComplexity('Write a function ```function test() {}```');

      expect(withCode.score).toBeGreaterThanOrEqual(withoutCode.score);
    });
  });
});

describe('getAgentForDomain', () => {
  it('should return correct agent for each domain', () => {
    const domains: Array<[string, AgentRole]> = [
      ['security', 'geralt'],
      ['testing', 'triss'],
      ['review', 'vesemir'],
      ['quick', 'ciri'],
      ['devops', 'eskel'],
      ['debugging', 'lambert'],
      ['database', 'zoltan'],
      ['api', 'philippa'],
      ['research', 'regis'],
      ['architecture', 'yennefer'],
      ['communication', 'jaskier'],
      ['planning', 'dijkstra']
    ];

    for (const [domain, expectedAgent] of domains) {
      const agent = getAgentForDomain(domain);
      expect(agent).toBe(expectedAgent);
    }
  });

  it('should return default agent for unknown domain', () => {
    const agent = getAgentForDomain('unknown-domain');
    expect(agent).toBe('ciri'); // Default executor
  });
});

describe('AGENT_SPECS', () => {
  it('should have 12 agents defined', () => {
    expect(Object.keys(AGENT_SPECS)).toHaveLength(12);
  });

  it('should have all required fields for each agent', () => {
    for (const [role, spec] of Object.entries(AGENT_SPECS)) {
      expect(spec.persona).toBeDefined();
      expect(spec.focus).toBeDefined();
      expect(spec.tier).toBeDefined();
      expect(['commander', 'coordinator', 'executor']).toContain(spec.tier);
    }
  });

  it('should have correct tier distribution', () => {
    const tiers = Object.values(AGENT_SPECS).map(spec => spec.tier);

    const commanders = tiers.filter(t => t === 'commander');
    const coordinators = tiers.filter(t => t === 'coordinator');
    const executors = tiers.filter(t => t === 'executor');

    expect(commanders).toHaveLength(1); // Dijkstra
    expect(coordinators).toHaveLength(3); // Regis, Yennefer, Jaskier
    expect(executors).toHaveLength(8); // Rest
  });
});

describe('MODEL_TIERS', () => {
  it('should have all tiers defined', () => {
    expect(MODEL_TIERS.commander).toBeDefined();
    expect(MODEL_TIERS.coordinator).toBeDefined();
    expect(MODEL_TIERS.executor).toBeDefined();
  });

  it('should map to correct model strings', () => {
    expect(MODEL_TIERS.commander).toBe('gemini-2.0-pro-exp');
    expect(MODEL_TIERS.coordinator).toBe('gemini-2.0-flash-exp');
    expect(MODEL_TIERS.executor).toBe('llama.cpp');
  });
});

describe('DOMAIN_PATTERNS', () => {
  it('should have patterns for all domains', () => {
    const expectedDomains = [
      'security', 'testing', 'review', 'quick', 'devops',
      'debugging', 'database', 'api', 'research', 'architecture',
      'communication', 'planning'
    ];

    for (const domain of expectedDomains) {
      expect(DOMAIN_PATTERNS[domain]).toBeDefined();
      expect(DOMAIN_PATTERNS[domain].length).toBeGreaterThan(0);
    }
  });
});
