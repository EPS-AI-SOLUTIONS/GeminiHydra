// Cross-session visibility: GH ↔ CH partner client
// Vite proxy: /partner-api → ClaudeHydra backend (:8082)

const PARTNER_BASE = '/partner-api';

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
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchPartnerSession(id: string): Promise<PartnerSession> {
  const res = await fetch(`${PARTNER_BASE}/api/sessions/${id}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Partner session ${id} not found`);
  return res.json();
}
