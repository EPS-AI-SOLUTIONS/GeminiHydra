/**
 * TaskTemplating - Feature #19 from ExecutionEngine
 *
 * Handles task templates for common workflows like code review,
 * new feature implementation, bug fixes, etc.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';
import { GEMINIHYDRA_DIR } from '../../config/paths.config.js';
import type { SwarmTask } from '../../types/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface TaskTemplateStructure {
  agent: string;
  taskTemplate: string;
  dependencies: number[];
}

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  pattern: RegExp;
  taskStructure: TaskTemplateStructure[];
  variables: string[];
  usageCount: number;
  lastUsed: Date;
}

export interface TaskTemplateJSON {
  id: string;
  name: string;
  description: string;
  pattern: string;
  taskStructure: TaskTemplateStructure[];
  variables: string[];
  usageCount: number;
  lastUsed: string;
}

// =============================================================================
// BUILT-IN TEMPLATES
// =============================================================================

const BUILT_IN_TEMPLATES: TaskTemplate[] = [
  {
    id: 'code_review',
    name: 'Code Review',
    description: 'Review code for quality and issues',
    pattern: /(?:review|przejrzyj|sprawdź)\s+(?:kod|code|plik|file)/i,
    taskStructure: [
      {
        agent: 'geralt',
        taskTemplate: 'Przeanalizuj bezpieczeństwo kodu w {file}',
        dependencies: [],
      },
      {
        agent: 'yennefer',
        taskTemplate: 'Sprawdź architekturę i wzorce w {file}',
        dependencies: [],
      },
      { agent: 'lambert', taskTemplate: 'Znajdź potencjalne bugi w {file}', dependencies: [] },
      {
        agent: 'regis',
        taskTemplate: 'Podsumuj wyniki review dla {file}',
        dependencies: [1, 2, 3],
      },
    ],
    variables: ['file'],
    usageCount: 0,
    lastUsed: new Date(),
  },
  {
    id: 'new_feature',
    name: 'New Feature',
    description: 'Implement a new feature',
    pattern:
      /(?:dodaj|add|implement|zaimplementuj|stwórz|create)\s+(?:feature|funkcję|funkcjonalność)/i,
    taskStructure: [
      { agent: 'dijkstra', taskTemplate: 'Zaplanuj implementację {feature}', dependencies: [] },
      {
        agent: 'yennefer',
        taskTemplate: 'Zaprojektuj architekturę dla {feature}',
        dependencies: [1],
      },
      { agent: 'ciri', taskTemplate: 'Zaimplementuj {feature}', dependencies: [2] },
      { agent: 'triss', taskTemplate: 'Napisz testy dla {feature}', dependencies: [3] },
    ],
    variables: ['feature'],
    usageCount: 0,
    lastUsed: new Date(),
  },
  {
    id: 'bug_fix',
    name: 'Bug Fix',
    description: 'Fix a bug',
    pattern: /(?:napraw|fix|debug|znajdź)\s+(?:bug|błąd|error|problem)/i,
    taskStructure: [
      { agent: 'lambert', taskTemplate: 'Zdiagnozuj przyczynę {bug}', dependencies: [] },
      { agent: 'ciri', taskTemplate: 'Napraw {bug}', dependencies: [1] },
      { agent: 'triss', taskTemplate: 'Zweryfikuj poprawkę dla {bug}', dependencies: [2] },
    ],
    variables: ['bug'],
    usageCount: 0,
    lastUsed: new Date(),
  },
  {
    id: 'refactoring',
    name: 'Refactoring',
    description: 'Refactor existing code',
    pattern: /(?:refactor|refaktoryzuj|przebuduj|reorganizuj)/i,
    taskStructure: [
      { agent: 'yennefer', taskTemplate: 'Przeanalizuj architekturę {target}', dependencies: [] },
      { agent: 'dijkstra', taskTemplate: 'Zaplanuj refaktoryzację {target}', dependencies: [1] },
      { agent: 'ciri', taskTemplate: 'Przeprowadź refaktoryzację {target}', dependencies: [2] },
      { agent: 'triss', taskTemplate: 'Zweryfikuj refaktoryzację {target}', dependencies: [3] },
    ],
    variables: ['target'],
    usageCount: 0,
    lastUsed: new Date(),
  },
  {
    id: 'testing',
    name: 'Testing',
    description: 'Create tests for code',
    pattern: /(?:test|przetestuj|napisz testy|create tests)/i,
    taskStructure: [
      {
        agent: 'triss',
        taskTemplate: 'Zaprojektuj strategię testowania dla {target}',
        dependencies: [],
      },
      { agent: 'triss', taskTemplate: 'Napisz testy jednostkowe dla {target}', dependencies: [1] },
      { agent: 'triss', taskTemplate: 'Napisz testy integracyjne dla {target}', dependencies: [2] },
    ],
    variables: ['target'],
    usageCount: 0,
    lastUsed: new Date(),
  },
];

// =============================================================================
// TASK TEMPLATE MANAGER CLASS
// =============================================================================

class TaskTemplateManager {
  private templates: Map<string, TaskTemplate> = new Map();
  private storePath: string;
  private initialized: boolean = false;

  constructor(storePath: string = path.join(GEMINIHYDRA_DIR, 'templates')) {
    this.storePath = storePath;
  }

  /**
   * Initialize with built-in templates
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Load built-in templates
    for (const template of BUILT_IN_TEMPLATES) {
      this.templates.set(template.id, { ...template });
    }

    // Load custom templates from disk
    await this.loadCustom();

    this.initialized = true;
    console.log(chalk.gray(`[Templates] Loaded ${this.templates.size} templates`));
  }

  /**
   * Load custom templates
   */
  private async loadCustom(): Promise<void> {
    try {
      await fs.mkdir(this.storePath, { recursive: true });
      const files = await fs.readdir(this.storePath);

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(this.storePath, file), 'utf-8');
            const templateJSON = JSON.parse(content) as TaskTemplateJSON;
            const template: TaskTemplate = {
              ...templateJSON,
              pattern: new RegExp(templateJSON.pattern, 'i'),
              lastUsed: new Date(templateJSON.lastUsed),
            };
            this.templates.set(template.id, template);
          } catch (_error) {
            console.log(chalk.yellow(`[Templates] Failed to load ${file}`));
          }
        }
      }
    } catch {
      // Directory doesn't exist yet, that's OK
    }
  }

  /**
   * Match objective to template
   */
  matchTemplate(objective: string): TaskTemplate | null {
    const templates = Array.from(this.templates.values());
    for (const template of templates) {
      if (template.pattern.test(objective)) {
        return template;
      }
    }
    return null;
  }

  /**
   * Apply template to create tasks
   */
  applyTemplate(template: TaskTemplate, variables: Record<string, string>): SwarmTask[] {
    template.usageCount++;
    template.lastUsed = new Date();

    return template.taskStructure.map((struct, idx) => {
      let taskText = struct.taskTemplate;

      // Replace variables
      for (const [key, value] of Object.entries(variables)) {
        taskText = taskText.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }

      return {
        id: idx + 1,
        agent: struct.agent as unknown as SwarmTask['agent'],
        task: taskText,
        dependencies: struct.dependencies,
        status: 'pending' as const,
        retryCount: 0,
      };
    });
  }

  /**
   * Extract variables from objective
   */
  extractVariables(objective: string, template: TaskTemplate): Record<string, string> {
    const variables: Record<string, string> = {};

    // Simple extraction heuristics
    for (const varName of template.variables) {
      // Try to find the variable value in the objective
      const patterns: RegExp[] = [
        new RegExp(`${varName}[:\\s]+["']?([^"']+)["']?`, 'i'),
        /["']([^"']+)["']/i,
        /\b(\S+\.\w+)\b/i, // File pattern
      ];

      for (const pattern of patterns) {
        const match = objective.match(pattern);
        if (match) {
          variables[varName] = match[1];
          break;
        }
      }

      // Fallback
      if (!variables[varName]) {
        variables[varName] = `[${varName}]`;
      }
    }

    return variables;
  }

  /**
   * Save custom template
   */
  async saveTemplate(template: Omit<TaskTemplate, 'usageCount' | 'lastUsed'>): Promise<void> {
    const fullTemplate: TaskTemplate = {
      ...template,
      usageCount: 0,
      lastUsed: new Date(),
    };

    this.templates.set(template.id, fullTemplate);

    // Persist
    await fs.mkdir(this.storePath, { recursive: true });
    const filePath = path.join(this.storePath, `${template.id}.json`);
    const templateJSON: TaskTemplateJSON = {
      ...fullTemplate,
      pattern: fullTemplate.pattern.source,
      lastUsed: fullTemplate.lastUsed.toISOString(),
    };
    await fs.writeFile(filePath, JSON.stringify(templateJSON, null, 2));

    console.log(chalk.green(`[Templates] Saved template: ${template.name}`));
  }

  /**
   * Delete template
   */
  async deleteTemplate(id: string): Promise<boolean> {
    if (!this.templates.has(id)) {
      return false;
    }

    this.templates.delete(id);

    try {
      const filePath = path.join(this.storePath, `${id}.json`);
      await fs.unlink(filePath);
    } catch {
      // File might not exist
    }

    return true;
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): TaskTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Get all templates
   */
  getAllTemplates(): TaskTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get popular templates
   */
  getPopularTemplates(limit: number = 5): TaskTemplate[] {
    return Array.from(this.templates.values())
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }

  /**
   * Get recently used templates
   */
  getRecentTemplates(limit: number = 5): TaskTemplate[] {
    return Array.from(this.templates.values())
      .sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime())
      .slice(0, limit);
  }

  /**
   * Get template count
   */
  getTemplateCount(): number {
    return this.templates.size;
  }

  /**
   * Check if template exists
   */
  hasTemplate(id: string): boolean {
    return this.templates.has(id);
  }

  /**
   * Create template from tasks (learning)
   */
  createTemplateFromTasks(
    id: string,
    name: string,
    description: string,
    pattern: RegExp,
    tasks: SwarmTask[],
    variables: string[],
  ): TaskTemplate {
    const taskStructure: TaskTemplateStructure[] = tasks.map((task) => ({
      agent: task.agent,
      taskTemplate: task.task,
      dependencies: task.dependencies,
    }));

    const template: TaskTemplate = {
      id,
      name,
      description,
      pattern,
      taskStructure,
      variables,
      usageCount: 1,
      lastUsed: new Date(),
    };

    this.templates.set(id, template);

    return template;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const taskTemplateManager = new TaskTemplateManager();

// Export class for testing purposes
export { TaskTemplateManager };
