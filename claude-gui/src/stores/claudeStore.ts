import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ApprovalHistoryEntry,
  ApprovalRule,
  ClaudeEvent,
  SessionStatus,
} from '../types/claude';

interface OutputLine {
  id: string;
  timestamp: Date;
  type: 'output' | 'assistant' | 'tool' | 'error' | 'system' | 'approval';
  content: string;
  data?: Record<string, unknown>;
}

// API Keys configuration
interface ApiKeys {
  anthropic: string;
  openai: string;
  google: string;
  mistral: string;
  groq: string;
  brave: string;
  github: string;
  greptile: string;
}

// Endpoints configuration
interface Endpoints {
  ollama: string;
  claudeApi: string;
  openaiApi: string;
}

interface ClaudeState {
  // Session state
  status: SessionStatus;
  isConnecting: boolean;

  // Terminal output
  outputLines: OutputLine[];

  // Pending approval
  pendingApproval: ClaudeEvent | null;

  // History
  history: ApprovalHistoryEntry[];

  // Rules
  rules: ApprovalRule[];

  // Settings
  workingDir: string;
  cliPath: string;
  sidebarCollapsed: boolean;
  currentView: 'terminal' | 'settings' | 'history' | 'rules' | 'chats' | 'ollama';

  // API Configuration
  apiKeys: ApiKeys;
  endpoints: Endpoints;

  // Session Manager
  activeSessionId: string | null;

  // Actions
  setStatus: (status: SessionStatus) => void;
  setConnecting: (connecting: boolean) => void;
  addOutputLine: (line: Omit<OutputLine, 'id' | 'timestamp'>) => void;
  clearOutput: () => void;
  setPendingApproval: (event: ClaudeEvent | null) => void;
  setHistory: (history: ApprovalHistoryEntry[]) => void;
  addHistoryEntry: (entry: ApprovalHistoryEntry) => void;
  setRules: (rules: ApprovalRule[]) => void;
  setWorkingDir: (dir: string) => void;
  setCliPath: (path: string) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCurrentView: (view: ClaudeState['currentView']) => void;
  setApiKey: (provider: keyof ApiKeys, key: string) => void;
  setEndpoint: (name: keyof Endpoints, url: string) => void;
  setActiveSessionId: (sessionId: string | null) => void;
  resetSession: () => void;
}

export const useClaudeStore = create<ClaudeState>()(
  persist(
    (set) => ({
      // Initial state
      status: {
        is_active: false,
        pending_approval: false,
        auto_approve_all: false,
        approved_count: 0,
        denied_count: 0,
        auto_approved_count: 0,
      },
      isConnecting: false,
      outputLines: [],
      pendingApproval: null,
      history: [],
      rules: [],
      workingDir: 'C:\\Users\\BIURODOM\\Desktop\\ClaudeCli',
      cliPath: 'C:\\Users\\BIURODOM\\Desktop\\ClaudeCli\\bin\\claude-code\\cli.js',
      sidebarCollapsed: false,
      currentView: 'terminal',

      // API Configuration - initial empty values
      apiKeys: {
        anthropic: '',
        openai: '',
        google: '',
        mistral: '',
        groq: '',
        brave: '',
        github: '',
        greptile: '',
      },
      endpoints: {
        ollama: 'http://127.0.0.1:11434',
        claudeApi: 'https://api.anthropic.com',
        openaiApi: 'https://api.openai.com/v1',
      },

      // Session Manager
      activeSessionId: null,

      // Actions
      setStatus: (status) => set({ status }),

      setConnecting: (isConnecting) => set({ isConnecting }),

      addOutputLine: (line) =>
        set((state) => ({
          outputLines: [
            ...state.outputLines.slice(-500), // Keep last 500 lines
            {
              ...line,
              id: crypto.randomUUID(),
              timestamp: new Date(),
            },
          ],
        })),

      clearOutput: () => set({ outputLines: [] }),

      setPendingApproval: (pendingApproval) => set({ pendingApproval }),

      setHistory: (history) => set({ history }),

      addHistoryEntry: (entry) =>
        set((state) => ({
          history: [...state.history.slice(-99), entry],
        })),

      setRules: (rules) => set({ rules }),

      setWorkingDir: (workingDir) => set({ workingDir }),

      setCliPath: (cliPath) => set({ cliPath }),

      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

      setCurrentView: (currentView) => set({ currentView }),

      setApiKey: (provider, key) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        })),

      setEndpoint: (name, url) =>
        set((state) => ({
          endpoints: { ...state.endpoints, [name]: url },
        })),

      setActiveSessionId: (activeSessionId) => set({ activeSessionId }),

      resetSession: () =>
        set({
          status: {
            is_active: false,
            pending_approval: false,
            auto_approve_all: false,
            approved_count: 0,
            denied_count: 0,
            auto_approved_count: 0,
          },
          isConnecting: false,
          pendingApproval: null,
        }),
    }),
    {
      name: 'claude-gui-storage',
      partialize: (state) => ({
        workingDir: state.workingDir,
        cliPath: state.cliPath,
        sidebarCollapsed: state.sidebarCollapsed,
        apiKeys: state.apiKeys,
        endpoints: state.endpoints,
        activeSessionId: state.activeSessionId,
      }),
    }
  )
);
