/**
 * Project Context - Project Awareness
 * Agent: Yennefer (Architecture)
 *
 * Features:
 * - Project structure indexing
 * - Dependency analysis
 * - Git history awareness
 * - Code symbol extraction
 */

import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import chalk from 'chalk';

const execAsync = promisify(exec);

interface ProjectFile {
  path: string;
  relativePath: string;
  type: string;
  size: number;
  lastModified: Date;
}

interface ProjectDependency {
  name: string;
  version: string;
  type: 'production' | 'dev';
}

interface GitInfo {
  branch: string;
  lastCommit: string;
  uncommittedChanges: number;
  recentCommits: string[];
}

interface ProjectIndex {
  name: string;
  root: string;
  type: 'nodejs' | 'python' | 'rust' | 'unknown';
  files: ProjectFile[];
  dependencies: ProjectDependency[];
  git?: GitInfo;
  symbols: Map<string, string[]>;
  indexed: Date;
}

const CONFIG_DIR = '.geminihydra';
const INDEX_FILE = 'project-index.json';

export class ProjectContext {
  private index: ProjectIndex | null = null;
  private root: string;

  constructor(root: string = process.cwd()) {
    this.root = path.resolve(root);
  }

  /**
   * Initialize project context (gemini init)
   */
  async init(): Promise<void> {
    console.log(chalk.cyan('\n🔍 Initializing Project Context...\n'));

    // Create config directory
    const configPath = path.join(this.root, CONFIG_DIR);
    await fs.mkdir(configPath, { recursive: true });

    // Detect project type
    const projectType = await this.detectProjectType();
    console.log(chalk.gray(`Project type: ${projectType}`));

    // Index project
    this.index = {
      name: path.basename(this.root),
      root: this.root,
      type: projectType,
      files: [],
      dependencies: [],
      symbols: new Map(),
      indexed: new Date(),
    };

    // Scan files
    console.log(chalk.gray('Scanning files...'));
    this.index.files = await this.scanFiles(this.root);
    console.log(chalk.gray(`Found ${this.index.files.length} files`));

    // Parse dependencies
    console.log(chalk.gray('Parsing dependencies...'));
    this.index.dependencies = await this.parseDependencies();
    console.log(chalk.gray(`Found ${this.index.dependencies.length} dependencies`));

    // Get git info
    console.log(chalk.gray('Reading git history...'));
    this.index.git = await this.getGitInfo();

    // Extract symbols (simplified)
    console.log(chalk.gray('Extracting symbols...'));
    await this.extractSymbols();

    // Save index
    await this.saveIndex();

    console.log(chalk.green('\n✓ Project indexed successfully!'));
    this.printSummary();
  }

  /**
   * Detect project type
   */
  private async detectProjectType(): Promise<'nodejs' | 'python' | 'rust' | 'unknown'> {
    try {
      await fs.access(path.join(this.root, 'package.json'));
      return 'nodejs';
    } catch {}

    try {
      await fs.access(path.join(this.root, 'requirements.txt'));
      return 'python';
    } catch {}

    try {
      await fs.access(path.join(this.root, 'pyproject.toml'));
      return 'python';
    } catch {}

    try {
      await fs.access(path.join(this.root, 'Cargo.toml'));
      return 'rust';
    } catch {}

    return 'unknown';
  }

  /**
   * Scan files in directory
   */
  private async scanFiles(dir: string, files: ProjectFile[] = []): Promise<ProjectFile[]> {
    const ignoreDirs = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '__pycache__',
      'target',
      '.geminihydra',
    ];

    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(this.root, fullPath);

