/**
 * useLlamaChat - Hook for llama.cpp chat with streaming support
 * @module hooks/useLlamaChat
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { LlamaService, type ChatMessage } from '../services/tauri.service';
import { TAURI_EVENTS } from '../constants';

interface StreamPayload {
  chunk: string;
  done: boolean;
}

export interface UseLlamaChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface UseLlamaChatReturn {
  // State
  isStreaming: boolean;
  streamContent: string;
  error: string | null;

  // Actions
  sendMessage: (messages: ChatMessage[], options?: UseLlamaChatOptions) => Promise<string>;
  sendMessageStream: (messages: ChatMessage[], options?: UseLlamaChatOptions) => Promise<void>;
  generate: (prompt: string, system?: string, options?: UseLlamaChatOptions) => Promise<string>;
  generateStream: (prompt: string, system?: string, options?: UseLlamaChatOptions) => Promise<void>;
  cancelStream: () => void;
  clearStream: () => void;
}

export const useLlamaChat = (): UseLlamaChatReturn => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Setup stream listener
  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | null = null;

    listen<StreamPayload>(TAURI_EVENTS.LLAMA_STREAM, (event) => {
      if (!mounted) return;

      const { chunk, done } = event.payload;

      if (chunk) {
        setStreamContent((prev) => prev + chunk);
      }

      if (done) {
        setIsStreaming(false);
      }
    }).then((fn) => {
      if (mounted) {
        unlisten = fn;
        unlistenRef.current = fn;
      } else {
        // Component unmounted before listener resolved - clean up immediately
        fn();
      }
    });

    return () => {
      mounted = false;
      if (unlisten) {
        unlisten();
      }
      unlistenRef.current = null;
    };
  }, []);

  // Send chat message (non-streaming)
  const sendMessage = useCallback(
    async (messages: ChatMessage[], options?: UseLlamaChatOptions): Promise<string> => {
      setError(null);
      try {
        const response = await LlamaService.chat(messages, {
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
        });
        return response;
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        setError(errorMessage);
        throw e;
      }
    },
    []
  );

  // Send chat message with streaming
  const sendMessageStream = useCallback(
    async (messages: ChatMessage[], options?: UseLlamaChatOptions): Promise<void> => {
      setError(null);
      setStreamContent('');
      setIsStreaming(true);

      try {
        await LlamaService.chatStream(messages, {
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
        });
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        setError(errorMessage);
        setIsStreaming(false);
        throw e;
      }
    },
    []
  );

  // Generate from prompt (non-streaming)
  const generate = useCallback(
    async (prompt: string, system?: string, options?: UseLlamaChatOptions): Promise<string> => {
      setError(null);
      try {
        const response = await LlamaService.generate(prompt, {
          system,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
        });
        return response;
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        setError(errorMessage);
        throw e;
      }
    },
    []
  );

  // Generate from prompt with streaming
  const generateStream = useCallback(
    async (prompt: string, system?: string, options?: UseLlamaChatOptions): Promise<void> => {
      setError(null);
      setStreamContent('');
      setIsStreaming(true);

      try {
        await LlamaService.generateStream(prompt, {
          system,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
        });
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        setError(errorMessage);
        setIsStreaming(false);
        throw e;
      }
    },
    []
  );

  // Cancel ongoing stream
  const cancelStream = useCallback(() => {
    setIsStreaming(false);
    // Note: Currently there's no backend support for canceling mid-stream
    // This just updates the UI state
  }, []);

  // Clear stream content
  const clearStream = useCallback(() => {
    setStreamContent('');
    setError(null);
  }, []);

  return {
    isStreaming,
    streamContent,
    error,
    sendMessage,
    sendMessageStream,
    generate,
    generateStream,
    cancelStream,
    clearStream,
  };
};

export default useLlamaChat;
