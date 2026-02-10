/**
 * MultiModal Types - Core type definitions for multi-modal support
 *
 * @module multimodal/types
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/** Supported content types */
export type ContentType = 'text' | 'image' | 'audio' | 'video' | 'document';

// ============================================================================
// INPUT INTERFACES
// ============================================================================

/** Image input sources */
export interface ImageInput {
  source: 'base64' | 'url' | 'file';
  data: string;
  mimeType?: string;
  altText?: string;
  dimensions?: { width: number; height: number };
  metadata?: Record<string, any>;
}

/** Audio input (preparation for Gemini Audio API) */
export interface AudioInput {
  source: 'base64' | 'url' | 'file';
  data: string;
  mimeType?: string;
  duration?: number;
  sampleRate?: number;
  channels?: number;
  language?: string;
  metadata?: Record<string, any>;
}

/** Video input with frame extraction support */
export interface VideoInput {
  source: 'base64' | 'url' | 'file';
  data: string;
  mimeType?: string;
  duration?: number;
  frameRate?: number;
  resolution?: { width: number; height: number };
  extractFramesAt?: number[];
  extractFramesEvery?: number;
  maxFrames?: number;
  metadata?: Record<string, any>;
}

/** Document input (PDF, DOCX, etc.) */
export interface DocumentInput {
  source: 'base64' | 'url' | 'file';
  data: string;
  mimeType?: string;
  title?: string;
  pageRange?: { start: number; end: number };
  metadata?: Record<string, any>;
}

// ============================================================================
// CONTENT & PROMPT INTERFACES
// ============================================================================

/** Multi-modal content container */
export interface MultiModalContent {
  type: ContentType;
  data: string;
  mimeType: string;
  description?: string;
  role?: 'user' | 'model';
  options?: {
    resize?: { maxWidth: number; maxHeight: number };
    convert?: boolean;
    keyframesOnly?: boolean;
  };
  metadata?: Record<string, any>;
}

/** Mixed content prompt structure */
export interface MixedContentPrompt {
  systemInstruction?: string;
  parts: MultiModalContent[];
  prompt: string;
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
}

// ============================================================================
// RESULT INTERFACES
// ============================================================================

/** Analysis result structure */
export interface AnalysisResult {
  text: string;
  structured?: Record<string, any>;
  confidence?: number;
  metadata: {
    model: string;
    contentTypes: ContentType[];
    totalInputTokens?: number;
    totalOutputTokens?: number;
    processingTimeMs: number;
  };
}

/** Screenshot analysis result for debug loop */
export interface ScreenshotAnalysis {
  description: string;
  errors: ErrorDetection[];
  uiElements: UIElement[];
  suggestions: FixSuggestion[];
  codeSnippets: CodeSnippet[];
  healthScore: number;
  rawResponse: string;
}

export interface ErrorDetection {
  type: 'error' | 'warning' | 'info';
  message: string;
  location?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  possibleCause?: string;
}

export interface UIElement {
  type: string;
  label?: string;
  state: 'normal' | 'error' | 'disabled' | 'loading' | 'active';
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface FixSuggestion {
  priority: number;
  description: string;
  targetFile?: string;
  codeChange?: string;
  confidence: number;
}

export interface CodeSnippet {
  language?: string;
  code: string;
  lineNumbers?: { start: number; end: number };
  hasError: boolean;
  errorDescription?: string;
}

// ============================================================================
// MCP 2026 MULTIMODAL INTERFACES (Preparation)
// ============================================================================

/** MCP Resource with multimodal support */
export interface MCPMultiModalResource {
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
  contentType: ContentType;
  size?: number;
  lastModified?: Date;
  annotations?: {
    audience?: string[];
    priority?: number;
    tags?: string[];
  };
}

/** MCP Resource content with binary support */
export interface MCPResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;
  embedded?: MCPResourceContent[];
}

/** MCP Tool input with multimodal support */
export interface MCPMultiModalToolInput {
  text?: string;
  images?: ImageInput[];
  audio?: AudioInput[];
  video?: VideoInput[];
  documents?: DocumentInput[];
}
