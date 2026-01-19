/**
 * CLI Prompt Builder
 * Dynamic prompt generation with state-aware colors and indicators
 * @module cli/PromptBuilder
 */

import chalk from 'chalk';
import { HydraTheme } from './Theme.js';

/**
 * @typedef {'idle'|'processing'|'error'|'success'} PromptState
 */

/**
 * @typedef {'normal'|'yolo'|'quick'} ExecutionMode
 */

/**
 * @typedef {Object} PromptContext
 * @property {PromptState} state - Current CLI state
 * @property {ExecutionMode} mode - Execution mode (normal/yolo/quick)
 * @property {string|null} activeAgent - Currently active agent/provider
 * @property {string|null} forceProvider - Forced provider for next query
 * @property {number|null} lastResponseTime - Last response time in ms
 * @property {boolean} multilineMode - Whether in multiline input mode
 * @property {Date|null} lastResponseAt - Timestamp of last response
 */

/**
 * @typedef {Object} PromptConfig
 * @property {boolean} showState - Show state indicator
 * @property {boolean} showMode - Show execution mode
 * @property {boolean} showAgent - Show active agent
 * @property {boolean} showTime - Show last response time
 * @property {boolean} showTimestamp - Show time since last response
 * @property {boolean} compact - Use compact format
 */

/** Default prompt configuration */
const DEFAULT_CONFIG = {
  showState: true,
  showMode: true,
  showAgent: true,
  showTime: true,
  showTimestamp: false,
  compact: false
};

/** State colors mapping */
const STATE_COLORS = {
  idle: 'cyan',
  processing: 'yellow',
  error: 'red',
  success: 'green'
};

/** State symbols */
const STATE_SYMBOLS = {
  idle: '*',
  processing: '~',
  error: '!',
  success: 'v'
};

/** Mode indicators */
const MODE_INDICATORS = {
  normal: '',
  yolo: 'YOLO',
  quick: 'Q'
};

/** Mode colors */
const MODE_COLORS = {
  normal: 'dim',
  yolo: 'magenta',
  quick: 'yellow'
};

/**
 * Dynamic prompt builder for HYDRA CLI
 * @class
 */
export class PromptBuilder {
  /** @type {Object} */
  #theme;

  /** @type {PromptConfig} */
  #config;

  /** @type {PromptContext} */
  #context;

