/**
 * @fileoverview Tools Index - Registry and exports for all tools
 * Provides tool registration, discovery, and execution
 *
 * Ported from ClaudeCli to GeminiCLI
 * @module tools
 */

import { BaseTool, ToolResult } from './base-tool.js';

export { BaseTool, ToolResult } from './base-tool.js';
export * from './errors.js';

/**
 * Tool registry - Map of tool names to tool instances
 */
const toolRegistry = new Map();

/**
 * Register a tool
 * @param {BaseTool} tool - Tool instance to register
 */
export function registerTool(tool) {
  if (!(tool instanceof BaseTool)) {
    throw new Error('Tool must be an instance of BaseTool');
  }
  if (toolRegistry.has(tool.name)) {
    console.warn(`Tool ${tool.name} is already registered. Overwriting.`);
  }
  toolRegistry.set(tool.name, tool);
  return tool;
}

/**
 * Get a tool by name
 * @param {string} name - Tool name
 * @returns {BaseTool|undefined} Tool instance
 */
export function getTool(name) {
  return toolRegistry.get(name);
}

/**
 * Check if a tool exists
 * @param {string} name - Tool name
 * @returns {boolean}
 */
export function hasTool(name) {
  return toolRegistry.has(name);
}

/**
 * Get all tool names
 * @returns {string[]}
 */
export function getToolNames() {
  return Array.from(toolRegistry.keys());
}

/**
 * Get all registered tools
 * @returns {BaseTool[]}
 */
export function getAllTools() {
  return Array.from(toolRegistry.values());
}

/**
 * Get tool definitions for MCP registration
 * @returns {Object[]}
 */
export function getToolDefinitions() {
  return getAllTools().map((tool) => tool.getDefinition());
}

/**
 * Execute a tool by name
 * @param {string} name - Tool name
 * @param {Object} input - Tool input
 * @returns {Promise<ToolResult>}
 */
export async function executeTool(name, input) {
  const tool = getTool(name);
  if (!tool) {
    return ToolResult.fail(`Tool not found: ${name}`, { tool: name });
  }
  return tool.execute(input);
}

/**
 * Unregister a tool
 * @param {string} name - Tool name
 * @returns {boolean} True if tool was removed
 */
export function unregisterTool(name) {
  return toolRegistry.delete(name);
}

/**
 * Clear all registered tools
 */
export function clearTools() {
  toolRegistry.clear();
}

/**
 * Get tool count
 * @returns {number}
 */
export function getToolCount() {
  return toolRegistry.size;
}

/**
 * Create a simple tool from a function
 * Utility for quick tool creation without extending BaseTool
 */
export function createSimpleTool({ name, description, inputSchema, handler, timeoutMs = 30000 }) {
  class SimpleTool extends BaseTool {
    constructor() {
      super({ name, description, inputSchema, timeoutMs });
      this.handler = handler;
    }

    async run(input) {
      return this.handler(input);
    }
  }

  const tool = new SimpleTool();
  registerTool(tool);
  return tool;
}

// Export the registry for advanced use cases
export { toolRegistry };

export default {
  registerTool,
  getTool,
  hasTool,
  getToolNames,
  getAllTools,
  getToolDefinitions,
  executeTool,
  unregisterTool,
  clearTools,
  getToolCount,
  createSimpleTool,
  BaseTool,
  ToolResult,
};
