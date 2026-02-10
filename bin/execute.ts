/**
 * Execute - Swarm execution functions with context gathering
 *
 * @module bin/execute
 */

import chalk from 'chalk';
import { ProjectContext } from '../src/cli/ProjectContext.js';
import { costTracker, CostTracker } from '../src/cli/CostTracker.js';
import { sessionMemory } from '../src/memory/SessionMemory.js';
import { longTermMemory } from '../src/memory/LongTermMemory.js';
import { mcpBridge } from '../src/mcp/index.js';
import {
  ROOT_DIR,
  swarm,
  projectContext,
  setProjectContext,
} from './cli-config.js';

// ============================================================================
// CONTEXT GATHERING (shared between both execute functions)
// ============================================================================

async function gatherContext(objective: string): Promise<string> {
  let context = '';

  // Project context
  try {
    const ctx = new ProjectContext();
    setProjectContext(ctx);
    if (await ctx.load()) {
      context += ctx.getContextForTask(objective);
    }
  } catch {}

  // Long-term memory context
  try {
    await longTermMemory.init();
    const memoryContext = longTermMemory.getContextForTask(objective);
    if (memoryContext) {
      context += '\n' + memoryContext;
    }
  } catch {}

  // Session context
  const session = sessionMemory.getCurrentSession();
  if (session) {
    const recentMessages = sessionMemory.getRecentMessages(5);
    if (recentMessages.length > 0) {
      context += '\n## Recent Conversation\n';
      recentMessages.forEach(m => {
        context += `${m.role}: ${m.content.substring(0, 200)}...\n`;
      });
    }
  }

  // MCP context (available tools for agents)
  try {
    await mcpBridge.init({ projectRoot: ROOT_DIR });
    const mcpContext = mcpBridge.getMCPContext();
    if (mcpContext) {
      context += '\n' + mcpContext;
    }
  } catch {}

  return context;
}

// ============================================================================
// EXECUTE SWARM WITH RETURN (for interactive mode / task queue)
// ============================================================================

export async function executeSwarmWithReturn(objective: string, options: any): Promise<string> {
  const context = await gatherContext(objective);

  const fullObjective = context
    ? `Context:\n${context}\n\nTask: ${objective}`
    : objective;

  // Save to session memory
  await sessionMemory.addMessage('user', objective);

  const report = await swarm.executeObjective(fullObjective);

  // Save response to session
  await sessionMemory.addMessage('assistant', report, 'Swarm');
  await sessionMemory.saveSnapshot();

  // Auto-extract memories
  await longTermMemory.autoExtract(report, 'swarm-response');

  // Track tokens (estimate)
  const inputTokens = CostTracker.estimateTokens(fullObjective);
  const outputTokens = CostTracker.estimateTokens(report);
  await costTracker.track('gemini-3-pro-preview', inputTokens, outputTokens, objective);

  return report;
}

// ============================================================================
// EXECUTE SWARM (for direct CLI invocation)
// ============================================================================

export async function executeSwarm(objective: string, options: any) {
  try {
    const context = await gatherContext(objective);

    const fullObjective = context
      ? `Context:\n${context}\n\nTask: ${objective}`
      : objective;

    // Save to session memory
    await sessionMemory.addMessage('user', objective);

    const report = await swarm.executeObjective(fullObjective);
    console.log(chalk.green('\n═══ FINAL REPORT ═══\n'));
    console.log(report);

    // Save response to session
    await sessionMemory.addMessage('assistant', report, 'Swarm');
    await sessionMemory.saveSnapshot();

    // Auto-extract memories
    await longTermMemory.autoExtract(report, 'swarm-response');

    // Track tokens (estimate)
    const inputTokens = CostTracker.estimateTokens(fullObjective);
    const outputTokens = CostTracker.estimateTokens(report);
    await costTracker.track('gemini-3-pro-preview', inputTokens, outputTokens, objective);

  } catch (error: any) {
    console.error(chalk.red('FATAL ERROR:'), error.message);
  }
}
