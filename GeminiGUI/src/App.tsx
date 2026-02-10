// Store & Hooks
import { useAppStore, selectCurrentMessages } from './store/useAppStore';
import { useShallow } from 'zustand/shallow';
import {
  useAppTheme,
  useStreamListeners,
  useEnvLoader,
  useAppKeyboardShortcuts,
  useCommandExecution,
  useContextMenuActions,
  useCopyToClipboard,
  useGlassPanel,
} from './hooks';
import { useTheme } from './contexts/ThemeContext';

// Components
import { ChatContainer } from './components/ChatContainer';
import { StatusFooter } from './components/StatusFooter';
import { Header } from './components/layout/Header';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './components/Sidebar';

// Lazy-loaded components for code splitting
import {
  SettingsModalLazy,
  ShortcutsModalLazy,
  WitcherRunesLazy,
  SystemContextMenuLazy,
} from './components/LazyComponents';
import { SuspenseFallback } from './components/SuspenseFallback';

// Constants & Utils
import { STATUS, COMMAND_PATTERNS, TAURI_COMMANDS, GEMINI_MODELS, DEFAULT_GEMINI_MODEL, AUTO_CONTINUE } from './constants';
import type { CommandResult } from './hooks/useCommandExecution';
import { containsDangerousPatterns } from './utils/validators';
import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';

// WitcherRunes and SystemContextMenu are lazy-loaded via LazyComponents

/**
 * Merge consecutive messages with the same role.
 * Gemini API requires alternating user/model turns.
 */
function mergeConsecutiveRoles(
  msgs: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  if (msgs.length === 0) return msgs;
  const merged: Array<{ role: string; content: string }> = [{ ...msgs[0] }];
  for (let i = 1; i < msgs.length; i++) {
    const prev = merged[merged.length - 1];
    if (msgs[i].role === prev.role) {
      prev.content += '\n\n' + msgs[i].content;
    } else {
      merged.push({ ...msgs[i] });
    }
  }
  return merged;
}

