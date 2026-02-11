/**
 * @deprecated Serena MCP has been replaced by NativeCodeIntelligence
 *
 * This file is kept for backwards compatibility only.
 * Please use:
 * - import { nativeCodeIntelligence } from '../native/NativeCodeIntelligence.js'
 * - import { nativeLSP } from '../native/NativeLSP.js'
 */

import { nativeCodeIntelligence } from '../native/NativeCodeIntelligence.js';

// Re-export types that might be used elsewhere
export interface SerenaProject {
  name: string;
  path: string;
  languages: string[];
  encoding: string;
  memories: string[];
}

export interface SerenaSymbol {
  name: string;
  kind: string;
  path: string;
  line: number;
  body?: string;
}

export interface SerenaSearchResult {
  file: string;
  matches: Array<{
    line: number;
    content: string;
  }>;
}

/**
 * @deprecated Use nativeCodeIntelligence from '../native/NativeCodeIntelligence.js'
 */
export class SerenaIntegration {
  private native = nativeCodeIntelligence;

  async init(projectRoot: string): Promise<boolean> {
    await this.native.init(projectRoot);
    return true;
  }

  isReady(): boolean {
    return this.native.isInitialized();
  }

  getActiveProject(): SerenaProject | null {
    if (!this.native.isInitialized()) return null;

    const info = this.native.getProjectInfo();
    return {
      name: info.name,
      path: info.rootDir,
      languages: ['typescript', 'javascript'], // Assumed from LSP config
      encoding: 'utf-8',
      memories: [],
    };
  }

  async activateProject(projectName: string): Promise<SerenaProject | null> {
    await this.native.init(process.cwd(), projectName);
    return this.getActiveProject();
  }

  async findSymbol(pattern: string, _options?: unknown): Promise<SerenaSymbol[] | null> {
    const symbols = await this.native.findSymbol(pattern);
    return symbols.map((s) => ({
      name: s.name,
      kind: String(s.kind),
      path: s.location.uri,
      line: s.location.range.start.line + 1,
    }));
  }

  async searchPattern(pattern: string, _options?: unknown): Promise<SerenaSearchResult[] | null> {
    const results = await this.native.searchPattern(pattern);

    // Group by file
    const byFile = new Map<string, SerenaSearchResult>();
    for (const r of results) {
      let entry = byFile.get(r.file);
      if (!entry) {
        entry = { file: r.file, matches: [] };
        byFile.set(r.file, entry);
      }
      entry.matches.push({ line: r.line, content: r.text });
    }

    return Array.from(byFile.values());
  }

  async listDir(
    path: string = '.',
    _recursive?: boolean,
  ): Promise<{ dirs: string[]; files: string[] } | null> {
    const entries = await this.native.listDir(path);
    return {
      dirs: entries.filter((e) => e.type === 'directory').map((e) => e.name),
      files: entries.filter((e) => e.type === 'file').map((e) => e.name),
    };
  }

  async readFile(path: string): Promise<string | null> {
    return this.native.readFile(path);
  }

  async getSymbolsOverview(_path: string): Promise<SerenaSymbol[] | null> {
    const overviews = await this.native.getSymbolsOverview([_path]);
    if (overviews.length === 0) return [];

    return overviews[0].symbols.map((s) => ({
      name: s.name,
      kind: s.kind,
      path: overviews[0].file,
      line: s.line,
    }));
  }

  async listMemories(): Promise<string[] | null> {
    const mems = await this.native.listMemories();
    return mems.map((m) => m.key);
  }

  async readMemory(name: string): Promise<string | null> {
    return this.native.readMemory(name);
  }

  async writeMemory(name: string, content: string): Promise<boolean> {
    await this.native.writeMemory(name, content);
    return true;
  }

  async deleteMemory(name: string): Promise<boolean> {
    return this.native.deleteMemory(name);
  }

  printStatus(): void {
    console.log('[SerenaIntegration] DEPRECATED - using NativeCodeIntelligence');
    const project = this.getActiveProject();
    if (project) {
      console.log(`  Project: ${project.name}`);
      console.log(`  Path: ${project.path}`);
    }
  }
}

// Keep the singleton export for backwards compatibility
export const serenaIntegration = new SerenaIntegration();
