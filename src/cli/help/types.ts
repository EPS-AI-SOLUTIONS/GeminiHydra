/**
 * Help System Types - Type definitions for the CLI help system
 *
 * @module help/types
 */

/** Extended command definition with examples */
export interface CommandExample {
  command: string;
  description: string;
  output?: string;
}

/** Extended command metadata for help system */
export interface CommandHelpMeta {
  name: string;
  examples?: CommandExample[];
  notes?: string[];
  seeAlso?: string[];
  sinceVersion?: string;
  deprecated?: boolean;
  deprecatedMessage?: string;
}

/** Category display configuration */
export interface CategoryConfig {
  name: string;
  displayName: string;
  description: string;
  icon: string;
  order: number;
}

/** Help export format */
export type ExportFormat = 'markdown' | 'json' | 'html';
