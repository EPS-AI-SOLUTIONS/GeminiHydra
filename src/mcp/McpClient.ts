/**
 * GeminiHydra - MCP Client
 * JSON-RPC client for Model Context Protocol (stdio transport)
 * Komunikacja z MCP serwerami (np. Serena) przez stdin/stdout
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { createInterface, Interface } from 'readline';

// JSON-RPC types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

// MCP Protocol types
export interface McpCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: Record<string, unknown>;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface McpClientOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export class McpClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private readline: Interface | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number | string, PendingRequest>();
  private tools: McpTool[] = [];
  private initialized = false;
  private options: McpClientOptions;

  constructor(options: McpClientOptions) {
    super();
    this.options = {
      timeout: 30000,
      ...options,
    };
  }

  /**
   * Start MCP server process and initialize connection
   */
  async connect(): Promise<boolean> {
    if (this.process) {
      return true;
    }

    return new Promise((resolve, reject) => {
      try {
        console.log(`[MCP] Starting: ${this.options.command} ${(this.options.args || []).join(' ')}`);

        this.process = spawn(this.options.command, this.options.args || [], {
          cwd: this.options.cwd,
          env: { ...process.env, ...this.options.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        if (!this.process.stdout || !this.process.stdin) {
          reject(new Error('Failed to create process streams'));
          return;
        }

        // Read responses line by line (newline-delimited JSON-RPC)
        this.readline = createInterface({
          input: this.process.stdout,
          crlfDelay: Infinity,
        });

        this.readline.on('line', (line) => {
          this.handleMessage(line);
        });

        // Handle stderr for debugging
        if (this.process.stderr) {
          this.process.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) {
              console.log(`[MCP stderr] ${msg}`);
            }
          });
        }

        this.process.on('error', (err) => {
          console.error(`[MCP] Process error: ${err.message}`);
          this.emit('error', err);
          if (!this.initialized) {
            reject(err);
          }
        });

        this.process.on('exit', (code, signal) => {
          console.log(`[MCP] Process exited: code=${code}, signal=${signal}`);
          this.cleanup();
          this.emit('close', code, signal);
        });

        // Initialize MCP protocol
        this.initialize()
          .then(() => {
            this.initialized = true;
            resolve(true);
          })
          .catch(reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * MCP initialize handshake
   */
  private async initialize(): Promise<void> {
    const initResult = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: {
          listChanged: true,
        },
      },
      clientInfo: {
        name: 'GeminiHydra',
        version: '16.0.0',
      },
    });

    console.log('[MCP] Server capabilities:', JSON.stringify(initResult, null, 2));

    // Send initialized notification
    this.sendNotification('notifications/initialized', {});

    // Fetch available tools
    await this.refreshTools();
  }

  /**
   * Refresh list of available tools
   */
  async refreshTools(): Promise<McpTool[]> {
    const result = (await this.sendRequest('tools/list', {})) as { tools: McpTool[] };
    this.tools = result.tools || [];
    console.log(`[MCP] Available tools: ${this.tools.map((t) => t.name).join(', ')}`);
    return this.tools;
  }

  /**
   * Get list of available tools
   */
  getTools(): McpTool[] {
    return this.tools;
  }

  /**
   * Call a tool by name
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolCallResult> {
    const result = (await this.sendRequest('tools/call', {
      name,
      arguments: args,
    })) as McpToolCallResult;

    return result;
  }

  /**
   * Send JSON-RPC request and wait for response
   */
  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('MCP client not connected'));
        return;
      }

      const id = ++this.requestId;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.options.timeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const message = JSON.stringify(request) + '\n';
      this.process.stdin.write(message);
    });
  }

  /**
   * Send JSON-RPC notification (no response expected)
   */
  private sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.process?.stdin) {
      return;
    }

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const message = JSON.stringify(notification) + '\n';
    this.process.stdin.write(message);
  }

  /**
   * Handle incoming message from server
   */
  private handleMessage(line: string): void {
    if (!line.trim()) return;

    try {
      const message = JSON.parse(line) as JsonRpcResponse | JsonRpcNotification;

      // Check if it's a response (has id)
      if ('id' in message && message.id !== undefined) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          this.pendingRequests.delete(message.id);
          clearTimeout(pending.timeout);

          if (message.error) {
            pending.reject(new Error(`${message.error.message} (code: ${message.error.code})`));
          } else {
            pending.resolve(message.result);
          }
        }
      } else if ('method' in message) {
        // It's a notification from server
        this.emit('notification', message.method, message.params);
      }
    } catch (err) {
      console.error('[MCP] Failed to parse message:', line, err);
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.initialized && this.process !== null;
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    if (this.process) {
      // Send shutdown notification
      this.sendNotification('notifications/cancelled', {});

      // Give it time to gracefully shutdown
      await new Promise((resolve) => setTimeout(resolve, 500));

      this.process.kill('SIGTERM');
      this.cleanup();
    }
  }

  private cleanup(): void {
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
      this.pendingRequests.delete(id);
    }

    this.process = null;
    this.initialized = false;
    this.tools = [];
  }
}

/**
 * Create MCP client for Serena
 */
export function createSerenaClient(projectPath?: string): McpClient {
  return new McpClient({
    command: 'uvx',
    args: ['--from', 'git+https://github.com/oraios/serena', 'serena', 'start-mcp-server'],
    cwd: projectPath || process.cwd(),
    timeout: 60000, // Serena may need more time for code analysis
  });
}

// Cleanup on process exit
process.on('exit', () => {
  // Clients should call disconnect() manually
});
