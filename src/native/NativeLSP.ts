/**
 * NativeLSP - Native Language Server Protocol Client
 *
 * ============================================================
 * SYMBOL SEARCH HIERARCHY - LEVEL 1 (LOWEST LEVEL)
 * ============================================================
 *
 * This is the LOWEST level in the symbol search hierarchy.
 * NativeLSP provides direct LSP protocol communication with language servers.
 *
 * Hierarchy:
 *   1. NativeLSP.findSymbol()         - LSP protocol (THIS FILE - lowest level)
 *   2. NativeSearch.searchSymbols()   - Regex fallback for non-LSP files
 *   3. NativeCodeIntelligence.findSymbol() - Coordinator (tries LSP first, falls back to regex)
 *
 * This file provides:
 * - Direct LSP protocol communication with language servers
 * - Workspace symbol search via LSP (workspace/symbol request)
 * - Document symbol retrieval via LSP (textDocument/documentSymbol request)
 * - Go to definition, find references, hover, completions, rename
 *
 * When to use directly:
 * - When you need raw LSP results without fallback
 * - When implementing higher-level abstractions
 *
 * For general symbol search, prefer NativeCodeIntelligence.findSymbol() which
 * coordinates between LSP and regex-based search automatically.
 *
 * Supports TypeScript, JavaScript, Python, Rust, Go and other languages via LSP.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================
// Types
// ============================================================

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface TextDocumentIdentifier {
  uri: string;
}

export interface TextDocumentPositionParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
}

export interface SymbolInformation {
  name: string;
  kind: SymbolKind;
  location: Location;
  containerName?: string;
}

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKind;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

export interface Diagnostic {
  range: Range;
  severity?: DiagnosticSeverity;
  code?: number | string;
  source?: string;
  message: string;
}

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export interface CompletionItem {
  label: string;
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
}

export enum CompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

export interface LSPServerConfig {
  command: string;
  args: string[];
  rootUri: string;
  languageId: string;
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  method: string;
}

// ============================================================
// LSP Client
// ============================================================

export class LSPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private buffer = '';
  private initialized = false;
  private rootUri: string;
  private languageId: string;
  private capabilities: Record<string, unknown> = {};

  constructor(private config: LSPServerConfig) {
    super();
    this.rootUri = config.rootUri;
    this.languageId = config.languageId;
  }

  /**
   * Start the LSP server process
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.config.command, this.config.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true,
        });

        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleData(data.toString());
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          this.emit('error', data.toString());
        });

        this.process.on('error', (err) => {
          reject(err);
        });

        this.process.on('exit', (code) => {
          this.emit('exit', code);
          this.initialized = false;
        });

        // Initialize LSP
        this.initialize()
          .then(() => {
            this.initialized = true;
            resolve();
          })
          .catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the LSP server
   */
  async stop(): Promise<void> {
    if (this.process) {
      await this.sendRequest('shutdown', {});
      this.sendNotification('exit', {});
      this.process.kill();
      this.process = null;
      this.initialized = false;
    }
  }

  /**
   * Check if the client is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Send LSP initialize request
   */
  private async initialize(): Promise<void> {
    const result = await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri: this.rootUri,
      capabilities: {
        textDocument: {
          synchronization: {
            didOpen: true,
            didChange: true,
            didClose: true,
          },
          completion: {
            completionItem: {
              snippetSupport: true,
            },
          },
          hover: {},
          definition: {},
          references: {},
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
          },
          rename: {},
        },
        workspace: {
          workspaceFolders: true,
          symbol: {},
        },
      },
      workspaceFolders: [
        {
          uri: this.rootUri,
          name: path.basename(this.rootUri),
        },
      ],
    });

    this.capabilities = (result as { capabilities?: Record<string, unknown> })?.capabilities || {};
    this.sendNotification('initialized', {});
  }

  /**
   * Send a request and wait for response
   */
  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('LSP server not running'));
        return;
      }

      const id = ++this.requestId;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject, method });

      const content = JSON.stringify(message);
      const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;

      this.process.stdin.write(header + content);
    });
  }

  /**
   * Send a notification (no response expected)
   */
  private sendNotification(method: string, params: unknown): void {
    if (!this.process?.stdin) return;

    const message = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;

    this.process.stdin.write(header + content);
  }

  /**
   * Handle incoming data from LSP server
   */
  private handleData(data: string): void {
    this.buffer += data;

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!contentLengthMatch) break;

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.buffer.length < messageEnd) break;

      const content = this.buffer.slice(messageStart, messageEnd);
      this.buffer = this.buffer.slice(messageEnd);

      try {
        const message = JSON.parse(content);
        this.handleMessage(message);
      } catch (e) {
        this.emit('error', `Failed to parse LSP message: ${e}`);
      }
    }
  }

  /**
   * Handle parsed LSP message
   */
  private handleMessage(message: {
    id?: number;
    method?: string;
    result?: unknown;
    error?: { message: string };
    params?: unknown;
  }): void {
    if (message.id !== undefined) {
      // Response to our request
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.method) {
      // Notification or request from server
      this.emit('notification', message.method, message.params);
    }
  }

  // ============================================================
  // LSP Operations
  // ============================================================

  /**
   * Open a text document
   */
  async openDocument(uri: string, content: string): Promise<void> {
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: this.languageId,
        version: 1,
        text: content,
      },
    });
  }

  /**
   * Close a text document
   */
  async closeDocument(uri: string): Promise<void> {
    this.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    });
  }

  /**
   * Get document symbols
   */
  async getDocumentSymbols(uri: string): Promise<DocumentSymbol[] | SymbolInformation[]> {
    const result = await this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri },
    });
    return (result as DocumentSymbol[] | SymbolInformation[]) || [];
  }

  /**
   * Get workspace symbols matching a query
   */
  async getWorkspaceSymbols(query: string): Promise<SymbolInformation[]> {
    const result = await this.sendRequest('workspace/symbol', { query });
    return (result as SymbolInformation[]) || [];
  }

  /**
   * Go to definition
   */
  async getDefinition(uri: string, position: Position): Promise<Location | Location[] | null> {
    const result = await this.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position,
    });
    return result as Location | Location[] | null;
  }

  /**
   * Find references
   */
  async getReferences(
    uri: string,
    position: Position,
    includeDeclaration = true,
  ): Promise<Location[]> {
    const result = await this.sendRequest('textDocument/references', {
      textDocument: { uri },
      position,
      context: { includeDeclaration },
    });
    return (result as Location[]) || [];
  }

  /**
   * Get hover information
   */
  async getHover(uri: string, position: Position): Promise<{ contents: string } | null> {
    const result = await this.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position,
    });
    return result as { contents: string } | null;
  }

  /**
   * Get completions
   */
  async getCompletions(uri: string, position: Position): Promise<CompletionItem[]> {
    const result = await this.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position,
    });

    if (Array.isArray(result)) {
      return result;
    }
    if (result && typeof result === 'object' && 'items' in result) {
      return (result as { items: CompletionItem[] }).items;
    }
    return [];
  }

  /**
   * Rename symbol
   */
  async rename(
    uri: string,
    position: Position,
    newName: string,
  ): Promise<{ changes: Record<string, { range: Range; newText: string }[]> } | null> {
    const result = await this.sendRequest('textDocument/rename', {
      textDocument: { uri },
      position,
      newName,
    });
    return result as { changes: Record<string, { range: Range; newText: string }[]> } | null;
  }
}

