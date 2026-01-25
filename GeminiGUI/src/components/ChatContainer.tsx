/**
 * GeminiGUI - ChatContainer Component
 * @module components/ChatContainer
 *
 * Main chat interface container using sub-components.
 */

import { useState, useCallback, memo } from 'react';
import type { Message } from '../types';

// Sub-components
import { MessageList, ChatInput, DragDropZone, ChatMessageContextMenu } from './chat';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatContainerProps {
  messages: Message[];
  isStreaming: boolean;
  onSubmit: (prompt: string, image: string | null) => void;
  onExecuteCommand: (cmd: string) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ChatContainer = memo<ChatContainerProps>(
  ({
    messages,
    isStreaming,
    onSubmit,
    onExecuteCommand,
  }) => {
    const [pendingImage, setPendingImage] = useState<string | null>(null);
    const [textContext, setTextContext] = useState<string>('');
    const [contextMenu, setContextMenu] = useState<{
      x: number;
      y: number;
      message: Message;
    } | null>(null);

    // Handle image drop
    const handleImageDrop = useCallback((base64: string) => {
      setPendingImage(base64);
    }, []);

    // Handle text file drop
    const handleTextDrop = useCallback((content: string, filename: string) => {
      setTextContext(
        `[Plik Kontekstowy: ${filename}]\n\`\`\`\n${content}\n\`\`\`\n\nPrzeanalizuj tresc tego pliku.`
      );
    }, []);

    // Handle form submission
    const handleSubmit = useCallback(
      (prompt: string, image: string | null) => {
        // Include text context if available
        const finalPrompt = textContext ? `${textContext}\n\n${prompt}` : prompt;
        onSubmit(finalPrompt, image);
        setTextContext('');
        setPendingImage(null);
      },
      [onSubmit, textContext]
    );

    // Clear pending image
    const handleClearImage = useCallback(() => {
      setPendingImage(null);
    }, []);

    // Context Menu Handlers
    const handleContextMenu = useCallback((e: React.MouseEvent, message: Message) => {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        message,
      });
    }, []);

    const handleCloseContextMenu = useCallback(() => {
      setContextMenu(null);
    }, []);

    const handleCopyMessage = useCallback(() => {
      if (contextMenu) {
        navigator.clipboard.writeText(contextMenu.message.content);
        handleCloseContextMenu();
      }
    }, [contextMenu, handleCloseContextMenu]);

    return (
      <DragDropZone onImageDrop={handleImageDrop} onTextDrop={handleTextDrop}>
        <div className="glass-panel flex-1 h-full rounded-lg border-[var(--matrix-border)] flex flex-col min-h-0 relative">
          {/* Messages List */}
          <div className="flex-1 min-h-0">
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              onExecuteCommand={onExecuteCommand}
              onContextMenu={handleContextMenu}
            />
          </div>

          {/* Context Menu */}
          {contextMenu && (
            <ChatMessageContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              isUser={contextMenu.message.role === 'user'}
              onClose={handleCloseContextMenu}
              onCopy={handleCopyMessage}
              // Add onDelete and onRegenerate when supported by store
            />
          )}

          {/* Input Area */}
          <ChatInput
            isStreaming={isStreaming}
            onSubmit={handleSubmit}
            pendingImage={pendingImage}
            onClearImage={handleClearImage}
          />
        </div>
      </DragDropZone>
    );
  }
);

ChatContainer.displayName = 'ChatContainer';

export default ChatContainer;
