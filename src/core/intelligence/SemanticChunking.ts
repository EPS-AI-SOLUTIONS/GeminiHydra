/**
 * SemanticChunking - Advanced intelligent text segmentation for context management
 *
 * Features:
 * - Semantic boundary detection (sentences, paragraphs, sections)
 * - Hierarchical chunking (3 levels: sections > paragraphs > sentences)
 * - Overlap handling with sliding windows
 * - Code-aware chunking with language detection
 * - Importance-based chunking with query relevance
 * - Integration with ContextManager
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import { GEMINI_MODELS } from '../../config/models.config.js';
import { geminiSemaphore } from '../TrafficControl.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const INTELLIGENCE_MODEL = GEMINI_MODELS.FLASH;

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

/**
 * Types of semantic boundaries in text
 */
export type BoundaryType =
  | 'section' // Major section/chapter break (##, ---, ===)
  | 'paragraph' // Paragraph break (double newline)
  | 'sentence' // Sentence end (. ! ?)
  | 'clause' // Clause separator (, ; :)
  | 'code_block' // Code block boundary (```)
  | 'function' // Function/method boundary
  | 'class' // Class/interface boundary
  | 'import' // Import/module boundary
  | 'list_item' // List item boundary
  | 'none'; // No natural boundary

/**
 * Represents a detected boundary in text
 */
export interface ChunkBoundary {
  position: number;
  type: BoundaryType;
  strength: number; // 0-1, higher = stronger boundary
  context: string; // Surrounding text for debugging
}

/**
 * Hierarchical level for chunking
 */
export type HierarchyLevel = 'section' | 'paragraph' | 'sentence';

/**
 * Chunk type based on content analysis
 */
export type ChunkType =
  | 'introduction'
  | 'definition'
  | 'explanation'
  | 'example'
  | 'code'
  | 'conclusion'
  | 'list'
  | 'table'
  | 'header'
  | 'general';

/**
 * Supported programming languages for code-aware chunking
 */
export type ProgrammingLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'java'
  | 'csharp'
  | 'cpp'
  | 'go'
  | 'rust'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'scala'
  | 'html'
  | 'css'
  | 'sql'
  | 'shell'
  | 'powershell'
  | 'markdown'
  | 'unknown';

/**
 * A semantic chunk with metadata
 */
export interface SemanticChunk {
  id: string;
  content: string;
  summary: string;
  keywords: string[];
  importance: number; // 0-1
  type: ChunkType;
  hierarchyLevel: HierarchyLevel;
  startPosition: number;
  endPosition: number;
  overlapBefore?: string; // Context from previous chunk
  overlapAfter?: string; // Context for next chunk
  parentId?: string; // Parent chunk ID for hierarchy
  childIds?: string[]; // Child chunk IDs
  codeLanguage?: ProgrammingLanguage;
  codeSymbol?: string; // Function/class name if code
}

/**
 * Result of semantic chunking operation
 */
export interface ChunkingResult {
  originalLength: number;
  chunks: SemanticChunk[];
  totalChunks: number;
  avgChunkSize: number;
  semanticMap: Map<string, string[]>; // keyword -> chunk IDs
  hierarchy: ChunkHierarchy;
  boundaries: ChunkBoundary[];
}

/**
 * Hierarchical structure of chunks
 */
export interface ChunkHierarchy {
  sections: SemanticChunk[];
  paragraphs: SemanticChunk[];
  sentences: SemanticChunk[];
}

/**
 * Options for semantic chunking
 */
export interface ChunkingOptions {
  maxChunkSize?: number;
  minChunkSize?: number;
  overlapSize?: number;
  preserveCodeBlocks?: boolean;
  hierarchical?: boolean;
  language?: ProgrammingLanguage;
  importanceThreshold?: number;
}

/**
 * Code symbol (function, class, etc.)
 */
interface CodeSymbol {
  name: string;
  type: 'function' | 'class' | 'interface' | 'method' | 'variable' | 'import';
  startLine: number;
  endLine: number;
  content: string;
}

// =============================================================================
// BOUNDARY DETECTION
// =============================================================================

/**
 * Detect all semantic boundaries in text
 */
