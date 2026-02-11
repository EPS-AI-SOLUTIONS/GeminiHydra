/**
 * KnowledgeAgent - Agent zarządzający bankiem wiedzy
 *
 * Funkcje:
 * 1. Automatyczne uczenie się z konwersacji
 * 2. Ekstrakcja wiedzy z kodu
 * 3. Budowanie kontekstu RAG dla innych agentów
 * 4. Uczenie lokalnego modelu (Ollama fine-tuning)
 * 5. Odpowiadanie na pytania z bazy wiedzy
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import ollama from 'ollama';
import { KNOWLEDGE_DIR } from '../config/paths.config.js';
import { codebaseMemory } from '../memory/CodebaseMemory.js';
import { sessionMemory } from '../memory/SessionMemory.js';
import { type KnowledgeEntry, type KnowledgeType, knowledgeBank } from './KnowledgeBank.js';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const _TRAINING_DIR = path.join(KNOWLEDGE_DIR, 'training');
const MODELS_DIR = path.join(KNOWLEDGE_DIR, 'models');

// ============================================================
// Types
// ============================================================

export interface LearnedKnowledge {
  extracted: number;
  types: Record<string, number>;
}

export interface AgentContext {
  query: string;
  agentName: string;
  projectContext?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

export interface AgentResponse {
  answer: string;
  sources: KnowledgeEntry[];
  confidence: number;
}

export interface TrainingConfig {
  baseModel: string;
  outputModel: string;
  epochs?: number;
  learningRate?: number;
}

// ============================================================
// KnowledgeAgent Class
// ============================================================

export class KnowledgeAgent {
  private initialized = false;
  private agentModel = 'gemini-3-pro-preview';
  private localModel = 'geminihydra-knowledge'; // Our custom model name

  /**
   * Initialize agent
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    await knowledgeBank.init();
    await fs.mkdir(MODELS_DIR, { recursive: true });

    this.initialized = true;
    console.log(chalk.cyan('[KnowledgeAgent] Initialized'));
  }

  // ============================================================
  // Learning from Sources
  // ============================================================

  /**
   * Learn from current codebase
   */
  async learnFromCodebase(projectPath: string): Promise<LearnedKnowledge> {
    await this.init();

    console.log(chalk.cyan(`[KnowledgeAgent] Learning from codebase: ${projectPath}`));

    // Analyze project first
    await codebaseMemory.init();
    const analysis = await codebaseMemory.analyzeProject(projectPath, { maxFiles: 100 });

    const learned: LearnedKnowledge = { extracted: 0, types: {} };

    // Extract architecture knowledge
    await knowledgeBank.add(
      'architecture',
      `${analysis.projectName} Architecture`,
      analysis.summary,
      {
        source: 'codebase',
        projectPath,
        importance: 0.8,
        tags: ['architecture', analysis.structure.type, analysis.structure.framework || ''].filter(
          Boolean,
        ),
      },
    );
    learned.extracted++;
    learned.types.architecture = 1;

    // Extract patterns from key files
    for (const file of analysis.files.slice(0, 30)) {
      if (file.classes?.length || file.exports?.length) {
        const relativePath = file.relativePath ?? file.name ?? 'unknown';
        const extension = file.extension ?? '.ts';
        const title = `${path.basename(relativePath)} - ${file.classes?.join(', ') || file.exports?.slice(0, 3).join(', ')}`;

        await knowledgeBank.add(
          'code_pattern',
          title,
          `
File: ${relativePath}
Classes: ${file.classes?.join(', ') || 'none'}
Exports: ${file.exports?.join(', ') || 'none'}
Functions: ${file.functions?.join(', ') || 'none'}
Lines: ${file.lines ?? 0}
        `.trim(),
          {
            source: 'codebase',
            filePath: relativePath,
            language: extension.replace('.', ''),
            importance: 0.6,
            projectPath,
          },
        );

        learned.extracted++;
        learned.types.code_pattern = (learned.types.code_pattern || 0) + 1;
      }
    }

    console.log(chalk.green(`[KnowledgeAgent] Learned ${learned.extracted} entries from codebase`));
    return learned;
  }

  /**
   * Learn from session history
   */
  async learnFromSessions(): Promise<LearnedKnowledge> {
    await this.init();
    await sessionMemory.init();

    const learned: LearnedKnowledge = { extracted: 0, types: {} };

    // Get sessions with substantial content
    const sessions = await sessionMemory.listSessions();

    for (const session of sessions.slice(0, 10)) {
      if (session.messageCount < 4) continue;

      const fullSession = await sessionMemory.loadSession(session.id);
      if (!fullSession) continue;

      const messages = fullSession.messages;

      // Extract Q&A pairs
      for (let i = 0; i < messages.length - 1; i++) {
        const userMsg = messages[i];
        const assistantMsg = messages[i + 1];

        if (userMsg.role === 'user' && assistantMsg.role === 'assistant') {
          // Only learn from substantial exchanges
          if (userMsg.content.length > 20 && assistantMsg.content.length > 100) {
            // Use AI to determine if this is worth learning
            const shouldLearn = await this.evaluateForLearning(
              userMsg.content,
              assistantMsg.content,
            );

            if (shouldLearn.learn) {
              await knowledgeBank.add(
                shouldLearn.type as KnowledgeType,
                this.generateTitle(userMsg.content),
                `Q: ${userMsg.content}\n\nA: ${assistantMsg.content}`,
                {
                  source: 'session',
                  importance: shouldLearn.importance,
                  tags: shouldLearn.tags,
                },
              );

              learned.extracted++;
              learned.types[shouldLearn.type] = (learned.types[shouldLearn.type] || 0) + 1;
            }
          }
        }
      }
    }

    console.log(chalk.green(`[KnowledgeAgent] Learned ${learned.extracted} entries from sessions`));
    return learned;
  }

  /**
   * Evaluate if content is worth learning
   */
  private async evaluateForLearning(
    question: string,
    answer: string,
  ): Promise<{
    learn: boolean;
    type: string;
    importance: number;
    tags: string[];
  }> {
    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-3-pro-preview',
        generationConfig: { temperature: 1.0, maxOutputTokens: 512 }, // Temperature locked at 1.0 for Gemini - do not change
      });

      const prompt = `Analyze this Q&A exchange for learning value. Return JSON only.

Question: ${question.slice(0, 500)}
Answer: ${answer.slice(0, 1000)}

Return JSON:
{
  "learn": true/false (is this worth storing as knowledge?),
  "type": "code_pattern" | "bug_fix" | "architecture" | "documentation" | "lesson_learned" | "workflow",
  "importance": 0.0-1.0,
  "tags": ["tag1", "tag2"]
}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {}

    // Default: don't learn
    return { learn: false, type: 'custom', importance: 0, tags: [] };
  }

  /**
   * Generate title from question
   */
  private generateTitle(question: string): string {
    return (
      question
        .replace(/[?!.]+/g, '')
        .slice(0, 60)
        .trim() + (question.length > 60 ? '...' : '')
    );
  }

  // ============================================================
  // Query & RAG
  // ============================================================

  /**
   * Query knowledge base with RAG
   */
  async query(
    question: string,
    options: {
      useLocalModel?: boolean;
      maxKnowledge?: number;
      includeProjectContext?: boolean;
    } = {},
  ): Promise<AgentResponse> {
    await this.init();

    const { useLocalModel = false, maxKnowledge = 5, includeProjectContext = true } = options;

    // Get relevant knowledge
    const ragContext = await knowledgeBank.getRAGContext(question, {
      maxEntries: maxKnowledge,
      maxTokens: 3000,
    });

    // Build context
    let context = '';

    if (ragContext.relevantKnowledge.length > 0) {
      context += `## Relevant Knowledge\n${ragContext.contextText}\n\n`;
    }

    if (includeProjectContext) {
      await codebaseMemory.init();
      const project = codebaseMemory.getCurrentProject();
      if (project) {
        context += `## Project Context\n${project.summary}\n\n`;
      }
    }

    // Generate answer
    let answer: string;
    let confidence: number;

    if (useLocalModel && (await this.isLocalModelAvailable())) {
      const result = await this.queryLocalModel(question, context);
      answer = result.answer;
      confidence = result.confidence;
    } else {
      const result = await this.queryGemini(question, context);
      answer = result.answer;
      confidence = result.confidence;
    }

    return {
      answer,
      sources: ragContext.relevantKnowledge,
      confidence,
    };
  }

  /**
   * Query using Gemini
   */
  private async queryGemini(
    question: string,
    context: string,
  ): Promise<{ answer: string; confidence: number }> {
    const model = genAI.getGenerativeModel({
      model: this.agentModel,
      generationConfig: { temperature: 1.0, maxOutputTokens: 4096 },
    });

    const prompt = `You are a knowledgeable assistant. Use the provided context to answer the question accurately.

${context}

Question: ${question}

Instructions:
- Answer based on the provided knowledge context
- If the context doesn't contain enough information, say so
- Be concise but complete
- Answer in the same language as the question`;

    const result = await model.generateContent(prompt);
    const answer = result.response.text();

    // Estimate confidence based on context match
    const confidence = context.length > 500 ? 0.8 : context.length > 100 ? 0.6 : 0.4;

    return { answer, confidence };
  }

  /**
   * Query using local Ollama model
   */
  private async queryLocalModel(
    question: string,
    context: string,
  ): Promise<{ answer: string; confidence: number }> {
    const response = await ollama.generate({
      model: this.localModel,
      prompt: `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer:`,
      options: { temperature: 0.3 },
    });

    return { answer: response.response, confidence: 0.7 };
  }

  /**
   * Check if local model is available
   */
  private async isLocalModelAvailable(): Promise<boolean> {
    try {
      const models = await ollama.list();
      return models.models.some((m) => m.name.includes(this.localModel));
    } catch {
      return false;
    }
  }

  // ============================================================
  // Context for Other Agents
  // ============================================================

  /**
   * Build knowledge context for another agent
   */
  async buildContextForAgent(agentContext: AgentContext): Promise<string> {
    await this.init();

    const { query, agentName: _agentName, projectContext, conversationHistory } = agentContext;

    const parts: string[] = [];

    // Get relevant knowledge
    const ragContext = await knowledgeBank.getRAGContext(query, {
      maxEntries: 3,
      maxTokens: 2000,
    });

    if (ragContext.relevantKnowledge.length > 0) {
      parts.push('## Knowledge Base Context');
      parts.push(ragContext.contextText);
    }

    // Add project context if available
    if (projectContext) {
      parts.push('## Project Context');
      parts.push(projectContext);
    }

    // Add relevant conversation history
    if (conversationHistory?.length) {
      parts.push('## Recent Conversation');
      const recent = conversationHistory.slice(-4);
      for (const msg of recent) {
        parts.push(`${msg.role}: ${msg.content.slice(0, 200)}`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Learn from agent's work (called after agent completes task)
   */
  async learnFromAgent(
    agentName: string,
    task: string,
    result: string,
    success: boolean,
  ): Promise<void> {
    await this.init();

    // Only learn from successful, substantial results
    if (!success || result.length < 100) return;

    const type: KnowledgeType = success ? 'lesson_learned' : 'bug_fix';

    await knowledgeBank.add(
      type,
      `${agentName}: ${this.generateTitle(task)}`,
      `Task: ${task}\n\nResult: ${result}`,
      {
        source: 'agent',
        createdBy: agentName,
        importance: success ? 0.6 : 0.7, // Failures are often more valuable
        tags: [agentName.toLowerCase(), success ? 'success' : 'failure'],
      },
    );
  }

  // ============================================================
  // Model Training
  // ============================================================

  /**
   * Prepare training data from knowledge base
   */
  async prepareTrainingData(): Promise<string> {
    await this.init();
    return await knowledgeBank.exportForTraining();
  }

  /**
   * Create custom Ollama model from knowledge
   */
  async createCustomModel(
    config: { baseModel?: string; modelName?: string; systemPrompt?: string } = {},
  ): Promise<string> {
    await this.init();

    const {
      baseModel = 'qwen3:4b',
      modelName = 'geminihydra-knowledge',
      systemPrompt = 'You are a knowledgeable assistant trained on GeminiHydra project knowledge. Answer questions accurately based on your training.',
    } = config;

    console.log(chalk.cyan(`[KnowledgeAgent] Creating custom model: ${modelName}`));

    // Export training data
    const _trainingPath = await this.prepareTrainingData();

    // Create Modelfile
    const modelfilePath = path.join(MODELS_DIR, 'Modelfile');
    const modelfileContent = `FROM ${baseModel}

SYSTEM """
${systemPrompt}

You have been trained on the following knowledge base:
- Project architecture and patterns
- Code patterns and best practices
- Bug fixes and solutions
- Lessons learned from previous work
"""

PARAMETER temperature 0.3
PARAMETER num_ctx 4096
`;

    await fs.writeFile(modelfilePath, modelfileContent);

    // Create model using Ollama
    try {
      console.log(chalk.gray(`[KnowledgeAgent] Building model from ${baseModel}...`));

      // Note: Full fine-tuning requires Ollama with training support
      // For now, we create a model with custom system prompt
      // Ollama create API uses 'from' to specify base model
      await ollama.create({
        model: modelName,
        from: baseModel,
        template: systemPrompt,
      });

      this.localModel = modelName;
      console.log(chalk.green(`[KnowledgeAgent] Model created: ${modelName}`));

      return modelName;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`[KnowledgeAgent] Model creation failed: ${msg}`));
      throw error;
    }
  }

  /**
   * Fine-tune model with training data (advanced)
   */
  async fineTuneModel(config: TrainingConfig): Promise<void> {
    // Note: This requires Ollama with training capabilities or external tools
    // For now, log instructions for manual fine-tuning

    const trainingPath = await this.prepareTrainingData();

    console.log(
      chalk.yellow(`
[KnowledgeAgent] Fine-tuning Instructions:

1. Training data exported to: ${trainingPath}

2. For Ollama fine-tuning (when supported):
   ollama train ${config.outputModel} --base ${config.baseModel} --data ${trainingPath}

3. For external fine-tuning (e.g., with llama.cpp):
   - Convert training data to appropriate format
   - Use LoRA or QLoRA for efficient fine-tuning
   - Import result into Ollama

4. Current knowledge base stats:
   ${JSON.stringify(knowledgeBank.getStats(), null, 2)}
`),
    );
  }

  // ============================================================
  // Statistics
  // ============================================================

  /**
   * Get agent statistics
   */
  getStats(): {
    knowledgeEntries: number;
    byType: Record<string, number>;
    bySource: Record<string, number>;
    hasLocalModel: boolean;
  } {
    const kbStats = knowledgeBank.getStats();

    return {
      knowledgeEntries: kbStats.totalEntries,
      byType: kbStats.byType,
      bySource: kbStats.bySource,
      hasLocalModel: false, // Will be updated async
    };
  }
}

// Global instance
export const knowledgeAgent = new KnowledgeAgent();

export default knowledgeAgent;