// ============================================================
// NativeLSP Manager
// ============================================================

export interface LanguageServerDefinition {
  id: string;
  name: string;
  languages: string[];
  fileExtensions: string[];
  command: string;
  args: string[];
  installCommand?: string;
}

const LANGUAGE_SERVERS: LanguageServerDefinition[] = [
  {
    id: 'typescript',
    name: 'TypeScript Language Server',
    languages: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    command: 'npx',
    args: ['typescript-language-server', '--stdio'],
    installCommand: 'npm install -g typescript-language-server typescript',
  },
  {
    id: 'python',
    name: 'Python Language Server (Pyright)',
    languages: ['python'],
    fileExtensions: ['.py', '.pyi'],
    command: 'npx',
    args: ['pyright-langserver', '--stdio'],
    installCommand: 'npm install -g pyright',
  },
  {
    id: 'rust',
    name: 'Rust Analyzer',
    languages: ['rust'],
    fileExtensions: ['.rs'],
    command: 'rust-analyzer',
    args: [],
    installCommand: 'rustup component add rust-analyzer',
  },
  {
    id: 'go',
    name: 'Go Language Server (gopls)',
    languages: ['go'],
    fileExtensions: ['.go'],
    command: 'gopls',
    args: ['serve'],
    installCommand: 'go install golang.org/x/tools/gopls@latest',
  },
];

