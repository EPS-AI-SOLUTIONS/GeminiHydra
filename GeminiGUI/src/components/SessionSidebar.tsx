import { useState, memo } from 'react';
import { Plus, Search, MessageSquare, Edit2, Trash2, X } from 'lucide-react';
import type { Session } from '../types';

interface SessionSidebarProps {
  sessions: Session[];
  currentSessionId: string | null;
  onCreateSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
}

const SessionSidebarComponent: React.FC<SessionSidebarProps> = ({
  sessions,
  currentSessionId,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  onUpdateTitle
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const filteredSessions = sessions.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startEditing = (session: Session) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  };

  const saveTitle = () => {
    if (editingSessionId) {
      onUpdateTitle(editingSessionId, editTitle);
      setEditingSessionId(null);
    }
  };

  return (
    <aside className="hidden md:flex md:col-span-1 glass-panel flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="p-3 flex flex-col gap-2.5">
        {/* New Chat button - full width */}
        <button
          onClick={onCreateSession}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
            bg-[var(--matrix-accent)]/10 text-[var(--matrix-accent)] border border-[var(--matrix-accent)]/15
            hover:bg-[var(--matrix-accent)]/20 transition-all active:scale-[0.98]"
        >
          <Plus size={14} />
          Nowy czat
        </button>

        {/* Search Bar */}
        <div className="relative">
          <Search size={14} className="absolute left-2 top-2 text-[var(--matrix-text-dim)]" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj..."
            className="w-full bg-[var(--matrix-input-bg)] rounded-lg pl-8 pr-7 py-1.5 text-xs text-[var(--matrix-text)] focus:outline-none focus:ring-2 focus:ring-[var(--matrix-accent)]/30 transition-[background,color] duration-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-[var(--matrix-text-dim)] hover:text-[var(--matrix-text)]"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Sessions label */}
      <div className="px-3 pb-1">
        <span className="text-[10px] uppercase tracking-wider text-[var(--matrix-text-dim)] opacity-50">Sesje</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {filteredSessions.map(session => {
          const isActive = session.id === currentSessionId;
          return (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`p-2 rounded-lg cursor-pointer flex justify-between items-center group transition-all ${
                isActive
                  ? 'border-l-2 border-[var(--matrix-accent)] bg-[var(--matrix-accent)]/10 text-[var(--matrix-accent)] font-medium'
                  : 'border-l-2 border-transparent hover:bg-[var(--matrix-accent)]/5 text-[var(--matrix-text)]'
              }`}
            >
              {editingSessionId === session.id ? (
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
                  autoFocus
                  className="bg-white/90 text-black text-xs rounded px-1 w-full"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div
                  className="flex items-center gap-2 truncate flex-1"
                  onDoubleClick={() => startEditing(session)}
                >
                  <MessageSquare size={13} className="shrink-0 opacity-50" />
                  <span className="truncate text-xs">{session.title}</span>
                </div>
              )}

              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); startEditing(session); }}
                  className="text-[var(--matrix-text-dim)] hover:text-[var(--matrix-accent)]"
                >
                  <Edit2 size={11} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                  className="text-[var(--matrix-text-dim)] hover:text-red-500"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};

SessionSidebarComponent.displayName = 'SessionSidebar';

export const SessionSidebar = memo(SessionSidebarComponent);
