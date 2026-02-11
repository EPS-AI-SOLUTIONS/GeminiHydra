/**
 * NativeMemory - Native knowledge graph memory for GeminiHydra
 * Replaces @modelcontextprotocol/server-memory
 *
 * Features:
 * - In-memory knowledge graph with persistence
 * - Entity-Relation model
 * - Observations/facts storage
 * - Semantic search (with embeddings support)
 * - Session and long-term memory separation
 * - JSON persistence with auto-save
 */

import chalk from 'chalk';
import { loadFromFile, saveToFile } from './persistence.js';

// ============================================================
// Types
// ============================================================

export interface Entity {
  id: string;
  name: string;
  type: string;
  observations: Observation[];
  metadata: Record<string, unknown>;
  created: Date;
  updated: Date;
}

export interface Observation {
  id: string;
  content: string;
  source?: string;
  confidence?: number;
  timestamp: Date;
  embedding?: number[];
}

export interface Relation {
  id: string;
  from: string;
  to: string;
  type: string;
  weight?: number;
  metadata?: Record<string, unknown>;
  created: Date;
}

export interface GraphQuery {
  entityType?: string;
  entityName?: string | RegExp;
  relationType?: string;
  hasObservation?: string | RegExp;
  limit?: number;
  offset?: number;
}

export interface MemorySnapshot {
  entities: Entity[];
  relations: Relation[];
  metadata: {
    created: Date;
    lastModified: Date;
    version: string;
  };
}

export interface NativeMemoryConfig {
  persistPath?: string;
  autoSave?: boolean;
  autoSaveInterval?: number;
  maxEntities?: number;
  enableEmbeddings?: boolean;
}

// ============================================================
// NativeMemory Class
// ============================================================

export class NativeMemory {
  private entities: Map<string, Entity> = new Map();
  private relations: Map<string, Relation> = new Map();
  private entityIndex: Map<string, Set<string>> = new Map(); // type -> entity ids
  private relationIndex: Map<string, Set<string>> = new Map(); // from/to -> relation ids

  private config: Required<NativeMemoryConfig>;
  private autoSaveTimer?: NodeJS.Timeout;
  private dirty = false;
  private idCounter = 0;

  constructor(config: NativeMemoryConfig = {}) {
    this.config = {
      persistPath: config.persistPath || '',
      autoSave: config.autoSave ?? true,
      autoSaveInterval: config.autoSaveInterval || 30000,
      maxEntities: config.maxEntities || 10000,
      enableEmbeddings: config.enableEmbeddings ?? false,
    };

    if (this.config.autoSave && this.config.persistPath) {
      this.startAutoSave();
    }
  }

  // ============================================================
  // Entity Operations
  // ============================================================

  /**
   * Create a new entity
   */
  createEntity(name: string, type: string, metadata: Record<string, unknown> = {}): Entity {
    if (this.entities.size >= this.config.maxEntities) {
      throw new Error(`Max entities limit reached: ${this.config.maxEntities}`);
    }

    const id = this.generateId('e');
    const entity: Entity = {
      id,
      name,
      type,
      observations: [],
      metadata,
      created: new Date(),
      updated: new Date(),
    };

    this.entities.set(id, entity);
    this.indexEntity(entity);
    this.markDirty();

    return entity;
  }

  /**
   * Get entity by ID
   */
  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  /**
   * Find entity by name
   */
  findEntityByName(name: string, type?: string): Entity | undefined {
    for (const entity of this.entities.values()) {
      if (entity.name === name && (!type || entity.type === type)) {
        return entity;
      }
    }
    return undefined;
  }

