// Store & Hooks
import { useAppStore, selectCurrentMessages } from './store/useAppStore';
import { useAppTheme, useStreamListeners, useEnvLoader } from './hooks';

// Components
import { SettingsModal } from './components/SettingsModal';
import { ChatContainer } from './components/ChatContainer';
import { SessionSidebar } from './components/SessionSidebar';
import { RightSidebar } from './components/RightSidebar';
import { StatusFooter } from './components/StatusFooter';
import { Header } from './components/layout/Header';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Toaster, toast } from 'sonner';

// Constants & Utils
import { STATUS, COMMAND_PATTERNS, TAURI_COMMANDS } from './constants';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { cn } from './utils';

import { WitcherRunes } from './components/effects/WitcherRunes';
import { SystemContextMenu } from './components/SystemContextMenu';

function App() {
  console.log('[App] Mounting...');
  
  // ========================================
  // Local State
  // ========================================
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isTauri, setIsTauri] = useState(false);

  // ========================================
  // Store State
  // ========================================
  const count = useAppStore((state) => state.count);
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  const sessions = useAppStore((state) => state.sessions);
  const settings = useAppStore((state) => state.settings);

  const increment = useAppStore((state) => state.increment);
  const decrement = useAppStore((state) => state.decrement);
  const createSession = useAppStore((state) => state.createSession);
  const selectSession = useAppStore((state) => state.selectSession);
  const deleteSession = useAppStore((state) => state.deleteSession);
  const updateSessionTitle = useAppStore((state) => state.updateSessionTitle);
  const addMessage = useAppStore((state) => state.addMessage);
  const updateLastMessage = useAppStore((state) => state.updateLastMessage);
  const clearHistory = useAppStore((state) => state.clearHistory);

  const currentMessages = useAppStore(selectCurrentMessages);
  const { toggleTheme, isDark } = useAppTheme();
  useEnvLoader();

  // ========================================
  // Initialization & Tauri Check
  // ========================================
  useEffect(() => {
    // Check if running in Tauri
    const checkTauri = async () => {
      try {
        await invoke('greet', { name: 'HealthCheck' });
        setIsTauri(true);
        console.log('[App] Tauri environment detected.');
      } catch (e) {
        console.log('[App] Web environment detected (Tauri unavailable).');
        setIsTauri(false);
      }
    };
    checkTauri();

    if (sessions.length === 0) {
      createSession();
    } else if (!currentSessionId) {
      selectSession(sessions[0].id);
    }
  }, [sessions.length, currentSessionId, createSession, selectSession, sessions]);

  // ========================================
  // Handlers
  // ========================================
  const handleToggleSettings = useCallback(() => setIsSettingsOpen((p) => !p), []);
  const handleCloseSettings = useCallback(() => setIsSettingsOpen(false), []);
  const handleToggleTheme = useCallback(() => toggleTheme(), [toggleTheme]);

  const handleClearHistory = useCallback(() => {
    if (confirm('Wyczyścić historię czatu?')) {
      clearHistory();
      toast.info('Historia wyczyszczona');
    }
  }, [clearHistory]);

  const executeCommand = useCallback(async (cmd: string) => {
    addMessage({ role: 'system', content: `> ${STATUS.EXECUTING} ${cmd}`, timestamp: Date.now() });
    
    if (!isTauri) {
       updateLastMessage('\n\n[WEB SIMULATION] Command executed: ' + cmd);
       return;
    }

    try {
      const result = await invoke<string>(TAURI_COMMANDS.RUN_SYSTEM_COMMAND, { command: cmd });
      updateLastMessage('\n\nRESULT:\n```\n' + result + '\n```\n');
    } catch (err) {
      updateLastMessage('\n\nERROR:\n' + String(err));
      toast.error(`Błąd komendy: ${err}`);
    }
  }, [addMessage, updateLastMessage, isTauri]);

  const handleSubmit = useCallback(async (userPrompt: string, attachedImage: string | null) => {
    let displayContent = userPrompt;
    if (attachedImage) displayContent = '![Uploaded Image](' + attachedImage + ')\n\n' + userPrompt;

    addMessage({ role: 'user', content: displayContent, timestamp: Date.now() });
    addMessage({ role: 'assistant', content: '', timestamp: Date.now() });

    setIsStreaming(true);
    
    // Web Simulation Mode
    if (!isTauri) {
        setTimeout(() => {
          updateLastMessage(STATUS.SWARM_INIT + '\n\n');
          setTimeout(() => {
             updateLastMessage("\n[SYMULACJA TRYBU WEB]\nBackend Tauri nie jest dostępny (Web Mode).\nAplikacja działa w trybie offline/demo.\n\nOdebrano: " + userPrompt);
             setIsStreaming(false);
          }, 800);
        }, 100);
        return;
    }

    try {
      updateLastMessage(STATUS.SWARM_INIT + '\n\n');
      await invoke(TAURI_COMMANDS.SPAWN_SWARM_AGENT, { objective: userPrompt });
    } catch (error) {
      updateLastMessage(`\n[${STATUS.SWARM_ERROR}: ${error}]`);
      toast.error('Błąd Roju Agentów');
      setIsStreaming(false);
    }
  }, [addMessage, updateLastMessage, isTauri]);

  // ========================================
  // Stream Listeners
  // ========================================
  useStreamListeners({
    onChunk: updateLastMessage,
    onComplete: () => {
      setIsStreaming(false);
      // Optional: toast.success('Zadanie ukończone');
    },
    onError: (error: unknown) => {
      console.error('[App] Stream error:', error);
      setIsStreaming(false);
      toast.error('Przerwano strumieniowanie');
    },
  });

  // ========================================
  // Keyboard Shortcuts
  // ========================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+, -> Settings
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen((p) => !p);
      }
      // Ctrl+/ -> Shortcuts
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        setIsShortcutsOpen((p) => !p);
      }
      // Ctrl+L -> Clear
      if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        handleClearHistory();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClearHistory]);

  // ========================================
  // Context Menu Actions Listener
  // ========================================
  useEffect(() => {
    const handleContextAction = (e: Event) => {
        const customEvent = e as CustomEvent<{ action: string; content: string }>;
        const { action, content } = customEvent.detail;

        if (action === 'ask') {
            handleSubmit(content, null);
        } else if (action === 'analyze') {
            handleSubmit(`[ANALIZA KODU/TEKSTU]\n\n\`\`\`\n${content}\n\`\`\`\n\nPrzeanalizuj powyższy fragment. Wskaż błędy, potencjalne problemy i zaproponuj optymalizację.`, null);
        } else if (action === 'run') {
            handleSubmit(`Chcę uruchomić komendę:\n\`${content}\`\n\nCzy jest bezpieczna? Jeśli tak, wykonaj ją.`, null);
        }
    };

    window.addEventListener('gemini-context-action', handleContextAction);
    return () => window.removeEventListener('gemini-context-action', handleContextAction);
  }, [handleSubmit]);

  // ========================================
  // Effects & Memos
  // ========================================
  useEffect(() => {
    if (isStreaming || currentMessages.length === 0) return;
    const lastMsg = currentMessages[currentMessages.length - 1];
    if (lastMsg.role === 'assistant') {
      const match = lastMsg.content.match(COMMAND_PATTERNS.EXECUTE);
      if (match) executeCommand(match[1]);
    }
  }, [currentMessages, isStreaming, executeCommand]);

  useEffect(() => {
    const openPreview = async () => {
      try {
        const current = getCurrentWindow();
        if (current.label === 'main') {
          const livePreview = await WebviewWindow.getByLabel('live-preview');
          livePreview?.show();
        }
      } catch (e) { console.warn('Window err:', e); }
    };
    openPreview();
  }, []);

  const logoSrc = useMemo(() => (isDark ? '/logodark.webp' : '/logolight.webp'), [isDark]);
  const headerSpanClass = useMemo(() => (isDark ? 'text-white' : 'text-gray-800'), [isDark]);
  const statusBadgeState = useMemo(() => 
    settings.geminiApiKey 
      ? { className: 'status-approved bg-green-500/10 border-green-500/30 text-green-400', text: STATUS.GEMINI_READY }
      : { className: 'status-pending bg-yellow-500/10 border-yellow-500/30 text-yellow-400', text: 'Local Only' },
  [settings.geminiApiKey]);

  return (
    <main className={cn(
      "container mx-auto p-1 h-screen flex flex-col gap-1 overflow-hidden transition-all duration-500 relative",
      "bg-[url('/background.webp')] bg-cover bg-center bg-no-repeat bg-blend-overlay",
      isDark ? "bg-black/30" : "bg-white/40"
    )}>
      <WitcherRunes isDark={isDark} />
      <SystemContextMenu />
      
      <SettingsModal isOpen={isSettingsOpen} onClose={handleCloseSettings} />
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
      <Toaster position="top-right" theme={isDark ? 'dark' : 'light'} />

      <Header 
        isDark={isDark}
        logoSrc={logoSrc}
        headerSpanClass={headerSpanClass}
        statusBadgeState={statusBadgeState}
        onClearHistory={handleClearHistory}
        onToggleSettings={handleToggleSettings}
        onToggleTheme={handleToggleTheme}
      />

      <div className="flex-1 flex gap-1 overflow-hidden min-h-0 relative">
        <div className="w-[200px] shrink-0 flex flex-col">
          <SessionSidebar 
            sessions={sessions}
            currentSessionId={currentSessionId}
            onCreateSession={createSession}
            onSelectSession={selectSession}
            onDeleteSession={deleteSession}
            onUpdateTitle={updateSessionTitle}
          />
        </div>
        
        <div className="flex-1 min-w-0 flex flex-col">
          <ChatContainer 
            messages={currentMessages}
            isStreaming={isStreaming}
            onSubmit={handleSubmit}
            onExecuteCommand={executeCommand}
          />
        </div>
        
        <div className="w-[200px] shrink-0 flex flex-col">
          <RightSidebar 
            count={count}
            onIncrement={increment}
            onDecrement={decrement}
            onExport={() => toast.info('Export not implemented yet')}
          />
        </div>
      </div>

      <StatusFooter 
        isStreaming={isStreaming}
        isWorking={false}
        hasError={false}
        selectedModel="Wolf Swarm v3.0"
      />
    </main>
  );
}

export default App;