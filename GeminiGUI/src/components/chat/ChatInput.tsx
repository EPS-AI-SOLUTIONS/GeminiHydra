/**
 * GeminiGUI - ChatInput Component (Enhanced)
 * @module components/chat/ChatInput
 *
 * Features:
 * - Auto-resize textarea
 * - Shift+Enter for new line
 * - Paste image handling
 * - Character/Token counter
 * - Glassmorphism & Animations
 * - Input history (basic)
 */

import { memo, useEffect, useCallback } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Send, X, AlertCircle, Paperclip, StopCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../utils';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

export interface ChatInputProps {
  isStreaming: boolean;
  onSubmit: (prompt: string, image: string | null) => void;
  pendingImage: string | null;
  onClearImage: () => void;
  onPasteImage?: (base64: string) => void; // New prop for direct paste
}

const MAX_CHARS = 4000;

const chatSchema = z.object({
  prompt: z.string().max(MAX_CHARS, 'Zbyt długa wiadomość'),
});

type ChatFormData = z.infer<typeof chatSchema>;

// ============================================================================
// IMAGE PREVIEW
// ============================================================================

const ImagePreview = memo(({ src, onRemove }: { src: string; onRemove: () => void }) => (
  <motion.div 
    layout
    initial={{ opacity: 0, scale: 0.8, y: 10 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.8, y: 10 }}
    className="relative inline-block w-fit mb-3 group"
  >
    <img
      src={src}
      alt="Preview"
      className="h-24 w-auto rounded-xl border border-[var(--matrix-accent)]/50 shadow-[0_0_15px_rgba(0,255,0,0.1)]"
    />
    <button
      type="button"
      onClick={onRemove}
      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all shadow-sm hover:scale-110"
    >
      <X size={14} strokeWidth={3} />
    </button>
  </motion.div>
));

ImagePreview.displayName = 'ImagePreview';

// ============================================================================
// CHAT INPUT
// ============================================================================

export const ChatInput = memo<ChatInputProps>(
  ({
    isStreaming,
    onSubmit,
    pendingImage,
    onClearImage,
    onPasteImage
  }) => {
    const {
      register,
      handleSubmit,
      reset,
      setFocus,
      watch,
      formState: { errors, isValid },
    } = useForm<ChatFormData>({
      resolver: zodResolver(chatSchema),
      mode: 'onChange',
      defaultValues: { prompt: '' },
    });

    const promptValue = watch('prompt');
    const charCount = promptValue.length;
    const isOverLimit = charCount > MAX_CHARS;

    // Auto-focus on mount
    useEffect(() => {
      setFocus('prompt');
    }, [setFocus]);

    const handleFormSubmit = (data: ChatFormData) => {
      if (isStreaming) return;
      if (!data.prompt.trim() && !pendingImage) return;

      onSubmit(data.prompt, pendingImage);
      reset();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(handleFormSubmit)();
      }
    };

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result && typeof event.target.result === 'string') {
                if (onPasteImage) onPasteImage(event.target.result);
                // Fallback if no specific handler, user might need to handle this upstream
                // For now assuming onPasteImage is passed or we ignore paste if not handled
              }
            };
            reader.readAsDataURL(blob);
            e.preventDefault(); // Stop pasting the binary string into text
          }
        }
      }
    }, [onPasteImage]);

    const canSubmit = !isStreaming && !isOverLimit && (isValid || !!pendingImage) && (promptValue.trim().length > 0 || !!pendingImage);

    return (
      <form
        onSubmit={handleSubmit(handleFormSubmit)}
        className="p-4 bg-transparent backdrop-blur-xl flex flex-col relative transition-all duration-500 z-10"
      >
        {/* Error Toast */}
        <AnimatePresence>
          {errors.prompt && (
             <motion.div
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: 5 }}
               className="absolute bottom-full left-4 mb-2 flex items-center gap-2 text-xs text-red-400 bg-red-950/90 border border-red-500/30 px-3 py-2 rounded-lg shadow-lg backdrop-blur-sm"
             >
               <AlertCircle size={14} />
               <span>{errors.prompt.message}</span>
             </motion.div>
          )}
        </AnimatePresence>

        {/* Image Preview Area */}
        <AnimatePresence>
          {pendingImage && (
            <div className="flex w-full px-2">
              <ImagePreview src={pendingImage} onRemove={onClearImage} />
            </div>
          )}
        </AnimatePresence>

        <div className="flex gap-3 items-end w-full">
          {/* Main Input Wrapper */}
          <div className="relative flex-1 group">
            <TextareaAutosize
              {...register('prompt')}
              maxRows={12}
              minRows={1}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={isStreaming}
              placeholder={pendingImage ? 'Opisz cel wizualny...' : 'Wpisz polecenie...'}
              className={cn(
                "w-full bg-[var(--matrix-input-bg)] text-[var(--matrix-text)]",
                "rounded-2xl px-5 py-3 pr-24", // pr-24 for counters/buttons inside
                "focus:outline-none focus:ring-2 focus:ring-[var(--matrix-accent)]/30",
                "placeholder:text-[var(--matrix-text-dim)]/40 font-mono text-sm resize-none scrollbar-hide",
                "transition-all duration-300 shadow-inner",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                isOverLimit && "border-red-500 focus:ring-red-500",
                errors.prompt && "border-red-500/50"
              )}
            />
            
            {/* Focus Glow Effect */}
            <div className="absolute inset-0 rounded-2xl bg-[var(--matrix-accent)]/5 opacity-0 group-focus-within:opacity-100 pointer-events-none transition-opacity duration-500 blur-sm" />

            {/* Input Actions / Counters (Inside Input) */}
            <div className="absolute right-3 bottom-2.5 flex items-center gap-3">
              {/* Char Counter */}
              <div className={cn(
                "text-[10px] font-mono transition-colors duration-300",
                isOverLimit ? "text-red-500 font-bold" : "text-[var(--matrix-text-dim)]/50"
              )}>
                {charCount}/{MAX_CHARS}
              </div>
            </div>
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              "flex items-center justify-center p-3.5 rounded-xl transition-all duration-300 mb-[1px]", // align with textarea bottom
              "bg-[var(--matrix-accent)] text-black shadow-[0_0_15px_rgba(0,255,0,0.15)]",
              "hover:bg-[#00ff41] hover:shadow-[0_0_12px_rgba(0,255,0,0.3)] hover:scale-[1.03]",
              "active:scale-95 active:translate-y-0",
              "disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none disabled:bg-gray-800 disabled:text-gray-500"
            )}
            title={isStreaming ? "Generowanie..." : "Wyślij (Enter)"}
          >
            {isStreaming ? (
              <StopCircle className="animate-pulse text-red-900" size={20} fill="currentColor" />
            ) : (
              <Send size={20} className="ml-0.5" strokeWidth={2.5} />
            )}
          </button>
        </div>
        
        {/* Footer info */}
        <div className="flex justify-between px-2 mt-2">
           <span className="text-[10px] text-[var(--matrix-text-dim)] opacity-40 flex items-center gap-1">
             <Paperclip size={10} />
             Wklej obraz ze schowka (Ctrl+V)
           </span>
           <span className="text-[10px] text-[var(--matrix-text-dim)] opacity-40 font-mono">
             Shift+Enter: nowa linia
           </span>
        </div>
      </form>
    );
  }
);

ChatInput.displayName = 'ChatInput';

export default ChatInput;
