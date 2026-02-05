/**
 * History View - Previous conversations
 */

import { motion } from 'framer-motion';
import { Clock, MessageSquare, Trash2, Search } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Input, Badge } from '../components/ui';
import { useAppStore } from '../stores/appStore';

export function HistoryView() {
  const [searchQuery, setSearchQuery] = useState('');
  const { messages, clearMessages } = useAppStore();

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = message.timestamp.toLocaleDateString('pl-PL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {} as Record<string, typeof messages>);

  const filteredGroups = Object.entries(groupedMessages).filter(([_, msgs]) =>
    msgs.some((m) =>
      m.content.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--matrix-text)]">
            Historia Konwersacji
          </h2>
          <p className="text-sm text-[var(--matrix-text-dim)] mt-1">
            {messages.length} wiadomości
          </p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="danger"
            size="sm"
            leftIcon={<Trash2 className="w-4 h-4" />}
            onClick={() => {
              if (confirm('Czy na pewno chcesz wyczyścić historię?')) {
                clearMessages();
              }
            }}
          >
            Wyczyść
          </Button>
        )}
      </div>

      {/* Search */}
      <Input
        placeholder="Szukaj w historii..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        leftIcon={<Search className="w-4 h-4" />}
      />

      {/* History List */}
      {messages.length === 0 ? (
        <Card variant="solid" className="p-8 text-center">
          <Clock className="w-12 h-12 text-[var(--matrix-text-dim)] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-[var(--matrix-text)]">
            Brak historii
          </h3>
          <p className="text-sm text-[var(--matrix-text-dim)] mt-2">
            Rozpocznij konwersację, aby zobaczyć historię
          </p>
        </Card>
      ) : filteredGroups.length === 0 ? (
        <Card variant="solid" className="p-8 text-center">
          <Search className="w-12 h-12 text-[var(--matrix-text-dim)] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-[var(--matrix-text)]">
            Brak wyników
          </h3>
          <p className="text-sm text-[var(--matrix-text-dim)] mt-2">
            Nie znaleziono wiadomości pasujących do "{searchQuery}"
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {filteredGroups.map(([date, msgs], groupIndex) => (
            <motion.div
              key={date}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: groupIndex * 0.1 }}
            >
              <h3 className="text-sm font-medium text-[var(--matrix-accent)] mb-3">
                {date}
              </h3>
              <div className="space-y-2">
                {msgs
                  .filter((m) =>
                    m.content.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((message) => (
                    <Card
                      key={message.id}
                      variant="glass"
                      className="p-3"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            message.role === 'user'
                              ? 'bg-[var(--matrix-accent)]'
                              : 'bg-[var(--glass-bg)] border border-[var(--matrix-border)]'
                          }`}
                        >
                          <MessageSquare
                            className={`w-4 h-4 ${
                              message.role === 'user'
                                ? 'text-[var(--matrix-bg-primary)]'
                                : 'text-[var(--matrix-accent)]'
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-[var(--matrix-text)]">
                              {message.role === 'user' ? 'Ty' : 'Asystent'}
                            </span>
                            {message.agent && (
                              <Badge variant="accent" className="text-xs">
                                {message.agent}
                              </Badge>
                            )}
                            <span className="text-xs text-[var(--matrix-text-dim)]">
                              {message.timestamp.toLocaleTimeString('pl-PL', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-[var(--matrix-text-dim)] line-clamp-2">
                            {message.content}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