  /**
   * Create a new PromptBuilder
   * @param {Object} [theme] - Theme object
   * @param {PromptConfig} [config] - Configuration options
   */
  constructor(theme = HydraTheme, config = {}) {
    this.#theme = theme;
    this.#config = { ...DEFAULT_CONFIG, ...config };
    this.#context = {
      state: 'idle',
      mode: 'normal',
      activeAgent: null,
      forceProvider: null,
      lastResponseTime: null,
      multilineMode: false,
      lastResponseAt: null
    };
  }

  /**
   * Update prompt context
   * @param {Partial<PromptContext>} updates - Context updates
   */
  updateContext(updates) {
    this.#context = { ...this.#context, ...updates };
  }

  /**
   * Set the current state
   * @param {PromptState} state - New state
   */
  setState(state) {
    this.#context.state = state;
  }

  /**
   * Set execution mode
   * @param {ExecutionMode} mode - Execution mode
   */
  setMode(mode) {
    this.#context.mode = mode;
  }

  /**
   * Set active agent/provider
   * @param {string|null} agent - Agent name or null
   */
  setActiveAgent(agent) {
    this.#context.activeAgent = agent;
  }

  /**
   * Set forced provider for next query
   * @param {string|null} provider - Provider name or null
   */
  setForceProvider(provider) {
    this.#context.forceProvider = provider;
  }

  /**
   * Record response time
   * @param {number} timeMs - Response time in milliseconds
   */
  recordResponseTime(timeMs) {
    this.#context.lastResponseTime = timeMs;
    this.#context.lastResponseAt = new Date();
  }

  /**
   * Reset to idle state
   */
  resetState() {
    this.#context.state = 'idle';
    this.#context.activeAgent = null;
  }

  /**
   * Get color function for current state
   * @returns {Function} Chalk color function
   * @private
   */
  #getStateColor() {
    const colorName = STATE_COLORS[this.#context.state] || 'cyan';
    return this.#theme.colors[colorName] || chalk[colorName] || chalk.cyan;
  }

  /**
   * Get state symbol
   * @returns {string} State symbol
   * @private
   */
  #getStateSymbol() {
    return STATE_SYMBOLS[this.#context.state] || '*';
  }

  /**
   * Build mode indicator
   * @returns {string} Mode indicator string (may be empty)
   * @private
   */
  #buildModeIndicator() {
    if (!this.#config.showMode) return '';

    const mode = this.#context.mode;
    const indicator = MODE_INDICATORS[mode];

    if (!indicator) return '';

    const colorName = MODE_COLORS[mode] || 'dim';
    const colorFn = this.#theme.colors[colorName] || chalk[colorName] || chalk.dim;

    return colorFn(`[${indicator}]`);
  }

  /**
   * Build agent indicator
   * @returns {string} Agent indicator string (may be empty)
   * @private
   */
  #buildAgentIndicator() {
    if (!this.#config.showAgent) return '';

    // Show forced provider if set
    const agent = this.#context.forceProvider || this.#context.activeAgent;
    if (!agent) return '';

    // Use provider-specific color
    let colorFn;
    if (agent.toLowerCase() === 'ollama') {
      colorFn = this.#theme.colors.ollama || chalk.hex('#8b5cf6');
    } else if (agent.toLowerCase() === 'gemini') {
      colorFn = this.#theme.colors.gemini || chalk.hex('#22d3ee');
    } else {
      colorFn = this.#theme.colors.primary || chalk.cyan;
    }

    const prefix = this.#context.forceProvider ? '!' : '';
    return colorFn(`[${prefix}${agent.toUpperCase()}]`);
  }

  /**
   * Build time indicator
   * @returns {string} Time indicator string (may be empty)
   * @private
   */
  #buildTimeIndicator() {
    if (!this.#config.showTime || this.#context.lastResponseTime === null) {
      return '';
    }

    const time = this.#context.lastResponseTime;
    let timeStr;
    let colorFn;

    if (time < 1000) {
      timeStr = `${time}ms`;
      colorFn = this.#theme.colors.success || chalk.green;
    } else if (time < 5000) {
      timeStr = `${(time / 1000).toFixed(1)}s`;
      colorFn = this.#theme.colors.warning || chalk.yellow;
    } else {
      timeStr = `${(time / 1000).toFixed(1)}s`;
      colorFn = this.#theme.colors.error || chalk.red;
    }

    return this.#theme.colors.dim(`(${colorFn(timeStr)})`);
  }

  /**
   * Build timestamp indicator (time since last response)
   * @returns {string} Timestamp indicator string (may be empty)
   * @private
   */
  #buildTimestampIndicator() {
    if (!this.#config.showTimestamp || !this.#context.lastResponseAt) {
      return '';
    }

    const elapsed = Date.now() - this.#context.lastResponseAt.getTime();
    const seconds = Math.floor(elapsed / 1000);

    if (seconds < 60) {
      return this.#theme.colors.dim(`[${seconds}s ago]`);
    } else if (seconds < 3600) {
      return this.#theme.colors.dim(`[${Math.floor(seconds / 60)}m ago]`);
    } else {
      return this.#theme.colors.dim(`[${Math.floor(seconds / 3600)}h ago]`);
    }
  }

  /**
   * Build the complete prompt string
   * @param {string} [basePrompt='hydra'] - Base prompt text
   * @returns {string} Complete colored prompt string
   */
  build(basePrompt = 'hydra') {
    const stateColor = this.#getStateColor();
    const parts = [];

    // State symbol (colored based on state)
    if (this.#config.showState) {
      const symbol = this.#getStateSymbol();
      parts.push(stateColor(symbol));
    }

    // Mode indicator [YOLO] or [Q]
    const modeIndicator = this.#buildModeIndicator();
    if (modeIndicator) {
      parts.push(modeIndicator);
    }

    // Agent indicator [OLLAMA] or [GEMINI]
    const agentIndicator = this.#buildAgentIndicator();
    if (agentIndicator) {
      parts.push(agentIndicator);
    }

    // Base prompt name
    parts.push(stateColor(basePrompt));

    // Time indicator (last response time)
    const timeIndicator = this.#buildTimeIndicator();
    if (timeIndicator) {
      parts.push(timeIndicator);
    }

    // Timestamp indicator
    const timestampIndicator = this.#buildTimestampIndicator();
    if (timestampIndicator) {
      parts.push(timestampIndicator);
    }

    // Combine parts and add prompt suffix
    return parts.join(' ') + stateColor('> ');
  }

  /**
   * Build a compact prompt (for narrow terminals)
   * @returns {string} Compact prompt string
   */
  buildCompact() {
    const stateColor = this.#getStateColor();
    const symbol = this.#getStateSymbol();

    let prefix = symbol;

    // Add mode letter
    if (this.#context.mode === 'yolo') {
      prefix += chalk.magenta('Y');
    } else if (this.#context.mode === 'quick') {
      prefix += chalk.yellow('Q');
    }

    // Add provider letter
    const provider = this.#context.forceProvider || this.#context.activeAgent;
    if (provider) {
      if (provider.toLowerCase() === 'ollama') {
        prefix += (this.#theme.colors.ollama || chalk.hex('#8b5cf6'))('O');
      } else if (provider.toLowerCase() === 'gemini') {
        prefix += (this.#theme.colors.gemini || chalk.hex('#22d3ee'))('G');
      }
    }

    return stateColor(`${prefix}> `);
  }

  /**
   * Get current context
   * @returns {PromptContext} Current context
   */
  getContext() {
    return { ...this.#context };
  }

  /**
   * Get configuration
   * @returns {PromptConfig} Current configuration
   */
  getConfig() {
    return { ...this.#config };
  }

  /**
   * Update configuration
   * @param {Partial<PromptConfig>} updates - Config updates
   */
  setConfig(updates) {
    this.#config = { ...this.#config, ...updates };
  }

  /**
   * Get theme
   * @returns {Object} Current theme
   */
  get theme() {
    return this.#theme;
  }

  /**
   * Set theme
   * @param {Object} theme - New theme
   */
  set theme(theme) {
    this.#theme = theme;
  }
}

/**
 * Create a new PromptBuilder instance
 * @param {Object} [theme] - Theme object
 * @param {PromptConfig} [config] - Configuration options
 * @returns {PromptBuilder} New prompt builder
 */
export function createPromptBuilder(theme, config) {
  return new PromptBuilder(theme, config);
}

export default PromptBuilder;