export class NativeLSP {
  private clients = new Map<string, LSPClient>();
  private rootDir: string = process.cwd();
  private serverDefinitions = new Map<string, LanguageServerDefinition>();

  constructor() {
    // Register built-in language servers
    for (const def of LANGUAGE_SERVERS) {
      this.serverDefinitions.set(def.id, def);
    }
  }

  /**
   * Initialize for a project
   */
  async init(rootDir: string): Promise<void> {
    this.rootDir = rootDir;
  }

  /**
   * Get or start LSP client for a language
   */
  async getClient(languageId: string): Promise<LSPClient | null> {
    // Check if already running
    if (this.clients.has(languageId)) {
      const client = this.clients.get(languageId);
      if (!client) return null;
      if (client.isInitialized()) {
        return client;
      }
      // Clean up dead client
      this.clients.delete(languageId);
    }

    // Find server definition
    const serverDef = Array.from(this.serverDefinitions.values()).find((def) =>
      def.languages.includes(languageId),
    );

    if (!serverDef) {
      return null;
    }

    // Start new client
    const client = new LSPClient({
      command: serverDef.command,
      args: serverDef.args,
      rootUri: `file://${this.rootDir.replace(/\\/g, '/')}`,
      languageId,
    });

    try {
      await client.start();
      this.clients.set(languageId, client);
      return client;
    } catch (error) {
      console.error(`Failed to start LSP for ${languageId}:`, error);
      return null;
    }
  }

  /**
   * Get language ID from file extension
   */
  getLanguageIdFromPath(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();

    for (const def of this.serverDefinitions.values()) {
      if (def.fileExtensions.includes(ext)) {
        return def.languages[0];
      }
    }

    return null;
  }

