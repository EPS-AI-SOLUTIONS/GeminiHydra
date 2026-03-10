import { BaseChatInput, type BaseChatInputHandle } from '@jaskier/ui';
import { AlertCircle, ChevronDown, FolderOpen, Network, Send, StopCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/atoms';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { cn } from '@/shared/utils/cn';
import { useAgentStream } from '../hooks/useAgentStream';
import { ImagePreview } from './ImagePreview';
import { useChatFileHandler } from './useChatFileHandler';
import { WorkingFolderPicker } from './WorkingFolderPicker';

export interface Attachment {
  name: string;
  type: string;
  size: number;
}

export type OrchestrationMode = 'direct' | 'orchestrator';
export type OrchestrationPattern = 'auto' | 'hierarchical' | 'sequential' | 'parallel';

interface ChatInputProps {
  input: string;
  setInput: (val: string) => void;
  isStreaming?: boolean;
  onSubmit: (e?: React.FormEvent) => void;
  onOrchestrate?: () => void;
  onStop?: () => void;
  pendingImage?: string | null;
  onClearImage?: () => void;
  onPasteImage?: (base64: string) => void;
  onPasteFile?: (content: string, filename: string) => void;
  attachments?: Attachment[];
  onClearAttachment?: (index: number) => void;
  className?: string;
  disabled?: boolean;
  sessionId?: string;
  onWorkingDirectoryChange?: (path: string) => void;
}

const _PATTERN_OPTIONS: Array<{ value: OrchestrationPattern; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'hierarchical', label: 'Hierarchical' },
  { value: 'sequential', label: 'Sequential' },
  { value: 'parallel', label: 'Parallel' },
];

export const ChatInput = memo(
  ({
    input,
    setInput,
    isStreaming,
    onSubmit,
    onOrchestrate,
    _onStop,
    pendingImage,
    onClearImage,
    onPasteImage,
    onPasteFile,
    attachments = [],
    onClearAttachment,
    className,
    disabled,
    sessionId,
    onWorkingDirectoryChange,
  }: ChatInputProps) => {
    const { t } = useTranslation();
    const _theme = useViewTheme();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const baseInputRef = useRef<BaseChatInputHandle>(null);
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);

    const [_orchMode, _setOrchMode] = useState<OrchestrationMode>('direct');
    const [_orchPattern, _setOrchPattern] = useState<OrchestrationPattern>('auto');
    const [_showPatternPicker, setShowPatternPicker] = useState(false);

    const prevKeyRef = useRef(0);

    useEffect(() => {
      setValue(input);
      prevKeyRef.current++;
    }, [input]);

    const handleChange = useCallback(
      (val: string) => {
        setValue(val);
        setInput(val);
      },
      [setInput],
    );

    const handleSubmit = useCallback(
      (e?: React.FormEvent) => {
        e?.preventDefault();
        if ((!value.trim() && !pendingImage && attachments.length === 0) || isStreaming) return;
        onSubmit(e);
        setValue('');
      },
      [value, pendingImage, attachments.length, isStreaming, onSubmit],
    );

    const { handlePaste, handleDrop, handleFileSelect } = useChatFileHandler({
      onPasteImage,
      onPasteFile,
    });

    return (
      <section
        role="region"
        aria-label="Chat input"
        className="p-4 flex flex-col relative transition-all duration-300 z-10 w-full"
        onDrop={handleDrop}
      >
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute -top-12 left-4 right-4 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm flex items-center gap-2 backdrop-blur-md"
            >
              <AlertCircle size={16} />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <BaseChatInput
          ref={baseInputRef}
          value={value}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder={t('chat.inputPlaceholder', 'Type a message...')}
          disabled={disabled || isStreaming}
          className={className}
          onPaste={handlePaste as unknown as React.ClipboardEventHandler<HTMLTextAreaElement>}
          topActions={
            <div className="flex flex-col gap-2">
              {pendingImage &&
                (
                  <div className="flex w-full">
                  <ImagePreview
                    src={pendingImage.startsWith('data:') ? pendingImage : data:image/jpeg;base64,\}
                    onClear={onClearImage}
                  />
                </div>
                )}
              {sessionId && onWorkingDirectoryChange && (
                <WorkingFolderPicker sessionId={sessionId} onFolderChange={onWorkingDirectoryChange} />
              )}
            </div>
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
          rightActions={isStreaming ? undefined : undefined}
        />
      </section>
    );
  },
);

ChatInput.displayName = 'ChatInput';
export default ChatInput;
