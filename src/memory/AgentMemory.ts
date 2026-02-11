/**
 * Agent Memories System (Features 16-20)
 * Agent: Vesemir (Mentor/Wisdom)
 *
 * 16. Agent Journals - Each agent keeps a decision journal
 * 17. Cross-Agent Learning - Shared knowledge between agents
 * 18. Agent Specialization - Role-specific memories
 * 19. Feedback Loop - User ratings improve agent learning
 * 20. Memory Sync - Cloud sync between instances
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { GEMINIHYDRA_DIR } from '../config/paths.config.js';
import { loadFromFile, saveToFile } from '../native/persistence.js';

const AGENT_MEMORY_DIR = path.join(GEMINIHYDRA_DIR, 'agents');

// Agent roles
type AgentName =
  | 'dijkstra'
  | 'geralt'
  | 'yennefer'
  | 'triss'
  | 'vesemir'
  | 'jaskier'
  | 'ciri'
  | 'eskel'
  | 'lambert'
  | 'zoltan'
  | 'regis'
  | 'philippa';

interface JournalEntry {
  id: string;
  timestamp: Date;
  task: string;
  decision: string;
  reasoning: string;
  outcome?: 'success' | 'failure' | 'partial';
  userFeedback?: number; // 1-5 rating (Feature 19)
  tags: string[];
}

interface SharedKnowledge {
  id: string;
  contributor: AgentName;
  topic: string;
  insight: string;
  endorsements: AgentName[]; // Other agents that found this useful
  created: Date;
  accessCount: number;
}

interface AgentProfile {
  name: AgentName;
  specialty: string;
  journal: JournalEntry[];
  specializations: Map<string, number>; // Topic -> proficiency score
  successRate: number;
  totalTasks: number;
}

interface AgentMemoryStore {
  profiles: Record<string, AgentProfile>;
  sharedKnowledge: SharedKnowledge[];
  syncToken?: string;
  lastSync?: Date;
}

const AGENT_MEMORY_FILE = 'agent-memory.json';

export class AgentMemory {
  private store: AgentMemoryStore = {
    profiles: {},
    sharedKnowledge: [],
  };

  /**
   * Initialize agent memory system
   */
  async init(): Promise<void> {
    await fs.mkdir(AGENT_MEMORY_DIR, { recursive: true });
    await this.load();

    // Initialize all agent profiles
    const agents: AgentName[] = [
      'dijkstra',
      'geralt',
      'yennefer',
      'triss',
      'vesemir',
      'jaskier',
      'ciri',
      'eskel',
      'lambert',
      'zoltan',
      'regis',
      'philippa',
    ];

    const specialties: Record<AgentName, string> = {
      dijkstra: 'Strategic planning and coordination',
      geralt: 'Security analysis and threat detection',
      yennefer: 'Architecture and code design',
      triss: 'Testing and quality assurance',
      vesemir: 'Code review and best practices',
      jaskier: 'Documentation and communication',
      ciri: 'Fast execution of simple tasks',
      eskel: 'DevOps and deployment',
      lambert: 'Debugging and error analysis',
      zoltan: 'Data processing and databases',
      regis: 'Research and synthesis',
      philippa: 'API integration and external services',
    };

    for (const agent of agents) {
      if (!this.store.profiles[agent]) {
        this.store.profiles[agent] = {
          name: agent,
          specialty: specialties[agent],
          journal: [],
          specializations: new Map(),
          successRate: 0,
          totalTasks: 0,
        };
      }
    }

    await this.save();
  }

  /**
   * Load from disk
   */
  async load(): Promise<void> {
    const filePath = path.join(AGENT_MEMORY_DIR, AGENT_MEMORY_FILE);
    const parsed = await loadFromFile<Record<string, unknown>>(filePath);

    if (parsed) {
      // Restore Maps and Dates
      for (const [_name, profile] of Object.entries(parsed.profiles || {})) {
        const p = profile as Record<string, unknown>;
        p.specializations = new Map(
          Object.entries((p.specializations as Record<string, unknown>) || {}),
        );
        p.journal = ((p.journal as Array<Record<string, unknown>>) || []).map((j) => ({
          ...j,
          timestamp: new Date(j.timestamp as string),
        }));
      }

      this.store = {
        profiles: (parsed.profiles || {}) as Record<string, AgentProfile>,
        sharedKnowledge: ((parsed.sharedKnowledge || []) as Array<Record<string, unknown>>).map(
          (k) => ({
            ...k,
            created: new Date(k.created as string),
          }),
        ) as SharedKnowledge[],
        syncToken: parsed.syncToken as string | undefined,
        lastSync: parsed.lastSync ? new Date(parsed.lastSync as string) : undefined,
      };
    }
    // If parsed is null, keep the fresh store initialized in constructor
  }

  /**
   * Save to disk
   */
  async save(): Promise<void> {
    // Convert Maps to objects for JSON
    const serializable = {
      profiles: {} as Record<string, unknown>,
      sharedKnowledge: this.store.sharedKnowledge,
      syncToken: this.store.syncToken,
      lastSync: this.store.lastSync,
    };

    for (const [name, profile] of Object.entries(this.store.profiles)) {
      serializable.profiles[name] = {
        ...profile,
        specializations: Object.fromEntries(profile.specializations),
      };
    }

    const filePath = path.join(AGENT_MEMORY_DIR, AGENT_MEMORY_FILE);
    await saveToFile(filePath, serializable);
  }

  /**
   * Add journal entry for an agent (Feature 16)
   */
  async addJournalEntry(
    agent: AgentName,
    task: string,
    decision: string,
    reasoning: string,
    tags: string[] = [],
  ): Promise<string> {
    const profile = this.store.profiles[agent];
    if (!profile) throw new Error(`Unknown agent: ${agent}`);

    const entry: JournalEntry = {
      id: crypto.randomBytes(8).toString('hex'),
      timestamp: new Date(),
      task,
      decision,
      reasoning,
      tags,
    };

    profile.journal.push(entry);
    profile.totalTasks++;

    // Update specializations based on tags
    for (const tag of tags) {
      const current = profile.specializations.get(tag) || 0;
      profile.specializations.set(tag, current + 1);
    }

    await this.save();
    return entry.id;
  }

  /**
   * Record task outcome
   */
  async recordOutcome(
    agent: AgentName,
    entryId: string,
    outcome: 'success' | 'failure' | 'partial',
  ): Promise<void> {
    const profile = this.store.profiles[agent];
    if (!profile) return;

    const entry = profile.journal.find((j) => j.id === entryId);
    if (entry) {
      entry.outcome = outcome;

      // Update success rate
      const completedEntries = profile.journal.filter((j) => j.outcome);
      const successes = completedEntries.filter((j) => j.outcome === 'success').length;
      profile.successRate = successes / completedEntries.length;

      await this.save();
    }
  }

  /**
   * Add user feedback (Feature 19)
   */
  async addFeedback(agent: AgentName, entryId: string, rating: number): Promise<void> {
    const profile = this.store.profiles[agent];
    if (!profile) return;

    const entry = profile.journal.find((j) => j.id === entryId);
    if (entry) {
      entry.userFeedback = Math.min(5, Math.max(1, rating));
      await this.save();

      // If positive feedback, potentially share as knowledge
      if (rating >= 4) {
        await this.shareKnowledge(agent, entry.task, entry.decision);
      }
    }
  }

  /**
   * Share knowledge between agents (Feature 17)
   */
  async shareKnowledge(contributor: AgentName, topic: string, insight: string): Promise<string> {
    const knowledge: SharedKnowledge = {
      id: crypto.randomBytes(8).toString('hex'),
      contributor,
      topic,
      insight,
      endorsements: [],
      created: new Date(),
      accessCount: 0,
    };

    this.store.sharedKnowledge.push(knowledge);
    await this.save();

    console.log(chalk.cyan(`[${contributor}] Shared knowledge: ${topic}`));
    return knowledge.id;
  }

  /**
   * Endorse shared knowledge
   */
  async endorseKnowledge(knowledgeId: string, endorser: AgentName): Promise<void> {
    const knowledge = this.store.sharedKnowledge.find((k) => k.id === knowledgeId);
    if (knowledge && !knowledge.endorsements.includes(endorser)) {
      knowledge.endorsements.push(endorser);
      await this.save();
    }
  }

  /**
   * Get relevant knowledge for a task
   */
  getKnowledgeForTask(task: string, agent?: AgentName): SharedKnowledge[] {
    const keywords = task.toLowerCase().split(/\W+/);

    const candidates = this.store.sharedKnowledge;

    // Score by relevance
    const scored = candidates.map((k) => {
      const topicMatches = keywords.filter(
        (kw) => k.topic.toLowerCase().includes(kw) || k.insight.toLowerCase().includes(kw),
      ).length;

      const endorsementScore = k.endorsements.length * 0.2;
      const accessScore = Math.min(k.accessCount * 0.1, 1);

      // Boost if from same agent specialty area
      let specialtyBoost = 0;
      if (agent && k.contributor === agent) {
        specialtyBoost = 0.3;
      }

      const score = topicMatches + endorsementScore + accessScore + specialtyBoost;
      return { knowledge: k, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // Update access counts
    const results = scored.slice(0, 5).map((s) => s.knowledge);
    for (const k of results) {
      k.accessCount++;
    }

    return results;
  }

  /**
   * Get agent's specialization context (Feature 18)
   */
  getAgentContext(agent: AgentName, task: string): string {
    const profile = this.store.profiles[agent];
    if (!profile) return '';

    const context: string[] = [];

    // Agent specialty
    context.push(`## ${agent}'s Expertise`);
    context.push(`Specialty: ${profile.specialty}`);
    context.push(`Success rate: ${(profile.successRate * 100).toFixed(1)}%`);
    context.push(`Total tasks: ${profile.totalTasks}`);

    // Top specializations
    const specs = Array.from(profile.specializations.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (specs.length > 0) {
      context.push('\nTop specializations:');
      for (const [topic, score] of specs) {
        context.push(`- ${topic}: ${score} tasks`);
      }
    }

    // Recent relevant decisions
    const keywords = task.toLowerCase().split(/\W+/);
    const relevantJournal = profile.journal
      .filter((j) =>
        keywords.some(
          (kw) =>
            j.task.toLowerCase().includes(kw) || j.tags.some((t) => t.toLowerCase().includes(kw)),
        ),
      )
      .slice(-3);

    if (relevantJournal.length > 0) {
      context.push('\nRelevant past decisions:');
      for (const entry of relevantJournal) {
        const outcome = entry.outcome === 'success' ? '✓' : entry.outcome === 'failure' ? '✗' : '~';
        context.push(`- ${outcome} ${entry.decision}`);
      }
    }

    // Shared knowledge
    const knowledge = this.getKnowledgeForTask(task, agent);
    if (knowledge.length > 0) {
      context.push('\nRelevant shared knowledge:');
      for (const k of knowledge) {
        context.push(`- [${k.contributor}] ${k.insight}`);
      }
    }

    return context.join('\n');
  }

  /**
   * Get sync token for cloud sync (Feature 20)
   */
  async prepareSync(): Promise<{ token: string; data: string }> {
    const token = crypto.randomBytes(16).toString('hex');
    this.store.syncToken = token;
    this.store.lastSync = new Date();
    await this.save();

    return {
      token,
      data: JSON.stringify(this.store),
    };
  }

  /**
   * Apply sync from cloud (Feature 20)
   */
  async applySync(data: string, _token: string): Promise<boolean> {
    try {
      const incoming = JSON.parse(data);

      // Merge strategies
      // - Journal entries: union by ID
      // - Shared knowledge: union by ID
      // - Profiles: merge specializations

      for (const [name, incomingProfile] of Object.entries(incoming.profiles || {})) {
        const existing = this.store.profiles[name];
        if (existing) {
          const ip = incomingProfile as Record<string, unknown>;

          // Merge journal entries
          const existingIds = new Set(existing.journal.map((j) => j.id));
          for (const entry of (ip.journal as Array<Record<string, unknown>>) || []) {
            if (!existingIds.has(entry.id as string)) {
              existing.journal.push({
                ...(entry as unknown as JournalEntry),
                timestamp: new Date(entry.timestamp as string),
              });
            }
          }

          // Merge specializations
          for (const [topic, score] of Object.entries(
            (ip.specializations as Record<string, number>) || {},
          )) {
            const current = existing.specializations.get(topic) || 0;
            existing.specializations.set(
              topic,
              Math.max(current, typeof score === 'number' ? score : 0),
            );
          }
        }
      }

      // Merge shared knowledge
      const existingKnowledgeIds = new Set(this.store.sharedKnowledge.map((k) => k.id));
      for (const knowledge of incoming.sharedKnowledge || []) {
        if (!existingKnowledgeIds.has(knowledge.id)) {
          this.store.sharedKnowledge.push({
            ...knowledge,
            created: new Date(knowledge.created),
          });
        }
      }

      this.store.lastSync = new Date();
      await this.save();

      console.log(chalk.green('Sync applied successfully'));
      return true;
    } catch (error) {
      console.error(chalk.red('Sync failed:', error));
      return false;
    }
  }

  /**
   * Get agent profile
   */
  getProfile(agent: AgentName): AgentProfile | undefined {
    return this.store.profiles[agent];
  }

  /**
   * Get all agents summary
   */
  getSummary(): Array<{ name: string; tasks: number; successRate: number; specialty: string }> {
    return Object.values(this.store.profiles).map((p) => ({
      name: p.name,
      tasks: p.totalTasks,
      successRate: p.successRate,
      specialty: p.specialty,
    }));
  }

  /**
   * Print summary
   */
  printSummary(): void {
    console.log(chalk.cyan('\n═══ Agent Memory Summary ═══\n'));

    const summary = this.getSummary();
    for (const agent of summary) {
      const successIcon = agent.successRate > 0.8 ? '🌟' : agent.successRate > 0.5 ? '✓' : '○';
      console.log(
        chalk.gray(
          `${successIcon} ${agent.name.padEnd(12)} ${agent.tasks.toString().padStart(4)} tasks  ` +
            `${(agent.successRate * 100).toFixed(0).padStart(3)}% success`,
        ),
      );
    }

    console.log(chalk.gray(`\nShared knowledge items: ${this.store.sharedKnowledge.length}`));
    if (this.store.lastSync) {
      console.log(chalk.gray(`Last sync: ${this.store.lastSync.toISOString()}`));
    }
    console.log('');
  }
}

export const agentMemory = new AgentMemory();
