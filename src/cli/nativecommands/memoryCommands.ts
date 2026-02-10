/**
 * NativeCommands - Memory / Knowledge Graph commands
 *
 * Commands: set, get, find, entity, observe, relate, graph, save, load
 *
 * @module cli/nativecommands/memoryCommands
 */

import {
  success, error,
  type CommandResult,
  getTools,
  createFailedMessage
} from './helpers.js';

// ============================================================
// Memory Commands
// ============================================================

export const memoryCommands = {
  /**
   * Set value in memory
   */
  async set(args: string[]): Promise<CommandResult> {
    if (args.length < 2) {
      return error('Usage: /mem set <key> <value>');
    }

    const [key, ...valueParts] = args;
    let value: any = valueParts.join(' ');

    // Try to parse as JSON
    try {
      value = JSON.parse(value);
    } catch {
      // Keep as string
    }

    try {
      const tools = getTools();
      tools.memory.set(key, value);
      return success({ value }, `Set "${key}"`);
    } catch (err) {
      return error(createFailedMessage('set value', err));
    }
  },

  /**
   * Get value from memory
   */
  async get(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error('Usage: /mem get <key>');
    }

    try {
      const tools = getTools();
      const value = tools.memory.get(args[0]);

      if (value === undefined) {
        return error(`Key not found: ${args[0]}`);
      }

      return success({ value }, `Value of "${args[0]}"`);
    } catch (err) {
      return error(createFailedMessage('get value', err));
    }
  },

  /**
   * Search memory
   */
  async find(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error('Usage: /mem find <query>');
    }

    const query = args.join(' ');

    try {
      const tools = getTools();
      const results = tools.memory.searchEntities(query);

      return success({
        entities: results.slice(0, 20)
      }, `Found ${results.length} entities matching "${query}"`);
    } catch (err) {
      return error(createFailedMessage('find entities', err));
    }
  },

  /**
   * Create entity
   */
  async entity(args: string[]): Promise<CommandResult> {
    if (args.length < 2) {
      return error('Usage: /mem entity <name> <type> [observations...]');
    }

    const [name, type, ...observations] = args;

    try {
      const tools = getTools();
      const entity = tools.memory.createEntity(name, type);

      // Add observations if provided
      for (const obs of observations) {
        tools.memory.addObservation(entity.id, obs);
      }

      return success({ type, observations }, `Created entity "${name}"`);
    } catch (err) {
      return error(createFailedMessage('create entity', err));
    }
  },

  /**
   * Add observation to entity
   */
  async observe(args: string[]): Promise<CommandResult> {
    if (args.length < 2) {
      return error('Usage: /mem observe <entity> <observation>');
    }

    const [entityName, ...observationParts] = args;
    const observation = observationParts.join(' ');

    try {
      const tools = getTools();
      // Use observe() method which handles entity lookup/creation
      tools.memory.observe(entityName, observation);
      return success({ observation }, `Added observation to "${entityName}"`);
    } catch (err) {
      return error(createFailedMessage('add observation', err));
    }
  },

  /**
   * Create relation between entities
   */
  async relate(args: string[]): Promise<CommandResult> {
    if (args.length < 3) {
      return error('Usage: /mem relate <from> <relation> <to>');
    }

    const [from, relationType, to] = args;

    try {
      const tools = getTools();
      // Use relate() method which handles entity lookup by name
      const relation = tools.memory.relate(from, to, relationType, true);
      if (!relation) {
        return error('Could not create relation');
      }
      return success(null, `Created relation: ${from} --[${relationType}]--> ${to}`);
    } catch (err) {
      return error(createFailedMessage('create relation', err));
    }
  },

  /**
   * Show graph
   */
  async graph(): Promise<CommandResult> {
    try {
      const tools = getTools();
      const entities = tools.memory.getAllEntities();
      const relations = tools.memory.getAllRelations();

      return success({
        entities: entities.length,
        relations: relations.length,
        types: [...new Set(entities.map(e => e.type))]
      }, 'Knowledge Graph');
    } catch (err) {
      return error(createFailedMessage('get graph', err));
    }
  },

  /**
   * Save memory to disk
   */
  async save(): Promise<CommandResult> {
    try {
      const tools = getTools();
      await tools.memory.save();
      return success(null, 'Memory saved to disk');
    } catch (err) {
      return error(createFailedMessage('save memory', err));
    }
  },

  /**
   * Load memory from disk
   */
  async load(): Promise<CommandResult> {
    try {
      const tools = getTools();
      await tools.memory.load();
      return success(null, 'Memory loaded from disk');
    } catch (err) {
      return error(createFailedMessage('load memory', err));
    }
  }
};
