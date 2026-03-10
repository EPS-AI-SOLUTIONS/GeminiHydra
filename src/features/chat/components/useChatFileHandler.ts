import { useCallback } from 'react';

interface UseChatFileHandlerProps {
  onPasteImage?: (base64: string) => void;
  onPasteFile?: (content: string, filename: string) => void;
}

export function useChatFileHandler({ onPasteImage, onPasteFile }: UseChatFileHandlerProps) {
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      // Basic paste is handled globally, but we can prevent default or handle specific cases here if needed.
    },
    [onPasteImage, onPasteFile],
  );

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Basic file select handler
  }, []);

  return {
    handlePaste,
    handleDrop,
    handleFileSelect,
  };
}
