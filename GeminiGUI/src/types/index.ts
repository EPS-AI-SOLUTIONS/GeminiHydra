/**
 * GeminiGUI - Centralized Type Definitions
 * @module types
 */

// ============================================================================
// RE-EXPORTED SHARED TYPES (Knowledge Graph)
// ============================================================================

// Re-export unified knowledge types from shared canonical location
// See shared/types/knowledge.types.ts for the source of truth
export type {
  KnowledgeNode,
  KnowledgeEdge,
  KnowledgeGraphData,
  KnowledgeNodeType,
  IKnowledgeGraph,
} from '@shared/types/knowledge.types';

export {
  createKnowledgeNode,
  createKnowledgeEdge,
} from '@shared/types/knowledge.types';

// Alias for backward compatibility - use KnowledgeGraphData for new code
export type { KnowledgeGraphData as KnowledgeGraph } from '@shared/types/knowledge.types';

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  role: MessageRole;
  content: string;
  timestamp: number;
}

// ============================================================================
// SESSION TYPES
// ============================================================================

export interface Session {
  id: string;
  title: string;
  createdAt: number;
}

// ============================================================================
// MODEL TYPES
// ============================================================================

export interface GeminiModelCapabilities {
  vision: boolean;
  functionCalling: boolean;
  jsonMode: boolean;
}

export interface GeminiModelMetadata {
  isExperimental: boolean;
  fetchedAt: number;
}

export interface GeminiModelInfo {
  id: string;
  provider: string;
  name: string;
  label: string;
  contextWindow: number;
  capabilities: GeminiModelCapabilities;
  metadata: GeminiModelMetadata;
}

// ============================================================================
// SETTINGS TYPES
// ============================================================================

export type Provider = 'llama' | 'gemini';

export interface Settings {
  systemPrompt: string;
  geminiApiKey: string;
  defaultProvider: Provider;
  selectedModel: string;
  useSwarm: boolean;
  llamaModelsDir?: string;
  llamaGpuLayers?: number;
  ollamaEndpoint?: string;
}

// ============================================================================
// VIEW TYPES (Dashboard Navigation)
// ============================================================================

export type View = 'chat' | 'agents' | 'history' | 'settings' | 'status';

// ============================================================================
// THEME TYPES
// ============================================================================

export type Theme = 'dark' | 'light' | 'system';

// ============================================================================
// STREAM TYPES (Tauri Events)
// ============================================================================

export interface StreamPayload {
  chunk: string;
  done: boolean;
}

// ============================================================================
// BRIDGE TYPES
// ============================================================================

export interface BridgeState {
  auto_approve: boolean;
}

export interface BridgeRequest {
  id: string;
  command?: string;
  message?: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp?: number;
}

// ============================================================================
// MEMORY TYPES (Agent Swarm)
// ============================================================================

export interface AgentMemory {
  id: string;
  agent: string;
  content: string;
  timestamp: number;
  tags?: string[];
  importance?: number;
  metadata?: Record<string, unknown>;
}

// KnowledgeNode, KnowledgeEdge, and KnowledgeGraph are now imported from
// shared types at ../../../src/types/knowledge.types.ts

// ============================================================================
// AGENT TYPES (Witcher Swarm)
// ============================================================================

export type AgentRole =
  | 'geralt' | 'dijkstra' | 'yennefer' | 'regis' | 'triss' | 'vesemir'
  | 'jaskier' | 'ciri' | 'eskel' | 'lambert' | 'zoltan' | 'philippa';

export type AgentTier = 'commander' | 'coordinator' | 'executor';

export interface AgentStatus {
  role: AgentRole;
  tier: AgentTier;
  status: 'idle' | 'thinking' | 'done' | 'error';
  taskCount?: number;
  tokensUsed?: number;
}

// ============================================================================
// EXECUTION PLAN TYPES
// ============================================================================

export type ExecutionPhase = 'PRE-A' | 'A' | 'B' | 'C' | 'D';

export interface ExecutionTask {
  id: number;
  agent: AgentRole;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  duration?: number;
  tokens?: number;
}

export interface ExecutionPlan {
  objective: string;
  tasks: ExecutionTask[];
  phase: ExecutionPhase;
  status: 'planning' | 'executing' | 'synthesizing' | 'completed' | 'failed';
}

// ============================================================================
// APP STATE TYPES (Zustand Store)
// ============================================================================

export interface AppState {
  // UI State
  count: number;
  theme: Theme;
  provider: Provider;
  currentView: View;

  // Session Management
  sessions: Session[];
  currentSessionId: string | null;
  chatHistory: Record<string, Message[]>;

  // Settings
  settings: Settings;

  // Pagination (optional, extended in store)
  messagesPerPage?: number;
  currentPage?: number;

  // Actions - Counter
  increment: () => void;
  decrement: () => void;
  reset: () => void;

  // Actions - Theme
  toggleTheme: () => void;

  // Actions - View
  setCurrentView: (view: View) => void;

  // Actions - Provider
  setProvider: (provider: Provider) => void;

  // Actions - Sessions
  createSession: () => void;
  deleteSession: (id: string) => void;
  selectSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;

  // Actions - Messages
  addMessage: (msg: Message) => void;
  updateLastMessage: (content: string) => void;
  clearHistory: () => void;

  // Actions - Settings
  updateSettings: (settings: Partial<Settings>) => void;

  // Actions - Pagination (optional)
  setCurrentPage?: (page: number) => void;
  setMessagesPerPage?: (count: number) => void;
}
