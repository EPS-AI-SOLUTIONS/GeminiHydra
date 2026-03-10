import { create } from 'zustand';

export interface LiveLogStore {
  addLog: (level: 'info' | 'success' | 'warning' | 'error', msg: string, data?: Record<string, unknown>) => void;
  clear: () => void;
  startRun: (total: number, name: string) => void;
  finishRun: (successCount: number, errorCount: number) => void;
  setSSEHealth: (status: 'idle' | 'connected' | 'waiting' | 'timeout' | 'error', count?: number) => void;
}

export const useLiveLogStore = create<LiveLogStore>((_set) => ({
  addLog: () => {},
  clear: () => {},
  startRun: () => {},
  finishRun: () => {},
  setSSEHealth: () => {},
}));
