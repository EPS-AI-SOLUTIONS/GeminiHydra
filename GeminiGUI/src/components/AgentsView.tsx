/**
 * Agents View - Display Hydra swarm agents (12 Witcher + Serena)
 * Migrated from gui/ and enhanced for GeminiGUI/Tauri
 */

import {
  Sword, Eye, Wand2, Heart, Flower2, Shield,
  Music, Zap, Mountain, Flame, Gem, Crown, Circle
} from 'lucide-react';
import type { AgentRole, AgentTier } from '../types';

interface AgentMeta {
  displayName: string;
  description: string;
  icon: typeof Sword;
  color: string;
  specialty: string;
  tier: AgentTier;
}

const agentMeta: Record<AgentRole, AgentMeta> = {
  dijkstra: {
    displayName: 'Dijkstra',
    description: 'Strateg i planista - mistrz skomplikowanych planów',
    icon: Eye, color: '#4169E1', specialty: 'Planowanie Strategiczne', tier: 'commander',
  },
  regis: {
    displayName: 'Regis',
    description: 'Badacz i erudyta - ekspert od głębokiej analizy',
    icon: Heart, color: '#2F4F4F', specialty: 'Research i Kontekst', tier: 'coordinator',
  },
  yennefer: {
    displayName: 'Yennefer',
    description: 'Analityk - bezlitosna w ocenie jakości i architektury',
    icon: Wand2, color: '#8B008B', specialty: 'Synteza i Architektura', tier: 'coordinator',
  },
  jaskier: {
    displayName: 'Jaskier',
    description: 'Dokumentalista i komunikator - mistrz słowa',
    icon: Music, color: '#DAA520', specialty: 'Dokumentacja', tier: 'coordinator',
  },
  geralt: {
    displayName: 'Geralt',
    description: 'Security i operacje - Wiedźmin strzegący systemu',
    icon: Sword, color: '#FFD700', specialty: 'Security', tier: 'executor',
  },
  triss: {
    displayName: 'Triss',
    description: 'QA i testing - specjalistka od jakości',
    icon: Flower2, color: '#FF6347', specialty: 'QA i Testing', tier: 'executor',
  },
  vesemir: {
    displayName: 'Vesemir',
    description: 'Mentor - strażnik najlepszych praktyk i code review',
    icon: Shield, color: '#8B4513', specialty: 'Code Review', tier: 'executor',
  },
  ciri: {
    displayName: 'Ciri',
    description: 'Szybkie zadania - błyskawiczna realizacja',
    icon: Zap, color: '#00CED1', specialty: 'Szybkie Zadania', tier: 'executor',
  },
  eskel: {
    displayName: 'Eskel',
    description: 'DevOps i infrastruktura - solidne fundamenty',
    icon: Mountain, color: '#556B2F', specialty: 'DevOps', tier: 'executor',
  },
  lambert: {
    displayName: 'Lambert',
    description: 'Debugging i profiling - tropiciel bugów',
    icon: Flame, color: '#FF4500', specialty: 'Debugging', tier: 'executor',
  },
  zoltan: {
    displayName: 'Zoltan',
    description: 'Dane i bazy danych - krasnolud od danych',
    icon: Gem, color: '#4682B4', specialty: 'Bazy Danych', tier: 'executor',
  },
  philippa: {
    displayName: 'Philippa',
    description: 'Integracje i API - mistrzyni połączeń',
    icon: Crown, color: '#9370DB', specialty: 'Integracje API', tier: 'executor',
  },
};

const tierColors: Record<AgentTier, string> = {
  commander: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  coordinator: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  executor: 'text-green-400 bg-green-400/10 border-green-400/30',
};

const tierLabels: Record<AgentTier, string> = {
  commander: 'Commander',
  coordinator: 'Coordinator',
  executor: 'Executor',
};

export function AgentsView() {
  const tiers: AgentTier[] = ['commander', 'coordinator', 'executor'];

  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="text-xl font-semibold text-[var(--matrix-text)]">
          Agenci Hydry
        </h2>
        <p className="text-sm text-[var(--matrix-text-dim)] mt-1">
          12 agentów Wiedźmina w hierarchii 3-warstwowej
        </p>
      </div>

      {tiers.map((tier) => {
        const agents = (Object.entries(agentMeta) as [AgentRole, AgentMeta][])
          .filter(([, meta]) => meta.tier === tier);

        return (
          <div key={tier}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${tierColors[tier]}`}>
                {tierLabels[tier]}
              </span>
              <span className="text-xs text-[var(--matrix-text-dim)]">
                {agents.length} {agents.length === 1 ? 'agent' : 'agentów'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {agents.map(([role, meta]) => {
                const Icon = meta.icon;
                return (
                  <div
                    key={role}
                    className="rounded-lg border border-[var(--matrix-border)] bg-[var(--glass-bg)] p-3 space-y-2 hover:border-[var(--matrix-accent)]/40 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{
                          backgroundColor: meta.color + '20',
                          border: `1px solid ${meta.color}40`,
                        }}
                      >
                        <Icon className="w-5 h-5" style={{ color: meta.color }} />
                      </div>
                      <div className="flex items-center gap-1 text-xs text-[var(--matrix-text-dim)]">
                        <Circle className="w-2 h-2 text-green-500" fill="currentColor" />
                        Gotowy
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold" style={{ color: meta.color }}>
                        {meta.displayName}
                      </h3>
                      <p className="text-xs text-[var(--matrix-text-dim)]">{meta.specialty}</p>
                    </div>

                    <p className="text-xs text-[var(--matrix-text-dim)] leading-relaxed">
                      {meta.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
