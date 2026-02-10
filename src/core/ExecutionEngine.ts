/**
 * @deprecated This file is a backward-compatibility shim.
 * All functionality has been modularized into src/core/execution/.
 *
 * For new code, import directly from './execution/index.js' instead.
 * This re-export file will be removed in a future version.
 *
 * @module ExecutionEngine
 */

// Re-export everything from the modular execution subpackage
export * from './execution/index.js';

// Re-export default for backward compatibility
export { default } from './execution/index.js';
