/**
 * GraphMemory - Native Knowledge Graph System
 * Replaces MCP memory server with integrated graph database
 *
 * Provides:
 * - Entity management (nodes)
 * - Relation management (edges)
 * - Observation tracking
 * - Graph traversal and search
 * - Vector-based semantic search integration
 */

import path from 'node:path';
import { MEMORY_DIR } from '../config/paths.config.js';
import {
  BaseMemory,
  deserializeFromJson,
  estimateSize,
  generateId,
  type MemoryOptions,
  type MemoryStats,
  serializeToJson,
} from './BaseMemory.js';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Entity types for categorization
 */
export type EntityType =
  | 'person'
  | 'project'
  | 'file'
  | 'function'
  | 'class'
  | 'module'
  | 'concept'
  | 'task'
  | 'bug'
  | 'feature'
  | 'decision'
  | 'pattern'
  | 'technology'
  | 'api'
  | 'config'
  | 'custom';

/**
 * Relation types for edges
 */
export type RelationType =
  | 'depends_on'
  | 'imports'
  | 'exports'
  | 'extends'
  | 'implements'
  | 'uses'
  | 'calls'
  | 'references'
  | 'contains'
  | 'belongs_to'
  | 'created_by'
  | 'modified_by'
  | 'related_to'
  | 'blocks'
  | 'fixes'
  | 'documents'
  | 'tests'
  | 'custom';

/**
 * Entity (Node) in the knowledge graph
 */
export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  observations: string[];
  metadata: Record<string, unknown>;
  created: Date;
  updated: Date;
  importance: number; // 0-1 scale
  tags: string[];
}

/**
 * Relation (Edge) between entities
 */
export interface Relation {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
  label?: string;
  weight: number; // 0-1 scale for relation strength
  metadata: Record<string, unknown>;
  created: Date;
}

/**
 * Observation - factual statement about an entity
 */
export interface Observation {
  id: string;
  entityId: string;
  content: string;
  source: 'user' | 'agent' | 'codebase' | 'session';
  confidence: number; // 0-1 scale
  created: Date;
}

/**
 * Graph data structure for persistence
 */
interface GraphData {
  entities: Entity[];
  relations: Relation[];
  observations: Observation[];
  version: number;
  lastModified: Date;
}

/**
 * Search result with relevance score
 */
export interface GraphSearchResult {
  entity: Entity;
  score: number;
  matchedObservations: string[];
  relatedEntities: Entity[];
}

/**
 * Graph traversal options
 */
export interface TraversalOptions {
  maxDepth?: number;
  relationTypes?: RelationType[];
  entityTypes?: EntityType[];
  direction?: 'outgoing' | 'incoming' | 'both';
}

/**
 * Graph statistics
 */
export interface GraphStats extends MemoryStats {
  entityCount: number;
  relationCount: number;
  observationCount: number;
  entityTypes: Record<string, number>;
  relationTypes: Record<string, number>;
}

// ============================================================================
// GraphMemory Class
// ============================================================================

export class GraphMemory extends BaseMemory<GraphData> {
  private entities: Map<string, Entity> = new Map();
  private relations: Map<string, Relation> = new Map();
  private observations: Map<string, Observation> = new Map();

  // Indexes for fast lookups
  private entityByName: Map<string, Set<string>> = new Map();
  private relationsBySource: Map<string, Set<string>> = new Map();
  private relationsByTarget: Map<string, Set<string>> = new Map();
  private observationsByEntity: Map<string, Set<string>> = new Map();

  private version: number = 1;

  constructor(options: MemoryOptions = {}) {
    super({
      ...options,
      persistPath: options.persistPath || path.join(MEMORY_DIR, 'knowledge-graph.json'),
    });
  }

  // ============================================================================
  // Entity Management
  // ============================================================================