function App() {
  console.log('[App] Mounting...');

  // ========================================
  // Local State
  // ========================================
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isTauri, setIsTauri] = useState(false);
  const autoContinueCountRef = useRef(0);

  // ========================================
  // Store State
  // ========================================
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  const sessions = useAppStore(useShallow((state) => state.sessions));
  const settings = useAppStore(useShallow((state) => state.settings));
  const currentView = useAppStore((state) => state.currentView);

  const createSession = useAppStore((state) => state.createSession);
  const selectSession = useAppStore((state) => state.selectSession);
  const addMessage = useAppStore((state) => state.addMessage);
  const updateLastMessage = useAppStore((state) => state.updateLastMessage);
  const clearHistory = useAppStore((state) => state.clearHistory);

  const currentMessages = useAppStore(useShallow(selectCurrentMessages));
  const { toggleTheme, isDark } = useAppTheme();
  const { resolvedTheme } = useTheme();
  const glassPanel = useGlassPanel();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length, currentSessionId, createSession, selectSession]);

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

  const { copyToClipboard } = useCopyToClipboard();

  const handleCopySession = useCallback(() => {
    if (currentMessages.length === 0) {
      toast.info('Brak wiadomości do skopiowania');
      return;
    }
    const formatted = currentMessages
      .map((m: { role: string; content: string; timestamp: number }) => {
        const role = m.role === 'user' ? 'Użytkownik' : m.role === 'assistant' ? 'Asystent' : 'System';
        const time = new Date(m.timestamp).toLocaleTimeString('pl-PL');
        return `[${time}] ${role}:\n${m.content}`;
      })
      .join('\n\n---\n\n');
    copyToClipboard(formatted);
    toast.success('Sesja skopiowana do schowka');
  }, [currentMessages, copyToClipboard]);

  // Command execution (using dedicated hook)
  const { executeCommand } = useCommandExecution({
    addMessage,
    updateLastMessage,
    isTauri,
  });

  /**
   * Build conversation history from messages array for Gemini API.
   * Maps system messages to 'user' role (Gemini only supports user/model).
   * Merges consecutive same-role messages.
   */
  const buildGeminiHistory = useCallback((messages: Array<{ role: string; content: string }>) => {
    const mapped = messages
      .filter((m) => m.content.length > 0)
      .map((m) => ({
        // Gemini API only supports 'user' and 'assistant' (mapped to 'model' in Rust).
        // System messages (command results) are sent as 'user' context.
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));
    return mergeConsecutiveRoles(mapped);
  }, []);

  /**
   * Send a follow-up to Gemini (used for auto-continue after command execution).
   * Does NOT add a user message — caller is responsible for adding context.
   */
  const sendFollowUp = useCallback(async (allMessages: Array<{ role: string; content: string }>) => {
    if (!isTauri) return;

    addMessage({ role: 'assistant', content: '', timestamp: Date.now() });
    setIsStreaming(true);

    try {
      updateLastMessage('🔍 Analizuję wyniki...\n\n');
      const history = buildGeminiHistory(allMessages);

      await invoke(TAURI_COMMANDS.CHAT_WITH_GEMINI, {
        messages: history,
        model: settings.selectedModel || null,
        systemPrompt: settings.systemPrompt || null,
        temperature: 1.0,
        maxOutputTokens: 65536,
      });
    } catch (error) {
      updateLastMessage(`\n[Błąd Gemini: ${error}]`);
      toast.error('Błąd połączenia z Gemini');
      setIsStreaming(false);
    }
  }, [isTauri, addMessage, updateLastMessage, buildGeminiHistory, settings.systemPrompt, settings.selectedModel]);

  const handleSubmit = useCallback(async (userPrompt: string, attachedImage: string | null) => {
    autoContinueCountRef.current = 0; // Reset auto-continue on user input

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
      updateLastMessage('🔮 Łączenie z Gemini...\n\n');
      // Read fresh messages from store to avoid stale closure (H1 fix)
      const storeState = useAppStore.getState();
      const freshMessages = storeState.chatHistory[storeState.currentSessionId!] || [];
      const history = buildGeminiHistory([
        ...freshMessages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userPrompt },
      ]);

      const { selectedModel, systemPrompt } = useAppStore.getState().settings;
      await invoke(TAURI_COMMANDS.CHAT_WITH_GEMINI, {
        messages: history,
        model: selectedModel || null,
        systemPrompt: systemPrompt || null,
        temperature: 1.0,
        maxOutputTokens: 65536,
      });
    } catch (error) {
      updateLastMessage(`\n[Błąd Gemini: ${error}]`);
      toast.error('Błąd połączenia z Gemini');
      setIsStreaming(false);
    }
  }, [addMessage, updateLastMessage, isTauri, buildGeminiHistory]);

  // ========================================
  // Stream Listeners
  // ========================================
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStreamComplete = useCallback(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const handleStreamError = useCallback((error: unknown) => {
    console.error('[App] Stream error:', error);
    setIsStreaming(false);
    toast.error('Przerwano strumieniowanie');
  }, []);

  // H3 fix: Safety timeout to prevent isStreaming deadlock
  useEffect(() => {
    if (!isStreaming) return;
    const timeout = setTimeout(() => {
      console.warn('[App] Stream safety timeout reached (120s). Forcing isStreaming=false.');
      setIsStreaming(false);
      toast.warning('Timeout strumieniowania - zresetowano stan');
    }, 120_000);
    streamTimeoutRef.current = timeout;
    return () => {
      clearTimeout(timeout);
      streamTimeoutRef.current = null;
    };
  }, [isStreaming]);

  useStreamListeners({
    onChunk: updateLastMessage,
    onComplete: handleStreamComplete,
    onError: handleStreamError,
  });

  // ========================================
  // Keyboard Shortcuts (using dedicated hook)
  // ========================================
  const handleToggleShortcuts = useCallback(() => setIsShortcutsOpen((p) => !p), []);
  const handleCloseShortcuts = useCallback(() => setIsShortcutsOpen(false), []);

  useAppKeyboardShortcuts({
    onToggleSettings: handleToggleSettings,
    onToggleShortcuts: handleToggleShortcuts,
    onClearHistory: handleClearHistory,
    onCopySession: handleCopySession,
    onNewSession: createSession,
    onToggleTheme: handleToggleTheme,
  });

  // ========================================
  // Context Menu Actions (using dedicated hook)
  // ========================================
  useContextMenuActions({ handleSubmit });

  // ========================================
  // Effects & Memos
  // ========================================
  const [lastProcessedMsgIdx, setLastProcessedMsgIdx] = useState(-1);

  useEffect(() => {
    if (isStreaming || currentMessages.length === 0) return;
    const msgIdx = currentMessages.length - 1;
    // Skip if we already processed this message index
    if (msgIdx <= lastProcessedMsgIdx) return;
    const lastMsg = currentMessages[msgIdx];
    if (lastMsg.role === 'assistant') {
      // Find ALL [EXECUTE: ...] commands in the response
      const matches = [...lastMsg.content.matchAll(COMMAND_PATTERNS.EXECUTE_ALL)];
      if (matches.length > 0) {
        setLastProcessedMsgIdx(msgIdx);

        // H2 fix: cancellation guard for unmount safety
        let cancelled = false;

        const runCommandsAndContinue = async () => {
          // Execute each command and collect results
          const results: CommandResult[] = [];
          for (const match of matches) {
            if (cancelled) return; // H2: bail on unmount
            const cmd = match[1].trim();
            if (!cmd) continue;

            // A2 fix: Security check - validate command before execution
            if (containsDangerousPatterns(cmd)) {
              console.warn('[App] Blocked dangerous command from AI:', cmd);
              addMessage({
                role: 'system',
                content: `⚠️ ZABLOKOWANO niebezpieczną komendę: \`${cmd}\`\nKomenda zawiera potencjalnie destrukcyjne wzorce.`,
                timestamp: Date.now(),
              });
              continue;
            }

            const result = await executeCommand(cmd);
            if (cancelled) return; // H2: bail on unmount
            results.push(result);
          }

          if (cancelled) return; // H2: bail on unmount

          // Check auto-continue limit
          if (autoContinueCountRef.current >= AUTO_CONTINUE.MAX_ITERATIONS) {
            console.log('[App] Auto-continue limit reached, stopping.');
            autoContinueCountRef.current = 0;
            return;
          }

          if (!isTauri || results.length === 0) return;

          // Compose follow-up with command results for Gemini analysis
          const resultsSummary = results.map((r) => {
            if (r.success) {
              return `Komenda: ${r.command}\nWynik:\n\`\`\`\n${r.output}\n\`\`\``;
            }
            return `Komenda: ${r.command}\nBłąd: ${r.output}`;
          }).join('\n\n');

          const followUpContent =
            `Wyniki wykonanych komend:\n\n${resultsSummary}\n\nPrzeanalizuj te wyniki i odpowiedz użytkownikowi.`;

          if (cancelled) return; // H2: bail on unmount

          // Add as system message (visible in chat, sent as 'user' to Gemini API)
          addMessage({
            role: 'system',
            content: followUpContent,
            timestamp: Date.now(),
          });

          autoContinueCountRef.current += 1;

          // Small delay so UI can render command results
          await new Promise((resolve) => setTimeout(resolve, AUTO_CONTINUE.DELAY_MS));

          if (cancelled) return; // H2: bail on unmount

          // Build full history from current store state (freshest data)
          const freshMessages = useAppStore.getState().chatHistory[
            useAppStore.getState().currentSessionId!
          ] || [];

          await sendFollowUp(
            freshMessages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }))
          );
        };

        runCommandsAndContinue();

        // H2: cleanup cancels async chain on unmount
        return () => { cancelled = true; };
      } else {
        // No EXECUTE commands — reset auto-continue counter
        autoContinueCountRef.current = 0;
      }
    }
  }, [currentMessages, isStreaming, executeCommand, lastProcessedMsgIdx, isTauri, addMessage, sendFollowUp]);

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
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

  const statusBadgeState = useMemo(() =>
    settings.geminiApiKey
      ? { className: 'status-approved bg-green-500/10 text-green-400', text: STATUS.GEMINI_READY }
      : { className: 'status-pending bg-yellow-500/10 text-yellow-400', text: 'Local Only' },
  [settings.geminiApiKey]);

  const currentModel = useMemo(() => {
    if (!settings.geminiApiKey) return 'Local (llama.cpp)';
    const modelId = settings.selectedModel || DEFAULT_GEMINI_MODEL;
    const model = GEMINI_MODELS.find((m) => m.id === modelId);
    return model?.label ?? modelId;
  }, [settings.geminiApiKey, settings.selectedModel]);

  // ========================================
  // View Renderer
  // ========================================
  const renderView = () => {
    switch (currentView) {
      case 'chat':
        return (
          <div className="flex-1 flex gap-2 overflow-hidden min-h-0 relative h-full">
            <ErrorBoundary fallback={() => <div className="glass-panel p-4 text-red-400">Błąd czatu - odśwież stronę</div>}>
              <ChatContainer
                messages={currentMessages}
                isStreaming={isStreaming}
                onSubmit={handleSubmit}
                onExecuteCommand={executeCommand}
              />
            </ErrorBoundary>
          </div>
        );
      case 'agents':
        return (
          <div className="p-6 text-center">
            <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
              Panel agentów - wkrótce dostępny
            </p>
          </div>
        );
      case 'history':
        return (
          <div className="p-6 text-center">
            <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
              Historia sesji - wkrótce dostępna
            </p>
          </div>
        );
      case 'settings':
        return (
          <div className="p-6">
            <Suspense fallback={<SuspenseFallback message="Ładowanie ustawień..." />}>
              <SettingsModalLazy isOpen={true} onClose={() => useAppStore.getState().setCurrentView('chat')} />
            </Suspense>
          </div>
        );
      case 'status':
        return (
          <div className="p-6">
            <StatusFooter
              isStreaming={isStreaming}
              isWorking={false}
              hasError={false}
              selectedModel={currentModel}
            />
          </div>
        );
      default:
        return null;
    }
  };

  // ========================================
  // Render - Tissaia Dashboard Layout
  // ========================================
  return (
    <div className="relative flex h-screen w-full text-slate-100 overflow-hidden font-mono selection:bg-matrix-accent selection:text-black">
      {/* Background Layer 1 - Image */}
      <div className={`absolute inset-0 z-[1] bg-cover bg-center bg-no-repeat transition-opacity duration-1000 pointer-events-none ${resolvedTheme === 'light' ? "bg-[url('/backgroundlight.webp')] opacity-30" : "bg-[url('/background.webp')] opacity-25"}`} />
      {/* Background Layer 2 - Gradient overlay for readability */}
      <div className={`absolute inset-0 z-[2] pointer-events-none transition-opacity duration-1000 ${resolvedTheme === 'light' ? 'bg-gradient-to-b from-white/60 via-white/30 to-slate-100/70' : 'bg-gradient-to-b from-matrix-bg-primary/60 via-matrix-bg-primary/30 to-matrix-bg-secondary/70'}`} />
      {/* Background Layer 3 - Radial vignette */}
      <div className={`absolute inset-0 z-[2] pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] ${resolvedTheme === 'light' ? 'from-transparent via-transparent to-white/40' : 'from-transparent via-transparent to-black/50'}`} />

      <Suspense fallback={null}>
        <WitcherRunesLazy isDark={isDark} />
      </Suspense>
      <Suspense fallback={null}>
        <SystemContextMenuLazy />
      </Suspense>

      {isSettingsOpen && currentView !== 'settings' && (
        <Suspense fallback={<SuspenseFallback message="Ładowanie ustawień..." />}>
          <SettingsModalLazy isOpen={isSettingsOpen} onClose={handleCloseSettings} />
        </Suspense>
      )}
      {isShortcutsOpen && (
        <Suspense fallback={<SuspenseFallback message="Ładowanie..." size="sm" />}>
          <ShortcutsModalLazy isOpen={isShortcutsOpen} onClose={handleCloseShortcuts} />
        </Suspense>
      )}
      <Toaster position="top-right" theme={isDark ? 'dark' : 'light'} />

      {/* Main Content */}
      <div className="relative z-10 flex h-full w-full backdrop-blur-[1px] gap-4 p-4">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <main className={`flex-1 flex flex-col overflow-hidden relative rounded-2xl ${glassPanel}`}>
          {/* Header with breadcrumbs */}
          <Header
            isDark={isDark}
            statusBadgeState={statusBadgeState}
            currentModel={currentModel}
          />

          {/* View Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-matrix-accent/20">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentView}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                {renderView()}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Status Bar (footer) */}
          <footer className={`px-6 py-2 border-t ${resolvedTheme === 'light' ? 'border-slate-200/30 bg-white/20 text-slate-600' : 'border-white/10 bg-black/20 text-slate-400'} text-xs flex items-center justify-between`}>
            <div className="flex items-center gap-4">
              <span className={resolvedTheme === 'light' ? 'text-emerald-600' : 'text-matrix-accent'}>GeminiHydra v2.0.0</span>
              <span className={resolvedTheme === 'light' ? 'text-slate-300' : 'text-white/20'}>|</span>
              <span>
                {settings.geminiApiKey ? (
                  <span className={resolvedTheme === 'light' ? 'text-emerald-600' : 'text-matrix-accent'}>● Online</span>
                ) : (
                  <span className="text-yellow-500">● Local</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span>Wolf Swarm</span>
              <span className={resolvedTheme === 'light' ? 'text-slate-300' : 'text-white/20'}>|</span>
              <span>{new Date().toLocaleDateString('pl-PL')}</span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default App;
