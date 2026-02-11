/**
 * MultiProjectManager.ts - Feature #40: Multi-Project Support
 *
 * Manages multiple projects simultaneously in a workspace.
 * Features:
 * - Project registration and management
 * - Automatic project type detection
 * - Recent projects tracking
 * - Project switching
 * - Workspace persistence
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

// ============================================================
// Types
// ============================================================

export type ProjectType = 'node' | 'python' | 'rust' | 'go' | 'java' | 'dotnet' | 'unknown';

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  type: ProjectType;
  lastAccessed: number;
  config?: Record<string, unknown>;
  tags?: string[];
  description?: string;
}

export interface ProjectWorkspace {
  activeProject: string | null;
  projects: Map<string, ProjectInfo>;
  recentProjects: string[]; // IDs
}

export interface ProjectFilter {
  type?: ProjectType;
  tags?: string[];
  namePattern?: string | RegExp;
}

// ============================================================
// MultiProjectManager Class
// ============================================================

export class MultiProjectManager {
  private workspace: ProjectWorkspace = {
    activeProject: null,
    projects: new Map(),
    recentProjects: [],
  };
  private persistPath: string;
  private maxRecent: number = 10;

  constructor(persistPath?: string) {
    this.persistPath = persistPath || path.join(process.cwd(), '.gemini', 'workspace.json');
  }

  /**
   * Initializes the project manager, loading saved workspace
   */
  async initialize(): Promise<void> {
    try {
      const data = await fs.readFile(this.persistPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.workspace.projects = new Map(Object.entries(parsed.projects || {}));
      this.workspace.activeProject = parsed.activeProject;
      this.workspace.recentProjects = parsed.recentProjects || [];
      console.log(chalk.gray(`[ProjectManager] Loaded ${this.workspace.projects.size} projects`));
    } catch {
      // Fresh start
      console.log(chalk.gray('[ProjectManager] Starting with empty workspace'));
    }
  }

  /**
   * Adds a new project to the workspace
   * @param projectPath - Path to the project directory
   * @param name - Optional project name (defaults to directory name)
   * @param options - Additional project options
   * @returns Created project info
   */
  async addProject(
    projectPath: string,
    name?: string,
    options: { tags?: string[]; description?: string; config?: Record<string, unknown> } = {},
  ): Promise<ProjectInfo> {
    const resolvedPath = path.resolve(projectPath);

    // Check if project already exists
    const existing = this.findProjectByPath(resolvedPath);
    if (existing) {
      console.log(chalk.yellow(`[ProjectManager] Project already exists: ${existing.name}`));
      return existing;
    }

    const type = await this.detectProjectType(resolvedPath);

    const project: ProjectInfo = {
      id: crypto.randomUUID(),
      name: name || path.basename(resolvedPath),
      path: resolvedPath,
      type,
      lastAccessed: Date.now(),
      tags: options.tags,
      description: options.description,
      config: options.config,
    };

    this.workspace.projects.set(project.id, project);
    this.workspace.activeProject = project.id;
    this.addToRecent(project.id);

    console.log(chalk.cyan(`[ProjectManager] Added project: ${project.name} (${type})`));
    return project;
  }

  /**
   * Detects the project type based on configuration files
   * @param projectPath - Path to the project directory
   * @returns Detected project type
   */
  private async detectProjectType(projectPath: string): Promise<ProjectType> {
    const checks: { file: string; type: ProjectType }[] = [
      { file: 'package.json', type: 'node' },
      { file: 'requirements.txt', type: 'python' },
      { file: 'pyproject.toml', type: 'python' },
      { file: 'setup.py', type: 'python' },
      { file: 'Pipfile', type: 'python' },
      { file: 'Cargo.toml', type: 'rust' },
      { file: 'go.mod', type: 'go' },
      { file: 'pom.xml', type: 'java' },
      { file: 'build.gradle', type: 'java' },
      { file: 'build.gradle.kts', type: 'java' },
      { file: '*.csproj', type: 'dotnet' },
      { file: '*.sln', type: 'dotnet' },
    ];

    for (const check of checks) {
      try {
        if (check.file.includes('*')) {
          // Glob pattern - check if any matching file exists
          const files = await fs.readdir(projectPath);
          const pattern = check.file.replace('*', '');
          if (files.some((f) => f.endsWith(pattern))) {
            return check.type;
          }
        } else {
          await fs.access(path.join(projectPath, check.file));
          return check.type;
        }
      } catch {
        // File doesn't exist, continue checking
      }
    }

    return 'unknown';
  }

  /**
   * Finds a project by its path
   * @param projectPath - Path to search for
   * @returns Project info or undefined
   */
  findProjectByPath(projectPath: string): ProjectInfo | undefined {
    const resolved = path.resolve(projectPath);
    for (const project of this.workspace.projects.values()) {
      if (project.path === resolved) {
        return project;
      }
    }
    return undefined;
  }

  /**
   * Finds a project by its name
   * @param name - Name to search for
   * @returns Project info or undefined
   */
  findProjectByName(name: string): ProjectInfo | undefined {
    for (const project of this.workspace.projects.values()) {
      if (project.name.toLowerCase() === name.toLowerCase()) {
        return project;
      }
    }
    return undefined;
  }

  /**
   * Switches to a different project
   * @param projectId - Project ID to switch to
   * @returns True if switched, false if not found
   */
  switchProject(projectId: string): boolean {
    if (!this.workspace.projects.has(projectId)) {
      console.log(chalk.red(`[ProjectManager] Project not found: ${projectId}`));
      return false;
    }

    const project = this.workspace.projects.get(projectId);
    if (!project) return false;
    project.lastAccessed = Date.now();
    this.workspace.activeProject = projectId;
    this.addToRecent(projectId);

    console.log(chalk.green(`[ProjectManager] Switched to: ${project.name}`));
    return true;
  }

  /**
   * Switches to a project by name
   * @param name - Project name to switch to
   * @returns True if switched, false if not found
   */
  switchProjectByName(name: string): boolean {
    const project = this.findProjectByName(name);
    if (!project) {
      console.log(chalk.red(`[ProjectManager] Project not found: ${name}`));
      return false;
    }
    return this.switchProject(project.id);
  }

  /**
   * Updates recent projects list
   * @param projectId - Project ID to add to recent
   */
  private addToRecent(projectId: string): void {
    this.workspace.recentProjects = this.workspace.recentProjects.filter((id) => id !== projectId);
    this.workspace.recentProjects.unshift(projectId);
    if (this.workspace.recentProjects.length > this.maxRecent) {
      this.workspace.recentProjects.pop();
    }
  }

  /**
   * Gets the currently active project
   * @returns Active project info or null
   */
  getActiveProject(): ProjectInfo | null {
    if (!this.workspace.activeProject) return null;
    return this.workspace.projects.get(this.workspace.activeProject) || null;
  }

  /**
   * Gets a project by ID
   * @param projectId - Project ID
   * @returns Project info or undefined
   */
  getProject(projectId: string): ProjectInfo | undefined {
    return this.workspace.projects.get(projectId);
  }

  /**
   * Lists all projects, optionally filtered
   * @param filter - Optional filter criteria
   * @returns Array of matching projects
   */
  listProjects(filter?: ProjectFilter): ProjectInfo[] {
    let projects = Array.from(this.workspace.projects.values());

    if (filter) {
      if (filter.type) {
        projects = projects.filter((p) => p.type === filter.type);
      }
      if (filter.tags && filter.tags.length > 0) {
        projects = projects.filter((p) => p.tags && filter.tags?.some((t) => p.tags?.includes(t)));
      }
      if (filter.namePattern) {
        const regex =
          typeof filter.namePattern === 'string'
            ? new RegExp(filter.namePattern, 'i')
            : filter.namePattern;
        projects = projects.filter((p) => regex.test(p.name));
      }
    }

    return projects.sort((a, b) => b.lastAccessed - a.lastAccessed);
  }

  /**
   * Gets recently accessed projects
   * @param limit - Maximum number of projects to return
   * @returns Array of recent projects
   */
  getRecentProjects(limit?: number): ProjectInfo[] {
    const recentIds = limit
      ? this.workspace.recentProjects.slice(0, limit)
      : this.workspace.recentProjects;

    return recentIds.map((id) => this.workspace.projects.get(id)).filter(Boolean) as ProjectInfo[];
  }

  /**
   * Updates a project's metadata
   * @param projectId - Project ID to update
   * @param updates - Partial project info to update
   * @returns Updated project or null if not found
   */
  updateProject(
    projectId: string,
    updates: Partial<Omit<ProjectInfo, 'id' | 'path'>>,
  ): ProjectInfo | null {
    const project = this.workspace.projects.get(projectId);
    if (!project) {
      console.log(chalk.red(`[ProjectManager] Project not found: ${projectId}`));
      return null;
    }

    const updated: ProjectInfo = {
      ...project,
      ...updates,
      id: project.id, // Preserve ID
      path: project.path, // Preserve path
    };

    this.workspace.projects.set(projectId, updated);
    console.log(chalk.cyan(`[ProjectManager] Updated project: ${updated.name}`));
    return updated;
  }

  /**
   * Adds tags to a project
   * @param projectId - Project ID
   * @param tags - Tags to add
   */
  addTags(projectId: string, tags: string[]): void {
    const project = this.workspace.projects.get(projectId);
    if (!project) return;

    project.tags = [...new Set([...(project.tags || []), ...tags])];
    console.log(chalk.gray(`[ProjectManager] Added tags to ${project.name}: ${tags.join(', ')}`));
  }

  /**
   * Removes tags from a project
   * @param projectId - Project ID
   * @param tags - Tags to remove
   */
  removeTags(projectId: string, tags: string[]): void {
    const project = this.workspace.projects.get(projectId);
    if (!project || !project.tags) return;

    project.tags = project.tags.filter((t) => !tags.includes(t));
    console.log(
      chalk.gray(`[ProjectManager] Removed tags from ${project.name}: ${tags.join(', ')}`),
    );
  }

  /**
   * Removes a project from the workspace
   * @param projectId - Project ID to remove
   * @returns True if removed, false if not found
   */
  removeProject(projectId: string): boolean {
    if (!this.workspace.projects.has(projectId)) return false;

    const project = this.workspace.projects.get(projectId);
    if (!project) return false;
    this.workspace.projects.delete(projectId);
    this.workspace.recentProjects = this.workspace.recentProjects.filter((id) => id !== projectId);

    if (this.workspace.activeProject === projectId) {
      this.workspace.activeProject = this.workspace.recentProjects[0] || null;
    }

    console.log(chalk.yellow(`[ProjectManager] Removed project: ${project.name}`));
    return true;
  }

  /**
   * Gets all unique tags across all projects
   * @returns Array of unique tags
   */
  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const project of this.workspace.projects.values()) {
      if (project.tags) {
        for (const t of project.tags) tags.add(t);
      }
    }
    return Array.from(tags).sort();
  }

  /**
   * Gets project statistics
   * @returns Workspace statistics
   */
  getStats(): {
    totalProjects: number;
    byType: Record<ProjectType, number>;
    recentCount: number;
  } {
    const byType: Record<ProjectType, number> = {
      node: 0,
      python: 0,
      rust: 0,
      go: 0,
      java: 0,
      dotnet: 0,
      unknown: 0,
    };

    for (const project of this.workspace.projects.values()) {
      byType[project.type]++;
    }

    return {
      totalProjects: this.workspace.projects.size,
      byType,
      recentCount: this.workspace.recentProjects.length,
    };
  }

  /**
   * Persists workspace to disk
   */
  async persist(): Promise<void> {
    try {
      const dir = path.dirname(this.persistPath);
      await fs.mkdir(dir, { recursive: true });

      const data = {
        projects: Object.fromEntries(this.workspace.projects),
        activeProject: this.workspace.activeProject,
        recentProjects: this.workspace.recentProjects,
        lastSaved: Date.now(),
      };
      await fs.writeFile(this.persistPath, JSON.stringify(data, null, 2));
      console.log(chalk.gray('[ProjectManager] Workspace saved'));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`[ProjectManager] Persist failed: ${msg}`));
    }
  }
}

