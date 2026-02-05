/**
 * Agents View - Display and manage Hydra agents
 */

import { motion } from 'framer-motion';
import {
  Sword,
  Eye,
  Wand2,
  Heart,
  Flower2,
  Shield,
  Circle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Card, Badge } from '../components/ui';
import { useAppStore } from '../stores/appStore';
import type { AgentRole } from '../types';

// Agent metadata
const agentMeta: Record<
  AgentRole,
  {
    displayName: string;
    description: string;
    icon: typeof Sword;
    color: string;
    specialty: string;
  }
> = {
  geralt: {
    displayName: 'Geralt',
    description: 'Główny koordynator i syntezator - Wiedźmin łączący wszystkie wątki',
    icon: Sword,
    color: '#FFD700',
    specialty: 'Koordynacja i Synteza',
  },
  dijkstra: {
    displayName: 'Dijkstra',
    description: 'Strateg i planista - mistrz skomplikowanych planów',
    icon: Eye,
    color: '#4169E1',
    specialty: 'Planowanie Strategiczne',
  },
  yennefer: {
    displayName: 'Yennefer',
    description: 'Analityk i krytyk - bezlitosna w ocenie jakości',
    icon: Wand2,
    color: '#8B008B',
    specialty: 'Analiza Krytyczna',
  },
  regis: {
    displayName: 'Regis',
    description: 'Badacz i erudyta - ekspert od głębokiej analizy',
    icon: Heart,
    color: '#2F4F4F',
    specialty: 'Badania i Erudycja',
  },
  triss: {
    displayName: 'Triss',
    description: 'Kreatywna optymistka - specjalistka od innowacji',
    icon: Flower2,
    color: '#FF6347',
    specialty: 'Kreatywność i Innowacja',
  },
  vesemir: {
    displayName: 'Vesemir',
    description: 'Doświadczony mentor - strażnik najlepszych praktyk',
    icon: Shield,
    color: '#8B4513',
    specialty: 'Mentoring i Best Practices',
  },
};

const statusLabels = {
  idle: 'Gotowy',
  thinking: 'Myśli...',
  done: 'Ukończono',
  error: 'Błąd',
};

const statusVariants = {
  idle: 'default',
  thinking: 'accent',
  done: 'success',
  error: 'error',
} as const;

export function AgentsView() {
  const { agents } = useAppStore();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-[var(--matrix-text)]">
          Agenci Hydry
        </h2>
        <p className="text-sm text-[var(--matrix-text-dim)] mt-1">
          System multi-agentowy inspirowany postaciami z Wiedźmina
        </p>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(Object.keys(agentMeta) as AgentRole[]).map((role, index) => {
          const meta = agentMeta[role];
          const agent = agents[role];
          const Icon = meta.icon;

          return (
            <motion.div
              key={role}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card
                variant="glass"
                interactive
                className="h-full"
              >
                <div className="p-4 space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{
                        backgroundColor: meta.color + '20',
                        border: `1px solid ${meta.color}40`,
                      }}
                    >
                      <Icon
                        className="w-6 h-6"
                        style={{ color: meta.color }}
                      />
                    </div>
                    <Badge variant={statusVariants[agent.status]}>
                      <Circle
                        className={clsx(
                          'w-2 h-2 mr-1',
                          agent.status === 'thinking' && 'animate-pulse'
                        )}
                        fill="currentColor"
                      />
                      {statusLabels[agent.status]}
                    </Badge>
                  </div>

                  {/* Info */}
                  <div>
                    <h3
                      className="text-lg font-semibold"
                      style={{ color: meta.color }}
                    >
                      {meta.displayName}
                    </h3>
                    <p className="text-xs text-[var(--matrix-text-dim)] mt-0.5">
                      {meta.specialty}
                    </p>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-[var(--matrix-text-dim)] leading-relaxed">
                    {meta.description}
                  </p>

                  {/* Stats placeholder */}
                  <div className="pt-3 border-t border-[var(--matrix-border)] flex items-center justify-between text-xs text-[var(--matrix-text-dim)]">
                    <span>Zadania: 0</span>
                    <span>Tokeny: 0</span>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
