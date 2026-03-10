// src/features/chat/components/ChatInput.tsx

import { BaseChatInput, type BaseChatInputHandle } from '@jaskier/ui';
import { AlertCircle, Network, Send, StopCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/atoms';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { cn } from '@/shared/utils/cn';
import { ImagePreview } from './ImagePreview';
import { useChatFileHandler } from './useChatFileHandler';

import { WorkingFolderPicker } from './WorkingFolderPicker';

export type OrchestrationMode = 'direct' | 'orchestrate';
export type OrchestrationPattern = 'auto' | 'sequential' | 'parallel' | 'loop' | 'hierarchical' | 'review' | 'security';

interface ChatInputProps {
  isStreaming: boolean;
  onSubmit: (prompt: string, image: string | null) => void;
  onOrchestrate?: (prompt: string, pattern: string) => void;
  onStop?: () => void;
  pendingImage: string | null;
  onClearImage: () => void;
  onPasteImage?: (base64: string) => void;
  onPasteFile?: (content: string, filename: string) => void;
  onAttachPath?: (path: string) => void;
  promptHistory?: string[];
  sessionId?: string;
  workingDirectory?: string;
  onWorkingDirectoryChange?: (wd: string) => void;
  initialValue?: string;
  initialValueKey?: number;
}

const _PATTERN_OPTIONS: Array<{ value: OrchestrationPattern; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'hierarchical', label: 'Hierarchical' },
  { value: 'sequential', label: 'Sequential' },
  { value: 'parallel', label: 'Parallel' },
  { value: 'loop', label: 'Loop' },
  { value: 'review', label: 'Code Review' },
  { value: 'security', label: 'Security Review' },
];

export const ChatInput = memo<ChatInputProps>(
  ({
    isStreaming,
    onSubmit,
    onOrchestrate,
    onStop,
    pendingImage,
    onClearImage,
    onPasteImage,
    onPasteFile,
    promptHistory = [],
    sessionId,
    workingDirectory,
    onWorkingDirectoryChange,
    initialValue,
    initialValueKey,
  }) => {
    const { t } = useTranslation();
    const _theme = useViewTheme();
    const _fileInputRef = useRef<HTMLInputElement>(null);
    const baseInputRef = useRef<BaseChatInputHandle>(null);
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);

    const [orchMode, _setOrchMode] = useState<OrchestrationMode>('direct');
    const [orchPattern, _setOrchPattern] = useState<OrchestrationPattern>('auto');
    const [_showPatternPicker, setShowPatternPicker] = useState(false);

    const prevKeyRef = useRef(0);
    useEffect(() => {
      if (initialValueKey !== undefined && initialValueKey !== prevKeyRef.current && initialValue) {
        prevKeyRef.current = initialValueKey;
        setValue(initialValue);
        baseInputRef.current?.setValue(initialValue);
      }
    }, [initialValue, initialValueKey]);

    const canSubmit = !isStreaming && (value.trim().length > 0 || !!pendingImage);

    const handleSubmit = useCallback(
      (val: string) => {
        if (!canSubmit) return;
        const trimmed = val.trim();
        if (orchMode === 'orchestrate' && onOrchestrate) {
          const pattern = orchPattern === 'auto' ? 'hierarchical' : orchPattern;
          onOrchestrate(trimmed, pattern);
        } else {
          onSubmit(trimmed, pendingImage);
        }
        setValue('');
        setError(null);
        setShowPatternPicker(false);
        baseInputRef.current?.clear();
      },
      [canSubmit, onSubmit, onOrchestrate, pendingImage, orchMode, orchPattern],
    );

    const { handlePaste, handleDrop, handleFileSelect } = useChatFileHandler({
      onPasteImage,
      onPasteFile,
    });

    return (
      <section aria-label="Chat input" className="p-4 flex flex-col relative transition-all duration-300 z-10 w-full" onDrop={handleDrop}>
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className={cn(
                'absolute bottom-full left-4 mb-2',
                'flex items-center gap-2 text-sm',
                'text-red-400 bg-red-950/90 border border-red-500/30',
                'px-3 py-2 rounded-lg shadow-lg backdrop-blur-sm',
              )}
            >
              <AlertCircle size={14} />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <BaseChatInput
          ref={baseInputRef}
          value={value}
          onChange={setValue}
          onSend={handleSubmit}
          disabled={isStreaming}
          placeholder={pendingImage ? t('chat.describeVisualContext') : t('chat.typeMessage')}
          promptHistory={promptHistory}
          onPaste={handlePaste as React.ClipboardEventHandler<HTMLTextAreaElement>}
          topActions={
            <>
              {pendingImage && (
                <div className="flex w-full mb-2">
                  <ImagePreview src={pendingImage} onRemove={onClearImage} />
                </div>
              )}
              {sessionId && onWorkingDirectoryChange && (
                <WorkingFolderPicker
                  sessionId={sessionId}
                  workingDirectory={workingDirectory ?? ''}
                  onDirectoryChange={onWorkingDirectoryChange}
                />
              )
          }
          leftActions={
            onOrchestrate ? (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-white/50 hover:text-white/80 hover:bg-white/10"
                  onClick={(e) => {
                    e.preventDefault();
                    onOrchestrate();
                  }}
                  title="Orchestrate Sub-Agents"
                >
                  <Network size={20} />
                </Button>
              </div>
            ) : undefined
          }
          rightActions={
            isStreaming ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onStopGeneration}
                className="text-red-400 hover:text-red-300 hover:bg-red-400/10 mr-1"
                title="Zatrzymaj generowanie"
              >
                <StopCircle size={20} />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={!input.trim() && !pendingImage && attachments.length === 0}
                variant="ghost"
                size="icon"
                className={cn(
                  'rounded-full transition-all duration-300 w-10 h-10',
                  input.trim() || pendingImage || attachments.length > 0
                    ? 'bg-matrix-accent/20 text-matrix-accent hover:bg-matrix-accent/30 hover:scale-105 shadow-[0_0_15px_rgba(var(--matrix-accent-rgb),0.3)]'
                    : 'text-white/30',
                )}
              >
                <Send size={20} strokeWidth={2.5} className="ml-0.5" />
              </Button>
            )
          }
        />
      </form>
    );
  },
);

ChatInput.displayName = 'ChatInput';
export default ChatInput;
