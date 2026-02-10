/**
 * MCP Agent Bridge - Connects MCP tools to Witcher Agents
 * Agent: Philippa (API Integration)
 *
 * Simplified bridge for agent-MCP integration:
 * - Tool descriptions for agents
 * - Tool execution with unified result parsing
 * - Context generation for planning
 */

import chalk from 'chalk';
import { mcpManager } from './MCPManager.js';
import { MCPTool, MCPToolResult } from './MCPTypes.js';
import { Agent } from '../core/agent/Agent.js';
import { NATIVE_SERVER_NAME, NATIVE_TOOL_ALIASES } from './NativeToolsServer.js';

// ============================================================
// MCPAgentBridge Class
// ============================================================

export class MCPAgentBridge {
  private initialized: boolean = false;

  constructor() {}

  // ============================================================
  // Initialization
  // ============================================================

  async init(options?: { projectRoot?: string }): Promise<void> {
    if (this.initialized) return;
    await mcpManager.init(options);
    this.initialized = true;
    console.log(chalk.cyan('[MCP Bridge] Initialized'));
  }

  // ============================================================
  // Tool Descriptions
  // ============================================================

  /**
   * Get available tools as agent-friendly descriptions
   */
  getToolDescriptions(): string {
    const tools = mcpManager.getAllTools();
    const nativeServer = mcpManager.getNativeToolsServer();
    const nativeTools = nativeServer.isInitialized() ? nativeServer.getAllTools() : [];

    if (tools.length === 0 && nativeTools.length === 0) {
      return 'No MCP tools available.';
    }

    let desc = 'Available MCP Tools:\n';

    // Native tools first (most commonly used)
    if (nativeTools.length > 0) {
      desc += '\n=== Native Code Tools (fast, no external dependencies) ===\n';
      for (const tool of nativeTools) {
        desc += `- ${NATIVE_SERVER_NAME}__${tool.name}: ${tool.description}\n`;
      }
    }

    // Standard MCP tools
    if (tools.length > 0) {
      desc += '\n=== External MCP Tools ===\n';
      for (const tool of tools) {
        desc += `- ${tool.serverName}__${tool.name}: ${tool.description}\n`;
      }
    }

    return desc;
  }

  /**
   * Get native tools descriptions (for code-focused agents)
   */
  getNativeToolsDescriptions(): string {
    const nativeServer = mcpManager.getNativeToolsServer();

    if (!nativeServer.isInitialized()) {
      return 'Native tools not initialized.';
    }

    const tools = nativeServer.getAllTools();
    let desc = 'Native Code Tools:\n\n';

    for (const tool of tools) {
      desc += `### ${NATIVE_SERVER_NAME}__${tool.name}\n`;
      desc += `${tool.description}\n`;

      if (tool.inputSchema?.properties) {
        desc += 'Parameters:\n';
        for (const [name, schema] of Object.entries(tool.inputSchema.properties)) {
          const s = schema as any;
          const required = tool.inputSchema.required?.includes(name) ? ' (required)' : '';
          desc += `  - ${name}${required}: ${s.description || s.type}\n`;
        }
      }
      desc += '\n';
    }

    return desc;
  }

  /**
   * Get quick alias reference for agents
   */
  getAliasReference(): string {
    let ref = 'Quick Tool Aliases:\n';
    ref += '(Use full name: native__<alias> or just the alias)\n\n';

    const aliases = Object.entries(NATIVE_TOOL_ALIASES);
    const groupedAliases: Record<string, string[]> = {};

    for (const [alias, target] of aliases) {
      if (!groupedAliases[target]) {
        groupedAliases[target] = [];
      }
      groupedAliases[target].push(alias);
    }

    for (const [target, aliasList] of Object.entries(groupedAliases)) {
      const shortTarget = target.replace('native__', '');
      ref += `${shortTarget}: ${aliasList.join(', ')}\n`;
    }

    return ref;
  }

