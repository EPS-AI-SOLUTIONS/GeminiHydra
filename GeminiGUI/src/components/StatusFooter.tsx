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

  const getStatus = () => {
    if (isStreaming) return { text: 'Streaming', color: 'var(--matrix-accent)', pulse: true };
    if (isWorking) return { text: 'Praca', color: 'var(--matrix-warning)', pulse: true };
    if (hasError) return { text: 'Blad', color: 'var(--matrix-error)', pulse: false };
    return { text: 'Gotowy', color: 'var(--matrix-success)', pulse: false };
  };

  const status = getStatus();

  return (
    <footer className="glass-panel px-3 py-1 flex items-center justify-between text-[10px] font-mono shrink-0 transition-[background,color,border-color,box-shadow] duration-400 ease-[cubic-bezier(0.4,0,0.2,1)]">
      {/* Left: Status */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${status.pulse ? 'animate-pulse' : ''}`}
          style={{ background: status.color, boxShadow: `0 0 6px ${status.color}` }}
        />
        <span
          className={`font-medium ${status.pulse ? 'text-[var(--matrix-accent)]' : 'text-[var(--matrix-text-dim)]'}`}
        >
          {status.text}
        </span>
      </div>

      {/* Right: Model + Time */}
      <div className="flex items-center gap-3 text-[var(--matrix-text-dim)]">
        <span className="opacity-70">{selectedModel || 'brak'}</span>
        <span className="text-[var(--matrix-accent)]">{time}</span>
      </div>
    </footer>
  );
};

StatusFooterComponent.displayName = 'StatusFooter';

export const StatusFooter = memo(StatusFooterComponent);
