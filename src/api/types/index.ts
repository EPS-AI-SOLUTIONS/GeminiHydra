/**
 * API Types - Shared type definitions
 */

// ═══════════════════════════════════════════════════════════════════════════
// Settings Types
// ═══════════════════════════════════════════════════════════════════════════

export type Theme = 'dark' | 'light' | 'system';
export type Language = 'pl' | 'en';
export type ExecutionMode = 'basic' | 'enhanced' | 'swarm';

export interface Settings {
  theme: Theme;
  streaming: boolean;
  verbose: boolean;
  language: Language;
  model: string;
  temperature: number;
  maxTokens: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  streaming: true,
  verbose: false,
  language: 'pl',
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  maxTokens: 8192,
};

// ═══════════════════════════════════════════════════════════════════════════
// Message Types
// ═══════════════════════════════════════════════════════════════════════════

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  agent?: string;
  tier?: string;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  duration?: number;
  mode?: ExecutionMode;
  streaming?: boolean;
  error?: boolean;
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// Execution Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ExecuteRequest {
  prompt: string;
  mode?: ExecutionMode;
  options?: ExecuteOptions;
}

export interface ExecuteOptions {
  verbose?: boolean;
  skipResearch?: boolean;
}

export interface ExecutePlan {
  agent: string;
  tier: string;
  model: string;
  confidence: number;
  complexity: ComplexityInfo;
}

export interface ComplexityInfo {
  level: string;
  score: number;
}

export interface ExecuteResponse {
  plan: ExecutePlan;
  result: string;
  duration: number;
  mode: ExecutionMode;
}

export interface ExecuteErrorResponse {
  error: string;
  plan?: ExecutePlan;
}

// ═══════════════════════════════════════════════════════════════════════════
// SSE Event Types
// ═══════════════════════════════════════════════════════════════════════════

export type SSEEventType = 'plan' | 'chunk' | 'result' | 'error' | 'status';

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  data: T;
}

export interface SSEPlanEvent {
  type: 'plan';
  plan: ExecutePlan;
}

export interface SSEChunkEvent {
  type: 'chunk';
  content: string;
}

export interface SSEResultEvent {
  type: 'result';
  result: string;
  duration: number;
}

export interface SSEErrorEvent {
  type: 'error';
  error: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// API Response Types
// ═══════════════════════════════════════════════════════════════════════════

export interface HealthResponse {
  status: 'ok' | 'error';
  version: string;
  timestamp: string;
  uptime: number;
}

export interface AgentsResponse {
  agents: AgentSummary[];
}

export interface AgentSummary {
  role: string;
  persona: string;
  focus: string;
  tier: 'commander' | 'coordinator' | 'executor';
  model: string;
}

export interface HistoryResponse {
  messages: Message[];
  total: number;
}

export interface ClearHistoryResponse {
  success: boolean;
  cleared: number;
}

export interface ClassifyResponse {
  classification: {
    agent: string;
    tier: string;
    model: string;
    confidence: number;
  };
  complexity: {
    level: string;
    score: number;
    wordCount: number;
    hasCode: boolean;
    hasMultipleTasks: boolean;
  };
}

export interface ExecuteStatusResponse {
  available: boolean;
  modes?: ExecutionMode[];
  streaming?: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Server Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ServerOptions {
  port?: number;
  host?: string;
  logger?: boolean;
}

export interface ServerInfo {
  name: string;
  version: string;
  endpoints: string[];
}
