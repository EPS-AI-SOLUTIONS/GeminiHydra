import { BaseChatInput, type BaseChatInputHandle } from '@jaskier/ui';
import { Network } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/atoms';
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
  input?: string;
  setInput?: (val: string) => void;
  isStreaming?: boolean;
  onSend: (prompt: string, image: string | null) => void;
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
  workingDirectory?: string;
  onWorkingDirectoryChange?: (path: string) => void;
  promptHistory?: string[];
  initialValue?: string;
  initialValueKey?: number;
}

export const ChatInput = memo(
  ({
    input = '',
    setInput,
    isStreaming,
    onSend,
    onOrchestrate,
    pendingImage,
    onClearImage,
    onPasteImage,
    onPasteFile,
    attachments = [],
    className,
    disabled,
    sessionId,
    workingDirectory,
    onWorkingDirectoryChange,
    initialValue: _initialValue,
    initialValueKey: _initialValueKey,
  }: ChatInputProps) => {
    const { t } = useTranslation();
    const baseInputRef = useRef<BaseChatInputHandle>(null);
    const [value, setValue] = useState('');
    // const [error, _setError] = useState<string | null>(null);

    // const [_orchMode, _setOrchMode] = useState<OrchestrationMode>('direct');
    // const [_orchPattern, _setOrchPattern] = useState<OrchestrationPattern>('auto');
    const [_showPatternPicker, _setShowPatternPicker] = useState(false);

    const prevKeyRef = useRef(0);

    useEffect(() => {
      setValue(input);
      prevKeyRef.current++;
    }, [input]);

    const handleChange = useCallback(
      (val: string) => {
        setValue(val);
        setInput?.(val);
      },
      [setInput],
    );

    const handleSend = useCallback(
      (_val: string) => {
        if ((!value.trim() && !pendingImage && attachments.length === 0) || isStreaming) return;
        onSend(value, pendingImage ?? null);
        setValue('');
      },
      [value, pendingImage, attachments.length, isStreaming, onSend],
    );

    const {
      handlePaste,
      handleDrop,
      handleFileSelect: _handleFileSelect,
    } = useChatFileHandler({
      onPasteImage,
      onPasteFile,
    });

    return (
      <section
        aria-label="Chat input"
        className="p-4 flex flex-col relative transition-all duration-300 z-10 w-full"
        onDrop={handleDrop}
      >
        <BaseChatInput
          ref={baseInputRef}
          value={value}
          onChange={handleChange}
          onSend={handleSend}
          placeholder={t('chat.inputPlaceholder', 'Type a message...')}
          disabled={disabled || isStreaming}
          className={className}
          onPaste={handlePaste as unknown as React.ClipboardEventHandler<HTMLTextAreaElement>}
          topActions={
            <div className="flex flex-col gap-2">
              {pendingImage && onClearImage && (
                <div className="flex w-full">
                  <ImagePreview
                    src={pendingImage.startsWith('data:') ? pendingImage : `data:image/jpeg;base64,${pendingImage}`}
                    onClear={onClearImage}
                  />
                </div>
              )}
              {sessionId && onWorkingDirectoryChange && (
                <WorkingFolderPicker
                  sessionId={sessionId}
                  workingDirectory={workingDirectory ?? ''}
                  onFolderChange={onWorkingDirectoryChange}
                />
              )}
            </div>
          }
          leftActions={
            onOrchestrate ? (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
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
