/**
 * EnvironmentManager.ts - Feature #39: Environment Management
 *
 * Manages different environment configurations for development, staging, and production.
 * Features:
 * - Multiple environment support
 * - Variable inheritance between environments
 * - Secret management (redacted in exports)
 * - Environment file generation
 * - Persistence to disk
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

// ============================================================
// Types
// ============================================================

export interface EnvironmentConfig {
  name: string;
  variables: Record<string, string>;
  secrets: string[]; // Variable names that are secrets
  inherit?: string; // Parent environment to inherit from
  description?: string;
}

export interface EnvironmentManagerState {
  environments: Map<string, EnvironmentConfig>;
  current: string;
}

export interface EnvironmentValidationResult {
  isValid: boolean;
  missingVariables: string[];
  extraVariables: string[];
  warnings: string[];
}

// ============================================================
// EnvManager Class
// ============================================================

export class EnvManager {
  private environments: Map<string, EnvironmentConfig> = new Map();
  private current: string = 'development';
  private persistPath: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath || path.join(process.cwd(), '.gemini', 'environments.json');
  }

  /**
   * Initializes the environment manager, loading saved environments
   */
  async initialize(): Promise<void> {
    try {
      const data = await fs.readFile(this.persistPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.environments = new Map(Object.entries(parsed.environments || {}));
      this.current = parsed.current || 'development';
      console.log(chalk.gray(`[EnvManager] Loaded ${this.environments.size} environments`));
    } catch {
      // Create default environments
      this.createDefaultEnvironments();
    }
  }

  /**
   * Creates default development, staging, and production environments
   */
  private createDefaultEnvironments(): void {
    this.environments.set('development', {
      name: 'development',
      description: 'Local development environment',
      variables: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
        API_URL: 'http://localhost:3000',
        DEBUG: 'true',
      },
      secrets: ['API_KEY', 'DATABASE_URL'],
    });

    this.environments.set('staging', {
      name: 'staging',
      description: 'Staging/testing environment',
      variables: {
        NODE_ENV: 'staging',
        LOG_LEVEL: 'info',
        API_URL: 'https://staging.example.com',
        DEBUG: 'false',
      },
      secrets: ['API_KEY', 'DATABASE_URL'],
      inherit: 'development',
    });

    this.environments.set('production', {
      name: 'production',
      description: 'Production environment',
      variables: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'warn',
        API_URL: 'https://api.example.com',
        DEBUG: 'false',
      },
      secrets: ['API_KEY', 'DATABASE_URL', 'ENCRYPTION_KEY'],
    });

    console.log(chalk.gray('[EnvManager] Created default environments'));
  }

  /**
   * Creates a new environment
   * @param name - Environment name
   * @param config - Environment configuration
   * @returns Created environment configuration
   */
  createEnvironment(name: string, config: Partial<EnvironmentConfig>): EnvironmentConfig {
    const env: EnvironmentConfig = {
      name,
      variables: config.variables || {},
      secrets: config.secrets || [],
      inherit: config.inherit,
      description: config.description,
    };
    this.environments.set(name, env);
    console.log(chalk.cyan(`[EnvManager] Created environment: ${name}`));
    return env;
  }

  /**
   * Updates an existing environment
   * @param name - Environment name
   * @param updates - Partial configuration to update
   * @returns Updated environment or null if not found
   */
  updateEnvironment(name: string, updates: Partial<EnvironmentConfig>): EnvironmentConfig | null {
    const env = this.environments.get(name);
    if (!env) {
      console.log(chalk.red(`[EnvManager] Environment not found: ${name}`));
      return null;
    }

    const updated: EnvironmentConfig = {
      ...env,
      ...updates,
      name, // Preserve name
      variables: { ...env.variables, ...updates.variables },
      secrets: updates.secrets || env.secrets,
    };

    this.environments.set(name, updated);
    console.log(chalk.cyan(`[EnvManager] Updated environment: ${name}`));
    return updated;
  }

  /**
   * Deletes an environment
   * @param name - Environment name to delete
   * @returns True if deleted, false if not found
   */
  deleteEnvironment(name: string): boolean {
    if (!this.environments.has(name)) {
      console.log(chalk.red(`[EnvManager] Environment not found: ${name}`));
      return false;
    }

    // Don't delete if it's the current environment
    if (this.current === name) {
      console.log(chalk.red(`[EnvManager] Cannot delete current environment: ${name}`));
      return false;
    }

    this.environments.delete(name);
    console.log(chalk.yellow(`[EnvManager] Deleted environment: ${name}`));
    return true;
  }

  /**
   * Switches to a different environment
   * @param name - Environment name to switch to
   * @returns True if switched, false if not found
   */
  switchEnvironment(name: string): boolean {
    if (!this.environments.has(name)) {
      console.log(chalk.red(`[EnvManager] Environment not found: ${name}`));
      return false;
    }
    this.current = name;
    console.log(chalk.green(`[EnvManager] Switched to: ${name}`));
    return true;
  }

  /**
   * Gets the current environment name
   * @returns Current environment name
   */
  getCurrentEnvironment(): string {
    return this.current;
  }

  /**
   * Gets an environment configuration by name
   * @param name - Environment name (defaults to current)
   * @returns Environment configuration or undefined
   */
  getEnvironment(name?: string): EnvironmentConfig | undefined {
    return this.environments.get(name || this.current);
  }

  /**
   * Gets resolved variables for an environment (including inherited)
   * @param envName - Environment name (defaults to current)
   * @returns Resolved variables
   */
  getVariables(envName?: string): Record<string, string> {
    const name = envName || this.current;
    const env = this.environments.get(name);
    if (!env) return {};

    let variables = { ...env.variables };

    // Inherit from parent
    if (env.inherit) {
      const parent = this.getVariables(env.inherit);
      variables = { ...parent, ...variables };
    }

    return variables;
  }

  /**
   * Sets a variable in an environment
   * @param key - Variable name
   * @param value - Variable value
   * @param envName - Environment name (defaults to current)
   * @param isSecret - Whether this variable is a secret
   */
  setVariable(key: string, value: string, envName?: string, isSecret: boolean = false): void {
    const name = envName || this.current;
    const env = this.environments.get(name);
    if (!env) {
      console.log(chalk.red(`[EnvManager] Environment not found: ${name}`));
      return;
    }

    env.variables[key] = value;

    if (isSecret && !env.secrets.includes(key)) {
      env.secrets.push(key);
    }

    console.log(chalk.gray(`[EnvManager] Set ${key} in ${name}`));
  }

  /**
   * Removes a variable from an environment
   * @param key - Variable name to remove
   * @param envName - Environment name (defaults to current)
   */
  removeVariable(key: string, envName?: string): void {
    const name = envName || this.current;
    const env = this.environments.get(name);
    if (!env) return;

    delete env.variables[key];
    env.secrets = env.secrets.filter((s) => s !== key);
    console.log(chalk.gray(`[EnvManager] Removed ${key} from ${name}`));
  }

  /**
   * Generates an environment file (.env format)
   * @param envName - Environment name (defaults to current)
   * @param includeSecrets - Whether to include secret values (default: false)
   * @returns Environment file content as string
   */
  generateEnvFile(envName?: string, includeSecrets: boolean = false): string {
    const name = envName || this.current;
    const variables = this.getVariables(name);
    const env = this.environments.get(name);

    const lines: string[] = [];
    lines.push(`# Environment: ${name}`);
    if (env?.description) {
      lines.push(`# ${env.description}`);
    }
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push('');

    for (const [key, value] of Object.entries(variables)) {
      if (env?.secrets.includes(key) && !includeSecrets) {
        lines.push(`${key}=<REDACTED>`);
      } else {
        // Escape special characters in values
        const escapedValue =
          value.includes(' ') || value.includes('"') ? `"${value.replace(/"/g, '\\"')}"` : value;
        lines.push(`${key}=${escapedValue}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Validates an environment against required variables
   * @param envName - Environment name to validate
   * @param requiredVars - List of required variable names
   * @returns Validation result
   */
  validateEnvironment(envName: string, requiredVars: string[]): EnvironmentValidationResult {
    const variables = this.getVariables(envName);
    const varKeys = Object.keys(variables);

    const missingVariables = requiredVars.filter((v) => !varKeys.includes(v));
    const extraVariables = varKeys.filter((v) => !requiredVars.includes(v));
    const warnings: string[] = [];

    // Check for empty values
    for (const [key, value] of Object.entries(variables)) {
      if (!value || value.trim() === '') {
        warnings.push(`Variable ${key} has empty value`);
      }
    }

    return {
      isValid: missingVariables.length === 0,
      missingVariables,
      extraVariables,
      warnings,
    };
  }

  /**
   * Compares two environments
   * @param env1 - First environment name
   * @param env2 - Second environment name
   * @returns Comparison result
   */
  compareEnvironments(
    env1: string,
    env2: string,
  ): {
    common: string[];
    onlyInFirst: string[];
    onlyInSecond: string[];
    different: string[];
  } {
    const vars1 = this.getVariables(env1);
    const vars2 = this.getVariables(env2);
    const keys1 = Object.keys(vars1);
    const keys2 = Object.keys(vars2);

    const common = keys1.filter((k) => keys2.includes(k));
    const onlyInFirst = keys1.filter((k) => !keys2.includes(k));
    const onlyInSecond = keys2.filter((k) => !keys1.includes(k));
    const different = common.filter((k) => vars1[k] !== vars2[k]);

    return { common, onlyInFirst, onlyInSecond, different };
  }

  /**
   * Lists all environment names
   * @returns Array of environment names
   */
  listEnvironments(): string[] {
    return Array.from(this.environments.keys());
  }

  /**
   * Persists environments to disk
   */
  async persist(): Promise<void> {
    try {
      const dir = path.dirname(this.persistPath);
      await fs.mkdir(dir, { recursive: true });

      const data = {
        environments: Object.fromEntries(this.environments),
        current: this.current,
        lastSaved: Date.now(),
      };
      await fs.writeFile(this.persistPath, JSON.stringify(data, null, 2));
      console.log(chalk.gray('[EnvManager] Environments saved'));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`[EnvManager] Persist failed: ${msg}`));
    }
  }

  /**
   * Exports environment configuration to JSON
   * @param envName - Environment name
   * @param includeSecrets - Whether to include secret values
   * @returns JSON string
   */
  exportToJson(envName?: string, includeSecrets: boolean = false): string {
    const name = envName || this.current;
    const env = this.environments.get(name);
    if (!env) return '{}';

    const exported: Record<string, unknown> = {
      name: env.name,
      description: env.description,
      variables: {},
      inherit: env.inherit,
    };

    const variables = this.getVariables(name);
    const vars = exported.variables as Record<string, string>;
    for (const [key, value] of Object.entries(variables)) {
      if (env.secrets.includes(key) && !includeSecrets) {
        vars[key] = '<REDACTED>';
      } else {
        vars[key] = value;
      }
    }

    return JSON.stringify(exported, null, 2);
  }
}

// ============================================================
// Formatting Functions
// ============================================================

/**
 * Formats environment manager state for display
 * @param manager - EnvManager instance
 * @returns Formatted string for console output
 */
export function formatEnvironments(manager: EnvManager): string {
  const lines: string[] = [];
  const envs = manager.listEnvironments();
  const current = manager.getCurrentEnvironment();

  lines.push(chalk.cyan(`\n🌍 ENVIRONMENTS (${envs.length})`));
  lines.push(chalk.gray(`   Current: ${current}`));
  lines.push('');

  for (const envName of envs) {
    const env = manager.getEnvironment(envName);
    const isCurrent = envName === current;
    const marker = isCurrent ? chalk.green('► ') : '  ';
    const nameColor = isCurrent ? chalk.green : chalk.white;

    lines.push(`${marker}${nameColor(envName)}`);
    if (env?.description) {
      lines.push(chalk.gray(`     ${env.description}`));
    }
    if (env?.inherit) {
      lines.push(chalk.gray(`     Inherits from: ${env.inherit}`));
    }

    const vars = manager.getVariables(envName);
    const varCount = Object.keys(vars).length;
    const secretCount = env?.secrets.length || 0;
    lines.push(chalk.gray(`     Variables: ${varCount}, Secrets: ${secretCount}`));
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================
// Singleton Instance
// ============================================================

export const envManager = new EnvManager();

// ============================================================
// Default Export
// ============================================================

export default {
  EnvManager,
  envManager,
  formatEnvironments,
};
