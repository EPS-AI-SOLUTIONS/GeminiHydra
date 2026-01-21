import { useEffect, useState } from 'react';
import {
  Terminal,
  Settings,
  History,
  Shield,
  ChevronLeft,
  ChevronRight,
  Power,
  PowerOff,
  Zap,
  MessageSquare,
  Bot,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  MessagesSquare,
  Brain,
  Bug,
} from 'lucide-react';
import { useClaudeStore } from '../stores/claudeStore';
import { useClaude } from '../hooks/useClaude';
import { useChatHistory, type ChatSessionSummary } from '../hooks/useChatHistory';

interface NavItem {
  id: 'terminal' | 'settings' | 'history' | 'rules' | 'chats' | 'ollama' | 'learning' | 'debug';
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { id: 'terminal', label: 'Terminal', icon: <Terminal size={18} /> },
  { id: 'ollama', label: 'Ollama AI', icon: <Bot size={18} /> },
  { id: 'learning', label: 'AI Learning', icon: <Brain size={18} /> },
  { id: 'debug', label: 'Debug LiveView', icon: <Bug size={18} /> },
  { id: 'chats', label: 'Historia czatów', icon: <MessageSquare size={18} /> },
  { id: 'rules', label: 'Reguły auto-appr.', icon: <Shield size={18} /> },
  { id: 'history', label: 'Historia zatwierdzeń', icon: <History size={18} /> },
  { id: 'settings', label: 'Ustawienia', icon: <Settings size={18} /> },
];

interface SessionItemProps {
  session: ChatSessionSummary;
  isActive: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}