export function detectSemanticBoundaries(text: string): ChunkBoundary[] {
  const boundaries: ChunkBoundary[] = [];

  // Section boundaries (headers, separators)
  const sectionPatterns = [
    { regex: /\n#{1,6}\s+[^\n]+/g, strength: 1.0 }, // Markdown headers
    { regex: /\n[-=]{3,}\n/g, strength: 0.95 }, // Horizontal rules
    { regex: /\n\*{3,}\n/g, strength: 0.9 }, // Asterisk separators
    { regex: /\n(?=Chapter|Section|Part)\s+/gi, strength: 0.95 }, // Named sections
    { regex: /\n(?=Rozdzia[l\u0142]|Sekcja|Cz[e\u0119][s\u015b][c\u0107])\s+/gi, strength: 0.95 }, // Polish sections
  ];

  for (const { regex, strength } of sectionPatterns) {
    for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
      boundaries.push({
        position: match.index,
        type: 'section',
        strength,
        context: text.substring(Math.max(0, match.index - 20), match.index + 50),
      });
    }
  }

  // Paragraph boundaries (double newline)
  const paragraphRegex = /\n\s*\n/g;
  for (let match = paragraphRegex.exec(text); match !== null; match = paragraphRegex.exec(text)) {
    boundaries.push({
      position: match.index,
      type: 'paragraph',
      strength: 0.7,
      context: text.substring(Math.max(0, match.index - 20), match.index + 30),
    });
  }

  // Sentence boundaries
  const sentenceRegex = /[.!?]+(?:\s+|$)(?=[A-Z\u0080-\u024F]|\s*$)/g;
  for (let match = sentenceRegex.exec(text); match !== null; match = sentenceRegex.exec(text)) {
    boundaries.push({
      position: match.index + match[0].length,
      type: 'sentence',
      strength: 0.5,
      context: text.substring(Math.max(0, match.index - 10), match.index + 30),
    });
  }

  // Code block boundaries
  const codeBlockRegex = /```[\s\S]*?```/g;
  for (let match = codeBlockRegex.exec(text); match !== null; match = codeBlockRegex.exec(text)) {
    boundaries.push({
      position: match.index,
      type: 'code_block',
      strength: 0.85,
      context: text.substring(match.index, Math.min(text.length, match.index + 50)),
    });
    boundaries.push({
      position: match.index + match[0].length,
      type: 'code_block',
      strength: 0.85,
      context: text.substring(
        Math.max(0, match.index + match[0].length - 20),
        match.index + match[0].length + 20,
      ),
    });
  }

  // List item boundaries
  const listItemRegex = /\n\s*(?:[-*+]|\d+\.)\s+/g;
  for (let match = listItemRegex.exec(text); match !== null; match = listItemRegex.exec(text)) {
    boundaries.push({
      position: match.index,
      type: 'list_item',
      strength: 0.4,
      context: text.substring(match.index, Math.min(text.length, match.index + 40)),
    });
  }

  // Sort by position
  boundaries.sort((a, b) => a.position - b.position);

  // Remove duplicates (same position, keep highest strength)
  const deduped: ChunkBoundary[] = [];
  for (const boundary of boundaries) {
    const existing = deduped.find((b) => Math.abs(b.position - boundary.position) < 5);
    if (existing) {
      if (boundary.strength > existing.strength) {
        existing.type = boundary.type;
        existing.strength = boundary.strength;
      }
    } else {
      deduped.push(boundary);
    }
  }

  return deduped;
}

/**
 * Find the best boundary near a position
 */
