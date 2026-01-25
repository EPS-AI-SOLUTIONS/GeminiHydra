/**
 * GeminiGUI - UI Components Barrel Export
 * @module components/ui
 *
 * Atomic UI components for the application.
 * All UI components are centrally exported from this file.
 *
 * Usage:
 *   import { Button, Skeleton, Toast } from '@/components/ui';
 *   import type { ButtonProps, ToastProps } from '@/components/ui';
 */

// ============================================================================
// BUTTON COMPONENT
// ============================================================================

export { Button, default as ButtonDefault } from './Button';
export type { ButtonProps } from './Button';

// ============================================================================
// SKELETON COMPONENTS (Loading States)
// ============================================================================

export {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonMessage,
} from './Skeleton';

export type {
  SkeletonBaseProps,
  SkeletonTextProps,
  SkeletonAvatarProps,
  SkeletonCardProps,
  SkeletonMessageProps,
} from './Skeleton';