function SessionItem({
  session,
  isActive,
  collapsed,
  onSelect,
  onDelete,
  onRename,
}: SessionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);

  const handleSave = () => {
    if (editTitle.trim() && editTitle !== session.title) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(session.title);
    setIsEditing(false);
  };

  if (collapsed) {
    return (
      <button
        onClick={onSelect}
        className={`w-full p-2 rounded flex items-center justify-center transition-colors ${
          isActive
            ? 'bg-matrix-accent/20 text-matrix-accent'
            : 'hover:bg-matrix-accent/10 text-matrix-text-dim'
        }`}
        title={session.title}
      >
        <MessageSquare size={16} />
      </button>
    );
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 p-1">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
          className="flex-1 glass-input text-xs py-1 px-2"
          autoFocus
        />
        <button
          onClick={handleSave}
          className="p-1 hover:bg-matrix-accent/20 rounded text-matrix-accent"
        >
          <Check size={14} />
        </button>
        <button
          onClick={handleCancel}
          className="p-1 hover:bg-red-500/20 rounded text-red-400"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`group flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
        isActive
          ? 'bg-matrix-accent/20 text-matrix-accent'
          : 'hover:bg-matrix-accent/10 text-matrix-text-dim'
      }`}
      onClick={onSelect}
    >
      <MessageSquare size={14} className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate">{session.title}</p>
        <p className="text-[10px] text-matrix-text-dim truncate">
          {session.message_count} wiadomości
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          className="p-1 hover:bg-matrix-accent/20 rounded"
          title="Zmień nazwę"
        >
          <Edit2 size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 hover:bg-red-500/20 rounded text-red-400"
          title="Usuń"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const {
    sidebarCollapsed,
    currentView,
    activeSessionId,
    setSidebarCollapsed,
    setCurrentView,
    setActiveSessionId,
  } = useClaudeStore();
  const { status, isConnecting, startSession, stopSession, toggleAutoApproveAll } =
    useClaude();
  const {
    sessions,
    loadSessions,
    createSession,
    deleteSession,
    updateTitle,
    loadSession,
  } = useChatHistory();

  const [showSessions, setShowSessions] = useState(true);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleCreateSession = async () => {
    const title = `Chat ${sessions.length + 1}`;
    const session = await createSession(title);
    if (session) {
      setActiveSessionId(session.id);
      setCurrentView('ollama');
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    await loadSession(sessionId);
    setCurrentView('ollama');
  };

  const handleDeleteSession = async (sessionId: string) => {
    await deleteSession(sessionId);
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
    }
  };

  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    await updateTitle(sessionId, newTitle);
  };

  return (
    <aside
      className={`glass-panel flex flex-col transition-all duration-300 ${
        sidebarCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo - znacznie powiększone */}
      <div className="flex flex-col items-center gap-3 p-4 border-b border-matrix-border">
        <div className={`rounded-xl overflow-hidden flex-shrink-0 bg-matrix-accent/10 shadow-lg shadow-matrix-accent/20 ${
          sidebarCollapsed ? 'w-12 h-12' : 'w-32 h-32'
        } transition-all duration-300`}>
          <img
            src="/logodark.webp"
            alt="Claude HYDRA"
            className="w-full h-full object-cover"
          />
        </div>
        {!sidebarCollapsed && (
          <div className="flex flex-col items-center text-center">
            <span className="text-lg font-bold text-matrix-accent text-glow">
              Claude HYDRA
            </span>
            <span className="text-xs text-matrix-text-dim">AI Swarm Control Center</span>
          </div>
        )}
      </div>

      {/* Session Status */}
      <div className="p-3 border-b border-matrix-border">
        <div className="glass-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`status-dot ${
                status.is_active ? 'status-dot-online' : 'status-dot-offline'
              }`}
            />
            {!sidebarCollapsed && (
              <span className="text-xs">
                {status.is_active ? 'Aktywny' : 'Nieaktywny'}
              </span>
            )}
          </div>

          {!sidebarCollapsed && status.is_active && (
            <div className="text-xs text-matrix-text-dim space-y-1">
              <div className="flex justify-between">
                <span>Zatwierdzone:</span>
                <span className="text-matrix-accent">{status.approved_count}</span>
              </div>
              <div className="flex justify-between">
                <span>Automatyczne:</span>
                <span className="text-blue-400">{status.auto_approved_count}</span>
              </div>
              <div className="flex justify-between">
                <span>Odrzucone:</span>
                <span className="text-red-400">{status.denied_count}</span>
              </div>
            </div>
          )}

          {/* Session buttons */}
          <div className="flex gap-2 mt-3">
            {!status.is_active ? (
              <button
                onClick={() => startSession()}
                disabled={isConnecting}
                className="glass-button glass-button-primary flex-1 flex items-center justify-center gap-2 text-xs"
              >
                <Power size={14} />
                {!sidebarCollapsed && (isConnecting ? 'Łączenie...' : 'Start')}
              </button>
            ) : (
              <button
                onClick={stopSession}
                className="glass-button glass-button-danger flex-1 flex items-center justify-center gap-2 text-xs"
              >
                <PowerOff size={14} />
                {!sidebarCollapsed && 'Zatrzymaj'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Auto-Approve All Toggle */}
      <div className="p-3 border-b border-matrix-border">
        <button
          onClick={() => toggleAutoApproveAll(!status.auto_approve_all)}
          className={`w-full glass-button flex items-center gap-2 text-xs ${
            status.auto_approve_all
              ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
              : ''
          }`}
        >
          <Zap size={14} />
          {!sidebarCollapsed && (
            <span>
              {status.auto_approve_all ? 'Auto-zatw.: WŁ' : 'Auto-zatw.: WYŁ'}
            </span>
          )}
        </button>
      </div>

      {/* Session Manager */}
      <div className="p-2 border-b border-matrix-border">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="flex items-center gap-2 text-xs text-matrix-text hover:text-matrix-accent transition-colors"
          >
            <MessagesSquare size={14} />
            {!sidebarCollapsed && <span>Sesje</span>}
            {!sidebarCollapsed && (
              showSessions ? (
                <ChevronLeft size={12} className="rotate-90" />
              ) : (
                <ChevronRight size={12} className="rotate-90" />
              )
            )}
          </button>
          <button
            onClick={handleCreateSession}
            className="p-1.5 hover:bg-matrix-accent/20 rounded text-matrix-accent transition-colors"
            title="Nowy czat"
          >
            <Plus size={14} />
          </button>
        </div>

        {showSessions && (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {sessions.length === 0 ? (
              <p className="text-[10px] text-matrix-text-dim text-center py-2">
                {sidebarCollapsed ? '' : 'Brak sesji'}
              </p>
            ) : (
              sessions.slice(0, 10).map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  collapsed={sidebarCollapsed}
                  onSelect={() => handleSelectSession(session.id)}
                  onDelete={() => handleDeleteSession(session.id)}
                  onRename={(newTitle) => handleRenameSession(session.id, newTitle)}
                />
              ))
            )}
            {sessions.length > 10 && !sidebarCollapsed && (
              <button
                onClick={() => setCurrentView('chats')}
                className="w-full text-[10px] text-matrix-accent hover:underline py-1"
              >
                Zobacz wszystkie ({sessions.length} sesji)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id)}
            className={`nav-item w-full ${
              currentView === item.id ? 'active' : ''
            }`}
          >
            {item.icon}
            {!sidebarCollapsed && <span className="text-sm">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-matrix-border">
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="nav-item w-full justify-center"
        >
          {sidebarCollapsed ? (
            <ChevronRight size={18} />
          ) : (
            <>
              <ChevronLeft size={18} />
              <span className="text-sm">Zwiń</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
