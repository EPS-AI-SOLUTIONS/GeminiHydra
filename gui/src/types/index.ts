/**
 * GeminiHydra GUI Types
 */

// Agent types
export type AgentRole = 'geralt' | 'dijkstra' | 'yennefer' | 'regis' | 'triss' | 'vesemir';

export interface Agent {
  id: string;
  name: AgentRole;
  status: 'idle' | 'thinking' | 'done' | 'error';
  avatar?: string;
}

// Message types
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agent?: AgentRole;
  timestamp: Date;
  tokens?: number;
}

// Task types
export interface Task {
  id: number;
  agent: AgentRole;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  duration?: number;
  tokens?: number;
}

// Execution types
export interface ExecutionPlan {
  objective: string;
  tasks: Task[];
  phase: 'A' | 'B' | 'C' | 'D' | 'E';
  status: 'planning' | 'executing' | 'synthesizing' | 'completed' | 'failed';
}

export interface ExecutionResult {
  id: number;
  agent: AgentRole;
  success: boolean;
  content: string;
  duration?: number;
  tokens?: number;
}

// API types
export interface ApiConfig {
  baseUrl: string;
  apiKey?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

// Settings types
export interface Settings {
  theme: 'dark' | 'light' | 'system';
  streaming: boolean;
  verbose: boolean;
  language: 'en' | 'pl';
  model: string;
  temperature: number;
  maxTokens: number;
}

// Theme types
export type Theme = 'dark' | 'light';

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}