  /**
   * Find entities by type
   */
  findEntitiesByType(type: string): Entity[] {
    const ids = this.entityIndex.get(type);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.entities.get(id))
      .filter((e): e is Entity => e !== undefined);
  }

  /**
   * Update entity
   */
  updateEntity(
    id: string,
    updates: Partial<Pick<Entity, 'name' | 'type' | 'metadata'>>,
  ): Entity | undefined {
    const entity = this.entities.get(id);
    if (!entity) return undefined;

    if (updates.type && updates.type !== entity.type) {
      this.unindexEntity(entity);
      entity.type = updates.type;
      this.indexEntity(entity);
    }

    if (updates.name) entity.name = updates.name;
    if (updates.metadata) entity.metadata = { ...entity.metadata, ...updates.metadata };
    entity.updated = new Date();

    this.markDirty();
    return entity;
  }

  /**
   * Delete entity
   */
  deleteEntity(id: string): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;

    // Remove relations
    this.deleteRelationsFor(id);

    this.unindexEntity(entity);
    this.entities.delete(id);
    this.markDirty();

    return true;
  }

  /**
   * Delete entity by name
   */
  deleteEntityByName(name: string): boolean {
    const entity = this.findEntityByName(name);
    if (!entity) return false;
    return this.deleteEntity(entity.id);
  }

  // ============================================================
  // Observation Operations
  // ============================================================

  /**
   * Add observation to entity
   */
  addObservation(
    entityId: string,
    content: string,
    options?: {
      source?: string;
      confidence?: number;
    },
  ): Observation | undefined {
    const entity = this.entities.get(entityId);
    if (!entity) return undefined;

    const observation: Observation = {
      id: this.generateId('o'),
      content,
      source: options?.source,
      confidence: options?.confidence,
      timestamp: new Date(),
    };

    entity.observations.push(observation);
    entity.updated = new Date();
    this.markDirty();

    return observation;
  }

  /**
   * Add observation by entity name (creates entity if needed)
   */
  observe(entityName: string, content: string, entityType: string = 'fact'): Observation {
    let entity = this.findEntityByName(entityName);
    if (!entity) {
      entity = this.createEntity(entityName, entityType);
    }

    const obs = this.addObservation(entity.id, content);
    if (!obs) {
      throw new Error(`Failed to add observation to entity: ${entityName}`);
    }
    return obs;
  }

  /**
   * Remove observation
   */
  removeObservation(entityId: string, observationId: string): boolean {
    const entity = this.entities.get(entityId);
    if (!entity) return false;

    const index = entity.observations.findIndex((o) => o.id === observationId);
    if (index < 0) return false;

    entity.observations.splice(index, 1);
    entity.updated = new Date();
    this.markDirty();

    return true;
  }

  /**
   * Get all observations for entity
   */
  getObservations(entityId: string): Observation[] {
    return this.entities.get(entityId)?.observations || [];
  }

  // ============================================================
  // Relation Operations
  // ============================================================

  /**
   * Create relation between entities
   */
  createRelation(
    fromId: string,
    toId: string,
    type: string,
    metadata?: Record<string, unknown>,
  ): Relation | undefined {
    if (!this.entities.has(fromId) || !this.entities.has(toId)) {
      return undefined;
    }

    const id = this.generateId('r');
    const relation: Relation = {
      id,
      from: fromId,
      to: toId,
      type,
      metadata,
      created: new Date(),
    };

    this.relations.set(id, relation);
    this.indexRelation(relation);
    this.markDirty();

    return relation;
  }

  /**
   * Create relation by entity names
   */
  relate(
    fromName: string,
    toName: string,
    relationType: string,
    createIfMissing: boolean = true,
  ): Relation | undefined {
    let fromEntity = this.findEntityByName(fromName);
    let toEntity = this.findEntityByName(toName);

    if (createIfMissing) {
      if (!fromEntity) fromEntity = this.createEntity(fromName, 'entity');
      if (!toEntity) toEntity = this.createEntity(toName, 'entity');
    }

    if (!fromEntity || !toEntity) return undefined;

    return this.createRelation(fromEntity.id, toEntity.id, relationType);
  }

  /**
   * Get relations from entity
   */
  getRelationsFrom(entityId: string): Relation[] {
    const ids = this.relationIndex.get(`from:${entityId}`);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.relations.get(id))
      .filter((r): r is Relation => r !== undefined);
  }

  /**
   * Get relations to entity
   */
  getRelationsTo(entityId: string): Relation[] {
    const ids = this.relationIndex.get(`to:${entityId}`);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.relations.get(id))
      .filter((r): r is Relation => r !== undefined);
  }

  /**
   * Get all relations for entity
   */
  getRelations(entityId: string): Relation[] {
    return [...this.getRelationsFrom(entityId), ...this.getRelationsTo(entityId)];
  }

  /**
   * Delete relation
   */
  deleteRelation(id: string): boolean {
    const relation = this.relations.get(id);
    if (!relation) return false;

    this.unindexRelation(relation);
    this.relations.delete(id);
    this.markDirty();

    return true;
  }

  /**
   * Delete all relations for entity
   */
  deleteRelationsFor(entityId: string): number {
    const relations = this.getRelations(entityId);
    for (const rel of relations) {
      this.deleteRelation(rel.id);
    }
    return relations.length;
  }

  // ============================================================
  // Query Operations
  // ============================================================

  /**
   * Search entities
   */
  searchEntities(query: string | RegExp): Entity[] {
    const pattern = typeof query === 'string' ? new RegExp(query, 'i') : query;
    const results: Entity[] = [];

    for (const entity of this.entities.values()) {
      // Match name
      if (pattern.test(entity.name)) {
        results.push(entity);
        continue;
      }

      // Match observations
      for (const obs of entity.observations) {
        if (pattern.test(obs.content)) {
          results.push(entity);
          break;
        }
      }
    }

    return results;
  }

  /**
   * Query graph
   */
  query(q: GraphQuery): Entity[] {
    let results: Entity[] = Array.from(this.entities.values());

    if (q.entityType) {
      results = results.filter((e) => e.type === q.entityType);
    }

    if (q.entityName) {
      const pattern =
        typeof q.entityName === 'string' ? new RegExp(q.entityName, 'i') : q.entityName;
      results = results.filter((e) => pattern.test(e.name));
    }

    if (q.hasObservation) {
      const pattern =
        typeof q.hasObservation === 'string' ? new RegExp(q.hasObservation, 'i') : q.hasObservation;
      results = results.filter((e) => e.observations.some((o) => pattern.test(o.content)));
    }

    if (q.offset) {
      results = results.slice(q.offset);
    }

    if (q.limit) {
      results = results.slice(0, q.limit);
    }

    return results;
  }

  /**
   * Get related entities
   */
  getRelatedEntities(entityId: string, relationType?: string): Entity[] {
    const relations = this.getRelationsFrom(entityId);
    const filtered = relationType ? relations.filter((r) => r.type === relationType) : relations;

    return filtered.map((r) => this.entities.get(r.to)).filter((e): e is Entity => e !== undefined);
  }

  /**
   * Find path between entities
   */
  findPath(fromId: string, toId: string, maxDepth: number = 5): Entity[] | null {
    const visited = new Set<string>();
    const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;

      if (current.id === toId) {
        return current.path
          .map((id) => this.entities.get(id))
          .filter((e): e is Entity => e !== undefined);
      }

      if (current.path.length >= maxDepth) continue;
      if (visited.has(current.id)) continue;
      visited.add(current.id);

      const relations = this.getRelationsFrom(current.id);
      for (const rel of relations) {
        if (!visited.has(rel.to)) {
          queue.push({ id: rel.to, path: [...current.path, rel.to] });
        }
      }
    }

    return null;
  }

  // ============================================================
  // Key-Value Convenience
  // ============================================================

  /**
   * Set a value (key-value style)
   */
  set(key: string, value: unknown, type: string = 'data'): void {
    const entity = this.findEntityByName(key) || this.createEntity(key, type);
    const content = typeof value === 'string' ? value : JSON.stringify(value);
    this.addObservation(entity.id, content);
  }

  /**
   * Get a value (key-value style)
   */
  get(key: string): unknown {
    const entity = this.findEntityByName(key);
    if (!entity || entity.observations.length === 0) return undefined;

    const latest = entity.observations[entity.observations.length - 1];
    try {
      return JSON.parse(latest.content);
    } catch {
      return latest.content;
    }
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    return this.findEntityByName(key) !== undefined;
  }

  /**
   * Delete by key
   */
  delete(key: string): boolean {
    return this.deleteEntityByName(key);
  }

  // ============================================================
  // Persistence
  // ============================================================

  /**
   * Save to file
   */
  async save(filePath?: string): Promise<void> {
    const savePath = filePath || this.config.persistPath;
    if (!savePath) {
      throw new Error('No persist path configured');
    }

    const snapshot: MemorySnapshot = {
      entities: Array.from(this.entities.values()),
      relations: Array.from(this.relations.values()),
      metadata: {
        created: new Date(),
        lastModified: new Date(),
        version: '1.0.0',
      },
    };

    await saveToFile(savePath, snapshot);
    this.dirty = false;
  }

  /**
   * Load from file
   */
  async load(filePath?: string): Promise<void> {
    const loadPath = filePath || this.config.persistPath;
    if (!loadPath) {
      throw new Error('No persist path configured');
    }

    const snapshot = await loadFromFile<MemorySnapshot>(loadPath, {
      dateFields: ['created', 'updated', 'timestamp'],
      recursiveDates: true,
    });

    // File doesn't exist yet, that's ok
    if (!snapshot) {
      return;
    }

    this.clear();

    for (const entity of snapshot.entities) {
      this.entities.set(entity.id, entity);
      this.indexEntity(entity);
    }

    for (const relation of snapshot.relations) {
      this.relations.set(relation.id, relation);
      this.indexRelation(relation);
    }

    this.dirty = false;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.entities.clear();
    this.relations.clear();
    this.entityIndex.clear();
    this.relationIndex.clear();
    this.idCounter = 0;
    this.markDirty();
  }

  // ============================================================
  // Stats
  // ============================================================

  /**
   * Get all entities
   */
  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Get all relations
   */
  getAllRelations(): Relation[] {
    return Array.from(this.relations.values());
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    entities: number;
    relations: number;
    observations: number;
    types: Record<string, number>;
  } {
    const types: Record<string, number> = {};
    let totalObservations = 0;

    for (const entity of this.entities.values()) {
      types[entity.type] = (types[entity.type] || 0) + 1;
      totalObservations += entity.observations.length;
    }

    return {
      entities: this.entities.size,
      relations: this.relations.size,
      observations: totalObservations,
      types,
    };
  }

  /**
   * Print status
   */
  printStatus(): void {
    const stats = this.getStats();
    console.log(chalk.cyan('\n=== Native Memory ===\n'));
    console.log(chalk.gray(`  Entities: ${stats.entities}`));
    console.log(chalk.gray(`  Relations: ${stats.relations}`));
    console.log(chalk.gray(`  Observations: ${stats.observations}`));
    console.log(chalk.gray(`  Types: ${Object.keys(stats.types).join(', ')}`));
    console.log(chalk.gray(`  Persist: ${this.config.persistPath || '(none)'}`));
    console.log(chalk.gray(`  Auto-save: ${this.config.autoSave}`));
  }

  // ============================================================
  // Private Methods
  // ============================================================

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${++this.idCounter}`;
  }

  private indexEntity(entity: Entity): void {
    if (!this.entityIndex.has(entity.type)) {
      this.entityIndex.set(entity.type, new Set());
    }
    this.entityIndex.get(entity.type)?.add(entity.id);
  }

  private unindexEntity(entity: Entity): void {
    this.entityIndex.get(entity.type)?.delete(entity.id);
  }

  private indexRelation(relation: Relation): void {
    const fromKey = `from:${relation.from}`;
    const toKey = `to:${relation.to}`;

    if (!this.relationIndex.has(fromKey)) {
      this.relationIndex.set(fromKey, new Set());
    }
    if (!this.relationIndex.has(toKey)) {
      this.relationIndex.set(toKey, new Set());
    }

    this.relationIndex.get(fromKey)?.add(relation.id);
    this.relationIndex.get(toKey)?.add(relation.id);
  }

  private unindexRelation(relation: Relation): void {
    this.relationIndex.get(`from:${relation.from}`)?.delete(relation.id);
    this.relationIndex.get(`to:${relation.to}`)?.delete(relation.id);
  }

  private markDirty(): void {
    this.dirty = true;
  }

  private startAutoSave(): void {
    if (this.autoSaveTimer) return;

    this.autoSaveTimer = setInterval(async () => {
      if (this.dirty && this.config.persistPath) {
        try {
          await this.save();
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`[NativeMemory] Auto-save failed: ${msg}`));
        }
      }
    }, this.config.autoSaveInterval);
  }

  /**
   * Stop auto-save and cleanup
   */
  destroy(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
  }
}

// ============================================================
// Factory Function
// ============================================================

export function createMemory(options?: NativeMemoryConfig): NativeMemory {
  return new NativeMemory(options);
}