      if (entry.isDirectory()) {
        if (!ignoreDirs.includes(entry.name)) {
          await this.scanFiles(fullPath, files);
        }
      } else {
        const stats = await fs.stat(fullPath);
        const ext = path.extname(entry.name).slice(1) || 'unknown';

        files.push({
          path: fullPath,
          relativePath,
          type: ext,
          size: stats.size,
          lastModified: stats.mtime,
        });
      }
    }

    return files;
  }

  /**
   * Parse project dependencies
   */
  private async parseDependencies(): Promise<ProjectDependency[]> {
    const deps: ProjectDependency[] = [];

    if (this.index?.type === 'nodejs') {
      try {
        const pkgJson = JSON.parse(
          await fs.readFile(path.join(this.root, 'package.json'), 'utf-8'),
        );

        for (const [name, version] of Object.entries(pkgJson.dependencies || {})) {
          deps.push({ name, version: version as string, type: 'production' });
        }

        for (const [name, version] of Object.entries(pkgJson.devDependencies || {})) {
          deps.push({ name, version: version as string, type: 'dev' });
        }
      } catch {}
    }

    return deps;
  }

  /**
   * Get git information
   */
  private async getGitInfo(): Promise<GitInfo | undefined> {
    try {
      const { stdout: branch } = await execAsync('git branch --show-current', { cwd: this.root });
      const { stdout: lastCommit } = await execAsync('git log -1 --pretty=format:"%h %s"', {
        cwd: this.root,
      });
      const { stdout: status } = await execAsync('git status --porcelain', { cwd: this.root });
      const { stdout: recentLog } = await execAsync('git log -5 --pretty=format:"%h %s"', {
        cwd: this.root,
      });

      return {
        branch: branch.trim(),
        lastCommit: lastCommit.trim(),
        uncommittedChanges: status.split('\n').filter((l) => l.trim()).length,
        recentCommits: recentLog.split('\n'),
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Extract code symbols (simplified)
   */
  private async extractSymbols(): Promise<void> {
    if (!this.index) return;

    const codeFiles = this.index.files.filter((f) =>
      ['ts', 'js', 'tsx', 'jsx', 'py', 'rs'].includes(f.type),
    );

    for (const file of codeFiles.slice(0, 100)) {
      // Limit to 100 files
      try {
        const content = await fs.readFile(file.path, 'utf-8');
        const symbols: string[] = [];

        // Extract function/class names (simplified regex)
        const functionMatches = content.matchAll(/(?:function|class|const|export)\s+(\w+)/g);
        for (const match of functionMatches) {
          symbols.push(match[1]);
        }

        if (symbols.length > 0) {
          this.index.symbols.set(file.relativePath, symbols);
        }
      } catch {}
    }
  }

  /**
   * Save index to disk
   */
  private async saveIndex(): Promise<void> {
    if (!this.index) return;

    const indexPath = path.join(this.root, CONFIG_DIR, INDEX_FILE);

    // Convert Map to object for JSON serialization
    const serializable = {
      ...this.index,
      symbols: Object.fromEntries(this.index.symbols),
    };

    await fs.writeFile(indexPath, JSON.stringify(serializable, null, 2), 'utf-8');
  }

  /**
   * Load existing index
   */
  async load(): Promise<boolean> {
    try {
      const indexPath = path.join(this.root, CONFIG_DIR, INDEX_FILE);
      const data = JSON.parse(await fs.readFile(indexPath, 'utf-8'));

      this.index = {
        ...data,
        symbols: new Map(Object.entries(data.symbols || {})),
        indexed: new Date(data.indexed),
      };

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get context for a task
   */
  getContextForTask(task: string): string {
    if (!this.index) return '';

    const context: string[] = [];

    context.push(`Project: ${this.index.name} (${this.index.type})`);
    context.push(`Files: ${this.index.files.length}`);
    context.push(`Dependencies: ${this.index.dependencies.length}`);

    if (this.index.git) {
      context.push(`Branch: ${this.index.git.branch}`);
      context.push(`Last commit: ${this.index.git.lastCommit}`);
      if (this.index.git.uncommittedChanges > 0) {
        context.push(`Uncommitted changes: ${this.index.git.uncommittedChanges}`);
      }
    }

    // Find relevant files based on task keywords
    const keywords = task.toLowerCase().split(/\s+/);
    const relevantFiles = this.index.files
      .filter((f) => keywords.some((k) => f.relativePath.toLowerCase().includes(k)))
      .slice(0, 10);

    if (relevantFiles.length > 0) {
      context.push('\nRelevant files:');
      for (const f of relevantFiles) context.push(`  - ${f.relativePath}`);
    }

    return context.join('\n');
  }

  /**
   * Print project summary
   */
  printSummary(): void {
    if (!this.index) return;

    console.log(chalk.cyan('\n═══ Project Summary ═══'));
    console.log(chalk.gray(`Name: ${this.index.name}`));
    console.log(chalk.gray(`Type: ${this.index.type}`));
    console.log(chalk.gray(`Files: ${this.index.files.length}`));
    console.log(chalk.gray(`Dependencies: ${this.index.dependencies.length}`));

    if (this.index.git) {
      console.log(chalk.gray(`Branch: ${this.index.git.branch}`));
      console.log(chalk.gray(`Uncommitted: ${this.index.git.uncommittedChanges}`));
    }

    // File types breakdown
    const typeCount: Record<string, number> = {};
    this.index.files.forEach((f) => {
      typeCount[f.type] = (typeCount[f.type] || 0) + 1;
    });

    console.log(chalk.gray('\nFile types:'));
    Object.entries(typeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([type, count]) => {
        console.log(chalk.gray(`  .${type}: ${count}`));
      });

    console.log('');
  }

  /**
   * Get project index
   */
  getIndex(): ProjectIndex | null {
    return this.index;
  }
}
