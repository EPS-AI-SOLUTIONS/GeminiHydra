/**
 * Chat View - Main conversation interface
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Bot, User, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { Button, Card, Badge } from '../components/ui';
import { useAppStore } from '../stores/appStore';
import type { Message, AgentRole } from '../types';

// Agent colors for avatars
const agentColors: Record<AgentRole, string> = {
  geralt: '#FFD700',
  dijkstra: '#4169E1',
  yennefer: '#8B008B',
  regis: '#2F4F4F',
  triss: '#FF6347',
  vesemir: '#8B4513',
};

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx('flex gap-3', isUser && 'flex-row-reverse')}
    >
      {/* Avatar */}
      <div
        className={clsx(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          isUser
            ? 'bg-[var(--matrix-accent)]'
            : 'bg-[var(--glass-bg)] border border-[var(--matrix-border)]'
        )}
        style={
          message.agent
            ? { backgroundColor: agentColors[message.agent] + '30', borderColor: agentColors[message.agent] }
            : undefined
        }
      >
        {isUser ? (
          <User className="w-4 h-4 text-[var(--matrix-bg-primary)]" />
        ) : (
          <Bot className="w-4 h-4 text-[var(--matrix-accent)]" />
        )}
      </div>

      {/* Message Content */}
      <div className={clsx('max-w-[70%] space-y-1', isUser && 'text-right')}>
        {message.agent && (
          <Badge variant="accent" className="text-xs">
            {message.agent}
          </Badge>
        )}
        <div
          className={clsx(
            'p-3 rounded-lg',
            isUser
              ? 'bg-[var(--matrix-accent)] text-[var(--matrix-bg-primary)]'
              : 'glass-panel'
          )}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        <p className="text-xs text-[var(--matrix-text-dim)]">
          {message.timestamp.toLocaleTimeString('pl-PL', {
            hour: '2-digit',
            minute: '2-digit',
          })}
          {message.tokens && ` • ${message.tokens} tokens`}
        </p>
      </div>
    </motion.div>
  );
}

export function ChatView() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, addMessage, isStreaming, setIsStreaming } = useAppStore();

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const handleSubmit = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput('');
    setIsStreaming(true);

    // Add user message
    addMessage({ role: 'user', content: userMessage });

    // Simulate response (in real app, this would call the API)
    setTimeout(() => {
      addMessage({
        role: 'assistant',
        content: `To jest przykładowa odpowiedź na: "${userMessage}"\n\nGeminiHydra przetworzy Twoje zapytanie używając systemu multi-agentowego.`,
        agent: 'geralt',
        tokens: Math.floor(Math.random() * 500) + 100,
      });
      setIsStreaming(false);
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Messages Area */}
      <Card variant="solid" className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Sparkles className="w-12 h-12 text-[var(--matrix-accent)] mb-4" />
              <h3 className="text-lg font-semibold text-[var(--matrix-text)]">
                Witaj w GeminiHydra
              </h3>
              <p className="text-sm text-[var(--matrix-text-dim)] max-w-md mt-2">
                System multi-agentowy oparty na Gemini. Zadaj pytanie lub opisz
                zadanie, a agenci współpracując znajdą najlepsze rozwiązanie.
              </p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </AnimatePresence>
          )}

          {isStreaming && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-[var(--matrix-text-dim)]"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Agenci myślą...</span>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </Card>

      {/* Input Area */}
      <Card variant="glass" className="p-4">
        <div className="flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Napisz wiadomość lub opisz zadanie..."
            rows={1}
            className="input flex-1 resize-none min-h-[42px] max-h-[200px]"
            disabled={isStreaming}
          />
          <Button
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            isLoading={isStreaming}
            rightIcon={<Send className="w-4 h-4" />}
          >
            Wyślij
          </Button>
        </div>
        <p className="text-xs text-[var(--matrix-text-dim)] mt-2">
          Shift + Enter dla nowej linii • Enter aby wysłać
        </p>
      </Card>
    </div>
  );
}
