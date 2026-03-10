import { useCallback, useEffect, useRef, useState } from 'react';

// Odzwierciedla strukturę AgentMessage z Rusta
export interface AgentMessage {
  agent_id: string;
  content: string;
  is_final: boolean;
}

export function useAgentStream() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setTimeout(() => {
      // No data received for 30s — connection may be stale
      const es = eventSourceRef.current;
      if (es && es.readyState === EventSource.OPEN) {
        console.warn('[SSE] Heartbeat timeout — closing stale connection');
        es.close();
      }
    }, 30_000);
  }, []);

  useEffect(() => {
    const url = '/api/v1/swarm/stream';
    const eventSource = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[SSE] Swarm connection opened');
      setIsConnected(true);
      resetHeartbeat();
    };

    eventSource.onmessage = (event) => {
      resetHeartbeat();
      if (event.data === 'ping') return;
      try {
        const data = JSON.parse(event.data) as AgentMessage;
        setMessages((prev) => {
          const filtered = prev.filter((m) => !(m as unknown as { _pending?: boolean })._pending);
          return [...filtered, data];
        });
      } catch (error) {
        console.error('[SSE] Failed to parse message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[SSE] Connection error:', error);
      setIsConnected(false);
      eventSource.close();
      eventSourceRef.current = null;

      // Reconnect with backoff
      reconnectTimerRef.current = setTimeout(() => {
        setIsConnected(false);
      }, 5000);
    };

    return () => {
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      eventSource.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [resetHeartbeat]);

  return { messages, isConnected };
}
