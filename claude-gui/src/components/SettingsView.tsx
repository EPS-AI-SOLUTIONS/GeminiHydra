import { useState } from 'react';
import {
  FolderOpen,
  FileCode,
  Save,
  Key,
  Globe,
  Eye,
  EyeOff,
  Shield,
  ChevronDown,
  ChevronRight,
  Bot,
  Sparkles,
  Brain,
  Zap,
  Search,
  Github,
  Code2,
} from 'lucide-react';
import { useClaudeStore } from '../stores/claudeStore';

interface ApiKeyInputProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
}

function ApiKeyInput({
  label,
  icon,
  value,
  onChange,
  placeholder,
  description,
}: ApiKeyInputProps) {
  const [showKey, setShowKey] = useState(false);
  const hasValue = value.length > 0;

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm text-matrix-text">
        {icon}
        {label}
        {hasValue && (
          <span className="ml-auto text-xs text-matrix-accent">Configured</span>
        )}
      </label>
      <div className="relative">
        <input
          type={showKey ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full glass-input pr-10"
          placeholder={placeholder || `Enter ${label}...`}
        />
        <button
          type="button"
          onClick={() => setShowKey(!showKey)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-matrix-text-dim hover:text-matrix-accent transition-colors"
        >
          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {description && (
        <p className="text-xs text-matrix-text-dim">{description}</p>
      )}
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="glass-panel overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 p-4 hover:bg-matrix-accent/5 transition-colors"
      >
        {icon}
        <span className="text-sm font-semibold text-matrix-accent flex-1 text-left">
          {title}
        </span>
        {isOpen ? (
          <ChevronDown size={16} className="text-matrix-text-dim" />
        ) : (
          <ChevronRight size={16} className="text-matrix-text-dim" />
        )}
      </button>
      {isOpen && (
        <div className="p-4 pt-0 border-t border-matrix-border space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

export function SettingsView() {
  const {
    workingDir,
    cliPath,
    apiKeys,
    endpoints,
    setWorkingDir,
    setCliPath,
    setApiKey,
    setEndpoint,
  } = useClaudeStore();

  return (
    <div className="h-full flex flex-col overflow-auto">
      <h2 className="text-lg font-semibold text-matrix-accent mb-4">Settings</h2>

      <div className="space-y-4">
        {/* General Settings */}
        <CollapsibleSection
          title="General Settings"
          icon={<FolderOpen size={18} className="text-matrix-accent" />}
          defaultOpen={true}
        >
          {/* Working Directory */}
          <div>
            <label className="block text-sm text-matrix-text mb-2">
              <FolderOpen size={14} className="inline mr-2" />
              Working Directory
            </label>
            <input
              type="text"
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              className="w-full glass-input"
              placeholder="C:\path\to\project"
            />
            <p className="text-xs text-matrix-text-dim mt-1">
              The directory where Claude CLI will execute commands.
            </p>
          </div>

          {/* CLI Path */}
          <div>
            <label className="block text-sm text-matrix-text mb-2">
              <FileCode size={14} className="inline mr-2" />
              Claude CLI Path
            </label>
            <input
              type="text"
              value={cliPath}
              onChange={(e) => setCliPath(e.target.value)}
              className="w-full glass-input"
              placeholder="C:\path\to\cli.js"
            />
            <p className="text-xs text-matrix-text-dim mt-1">
              Path to the Claude Code CLI entry point (cli.js).
            </p>
          </div>
        </CollapsibleSection>

        {/* API Endpoints */}
        <CollapsibleSection
          title="API Endpoints"
          icon={<Globe size={18} className="text-blue-400" />}
          defaultOpen={true}
        >
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm text-matrix-text mb-2">
                <Bot size={14} />
                Ollama URL
              </label>
              <input
                type="text"
                value={endpoints.ollama}
                onChange={(e) => setEndpoint('ollama', e.target.value)}
                className="w-full glass-input"
                placeholder="http://127.0.0.1:11434"
              />
              <p className="text-xs text-matrix-text-dim mt-1">
                Local Ollama server endpoint for free AI inference.
              </p>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-matrix-text mb-2">
                <Sparkles size={14} />
                Anthropic API URL
              </label>
              <input
                type="text"
                value={endpoints.claudeApi}
                onChange={(e) => setEndpoint('claudeApi', e.target.value)}
                className="w-full glass-input"
                placeholder="https://api.anthropic.com"
              />
              <p className="text-xs text-matrix-text-dim mt-1">
                Claude API endpoint (default: api.anthropic.com).
              </p>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-matrix-text mb-2">
                <Brain size={14} />
                OpenAI API URL
              </label>
              <input
                type="text"
                value={endpoints.openaiApi}
                onChange={(e) => setEndpoint('openaiApi', e.target.value)}
                className="w-full glass-input"
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-xs text-matrix-text-dim mt-1">
                OpenAI API endpoint (or compatible like Azure OpenAI).
              </p>
            </div>
          </div>
        </CollapsibleSection>

        {/* AI Provider API Keys */}
        <CollapsibleSection
          title="AI Provider API Keys"
          icon={<Key size={18} className="text-yellow-400" />}
        >
          <div className="space-y-4">
            <ApiKeyInput
              label="Anthropic (Claude)"
              icon={<Sparkles size={14} className="text-purple-400" />}
              value={apiKeys.anthropic}
              onChange={(v) => setApiKey('anthropic', v)}
              placeholder="sk-ant-..."
              description="Required for Claude API access."
            />

            <ApiKeyInput
              label="OpenAI"
              icon={<Brain size={14} className="text-emerald-400" />}
              value={apiKeys.openai}
              onChange={(v) => setApiKey('openai', v)}
              placeholder="sk-..."
              description="For GPT-4 fallback."
            />

            <ApiKeyInput
              label="Google (Gemini)"
              icon={<Zap size={14} className="text-blue-400" />}
              value={apiKeys.google}
              onChange={(v) => setApiKey('google', v)}
              placeholder="AIza..."
              description="For Gemini fallback."
            />

            <ApiKeyInput
              label="Mistral"
              icon={<Bot size={14} className="text-orange-400" />}
              value={apiKeys.mistral}
              onChange={(v) => setApiKey('mistral', v)}
              placeholder="..."
              description="For Mistral fallback."
            />

            <ApiKeyInput
              label="Groq"
              icon={<Zap size={14} className="text-red-400" />}
              value={apiKeys.groq}
              onChange={(v) => setApiKey('groq', v)}
              placeholder="gsk_..."
              description="Ultra-fast inference fallback."
            />
          </div>
        </CollapsibleSection>

        {/* Service API Keys */}
        <CollapsibleSection
          title="Service API Keys"
          icon={<Shield size={18} className="text-cyan-400" />}
        >
          <div className="space-y-4">
            <ApiKeyInput
              label="Brave Search"
              icon={<Search size={14} className="text-orange-500" />}
              value={apiKeys.brave}
              onChange={(v) => setApiKey('brave', v)}
              placeholder="BSA..."
              description="For web search MCP server."
            />

            <ApiKeyInput
              label="GitHub PAT"
              icon={<Github size={14} className="text-gray-300" />}
              value={apiKeys.github}
              onChange={(v) => setApiKey('github', v)}
              placeholder="ghp_..."
              description="Personal Access Token for GitHub MCP."
            />

            <ApiKeyInput
              label="Greptile"
              icon={<Code2 size={14} className="text-green-400" />}
              value={apiKeys.greptile}
              onChange={(v) => setApiKey('greptile', v)}
              placeholder="..."
              description="For Greptile code search MCP."
            />
          </div>
        </CollapsibleSection>

        {/* Save Note */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-xs text-matrix-text-dim">
            <Save size={14} />
            <span>
              Settings are automatically saved to local storage.
            </span>
          </div>
          <p className="text-xs text-yellow-400/70 mt-2">
            Note: API keys are stored locally. For production use, consider using
            environment variables or a secure vault.
          </p>
        </div>

        {/* Info Section */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-matrix-accent mb-2">About</h3>
          <div className="text-xs text-matrix-text-dim space-y-1">
            <p>Claude Code GUI v0.1.0</p>
            <p>Auto-approve bridge for Claude Code CLI</p>
            <p className="pt-2">
              This GUI allows you to automatically approve or deny actions requested
              by Claude Code based on configurable rules.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
