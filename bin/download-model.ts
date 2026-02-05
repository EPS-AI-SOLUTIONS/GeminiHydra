#!/usr/bin/env npx tsx
/**
 * GeminiHydra - Model Downloader CLI
 * Pobiera modele GGUF z Hugging Face
 *
 * Usage:
 *   npx tsx bin/download-model.ts [model-name]
 *   npx tsx bin/download-model.ts --list
 *
 * Examples:
 *   npx tsx bin/download-model.ts tinyllama
 *   npx tsx bin/download-model.ts llama-3.2-1b
 *   npx tsx bin/download-model.ts --list
 */

import { downloadModel, listAvailableModels, RECOMMENDED_MODELS } from '../src/services/LlamaCppServer.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
GeminiHydra - Model Downloader

Usage:
  npx tsx bin/download-model.ts [model-name]
  npx tsx bin/download-model.ts --list

Available models:
${Object.entries(RECOMMENDED_MODELS)
  .map(([name, info]) => `  ${name.padEnd(15)} ${info.size}`)
  .join('\n')}

Examples:
  npx tsx bin/download-model.ts tinyllama     # Smallest, fastest (~0.7GB)
  npx tsx bin/download-model.ts llama-3.2-1b  # Good balance (~0.8GB)
  npx tsx bin/download-model.ts llama-3.2-3b  # Better quality (~2GB)
`);
    return;
  }

  if (args.includes('--list') || args.includes('-l')) {
    listAvailableModels();
    return;
  }

  const modelName = args[0];

  if (!RECOMMENDED_MODELS[modelName as keyof typeof RECOMMENDED_MODELS]) {
    console.error(`Unknown model: ${modelName}`);
    console.log('\nAvailable models:');
    Object.keys(RECOMMENDED_MODELS).forEach(name => console.log(`  - ${name}`));
    process.exit(1);
  }

  console.log(`\nDownloading ${modelName}...\n`);

  const modelPath = await downloadModel(modelName as keyof typeof RECOMMENDED_MODELS, './models');

  if (modelPath) {
    console.log(`\n✓ Model ready: ${modelPath}`);
    console.log(`\nTo use this model, set:`);
    console.log(`  export LLAMA_CPP_MODEL_PATH="${modelPath}"`);
    console.log(`\nOr just run 'npm start' - it will auto-detect the model.`);
  } else {
    console.error('\n✗ Download failed');
    process.exit(1);
  }
}

main().catch(console.error);