function findBestBoundary(
  boundaries: ChunkBoundary[],
  targetPosition: number,
  searchRange: number = 200,
): ChunkBoundary | null {
  const candidates = boundaries.filter((b) => Math.abs(b.position - targetPosition) <= searchRange);

  if (candidates.length === 0) return null;

  // Score candidates by: strength * proximity
  const scored = candidates.map((b) => ({
    boundary: b,
    score: b.strength * (1 - Math.abs(b.position - targetPosition) / searchRange),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0].boundary;
}

// =============================================================================
// CODE-AWARE CHUNKING
// =============================================================================

/**
 * Detect programming language from code content
 */
export function detectLanguage(code: string): ProgrammingLanguage {
  const patterns: [RegExp, ProgrammingLanguage][] = [
    [/^(import|export)\s+.*from\s+['"]|interface\s+\w+\s*\{|type\s+\w+\s*=/m, 'typescript'],
    [/^(const|let|var)\s+\w+\s*=|function\s+\w+\s*\(|=>\s*\{/m, 'javascript'],
    [/^(def|class|import|from)\s+\w+|if\s+__name__\s*==\s*['"]__main__['"]/m, 'python'],
    [/^(public|private|protected)\s+(class|interface|void|static)|System\.(out|in)\./m, 'java'],
    [/^(using|namespace|public|private)\s+\w+|Console\.(Write|Read)/m, 'csharp'],
    [/^#include\s*<|int\s+main\s*\(|std::/m, 'cpp'],
    [/^(package|func|type)\s+\w+|fmt\.(Print|Scan)/m, 'go'],
    [/^(fn|impl|struct|enum|use|mod)\s+\w+|println!\s*\(/m, 'rust'],
    [/^(class|def|module|require)\s+\w+|puts\s+/m, 'ruby'],
    [/^<\?php|\$\w+\s*=|function\s+\w+\s*\(/m, 'php'],
    [/^(func|class|struct|import)\s+\w+|print\s*\(/m, 'swift'],
    [/^(fun|class|interface|object)\s+\w+|println\s*\(/m, 'kotlin'],
    [/^(object|class|trait|def)\s+\w+|println\s*\(/m, 'scala'],
    [/^<(!DOCTYPE|html|head|body|div|span)/im, 'html'],
    [/^(@import|@media|\.[\w-]+\s*\{|#[\w-]+\s*\{)/m, 'css'],
    [/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\s+/im, 'sql'],
    [/^#!/m, 'shell'],
    [/^\$\w+\s*=|function\s+\w+\s*\{|Write-Host/m, 'powershell'],
    [/^#{1,6}\s+|^\*{1,3}[^*]|\[.*\]\(.*\)/m, 'markdown'],
  ];

  for (const [pattern, lang] of patterns) {
    if (pattern.test(code)) {
      return lang;
    }
  }

  return 'unknown';
}

/**
 * Extract code symbols (functions, classes) from code
 */
function extractCodeSymbols(code: string, language: ProgrammingLanguage): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  const lines = code.split('\n');

  const patterns: Record<string, { functions: RegExp; classes: RegExp; interfaces?: RegExp }> = {
    typescript: {
      functions:
        /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/,
      classes: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
      interfaces: /^(?:export\s+)?interface\s+(\w+)/,
    },
    javascript: {
      functions: /^(?:async\s+)?function\s+(\w+)|^(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/,
      classes: /^class\s+(\w+)/,
    },
    python: {
      functions: /^def\s+(\w+)\s*\(/,
      classes: /^class\s+(\w+)/,
    },
    java: {
      functions: /^(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(/,
      classes: /^(?:public|private)?\s*(?:abstract\s+)?class\s+(\w+)/,
      interfaces: /^(?:public\s+)?interface\s+(\w+)/,
    },
    csharp: {
      functions:
        /^(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?(?:\w+\s+)+(\w+)\s*\(/,
      classes: /^(?:public|private|internal)?\s*(?:abstract|sealed)?\s*class\s+(\w+)/,
      interfaces: /^(?:public\s+)?interface\s+(\w+)/,
    },
    go: {
      functions: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/,
      classes: /^type\s+(\w+)\s+struct/,
      interfaces: /^type\s+(\w+)\s+interface/,
    },
    rust: {
      functions: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,
      classes: /^(?:pub\s+)?struct\s+(\w+)/,
      interfaces: /^(?:pub\s+)?trait\s+(\w+)/,
    },
  };

  const langPatterns = patterns[language] || patterns.typescript;

  let currentFunction: { name: string; startLine: number; braceCount: number } | null = null;
  let currentClass: { name: string; startLine: number; braceCount: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Track brace depth for function/class end detection
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;

    // Check for function start
    const funcMatch = line.match(langPatterns.functions);
    if (funcMatch) {
      const name = funcMatch[1] || funcMatch[2];
      if (name) {
        currentFunction = { name, startLine: i, braceCount: openBraces - closeBraces };
      }
    }

    // Check for class start
    const classMatch = line.match(langPatterns.classes);
    if (classMatch?.[1]) {
      currentClass = { name: classMatch[1], startLine: i, braceCount: openBraces - closeBraces };
    }

    // Check for interface start
    if (langPatterns.interfaces) {
      const ifaceMatch = line.match(langPatterns.interfaces);
      if (ifaceMatch?.[1]) {
        symbols.push({
          name: ifaceMatch[1],
          type: 'interface',
          startLine: i,
          endLine: i, // Will be updated when we track end
          content: line,
        });
      }
    }

    // Update brace counts and check for ends
    if (currentFunction) {
      currentFunction.braceCount += openBraces - closeBraces;
      if (currentFunction.braceCount <= 0 || (i > currentFunction.startLine && line === '}')) {
        symbols.push({
          name: currentFunction.name,
          type: 'function',
          startLine: currentFunction.startLine,
          endLine: i,
          content: lines.slice(currentFunction.startLine, i + 1).join('\n'),
        });
        currentFunction = null;
      }
    }

    if (currentClass) {
      currentClass.braceCount += openBraces - closeBraces;
      if (currentClass.braceCount <= 0 && i > currentClass.startLine) {
        symbols.push({
          name: currentClass.name,
          type: 'class',
          startLine: currentClass.startLine,
          endLine: i,
          content: lines.slice(currentClass.startLine, i + 1).join('\n'),
        });
        currentClass = null;
      }
    }
  }

  // Handle unclosed symbols
  if (currentFunction) {
    symbols.push({
      name: currentFunction.name,
      type: 'function',
      startLine: currentFunction.startLine,
      endLine: lines.length - 1,
      content: lines.slice(currentFunction.startLine).join('\n'),
    });
  }

  if (currentClass) {
    symbols.push({
      name: currentClass.name,
      type: 'class',
      startLine: currentClass.startLine,
      endLine: lines.length - 1,
      content: lines.slice(currentClass.startLine).join('\n'),
    });
  }

  return symbols;
}

/**
 * Create code-aware chunks that respect function/class boundaries
 */
export function createCodeAwareChunks(
  code: string,
  language?: ProgrammingLanguage,
  options: ChunkingOptions = {},
): SemanticChunk[] {
  const { maxChunkSize = 3000, minChunkSize = 100, overlapSize = 50 } = options;

  const detectedLang = language || detectLanguage(code);
  const symbols = extractCodeSymbols(code, detectedLang);
  const chunks: SemanticChunk[] = [];
  const lines = code.split('\n');

  console.log(
    chalk.magenta(
      `[SemanticChunk] Code-aware chunking (${detectedLang}), found ${symbols.length} symbols`,
    ),
  );

  // If no symbols found, fall back to line-based chunking
  if (symbols.length === 0) {
    return createLineBasedChunks(code, maxChunkSize, minChunkSize, overlapSize, detectedLang);
  }

  // Sort symbols by start line
  symbols.sort((a, b) => a.startLine - b.startLine);

  let chunkId = 0;
  let currentChunkContent = '';
  let currentChunkStart = 0;
  let currentSymbols: string[] = [];

  // Add imports/headers as first chunk if present
  const firstSymbolLine = symbols[0]?.startLine || 0;
  if (firstSymbolLine > 0) {
    const header = lines.slice(0, firstSymbolLine).join('\n').trim();
    if (header.length >= minChunkSize) {
      chunks.push(createCodeChunk(header, chunkId++, 0, detectedLang, 'imports'));
    } else {
      currentChunkContent = `${header}\n`;
      currentChunkStart = 0;
    }
  }

  // Process each symbol
  for (const symbol of symbols) {
    const symbolContent = symbol.content;

    // If adding this symbol would exceed max size, finalize current chunk
    if (
      currentChunkContent.length + symbolContent.length > maxChunkSize &&
      currentChunkContent.length >= minChunkSize
    ) {
      chunks.push(
        createCodeChunk(
          currentChunkContent.trim(),
          chunkId++,
          currentChunkStart,
          detectedLang,
          currentSymbols.join(', '),
        ),
      );

      // Keep overlap
      const overlapContent = currentChunkContent.slice(-overlapSize);
      currentChunkContent = overlapContent;
      currentChunkStart = chunks[chunks.length - 1].endPosition - overlapSize;
      currentSymbols = [];
    }

    currentChunkContent += `${symbolContent}\n\n`;
    currentSymbols.push(`${symbol.type}:${symbol.name}`);
  }

  // Don't forget last chunk
  if (currentChunkContent.trim().length >= minChunkSize) {
    chunks.push(
      createCodeChunk(
        currentChunkContent.trim(),
        chunkId++,
        currentChunkStart,
        detectedLang,
        currentSymbols.join(', '),
      ),
    );
  }

  // Add overlaps between chunks
  for (let i = 0; i < chunks.length - 1; i++) {
    chunks[i].overlapAfter = chunks[i + 1].content.substring(0, overlapSize);
    chunks[i + 1].overlapBefore = chunks[i].content.slice(-overlapSize);
  }

  return chunks;
}

/**
 * Create line-based chunks for code without clear symbols
 */
function createLineBasedChunks(
  code: string,
  maxChunkSize: number,
  minChunkSize: number,
  overlapSize: number,
  language: ProgrammingLanguage,
): SemanticChunk[] {
  const chunks: SemanticChunk[] = [];
  const lines = code.split('\n');
  let chunkId = 0;
  let currentChunk = '';
  let startPosition = 0;

  for (const line of lines) {
    if (
      currentChunk.length + line.length + 1 > maxChunkSize &&
      currentChunk.length >= minChunkSize
    ) {
      chunks.push(createCodeChunk(currentChunk.trim(), chunkId++, startPosition, language));

      // Keep overlap
      const overlap = currentChunk.slice(-overlapSize);
      startPosition += currentChunk.length - overlapSize;
      currentChunk = overlap;
    }
    currentChunk += `${line}\n`;
  }

  if (currentChunk.trim().length >= minChunkSize) {
    chunks.push(createCodeChunk(currentChunk.trim(), chunkId, startPosition, language));
  }

  return chunks;
}

/**
 * Create a code chunk with proper metadata
 */
function createCodeChunk(
  content: string,
  index: number,
  startPosition: number,
  language: ProgrammingLanguage,
  symbolName?: string,
): SemanticChunk {
  const keywords = extractKeywords(content);

  return {
    id: `code-chunk-${index}`,
    content,
    summary: symbolName
      ? `Code: ${symbolName}`
      : `${content.substring(0, 80).replace(/\n/g, ' ')}...`,
    keywords,
    importance: 0.85, // Code is generally important
    type: 'code',
    hierarchyLevel: 'paragraph',
    startPosition,
    endPosition: startPosition + content.length,
    codeLanguage: language,
    codeSymbol: symbolName,
  };
}

// =============================================================================
// HIERARCHICAL CHUNKING
// =============================================================================

/**
 * Create hierarchical chunks at multiple levels
 */
export function createHierarchicalChunks(
  text: string,
  options: ChunkingOptions = {},
): ChunkHierarchy {
  const { maxChunkSize = 2000, minChunkSize = 100 } = options;

  console.log(chalk.magenta('[SemanticChunk] Creating hierarchical chunks...'));

  const boundaries = detectSemanticBoundaries(text);

  // Level 1: Sections
  const sectionBoundaries = boundaries.filter((b) => b.type === 'section');
  const sections = splitByBoundaries(text, sectionBoundaries, 'section', maxChunkSize * 3);

  // Level 2: Paragraphs (within sections or standalone)
  const paragraphBoundaries = boundaries.filter(
    (b) => b.type === 'paragraph' || b.type === 'code_block',
  );
  const paragraphs = splitByBoundaries(text, paragraphBoundaries, 'paragraph', maxChunkSize);

  // Level 3: Sentences
  const sentenceBoundaries = boundaries.filter((b) => b.type === 'sentence');
  const sentences = splitByBoundaries(text, sentenceBoundaries, 'sentence', minChunkSize * 3);

  // Establish parent-child relationships
  linkHierarchy(sections, paragraphs, sentences);

  console.log(
    chalk.green(
      `[SemanticChunk] Hierarchy: ${sections.length} sections, ${paragraphs.length} paragraphs, ${sentences.length} sentences`,
    ),
  );

  return { sections, paragraphs, sentences };
}

/**
 * Split text by boundaries at a given level
 */
function splitByBoundaries(
  text: string,
  boundaries: ChunkBoundary[],
  level: HierarchyLevel,
  maxSize: number,
): SemanticChunk[] {
  const chunks: SemanticChunk[] = [];
  let chunkId = 0;
  let lastPosition = 0;

  for (const boundary of boundaries) {
    if (boundary.position > lastPosition) {
      const content = text.substring(lastPosition, boundary.position).trim();
      if (content.length > 0) {
        // Split further if too large
        const subChunks = splitLargeContent(content, maxSize, level, chunkId, lastPosition);
        chunks.push(...subChunks);
        chunkId += subChunks.length;
      }
    }
    lastPosition = boundary.position;
  }

  // Handle remaining text
  if (lastPosition < text.length) {
    const content = text.substring(lastPosition).trim();
    if (content.length > 0) {
      const subChunks = splitLargeContent(content, maxSize, level, chunkId, lastPosition);
      chunks.push(...subChunks);
    }
  }

  return chunks;
}

/**
 * Split content that's too large into smaller chunks
 */
function splitLargeContent(
  content: string,
  maxSize: number,
  level: HierarchyLevel,
  startId: number,
  startPosition: number,
): SemanticChunk[] {
  if (content.length <= maxSize) {
    return [createTextChunk(content, `${level}-${startId}`, startPosition, level)];
  }

  const chunks: SemanticChunk[] = [];
  let remaining = content;
  let id = startId;
  let position = startPosition;

  while (remaining.length > 0) {
    let splitPoint = maxSize;

    // Try to split at natural boundaries
    if (remaining.length > maxSize) {
      // Try sentence boundary
      const sentenceEnd = remaining.substring(0, maxSize).lastIndexOf('. ');
      if (sentenceEnd > maxSize / 2) {
        splitPoint = sentenceEnd + 2;
      } else {
        // Try word boundary
        const wordEnd = remaining.substring(0, maxSize).lastIndexOf(' ');
        if (wordEnd > maxSize / 2) {
          splitPoint = wordEnd + 1;
        }
      }
    }

    const chunk = remaining.substring(0, splitPoint).trim();
    if (chunk.length > 0) {
      chunks.push(createTextChunk(chunk, `${level}-${id}`, position, level));
      id++;
    }

    position += splitPoint;
    remaining = remaining.substring(splitPoint).trim();
  }

  return chunks;
}

/**
 * Link hierarchy between levels
 */
function linkHierarchy(
  sections: SemanticChunk[],
  paragraphs: SemanticChunk[],
  sentences: SemanticChunk[],
): void {
  // Link paragraphs to sections
  for (const paragraph of paragraphs) {
    const parent = sections.find(
      (s) => paragraph.startPosition >= s.startPosition && paragraph.endPosition <= s.endPosition,
    );
    if (parent) {
      paragraph.parentId = parent.id;
      if (!parent.childIds) parent.childIds = [];
      parent.childIds.push(paragraph.id);
    }
  }

  // Link sentences to paragraphs
  for (const sentence of sentences) {
    const parent = paragraphs.find(
      (p) => sentence.startPosition >= p.startPosition && sentence.endPosition <= p.endPosition,
    );
    if (parent) {
      sentence.parentId = parent.id;
      if (!parent.childIds) parent.childIds = [];
      parent.childIds.push(sentence.id);
    }
  }
}

// =============================================================================
// SEMANTIC CHUNKING (MAIN FUNCTION)
// =============================================================================

/**
 * Main function to create semantic chunks with all features
 */
export function createSemanticChunks(text: string, options: ChunkingOptions = {}): ChunkingResult {
  const {
    maxChunkSize = 2000,
    minChunkSize = 200,
    overlapSize = 100,
    preserveCodeBlocks = true,
    hierarchical = true,
  } = options;

  console.log(chalk.magenta('[SemanticChunk] Starting semantic chunking...'));

  // Detect all boundaries
  const boundaries = detectSemanticBoundaries(text);

  // Check for code content
  const isCode = detectLanguage(text) !== 'unknown' || /```[\s\S]+```/.test(text);

  let chunks: SemanticChunk[];
  let hierarchy: ChunkHierarchy;

  if (isCode && !text.includes('```')) {
    // Pure code file
    chunks = createCodeAwareChunks(text, undefined, options);
    hierarchy = { sections: [], paragraphs: chunks, sentences: [] };
  } else if (preserveCodeBlocks) {
    // Mixed content - handle code blocks specially
    chunks = createMixedContentChunks(text, boundaries, options);
    hierarchy = createHierarchicalChunks(text, options);
  } else if (hierarchical) {
    // Use hierarchical chunking
    hierarchy = createHierarchicalChunks(text, options);
    chunks = [...hierarchy.paragraphs]; // Use paragraphs as main chunks
  } else {
    // Simple semantic chunking
    chunks = createSimpleChunks(text, boundaries, maxChunkSize, minChunkSize, overlapSize);
    hierarchy = { sections: [], paragraphs: chunks, sentences: [] };
  }

  // Build semantic map
  const semanticMap = buildSemanticMap(chunks);

  console.log(chalk.green(`[SemanticChunk] Created ${chunks.length} chunks`));

  return {
    originalLength: text.length,
    chunks,
    totalChunks: chunks.length,
    avgChunkSize: chunks.reduce((sum, c) => sum + c.content.length, 0) / Math.max(chunks.length, 1),
    semanticMap,
    hierarchy,
    boundaries,
  };
}

/**
 * Handle mixed content (text + code blocks)
 */
function createMixedContentChunks(
  text: string,
  boundaries: ChunkBoundary[],
  options: ChunkingOptions,
): SemanticChunk[] {
  const chunks: SemanticChunk[] = [];
  let chunkId = 0;

  // Find code blocks
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastEnd = 0;

  for (let match = codeBlockRegex.exec(text); match !== null; match = codeBlockRegex.exec(text)) {
    const currentMatch = match; // Capture for closure
    // Process text before code block
    if (currentMatch.index > lastEnd) {
      const textContent = text.substring(lastEnd, currentMatch.index);
      const textChunks = createSimpleChunks(
        textContent,
        boundaries.filter((b) => b.position >= lastEnd && b.position < currentMatch.index),
        options.maxChunkSize || 2000,
        options.minChunkSize || 200,
        options.overlapSize || 100,
        chunkId,
        lastEnd,
      );
      chunks.push(...textChunks);
      chunkId += textChunks.length;
    }

    // Process code block
    const language = (currentMatch[1] as ProgrammingLanguage) || detectLanguage(currentMatch[2]);
    const codeContent = currentMatch[2];
    const codeChunks = createCodeAwareChunks(codeContent, language, options);

    // Adjust positions and IDs
    for (const chunk of codeChunks) {
      chunk.id = `chunk-${chunkId++}`;
      chunk.startPosition += match.index;
      chunk.endPosition += match.index;
    }

    chunks.push(...codeChunks);
    lastEnd = match.index + match[0].length;
  }

  // Process remaining text
  if (lastEnd < text.length) {
    const textContent = text.substring(lastEnd);
    const textChunks = createSimpleChunks(
      textContent,
      boundaries.filter((b) => b.position >= lastEnd),
      options.maxChunkSize || 2000,
      options.minChunkSize || 200,
      options.overlapSize || 100,
      chunkId,
      lastEnd,
    );
    chunks.push(...textChunks);
  }

  return chunks;
}

/**
 * Create simple semantic chunks (boundary-aware)
 */
function createSimpleChunks(
  text: string,
  boundaries: ChunkBoundary[],
  maxChunkSize: number,
  minChunkSize: number,
  overlapSize: number,
  startId: number = 0,
  startOffset: number = 0,
): SemanticChunk[] {
  const chunks: SemanticChunk[] = [];
  let currentChunk = '';
  let chunkStart = startOffset;
  let chunkId = startId;

  // Split by highest-strength boundaries first
  const sortedBoundaries = [...boundaries].sort((a, b) => b.strength - a.strength);

  const _position = 0;
  for (let i = 0; i < text.length; i++) {
    currentChunk += text[i];

    // Check if we should split
    if (currentChunk.length >= maxChunkSize) {
      // Find best boundary near current position
      const nearbyBoundary = findBestBoundary(
        sortedBoundaries,
        chunkStart + currentChunk.length,
        Math.min(200, currentChunk.length / 4),
      );

      let splitPoint = currentChunk.length;
      if (nearbyBoundary) {
        splitPoint = nearbyBoundary.position - chunkStart;
      } else {
        // Fallback: split at sentence or word boundary
        const sentenceEnd = currentChunk.lastIndexOf('. ');
        if (sentenceEnd > currentChunk.length / 2) {
          splitPoint = sentenceEnd + 2;
        } else {
          const wordEnd = currentChunk.lastIndexOf(' ');
          if (wordEnd > currentChunk.length / 2) {
            splitPoint = wordEnd + 1;
          }
        }
      }

      const chunkContent = currentChunk.substring(0, splitPoint).trim();
      if (chunkContent.length >= minChunkSize) {
        chunks.push(createTextChunk(chunkContent, `chunk-${chunkId++}`, chunkStart, 'paragraph'));
      }

      // Keep overlap
      const overlap = currentChunk.substring(Math.max(0, splitPoint - overlapSize), splitPoint);
      currentChunk = overlap + currentChunk.substring(splitPoint);
      chunkStart += splitPoint - overlap.length;
    }
  }

  // Handle remaining content
  if (currentChunk.trim().length >= minChunkSize) {
    chunks.push(createTextChunk(currentChunk.trim(), `chunk-${chunkId}`, chunkStart, 'paragraph'));
  }

  // Add overlaps
  for (let i = 0; i < chunks.length - 1; i++) {
    chunks[i].overlapAfter = chunks[i + 1].content.substring(0, overlapSize);
    chunks[i + 1].overlapBefore = chunks[i].content.slice(-overlapSize);
  }

  return chunks;
}

/**
 * Create a text chunk with proper metadata
 */
function createTextChunk(
  content: string,
  id: string,
  startPosition: number,
  level: HierarchyLevel,
): SemanticChunk {
  const type = detectChunkType(content);
  const keywords = extractKeywords(content);
  const importance = calculateImportance(content, type);

  // Generate summary
  const firstSentence = content.match(/^[^.!?]*[.!?]/);
  const summary = firstSentence
    ? firstSentence[0].substring(0, 100)
    : `${content.substring(0, 100)}...`;

  return {
    id,
    content,
    summary: summary.trim(),
    keywords,
    importance,
    type,
    hierarchyLevel: level,
    startPosition,
    endPosition: startPosition + content.length,
  };
}

// =============================================================================
// OVERLAP AND MERGING
// =============================================================================

/**
 * Merge chunks with sliding window overlap
 */
export function mergeChunksWithOverlap(
  chunks: SemanticChunk[],
  overlapSize: number = 100,
  addSummaryOverlaps: boolean = true,
): SemanticChunk[] {
  if (chunks.length <= 1) return chunks;

  console.log(
    chalk.magenta(
      `[SemanticChunk] Merging ${chunks.length} chunks with ${overlapSize} char overlap...`,
    ),
  );

  const merged: SemanticChunk[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = { ...chunks[i] };

    // Add overlap from previous chunk
    if (i > 0) {
      const prevChunk = chunks[i - 1];
      chunk.overlapBefore = prevChunk.content.slice(-overlapSize);

      if (addSummaryOverlaps) {
        // Add summary reference
        chunk.content = `[Previous: ${prevChunk.summary}]\n\n${chunk.content}`;
      }
    }

    // Add overlap to next chunk
    if (i < chunks.length - 1) {
      chunk.overlapAfter = chunks[i + 1].content.substring(0, overlapSize);

      if (addSummaryOverlaps) {
        // Add next summary reference
        chunk.content = `${chunk.content}\n\n[Next: ${chunks[i + 1].summary}]`;
      }
    }

    merged.push(chunk);
  }

  return merged;
}

// =============================================================================
// PRIORITIZATION AND RELEVANCE
// =============================================================================

/**
 * Prioritize chunks by relevance to a query
 */
export function prioritizeChunks(
  chunks: SemanticChunk[],
  query: string,
  topK: number = 5,
): SemanticChunk[] {
  if (chunks.length === 0) return [];

  const queryKeywords = extractKeywords(query, 15);
  const queryLower = query.toLowerCase();

  // Score each chunk
  const scored = chunks.map((chunk) => {
    let score = 0;

    // 1. Keyword overlap (40%)
    const keywordMatches = chunk.keywords.filter(
      (k) => queryKeywords.includes(k) || queryLower.includes(k),
    ).length;
    score += (keywordMatches / Math.max(queryKeywords.length, 1)) * 0.4;

    // 2. Content similarity (30%)
    const chunkLower = chunk.content.toLowerCase();
    for (const keyword of queryKeywords) {
      if (chunkLower.includes(keyword)) {
        score += 0.3 / queryKeywords.length;
      }
    }

    // 3. Base importance (20%)
    score += chunk.importance * 0.2;

    // 4. Type bonus (10%)
    const typeBonus: Record<ChunkType, number> = {
      definition: 0.1,
      code: 0.1,
      explanation: 0.08,
      example: 0.06,
      introduction: 0.05,
      conclusion: 0.05,
      list: 0.03,
      table: 0.03,
      header: 0.02,
      general: 0,
    };
    score += typeBonus[chunk.type] || 0;

    return { chunk, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  console.log(
    chalk.magenta(
      `[SemanticChunk] Prioritized chunks for query, top scores: ${scored
        .slice(0, 3)
        .map((s) => s.score.toFixed(2))
        .join(', ')}`,
    ),
  );

  return scored.slice(0, topK).map((s) => s.chunk);
}

/**
 * Find most relevant chunks for a query (alias for backward compatibility)
 */
export function findRelevantChunks(
  query: string,
  result: ChunkingResult,
  maxChunks: number = 3,
): SemanticChunk[] {
  return prioritizeChunks(result.chunks, query, maxChunks);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Detect chunk type based on content patterns
 */
function detectChunkType(content: string): ChunkType {
  const contentLower = content.toLowerCase();
  const trimmedContent = content.trim();

  // Headers
  if (/^#{1,6}\s+/.test(trimmedContent)) return 'header';

  // Introduction patterns
  if (/^(wstep|wprowadzenie|na poczatek|overview|introduction)/i.test(trimmedContent))
    return 'introduction';

  // Definition patterns
  if (/^(definicja|czym jest|co to|definition|what is)/i.test(trimmedContent)) return 'definition';

  // Example patterns
  if (/^(przyklad|na przyklad|np\.|example|for example|e\.g\.)/i.test(trimmedContent))
    return 'example';

  // Conclusion patterns
  if (/^(podsumowanie|wnioski|zakonczenie|summary|conclusion)/i.test(trimmedContent))
    return 'conclusion';

  // Code patterns
  if (/```|function\s|class\s|const\s|let\s|var\s|import\s|export\s|def\s|async\s/i.test(content))
    return 'code';

  // List patterns
  if (/^(\d+\.|[-*+]|\s*-\s)/m.test(content) && content.split('\n').length > 3) return 'list';

  // Table patterns
  if (/\|.*\|.*\|/m.test(content)) return 'table';

  // Explanation patterns
  if (/dlaczego|jak\s|w jaki sposob|poniewaz|because|how|why|therefore/i.test(contentLower))
    return 'explanation';

  return 'general';
}

/**
 * Extract keywords from text
 */
function extractKeywords(text: string, maxKeywords: number = 5): string[] {
  const stopWords = new Set([
    // Polish
    'i',
    'a',
    'o',
    'w',
    'z',
    'do',
    'na',
    'to',
    'jest',
    'sa',
    'ze',
    'sie',
    'nie',
    'jak',
    'co',
    'ale',
    'czy',
    'tak',
    'lub',
    'oraz',
    'gdy',
    'by',
    'tego',
    'tej',
    'ten',
    'ta',
    'te',
    'tym',
    'dla',
    'po',
    'przy',
    'pod',
    // English
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'can',
    'may',
    'might',
    'must',
    'shall',
    'of',
    'to',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'under',
    'again',
    'further',
    'then',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
    'and',
    'or',
    'but',
    'if',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\u0080-\u024F\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.has(word));

  // Count word frequency
  const wordCount = new Map<string, number>();
  for (const word of words) {
    wordCount.set(word, (wordCount.get(word) || 0) + 1);
  }

  // Sort by frequency and return top keywords
  return [...wordCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * Calculate importance score for a chunk
 */
function calculateImportance(content: string, type: ChunkType): number {
  let score = 0.5;

  // Type-based scoring
  const typeScores: Record<ChunkType, number> = {
    header: 0.75,
    introduction: 0.7,
    definition: 0.85,
    conclusion: 0.8,
    code: 0.9,
    example: 0.65,
    explanation: 0.7,
    list: 0.5,
    table: 0.6,
    general: 0.4,
  };
  score = typeScores[type];

  // Length bonus (ideal: 300-800 chars)
  const length = content.length;
  if (length >= 300 && length <= 800) {
    score += 0.05;
  } else if (length < 100 || length > 2000) {
    score -= 0.05;
  }

  // Keyword density bonus
  const keywords = extractKeywords(content, 10);
  if (keywords.length >= 5) score += 0.05;

  // Special content bonus
  if (/important|crucial|key|essential|critical|wazne|kluczowe|istotne/i.test(content)) {
    score += 0.1;
  }

  return Math.min(1, Math.max(0, score));
}

/**
 * Build semantic map from chunks
 */
function buildSemanticMap(chunks: SemanticChunk[]): Map<string, string[]> {
  const semanticMap = new Map<string, string[]>();

  for (const chunk of chunks) {
    for (const keyword of chunk.keywords) {
      if (!semanticMap.has(keyword)) {
        semanticMap.set(keyword, []);
      }
      semanticMap.get(keyword)?.push(chunk.id);
    }
  }

  return semanticMap;
}

// =============================================================================
// AI-POWERED FUNCTIONS
// =============================================================================

/**
 * AI-powered semantic summarization of chunks
 */
export async function summarizeChunks(chunks: SemanticChunk[]): Promise<string> {
  if (chunks.length === 0) return '';

  console.log(chalk.magenta(`[SemanticChunk] AI-summarizing ${chunks.length} chunks...`));

  const content = chunks.map((c) => c.content).join('\n---\n');

  const prompt = `Podsumuj zwiezle nastepujacy tekst (max 200 slow):

${content.substring(0, 4000)}

Odpowiadaj PO POLSKU. Podaj tylko podsumowanie.`;

  try {
    const response = await geminiSemaphore.withPermit(async () => {
      const model = genAI.getGenerativeModel({
        model: INTELLIGENCE_MODEL,
        generationConfig: { temperature: 1.0, maxOutputTokens: 500 }, // Temperature locked at 1.0 for Gemini - do not change
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    });

    return response.trim();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[SemanticChunk] AI summarization failed: ${msg}`));
    return chunks.map((c) => c.summary).join(' ');
  }
}

/**
 * Rebuild full text from chunks (with deduplication of overlaps)
 */
export function reconstructText(chunks: SemanticChunk[]): string {
  if (chunks.length === 0) return '';
  if (chunks.length === 1) return chunks[0].content;

  // Sort by position
  const sorted = [...chunks].sort((a, b) => a.startPosition - b.startPosition);

  let result = sorted[0].content;
  let currentEnd = sorted[0].endPosition;

  for (let i = 1; i < sorted.length; i++) {
    const chunk = sorted[i];
    if (chunk.startPosition < currentEnd) {
      // Overlap - add only new content
      const overlap = currentEnd - chunk.startPosition;
      result += chunk.content.substring(overlap);
    } else {
      // Gap - add full content
      result += chunk.content;
    }
    currentEnd = Math.max(currentEnd, chunk.endPosition);
  }

  return result;
}

// =============================================================================
// BACKWARD COMPATIBILITY (simple function export)
// =============================================================================

/**
 * Simple semantic chunking function (backward compatible)
 */
export function semanticChunk(
  text: string,
  options: {
    maxChunkSize?: number;
    minChunkSize?: number;
    overlapSize?: number;
  } = {},
): ChunkingResult {
  return createSemanticChunks(text, {
    ...options,
    hierarchical: true,
    preserveCodeBlocks: true,
  });
}

// =============================================================================
// CONTEXT MANAGER INTEGRATION
// =============================================================================

import { type ContextChunk, contextManager } from './ContextManager.js';

/**
 * Add semantically chunked content to context manager
 */
export function addToContextWithChunking(
  content: string,
  type: ContextChunk['type'],
  baseImportance: number = 0.5,
  query?: string,
): void {
  const result = createSemanticChunks(content, {
    maxChunkSize: 1500,
    minChunkSize: 100,
    overlapSize: 50,
  });

  let chunks = result.chunks;

  // If query provided, prioritize relevant chunks
  if (query) {
    chunks = prioritizeChunks(chunks, query, Math.min(chunks.length, 10));
  }

  // Add top chunks to context manager
  for (const chunk of chunks.slice(0, 5)) {
    const adjustedImportance = Math.min(1, baseImportance + (chunk.importance - 0.5) * 0.2);
    contextManager.add(chunk.content, type, adjustedImportance);
  }

  console.log(
    chalk.green(`[SemanticChunk] Added ${Math.min(chunks.length, 5)} chunks to context manager`),
  );
}

/**
 * Get context with semantic prioritization
 */
export function getSemanticContext(query: string, maxTokens: number = 8000): string {
  const allChunks = contextManager.getChunks();

  // Convert context chunks to semantic chunks for prioritization
  const semanticChunks: SemanticChunk[] = allChunks.map((chunk, i) => ({
    id: `ctx-${i}`,
    content: chunk.content,
    summary: chunk.content.substring(0, 100),
    keywords: extractKeywords(chunk.content),
    importance: chunk.importance,
    type: detectChunkType(chunk.content),
    hierarchyLevel: 'paragraph' as HierarchyLevel,
    startPosition: 0,
    endPosition: chunk.content.length,
  }));

  // Prioritize by query
  const prioritized = prioritizeChunks(semanticChunks, query, 20);

  // Build context within token limit
  let tokens = 0;
  const selected: string[] = [];

  for (const chunk of prioritized) {
    const chunkTokens = Math.ceil(chunk.content.length / 4);
    if (tokens + chunkTokens <= maxTokens) {
      selected.push(chunk.content);
      tokens += chunkTokens;
    }
  }

  return selected.join('\n\n');
}
