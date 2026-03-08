import { memo, useMemo, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BaseMessageBubble, AgentAvatar } from '@jaskier/ui';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { cn } from '@/shared/utils/cn';
import { type Message, useCurrentSessionId } from '@/stores/viewStore';
import { MessageRating } from './MessageRating';
import { Terminal } from 'lucide-react';

interface ContentSegment {
  type: 'text' | 'tool';
  name?: string;
  content: string;
}

function splitToolOutput(content: string): ContentSegment[] {
  const toolPattern = /\n---\n\*\*🔧 Tool:\*\* `([^`]+)`\n```\n([\s\S]*?)\n```\n---\n/g;
  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = toolPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'tool', name: match[1] ?? '', content: match[2] ?? '' });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) });
  }
  return segments;
}

function stripParallelHeader(content: string): string {
  return content.replace(/⚡ Parallel execution: \d+ tools\n?/g, '');
}

interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
  isStreaming: boolean;
  onContextMenu?: (e: MouseEvent<HTMLDivElement>, message: Message) => void;
}

export const MessageBubble = memo<MessageBubbleProps>(({ message, isLast, isStreaming, onContextMenu }) => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const currentSessionId = useCurrentSessionId();

  const cleanedContent = useMemo(() => stripParallelHeader(message.content), [message.content]);
  const segments = useMemo(() => splitToolOutput(cleanedContent), [cleanedContent]);

  const textContent = segments.filter(s => s.type === 'text').map(s => s.content).join('\n');
  const toolSegments = segments.filter(s => s.type === 'tool');

  let status: 'idle' | 'typing' | 'thinking' | 'error' = 'idle'; if (isStreaming && isLast) { status = message.content ? 'typing' : 'thinking'; }

  return (
    <div onContextMenu={(e) => onContextMenu?.(e, message)}>
      <BaseMessageBubble
        message={{
          id: message.id ?? '',
          role: message.role as any,
          content: textContent,
          isStreaming: isStreaming && isLast,
          timestamp: message.timestamp,
        }}
        theme={{
          isLight: theme.isLight,
          bubbleAssistant: theme.isLight
            ? 'bg-white/50 border border-white/30 text-black shadow-sm'
            : 'bg-black/40 border border-[var(--glass-border)] text-white shadow-lg backdrop-blur-sm',
          bubbleUser: theme.isLight
            ? 'bg-emerald-500/15 border border-emerald-500/20 text-black'
            : 'bg-[var(--matrix-accent)]/15 border border-[var(--matrix-accent)]/20 text-white',
          accentText: theme.accentText,
          accentBg: theme.accentBg,
          textMuted: theme.textMuted,
        }}
        avatar={message.role === 'assistant' ? <AgentAvatar state={status} /> : undefined}
        copyText={t('chat.copyMessage', 'Copy message')}
        copiedText={t('common.copied', 'Copied')}
        modelBadge={message.model}
        toolInteractions={
          toolSegments.length > 0 ? (
            <div className="mb-3">
              {toolSegments.map((segment, i) => (
                <details
                  key={`tool-${i}`}
                  className={cn(
                    'my-2 rounded-lg border',
                    theme.isLight ? 'border-black/10 bg-black/5' : 'border-white/10 bg-black/20',
                  )}
                >
                  <summary
                    className={cn(
                      'cursor-pointer px-3 py-2 text-xs flex items-center gap-2',
                      theme.isLight ? 'text-black/60 hover:text-black/80' : 'text-white/60 hover:text-white/80',
                    )}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>{t('chat.toolLabel', { name: segment.name })}</span>
                    <span className="ml-auto text-[10px]">
                      {t('chat.linesCount', { count: segment.content.split('\n').length })}
                    </span>
                  </summary>
                  <pre
                    className={cn(
                      'overflow-x-auto px-3 py-2 text-xs border-t max-h-60 overflow-y-auto',
                      theme.isLight ? 'text-black/70 border-black/5' : 'text-white/70 border-white/5',
                    )}
                  >
                    <code>{segment.content}</code>
                  </pre>
                </details>
              ))}
            </div>
          ) : undefined
        }
      />
      {!isStreaming && message.role === 'assistant' && currentSessionId && message.id && (
        <div className="flex justify-start ml-14 mb-4">
          <MessageRating sessionId={currentSessionId} messageId={message.id} />
        </div>
      )}
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';
