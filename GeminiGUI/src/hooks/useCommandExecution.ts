/**
 * useCommandExecution - Command execution hook
 *
 * Handles system command execution via Tauri backend.
 * Extracted from App.tsx for better separation of concerns.
 */

import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { STATUS, TAURI_COMMANDS } from '../constants';
import type { Message } from '../types';

export interface CommandResult {
  command: string;
  success: boolean;
  output: string;
}

export interface UseCommandExecutionOptions {
  /** Function to add a message to the chat */
  addMessage: (msg: Message) => void;
  /** Function to update the last message content */
  updateLastMessage: (content: string) => void;
  /** Whether running in Tauri environment */
  isTauri: boolean;
}

export interface UseCommandExecutionReturn {
  /** Execute a system command and return the result */
  executeCommand: (cmd: string) => Promise<CommandResult>;
}

/**
 * Hook for executing system commands
 *
 * @example
 * ```tsx
 * const { executeCommand } = useCommandExecution({
 *   addMessage,
 *   updateLastMessage,
 *   isTauri,
 * });
 *
 * const result = await executeCommand('ls -la');
 * console.log(result.success, result.output);
 * ```
 */
export function useCommandExecution(
  options: UseCommandExecutionOptions
): UseCommandExecutionReturn {
  const { addMessage, updateLastMessage, isTauri } = options;

  const executeCommand = useCallback(
    async (cmd: string): Promise<CommandResult> => {
      addMessage({
        role: 'system',
        content: `> ${STATUS.EXECUTING} ${cmd}`,
        timestamp: Date.now(),
      });

      if (!isTauri) {
        const output = '[WEB SIMULATION] Command executed: ' + cmd;
        updateLastMessage('\n\n' + output);
        return { command: cmd, success: true, output };
      }

      try {
        const result = await invoke<string>(TAURI_COMMANDS.RUN_SYSTEM_COMMAND, {
          command: cmd,
        });
        updateLastMessage('\n\nRESULT:\n```\n' + result + '\n```\n');
        return { command: cmd, success: true, output: result };
      } catch (err) {
        const errorStr = String(err);
        updateLastMessage('\n\nERROR:\n' + errorStr);
        toast.error(`Błąd komendy: ${err}`);
        return { command: cmd, success: false, output: errorStr };
      }
    },
    [addMessage, updateLastMessage, isTauri]
  );

  return { executeCommand };
}

export default useCommandExecution;
