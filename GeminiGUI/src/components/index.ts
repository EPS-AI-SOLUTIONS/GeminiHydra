/**
 * GeminiGUI - Components Barrel Export
 * @module components
 *
 * Main component exports for the application.
 */

// Main Layout Components
export { ChatContainer } from './ChatContainer';
export { SessionSidebar } from './SessionSidebar';
export { RightSidebar } from './RightSidebar';
export { SettingsModal } from './SettingsModal';
export { StatusFooter } from './StatusFooter';

// Feature Components
export { MemoryPanel } from './MemoryPanel';
export { BridgePanel } from './BridgePanel';

// Utility Components
export { CodeBlock } from './CodeBlock';
export { ErrorBoundary } from './ErrorBoundary';
export { SuspenseFallback } from './SuspenseFallback';

// Lazy Components (Code Splitting)
export {
  SettingsModalLazy,
  MemoryPanelLazy,
  BridgePanelLazy,
  ShortcutsModalLazy,
  ErrorBoundaryLazy,
  LazyComponentWrapper,
  WithSuspense,
} from './LazyComponents';

// UI Components
export { Button } from './ui';

// Chat Components
export { MessageList, ChatInput, ModelSelector, DragDropZone } from './chat';
