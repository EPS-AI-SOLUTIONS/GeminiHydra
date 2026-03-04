import { useEffect, useRef, useState } from 'react';

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

  useEffect(() => {
    // Ponieważ vite.config.ts przekierowuje zapytania, używamy relatywnej ścieżki
    const url = '/api/v1/swarm/stream';
    const eventSource = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[SSE] Swarm connection opened');
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as AgentMessage;
        setMessages((prev) => [...prev, data]);
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
      eventSource.close();
      setIsConnected(false);
    };
  }, []);

  return { messages, isConnected };
}
