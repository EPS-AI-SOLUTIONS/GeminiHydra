/**
 * MCP Tool Registry - Tool, Prompt, and Resource management
 *
 * Extracted from MCPManager.ts for better separation of concerns.
 * Handles registration, lookup, and validation of MCP capabilities.
 */

import { resolveAlias } from './MCPAliases.js';
import type { MCPPrompt, MCPResource, MCPTool, MCPValidationResult } from './MCPTypes.js';

// ============================================================
// Types
// ============================================================

export interface ParsedServerName {
  serverName: string;
  itemName: string;
}

// ============================================================
// MCPToolRegistry Class
// ============================================================

export class MCPToolRegistry {
  private tools: Map<string, MCPTool> = new Map();
  private prompts: Map<string, MCPPrompt> = new Map();
  private resources: Map<string, MCPResource> = new Map();

  // ============================================================
  // Name Parsing Helpers
  // ============================================================

  /**
   * Parse a global tool/prompt name into server and item components
   * Format: serverName__itemName (where itemName may contain __)
   */
  parseServerItemName(fullName: string): ParsedServerName {
    const parts = fullName.split('__');
    return {
      serverName: parts[0],
      itemName: parts.slice(1).join('__'),
    };
  }

  /**
   * Format a global name from server and item name
   */
  formatGlobalName(serverName: string, itemName: string): string {
    return `${serverName}__${itemName}`;
  }

  // ============================================================
  // Tool Management
  // ============================================================

  registerTool(tool: MCPTool): void {
    const key = this.formatGlobalName(tool.serverName, tool.name);
    this.tools.set(key, tool);
  }

  unregisterTool(serverName: string, toolName: string): void {
    const key = this.formatGlobalName(serverName, toolName);
    this.tools.delete(key);
  }

  unregisterServerTools(serverName: string): void {
    for (const [key] of this.tools) {
      if (key.startsWith(`${serverName}__`)) {
        this.tools.delete(key);
      }
    }
  }

  getTool(toolName: string): MCPTool | undefined {
    const resolved = resolveAlias(toolName);
    return this.tools.get(resolved);
  }

  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  hasTool(toolName: string): boolean {
    const resolved = resolveAlias(toolName);
    return this.tools.has(resolved);
  }

  get toolCount(): number {
    return this.tools.size;
  }

  // ============================================================
  // Prompt Management
  // ============================================================

  registerPrompt(prompt: MCPPrompt): void {
    const key = this.formatGlobalName(prompt.serverName, prompt.name);
    this.prompts.set(key, prompt);
  }

  unregisterPrompt(serverName: string, promptName: string): void {
    const key = this.formatGlobalName(serverName, promptName);
    this.prompts.delete(key);
  }

  unregisterServerPrompts(serverName: string): void {
    for (const [key] of this.prompts) {
      if (key.startsWith(`${serverName}__`)) {
        this.prompts.delete(key);
      }
    }
  }

  getPrompt(promptName: string): MCPPrompt | undefined {
    return this.prompts.get(promptName);
  }

  getAllPrompts(): MCPPrompt[] {
    return Array.from(this.prompts.values());
  }

  hasPrompt(promptName: string): boolean {
    return this.prompts.has(promptName);
  }

  get promptCount(): number {
    return this.prompts.size;
  }

  // ============================================================
  // Resource Management
  // ============================================================

  registerResource(resource: MCPResource): void {
    this.resources.set(resource.uri, resource);
  }

  unregisterResource(uri: string): void {
    this.resources.delete(uri);
  }

  unregisterServerResources(serverName: string): void {
    for (const [uri, resource] of this.resources) {
      if (resource.serverName === serverName) {
        this.resources.delete(uri);
      }
    }
  }

  getResource(uri: string): MCPResource | undefined {
    return this.resources.get(uri);
  }

  getAllResources(): MCPResource[] {
    return Array.from(this.resources.values());
  }

  hasResource(uri: string): boolean {
    return this.resources.has(uri);
  }

  get resourceCount(): number {
    return this.resources.size;
  }

  // ============================================================
  // Parameter Validation
  // ============================================================

  validateToolParams(toolName: string, params: Record<string, unknown>): MCPValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const resolved = resolveAlias(toolName);
    const tool =
      this.getTool(resolved) ||
      this.getAllTools().find(
        (t) => this.formatGlobalName(t.serverName, t.name) === resolved || t.name === resolved,
      );

    if (!tool) {
      errors.push(`Tool not found: ${toolName}`);
      return { valid: false, errors, warnings };
    }

    const schema = tool.inputSchema;
    if (!schema || !schema.properties) {
      return { valid: true, errors, warnings };
    }

    // Check required properties
    const required = schema.required || [];
    for (const prop of required) {
      if (params[prop] === undefined || params[prop] === null) {
        errors.push(`Missing required parameter: ${prop}`);
      }
    }

    // Check types
    for (const [key, value] of Object.entries(params)) {
      const propSchema = schema.properties[key];
      if (!propSchema) {
        warnings.push(`Unknown parameter: ${key}`);
        continue;
      }

      const expectedType = propSchema.type;
      const actualType = typeof value;

      if (expectedType === 'string' && actualType !== 'string') {
        errors.push(`Parameter ${key} should be string, got ${actualType}`);
      } else if (expectedType === 'number' && actualType !== 'number') {
        errors.push(`Parameter ${key} should be number, got ${actualType}`);
      } else if (expectedType === 'boolean' && actualType !== 'boolean') {
        errors.push(`Parameter ${key} should be boolean, got ${actualType}`);
      } else if (expectedType === 'array' && !Array.isArray(value)) {
        errors.push(`Parameter ${key} should be array, got ${actualType}`);
      } else if (expectedType === 'object' && (actualType !== 'object' || Array.isArray(value))) {
        errors.push(`Parameter ${key} should be object, got ${actualType}`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ============================================================
  // Gemini Integration
  // ============================================================

  getToolDefinitionsForGemini(): unknown[] {
    return this.getAllTools().map((tool) => ({
      name: `mcp__${tool.serverName}__${tool.name}`,
      description: `[MCP:${tool.serverName}] ${tool.description}`,
      parameters: tool.inputSchema,
    }));
  }

  // ============================================================
  // Clear All
  // ============================================================

  clear(): void {
    this.tools.clear();
    this.prompts.clear();
    this.resources.clear();
  }
}

// ============================================================
// Singleton
// ============================================================

export const mcpToolRegistry = new MCPToolRegistry();
