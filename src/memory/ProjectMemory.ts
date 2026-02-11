/**
 * Project Context Memory (Features 11-15)
 * Agent: Yennefer (Architecture)
 *
 * 11. Code Symbol Index - Index of all functions/classes
 * 12. Dependency Graph - Graph of module dependencies
 * 13. Change History - Per-file change history with AI comments
 * 14. Pattern Library - Code patterns used in project
 * 15. Tech Debt Tracker - Track technical debt
 */

import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import chalk from 'chalk';
import { loadFromFile, saveToFile } from '../native/persistence.js';

const execAsync = promisify(exec);

// Symbol types
type SymbolType = 'class' | 'function' | 'method' | 'variable' | 'interface' | 'type' | 'enum';

interface CodeSymbol {
  name: string;
  type: SymbolType;
  file: string;
  line: number;
  signature?: string;
  docstring?: string;
  references: string[]; // Files that reference this symbol
}

interface FileDependency {
  file: string;
  imports: string[];
  exports: string[];
  dependencies: string[]; // Other files this depends on
}

interface ChangeRecord {
  file: string;
  timestamp: Date;
  type: 'create' | 'modify' | 'delete';
  summary: string;
  aiComment?: string;
  linesChanged: number;
}

interface CodePattern {
  name: string;
  description: string;
  files: string[];
  example: string;
  category: 'structural' | 'behavioral' | 'creational' | 'other';
}

interface TechDebt {
  id: string;
  file: string;
  line?: number;
  type: 'todo' | 'fixme' | 'hack' | 'complexity' | 'duplication' | 'deprecated';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  created: Date;
  resolved?: Date;
}

interface ProjectMemoryStore {
  root: string;
  symbols: CodeSymbol[];
  dependencies: FileDependency[];
  changes: ChangeRecord[];
  patterns: CodePattern[];
  techDebt: TechDebt[];
  indexed: Date;
}

const CONFIG_DIR = '.geminihydra';
const PROJECT_MEMORY_FILE = 'project-memory.json';

export class ProjectMemory {
  private store: ProjectMemoryStore | null = null;
  private root: string;

  constructor(root: string = process.cwd()) {
    this.root = path.resolve(root);
  }

  /**
   * Initialize project memory
   */
  async init(): Promise<void> {
    console.log(chalk.cyan('\n🔍 Indexing Project Memory...\n'));

    this.store = {
      root: this.root,
      symbols: [],
      dependencies: [],
      changes: [],
      patterns: [],
      techDebt: [],
      indexed: new Date(),
    };

    // Index symbols (Feature 11)
    console.log(chalk.gray('Indexing code symbols...'));
    await this.indexSymbols();

    // Build dependency graph (Feature 12)
    console.log(chalk.gray('Building dependency graph...'));
    await this.buildDependencyGraph();

    // Load change history (Feature 13)
    console.log(chalk.gray('Loading change history...'));
    await this.loadChangeHistory();

    // Detect patterns (Feature 14)
    console.log(chalk.gray('Detecting code patterns...'));
    await this.detectPatterns();

    // Scan for tech debt (Feature 15)
    console.log(chalk.gray('Scanning for tech debt...'));
    await this.scanTechDebt();

    await this.save();
    console.log(chalk.green('\n✓ Project memory initialized!'));
    this.printSummary();
  }

