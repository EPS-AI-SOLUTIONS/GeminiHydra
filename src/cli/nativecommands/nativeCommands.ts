/**
 * NativeCommands - Core native tools management commands
 *
 * Commands: init, status, shutdown
 *
 * @module cli/nativecommands/nativeCommands
 */

import {
  success, error,
  type CommandResult,
  initProjectTools,
  getTools,
  formatError,
  createFailedMessage,
  Spinner
} from './helpers.js';

// ============================================================
// Native Tools Command Group
// ============================================================

export const nativeCommands = {
  /**
   * Initialize native tools
   */
  async init(args: string[]): Promise<CommandResult> {
    const rootDir = args[0] || process.cwd();
    const spinner = new Spinner('Initializing native tools...');

    try {
      spinner.start();
      await initProjectTools(rootDir);
      spinner.stop();

      return success({
        components: ['FileSystem', 'Memory', 'Shell', 'Search'],
        rootDir
      }, `Native tools initialized for: ${rootDir}`);
    } catch (err) {
      spinner.stop();
      return error(createFailedMessage('initialize', err));
    }
  },

  /**
   * Show native tools status
   */
  async status(): Promise<CommandResult> {
    try {
      const tools = getTools();
      tools.printStatus();
      return success(null, 'Status displayed above');
    } catch (err) {
      return error(formatError(err));
    }
  },

  /**
   * Shutdown native tools
   */
  async shutdown(): Promise<CommandResult> {
    try {
      const tools = getTools();
      await tools.shutdown();
      return success(null, 'Native tools shutdown complete');
    } catch (err) {
      return error(formatError(err));
    }
  }
};