  /**
   * Create a new entity
   */
  createEntity(
    name: string,
    type: EntityType,
    options: {
      observations?: string[];
      metadata?: Record<string, unknown>;
      importance?: number;
      tags?: string[];
    } = {},
  ): Entity {
    const id = generateId();
    const now = new Date();

    const entity: Entity = {
      id,
      name,
      type,
      observations: options.observations || [],
      metadata: options.metadata || {},
      created: now,
      updated: now,
      importance: options.importance ?? 0.5,
      tags: options.tags || [],
    };

    this.entities.set(id, entity);
    this.indexEntity(entity);

    // Create observations if provided
    for (const obs of entity.observations) {
      this.addObservation(id, obs, 'user');
    }

    this.scheduleSave();
    return entity;
  }

  /**
   * Create multiple entities at once
   */
  createEntities(
    entities: Array<{
      name: string;
      type: EntityType;
      observations?: string[];
      metadata?: Record<string, unknown>;
    }>,
  ): Entity[] {
    return entities.map((e) =>
      this.createEntity(e.name, e.type, {
        observations: e.observations,
        metadata: e.metadata,
      }),
    );
  }

  /**
   * Get entity by ID
   */
  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  /**
   * Get entities by name (may return multiple)
   */
  getEntitiesByName(name: string): Entity[] {
    const ids = this.entityByName.get(name.toLowerCase());
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.entities.get(id))
      .filter((entity): entity is Entity => entity !== undefined);
  }

  /**
   * Get entities by type
   */
  getEntitiesByType(type: EntityType): Entity[] {
    return Array.from(this.entities.values()).filter((e) => e.type === type);
  }

  /**
   * Update an entity
   */
  updateEntity(id: string, updates: Partial<Omit<Entity, 'id' | 'created'>>): Entity | undefined {
    const entity = this.entities.get(id);
    if (!entity) return undefined;

    // Remove old index
    this.removeEntityIndex(entity);

    // Apply updates
    Object.assign(entity, updates, { updated: new Date() });

    // Re-index
    this.indexEntity(entity);
    this.scheduleSave();

    return entity;
  }

  /**
   * Delete an entity and its relations
   */
  deleteEntity(id: string): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;

    // Remove relations
    const relatedRelations = this.getEntityRelations(id);
    for (const rel of relatedRelations) {
      this.deleteRelation(rel.id);
    }

    // Remove observations
    const obs = this.observationsByEntity.get(id);
    if (obs) {
      for (const obsId of obs) {
        this.observations.delete(obsId);
      }
      this.observationsByEntity.delete(id);
    }

    // Remove index and entity
    this.removeEntityIndex(entity);
    this.entities.delete(id);

    this.scheduleSave();
    return true;
  }

  /**
   * Delete multiple entities
   */
  deleteEntities(ids: string[]): number {
    let deleted = 0;
    for (const id of ids) {
      if (this.deleteEntity(id)) deleted++;
    }
    return deleted;
  }

  // ============================================================================
  // Relation Management
  // ============================================================================

  /**
   * Create a relation between entities
   */
  createRelation(
    sourceId: string,
    targetId: string,
    type: RelationType,
    options: {
      label?: string;
      weight?: number;
      metadata?: Record<string, unknown>;
    } = {},
  ): Relation | undefined {
    // Verify entities exist
    if (!this.entities.has(sourceId) || !this.entities.has(targetId)) {
      return undefined;
    }

    const id = generateId();
    const relation: Relation = {
      id,
      sourceId,
      targetId,
      type,
      label: options.label,
      weight: options.weight ?? 1.0,
      metadata: options.metadata || {},
      created: new Date(),
    };

    this.relations.set(id, relation);
    this.indexRelation(relation);
    this.scheduleSave();

    return relation;
  }

  /**
   * Create multiple relations at once
   */
  createRelations(
    relations: Array<{
      sourceId: string;
      targetId: string;
      type: RelationType;
      label?: string;
    }>,
  ): Relation[] {
    return relations
      .map((r) => this.createRelation(r.sourceId, r.targetId, r.type, { label: r.label }))
      .filter((r): r is Relation => r !== undefined);
  }

  /**
   * Get relation by ID
   */
  getRelation(id: string): Relation | undefined {
    return this.relations.get(id);
  }

  /**
   * Get all relations for an entity
   */
  getEntityRelations(entityId: string, direction?: 'outgoing' | 'incoming' | 'both'): Relation[] {
    const relations: Relation[] = [];
    const dir = direction || 'both';

    if (dir === 'outgoing' || dir === 'both') {
      const outgoing = this.relationsBySource.get(entityId);
      if (outgoing) {
        for (const relId of outgoing) {
          const rel = this.relations.get(relId);
          if (rel) relations.push(rel);
        }
      }
    }

    if (dir === 'incoming' || dir === 'both') {
      const incoming = this.relationsByTarget.get(entityId);
      if (incoming) {
        for (const relId of incoming) {
          const rel = this.relations.get(relId);
          if (rel) relations.push(rel);
        }
      }
    }

    return relations;
  }

  /**
   * Delete a relation
   */
  deleteRelation(id: string): boolean {
    const relation = this.relations.get(id);
    if (!relation) return false;

    this.removeRelationIndex(relation);
    this.relations.delete(id);
    this.scheduleSave();

    return true;
  }

  /**
   * Delete multiple relations
   */
  deleteRelations(ids: string[]): number {
    let deleted = 0;
    for (const id of ids) {
      if (this.deleteRelation(id)) deleted++;
    }
    return deleted;
  }

  // ============================================================================
  // Observation Management
  // ============================================================================

  /**
   * Add an observation to an entity
   */
  addObservation(
    entityId: string,
    content: string,
    source: Observation['source'] = 'user',
    confidence: number = 1.0,
  ): Observation | undefined {
    if (!this.entities.has(entityId)) return undefined;

    const id = generateId();
    const observation: Observation = {
      id,
      entityId,
      content,
      source,
      confidence,
      created: new Date(),
    };

    this.observations.set(id, observation);

    // Index
    if (!this.observationsByEntity.has(entityId)) {
      this.observationsByEntity.set(entityId, new Set());
    }
    this.observationsByEntity.get(entityId)?.add(id);

    // Update entity's observations array
    const entity = this.entities.get(entityId);
    if (entity && !entity.observations.includes(content)) {
      entity.observations.push(content);
      entity.updated = new Date();
    }

    this.scheduleSave();
    return observation;
  }

  /**
   * Add multiple observations to an entity
   */
  addObservations(
    entityId: string,
    contents: string[],
    source: Observation['source'] = 'user',
  ): Observation[] {
    return contents
      .map((c) => this.addObservation(entityId, c, source))
      .filter((o): o is Observation => o !== undefined);
  }

  /**
   * Get observations for an entity
   */
  getEntityObservations(entityId: string): Observation[] {
    const obsIds = this.observationsByEntity.get(entityId);
    if (!obsIds) return [];
    return Array.from(obsIds)
      .map((id) => this.observations.get(id))
      .filter((obs): obs is Observation => obs !== undefined);
  }

  /**
   * Delete an observation
   */
  deleteObservation(id: string): boolean {
    const obs = this.observations.get(id);
    if (!obs) return false;

    // Remove from entity
    const entity = this.entities.get(obs.entityId);
    if (entity) {
      entity.observations = entity.observations.filter((o) => o !== obs.content);
      entity.updated = new Date();
    }

    // Remove from index
    const entityObs = this.observationsByEntity.get(obs.entityId);
    if (entityObs) {
      entityObs.delete(id);
    }

    this.observations.delete(id);
    this.scheduleSave();
    return true;
  }

  /**
   * Delete multiple observations
   */
  deleteObservations(ids: string[]): number {
    let deleted = 0;
    for (const id of ids) {
      if (this.deleteObservation(id)) deleted++;
    }
    return deleted;
  }

  // ============================================================================
  // Graph Traversal & Search
  // ============================================================================

  /**
   * Search entities by query
   */
  searchEntities(query: string, limit: number = 10): GraphSearchResult[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

    if (queryWords.length === 0) {
      return Array.from(this.entities.values())
        .slice(0, limit)
        .map((e) => ({
          entity: e,
          score: e.importance,
          matchedObservations: [],
          relatedEntities: [],
        }));
    }

    const results: GraphSearchResult[] = [];

    for (const entity of this.entities.values()) {
      const nameLower = entity.name.toLowerCase();
      const tagsLower = entity.tags.join(' ').toLowerCase();
      const obsLower = entity.observations.join(' ').toLowerCase();
      const combined = `${nameLower} ${tagsLower} ${obsLower}`;

      const matchCount = queryWords.filter((w) => combined.includes(w)).length;
      if (matchCount === 0) continue;

      const score = (matchCount / queryWords.length) * 0.6 + entity.importance * 0.4;

      const matchedObservations = entity.observations.filter((obs) =>
        queryWords.some((w) => obs.toLowerCase().includes(w)),
      );

      results.push({
        entity,
        score,
        matchedObservations,
        relatedEntities: [], // Will be populated if needed
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Get related entities through graph traversal
   */
  getRelatedEntities(entityId: string, options: TraversalOptions = {}): Entity[] {
    const visited = new Set<string>();
    const result: Entity[] = [];
    const maxDepth = options.maxDepth ?? 2;

    const traverse = (currentId: string, depth: number) => {
      if (depth > maxDepth || visited.has(currentId)) return;
      visited.add(currentId);

      const relations = this.getEntityRelations(currentId, options.direction);

      for (const rel of relations) {
        // Filter by relation type
        if (options.relationTypes && !options.relationTypes.includes(rel.type)) {
          continue;
        }

        const relatedId = rel.sourceId === currentId ? rel.targetId : rel.sourceId;
        const relatedEntity = this.entities.get(relatedId);

        if (!relatedEntity) continue;

        // Filter by entity type
        if (options.entityTypes && !options.entityTypes.includes(relatedEntity.type)) {
          continue;
        }

        if (!visited.has(relatedId)) {
          result.push(relatedEntity);
          traverse(relatedId, depth + 1);
        }
      }
    };

    traverse(entityId, 0);
    return result;
  }

  /**
   * Open nodes - get entities with their relations expanded
   */
  openNodes(ids: string[]): Array<{
    entity: Entity;
    relations: Relation[];
    observations: Observation[];
  }> {
    return ids
      .map((id) => {
        const entity = this.entities.get(id);
        if (!entity) return null;

        return {
          entity,
          relations: this.getEntityRelations(id),
          observations: this.getEntityObservations(id),
        };
      })
      .filter((n): n is NonNullable<typeof n> => n !== null);
  }

  /**
   * Read entire graph
   */
  readGraph(): {
    entities: Entity[];
    relations: Relation[];
    observations: Observation[];
  } {
    return {
      entities: Array.from(this.entities.values()),
      relations: Array.from(this.relations.values()),
      observations: Array.from(this.observations.values()),
    };
  }

  // ============================================================================
  // Index Management
  // ============================================================================

  private indexEntity(entity: Entity): void {
    const nameLower = entity.name.toLowerCase();
    if (!this.entityByName.has(nameLower)) {
      this.entityByName.set(nameLower, new Set());
    }
    this.entityByName.get(nameLower)?.add(entity.id);
  }

  private removeEntityIndex(entity: Entity): void {
    const nameLower = entity.name.toLowerCase();
    const ids = this.entityByName.get(nameLower);
    if (ids) {
      ids.delete(entity.id);
      if (ids.size === 0) {
        this.entityByName.delete(nameLower);
      }
    }
  }

  private indexRelation(relation: Relation): void {
    if (!this.relationsBySource.has(relation.sourceId)) {
      this.relationsBySource.set(relation.sourceId, new Set());
    }
    this.relationsBySource.get(relation.sourceId)?.add(relation.id);

    if (!this.relationsByTarget.has(relation.targetId)) {
      this.relationsByTarget.set(relation.targetId, new Set());
    }
    this.relationsByTarget.get(relation.targetId)?.add(relation.id);
  }

  private removeRelationIndex(relation: Relation): void {
    const sourceRels = this.relationsBySource.get(relation.sourceId);
    if (sourceRels) {
      sourceRels.delete(relation.id);
    }

    const targetRels = this.relationsByTarget.get(relation.targetId);
    if (targetRels) {
      targetRels.delete(relation.id);
    }
  }

  private rebuildIndexes(): void {
    this.entityByName.clear();
    this.relationsBySource.clear();
    this.relationsByTarget.clear();
    this.observationsByEntity.clear();

    for (const entity of this.entities.values()) {
      this.indexEntity(entity);
    }

    for (const relation of this.relations.values()) {
      this.indexRelation(relation);
    }

    for (const obs of this.observations.values()) {
      if (!this.observationsByEntity.has(obs.entityId)) {
        this.observationsByEntity.set(obs.entityId, new Set());
      }
      this.observationsByEntity.get(obs.entityId)?.add(obs.id);
    }
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  serialize(): string {
    const data: GraphData = {
      entities: Array.from(this.entities.values()),
      relations: Array.from(this.relations.values()),
      observations: Array.from(this.observations.values()),
      version: this.version,
      lastModified: new Date(),
    };
    return serializeToJson(data);
  }

  deserialize(data: string): void {
    const parsed = deserializeFromJson<GraphData>(data);
    if (!parsed) {
      this.initializeEmpty();
      return;
    }

    this.entities.clear();
    this.relations.clear();
    this.observations.clear();

    // Restore entities with date revival
    for (const entity of parsed.entities || []) {
      entity.created = new Date(entity.created);
      entity.updated = new Date(entity.updated);
      this.entities.set(entity.id, entity);
    }

    // Restore relations with date revival
    for (const relation of parsed.relations || []) {
      relation.created = new Date(relation.created);
      this.relations.set(relation.id, relation);
    }

    // Restore observations with date revival
    for (const obs of parsed.observations || []) {
      obs.created = new Date(obs.created);
      this.observations.set(obs.id, obs);
    }

    this.version = parsed.version || 1;
    this.rebuildIndexes();
  }

  protected initializeEmpty(): void {
    this.entities.clear();
    this.relations.clear();
    this.observations.clear();
    this.entityByName.clear();
    this.relationsBySource.clear();
    this.relationsByTarget.clear();
    this.observationsByEntity.clear();
    this.version = 1;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  getStats(): GraphStats {
    const entityTypes: Record<string, number> = {};
    const relationTypes: Record<string, number> = {};

    for (const entity of this.entities.values()) {
      entityTypes[entity.type] = (entityTypes[entity.type] || 0) + 1;
    }

    for (const relation of this.relations.values()) {
      relationTypes[relation.type] = (relationTypes[relation.type] || 0) + 1;
    }

    const allDates = [
      ...Array.from(this.entities.values()).map((e) => e.created),
      ...Array.from(this.relations.values()).map((r) => r.created),
      ...Array.from(this.observations.values()).map((o) => o.created),
    ]
      .filter((d) => d instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      entries: this.entities.size + this.relations.size + this.observations.size,
      size: estimateSize({
        entities: Array.from(this.entities.values()),
        relations: Array.from(this.relations.values()),
        observations: Array.from(this.observations.values()),
      }),
      oldestEntry: allDates[0],
      newestEntry: allDates[allDates.length - 1],
      entityCount: this.entities.size,
      relationCount: this.relations.size,
      observationCount: this.observations.size,
      entityTypes,
      relationTypes,
    };
  }

  getEntryCount(): number {
    return this.entities.size;
  }

  clear(): void {
    this.initializeEmpty();
    this.scheduleSave();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let graphMemoryInstance: GraphMemory | null = null;

export function getGraphMemory(): GraphMemory {
  if (!graphMemoryInstance) {
    graphMemoryInstance = new GraphMemory();
  }
  return graphMemoryInstance;
}

export const graphMemory = getGraphMemory();

export default GraphMemory;
