/**
 * @deprecated This file is a backward-compatibility shim.
 * All functionality has been modularized into src/core/models/.
 *
 * For new code, import directly from './models/index.js' instead.
 * This re-export file will be removed in a future version.
 *
 * @module ModelIntelligence
 */

// Re-export everything from the modular models subpackage
export * from './models/index.js';

// Re-export default for backward compatibility
export { default } from './models/index.js';