  /**
   * Convert file path to URI
   */
  pathToUri(filePath: string): string {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.rootDir, filePath);
    return `file://${absolutePath.replace(/\\/g, '/')}`;
  }

  /**
   * Convert URI to file path
   */
  uriToPath(uri: string): string {
    return uri.replace('file://', '').replace(/\//g, path.sep);
  }

  // ============================================================
  // High-level operations
  // ============================================================

  /**
   * Find symbol by name across workspace
   */
  async findSymbol(query: string): Promise<SymbolInformation[]> {
    const results: SymbolInformation[] = [];

    for (const client of this.clients.values()) {
      if (client.isInitialized()) {
        try {
          const symbols = await client.getWorkspaceSymbols(query);
          results.push(...symbols);
        } catch (_e) {
          // Continue with other clients
        }
      }
    }

    return results;
  }

  /**
   * Get symbols in a file
   */
  async getFileSymbols(filePath: string): Promise<DocumentSymbol[] | SymbolInformation[]> {
    const languageId = this.getLanguageIdFromPath(filePath);
    if (!languageId) return [];

    const client = await this.getClient(languageId);
    if (!client) return [];

    const uri = this.pathToUri(filePath);

    // Read and open document
    const content = fs.readFileSync(filePath, 'utf-8');
    await client.openDocument(uri, content);

    try {
      return await client.getDocumentSymbols(uri);
    } finally {
      await client.closeDocument(uri);
    }
  }

  /**
   * Find references to a symbol at position
   */
  async findReferences(filePath: string, line: number, character: number): Promise<Location[]> {
    const languageId = this.getLanguageIdFromPath(filePath);
    if (!languageId) return [];

    const client = await this.getClient(languageId);
    if (!client) return [];

    const uri = this.pathToUri(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    await client.openDocument(uri, content);

    try {
      return await client.getReferences(uri, { line, character });
    } finally {
      await client.closeDocument(uri);
    }
  }

  /**
   * Go to definition
   */
  async goToDefinition(
    filePath: string,
    line: number,
    character: number,
  ): Promise<Location | Location[] | null> {
    const languageId = this.getLanguageIdFromPath(filePath);
    if (!languageId) return null;

    const client = await this.getClient(languageId);
    if (!client) return null;

    const uri = this.pathToUri(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    await client.openDocument(uri, content);

    try {
      return await client.getDefinition(uri, { line, character });
    } finally {
      await client.closeDocument(uri);
    }
  }

  /**
   * Get hover information
   */
  async getHoverInfo(filePath: string, line: number, character: number): Promise<string | null> {
    const languageId = this.getLanguageIdFromPath(filePath);
    if (!languageId) return null;

    const client = await this.getClient(languageId);
    if (!client) return null;

    const uri = this.pathToUri(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    await client.openDocument(uri, content);

    try {
      const result = await client.getHover(uri, { line, character });
      if (!result) return null;

      // Extract text from hover contents
      const contents = result.contents as string | unknown[] | Record<string, unknown>;
      if (typeof contents === 'string') return contents;
      if (Array.isArray(contents))
        return contents.map((c: unknown) => (typeof c === 'string' ? c : String(c))).join('\n');
      return JSON.stringify(contents);
    } finally {
      await client.closeDocument(uri);
    }
  }

  /**
   * Get completions at position
   */
  async getCompletions(
    filePath: string,
    line: number,
    character: number,
  ): Promise<CompletionItem[]> {
    const languageId = this.getLanguageIdFromPath(filePath);
    if (!languageId) return [];

    const client = await this.getClient(languageId);
    if (!client) return [];

    const uri = this.pathToUri(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    await client.openDocument(uri, content);

    try {
      return await client.getCompletions(uri, { line, character });
    } finally {
      await client.closeDocument(uri);
    }
  }

  /**
   * Rename symbol
   */
  async renameSymbol(
    filePath: string,
    line: number,
    character: number,
    newName: string,
  ): Promise<Map<string, { range: Range; newText: string }[]> | null> {
    const languageId = this.getLanguageIdFromPath(filePath);
    if (!languageId) return null;

    const client = await this.getClient(languageId);
    if (!client) return null;

    const uri = this.pathToUri(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    await client.openDocument(uri, content);

    try {
      const result = await client.rename(uri, { line, character }, newName);
      if (!result?.changes) return null;

      const changes = new Map<string, { range: Range; newText: string }[]>();
      for (const [uri, edits] of Object.entries(result.changes)) {
        changes.set(this.uriToPath(uri), edits);
      }
      return changes;
    } finally {
      await client.closeDocument(uri);
    }
  }

  /**
   * Get available language servers
   */
  getAvailableServers(): LanguageServerDefinition[] {
    return Array.from(this.serverDefinitions.values());
  }

  /**
   * Get running clients
   */
  getRunningClients(): string[] {
    return Array.from(this.clients.entries())
      .filter(([_, client]) => client.isInitialized())
      .map(([lang]) => lang);
  }

  /**
   * Shutdown all clients
   */
  async shutdown(): Promise<void> {
    for (const client of this.clients.values()) {
      try {
        await client.stop();
      } catch (_e) {
        // Ignore shutdown errors
      }
    }
    this.clients.clear();
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const nativeLSP = new NativeLSP();

export default nativeLSP;
