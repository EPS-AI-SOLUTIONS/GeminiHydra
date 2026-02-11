/**
 * MCP Manager - Unified MCP integration for GeminiHydra
 * Agent: Philippa (API Integration)
 *
 * Features:
 * - Connect to MCP servers (stdio/SSE)
 * - Discover and register tools, prompts, resources
 * - Execute tools with retry and circuit breaker
 * - Auto-discovery of new tools
 * - Parameter validation
 * - Batch operations
 * - Result caching
 *
 * This is the main facade that coordinates:
 * - MCPToolRegistry - tool/prompt/resource management
 * - MCPCircuitBreakerManager - per-server circuit breakers
 * - MCPBatchExecutor - batch operations
 * - MCPAutoDiscovery - automatic tool discovery
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import chalk from 'chalk';
import { GEMINIHYDRA_DIR } from '../config/paths.config.js';
import { RequestCache } from '../core/RequestCache.js';
import { logError, logWarning } from '../utils/errorHandling.js';
import { logMCPConnection } from '../utils/startupLogger.js';
import { resolveAlias } from './MCPAliases.js';
import { MCPAutoDiscovery } from './MCPAutoDiscovery.js';
import { MCPBatchExecutor } from './MCPBatchOperations.js';
import { MCPCircuitBreakerManager } from './MCPCircuitBreaker.js';
// Import extracted modules
import { MCPToolRegistry } from './MCPToolRegistry.js';
import type {
  ConnectedServer,
  MCPBatchOperation,
  MCPBatchResult,
  MCPClient,
  MCPPrompt,
  MCPResource,
  MCPServerConfig,
  MCPServerInfo,
  MCPServerStatus,
  MCPTool,
  MCPToolDiscoveryOptions,
  MCPToolInputSchema,
  MCPToolResult,
  MCPTransport,
  MCPValidationResult,
} from './MCPTypes.js';
import { NATIVE_SERVER_NAME, NativeToolsServer } from './NativeToolsServer.js';

// ============================================================
// Constants
// ============================================================

const MCP_CONFIG_FILE = path.join(GEMINIHYDRA_DIR, 'mcp-servers.json');

// ============================================================
// MCPManager Class
// ============================================================

export class MCPManager {
  private servers: Map<string, ConnectedServer> = new Map();
  private initialized: boolean = false;

  // Extracted modules
  private toolRegistry: MCPToolRegistry;
  private circuitBreakerManager: MCPCircuitBreakerManager;
  private batchExecutor: MCPBatchExecutor;
  private autoDiscovery: MCPAutoDiscovery;

  // Native tools server (virtual MCP server for native tools)
  private nativeToolsServer: NativeToolsServer;

  // Feature #26: Result cache
  private resultCache: RequestCache<MCPToolResult>;

  constructor() {
    // Initialize extracted modules
    this.toolRegistry = new MCPToolRegistry();
    this.circuitBreakerManager = new MCPCircuitBreakerManager();
    this.batchExecutor = new MCPBatchExecutor();
    this.autoDiscovery = new MCPAutoDiscovery();
    this.nativeToolsServer = new NativeToolsServer();

    // Set up auto-discovery tool provider
    this.autoDiscovery.setToolProvider(() => this.getAllTools());

    // Set up circuit breaker reconnection handler
    this.circuitBreakerManager.setReconnectionHandler(async (serverName) => {
      const configs = await this.loadServerConfigs();
      const config = configs.find((c) => c.name === serverName);
      if (config) {
        await this.connectServer(config);
      }
    });

    this.resultCache = new RequestCache<MCPToolResult>({
      ttl: 5 * 60 * 1000, // 5 minutes
      maxSize: 200,
      onHit: (key) => console.log(chalk.gray(`[MCP Cache] Hit: ${key}`)),
      onMiss: () => {},
    });
  }

  // ============================================================
  // Helper Methods (delegating to MCPToolRegistry)
  // ============================================================

  /**
   * Parse a global tool/prompt name into server and item components
   * Format: serverName__itemName (where itemName may contain __)
   */
  private parseServerToolName(fullName: string): { serverName: string; toolName: string } {
    const parsed = this.toolRegistry.parseServerItemName(fullName);
    return { serverName: parsed.serverName, toolName: parsed.itemName };
  }

  /**
   * Format a global name from server and item name
   */
  private formatGlobalName(serverName: string, itemName: string): string {
    return this.toolRegistry.formatGlobalName(serverName, itemName);
  }

  /**
   * Validate that a server is connected and return it
   * @throws Error if server is not connected
   */
  private validateConnectedServer(serverName: string): ConnectedServer {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'connected' || !server.client) {
      throw new Error(`Server not connected: ${serverName}`);
    }
    return server;
  }

  // ============================================================
  // Native Tools Server
  // ============================================================

  /**
   * Initialize the native tools server
   * Provides native implementations of Serena-compatible tools
   */
  private async initNativeToolsServer(projectRoot: string): Promise<void> {
    try {
      // Set root directory for native tools
      await this.nativeToolsServer.setRootDir(projectRoot);

      // Initialize (registers tools in MCPToolRegistry)
      await this.nativeToolsServer.init();

      console.log(
        chalk.green(
          `[MCP] Native tools server initialized (${this.nativeToolsServer.getToolCount()} tools)`,
        ),
      );
    } catch (error) {
      logError('MCP', 'Failed to initialize native tools server', error);
    }
  }

  /**
   * Get native tools server instance
   */
  getNativeToolsServer(): NativeToolsServer {
    return this.nativeToolsServer;
  }

  // ============================================================
  // Initialization & Configuration
  // ============================================================

  async init(options?: { projectRoot?: string; autoActivateSerena?: boolean }): Promise<void> {
    // Prevent multiple initialization
    if (this.initialized) {
      return;
    }

    await fs.mkdir(GEMINIHYDRA_DIR, { recursive: true });

    // Initialize native tools server FIRST (no external dependencies)
    const projectRoot = options?.projectRoot || process.cwd();
    await this.initNativeToolsServer(projectRoot);

    // PRIMARY: Load from project's .mcp.json (if projectRoot provided)
    let configs: MCPServerConfig[] = [];

    if (projectRoot) {
      configs = await this.loadFromProjectConfig(projectRoot);
    }

    // FALLBACK: Load from ~/.geminihydra/mcp-servers.json
    if (configs.length === 0) {
      configs = await this.loadServerConfigs();
    }

    const enabledConfigs = configs.filter((c) => c.enabled !== false);

    if (enabledConfigs.length === 0) {
      console.log(chalk.yellow(`[MCP] No servers configured`));
      return;
    }

    console.log(chalk.cyan(`[MCP] Connecting to ${enabledConfigs.length} servers...`));

    // Connect in parallel for speed
    const connectionPromises = enabledConfigs.map(async (config) => {
      try {
        await this.connectServer(config);
      } catch (error) {
        logWarning('MCP', `Failed to connect to ${config.name}`, error);
      }
    });

    await Promise.all(connectionPromises);

    // Auto-activate Serena project if enabled and Serena is connected
    if (options?.autoActivateSerena !== false) {
      await this.autoActivateSerena(projectRoot);
    }

    this.initialized = true;
  }

  /**
   * Auto-activate Serena project based on .serena folder presence
   * Note: In claude-code context, activate_project is excluded (single_project: true)
   * so Serena auto-activates the project at startup. We skip manual activation.
   */
  private async autoActivateSerena(projectRoot: string): Promise<void> {
    const serenaServer = this.servers.get('serena');
    if (!serenaServer || serenaServer.status !== 'connected') {
      return;
    }

    // Check if .serena folder exists
    const serenaConfigPath = path.join(projectRoot, '.serena', 'project.yml');
    try {
      await fs.access(serenaConfigPath);
    } catch {
      // No .serena folder, skip activation
      return;
    }

    // Detect project name from folder
    const projectName = path.basename(projectRoot);

    // Check if activate_project tool is available (not excluded in claude-code context)
    const activateTool = serenaServer.tools.find((t) => t.name === 'activate_project');
    if (!activateTool) {
      // In claude-code context, Serena auto-activates the project at startup
      // No need to call activate_project manually - it's excluded by design
      console.log(
        chalk.green(`[Serena] Project '${projectName}' ready (auto-activated at startup)`),
      );
      return;
    }

    try {
      console.log(chalk.cyan(`[Serena] Activating project: ${projectName}...`));
      const result = await this.callTool('serena__activate_project', { project: projectName });

      if (result.success) {
        console.log(chalk.green(`[Serena] Project '${projectName}' activated`));
      }
    } catch (error) {
      logWarning('Serena', 'Auto-activation failed', error);
    }
  }

  async loadServerConfigs(): Promise<MCPServerConfig[]> {
    try {
      const data = await fs.readFile(MCP_CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      const defaultConfigs: MCPServerConfig[] = [];
      await this.saveServerConfigs(defaultConfigs);
      return defaultConfigs;
    }
  }

  async saveServerConfigs(configs: MCPServerConfig[]): Promise<void> {
    await fs.writeFile(MCP_CONFIG_FILE, JSON.stringify(configs, null, 2), 'utf-8');
  }

  /**
   * Load MCP server configs from project's .mcp.json file
   * This is the PRIMARY source - project-specific configuration
   */
  async loadFromProjectConfig(projectRoot: string): Promise<MCPServerConfig[]> {
    const mcpJsonPath = path.join(projectRoot, '.mcp.json');

    try {
      const data = await fs.readFile(mcpJsonPath, 'utf-8');
      const config = JSON.parse(data);

      if (!config.mcpServers) {
        console.log(chalk.yellow(`[MCP] .mcp.json found but no mcpServers defined`));
        return [];
      }

      // Convert .mcp.json format to MCPServerConfig[]
      const configs: MCPServerConfig[] = [];
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        const sc = serverConfig as {
          command?: string;
          args?: string[];
          env?: Record<string, string>;
          url?: string;
        };
        configs.push({
          name,
          command: sc.command,
          args: sc.args || [],
          env: this.resolveEnvVars(sc.env || {}),
          url: sc.url,
          enabled: true,
        });
      }

      console.log(chalk.green(`[MCP] Loaded ${configs.length} servers from ${mcpJsonPath}`));
      return configs;
    } catch (error: unknown) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        logWarning('MCP', `No .mcp.json found in ${projectRoot}`);
      } else {
        logError('MCP', 'Error reading .mcp.json', error);
      }
      return [];
    }
  }

  /**
   * Resolve environment variable placeholders like ${VAR_NAME}
   */
  private resolveEnvVars(env: Record<string, string>): Record<string, string> {
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        const envVar = value.slice(2, -1);
        resolved[key] = process.env[envVar] || '';
        if (!process.env[envVar]) {
          console.log(chalk.yellow(`[MCP] Warning: Environment variable ${envVar} not set`));
        }
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  async addServer(config: MCPServerConfig): Promise<void> {
    const configs = await this.loadServerConfigs();
    const existing = configs.findIndex((c) => c.name === config.name);

    if (existing >= 0) {
      configs[existing] = config;
    } else {
      configs.push(config);
    }

    await this.saveServerConfigs(configs);
    console.log(chalk.green(`[MCP] Server added: ${config.name}`));
  }

  async removeServer(name: string): Promise<void> {
    await this.disconnectServer(name);
    const configs = await this.loadServerConfigs();
    const filtered = configs.filter((c) => c.name !== name);
    await this.saveServerConfigs(filtered);
    console.log(chalk.yellow(`[MCP] Server removed: ${name}`));
  }

  // ============================================================
  // Server Connection
  // ============================================================

  async connectServer(config: MCPServerConfig): Promise<void> {
    console.log(chalk.cyan(`[MCP] Connecting to ${config.name}...`));

    const serverInfo: ConnectedServer = {
      name: config.name,
      config,
      client: null,
      transport: null,
      status: 'connecting',
      tools: [],
      prompts: [],
      resources: [],
    };

    this.servers.set(config.name, serverInfo);

    try {
      let transport: StdioClientTransport | SSEClientTransport;

      if (config.command) {
        // Stdio transport
        const filteredEnv: Record<string, string> = {};
        Object.entries({ ...process.env, ...config.env }).forEach(([k, v]) => {
          if (v !== undefined) filteredEnv[k] = v;
        });

        // Disable Git Bash path conversion on Windows
        if (process.platform === 'win32') {
          filteredEnv.MSYS_NO_PATHCONV = '1';
          filteredEnv.MSYS2_ARG_CONV_EXCL = '*';
        }

        transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: filteredEnv,
        });

        // FIX #6: Ensure child process stdin doesn't interfere with parent stdin
        // The StdioClientTransport handles this internally, but we add safety
        transport.onclose = () => {
          console.log(chalk.gray(`[MCP] Transport closed for ${config.name}`));
        };
      } else if (config.url) {
        transport = new SSEClientTransport(new URL(config.url));
      } else {
        throw new Error('Server config must have either command or url');
      }

      const client = new Client({
        name: 'gemini-hydra',
        version: '13.0.0',
      });

      await client.connect(transport);

      // Cast to our MCPClient interface (compatible subset of actual Client)
      serverInfo.client = client as unknown as MCPClient;
      serverInfo.transport = transport as unknown as MCPTransport;
      serverInfo.status = 'connected';

      await this.discoverServerCapabilities(serverInfo);

      // Log connection to startup summary
      logMCPConnection(config.name, serverInfo.tools.length, 'connected');

      console.log(chalk.green(`[MCP] Connected to ${config.name}`));
      console.log(chalk.gray(`  Tools: ${serverInfo.tools.length}`));
      console.log(chalk.gray(`  Prompts: ${serverInfo.prompts.length}`));
      console.log(chalk.gray(`  Resources: ${serverInfo.resources.length}`));
    } catch (error: unknown) {
      serverInfo.status = 'error';
      throw error;
    }
  }

  async disconnectServer(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (!server) return;

    try {
      if (server.client) {
        await server.client.close();
      }

      // Remove from registry using MCPToolRegistry
      this.toolRegistry.unregisterServerTools(name);
      this.toolRegistry.unregisterServerPrompts(name);
      this.toolRegistry.unregisterServerResources(name);

      this.servers.delete(name);
      console.log(chalk.yellow(`[MCP] Disconnected from ${name}`));
    } catch (error) {
      logError('MCP', `Error disconnecting from ${name}`, error);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const name of this.servers.keys()) {
      await this.disconnectServer(name);
    }
    this.autoDiscovery.stop();

    // Shutdown native tools server
    await this.nativeToolsServer.shutdown();
  }

  // ============================================================
  // Capability Discovery
  // ============================================================

  private async discoverServerCapabilities(server: ConnectedServer): Promise<void> {
    const client = server.client;
    if (!client) {
      console.log(chalk.yellow(`[MCP] ${server.name}: Client not connected`));
      return;
    }

    // Discover tools and register with MCPToolRegistry
    try {
      const toolsResult = await client.listTools();
      server.tools = (toolsResult.tools || []).map(
        (tool: { name: string; description?: string; inputSchema?: MCPToolInputSchema }) => {
          const mcpTool: MCPTool = {
            name: tool.name,
            serverName: server.name,
            description: tool.description || '',
            inputSchema: tool.inputSchema || { type: 'object' as const },
          };
          this.toolRegistry.registerTool(mcpTool);
          return mcpTool;
        },
      );
    } catch {
      console.log(chalk.gray(`[MCP] ${server.name}: No tools available`));
      server.tools = [];
    }

    // Discover prompts and register with MCPToolRegistry
    try {
      const promptsResult = await client.listPrompts();
      server.prompts = (promptsResult.prompts || []).map(
        (prompt: {
          name: string;
          description?: string;
          arguments?: Array<{ name: string; description?: string; required?: boolean }>;
        }) => {
          const mcpPrompt: MCPPrompt = {
            name: prompt.name,
            serverName: server.name,
            description: prompt.description,
            arguments: prompt.arguments,
          };
          this.toolRegistry.registerPrompt(mcpPrompt);
          return mcpPrompt;
        },
      );
    } catch {
      // Silently ignore - no prompts is normal for most servers
      server.prompts = [];
    }

    // Discover resources and register with MCPToolRegistry
    try {
      const resourcesResult = await client.listResources();
      server.resources = (resourcesResult.resources || []).map(
        (resource: { uri: string; name: string; description?: string; mimeType?: string }) => {
          const mcpResource: MCPResource = {
            uri: resource.uri,
            serverName: server.name,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType,
          };
          this.toolRegistry.registerResource(mcpResource);
          return mcpResource;
        },
      );
    } catch {
      // Silently ignore - no resources is normal for most servers
      server.resources = [];
    }
  }

  // ============================================================
  // Tool Execution
  // ============================================================

  /**
   * Validate path parameter before MCP tool execution
   * Ensures paths don't contain AI hallucinations like trailing parentheses
   * and don't attempt path traversal attacks
   */
  private validateMCPToolPath(toolPath: string): {
    valid: boolean;
    sanitized?: string;
    error?: string;
  } {
    if (!toolPath || typeof toolPath !== 'string') {
      return { valid: false, error: 'Invalid path parameter' };
    }

    // Remove trailing parentheses (AI hallucinations)
    const cleanPath = toolPath
      .trim()
      .replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/\)$/, '');

    // Check for path traversal patterns
    const traversalPatterns = [/\.\.\//, /\.\.\\/, /%2e%2e/i, /%252e%252e/i];

    for (const pattern of traversalPatterns) {
      if (pattern.test(cleanPath)) {
        return { valid: false, error: `Path traversal detected: ${toolPath}` };
      }
    }

    return { valid: true, sanitized: cleanPath };
  }

  /**
   * Normalize parameters for memory tools
   * Converts string arguments to arrays as expected by MCP memory server
   * Fixes: [bug] request payload entities array, [bug] memory tools failures with string arguments
   */
  private normalizeMemoryParams(
    toolName: string,
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    const memoryTools = [
      'create_entities',
      'add_observations',
      'create_relations',
      'delete_entities',
      'delete_relations',
      'delete_observations',
    ];
    const baseTool = toolName.split('__').pop() || toolName;

    if (!memoryTools.includes(baseTool)) return params;

    const normalized = { ...params };

    // Convert entities string → array
    if (typeof normalized.entities === 'string') {
      normalized.entities = [
        {
          name: normalized.entities,
          entityType: 'concept',
          observations: [],
        },
      ];
    }

    // Convert observations string → array
    if (typeof normalized.observations === 'string') {
      normalized.observations = [normalized.observations];
    }

    // Convert entityName for add_observations if missing
    if (baseTool === 'add_observations' && !normalized.entityName && normalized.name) {
      normalized.entityName = normalized.name;
      delete normalized.name;
    }

    // Convert relations string → array (parse "A -> B" format)
    if (typeof normalized.relations === 'string') {
      const match = normalized.relations.match(/(.+?)\s*(?:->|relates?\s*to)\s*(.+)/i);
      if (match) {
        normalized.relations = [
          {
            from: match[1].trim(),
            to: match[2].trim(),
            relationType: 'relates_to',
          },
        ];
      }
    }

    return normalized;
  }

  async callTool(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    // Validate path parameters before execution
    const pathParams = [
      'path',
      'file',
      'filepath',
      'filename',
      'directory',
      'dir',
      'target',
      'source',
    ];
    for (const param of pathParams) {
      if (params?.[param] && typeof params[param] === 'string') {
        const validation = this.validateMCPToolPath(params[param] as string);
        if (!validation.valid) {
          console.log(chalk.red(`[MCP] Path validation failed: ${validation.error}`));
          return {
            success: false,
            content: [{ type: 'text', text: `Security error: ${validation.error}` }],
            isError: true,
          };
        }
        params[param] = validation.sanitized;
      }
    }

    // Normalize memory tool parameters (string → array conversion)
    params = this.normalizeMemoryParams(toolName, params);

    // BUG-001 FIX: Normalize tool name format (native/tool -> native__tool)
    // Dijkstra planner generates 'native/list_dir' but MCP expects 'native__list_dir'
    let normalizedToolName = toolName;
    if (toolName.includes('/') && !toolName.startsWith('http')) {
      normalizedToolName = toolName.replace(/\//g, '__');
      console.log(chalk.gray(`[MCP] Normalized tool name: ${toolName} -> ${normalizedToolName}`));
    }

    // Resolve alias first
    const resolved = resolveAlias(normalizedToolName);

    // Parse tool name using helper method
    const parsed = this.parseServerToolName(resolved);
    let serverName: string;
    let actualToolName: string;

    if (parsed.toolName) {
      serverName = parsed.serverName;
      actualToolName = parsed.toolName;
    } else {
      // Single part name - look up in tool registry
      const tool = this.toolRegistry.getTool(resolved);
      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }
      serverName = tool.serverName;
      actualToolName = tool.name;
    }

    // ============================================================
    // Native Tools Server Handler
    // ============================================================
    // If this is a native tool, delegate to NativeToolsServer
    if (serverName === NATIVE_SERVER_NAME) {
      console.log(chalk.cyan(`[MCP] Calling native/${actualToolName}...`));

      try {
        const result = await this.nativeToolsServer.callTool(actualToolName, params);
        return result;
      } catch (error) {
        logError('MCP', `Native tool call failed: ${actualToolName}`, error);
        throw error;
      }
    }

    // ============================================================
    // Standard MCP Server Handler
    // ============================================================
    // Validate server connection using helper method
    const server = this.validateConnectedServer(serverName);

    console.log(chalk.cyan(`[MCP] Calling ${serverName}/${actualToolName}...`));

    try {
      const result = await server.client?.callTool({
        name: actualToolName,
        arguments: params,
      });
      return {
        success: !result?.isError,
        content: result?.content,
        isError: result?.isError,
      };
    } catch (error) {
      logError('MCP', 'Tool call failed', error);
      throw error;
    }
  }

  // Feature #23: Call with retry and circuit breaker (using MCPCircuitBreakerManager)
  async callToolWithRecovery(
    toolName: string,
    params: Record<string, unknown>,
    options: { maxRetries?: number; retryDelay?: number } = {},
  ): Promise<MCPToolResult> {
    const resolved = resolveAlias(toolName);
    const { serverName } = this.parseServerToolName(resolved);

    return this.circuitBreakerManager.executeWithRetry(
      serverName,
      () => this.callTool(resolved, params),
      options,
    );
  }

  // Feature #26: Call with caching
  async callToolCached(
    toolName: string,
    params: Record<string, unknown>,
    options: { bypassCache?: boolean } = {},
  ): Promise<MCPToolResult> {
    if (options.bypassCache) {
      return this.callTool(toolName, params);
    }

    const cacheKey = { tool: toolName, params };
    return this.resultCache.getOrCompute(cacheKey, async () => {
      return this.callTool(toolName, params);
    });
  }

  // ============================================================
  // Prompts & Resources
  // ============================================================

  async getPrompt(
    promptName: string,
    params: Record<string, string>,
  ): Promise<
    { messages: Array<{ role: string; content: { type: string; text: string } }> } | undefined
  > {
    // Parse prompt name using helper method
    const parsed = this.parseServerToolName(promptName);
    let serverName: string;
    let actualPromptName: string;

    if (parsed.toolName) {
      serverName = parsed.serverName;
      actualPromptName = parsed.toolName;
    } else {
      // Single part name - look up in tool registry
      const prompt = this.toolRegistry.getPrompt(promptName);
      if (!prompt) {
        throw new Error(`Prompt not found: ${promptName}`);
      }
      serverName = prompt.serverName;
      actualPromptName = prompt.name;
    }

    // Validate server connection using helper method
    const server = this.validateConnectedServer(serverName);

    return server.client?.getPrompt({
      name: actualPromptName,
      arguments: params,
    });
  }

  async readResource(
    uri: string,
  ): Promise<
    | { contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }> }
    | undefined
  > {
    const resource = this.toolRegistry.getResource(uri);
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    // Validate server connection using helper method
    const server = this.validateConnectedServer(resource.serverName);

    return server.client?.readResource({ uri });
  }

  // ============================================================
  // Feature #24: Parameter Validation (delegated to MCPToolRegistry)
  // ============================================================

  validateToolParams(toolName: string, params: Record<string, unknown>): MCPValidationResult {
    return this.toolRegistry.validateToolParams(toolName, params);
  }

  // ============================================================
  // Feature #25: Batch Operations (delegated to MCPBatchExecutor)
  // ============================================================

  async batchExecute(
    operations: MCPBatchOperation[],
    options: {
      maxConcurrency?: number;
      onProgress?: (completed: number, total: number) => void;
    } = {},
  ): Promise<MCPBatchResult[]> {
    const { results } = await this.batchExecutor.execute(
      operations,
      (toolName, params) => this.callToolWithRecovery(toolName, params),
      options,
    );
    return results;
  }

  async batchReadFiles(paths: string[]): Promise<MCPBatchResult[]> {
    return this.batchExecutor.batchReadFiles(paths, (toolName, params) =>
      this.callToolWithRecovery(toolName, params),
    );
  }

  // ============================================================
  // Feature #21: Auto-Discovery (delegated to MCPAutoDiscovery)
  // ============================================================

  startAutoDiscovery(options: MCPToolDiscoveryOptions = {}): void {
    this.autoDiscovery.start(options);
  }

  stopAutoDiscovery(): void {
    this.autoDiscovery.stop();
  }

  // ============================================================
  // Circuit Breaker Access
  // ============================================================

  getCircuitBreakerState(serverName: string): 'CLOSED' | 'OPEN' | 'HALF_OPEN' | 'UNKNOWN' {
    return this.circuitBreakerManager.getState(serverName);
  }

  resetCircuitBreaker(serverName: string): void {
    this.circuitBreakerManager.resetBreaker(serverName);
  }

  // ============================================================
  // Cache Management (Feature #26)
  // ============================================================

  clearCache(): void {
    this.resultCache.clear();
  }

  getCacheStats() {
    return this.resultCache.getStats();
  }

  // ============================================================
  // Getters (delegated to MCPToolRegistry)
  // ============================================================

  getAllTools(): MCPTool[] {
    return this.toolRegistry.getAllTools();
  }

  getAllPrompts(): MCPPrompt[] {
    return this.toolRegistry.getAllPrompts();
  }

  getAllResources(): MCPResource[] {
    return this.toolRegistry.getAllResources();
  }

  getServerStatus(name: string): MCPServerStatus {
    return this.servers.get(name)?.status || 'disconnected';
  }

  getAllServers(): MCPServerInfo[] {
    return Array.from(this.servers.values()).map((s) => ({
      name: s.name,
      status: s.status,
      tools: s.tools.length,
      prompts: s.prompts.length,
      resources: s.resources.length,
    }));
  }

  getToolDefinitionsForGemini(): Array<{
    name: string;
    description: string;
    parameters: MCPToolInputSchema;
  }> {
    return this.toolRegistry.getToolDefinitionsForGemini() as Array<{
      name: string;
      description: string;
      parameters: MCPToolInputSchema;
    }>;
  }

  // ============================================================
  // Status Display
  // ============================================================

  printStatus(): void {
    console.log(chalk.cyan('\n=== MCP Status ===\n'));

    // Native tools server status (always first)
    if (this.nativeToolsServer.isInitialized()) {
      console.log(chalk.green(`[OK] ${NATIVE_SERVER_NAME} (native)`));
      console.log(
        chalk.gray(
          `    Tools: ${this.nativeToolsServer.getToolCount()} | Aliases: ${Object.keys(this.nativeToolsServer.getAllAliases()).length}`,
        ),
      );
    } else {
      console.log(chalk.yellow(`[..] ${NATIVE_SERVER_NAME} (native) - not initialized`));
    }

    const servers = this.getAllServers();
    if (servers.length === 0 && !this.nativeToolsServer.isInitialized()) {
      console.log(chalk.gray('No MCP servers configured'));
      console.log(chalk.gray('Use `gemini mcp add <name> <command>` to add a server'));
      return;
    }

    for (const server of servers) {
      const statusIcon =
        server.status === 'connected' ? '[OK]' : server.status === 'connecting' ? '[..]' : '[X]';
      const statusColor =
        server.status === 'connected'
          ? chalk.green
          : server.status === 'error'
            ? chalk.red
            : chalk.yellow;

      console.log(statusColor(`${statusIcon} ${server.name}`));
      console.log(
        chalk.gray(
          `    Tools: ${server.tools} | Prompts: ${server.prompts} | Resources: ${server.resources}`,
        ),
      );
    }

    // Include native tools in total count
    const nativeToolCount = this.nativeToolsServer.isInitialized()
      ? this.nativeToolsServer.getToolCount()
      : 0;
    console.log(
      chalk.gray(
        `\nTotal: ${this.toolRegistry.toolCount + nativeToolCount} tools, ${this.toolRegistry.promptCount} prompts, ${this.toolRegistry.resourceCount} resources`,
      ),
    );

    const cacheStats = this.getCacheStats();
    console.log(
      chalk.gray(
        `Cache: ${cacheStats.size} entries, ${cacheStats.hits} hits, ${cacheStats.misses} misses\n`,
      ),
    );
  }
}

// ============================================================
// Singleton
// ============================================================

export const mcpManager = new MCPManager();
