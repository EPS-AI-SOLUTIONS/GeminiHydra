/**
 * Settings View - Application configuration
 */

import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { Button, Card, Badge } from '../components/ui';
import { useAppStore } from '../stores/appStore';
import { useTheme } from '../contexts/ThemeContext';
import type { Settings } from '../types';

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-[var(--matrix-border)] last:border-0">
      <div>
        <p className="text-sm font-medium text-[var(--matrix-text)]">{label}</p>
        {description && (
          <p className="text-xs text-[var(--matrix-text-dim)] mt-0.5">
            {description}
          </p>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleSwitch({ checked, onChange }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-[var(--matrix-accent)]' : 'bg-[var(--matrix-border)]'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

function Select({ value, onChange, options }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input w-40 cursor-pointer"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

const defaultSettings: Settings = {
  theme: 'dark',
  streaming: true,
  verbose: false,
  language: 'pl',
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  maxTokens: 8192,
};

export function SettingsView() {
  const { settings, updateSettings } = useAppStore();
  const { theme, setTheme } = useTheme();

  const handleReset = () => {
    if (confirm('Czy na pewno chcesz przywrócić domyślne ustawienia?')) {
      updateSettings(defaultSettings);
      setTheme('dark');
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--matrix-text)]">
            Ustawienia
          </h2>
          <p className="text-sm text-[var(--matrix-text-dim)] mt-1">
            Konfiguracja GeminiHydra
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<RotateCcw className="w-4 h-4" />}
          onClick={handleReset}
        >
          Resetuj
        </Button>
      </div>

      {/* General Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card variant="solid">
          <div className="px-4 py-3 border-b border-[var(--matrix-border)]">
            <h3 className="text-sm font-semibold text-[var(--matrix-text)]">
              Ogólne
            </h3>
          </div>
          <div className="px-4">
            <SettingRow label="Motyw" description="Wybierz jasny lub ciemny motyw">
              <Select
                value={theme}
                onChange={(v) => setTheme(v as 'dark' | 'light')}
                options={[
                  { value: 'dark', label: 'Ciemny' },
                  { value: 'light', label: 'Jasny' },
                ]}
              />
            </SettingRow>
            <SettingRow label="Język" description="Język interfejsu">
              <Select
                value={settings.language}
                onChange={(v) => updateSettings({ language: v as 'pl' | 'en' })}
                options={[
                  { value: 'pl', label: 'Polski' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </SettingRow>
            <SettingRow
              label="Streaming"
              description="Wyświetlaj odpowiedzi w czasie rzeczywistym"
            >
              <ToggleSwitch
                checked={settings.streaming}
                onChange={(v) => updateSettings({ streaming: v })}
              />
            </SettingRow>
            <SettingRow
              label="Verbose"
              description="Pokaż szczegółowe logi agentów"
            >
              <ToggleSwitch
                checked={settings.verbose}
                onChange={(v) => updateSettings({ verbose: v })}
              />
            </SettingRow>
          </div>
        </Card>
      </motion.div>

      {/* Model Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card variant="solid">
          <div className="px-4 py-3 border-b border-[var(--matrix-border)]">
            <h3 className="text-sm font-semibold text-[var(--matrix-text)]">
              Model
            </h3>
          </div>
          <div className="px-4">
            <SettingRow label="Model" description="Wybierz model Gemini">
              <Select
                value={settings.model}
                onChange={(v) => updateSettings({ model: v })}
                options={[
                  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
                  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
                  { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash' },
                ]}
              />
            </SettingRow>
            <SettingRow
              label="Temperatura"
              description="Kreatywność modelu (0.0 - 2.0)"
            >
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={settings.temperature}
                  onChange={(e) =>
                    updateSettings({ temperature: parseFloat(e.target.value) })
                  }
                  className="w-24 accent-[var(--matrix-accent)]"
                />
                <Badge variant="accent">{settings.temperature.toFixed(1)}</Badge>
              </div>
            </SettingRow>
            <SettingRow
              label="Max Tokens"
              description="Maksymalna długość odpowiedzi"
            >
              <Select
                value={settings.maxTokens.toString()}
                onChange={(v) => updateSettings({ maxTokens: parseInt(v) })}
                options={[
                  { value: '2048', label: '2048' },
                  { value: '4096', label: '4096' },
                  { value: '8192', label: '8192' },
                  { value: '16384', label: '16384' },
                  { value: '32768', label: '32768' },
                ]}
              />
            </SettingRow>
          </div>
        </Card>
      </motion.div>

      {/* Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card variant="glass" className="p-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--matrix-accent)] flex items-center justify-center">
              <span className="text-[var(--matrix-bg-primary)] font-bold font-mono">
                GH
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--matrix-text)]">
                GeminiHydra GUI
              </p>
              <p className="text-xs text-[var(--matrix-text-dim)]">
                Wersja 0.1.0 • React 19 + TypeScript + Vite
              </p>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
