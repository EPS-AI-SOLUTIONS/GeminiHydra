/**
 * GeminiHydra - PluginSystem Unit Tests
 * Testy systemu pluginow: rejestracja, hooki, konfiguracja, createPlugin
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  PluginManager,
  createPlugin,
  type Plugin,
  type PluginManifest,
  type PluginHook,
  type PluginContext,
  type PluginHandler,
} from '../../src/core/PluginSystem.js';

// Mock moduly zewnetrzne
vi.mock('chalk', () => ({
  default: {
    red: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    gray: (s: string) => s,
    cyan: (s: string) => s,
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('not found')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockRejectedValue(new Error('not found')),
    readdir: vi.fn().mockResolvedValue([]),
    copyFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/config/paths.config.js', () => ({
  GEMINIHYDRA_DIR: '/tmp/geminihydra-test',
}));

// ============================================================
// Helper: tworzenie testowych pluginow
// ============================================================

function createTestPlugin(
  name: string,
  hooks: PluginHook[] = ['beforeTask', 'afterTask'],
  handlers?: Partial<Record<PluginHook, PluginHandler>>
): Plugin {
  return createPlugin(
    {
      name,
      version: '1.0.0',
      description: `Test plugin: ${name}`,
      hooks,
    },
    handlers || {
      beforeTask: async (ctx) => ({ ...ctx, agent: `${name}-modified` }),
      afterTask: async (ctx) => ctx,
    }
  );
}

// ============================================================
// createPlugin
// ============================================================

describe('createPlugin', () => {
  it('powinien stworzyc plugin z manifestem i handlerami', () => {
    const plugin = createPlugin(
      {
        name: 'test',
        version: '1.0.0',
        description: 'Test plugin',
        hooks: ['beforeTask'],
      },
      {
        beforeTask: async (ctx) => ctx,
      }
    );

    expect(plugin.manifest.name).toBe('test');
    expect(plugin.manifest.version).toBe('1.0.0');
    expect(plugin.manifest.hooks).toContain('beforeTask');
    expect(plugin.handlers.beforeTask).toBeDefined();
  });

  it('powinien stworzyc plugin z opcjami init/destroy', () => {
    const initFn = vi.fn().mockResolvedValue(undefined);
    const destroyFn = vi.fn().mockResolvedValue(undefined);

    const plugin = createPlugin(
      {
        name: 'lifecycle',
        version: '1.0.0',
        description: 'Lifecycle plugin',
        hooks: ['onError'],
      },
      { onError: async (ctx) => ctx },
      { init: initFn, destroy: destroyFn }
    );

    expect(plugin.init).toBe(initFn);
    expect(plugin.destroy).toBe(destroyFn);
  });

  it('powinien stworzyc plugin bez opcji init/destroy', () => {
    const plugin = createPlugin(
      {
        name: 'simple',
        version: '1.0.0',
        description: 'Simple plugin',
        hooks: [],
      },
      {}
    );

    expect(plugin.init).toBeUndefined();
    expect(plugin.destroy).toBeUndefined();
  });

  it('powinien obslugiwac puste hooks', () => {
    const plugin = createPlugin(
      {
        name: 'no-hooks',
        version: '1.0.0',
        description: 'No hooks',
        hooks: [],
      },
      {}
    );

    expect(plugin.manifest.hooks).toHaveLength(0);
  });

  it('powinien obslugiwac wiele hookow', () => {
    const plugin = createPlugin(
      {
        name: 'multi-hooks',
        version: '1.0.0',
        description: 'Multi hook plugin',
        hooks: ['beforeTask', 'afterTask', 'onError', 'onInput', 'onOutput'],
      },
      {
        beforeTask: async (ctx) => ctx,
        afterTask: async (ctx) => ctx,
        onError: async (ctx) => ctx,
        onInput: async (ctx) => ctx,
        onOutput: async (ctx) => ctx,
      }
    );

    expect(plugin.manifest.hooks).toHaveLength(5);
    expect(Object.keys(plugin.handlers)).toHaveLength(5);
  });
});

// ============================================================
// PluginManager
// ============================================================

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  afterEach(async () => {
    await manager.destroy();
  });

  describe('tworzenie instancji', () => {
    it('powinien stworzyc nowa instancje', () => {
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(PluginManager);
    });
  });

  describe('getLoadedPlugins - listowanie zaladowanych', () => {
    it('powinien zwrocic pusta liste na poczatku', () => {
      const plugins = manager.getLoadedPlugins();
      expect(plugins).toHaveLength(0);
    });
  });

  describe('getRegisteredPlugins - listowanie zarejestrowanych', () => {
    it('powinien zwrocic pusta liste na poczatku', () => {
      const plugins = manager.getRegisteredPlugins();
      expect(plugins).toHaveLength(0);
    });
  });

  describe('getPluginInfo - informacje o pluginie', () => {
    it('powinien zwrocic null dla nieistniejacego plugina', () => {
      const info = manager.getPluginInfo('nonexistent');
      expect(info).toBeNull();
    });
  });

  describe('executeHook - wykonywanie hookow', () => {
    it('powinien zwrocic oryginalny kontekst gdy brak handlerow', async () => {
      const context: PluginContext = { mission: 'test' };
      const result = await manager.executeHook('beforeTask', context);
      expect(result.mission).toBe('test');
    });

    it('powinien zwrocic oryginalny kontekst dla niezarejestrowanego hooka', async () => {
      const context: PluginContext = { input: 'hello' };
      const result = await manager.executeHook('onInput', context);
      expect(result.input).toBe('hello');
    });
  });

  describe('eventy - pluginLoaded / pluginUnloaded', () => {
    it('powinien emitowac eventy jako EventEmitter', () => {
      const listener = vi.fn();
      manager.on('pluginLoaded', listener);

      manager.emit('pluginLoaded', 'test-plugin');
      expect(listener).toHaveBeenCalledWith('test-plugin');
    });

    it('powinien emitowac pluginUnloaded', () => {
      const listener = vi.fn();
      manager.on('pluginUnloaded', listener);

      manager.emit('pluginUnloaded', 'test-plugin');
      expect(listener).toHaveBeenCalledWith('test-plugin');
    });
  });

  describe('destroy - czyszczenie', () => {
    it('powinien usunac wszystkie listenery', async () => {
      const listener = vi.fn();
      manager.on('pluginLoaded', listener);

      await manager.destroy();

      expect(manager.listenerCount('pluginLoaded')).toBe(0);
    });
  });

  describe('init - inicjalizacja', () => {
    it('powinien nie rzucac bledu przy pierwszym init', async () => {
      await expect(manager.init()).resolves.not.toThrow();
    });

    it('powinien byc idempotentny (nie rzucac przy wielokrotnym init)', async () => {
      await manager.init();
      await expect(manager.init()).resolves.not.toThrow();
    });
  });

  describe('unloadPlugin - wyladowanie', () => {
    it('powinien nie rzucac bledu dla nieistniejacego plugina', async () => {
      await expect(manager.unloadPlugin('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('setEnabled - wlaczanie/wylaczanie', () => {
    it('powinien rzucic blad dla niezarejestrowanego plugina', async () => {
      await expect(
        manager.setEnabled('nonexistent', true)
      ).rejects.toThrow('Plugin not found: nonexistent');
    });
  });

  describe('setConfig - konfiguracja plugina', () => {
    it('powinien rzucic blad dla niezarejestrowanego plugina', async () => {
      await expect(
        manager.setConfig('nonexistent', { key: 'value' })
      ).rejects.toThrow('Plugin not found: nonexistent');
    });
  });

  describe('installPlugin - instalacja', () => {
    it('powinien rzucic blad dla instalacji z URL (nieimplementowane)', async () => {
      await expect(
        manager.installPlugin('https://example.com/plugin.js')
      ).rejects.toThrow('URL installation not yet implemented');
    });
  });
});

// ============================================================
// PluginManifest - walidacja struktury
// ============================================================

describe('PluginManifest - walidacja struktury', () => {
  it('powinien miec wymagane pola', () => {
    const manifest: PluginManifest = {
      name: 'test',
      version: '1.0.0',
      description: 'Test',
      hooks: ['beforeTask'],
    };

    expect(manifest.name).toBeDefined();
    expect(manifest.version).toBeDefined();
    expect(manifest.description).toBeDefined();
    expect(manifest.hooks).toBeDefined();
  });

  it('powinien obslugiwac opcjonalne pola', () => {
    const manifest: PluginManifest = {
      name: 'full',
      version: '2.0.0',
      description: 'Full manifest',
      author: 'GeminiHydra',
      homepage: 'https://example.com',
      hooks: ['beforeTask', 'afterTask'],
      dependencies: ['other-plugin'],
      config: {
        enabled: {
          type: 'boolean',
          description: 'Enable plugin',
          default: true,
          required: false,
        },
        maxRetries: {
          type: 'number',
          description: 'Max retries',
          default: 3,
        },
      },
    };

    expect(manifest.author).toBe('GeminiHydra');
    expect(manifest.homepage).toBe('https://example.com');
    expect(manifest.dependencies).toContain('other-plugin');
    expect(manifest.config?.enabled?.type).toBe('boolean');
    expect(manifest.config?.maxRetries?.default).toBe(3);
  });
});

// ============================================================
// PluginContext
// ============================================================

describe('PluginContext - obsluga kontekstu', () => {
  it('powinien obslugiwac pusty kontekst', () => {
    const ctx: PluginContext = {};
    expect(ctx.mission).toBeUndefined();
    expect(ctx.error).toBeUndefined();
  });

  it('powinien obslugiwac pelny kontekst', () => {
    const ctx: PluginContext = {
      mission: 'test mission',
      plan: { steps: [] },
      task: { id: 1 },
      result: 'success',
      error: new Error('test'),
      agent: 'test-agent',
      input: 'user input',
      output: 'agent output',
      mcpTool: 'read_file',
      mcpParams: { path: '/test' },
    };

    expect(ctx.mission).toBe('test mission');
    expect(ctx.agent).toBe('test-agent');
    expect(ctx.mcpTool).toBe('read_file');
  });

  it('powinien pozwalac na modyfikacje kontekstu w handlerze', async () => {
    const handler: PluginHandler = async (ctx) => {
      return { ...ctx, output: 'modified output' };
    };

    const ctx: PluginContext = { output: 'original' };
    const result = await handler(ctx);

    expect(result?.output).toBe('modified output');
    expect(ctx.output).toBe('original'); // oryginał niezmieniony
  });
});

// ============================================================
// Hooki - typy
// ============================================================

describe('PluginHook - typy hookow', () => {
  const allHooks: PluginHook[] = [
    'beforePlan',
    'afterPlan',
    'beforeTask',
    'afterTask',
    'beforeSynthesis',
    'afterSynthesis',
    'onError',
    'onMcpCall',
    'onAgentStart',
    'onAgentEnd',
    'onInput',
    'onOutput',
  ];

  it('powinien wspierac wszystkie zdefiniowane hooki', () => {
    for (const hook of allHooks) {
      const plugin = createPlugin(
        { name: `test-${hook}`, version: '1.0.0', description: '', hooks: [hook] },
        { [hook]: async (ctx: PluginContext) => ctx }
      );
      expect(plugin.manifest.hooks).toContain(hook);
      expect(plugin.handlers[hook]).toBeDefined();
    }
  });
});