  /**
   * Index code symbols (Feature 11)
   */
  private async indexSymbols(): Promise<void> {
    const codeFiles = await this.findCodeFiles();

    for (const file of codeFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const relativePath = path.relative(this.root, file);
        const symbols = this.extractSymbols(content, relativePath);
        this.store?.symbols.push(...symbols);
      } catch {}
    }
  }

  /**
   * Extract symbols from code
   */
  private extractSymbols(content: string, file: string): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const lines = content.split('\n');

    // Function patterns
    const patterns = [
      {
        regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g,
        type: 'function' as SymbolType,
      },
      { regex: /(?:export\s+)?class\s+(\w+)/g, type: 'class' as SymbolType },
      { regex: /(?:export\s+)?interface\s+(\w+)/g, type: 'interface' as SymbolType },
      { regex: /(?:export\s+)?type\s+(\w+)/g, type: 'type' as SymbolType },
      { regex: /(?:export\s+)?enum\s+(\w+)/g, type: 'enum' as SymbolType },
      { regex: /(?:export\s+)?const\s+(\w+)\s*=/g, type: 'variable' as SymbolType },
      {
        regex: /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/g,
        type: 'method' as SymbolType,
      },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const { regex, type } of patterns) {
        regex.lastIndex = 0;
        let _match: RegExpExecArray | null;

        for (let match = regex.exec(line); match !== null; match = regex.exec(line)) {
          // Extract docstring (previous line comments)
          let docstring: string | undefined;
          if (i > 0) {
            const prevLines = lines.slice(Math.max(0, i - 5), i).reverse();
            const docLines: string[] = [];

            for (const prevLine of prevLines) {
              if (
                prevLine.trim().startsWith('*') ||
                prevLine.trim().startsWith('//') ||
                prevLine.trim().startsWith('/*')
              ) {
                docLines.unshift(prevLine.replace(/^\s*[/*]+\s*/, '').trim());
              } else if (prevLine.trim() === '') {
              } else {
                break;
              }
            }

            if (docLines.length > 0) {
              docstring = docLines.join(' ').trim();
            }
          }

          symbols.push({
            name: match[1],
            type,
            file,
            line: i + 1,
            signature: match[0],
            docstring,
            references: [],
          });
        }
      }
    }

    return symbols;
  }

  /**
   * Build dependency graph (Feature 12)
   */
  private async buildDependencyGraph(): Promise<void> {
    const codeFiles = await this.findCodeFiles();

    for (const file of codeFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const relativePath = path.relative(this.root, file);

        const imports = this.extractImports(content);
        const exports = this.extractExports(content);

        // Resolve local imports to file paths
        const dependencies = imports
          .filter((i) => i.startsWith('.'))
          .map((i) => this.resolveImport(relativePath, i))
          .filter((d): d is string => d !== null);

        this.store?.dependencies.push({
          file: relativePath,
          imports,
          exports,
          dependencies,
        });
      } catch {}
    }
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    for (let match = importRegex.exec(content); match !== null; match = importRegex.exec(content)) {
      imports.push(match[1]);
    }
    for (
      let match = requireRegex.exec(content);
      match !== null;
      match = requireRegex.exec(content)
    ) {
      imports.push(match[1]);
    }

    return imports;
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const exportRegex =
      /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g;

    for (let match = exportRegex.exec(content); match !== null; match = exportRegex.exec(content)) {
      exports.push(match[1]);
    }

    return exports;
  }

  private resolveImport(fromFile: string, importPath: string): string | null {
    const dir = path.dirname(fromFile);
    const resolved = path.join(dir, importPath);

    // Add common extensions
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx'];
    for (const ext of extensions) {
      const fullPath = resolved + ext;
      if (this.store?.dependencies.some((d) => d.file === fullPath)) {
        return fullPath;
      }
    }

    return resolved;
  }

  /**
   * Load change history from git (Feature 13)
   */
  private async loadChangeHistory(): Promise<void> {
    try {
      const { stdout } = await execAsync('git log --pretty=format:"%H|%ai|%s" --name-status -50', {
        cwd: this.root,
      });

      const commits = stdout.split('\n\n');

      for (const commit of commits) {
        const lines = commit.split('\n');
        if (lines.length < 2) continue;

        const [_hash, date, ...summaryParts] = lines[0].split('|');
        const summary = summaryParts.join('|');

        for (let i = 1; i < lines.length; i++) {
          const fileLine = lines[i];
          if (!fileLine) continue;

          const [status, ...fileParts] = fileLine.split('\t');
          const file = fileParts.join('\t');

          if (file) {
            this.store?.changes.push({
              file,
              timestamp: new Date(date),
              type: status === 'A' ? 'create' : status === 'D' ? 'delete' : 'modify',
              summary,
              linesChanged: 0,
            });
          }
        }
      }
    } catch {}
  }

  /**
   * Detect code patterns (Feature 14)
   */
  private async detectPatterns(): Promise<void> {
    // Singleton pattern
    const singletons =
      this.store?.symbols.filter(
        (s) => s.type === 'class' && s.signature?.includes('getInstance'),
      ) ?? [];
    if (singletons.length > 0) {
      this.store?.patterns.push({
        name: 'Singleton',
        description: 'Classes with getInstance method',
        files: singletons.map((s) => s.file),
        example: 'getInstance()',
        category: 'creational',
      });
    }

    // Factory pattern
    const factories =
      this.store?.symbols.filter(
        (s) => s.name.toLowerCase().includes('factory') || s.name.toLowerCase().includes('create'),
      ) ?? [];
    if (factories.length > 0) {
      this.store?.patterns.push({
        name: 'Factory',
        description: 'Factory functions/classes',
        files: [...new Set(factories.map((s) => s.file))],
        example: 'createXxx()',
        category: 'creational',
      });
    }

    // Observer/Event pattern
    const observers =
      this.store?.symbols.filter(
        (s) =>
          s.name.toLowerCase().includes('listener') ||
          s.name.toLowerCase().includes('handler') ||
          s.name.toLowerCase().includes('subscriber'),
      ) ?? [];
    if (observers.length > 0) {
      this.store?.patterns.push({
        name: 'Observer',
        description: 'Event listeners/handlers',
        files: [...new Set(observers.map((s) => s.file))],
        example: 'onXxx(), handleXxx()',
        category: 'behavioral',
      });
    }
  }

  /**
   * Scan for technical debt (Feature 15)
   */
  private async scanTechDebt(): Promise<void> {
    const codeFiles = await this.findCodeFiles();

    for (const file of codeFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const relativePath = path.relative(this.root, file);
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // TODO/FIXME/HACK comments
          const todoMatch = line.match(/\/\/\s*(TODO|FIXME|HACK|XXX)[\s:]+(.+)/i);
          if (todoMatch) {
            this.store?.techDebt.push({
              id: `${relativePath}:${i + 1}`,
              file: relativePath,
              line: i + 1,
              type: todoMatch[1].toLowerCase() as TechDebt['type'],
              description: todoMatch[2].trim(),
              severity: todoMatch[1].toLowerCase() === 'fixme' ? 'high' : 'medium',
              created: new Date(),
            });
          }

          // @deprecated
          if (line.includes('@deprecated')) {
            this.store?.techDebt.push({
              id: `${relativePath}:${i + 1}:deprecated`,
              file: relativePath,
              line: i + 1,
              type: 'deprecated',
              description: 'Deprecated code',
              severity: 'medium',
              created: new Date(),
            });
          }
        }

        // Check for large files (complexity)
        if (lines.length > 500) {
          this.store?.techDebt.push({
            id: `${relativePath}:complexity`,
            file: relativePath,
            type: 'complexity',
            description: `Large file (${lines.length} lines)`,
            severity: lines.length > 1000 ? 'high' : 'medium',
            created: new Date(),
          });
        }
      } catch {}
    }
  }

  /**
   * Find all code files
   */
  private async findCodeFiles(): Promise<string[]> {
    const files: string[] = [];
    const ignoreDirs = ['node_modules', '.git', 'dist', 'build', 'coverage', '.geminihydra'];

    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!ignoreDirs.includes(entry.name)) {
            await walk(fullPath);
          }
        } else {
          const ext = path.extname(entry.name);
          if (['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go'].includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    };

    await walk(this.root);
    return files;
  }

  /**
   * Save project memory
   */
  async save(): Promise<void> {
    if (!this.store) return;

    const configDir = path.join(this.root, CONFIG_DIR);
    await fs.mkdir(configDir, { recursive: true });

    const filePath = path.join(configDir, PROJECT_MEMORY_FILE);
    await saveToFile(filePath, this.store);
  }

  /**
   * Load project memory
   */
  async load(): Promise<boolean> {
    const filePath = path.join(this.root, CONFIG_DIR, PROJECT_MEMORY_FILE);
    const data = await loadFromFile<ProjectMemoryStore>(filePath);
    if (data) {
      this.store = data;
      return true;
    }
    return false;
  }

  /**
   * Get symbol by name
   */
  findSymbol(name: string): CodeSymbol[] {
    if (!this.store) return [];
    return this.store.symbols.filter((s) => s.name.toLowerCase().includes(name.toLowerCase()));
  }

  /**
   * Get dependencies for a file
   */
  getDependencies(file: string): string[] {
    if (!this.store) return [];
    const dep = this.store.dependencies.find((d) => d.file === file);
    return dep?.dependencies || [];
  }

  /**
   * Get dependents (files that depend on this file)
   */
  getDependents(file: string): string[] {
    if (!this.store) return [];
    return this.store.dependencies.filter((d) => d.dependencies.includes(file)).map((d) => d.file);
  }

  /**
   * Get tech debt summary
   */
  getTechDebtSummary(): {
    total: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  } {
    if (!this.store) return { total: 0, bySeverity: {}, byType: {} };

    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const debt of this.store.techDebt) {
      bySeverity[debt.severity] = (bySeverity[debt.severity] || 0) + 1;
      byType[debt.type] = (byType[debt.type] || 0) + 1;
    }

    return {
      total: this.store.techDebt.length,
      bySeverity,
      byType,
    };
  }

  /**
   * Get context for a task
   */
  getContextForTask(task: string): string {
    if (!this.store) return '';

    const context: string[] = [];

    // Find relevant symbols
    const keywords = task.toLowerCase().split(/\W+/);
    const relevantSymbols = this.store.symbols
      .filter((s) => keywords.some((k) => s.name.toLowerCase().includes(k)))
      .slice(0, 5);

    if (relevantSymbols.length > 0) {
      context.push('## Relevant Symbols');
      for (const symbol of relevantSymbols) {
        context.push(`- ${symbol.type} ${symbol.name} (${symbol.file}:${symbol.line})`);
        if (symbol.docstring) {
          context.push(`  ${symbol.docstring}`);
        }
      }
    }

    // Add patterns
    if (this.store.patterns.length > 0) {
      context.push('\n## Code Patterns Used');
      for (const pattern of this.store.patterns) {
        context.push(`- ${pattern.name}: ${pattern.description}`);
      }
    }

    return context.join('\n');
  }

  /**
   * Print summary
   */
  printSummary(): void {
    if (!this.store) return;

    console.log(chalk.cyan('\n═══ Project Memory Summary ═══'));
    console.log(chalk.gray(`Symbols indexed: ${this.store.symbols.length}`));
    console.log(chalk.gray(`Files with dependencies: ${this.store.dependencies.length}`));
    console.log(chalk.gray(`Change records: ${this.store.changes.length}`));
    console.log(chalk.gray(`Patterns detected: ${this.store.patterns.length}`));
    console.log(chalk.gray(`Tech debt items: ${this.store.techDebt.length}`));

    if (this.store.techDebt.length > 0) {
      const debt = this.getTechDebtSummary();
      console.log(chalk.yellow('\nTech Debt by Severity:'));
      for (const [severity, count] of Object.entries(debt.bySeverity)) {
        const color =
          severity === 'critical' ? chalk.red : severity === 'high' ? chalk.yellow : chalk.gray;
        console.log(color(`  ${severity}: ${count}`));
      }
    }

    console.log('');
  }
}

export const projectMemory = new ProjectMemory();
