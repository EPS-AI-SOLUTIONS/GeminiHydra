/**
 * KnowledgeCommands - CLI commands for knowledge management
 */

import path from 'node:path';
import chalk from 'chalk';
import { knowledgeAgent } from './KnowledgeAgent.js';
import { type KnowledgeType, knowledgeBank } from './KnowledgeBank.js';
import { AVAILABLE_BASE_MODELS, DEFAULT_TRAINING_CONFIG, modelTrainer } from './ModelTrainer.js';

// Re-export CommandContext from centralized location
export type { CommandContext } from '../cli/CommandRegistry.js';

import type { CommandContext } from '../cli/CommandRegistry.js';

/**
 * @deprecated Use CommandContext from '../cli/CommandRegistry.js' instead
 * Legacy interface kept for backward compatibility
 */
export interface LegacyCommandContext {
  cwd: string;
  args: string[];
}

function parseArgs(args: string[]): {
  positional: string[];
  flags: Record<string, string | boolean>;
} {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        flags[key] = nextArg;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith('-')) {
      flags[arg.slice(1)] = true;
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

// ============================================================
// /knowledge Command
// ============================================================

export async function knowledgeCommand(ctx: CommandContext): Promise<string> {
  const { positional, flags } = parseArgs(ctx.args);
  const subcommand = positional[0] || 'status';

  switch (subcommand) {
    case 'status':
    case 'stats':
      return await showStatus();

    case 'add':
      return await addKnowledge(positional.slice(1), flags);

    case 'search':
    case 'find':
      return await searchKnowledge(positional.slice(1).join(' '), flags);

    case 'ask':
    case 'query':
      return await askKnowledge(positional.slice(1).join(' '), flags);

    case 'learn':
      return await learnCommand(positional[1], ctx.cwd, flags);

    case 'list':
    case 'ls':
      return await listKnowledge(flags);

    case 'show':
    case 'get':
      return await showEntry(positional[1]);

    case 'delete':
    case 'rm':
      return await deleteEntry(positional[1]);

    case 'import':
      return await importKnowledge(positional[1], ctx.cwd, flags);

    case 'export':
      return await exportKnowledge(positional[1], flags);

    case 'train':
    case 'model':
      return await trainModel(flags);

    case 'prune':
      return await pruneKnowledge(flags);

    default:
      return knowledgeHelp();
  }
}

// ============================================================
// Subcommand Implementations
// ============================================================

async function showStatus(): Promise<string> {
  await knowledgeBank.init();

  const stats = knowledgeBank.getStats();
  const _agentStats = knowledgeAgent.getStats();

  const lines: string[] = [];
  lines.push(chalk.bold.cyan('\n Knowledge Bank Status\n'));
  lines.push(chalk.gray('─'.repeat(50)));

  lines.push(`Total entries: ${chalk.green(stats.totalEntries.toString())}`);
  lines.push(`Entries with embeddings: ${chalk.green(stats.embeddingsCount.toString())}`);

  if (Object.keys(stats.byType).length > 0) {
    lines.push(chalk.bold('\n By Type:'));
    for (const [type, count] of Object.entries(stats.byType)) {
      const bar = '█'.repeat(Math.min(20, count));
      lines.push(`  ${type.padEnd(16)} ${chalk.blue(bar)} ${count}`);
    }
  }

  if (Object.keys(stats.bySource).length > 0) {
    lines.push(chalk.bold('\n By Source:'));
    for (const [source, count] of Object.entries(stats.bySource)) {
      lines.push(`  ${source.padEnd(12)} ${count}`);
    }
  }

  if (stats.topTags.length > 0) {
    lines.push(chalk.bold('\n Top Tags:'));
    lines.push(`  ${stats.topTags.map((t) => `${t.tag}(${t.count})`).join(', ')}`);
  }

  lines.push(chalk.gray('\n─'.repeat(50)));
  return lines.join('\n');
}

async function addKnowledge(
  args: string[],
  flags: Record<string, string | boolean>,
): Promise<string> {
  if (args.length < 2) {
    return chalk.yellow(
      '\nUsage: /knowledge add <type> <title> --content "content" [--tags "tag1,tag2"]',
    );
  }

  await knowledgeBank.init();

  const type = args[0] as KnowledgeType;
  const title = args.slice(1).join(' ');
  const content = (flags.content as string) || (flags.c as string) || '';
  const tags = ((flags.tags as string) || '').split(',').filter(Boolean);
  const importance = parseFloat((flags.importance as string) || '0.5');

  if (!content) {
    return chalk.yellow('\nContent is required. Use --content "your content"');
  }

  const entry = await knowledgeBank.add(type, title, content, {
    source: 'user',
    tags,
    importance,
  });

  return chalk.green(
    `\n Knowledge added: ${entry.title}\n  ID: ${entry.id}\n  Type: ${entry.type}`,
  );
}

async function searchKnowledge(
  query: string,
  flags: Record<string, string | boolean>,
): Promise<string> {
  if (!query.trim()) {
    return chalk.yellow('\nProvide search query: /knowledge search <query>');
  }

  await knowledgeBank.init();

  const limit = parseInt((flags.limit as string) || '10', 10);
  const type = flags.type as KnowledgeType | undefined;

  const results = await knowledgeBank.search(query, {
    limit,
    types: type ? [type] : undefined,
    useSemanticSearch: !flags.keyword,
  });

  if (results.length === 0) {
    return chalk.yellow(`\nNo results found for: "${query}"`);
  }

  const lines: string[] = [];
  lines.push(chalk.bold.cyan(`\n Search Results for: "${query}"\n`));

  for (const result of results) {
    const icon = result.matchType === 'semantic' ? '🧠' : '🔤';
    lines.push(`${icon} ${chalk.bold(result.entry.title)} [${result.entry.type}]`);
    lines.push(chalk.gray(`   ID: ${result.entry.id} | Score: ${result.score.toFixed(2)}`));
    lines.push(
      `   ${result.entry.summary?.slice(0, 100) || result.entry.content.slice(0, 100)}...`,
    );
    lines.push(`   Tags: ${result.entry.tags.slice(0, 5).join(', ')}`);
    lines.push('');
  }

  return lines.join('\n');
}

async function askKnowledge(
  question: string,
  flags: Record<string, string | boolean>,
): Promise<string> {
  if (!question.trim()) {
    return chalk.yellow('\nProvide a question: /knowledge ask <question>');
  }

  await knowledgeAgent.init();

  console.log(chalk.gray('[KnowledgeAgent] Searching knowledge base...'));

  const response = await knowledgeAgent.query(question, {
    useLocalModel: !!flags.local,
    maxKnowledge: parseInt((flags.sources as string) || '5', 10),
    includeProjectContext: !flags['no-project'],
  });

  const lines: string[] = [];
  lines.push(chalk.bold.cyan('\n Knowledge Agent Response\n'));
  lines.push(chalk.gray('─'.repeat(50)));
  lines.push(response.answer);
  lines.push(chalk.gray('─'.repeat(50)));

  if (response.sources.length > 0) {
    lines.push(chalk.bold(`\n Sources (${response.sources.length}):`));
    for (const src of response.sources) {
      lines.push(`  📚 ${src.title} [${src.type}]`);
    }
  }

  lines.push(chalk.gray(`\nConfidence: ${(response.confidence * 100).toFixed(0)}%`));

  return lines.join('\n');
}

async function learnCommand(
  source: string | undefined,
  cwd: string,
  flags: Record<string, string | boolean>,
): Promise<string> {
  await knowledgeAgent.init();

  const lines: string[] = [];

  if (!source || source === 'all') {
    // Learn from all sources
    lines.push(chalk.cyan('\n Learning from all sources...\n'));

    // Learn from codebase
    const codebasePath = (flags.path as string) || cwd;
    console.log(chalk.gray(`[Learn] Analyzing codebase: ${codebasePath}`));
    const codebaseResult = await knowledgeAgent.learnFromCodebase(codebasePath);
    lines.push(`  📁 Codebase: ${codebaseResult.extracted} entries`);

    // Learn from sessions
    console.log(chalk.gray('[Learn] Analyzing session history...'));
    const sessionResult = await knowledgeAgent.learnFromSessions();
    lines.push(`  💬 Sessions: ${sessionResult.extracted} entries`);

    const total = codebaseResult.extracted + sessionResult.extracted;
    lines.push(chalk.green(`\n Total learned: ${total} entries`));
  } else if (source === 'codebase' || source === 'code') {
    const codebasePath = (flags.path as string) || cwd;
    const result = await knowledgeAgent.learnFromCodebase(codebasePath);
    lines.push(chalk.green(`\n Learned ${result.extracted} entries from codebase`));
  } else if (source === 'sessions' || source === 'history') {
    const result = await knowledgeAgent.learnFromSessions();
    lines.push(chalk.green(`\n Learned ${result.extracted} entries from sessions`));
  } else {
    return chalk.yellow('\nUsage: /knowledge learn [all|codebase|sessions] [--path <dir>]');
  }

  return lines.join('\n');
}

async function listKnowledge(flags: Record<string, string | boolean>): Promise<string> {
  await knowledgeBank.init();

  const type = flags.type as KnowledgeType | undefined;
  const limit = parseInt((flags.limit as string) || '20', 10);
  const sortBy = (flags.sort as 'recent' | 'accessed' | 'importance') || 'recent';

  const entries = knowledgeBank.list({ type, limit, sortBy });

  if (entries.length === 0) {
    return chalk.yellow('\nNo knowledge entries found.');
  }

  const lines: string[] = [];
  lines.push(chalk.bold.cyan(`\n Knowledge Entries (${entries.length})\n`));

  for (const entry of entries) {
    const importanceBar = '●'.repeat(Math.ceil(entry.metadata.importance * 5));
    lines.push(`${chalk.bold(entry.title)} [${entry.type}]`);
    lines.push(chalk.gray(`  ID: ${entry.id} | ${entry.source} | Importance: ${importanceBar}`));
    lines.push(`  Tags: ${entry.tags.slice(0, 5).join(', ')}`);
    lines.push('');
  }

  return lines.join('\n');
}

async function showEntry(id: string): Promise<string> {
  if (!id) {
    return chalk.yellow('\nProvide entry ID: /knowledge show <id>');
  }

  await knowledgeBank.init();
  const entry = knowledgeBank.get(id);

  if (!entry) {
    return chalk.red(`\nEntry not found: ${id}`);
  }

  const lines: string[] = [];
  lines.push(chalk.bold.cyan(`\n ${entry.title}\n`));
  lines.push(chalk.gray('─'.repeat(50)));
  lines.push(`Type: ${entry.type} | Source: ${entry.source}`);
  lines.push(`Created: ${entry.metadata.createdAt}`);
  lines.push(`Accessed: ${entry.metadata.accessCount} times`);
  lines.push(`Importance: ${(entry.metadata.importance * 100).toFixed(0)}%`);
  lines.push(`Tags: ${entry.tags.join(', ')}`);
  lines.push(chalk.gray('─'.repeat(50)));
  lines.push(entry.content);
  lines.push(chalk.gray('─'.repeat(50)));

  return lines.join('\n');
}

async function deleteEntry(id: string): Promise<string> {
  if (!id) {
    return chalk.yellow('\nProvide entry ID: /knowledge delete <id>');
  }

  await knowledgeBank.init();
  const deleted = await knowledgeBank.delete(id);

  if (deleted) {
    return chalk.green(`\n Entry deleted: ${id}`);
  }
  return chalk.red(`\n Entry not found: ${id}`);
}

async function importKnowledge(
  source: string,
  cwd: string,
  flags: Record<string, string | boolean>,
): Promise<string> {
  if (!source) {
    return chalk.yellow('\nProvide file or directory: /knowledge import <path>');
  }

  await knowledgeBank.init();

  const fullPath = path.resolve(cwd, source);
  const type = (flags.type as KnowledgeType) || 'documentation';

  try {
    const stats = await import('node:fs/promises').then((fs) => fs.stat(fullPath));

    if (stats.isDirectory()) {
      const extensions = ((flags.ext as string) || '.md,.txt').split(',');
      const count = await knowledgeBank.importFromDirectory(fullPath, {
        extensions,
        type,
        recursive: !flags['no-recursive'],
      });
      return chalk.green(`\n Imported ${count} files from ${source}`);
    } else {
      await knowledgeBank.importFromFile(fullPath, type);
      return chalk.green(`\n Imported: ${source}`);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return chalk.red(`\n Import failed: ${msg}`);
  }
}

async function exportKnowledge(
  output: string | undefined,
  flags: Record<string, string | boolean>,
): Promise<string> {
  await knowledgeBank.init();

  if (flags.training) {
    const trainingPath = await knowledgeBank.exportForTraining();
    return chalk.green(`\n Training data exported to: ${trainingPath}`);
  }

  if (!output) {
    return chalk.yellow('\nProvide output path: /knowledge export <path.json>');
  }

  await knowledgeBank.exportToJSON(output);
  return chalk.green(`\n Knowledge exported to: ${output}`);
}

async function trainModel(flags: Record<string, string | boolean>): Promise<string> {
  const lines: string[] = [];

  // Check system status first
  if (flags.status || flags.check) {
    const system = await modelTrainer.checkSystem();
    lines.push(chalk.bold.cyan('\n🖥️ System Status for Model Training\n'));
    lines.push(chalk.gray('─'.repeat(50)));
    lines.push(`Python: ${system.python ? chalk.green('✓') : chalk.red('✗')}`);
    lines.push(
      `CUDA/GPU: ${system.cuda ? chalk.green(`✓ (${system.cudaVersion})`) : chalk.yellow('✗ (CPU only)')}`,
    );
    lines.push(`Memory: ${system.memory.toFixed(1)} GB`);
    lines.push(chalk.bold('\nPackages:'));
    for (const [pkg, installed] of Object.entries(system.packages)) {
      lines.push(`  ${pkg}: ${installed ? chalk.green('✓') : chalk.red('✗')}`);
    }

    const recommended = await modelTrainer.getRecommendedConfig();
    lines.push(chalk.bold('\n📋 Recommended Config:'));
    lines.push(`  Base model: ${recommended.baseModel}`);
    lines.push(`  Batch size: ${recommended.batchSize}`);
    lines.push(`  Epochs: ${recommended.epochs}`);
    lines.push(`  LoRA rank: ${recommended.loraRank}`);

    return lines.join('\n');
  }

  // List available models
  if (flags.models || flags.list) {
    const models = modelTrainer.getAvailableModels();
    lines.push(chalk.bold.cyan('\n📦 Available Base Models for Fine-tuning\n'));
    lines.push(chalk.gray('─'.repeat(50)));
    for (const [name, fullName] of Object.entries(models)) {
      lines.push(`  ${chalk.yellow(name.padEnd(20))} ${fullName}`);
    }
    lines.push(chalk.gray('\nUse: /knowledge train --base <model-name>'));
    return lines.join('\n');
  }

  // List trained models
  if (flags.trained) {
    const trained = await modelTrainer.listTrainedModels();
    if (trained.length === 0) {
      return chalk.yellow('\nNo trained models found. Use /knowledge train to create one.');
    }
    lines.push(chalk.bold.cyan('\n🎯 Trained Models\n'));
    for (const model of trained) {
      lines.push(`  ${chalk.green(model.name)}`);
      lines.push(chalk.gray(`    Path: ${model.path}`));
      lines.push(chalk.gray(`    Created: ${model.createdAt.toLocaleDateString()}`));
    }
    return lines.join('\n');
  }

  // Install dependencies
  if (flags.install) {
    lines.push(chalk.cyan('\n📥 Installing training dependencies...\n'));
    const success = await modelTrainer.installDependencies((progress) => {
      console.log(chalk.gray(`[${progress.progress}%] ${progress.message}`));
    });
    if (success) {
      lines.push(chalk.green('\n✓ Dependencies installed successfully!'));
      lines.push(chalk.gray('You can now train models with: /knowledge train'));
    } else {
      lines.push(chalk.red('\n✗ Dependency installation failed.'));
      lines.push(
        chalk.gray('Try manually: pip install torch transformers peft datasets trl unsloth'),
      );
    }
    return lines.join('\n');
  }

  // Quick model (use KnowledgeAgent - just system prompt, no real training)
  if (flags.quick) {
    await knowledgeAgent.init();
    const baseModel = (flags.base as string) || 'llama3.2:3b';
    const modelName = (flags.name as string) || 'geminihydra-quick';

    lines.push(chalk.cyan(`\n⚡ Creating quick model (custom system prompt): ${modelName}`));
    try {
      const createdModel = await knowledgeAgent.createCustomModel({
        baseModel,
        modelName,
      });
      lines.push(chalk.green(`\n✓ Quick model created: ${createdModel}`));
      lines.push(
        chalk.gray(
          'Note: This is not fine-tuned. For real training, use /knowledge train without --quick',
        ),
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      lines.push(chalk.red(`\n✗ Failed: ${msg}`));
    }
    return lines.join('\n');
  }

  // REAL TRAINING
  const baseModelKey = (flags.base as string) || 'llama-3.2-3b';
  const baseModel =
    AVAILABLE_BASE_MODELS[baseModelKey as keyof typeof AVAILABLE_BASE_MODELS] || baseModelKey;
  const outputName = (flags.name as string) || 'geminihydra-assistant';
  const epochs = parseInt((flags.epochs as string) || '3', 10);
  const batchSize = parseInt((flags.batch as string) || '2', 10);
  const loraRank = parseInt((flags.rank as string) || '16', 10);

  lines.push(chalk.bold.cyan('\n🚀 Starting Real Model Training\n'));
  lines.push(chalk.gray('─'.repeat(50)));
  lines.push(`Base model: ${chalk.yellow(baseModel)}`);
  lines.push(`Output name: ${chalk.green(outputName)}`);
  lines.push(`Epochs: ${epochs}`);
  lines.push(`Batch size: ${batchSize}`);
  lines.push(`LoRA rank: ${loraRank}`);

  // Check if ready
  const { ready, missing } = await modelTrainer.init();
  if (!ready) {
    lines.push(chalk.red(`\n✗ Missing dependencies: ${missing.join(', ')}`));
    lines.push(chalk.gray('Run: /knowledge train --install'));
    return lines.join('\n');
  }

  // Estimate time
  await knowledgeBank.init();
  const stats = knowledgeBank.getStats();
  const estimate = modelTrainer.estimateTrainingTime(
    { ...DEFAULT_TRAINING_CONFIG, epochs, batchSize, baseModel, outputName },
    stats.totalEntries,
  );
  lines.push(`Training samples: ${stats.totalEntries}`);
  lines.push(`Estimated time: ${chalk.yellow(estimate)}`);
  lines.push(chalk.gray('─'.repeat(50)));

  console.log(lines.join('\n'));
  lines.length = 0;

  // Start training
  lines.push(chalk.cyan('\n🔄 Training in progress...\n'));

  const result = await modelTrainer.train(
    {
      baseModel,
      outputName,
      epochs,
      batchSize,
      loraRank,
      loraAlpha: loraRank * 2,
      exportGguf: !flags['no-gguf'],
      registerOllama: !flags['no-ollama'],
    },
    (progress) => {
      const bar =
        '█'.repeat(Math.floor(progress.progress / 5)) +
        '░'.repeat(20 - Math.floor(progress.progress / 5));
      console.log(chalk.gray(`[${bar}] ${progress.progress}% - ${progress.message}`));
      if (progress.loss) {
        console.log(chalk.gray(`  Loss: ${progress.loss.toFixed(4)}`));
      }
    },
  );

  if (result.success) {
    lines.push(chalk.green('\n✅ Training Complete!\n'));
    lines.push(chalk.gray('─'.repeat(50)));
    lines.push(`Model path: ${result.modelPath}`);
    if (result.ggufPath) {
      lines.push(`GGUF path: ${result.ggufPath}`);
    }
    if (result.ollamaName) {
      lines.push(`Ollama model: ${chalk.green(result.ollamaName)}`);
      lines.push(chalk.gray(`\nUse with: ollama run ${result.ollamaName}`));
      lines.push(chalk.gray(`Or: /knowledge ask --local <question>`));
    }
    lines.push(`Training time: ${(result.trainingTime / 1000 / 60).toFixed(1)} minutes`);
  } else {
    lines.push(chalk.red(`\n✗ Training failed: ${result.error}`));
    lines.push(chalk.gray('\nTroubleshooting:'));
    lines.push(chalk.gray('  1. Check GPU memory (try smaller --batch 1)'));
    lines.push(chalk.gray('  2. Try smaller model (--base llama-3.2-1b)'));
    lines.push(chalk.gray('  3. Check Python dependencies (/knowledge train --status)'));
  }

  return lines.join('\n');
}

async function pruneKnowledge(flags: Record<string, string | boolean>): Promise<string> {
  await knowledgeBank.init();

  const maxAgeDays = parseInt((flags.days as string) || '90', 10);
  const minImportance = parseFloat((flags.importance as string) || '0.1');

  const pruned = await knowledgeBank.prune({
    maxAgeDays,
    minImportance,
  });

  return chalk.green(`\n Pruned ${pruned} old/unused entries`);
}

function knowledgeHelp(): string {
  return `
${chalk.bold.cyan('Knowledge Bank Commands')}

${chalk.bold('View & Search:')}
  ${chalk.yellow('/knowledge status')}              - Show knowledge bank stats
  ${chalk.yellow('/knowledge list')}                - List knowledge entries
  ${chalk.yellow('/knowledge show <id>')}           - Show entry details
  ${chalk.yellow('/knowledge search <query>')}      - Search knowledge (semantic + keyword)

${chalk.bold('Ask & Query:')}
  ${chalk.yellow('/knowledge ask <question>')}      - Ask question with RAG
    ${chalk.gray('--local                      Use local trained model')}
    ${chalk.gray('--sources <n>                Number of sources (default: 5)')}

${chalk.bold('Add & Learn:')}
  ${chalk.yellow('/knowledge add <type> <title>')}  - Add knowledge entry
    ${chalk.gray('--content "..."              Entry content (required)')}
    ${chalk.gray('--tags "tag1,tag2"           Tags')}
  ${chalk.yellow('/knowledge learn [source]')}      - Learn from sources
    ${chalk.gray('all                          Learn from all sources')}
    ${chalk.gray('codebase                     Learn from code')}
    ${chalk.gray('sessions                     Learn from chat history')}

${chalk.bold('Import & Export:')}
  ${chalk.yellow('/knowledge import <path>')}       - Import from file/directory
  ${chalk.yellow('/knowledge export <path>')}       - Export to JSON
    ${chalk.gray('--training                   Export for model training')}

${chalk.bold('Model Training:')}
  ${chalk.yellow('/knowledge train')}               - Train real AI model with LoRA
    ${chalk.gray('--base <model>               Base model (default: llama-3.2-3b)')}
    ${chalk.gray('--name <name>                Output model name')}
    ${chalk.gray('--epochs <n>                 Training epochs (default: 3)')}
    ${chalk.gray('--batch <n>                  Batch size (default: 2)')}
    ${chalk.gray('--rank <n>                   LoRA rank (default: 16)')}
  ${chalk.yellow('/knowledge train --status')}      - Check system readiness
  ${chalk.yellow('/knowledge train --models')}      - List available base models
  ${chalk.yellow('/knowledge train --trained')}     - List your trained models
  ${chalk.yellow('/knowledge train --install')}     - Install Python dependencies
  ${chalk.yellow('/knowledge train --quick')}       - Quick model (custom prompt only)

${chalk.bold('Maintenance:')}
  ${chalk.yellow('/knowledge delete <id>')}         - Delete entry
  ${chalk.yellow('/knowledge prune')}               - Remove old/unused entries

${chalk.bold('Knowledge Types:')}
  code_pattern, architecture, bug_fix, documentation,
  conversation, lesson_learned, api_reference, config, workflow
`;
}

export const knowledgeCommands = {
  knowledge: knowledgeCommand,
};

export default knowledgeCommands;
