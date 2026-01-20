import { invoke } from '@tauri-apps/api/core';
import type {
  ApprovalHistoryEntry,
  ApprovalRule,
  SessionStatus,
} from '../types/claude';

// Claude IPC wrapper for Tauri commands
export const claudeIpc = {
  // Session management
  startSession: (
    workingDir: string,
    cliPath: string,
    initialPrompt?: string
  ): Promise<string> =>
    invoke('start_claude_session', {
      workingDir,
      cliPath,
      initialPrompt,
    }),

  stopSession: (): Promise<void> => invoke('stop_claude_session'),

  getStatus: (): Promise<SessionStatus> => invoke('get_session_status'),

  // Input/Output
  sendInput: (input: string): Promise<void> =>
    invoke('send_input', { input }),

  // Approval actions
  approve: (): Promise<void> => invoke('approve_action'),

  deny: (): Promise<void> => invoke('deny_action'),

  // Auto-approve settings
  toggleAutoApproveAll: (enabled: boolean): Promise<void> =>
    invoke('toggle_auto_approve_all', { enabled }),

  // Rules management
  getRules: (): Promise<ApprovalRule[]> => invoke('get_approval_rules'),

  updateRules: (rules: ApprovalRule[]): Promise<void> =>
    invoke('update_approval_rules', { rules }),

  // History
  getHistory: (): Promise<ApprovalHistoryEntry[]> =>
    invoke('get_approval_history'),

  clearHistory: (): Promise<void> => invoke('clear_approval_history'),
};

// Default CLI path based on environment
export function getDefaultCliPath(): string {
  // Adjust based on your Claude CLI location
  return 'C:\\Users\\BIURODOM\\Desktop\\ClaudeCli\\bin\\claude-code\\cli.js';
}

// Default working directory
export function getDefaultWorkingDir(): string {
  return 'C:\\Users\\BIURODOM\\Desktop\\ClaudeCli';
}
