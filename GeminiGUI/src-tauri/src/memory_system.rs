// ============================================================================
// MEMORY SYSTEM: Agent memories and knowledge graph
// ============================================================================

use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::Mutex;
use once_cell::sync::Lazy;

use crate::get_base_dir;

/// Mutex to serialize all memory file (agent_memory.json) read/write operations,
/// preventing concurrent writes from causing data loss.
pub static MEMORY_FILE_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

// ── Data Structures ──

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MemoryEntry {
    pub id: String,
    pub agent: String,
    pub content: String,
    pub timestamp: i64,
    pub importance: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct KnowledgeNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub label: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct KnowledgeEdge {
    pub source: String,
    pub target: String,
    pub label: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct KnowledgeGraph {
    pub nodes: Vec<KnowledgeNode>,
    pub edges: Vec<KnowledgeEdge>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct MemoryStore {
    pub memories: Vec<MemoryEntry>,
    pub graph: KnowledgeGraph,
}

// ── Internal helpers ──

fn get_memory_path() -> std::path::PathBuf {
    get_base_dir().join("agent_memory.json")
}

/// Read memory store from disk. Caller should hold MEMORY_FILE_LOCK
/// if the read is part of a read-modify-write cycle.
fn read_memory_store_unlocked() -> MemoryStore {
    let path = get_memory_path();
    if !path.exists() {
        return MemoryStore::default();
    }
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or(MemoryStore::default()),
        Err(_) => MemoryStore::default(),
    }
}

/// Write memory store to disk. Caller should hold MEMORY_FILE_LOCK.
fn write_memory_store_unlocked(store: &MemoryStore) -> Result<(), String> {
    let path = get_memory_path();
    let content = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

// ── Tauri Commands ──

#[tauri::command]
pub fn get_agent_memories(agent_name: String, top_k: usize) -> Result<Vec<MemoryEntry>, String> {
    let _lock = MEMORY_FILE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let store = read_memory_store_unlocked();
    let mut memories: Vec<MemoryEntry> = store
        .memories
        .into_iter()
        .filter(|m| m.agent.to_lowercase() == agent_name.to_lowercase())
        .collect();

    memories.sort_by(|a, b| {
        b.importance
            .partial_cmp(&a.importance)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.timestamp.cmp(&a.timestamp))
    });

    memories.truncate(top_k);
    Ok(memories)
}

#[tauri::command]
pub fn add_agent_memory(agent: String, content: String, importance: f32) -> Result<MemoryEntry, String> {
    if agent.is_empty() || content.is_empty() {
        return Err("Agent and content cannot be empty".to_string());
    }
    if content.len() > 10000 {
        return Err("Content too long (max 10000 chars)".to_string());
    }

    let _lock = MEMORY_FILE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut store = read_memory_store_unlocked();
    let entry = MemoryEntry {
        id: format!(
            "mem_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ),
        agent,
        content,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64,
        importance: importance.clamp(0.0, 1.0),
    };

    store.memories.push(entry.clone());

    if store.memories.len() > 1000 {
        store.memories.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        store.memories.truncate(1000);
    }

    write_memory_store_unlocked(&store)?;
    Ok(entry)
}

#[tauri::command]
pub fn get_knowledge_graph() -> Result<KnowledgeGraph, String> {
    let _lock = MEMORY_FILE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let store = read_memory_store_unlocked();
    Ok(store.graph)
}

#[tauri::command]
pub fn add_knowledge_node(
    node_id: String,
    node_type: String,
    label: String,
) -> Result<KnowledgeNode, String> {
    if node_id.is_empty() || label.is_empty() {
        return Err("Node ID and label cannot be empty".to_string());
    }

    let _lock = MEMORY_FILE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut store = read_memory_store_unlocked();

    if store.graph.nodes.iter().any(|n| n.id == node_id) {
        return Err("Node with this ID already exists".to_string());
    }

    let node = KnowledgeNode {
        id: node_id,
        node_type,
        label,
    };

    store.graph.nodes.push(node.clone());

    if store.graph.nodes.len() > 500 {
        store.graph.nodes = store.graph.nodes.into_iter().take(500).collect();
    }

    write_memory_store_unlocked(&store)?;
    Ok(node)
}

#[tauri::command]
pub fn add_knowledge_edge(
    source: String,
    target: String,
    label: String,
) -> Result<KnowledgeEdge, String> {
    if source.is_empty() || target.is_empty() || label.is_empty() {
        return Err("Source, target, and label cannot be empty".to_string());
    }

    let _lock = MEMORY_FILE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut store = read_memory_store_unlocked();

    let source_exists = store.graph.nodes.iter().any(|n| n.id == source);
    let target_exists = store.graph.nodes.iter().any(|n| n.id == target);

    if !source_exists || !target_exists {
        return Err("Source or target node does not exist".to_string());
    }

    let edge = KnowledgeEdge {
        source,
        target,
        label,
    };

    store.graph.edges.push(edge.clone());

    if store.graph.edges.len() > 1000 {
        store.graph.edges = store.graph.edges.into_iter().take(1000).collect();
    }

    write_memory_store_unlocked(&store)?;
    Ok(edge)
}

#[tauri::command]
pub fn clear_agent_memories(agent_name: String) -> Result<usize, String> {
    let _lock = MEMORY_FILE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut store = read_memory_store_unlocked();
    let original_len = store.memories.len();
    store
        .memories
        .retain(|m| m.agent.to_lowercase() != agent_name.to_lowercase());
    let removed = original_len - store.memories.len();
    write_memory_store_unlocked(&store)?;
    Ok(removed)
}
