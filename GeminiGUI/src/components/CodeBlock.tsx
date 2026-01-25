import React, { useState, memo, useRef } from 'react';
import { Check, Copy, Play, Save, Terminal } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';

interface CodeBlockProps {
  language: string;
  value: string;
  onRun?: (cmd: string) => void;
}

const CodeBlockComponent: React.FC<CodeBlockProps> = ({ language, value, onRun }) => {
  const [copied, setCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);

  const handleCopy = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectAll = () => {
    if (codeRef.current) {
        const range = document.createRange();
        range.selectNodeContents(codeRef.current);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
    }
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const filePath = await save({
        filters: [{
          name: language || 'Text',
          extensions: [language || 'txt']
        }]
      });

      if (filePath) {
        await invoke('save_file_content', { path: filePath, content: value });
      }
    } catch (error) {
      console.error('Failed to save file:', error);
      alert('Failed to save file: ' + error);
    }
  };

  /**
   * SECURITY: Safely escape code for shell execution
   * Prevents command injection via malicious code content
   */
  const escapeForShell = (code: string): string => {
    // Replace dangerous characters
    return code
      .replace(/\\/g, '\\\\')     // Escape backslashes first
      .replace(/"/g, '\\"')       // Escape double quotes
      .replace(/`/g, '\\`')       // Escape backticks (command substitution)
      .replace(/\$/g, '\\$')      // Escape dollar signs (variable expansion)
      .replace(/!/g, '\\!')       // Escape history expansion
      .replace(/\n/g, '\\n');     // Escape newlines
  };

  /**
   * SECURITY: Check if code contains potentially dangerous patterns
   */
  const containsDangerousPatterns = (code: string): boolean => {
    const dangerousPatterns = [
      /rm\s+-rf/i,
      /del\s+\/[sq]/i,
      /format\s+[a-z]:/i,
      />\s*\/dev\//i,
      /\|\s*sh\s*$/i,
      /\|\s*bash\s*$/i,
      /eval\s*\(/i,
      /exec\s*\(/i,
      /__import__\s*\(/i,
      /subprocess/i,
      /os\.system/i,
      /child_process/i,
    ];

    return dangerousPatterns.some(pattern => pattern.test(code));
  };

  const handleRun = () => {
    if (!onRun) return;

    // SECURITY: Check for dangerous patterns
    if (containsDangerousPatterns(value)) {
      alert('BEZPIECZEŃSTWO: Kod zawiera potencjalnie niebezpieczne wzorce i nie może być uruchomiony.');
      return;
    }

    // SECURITY: Limit code length
    if (value.length > 5000) {
      alert('BEZPIECZEŃSTWO: Kod jest zbyt długi (max 5000 znaków).');
      return;
    }

    setIsRunning(true);

    // SECURITY: Safe escaping for shell execution
    const escapedValue = escapeForShell(value);
    let command: string;

    if (language === 'python' || language === 'py') {
        // Use -c with properly escaped code
        command = `python -c "${escapedValue}"`;
    } else if (language === 'javascript' || language === 'js' || language === 'node') {
        command = `node -e "${escapedValue}"`;
    } else if (language === 'bash' || language === 'sh' || language === 'shell') {
        // For shell scripts, only allow simple read-only commands
        const safeShellCommands = ['echo', 'pwd', 'ls', 'dir', 'date', 'whoami', 'hostname'];
        const firstWord = value.trim().split(/\s+/)[0].toLowerCase();

        if (!safeShellCommands.includes(firstWord)) {
          alert(`BEZPIECZEŃSTWO: Tylko podstawowe komendy shell są dozwolone: ${safeShellCommands.join(', ')}`);
          setIsRunning(false);
          return;
        }
        command = value;
    } else {
        alert(`Uruchamianie dla ${language} nie jest bezpośrednio wspierane.`);
        setIsRunning(false);
        return;
    }

    onRun(command);
    setTimeout(() => setIsRunning(false), 1000);
  };

  return (
    <div className="rounded-md border border-[var(--matrix-border)] bg-black/40 overflow-hidden my-2">
      <div 
        onClick={handleSelectAll}
        className="flex justify-between items-center px-3 py-1.5 bg-white/5 border-b border-[var(--matrix-border)] cursor-pointer hover:bg-white/10 transition-colors select-none"
        title="Kliknij, aby zaznaczyć całość"
      >
        <span className="text-xs font-mono text-[var(--matrix-text-dim)] uppercase">{language || 'tekst'}</span>
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>

          {(language === 'python' || language === 'js' || language === 'javascript' || language === 'bash' || language === 'sh') && (
              <button
                onClick={handleRun}
                disabled={isRunning}
                className="text-[var(--matrix-text-dim)] hover:text-[var(--matrix-accent)] transition-colors"
                title="Uruchom Kod"
              >
                {isRunning ? <Terminal size={14} className="animate-spin"/> : <Play size={14} />}
              </button>
          )}

          <button
            onClick={handleSave}
            className="text-[var(--matrix-text-dim)] hover:text-[var(--matrix-accent)] transition-colors"
            title="Zapisz do Pliku"
          >
            <Save size={14} />
          </button>

          <button
            onClick={handleCopy}
            className="text-[var(--matrix-text-dim)] hover:text-[var(--matrix-accent)] transition-colors"
            title="Kopiuj"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <pre ref={codeRef} className="p-3 overflow-x-auto text-sm font-mono text-[var(--matrix-text)] bg-transparent m-0 select-text cursor-text">
        <code>{value}</code>
      </pre>
    </div>
  );
};

CodeBlockComponent.displayName = 'CodeBlock';

export const CodeBlock = memo(CodeBlockComponent);