// ============================================================
// Formatting Functions
// ============================================================

/**
 * Formats project list for display
 * @param manager - MultiProjectManager instance
 * @returns Formatted string for console output
 */
export function formatProjectList(manager: MultiProjectManager): string {
  const lines: string[] = [];
  const projects = manager.listProjects();
  const active = manager.getActiveProject();
  const stats = manager.getStats();

  lines.push(chalk.cyan(`\n📁 WORKSPACE (${stats.totalProjects} projects)`));

  // Type breakdown
  const typeColors: Record<ProjectType, (text: string) => string> = {
    node: chalk.green,
    python: chalk.yellow,
    rust: chalk.red,
    go: chalk.cyan,
    java: chalk.magenta,
    dotnet: chalk.blue,
    unknown: chalk.gray,
  };

  const typeSummary = Object.entries(stats.byType)
    .filter(([_, count]) => count > 0)
    .map(([type, count]) => typeColors[type as ProjectType](`${type}: ${count}`))
    .join(', ');

  if (typeSummary) {
    lines.push(chalk.gray(`   Types: ${typeSummary}`));
  }
  lines.push('');

  // Project list
  for (const project of projects) {
    const isActive = active?.id === project.id;
    const marker = isActive ? chalk.green('► ') : '  ';
    const nameColor = isActive ? chalk.green : chalk.white;
    const typeColor = typeColors[project.type] || chalk.gray;

    lines.push(`${marker}${nameColor(project.name)} ${typeColor(`[${project.type}]`)}`);
    lines.push(chalk.gray(`     ${project.path}`));

    if (project.description) {
      lines.push(chalk.gray(`     ${project.description}`));
    }

    if (project.tags && project.tags.length > 0) {
      lines.push(chalk.blue(`     Tags: ${project.tags.join(', ')}`));
    }

    const lastAccessed = new Date(project.lastAccessed).toLocaleDateString();
    lines.push(chalk.gray(`     Last accessed: ${lastAccessed}`));
    lines.push('');
  }

  if (projects.length === 0) {
    lines.push(chalk.gray('   No projects in workspace'));
    lines.push(chalk.gray('   Use addProject() to add a project'));
  }

  return lines.join('\n');
}

/**
 * Formats recent projects for display
 * @param manager - MultiProjectManager instance
 * @param limit - Maximum number of projects to show
 * @returns Formatted string for console output
 */
export function formatRecentProjects(manager: MultiProjectManager, limit: number = 5): string {
  const lines: string[] = [];
  const recent = manager.getRecentProjects(limit);

  lines.push(chalk.cyan(`\n🕐 RECENT PROJECTS (${recent.length})`));
  lines.push('');

  for (let i = 0; i < recent.length; i++) {
    const project = recent[i];
    lines.push(`   ${i + 1}. ${chalk.white(project.name)} ${chalk.gray(`[${project.type}]`)}`);
    lines.push(chalk.gray(`      ${project.path}`));
  }

  if (recent.length === 0) {
    lines.push(chalk.gray('   No recent projects'));
  }

  return lines.join('\n');
}

// ============================================================
// Singleton Instance
// ============================================================

export const projectManager = new MultiProjectManager();

// ============================================================
// Default Export
// ============================================================

export default {
  MultiProjectManager,
  projectManager,
  formatProjectList,
  formatRecentProjects,
};