  /**
   * Get MCP context for Swarm planning (compact version)
   */
  getMCPContext(): string {
    const tools = mcpManager.getAllTools();
    const prompts = mcpManager.getAllPrompts();
    const resources = mcpManager.getAllResources();
    const nativeServer = mcpManager.getNativeToolsServer();
    const nativeTools = nativeServer.isInitialized() ? nativeServer.getAllTools() : [];

    if (tools.length === 0 && prompts.length === 0 && resources.length === 0 && nativeTools.length === 0) {
      return '';
    }

    let context = '\n## MCP Capabilities\n\n';

    // Native tools (code intelligence, search, etc.)
    if (nativeTools.length > 0) {
      context += '### Native Tools (fast, built-in):\n';
      for (const tool of nativeTools.slice(0, 8)) {
        const desc = tool.description ? tool.description.substring(0, 60) : 'No description';
        context += `- native/${tool.name}: ${desc}\n`;
      }
      if (nativeTools.length > 8) {
        context += `  ... +${nativeTools.length - 8} more native tools\n`;
      }
    }

    // External MCP tools
    if (tools.length > 0) {
      context += '\n### External MCP Tools:\n';
      for (const tool of tools.slice(0, 10)) {
        const desc = tool.description ? tool.description.substring(0, 60) : 'No description';
        context += `- ${tool.serverName}/${tool.name}: ${desc}\n`;
      }
      if (tools.length > 10) {
        context += `  ... +${tools.length - 10} more\n`;
      }
    }

    if (prompts.length > 0) {
      context += '\n### Prompts:\n';
      for (const prompt of prompts.slice(0, 5)) {
        context += `- ${prompt.serverName}/${prompt.name}\n`;
      }
    }

    if (resources.length > 0) {
      context += '\n### Resources:\n';
      for (const resource of resources.slice(0, 5)) {
        context += `- ${resource.name}: ${resource.uri}\n`;
      }
    }

    return context;
  }

  // ============================================================
  // Tool Execution
  // ============================================================

  /**
   * Execute an MCP tool and return parsed result
   */
  async executeTool(toolName: string, params: Record<string, any>): Promise<MCPToolResult> {
    try {
      const result = await mcpManager.callTool(toolName, params);
      return {
        success: result.success,
        content: this.parseContent(result.content),
        error: result.isError ? 'Tool returned an error' : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        content: null,
        error: error.message,
      };
    }
  }

  /**
   * Unified content parsing
   */
  private parseContent(content: any): any {
    if (!content) return null;

    if (Array.isArray(content)) {
      return content.map((c: any) => {
        if (c.type === 'text') return c.text;
        if (c.type === 'image') return `[Image: ${c.mimeType}]`;
        if (c.type === 'resource') return `[Resource: ${c.uri}]`;
        return JSON.stringify(c);
      }).join('\n');
    }

    return content;
  }

  // ============================================================
  // Agent Integration
  // ============================================================

  /**
   * Parse agent response for MCP tool calls
   * Pattern: MCP_CALL: mcp__server__tool({"param": "value"})
   */
  parseToolCalls(response: string): Array<{ tool: string; params: Record<string, any> }> {
    const calls: Array<{ tool: string; params: Record<string, any> }> = [];
    const pattern = /MCP_CALL:\s*(\w+__\w+__\w+)\s*\(([^)]*)\)/g;
    let match;

    while ((match = pattern.exec(response)) !== null) {
      try {
        const tool = match[1];
        const paramsStr = match[2];
        const params = paramsStr ? JSON.parse(paramsStr) : {};
        calls.push({ tool, params });
      } catch {
        // Invalid JSON, skip
      }
    }

    return calls;
  }

  /**
   * Execute agent task with MCP tool access
   */
  async executeWithMCP(agent: Agent, task: string): Promise<string> {
    const toolDescriptions = this.getToolDescriptions();

    const enhancedTask = `${task}

${toolDescriptions}

To use an MCP tool, respond with:
MCP_CALL: mcp__serverName__toolName({"param": "value"})`;

    // First pass: get agent's initial response
    let response = await agent.think(enhancedTask);
    const toolCalls = this.parseToolCalls(response);

    if (toolCalls.length === 0) {
      return response;
    }

    console.log(chalk.cyan(`[MCP Bridge] Agent requested ${toolCalls.length} tool call(s)`));

    // Execute tool calls
    const results: string[] = [];
    for (const call of toolCalls) {
      console.log(chalk.gray(`  Executing: ${call.tool}`));
      const result = await this.executeTool(call.tool, call.params);

      if (result.success) {
        results.push(`Tool ${call.tool} result:\n${result.content}`);
      } else {
        results.push(`Tool ${call.tool} error: ${result.error}`);
      }
    }

    // Second pass: agent processes tool results
    const followUpTask = `Previous task: ${task}

Tool results:
${results.join('\n\n')}

Provide your final response based on these results.`;

    return agent.think(followUpTask);
  }

  /**
   * Create MCP task string for a specific tool
   */
  createMCPTask(tool: MCPTool, params: Record<string, any>): string {
    return `Execute MCP tool:
Server: ${tool.serverName}
Tool: ${tool.name}
Description: ${tool.description}
Parameters: ${JSON.stringify(params, null, 2)}

MCP_CALL: mcp__${tool.serverName}__${tool.name}(${JSON.stringify(params)})`;
  }
}

// ============================================================
// Singleton
// ============================================================

export const mcpBridge = new MCPAgentBridge();
