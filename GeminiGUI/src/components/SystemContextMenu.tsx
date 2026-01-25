import { useEffect, useState, useRef } from 'react';
import { Copy, Scissors, Clipboard, Maximize, Brain, FileCode, Terminal } from 'lucide-react';

export const SystemContextMenu = () => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [contextData, setContextData] = useState<{
    text: string;
    isInput: boolean;
    target: HTMLElement | null;
    isCommand: boolean;
  }>({ text: '', isInput: false, target: null, isCommand: false });

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      
      const target = e.target as HTMLElement;
      const selection = window.getSelection()?.toString().trim() || '';
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Simple heuristic for commands
      const isCommand = /^(git|npm|pnpm|yarn|docker|kubectl|echo|ls|dir|cd|python|node|cargo|rustc)\s+/.test(selection);

      if (!selection && !isInput) {
          setVisible(false);
          return;
      }

      setContextData({
        text: selection,
        isInput,
        target,
        isCommand
      });

      let x = e.clientX;
      let y = e.clientY;
      if (x > window.innerWidth - 220) x -= 220;
      if (y > window.innerHeight - 300) y -= 200;

      setPosition({ x, y });
      setVisible(true);
    };

    const handleClick = () => setVisible(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisible(false);
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const dispatchAction = (action: string, content: string) => {
      const event = new CustomEvent('gemini-context-action', { 
          detail: { action, content } 
      });
      window.dispatchEvent(event);
      setVisible(false);
  };

  const handleCopy = async () => {
    if (contextData.text) await navigator.clipboard.writeText(contextData.text);
    setVisible(false);
  };

  const handleCut = () => {
    if (contextData.isInput && contextData.text) {
      navigator.clipboard.writeText(contextData.text);
      document.execCommand('delete'); 
    }
    setVisible(false);
  };

  const handlePaste = async () => {
    if (contextData.isInput && contextData.target) {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          contextData.target.focus();
          document.execCommand('insertText', false, text);
        }
      } catch (err) { console.error(err); }
    }
    setVisible(false);
  };

  const handleSelectAll = () => {
    if (contextData.isInput && contextData.target) {
        (contextData.target as HTMLInputElement).select();
    } else {
        const range = document.createRange();
        range.selectNodeContents(document.body);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-[99999] min-w-[200px] glass-panel p-1.5 flex flex-col gap-1 border border-[var(--matrix-accent)] shadow-[0_0_20px_rgba(0,255,65,0.15)] animate-in fade-in duration-100"
      style={{ top: position.y, left: position.x }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* SWARM OPERATIONS (Only if text selected) */}
      {contextData.text && !contextData.isInput && (
        <>
          <div className="px-2 py-1 text-[10px] font-bold text-[var(--matrix-text-dim)] uppercase tracking-wider">
            Operacje Roju
          </div>
          
          <MenuItem 
            icon={<Brain size={14} />} 
            label="Zapytaj o to" 
            onClick={() => dispatchAction('ask', contextData.text)}
          />
          
          <MenuItem 
            icon={<FileCode size={14} />} 
            label="Analizuj Kod/Tekst" 
            onClick={() => dispatchAction('analyze', contextData.text)}
          />

          {contextData.isCommand && (
             <MenuItem 
                icon={<Terminal size={14} />} 
                label="Uruchom Komendę" 
                shortcut="Niebezpieczne"
                onClick={() => dispatchAction('run', contextData.text)}
                className="text-red-400 hover:text-red-300"
             />
          )}
          
          <div className="h-px bg-[var(--matrix-border)] my-1 mx-2 opacity-50" />
        </>
      )}

      {/* STANDARD ACTIONS */}
      <MenuItem 
        icon={<Copy size={14} />} 
        label="Kopiuj" 
        shortcut="Ctrl+C" 
        onClick={handleCopy} 
        disabled={!contextData.text} 
      />

      {contextData.isInput && (
        <>
          <MenuItem 
            icon={<Scissors size={14} />} 
            label="Wytnij" 
            shortcut="Ctrl+X" 
            onClick={handleCut} 
            disabled={!contextData.text} 
          />
          <MenuItem 
            icon={<Clipboard size={14} />} 
            label="Wklej" 
            shortcut="Ctrl+V" 
            onClick={handlePaste} 
          />
        </>
      )}

      <div className="h-px bg-[var(--matrix-border)] my-1 mx-2 opacity-50" />

      <MenuItem 
        icon={<Maximize size={14} />} 
        label="Zaznacz wszystko" 
        shortcut="Ctrl+A" 
        onClick={handleSelectAll} 
      />
    </div>
  );
};

const MenuItem = ({ 
  icon, 
  label, 
  shortcut, 
  onClick, 
  disabled = false,
  className = ""
}: { 
  icon: React.ReactNode, 
  label: string, 
  shortcut?: string, 
  onClick: () => void, 
  disabled?: boolean,
  className?: string
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`
      flex items-center justify-between w-full px-3 py-1.5 text-xs font-mono rounded hover:bg-[var(--matrix-accent)]/10 text-left transition-colors group
      ${disabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : 'cursor-pointer'}
      ${className ? className : 'text-[var(--matrix-text)]'}
    `}
  >
    <div className="flex items-center gap-2 group-hover:text-[var(--matrix-accent)] transition-colors">
      <span className="opacity-80 group-hover:opacity-100">{icon}</span>
      <span>{label}</span>
    </div>
    {shortcut && <span className="text-[var(--matrix-text-dim)] text-[9px] opacity-60">{shortcut}</span>}
  </button>
);
