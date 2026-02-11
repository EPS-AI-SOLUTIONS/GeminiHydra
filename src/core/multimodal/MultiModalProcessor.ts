/**
 * MultiModalProcessor - Main class for handling multi-modal content
 *
 * @module multimodal/MultiModalProcessor
 */

import { exec } from 'node:child_process';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { type GenerativeModel, GoogleGenerativeAI, type Part } from '@google/generative-ai';
import 'dotenv/config';

import { MAX_FILE_SIZES, MULTIMODAL_MODELS } from './constants.js';
import type {
  AnalysisResult,
  AudioInput,
  ImageInput,
  MCPMultiModalResource,
  MCPMultiModalToolInput,
  MCPResourceContent,
  MixedContentPrompt,
  MultiModalContent,
  ScreenshotAnalysis,
  VideoInput,
} from './types.js';
import { detectContentType, downloadToBuffer, getMimeType } from './utils.js';

const execAsync = promisify(exec);

/**
 * MultiModalProcessor - Main class for handling multi-modal content
 */
export class MultiModalProcessor {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private modelName: string;
  private initialized: boolean = false;

  constructor(modelName?: string) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName || process.env.GEMINI_MODEL || 'gemini-3-pro-preview';
    this.model = this.genAI.getGenerativeModel({ model: this.modelName });
    this.initialized = !!apiKey;
  }

  // --------------------------------------------------------------------------
  // INITIALIZATION & CONFIGURATION
  // --------------------------------------------------------------------------

  isInitialized(): boolean {
    return this.initialized;
  }

  setModel(modelName: string): void {
    this.modelName = modelName;
    this.model = this.genAI.getGenerativeModel({ model: modelName });
  }

  getModelName(): string {
    return this.modelName;
  }

  isMultiModalSupported(): boolean {
    return MULTIMODAL_MODELS.some((m) => this.modelName.includes(m) || m.includes(this.modelName));
  }

  static getSupportedModels(): string[] {
    return [...MULTIMODAL_MODELS];
  }

  // --------------------------------------------------------------------------
  // IMAGE PROCESSING
  // --------------------------------------------------------------------------

  async processImage(input: ImageInput): Promise<MultiModalContent> {
    let base64Data: string;
    let mimeType = input.mimeType;

    switch (input.source) {
      case 'base64':
        base64Data = input.data;
        if (!mimeType) {
          const match = input.data.match(/^data:([^;]+);base64,/);
          if (match) {
            mimeType = match[1];
            base64Data = input.data.replace(/^data:[^;]+;base64,/, '');
          }
        }
        break;

      case 'url': {
        const buffer = await downloadToBuffer(input.data);
        base64Data = buffer.toString('base64');
        if (!mimeType) {
          const urlPath = new URL(input.data).pathname;
          mimeType = getMimeType(urlPath) || 'image/jpeg';
        }
        break;
      }

      case 'file': {
        const resolvedPath = path.resolve(input.data);
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Image file not found: ${resolvedPath}`);
        }
        const stats = fs.statSync(resolvedPath);
        if (stats.size > MAX_FILE_SIZES.image) {
          throw new Error(`Image file too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
        }
        base64Data = fs.readFileSync(resolvedPath).toString('base64');
        if (!mimeType) {
          mimeType = getMimeType(resolvedPath) || 'image/jpeg';
        }
        break;
      }

      default:
        throw new Error(`Unknown image source: ${input.source}`);
    }

    return {
      type: 'image',
      data: base64Data,
      mimeType: mimeType || 'image/jpeg',
      description: input.altText,
      metadata: {
        ...input.metadata,
        dimensions: input.dimensions,
        source: input.source,
      },
    };
  }

  async analyzeImage(input: ImageInput, prompt?: string): Promise<AnalysisResult> {
    if (!this.initialized) {
      throw new Error('MultiModalProcessor not initialized: GEMINI_API_KEY not set');
    }

    const startTime = Date.now();
    const content = await this.processImage(input);

    const parts: Part[] = [
      {
        inlineData: {
          mimeType: content.mimeType,
          data: content.data,
        },
      },
      {
        text:
          prompt ||
          'Describe this image in detail. Include information about the main subjects, colors, composition, and any text visible.',
      },
    ];

    const result = await this.model.generateContent(parts);
    const response = result.response;

    return {
      text: response.text(),
      metadata: {
        model: this.modelName,
        contentTypes: ['image'],
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  // --------------------------------------------------------------------------
  // AUDIO PROCESSING
  // --------------------------------------------------------------------------

  async processAudio(input: AudioInput): Promise<MultiModalContent> {
    let base64Data: string;
    let mimeType = input.mimeType;

    switch (input.source) {
      case 'base64':
        base64Data = input.data;
        break;

      case 'url': {
        const buffer = await downloadToBuffer(input.data);
        base64Data = buffer.toString('base64');
        if (!mimeType) {
          const urlPath = new URL(input.data).pathname;
          mimeType = getMimeType(urlPath) || 'audio/mpeg';
        }
        break;
      }

      case 'file': {
        const resolvedPath = path.resolve(input.data);
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Audio file not found: ${resolvedPath}`);
        }
        const stats = fs.statSync(resolvedPath);
        if (stats.size > MAX_FILE_SIZES.audio) {
          throw new Error(`Audio file too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
        }
        base64Data = fs.readFileSync(resolvedPath).toString('base64');
        if (!mimeType) {
          mimeType = getMimeType(resolvedPath) || 'audio/mpeg';
        }
        break;
      }

      default:
        throw new Error(`Unknown audio source: ${input.source}`);
    }

    return {
      type: 'audio',
      data: base64Data,
      mimeType: mimeType || 'audio/mpeg',
      metadata: {
        ...input.metadata,
        duration: input.duration,
        sampleRate: input.sampleRate,
        channels: input.channels,
        language: input.language,
        source: input.source,
      },
    };
  }

  async transcribeAudio(input: AudioInput): Promise<AnalysisResult> {
    if (!this.initialized) {
      throw new Error('MultiModalProcessor not initialized: GEMINI_API_KEY not set');
    }

    const startTime = Date.now();
    const content = await this.processAudio(input);

    const parts: Part[] = [
      {
        inlineData: {
          mimeType: content.mimeType,
          data: content.data,
        },
      },
      {
        text: `Transcribe this audio content. ${input.language ? `The audio is in ${input.language}.` : ''} Provide an accurate text transcription.`,
      },
    ];

    try {
      const result = await this.model.generateContent(parts);
      return {
        text: result.response.text(),
        metadata: {
          model: this.modelName,
          contentTypes: ['audio'],
          processingTimeMs: Date.now() - startTime,
        },
      };
    } catch (_error: unknown) {
      return {
        text: `[Audio transcription not available for model ${this.modelName}. Audio content received: ${content.mimeType}, size: ${content.data.length} bytes]`,
        metadata: {
          model: this.modelName,
          contentTypes: ['audio'],
          processingTimeMs: Date.now() - startTime,
        },
      };
    }
  }

  // --------------------------------------------------------------------------
  // VIDEO PROCESSING
  // --------------------------------------------------------------------------

  async processVideo(input: VideoInput): Promise<MultiModalContent> {
    let base64Data: string;
    let mimeType = input.mimeType;

    switch (input.source) {
      case 'base64':
        base64Data = input.data;
        break;

      case 'url': {
        const buffer = await downloadToBuffer(input.data);
        base64Data = buffer.toString('base64');
        if (!mimeType) {
          const urlPath = new URL(input.data).pathname;
          mimeType = getMimeType(urlPath) || 'video/mp4';
        }
        break;
      }

      case 'file': {
        const resolvedPath = path.resolve(input.data);
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Video file not found: ${resolvedPath}`);
        }
        const stats = fs.statSync(resolvedPath);
        if (stats.size > MAX_FILE_SIZES.video) {
          throw new Error(`Video file too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
        }
        base64Data = fs.readFileSync(resolvedPath).toString('base64');
        if (!mimeType) {
          mimeType = getMimeType(resolvedPath) || 'video/mp4';
        }
        break;
      }

      default:
        throw new Error(`Unknown video source: ${input.source}`);
    }

    return {
      type: 'video',
      data: base64Data,
      mimeType: mimeType || 'video/mp4',
      metadata: {
        ...input.metadata,
        duration: input.duration,
        frameRate: input.frameRate,
        resolution: input.resolution,
        source: input.source,
      },
    };
  }

  async extractVideoFrames(
    videoPath: string,
    options?: {
      timestamps?: number[];
      interval?: number;
      maxFrames?: number;
      outputDir?: string;
    },
  ): Promise<string[]> {
    const resolvedPath = path.resolve(videoPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Video file not found: ${resolvedPath}`);
    }

    const outputDir = options?.outputDir || path.join(path.dirname(resolvedPath), '.frames');
    await fsPromises.mkdir(outputDir, { recursive: true });

    const framePaths: string[] = [];
    const maxFrames = options?.maxFrames || 10;

    try {
      if (options?.timestamps && options.timestamps.length > 0) {
        for (let i = 0; i < Math.min(options.timestamps.length, maxFrames); i++) {
          const timestamp = options.timestamps[i];
          const outputPath = path.join(outputDir, `frame_${i.toString().padStart(4, '0')}.png`);
          await execAsync(
            `ffmpeg -ss ${timestamp} -i "${resolvedPath}" -frames:v 1 -y "${outputPath}" 2>/dev/null`,
          );
          if (fs.existsSync(outputPath)) {
            framePaths.push(outputPath);
          }
        }
      } else if (options?.interval) {
        await execAsync(
          `ffmpeg -i "${resolvedPath}" -vf "fps=1/${options.interval}" -frames:v ${maxFrames} "${outputDir}/frame_%04d.png" 2>/dev/null`,
        );
        const files = await fsPromises.readdir(outputDir);
        for (const file of files.sort()) {
          if (file.startsWith('frame_') && file.endsWith('.png')) {
            framePaths.push(path.join(outputDir, file));
            if (framePaths.length >= maxFrames) break;
          }
        }
      } else {
        await execAsync(
          `ffmpeg -i "${resolvedPath}" -vf "select='eq(pict_type,I)'" -vsync vfr -frames:v ${maxFrames} "${outputDir}/frame_%04d.png" 2>/dev/null`,
        );
        const files = await fsPromises.readdir(outputDir);
        for (const file of files.sort()) {
          if (file.startsWith('frame_') && file.endsWith('.png')) {
            framePaths.push(path.join(outputDir, file));
            if (framePaths.length >= maxFrames) break;
          }
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`Frame extraction failed (ffmpeg may not be installed): ${msg}`);
    }

    return framePaths;
  }

  async analyzeVideo(input: VideoInput, prompt?: string): Promise<AnalysisResult> {
    if (!this.initialized) {
      throw new Error('MultiModalProcessor not initialized: GEMINI_API_KEY not set');
    }

    const startTime = Date.now();
    const content = await this.processVideo(input);

    const parts: Part[] = [
      {
        inlineData: {
          mimeType: content.mimeType,
          data: content.data,
        },
      },
      {
        text:
          prompt ||
          'Analyze this video. Describe what happens, identify people or objects, and summarize the main content.',
      },
    ];

    try {
      const result = await this.model.generateContent(parts);
      return {
        text: result.response.text(),
        metadata: {
          model: this.modelName,
          contentTypes: ['video'],
          processingTimeMs: Date.now() - startTime,
        },
      };
    } catch (error: unknown) {
      if (input.source === 'file') {
        const frames = await this.extractVideoFrames(input.data, {
          maxFrames: 5,
          interval: input.duration ? Math.floor(input.duration / 5) : 10,
        });

        if (frames.length > 0) {
          const frameAnalyses: string[] = [];
          for (const framePath of frames) {
            const analysis = await this.analyzeImage(
              { source: 'file', data: framePath },
              'Briefly describe what you see in this video frame.',
            );
            frameAnalyses.push(analysis.text);
          }

          return {
            text: `Video analysis from ${frames.length} extracted frames:\n\n${frameAnalyses.map((a, i) => `Frame ${i + 1}: ${a}`).join('\n\n')}`,
            metadata: {
              model: this.modelName,
              contentTypes: ['video', 'image'],
              processingTimeMs: Date.now() - startTime,
            },
          };
        }
      }

      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // MIXED CONTENT / PROMPT BUILDING
  // --------------------------------------------------------------------------

  buildMultiModalPrompt(mixedContent: MixedContentPrompt): Part[] {
    const parts: Part[] = [];

    for (const content of mixedContent.parts) {
      if (content.type === 'text') {
        parts.push({ text: content.data });
      } else {
        parts.push({
          inlineData: {
            mimeType: content.mimeType,
            data: content.data,
          },
        });
      }
    }

    if (mixedContent.prompt) {
      parts.push({ text: mixedContent.prompt });
    }

    return parts;
  }

  async processMultiModal(mixedContent: MixedContentPrompt): Promise<AnalysisResult> {
    if (!this.initialized) {
      throw new Error('MultiModalProcessor not initialized: GEMINI_API_KEY not set');
    }

    const startTime = Date.now();
    const parts = this.buildMultiModalPrompt(mixedContent);

    const result = await this.model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: mixedContent.generationConfig,
      ...(mixedContent.systemInstruction && {
        systemInstruction: mixedContent.systemInstruction,
      }),
    });

    const contentTypes = [...new Set(mixedContent.parts.map((p) => p.type))];

    return {
      text: result.response.text(),
      metadata: {
        model: this.modelName,
        contentTypes,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  // --------------------------------------------------------------------------
  // DEBUG LOOP INTEGRATION - SCREENSHOT ANALYSIS
  // --------------------------------------------------------------------------

  async analyzeScreenshotForDebug(imagePath: string): Promise<ScreenshotAnalysis> {
    if (!this.initialized) {
      throw new Error('MultiModalProcessor not initialized: GEMINI_API_KEY not set');
    }

    const prompt = `Analyze this screenshot for debugging purposes. You are helping a developer identify and fix issues.

Provide a detailed analysis in the following JSON format:
{
  "description": "Brief overview of what the screenshot shows",
  "errors": [
    {
      "type": "error|warning|info",
      "message": "Error message or description",
      "location": "Where in the UI/code this appears",
      "severity": "critical|high|medium|low",
      "possibleCause": "What might have caused this"
    }
  ],
  "uiElements": [
    {
      "type": "button|input|modal|toast|console|terminal|etc",
      "label": "Element label or content",
      "state": "normal|error|disabled|loading|active"
    }
  ],
  "suggestions": [
    {
      "priority": 1,
      "description": "What to fix and how",
      "targetFile": "Filename if identifiable",
      "codeChange": "Suggested code change if applicable",
      "confidence": 0.9
    }
  ],
  "codeSnippets": [
    {
      "language": "typescript|javascript|etc",
      "code": "Code visible in screenshot",
      "lineNumbers": {"start": 1, "end": 10},
      "hasError": true,
      "errorDescription": "Description of the error in this code"
    }
  ],
  "healthScore": 85
}

Focus on:
1. Error messages, stack traces, or console errors
2. UI issues (broken layouts, missing elements, loading states)
3. Code problems visible in editors or terminals
4. Network errors, API failures
5. Security warnings

Be thorough but concise. Return ONLY valid JSON.`;

    const result = await this.analyzeImage({ source: 'file', data: imagePath }, prompt);

    let analysis: ScreenshotAnalysis;
    try {
      let jsonText = result.text;
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonText);
      analysis = {
        description: parsed.description || 'No description available',
        errors: parsed.errors || [],
        uiElements: parsed.uiElements || [],
        suggestions: parsed.suggestions || [],
        codeSnippets: parsed.codeSnippets || [],
        healthScore: parsed.healthScore ?? 50,
        rawResponse: result.text,
      };
    } catch {
      analysis = {
        description: result.text,
        errors: [],
        uiElements: [],
        suggestions: [],
        codeSnippets: [],
        healthScore: 50,
        rawResponse: result.text,
      };

      const errorMatches = result.text.match(/error[:\s]+([^\n]+)/gi);
      if (errorMatches) {
        analysis.errors = errorMatches.map((e) => ({
          type: 'error' as const,
          message: e,
          severity: 'medium' as const,
        }));
      }
    }

    return analysis;
  }

  async compareScreenshots(
    beforePath: string,
    afterPath: string,
  ): Promise<{
    changesDetected: boolean;
    description: string;
    improvements: string[];
    remainingIssues: string[];
    overallAssessment: 'fixed' | 'improved' | 'unchanged' | 'regressed';
  }> {
    if (!this.initialized) {
      throw new Error('MultiModalProcessor not initialized: GEMINI_API_KEY not set');
    }

    const [beforeContent, afterContent] = await Promise.all([
      this.processImage({ source: 'file', data: beforePath }),
      this.processImage({ source: 'file', data: afterPath }),
    ]);

    const parts: Part[] = [
      { text: 'BEFORE:' },
      {
        inlineData: {
          mimeType: beforeContent.mimeType,
          data: beforeContent.data,
        },
      },
      { text: 'AFTER:' },
      {
        inlineData: {
          mimeType: afterContent.mimeType,
          data: afterContent.data,
        },
      },
      {
        text: `Compare these two screenshots (BEFORE and AFTER).

Analyze what changed and whether issues were fixed.

Return JSON:
{
  "changesDetected": true/false,
  "description": "Summary of changes",
  "improvements": ["List of fixed issues or improvements"],
  "remainingIssues": ["List of issues still present"],
  "overallAssessment": "fixed|improved|unchanged|regressed"
}

ONLY return valid JSON.`,
      },
    ];

    const result = await this.model.generateContent(parts);
    const responseText = result.response.text();

    try {
      let jsonText = responseText;
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }
      return JSON.parse(jsonText);
    } catch {
      return {
        changesDetected: true,
        description: responseText,
        improvements: [],
        remainingIssues: [],
        overallAssessment: 'unchanged',
      };
    }
  }

  // --------------------------------------------------------------------------
  // MCP RESOURCE HANDLERS
  // --------------------------------------------------------------------------

  async createMCPResource(filePath: string): Promise<MCPMultiModalResource> {
    const resolvedPath = path.resolve(filePath);
    const stats = await fsPromises.stat(resolvedPath);
    const mimeType = getMimeType(resolvedPath);
    const contentType = detectContentType(resolvedPath);

    return {
      uri: `file://${resolvedPath}`,
      name: path.basename(resolvedPath),
      mimeType: mimeType || 'application/octet-stream',
      contentType: contentType || 'document',
      size: stats.size,
      lastModified: stats.mtime,
    };
  }

  async readMCPResource(resource: MCPMultiModalResource): Promise<MCPResourceContent> {
    const filePath = resource.uri.replace('file://', '');
    const buffer = await fsPromises.readFile(filePath);
    const contentType = resource.contentType;

    if (contentType === 'text' || resource.mimeType.startsWith('text/')) {
      return {
        uri: resource.uri,
        mimeType: resource.mimeType,
        text: buffer.toString('utf-8'),
      };
    }

    return {
      uri: resource.uri,
      mimeType: resource.mimeType,
      blob: buffer.toString('base64'),
    };
  }

  async processMCPToolInput(input: MCPMultiModalToolInput): Promise<Part[]> {
    const parts: Part[] = [];

    if (input.text) {
      parts.push({ text: input.text });
    }

    if (input.images) {
      for (const img of input.images) {
        const content = await this.processImage(img);
        parts.push({
          inlineData: {
            mimeType: content.mimeType,
            data: content.data,
          },
        });
      }
    }

    if (input.audio) {
      for (const aud of input.audio) {
        const content = await this.processAudio(aud);
        parts.push({
          inlineData: {
            mimeType: content.mimeType,
            data: content.data,
          },
        });
      }
    }

    if (input.video) {
      for (const vid of input.video) {
        const content = await this.processVideo(vid);
        parts.push({
          inlineData: {
            mimeType: content.mimeType,
            data: content.data,
          },
        });
      }
    }

    return parts;
  }
}
