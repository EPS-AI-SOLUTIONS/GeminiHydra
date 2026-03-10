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
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setTimeout(() => {
      console.warn('[SSE] Heartbeat lost. Forcing reconnect...');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        setIsConnected(false);
        // Force re-render/reconnect here if possible,
        // typically handled by higher level unmount/mount or manual retry
      }
    }, 15000); // 15 seconds timeout
  }, [handleTimeout]);

  const _addOptimisticMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      { agent_id: 'user', content, is_final: false, _pending: true } as AgentMessage & { _pending?: boolean },
    ]);
  };

  useEffect(() => {
    // Ponieważ vite.config.ts przekierowuje zapytania, używamy relatywnej ścieżki
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
      if (event.data === 'ping') return; // Ignore heartbeat frames
      try {
        const data = JSON.parse(event.data) as AgentMessage;
        setMessages((prev) => {
          // Remove optimistic user messages if needed, or simply append
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
      // EventSource posiada wbudowany mechanizm auto-reconnect,
      // jednak zamykając go wyzwalamy twardy reset przy błędach sieci
      eventSource.close();

      // Implementacja backoff po zamknięciu na wypadek błędu rate-limitu (429)
      setTimeout(() => {
        setIsConnected(false); // wyzwoli ewentualnie trigger przerysowania gdzieś wyżej
      }, 5000);
    };

    return () => {
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
      eventSource.close();
      setIsConnected(false);
    };
  }, [resetHeartbeat]);

  return { messages, isConnected };
}
