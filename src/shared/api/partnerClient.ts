// Cross-session visibility: GH ↔ CH partner client
// Vite proxy: /partner-api → ClaudeHydra backend (:8082)

import { env } from '../config/env';

const PARTNER_BASE = '/partner-api';
const PARTNER_AUTH_SECRET = env.VITE_PARTNER_AUTH_SECRET;

export interface PartnerSessionSummary {
  id: string;
  title: string;
  created_at: string;
  message_count: number;
  updated_at?: string;
}

export interface PartnerMessage {
  id: string;
  role: string;
  content: string;
  model?: string | null;
  timestamp: string;
  agent?: string | null;
}

export interface PartnerSession {
  id: string;
  title: string;
  created_at: string;
  messages: PartnerMessage[];
}

export async function fetchPartnerSessions(): Promise<PartnerSessionSummary[]> {
  const res = await fetch(`${PARTNER_BASE}/api/sessions`, {
    signal: AbortSignal.timeout(5000),
    ...(PARTNER_AUTH_SECRET ? { headers: { Authorization: `Bearer ${PARTNER_AUTH_SECRET}` } } : {}),
  });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchPartnerSession(id: string): Promise<PartnerSession> {
  const res = await fetch(`${PARTNER_BASE}/api/sessions/${encodeURIComponent(id)}`, {
    signal: AbortSignal.timeout(10000),
    ...(PARTNER_AUTH_SECRET ? { headers: { Authorization: `Bearer ${PARTNER_AUTH_SECRET}` } } : {}),
  });
  if (!res.ok) throw new Error(`Partner session ${id} not found`);
  return res.json();
}
