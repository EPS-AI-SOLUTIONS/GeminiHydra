/**
 * MCP Types - All MCP interfaces and types
 * Centralized type definitions for MCP module
 */

// ============================================================
// Server Configuration
// ============================================================

export interface MCPServerConfig {
  name: string;
  command?: string; // For stdio transport
  args?: string[];
  url?: string; // For SSE/HTTP transport
  env?: Record<string, string>;
  timeout?: number;
  trust?: boolean; // Auto-approve tool calls
  enabled?: boolean;
}

// ============================================================
// Tool, Prompt, Resource Definitions
// ============================================================

/** JSON Schema for tool input parameters */
export interface MCPToolInputSchema {
  type: 'object';
  properties?: Record<
    string,
    {
      type: string;
      description?: string;
      enum?: string[];
      default?: unknown;
    }
  >;
  required?: string[];
  additionalProperties?: boolean;
}

export interface MCPTool {
  name: string;
  serverName: string;
  description: string;
  inputSchema: MCPToolInputSchema;
}

export interface MCPPrompt {
  name: string;
  serverName: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface MCPResource {
  uri: string;
  serverName: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// ============================================================
// Result and Status Types
// ============================================================

export type MCPServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface MCPToolResult {
  success: boolean;
  content: unknown;
  error?: string;
  isError?: boolean;
}

export interface MCPServerInfo {
  name: string;
  status: MCPServerStatus;
  tools: number;
  prompts: number;
  resources: number;
}

// ============================================================
// Batch Operations
// ============================================================

export interface MCPBatchOperation {
  tool: string;
  params: Record<string, unknown>;
  id?: string;
}

export interface MCPBatchResult {
  id?: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

// ============================================================
// Validation
// ============================================================

export interface MCPValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================
// Discovery Options
// ============================================================

export interface MCPToolDiscoveryOptions {
  interval?: number;
  onNewTool?: (tool: { name: string; server: string }) => void;
  onToolRemoved?: (tool: { name: string; server: string }) => void;
}

// ============================================================
// Internal Types
// ============================================================

/** MCP Client interface (from @modelcontextprotocol/sdk) */
export interface MCPClient {
  connect(transport: MCPTransport, options?: unknown): Promise<void>;
  close(): Promise<void>;
  listTools(): Promise<{
    tools: Array<{ name: string; description?: string; inputSchema?: MCPToolInputSchema }>;
  }>;
  listPrompts(): Promise<{
    prompts: Array<{
      name: string;
      description?: string;
      arguments?: Array<{ name: string; description?: string; required?: boolean }>;
    }>;
  }>;
  listResources(): Promise<{
    resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }>;
  }>;
  callTool(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<{ content: unknown; isError?: boolean }>;
  getPrompt(params: {
    name: string;
    arguments?: Record<string, string>;
  }): Promise<{ messages: Array<{ role: string; content: { type: string; text: string } }> }>;
  readResource(params: { uri: string }): Promise<{
    contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }>;
  }>;
}

/** MCP Transport interface */
export interface MCPTransport {
  start(): Promise<void>;
  close(): Promise<void>;
}

export interface ConnectedServer {
  name: string;
  config: MCPServerConfig;
  client: MCPClient | null; // null during connection setup
  transport: MCPTransport | null; // null during connection setup
  status: MCPServerStatus;
  tools: MCPTool[];
  prompts: MCPPrompt[];
  resources: MCPResource[];
}
