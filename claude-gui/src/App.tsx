import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { TerminalView } from './components/TerminalView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { RulesView } from './components/RulesView';
import { ChatHistoryView } from './components/ChatHistoryView';
import { OllamaChatView } from './components/OllamaChatView';
import { StatusLine } from './components/StatusLine';
import { useClaudeStore } from './stores/claudeStore';
import './index.css';

function App() {
  const { currentView } = useClaudeStore();

  const renderView = () => {
    switch (currentView) {
      case 'terminal':
        return <TerminalView />;
      case 'ollama':
        return <OllamaChatView />;
      case 'chats':
        return <ChatHistoryView />;
      case 'history':
        return <HistoryView />;
      case 'settings':
        return <SettingsView />;
      case 'rules':
        return <RulesView />;
      default:
        return <TerminalView />;
    }
  };

  return (
    <div className="h-screen w-screen flex bg-matrix-bg-primary overflow-hidden">
      {/* Background layers */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Background image - Cyberpunk Witcher */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: 'url(/background.webp)',
            opacity: 0.15,
          }}
        />

        {/* Dark overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-matrix-bg-primary/90 via-matrix-bg-secondary/80 to-matrix-bg-primary/90" />

        {/* Radial glow from center */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,65,0.08)_0%,transparent_60%)]" />

        {/* Vignette effect */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.4)_100%)]" />
      </div>

      {/* Main content */}
      <div className="relative flex w-full h-full p-3 gap-3">
        {/* Sidebar */}
        <Sidebar />

        {/* Main area */}
        <main className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Header */}
          <Header />

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {renderView()}
          </div>

          {/* Status Line */}
          <StatusLine />
        </main>
      </div>
    </div>
  );
}

export default App;
