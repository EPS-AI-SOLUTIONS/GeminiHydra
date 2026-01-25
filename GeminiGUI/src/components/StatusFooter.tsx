import { useState, useEffect, memo } from 'react';

interface StatusFooterProps {
  isStreaming: boolean;
  isWorking: boolean;
  hasError: boolean;
  selectedModel: string;
}

const StatusFooterComponent: React.FC<StatusFooterProps> = ({
  isStreaming,
  isWorking,
  hasError,
  selectedModel
}) => {
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getStatusText = () => {
    if (isStreaming) return "ODBIERANIE STRUMIENIA DANYCH...";
    if (isWorking) return "WĄTEK ROBOCZY ZAJĘTY";
    if (hasError) return "POŁĄCZENIE PRZERWANE";
    return "SYSTEM GOTOWY";
  };

  return (
    <footer className="glass-panel rounded-lg px-2 py-0.5 border-[var(--matrix-border)] flex items-center justify-between text-[10px] font-mono shrink-0 transition-colors duration-300">
      <div className="flex items-center gap-4">
        <span className={`font-bold ${isStreaming || isWorking ? 'animate-pulse text-[var(--matrix-accent)]' : 'text-[var(--matrix-text-dim)]'}`}>
          [{getStatusText()}]
        </span>
        <span className="hidden md:inline text-[var(--matrix-text-dim)]">
          MEM: 24MB | BRIDGE: AKTYWNY
        </span>
      </div>

      <div className="flex items-center gap-4 text-[var(--matrix-text)]">
        <span className="opacity-70">MDL: {selectedModel || "BRAK"}</span>
        <span className="text-[var(--matrix-accent)]">{time}</span>
      </div>
    </footer>
  );
};

StatusFooterComponent.displayName = 'StatusFooter';

export const StatusFooter = memo(StatusFooterComponent);
