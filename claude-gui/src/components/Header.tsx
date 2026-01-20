import { RefreshCw, FolderOpen } from 'lucide-react';
import { useClaudeStore } from '../stores/claudeStore';
import { useClaude } from '../hooks/useClaude';

export function Header() {
  const { currentView, workingDir, setWorkingDir } = useClaudeStore();
  const { status } = useClaude();

  const viewTitles: Record<string, string> = {
    terminal: 'Terminal',
    settings: 'Settings',
    history: 'Approval History',
    rules: 'Auto-Approve Rules',
  };

  const handleChangeDir = async () => {
    // For now, use a simple prompt. In production, use Tauri's dialog API
    const newDir = window.prompt('Enter working directory:', workingDir);
    if (newDir) {
      setWorkingDir(newDir);
    }
  };

  return (
    <header className="header glass-panel">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-matrix-text-dim">Claude GUI</span>
        <span className="text-matrix-border">/</span>
        <span className="text-matrix-accent">{viewTitles[currentView]}</span>
      </div>

      {/* Center - Working Directory */}
      <button
        onClick={handleChangeDir}
        className="flex items-center gap-2 text-xs text-matrix-text-dim hover:text-matrix-accent transition-colors"
      >
        <FolderOpen size={14} />
        <span className="max-w-[300px] truncate">{workingDir}</span>
      </button>

      {/* Right side - Status */}
      <div className="flex items-center gap-4">
        {status.is_active && status.session_id && (
          <span className="text-xs text-matrix-text-dim">
            Session: {status.session_id.slice(0, 8)}...
          </span>
        )}

        <div className="flex items-center gap-2">
          <div
            className={`status-dot ${
              status.is_active ? 'status-dot-online' : 'status-dot-offline'
            }`}
          />
          <span className="text-xs">
            {status.is_active ? 'Online' : 'Offline'}
          </span>
        </div>

        <button
          className="p-2 rounded-lg hover:bg-matrix-accent/10 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} className="text-matrix-text-dim" />
        </button>
      </div>
    </header>
  );
}
