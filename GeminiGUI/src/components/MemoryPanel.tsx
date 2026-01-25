import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BrainCircuit, User, Share2, Trash2, RefreshCw, Plus } from 'lucide-react';

interface MemoryEntry {
    id: string;
    agent: string;
    content: string;
    timestamp: number;
    importance: number;
}

interface KnowledgeNode {
    id: string;
    type: string;
    label: string;
}

interface KnowledgeEdge {
    source: string;
    target: string;
    label: string;
}

interface KnowledgeGraph {
    nodes: KnowledgeNode[];
    edges: KnowledgeEdge[];
}

const KnowledgeGraphVisualizer = ({ data }: { data: KnowledgeGraph | null }) => {
    if (!data || data.nodes.length === 0) {
        return <div className="text-xs italic text-[var(--matrix-text-dim)]">Graf wiedzy jest pusty.</div>;
    }
    return (
        <div className="text-xs font-mono p-2 bg-black/20 rounded border border-[var(--matrix-border)] max-h-40 overflow-auto">
            <h4 className="font-bold text-[var(--matrix-accent)]">Wezly ({data.nodes.length})</h4>
            <ul className="mb-2">
                {data.nodes.slice(0, 10).map((node) => (
                    <li key={node.id} className="text-[var(--matrix-text-dim)]">
                        - {node.label} <span className="opacity-50">({node.type})</span>
                    </li>
                ))}
                {data.nodes.length > 10 && (
                    <li className="italic opacity-50">...i {data.nodes.length - 10} wiecej</li>
                )}
            </ul>
            <h4 className="font-bold text-[var(--matrix-accent)]">Polaczenia ({data.edges.length})</h4>
            <ul>
                {data.edges.slice(0, 5).map((edge, i) => (
                    <li key={i} className="text-[var(--matrix-text-dim)]">
                        {edge.source} --[{edge.label}]--{">"} {edge.target}
                    </li>
                ))}
                {data.edges.length > 5 && (
                    <li className="italic opacity-50">...i {data.edges.length - 5} wiecej</li>
                )}
            </ul>
        </div>
    );
};

export const MemoryPanel: React.FC = () => {
    const [knowledgeGraph, setKnowledgeGraph] = useState<KnowledgeGraph | null>(null);
    const [agentMemories, setAgentMemories] = useState<MemoryEntry[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<string>("Dijkstra");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const agentList = [
        "Geralt", "Yennefer", "Triss", "Jaskier", "Vesemir", "Ciri",
        "Eskel", "Lambert", "Zoltan", "Regis", "Dijkstra", "Philippa"
    ];

    const fetchKnowledgeGraph = useCallback(async () => {
        try {
            const graph = await invoke<KnowledgeGraph>('get_knowledge_graph') || { nodes: [], edges: [] };
            setKnowledgeGraph(graph);
            setError(null);
        } catch (e) {
            console.error('Failed to fetch knowledge graph:', e);
            setError('Blad ladowania grafu');
        }
    }, []);

    const fetchAgentMemory = useCallback(async () => {
        if (!selectedAgent) return;
        setLoading(true);
        try {
            const memories = await invoke<MemoryEntry[]>('get_agent_memories', {
                agentName: selectedAgent,
                topK: 10
            }) || [];
            setAgentMemories(memories);
            setError(null);
        } catch (e) {
            console.error('Failed to fetch agent memory:', e);
            setError('Blad ladowania pamieci');
        } finally {
            setLoading(false);
        }
    }, [selectedAgent]);

    const handleClearMemories = async () => {
        if (!confirm(`Wyczysc pamiec agenta ${selectedAgent}?`)) return;
        try {
            const removed = await invoke<number>('clear_agent_memories', { agentName: selectedAgent });
            setAgentMemories([]);
            console.log(`Removed ${removed} memories`);
        } catch (e) {
            console.error('Failed to clear memories:', e);
        }
    };

    const handleAddTestMemory = async () => {
        try {
            await invoke('add_agent_memory', {
                agent: selectedAgent,
                content: `Test memory added at ${new Date().toLocaleTimeString()}`,
                importance: 0.5
            });
            fetchAgentMemory();
        } catch (e) {
            console.error('Failed to add memory:', e);
        }
    };

    useEffect(() => {
        fetchKnowledgeGraph();
    }, [fetchKnowledgeGraph]);

    useEffect(() => {
        fetchAgentMemory();
    }, [fetchAgentMemory]);

    const formatTimestamp = (ts: number) => {
        return new Date(ts * 1000).toLocaleString('pl-PL', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="glass-panel p-4 rounded-lg flex flex-col gap-4 border-[var(--matrix-border)]">
            <div className="flex justify-between items-center text-[var(--matrix-text-dim)] border-b border-[var(--matrix-border)] pb-2">
                <span className="flex items-center gap-2 font-semibold text-sm">
                    <BrainCircuit size={16} /> Swiadomosc Roju
                </span>
                <button
                    onClick={() => { fetchKnowledgeGraph(); fetchAgentMemory(); }}
                    className="hover:text-[var(--matrix-accent)] transition-colors"
                    title="Odswiez"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {error && (
                <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded">
                    {error}
                </div>
            )}

            {/* Knowledge Graph Section */}
            <div>
                <h3 className="text-xs font-bold uppercase text-[var(--matrix-accent)] mb-2 flex items-center gap-2">
                    <Share2 size={12}/> Graf Wiedzy
                </h3>
                <KnowledgeGraphVisualizer data={knowledgeGraph} />
            </div>

            {/* Agent Memory Section */}
            <div>
                <h3 className="text-xs font-bold uppercase text-[var(--matrix-accent)] mb-2 flex items-center gap-2">
                    <User size={12}/> Pamiec Agenta
                </h3>
                <div className="flex gap-2 mb-2">
                    <select
                        value={selectedAgent}
                        onChange={(e) => setSelectedAgent(e.target.value)}
                        className="matrix-input flex-1 rounded px-2 py-1 text-xs"
                    >
                        {agentList.map(agent => (
                            <option key={agent} value={agent}>{agent}</option>
                        ))}
                    </select>
                    <button
                        onClick={handleAddTestMemory}
                        className="p-1 hover:text-[var(--matrix-accent)] transition-colors"
                        title="Dodaj testowe wspomnienie"
                    >
                        <Plus size={14} />
                    </button>
                    <button
                        onClick={handleClearMemories}
                        className="p-1 hover:text-red-400 transition-colors"
                        title="Wyczysc pamiec agenta"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
                <div className="text-xs font-mono p-2 bg-black/20 rounded border border-[var(--matrix-border)] h-40 overflow-auto">
                    {loading && (
                        <span className="text-[var(--matrix-text-dim)]">Ladowanie...</span>
                    )}
                    {!loading && agentMemories.length === 0 && (
                        <span className="italic text-[var(--matrix-text-dim)]">
                            Brak wspomnien dla tego agenta.
                        </span>
                    )}
                    {!loading && agentMemories.map((mem) => (
                        <div
                            key={mem.id}
                            className="mb-2 pb-2 border-b border-[var(--matrix-border)] last:border-0"
                        >
                            <div className="flex justify-between items-start">
                                <span className="text-[var(--matrix-accent)] font-bold">
                                    {(mem.importance * 100).toFixed(0)}%
                                </span>
                                <span className="text-[var(--matrix-text-dim)] opacity-50">
                                    {formatTimestamp(mem.timestamp)}
                                </span>
                            </div>
                            <p className="text-[var(--matrix-text)] mt-1 break-words">
                                {mem.content.length > 100
                                    ? `${mem.content.substring(0, 100)}...`
                                    : mem.content
                                }
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
