import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';
import { useEffect } from 'react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: 'Enter', desc: 'Wyślij wiadomość' },
  { key: 'Shift + Enter', desc: 'Nowa linia' },
  { key: 'Ctrl + K', desc: 'Focus na czat' },
  { key: 'Ctrl + L', desc: 'Wyczyść historię' },
  { key: 'Ctrl + ,', desc: 'Ustawienia' },
  { key: 'Ctrl + /', desc: 'Skróty klawiszowe (to okno)' },
];

export const ShortcutsModal = ({ isOpen, onClose }: ShortcutsModalProps) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md bg-[var(--matrix-bg)] border border-[var(--matrix-border)] rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--matrix-border)] bg-[var(--matrix-accent)]/5">
              <div className="flex items-center gap-2 text-[var(--matrix-accent)]">
                <Keyboard size={20} />
                <h2 className="font-bold text-lg">Skróty Klawiszowe</h2>
              </div>
              <button onClick={onClose} className="text-[var(--matrix-text-dim)] hover:text-[var(--matrix-text)]">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-2">
              {SHORTCUTS.map((s, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-[var(--matrix-border)]/30 last:border-0">
                  <span className="text-[var(--matrix-text)] text-sm">{s.desc}</span>
                  <span className="px-2 py-1 rounded-md bg-[var(--matrix-accent)]/10 border border-[var(--matrix-accent)]/30 text-xs font-mono text-[var(--matrix-accent)] font-bold">
                    {s.key}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
