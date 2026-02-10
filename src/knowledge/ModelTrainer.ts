/**
 * ModelTrainer - Real AI Model Fine-tuning System
 *
 * Tworzy prawdziwy, wytrenowany model AI używając:
 * 1. Unsloth/LoRA dla szybkiego fine-tuningu
 * 2. llama.cpp dla konwersji do GGUF
 * 3. Ollama dla deployment
 *
 * Wymagania:
 * - Python 3.10+
 * - CUDA (opcjonalnie, dla GPU)
 * - unsloth, transformers, peft
 * - llama.cpp (dla konwersji GGUF)
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { knowledgeBank } from './KnowledgeBank.js';
import { KNOWLEDGE_DIR } from '../config/paths.config.js';

const execAsync = promisify(exec);

const TRAINING_DIR = path.join(KNOWLEDGE_DIR, 'training');
const MODELS_DIR = path.join(KNOWLEDGE_DIR, 'models');
const SCRIPTS_DIR = path.join(KNOWLEDGE_DIR, 'scripts');

// ============================================================
// Types
// ============================================================

export interface TrainingConfig {
  // Base model
  baseModel: string;              // e.g., 'unsloth/Llama-3.2-3B-Instruct-bnb-4bit'
  outputName: string;             // Name for the trained model

  // Training parameters
  epochs: number;                 // Number of training epochs (1-5)
  batchSize: number;              // Batch size (1-8)
  learningRate: number;           // Learning rate (1e-5 to 5e-4)
  loraRank: number;               // LoRA rank (8, 16, 32, 64)
  loraAlpha: number;              // LoRA alpha (16, 32, 64)

  // Data
  maxSamples?: number;            // Limit training samples
  validationSplit: number;        // Validation split (0.1 = 10%)

  // Hardware
  useGpu: boolean;                // Use GPU if available
  quantization: '4bit' | '8bit' | 'none';

  // Output
  exportGguf: boolean;            // Convert to GGUF for Ollama
  ggufQuantization: string;       // e.g., 'Q4_K_M', 'Q5_K_M', 'Q8_0'
  registerOllama: boolean;        // Auto-register with Ollama
}

export interface TrainingProgress {
  stage: 'preparing' | 'training' | 'converting' | 'registering' | 'complete' | 'error';
  progress: number;               // 0-100
  currentEpoch?: number;
  totalEpochs?: number;
  loss?: number;
  eta?: string;
  message: string;
}

export interface TrainingResult {
  success: boolean;
  modelPath?: string;
  ggufPath?: string;
  ollamaName?: string;
  trainingTime: number;
  finalLoss?: number;
  error?: string;
}

export type ProgressCallback = (progress: TrainingProgress) => void;

// ============================================================
// Default Configurations
// ============================================================

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  baseModel: 'unsloth/Llama-3.2-3B-Instruct-bnb-4bit',
  outputName: 'geminihydra-assistant',
  epochs: 3,
  batchSize: 2,
  learningRate: 2e-4,
  loraRank: 16,
  loraAlpha: 32,
  validationSplit: 0.1,
  useGpu: true,
  quantization: '4bit',
  exportGguf: true,
  ggufQuantization: 'Q4_K_M',
  registerOllama: true
};

// Available base models optimized for fine-tuning
export const AVAILABLE_BASE_MODELS: Record<string, string> = {
  // Qwen3 (recommended - latest generation, thinking mode)
  'qwen3-0.6b': 'Qwen/Qwen3-0.6B',
  'qwen3-1.7b': 'Qwen/Qwen3-1.7B',
  'qwen3-4b': 'Qwen/Qwen3-4B',
  'qwen3-8b': 'Qwen/Qwen3-8B',
  'qwen3-14b': 'Qwen/Qwen3-14B',

  // Qwen 2.5 (legacy, for coding fine-tuning)
  'qwen-2.5-coder-7b': 'unsloth/Qwen2.5-Coder-7B-Instruct-bnb-4bit',

  // Gemma 2 (Google)
  'gemma-2-2b': 'unsloth/gemma-2-2b-it-bnb-4bit',
  'gemma-2-9b': 'unsloth/gemma-2-9b-it-bnb-4bit'
};

// ============================================================
// ModelTrainer Class
// ============================================================

export class ModelTrainer {
  private pythonPath: string = 'python';
  private initialized = false;

  constructor() {}

  /**
   * Initialize trainer - check dependencies
   */
  async init(): Promise<{ ready: boolean; missing: string[] }> {
    if (this.initialized) return { ready: true, missing: [] };

    await fs.mkdir(TRAINING_DIR, { recursive: true });
    await fs.mkdir(MODELS_DIR, { recursive: true });
    await fs.mkdir(SCRIPTS_DIR, { recursive: true });

    const missing: string[] = [];

    // Check Python
    try {
      await execAsync('python --version');
    } catch {
      try {
        await execAsync('python3 --version');
        this.pythonPath = 'python3';
      } catch {
        missing.push('python');
      }
    }

    // Check required packages
    const packages = ['torch', 'transformers', 'peft', 'datasets', 'trl'];
    for (const pkg of packages) {
      try {
        await execAsync(`${this.pythonPath} -c "import ${pkg}"`);
      } catch {
        missing.push(pkg);
      }
    }

    // Check unsloth (optional but recommended)
    try {
      await execAsync(`${this.pythonPath} -c "import unsloth"`);
    } catch {
      // Unsloth is optional - we can train without it (slower)
      console.log(chalk.yellow('[ModelTrainer] Unsloth not installed (optional, speeds up training 2x)'));
    }

    this.initialized = missing.length === 0;
    return { ready: this.initialized, missing };
  }

  /**
   * Check if system is ready for training
   */
  async checkSystem(): Promise<{
    python: boolean;
    cuda: boolean;
    cudaVersion?: string;
    memory: number;
    packages: Record<string, boolean>;
  }> {
    const result = {
      python: false,
      cuda: false,
      cudaVersion: undefined as string | undefined,
      memory: os.totalmem() / (1024 * 1024 * 1024), // GB
      packages: {} as Record<string, boolean>
    };

    // Python
    try {
      await execAsync(`${this.pythonPath} --version`);
      result.python = true;
    } catch {}

    // CUDA
    try {
      const { stdout } = await execAsync(`${this.pythonPath} -c "import torch; print(torch.cuda.is_available(), torch.version.cuda if torch.cuda.is_available() else '')"`);
      const [available, version] = stdout.trim().split(' ');
      result.cuda = available === 'True';
      result.cudaVersion = version || undefined;
    } catch {}

    // Packages
    const packages = ['torch', 'transformers', 'peft', 'datasets', 'trl', 'unsloth', 'bitsandbytes'];
    for (const pkg of packages) {
      try {
        await execAsync(`${this.pythonPath} -c "import ${pkg}"`);
        result.packages[pkg] = true;
      } catch {
        result.packages[pkg] = false;
      }
    }

    return result;
  }

  /**
   * Install required dependencies
   */
  async installDependencies(onProgress?: ProgressCallback): Promise<boolean> {
    onProgress?.({
      stage: 'preparing',
      progress: 0,
      message: 'Installing Python dependencies...'
    });

    try {
      // Base packages
      await execAsync(`${this.pythonPath} -m pip install torch transformers peft datasets trl accelerate bitsandbytes`);

      onProgress?.({
        stage: 'preparing',
        progress: 50,
        message: 'Installing Unsloth for faster training...'
      });

      // Unsloth (optional but recommended)
      try {
        await execAsync(`${this.pythonPath} -m pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"`);
      } catch {
        console.log(chalk.yellow('[ModelTrainer] Unsloth installation failed (optional)'));
      }

      onProgress?.({
        stage: 'preparing',
        progress: 100,
        message: 'Dependencies installed'
      });

      return true;
    } catch (error: any) {
      console.error(chalk.red(`[ModelTrainer] Dependency installation failed: ${error.message}`));
      return false;
    }
  }

  // ============================================================
  // Training Data Preparation
  // ============================================================

  /**
   * Prepare training data from knowledge bank
   */
  async prepareTrainingData(options: {
    maxSamples?: number;
    includeCodebase?: boolean;
    includeSessions?: boolean;
    format: 'alpaca' | 'sharegpt' | 'conversation';
  } = { format: 'alpaca' }): Promise<string> {
    await knowledgeBank.init();

    const entries = knowledgeBank.list({ limit: options.maxSamples || 1000 });
    const trainingData: any[] = [];

    for (const entry of entries) {
      if (options.format === 'alpaca') {
        // Alpaca format: instruction, input, output
        trainingData.push({
          instruction: `Provide information about: ${entry.title}`,
          input: entry.tags.join(', '),
          output: entry.content
        });

        // Create Q&A variations
        if (entry.summary) {
          trainingData.push({
            instruction: `What is ${entry.title}?`,
            input: '',
            output: entry.summary
          });
        }

        // Type-specific questions
        if (entry.type === 'code_pattern') {
          trainingData.push({
            instruction: `How do I implement ${entry.title}?`,
            input: '',
            output: entry.content
          });
        } else if (entry.type === 'bug_fix') {
          trainingData.push({
            instruction: `How do I fix ${entry.title}?`,
            input: '',
            output: entry.content
          });
        }

      } else if (options.format === 'sharegpt') {
        // ShareGPT format: conversations
        trainingData.push({
          conversations: [
            { from: 'human', value: `Tell me about ${entry.title}` },
            { from: 'gpt', value: entry.content }
          ]
        });

      } else if (options.format === 'conversation') {
        // Simple conversation format
        trainingData.push({
          messages: [
            { role: 'user', content: `What is ${entry.title}?` },
            { role: 'assistant', content: entry.content }
          ]
        });
      }
    }

    // Save training data
    const timestamp = Date.now();
    const outputPath = path.join(TRAINING_DIR, `training_${timestamp}.json`);
    await fs.writeFile(outputPath, JSON.stringify(trainingData, null, 2));

    console.log(chalk.green(`[ModelTrainer] Prepared ${trainingData.length} training samples`));
    return outputPath;
  }

  // ============================================================
  // Model Training
  // ============================================================

  /**
   * Train a model using the knowledge bank
   */
  async train(
    config: Partial<TrainingConfig> = {},
    onProgress?: ProgressCallback
  ): Promise<TrainingResult> {
    const startTime = Date.now();
    const fullConfig = { ...DEFAULT_TRAINING_CONFIG, ...config };

    try {
      // Step 1: Check dependencies
      onProgress?.({
        stage: 'preparing',
        progress: 0,
        message: 'Checking dependencies...'
      });

      const { ready, missing } = await this.init();
      if (!ready) {
        return {
          success: false,
          trainingTime: 0,
          error: `Missing dependencies: ${missing.join(', ')}`
        };
      }

      // Step 2: Prepare training data
      onProgress?.({
        stage: 'preparing',
        progress: 10,
        message: 'Preparing training data...'
      });

      const dataPath = await this.prepareTrainingData({
        maxSamples: fullConfig.maxSamples,
        format: 'alpaca'
      });

      // Step 3: Generate training script
      onProgress?.({
        stage: 'preparing',
        progress: 20,
        message: 'Generating training script...'
      });

      const scriptPath = await this.generateTrainingScript(fullConfig, dataPath);

      // Step 4: Run training
      onProgress?.({
        stage: 'training',
        progress: 25,
        currentEpoch: 0,
        totalEpochs: fullConfig.epochs,
        message: 'Starting training...'
      });

      const modelPath = await this.runTrainingScript(scriptPath, fullConfig, onProgress);

      // Step 5: Convert to GGUF if requested
      let ggufPath: string | undefined;
      if (fullConfig.exportGguf) {
        onProgress?.({
          stage: 'converting',
          progress: 85,
          message: 'Converting to GGUF format...'
        });

        ggufPath = await this.convertToGguf(modelPath, fullConfig);
      }

      // Step 6: Register with Ollama if requested
      let ollamaName: string | undefined;
      if (fullConfig.registerOllama && ggufPath) {
        onProgress?.({
          stage: 'registering',
          progress: 95,
          message: 'Registering with Ollama...'
        });

        ollamaName = await this.registerWithOllama(ggufPath, fullConfig);
      }

      onProgress?.({
        stage: 'complete',
        progress: 100,
        message: 'Training complete!'
      });

      return {
        success: true,
        modelPath,
        ggufPath,
        ollamaName,
        trainingTime: Date.now() - startTime
      };

    } catch (error: any) {
      onProgress?.({
        stage: 'error',
        progress: 0,
        message: error.message
      });

      return {
        success: false,
        trainingTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Generate Python training script
   */
  private async generateTrainingScript(config: TrainingConfig, dataPath: string): Promise<string> {
    const modelOutputDir = path.join(MODELS_DIR, config.outputName);
    await fs.mkdir(modelOutputDir, { recursive: true });

    const script = `#!/usr/bin/env python3
"""
GeminiHydra Model Training Script
Auto-generated for: ${config.outputName}
"""

import json
import os
import torch
from datetime import datetime

# Try to use Unsloth for 2x faster training
try:
    from unsloth import FastLanguageModel
    USE_UNSLOTH = True
    print("[Training] Using Unsloth for faster training")
except ImportError:
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import LoraConfig, get_peft_model
    USE_UNSLOTH = False
    print("[Training] Unsloth not available, using standard training")

from datasets import load_dataset, Dataset
from trl import SFTTrainer
from transformers import TrainingArguments

# Configuration
MODEL_NAME = "${config.baseModel}"
OUTPUT_DIR = "${modelOutputDir.replace(/\\/g, '/')}"
DATA_PATH = "${dataPath.replace(/\\/g, '/')}"

# Training parameters
EPOCHS = ${config.epochs}
BATCH_SIZE = ${config.batchSize}
LEARNING_RATE = ${config.learningRate}
LORA_RANK = ${config.loraRank}
LORA_ALPHA = ${config.loraAlpha}
MAX_SEQ_LENGTH = 2048

print(f"[Training] Starting training: {MODEL_NAME}")
print(f"[Training] Output: {OUTPUT_DIR}")
print(f"[Training] Epochs: {EPOCHS}, Batch: {BATCH_SIZE}, LR: {LEARNING_RATE}")

# Load training data
with open(DATA_PATH, 'r', encoding='utf-8') as f:
    raw_data = json.load(f)

# Format for training
def format_prompt(sample):
    instruction = sample.get('instruction', '')
    input_text = sample.get('input', '')
    output = sample.get('output', '')

    if input_text:
        return f"""### Instruction:
{instruction}

### Input:
{input_text}

### Response:
{output}"""
    else:
        return f"""### Instruction:
{instruction}

### Response:
{output}"""

formatted_data = [{"text": format_prompt(s)} for s in raw_data]
dataset = Dataset.from_list(formatted_data)

print(f"[Training] Loaded {len(dataset)} training samples")

# Load model
if USE_UNSLOTH:
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=MODEL_NAME,
        max_seq_length=MAX_SEQ_LENGTH,
        dtype=None,  # Auto-detect
        load_in_4bit=True,
    )

    # Add LoRA adapters
    model = FastLanguageModel.get_peft_model(
        model,
        r=LORA_RANK,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
        lora_alpha=LORA_ALPHA,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=42,
    )
else:
    # Standard loading
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        torch_dtype=torch.float16,
        device_map="auto",
        load_in_4bit=True,
    )

    # Add LoRA
    lora_config = LoraConfig(
        r=LORA_RANK,
        lora_alpha=LORA_ALPHA,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)

# Training arguments
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    num_train_epochs=EPOCHS,
    per_device_train_batch_size=BATCH_SIZE,
    gradient_accumulation_steps=4,
    learning_rate=LEARNING_RATE,
    weight_decay=0.01,
    warmup_steps=5,
    logging_steps=1,
    save_strategy="epoch",
    fp16=not torch.cuda.is_bf16_supported(),
    bf16=torch.cuda.is_bf16_supported() if torch.cuda.is_available() else False,
    optim="adamw_8bit",
    report_to="none",
)

# Trainer
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    dataset_text_field="text",
    max_seq_length=MAX_SEQ_LENGTH,
    args=training_args,
)

print("[Training] Starting training loop...")
trainer.train()

print("[Training] Saving model...")
model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)

# Save merged model for GGUF conversion
if USE_UNSLOTH:
    print("[Training] Saving merged model...")
    model.save_pretrained_merged(
        OUTPUT_DIR + "_merged",
        tokenizer,
        save_method="merged_16bit",
    )

print(f"[Training] Complete! Model saved to: {OUTPUT_DIR}")
`;

    const scriptPath = path.join(SCRIPTS_DIR, `train_${config.outputName}.py`);
    await fs.writeFile(scriptPath, script);

    return scriptPath;
  }

  /**
   * Run the training script
   */
  private async runTrainingScript(
    scriptPath: string,
    config: TrainingConfig,
    onProgress?: ProgressCallback
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(this.pythonPath, [scriptPath], {
        env: {
          ...globalThis.process.env,
          CUDA_VISIBLE_DEVICES: config.useGpu ? '0' : '',
          PYTORCH_CUDA_ALLOC_CONF: 'expandable_segments:True'
        }
      });

      let currentEpoch = 0;

      childProcess.stdout?.on('data', (data: Buffer) => {
        const line = data.toString();
        console.log(chalk.gray(line.trim()));

        // Parse progress from output
        if (line.includes('Epoch')) {
          const match = line.match(/Epoch (\d+)/);
          if (match) {
            currentEpoch = parseInt(match[1]);
            const progress = 25 + (currentEpoch / config.epochs) * 60;
            onProgress?.({
              stage: 'training',
              progress,
              currentEpoch,
              totalEpochs: config.epochs,
              message: `Training epoch ${currentEpoch}/${config.epochs}`
            });
          }
        }

        if (line.includes('loss')) {
          const match = line.match(/loss[:\s]+([0-9.]+)/);
          if (match) {
            onProgress?.({
              stage: 'training',
              progress: 25 + (currentEpoch / config.epochs) * 60,
              currentEpoch,
              totalEpochs: config.epochs,
              loss: parseFloat(match[1]),
              message: `Loss: ${match[1]}`
            });
          }
        }
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        console.error(chalk.red(data.toString()));
      });

      childProcess.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(path.join(MODELS_DIR, config.outputName));
        } else {
          reject(new Error(`Training failed with code ${code}`));
        }
      });

      childProcess.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  // ============================================================
  // GGUF Conversion
  // ============================================================

  /**
   * Convert model to GGUF format for Ollama
   */
  private async convertToGguf(modelPath: string, config: TrainingConfig): Promise<string> {
    const mergedPath = modelPath + '_merged';
    const ggufPath = path.join(MODELS_DIR, `${config.outputName}.gguf`);

    // Check if llama.cpp convert script exists
    const convertScript = `
import subprocess
import sys
import os

model_path = "${mergedPath.replace(/\\/g, '/')}"
output_path = "${ggufPath.replace(/\\/g, '/')}"
quantization = "${config.ggufQuantization}"

# Try to use llama-cpp-python for conversion
try:
    from llama_cpp import llama_cpp
    print("[GGUF] Using llama-cpp-python for conversion")
    # Note: llama-cpp-python doesn't have direct convert, use CLI
except ImportError:
    pass

# Try llama.cpp CLI
try:
    # Check if llama.cpp is installed
    result = subprocess.run(
        ["python", "-m", "llama_cpp.llama_cpp", "--help"],
        capture_output=True, text=True
    )
except:
    print("[GGUF] llama.cpp not found, trying alternative method...")

# Alternative: use transformers to save in a format Ollama can read
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

print(f"[GGUF] Loading model from: {model_path}")
tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModelForCausalLM.from_pretrained(
    model_path,
    torch_dtype=torch.float16,
    device_map="auto"
)

# Save in safetensors format (Ollama can use this)
print(f"[GGUF] Saving to: {output_path}")
model.save_pretrained(output_path.replace('.gguf', ''), safe_serialization=True)
tokenizer.save_pretrained(output_path.replace('.gguf', ''))

print("[GGUF] Conversion complete!")
`;

    const convertScriptPath = path.join(SCRIPTS_DIR, 'convert_gguf.py');
    await fs.writeFile(convertScriptPath, convertScript);

    try {
      await execAsync(`${this.pythonPath} ${convertScriptPath}`);
      return ggufPath;
    } catch (error: any) {
      console.warn(chalk.yellow(`[ModelTrainer] GGUF conversion warning: ${error.message}`));
      // Return the merged model path as fallback
      return mergedPath;
    }
  }

  // ============================================================
  // Ollama Registration
  // ============================================================

  /**
   * Register model with Ollama
   */
  private async registerWithOllama(modelPath: string, config: TrainingConfig): Promise<string> {
    const ollamaName = config.outputName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    // Create Modelfile for Ollama
    const modelfilePath = path.join(MODELS_DIR, `Modelfile.${ollamaName}`);
    const modelfileContent = `# GeminiHydra Trained Model: ${config.outputName}
# Base: ${config.baseModel}
# Created: ${new Date().toISOString()}

FROM ${modelPath}

PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER num_ctx 4096

SYSTEM """You are a knowledgeable AI assistant trained on the GeminiHydra knowledge base.
You have expertise in:
- Software architecture and design patterns
- Code analysis and debugging
- Best practices and lessons learned
- Technical documentation

Always provide accurate, helpful responses based on your training."""
`;

    await fs.writeFile(modelfilePath, modelfileContent);

    // Create the model in Ollama
    try {
      await execAsync(`ollama create ${ollamaName} -f ${modelfilePath}`);
      console.log(chalk.green(`[ModelTrainer] Model registered with Ollama: ${ollamaName}`));
      return ollamaName;
    } catch (error: any) {
      console.warn(chalk.yellow(`[ModelTrainer] Ollama registration failed: ${error.message}`));
      console.log(chalk.gray(`To manually register: ollama create ${ollamaName} -f ${modelfilePath}`));
      return ollamaName;
    }
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /**
   * List available base models
   */
  getAvailableModels(): Record<string, string> {
    return AVAILABLE_BASE_MODELS;
  }

  /**
   * Get recommended config for hardware
   */
  async getRecommendedConfig(): Promise<Partial<TrainingConfig>> {
    const system = await this.checkSystem();

    if (!system.cuda) {
      // CPU only - use smallest model
      return {
        baseModel: AVAILABLE_BASE_MODELS['llama-3.2-1b'],
        batchSize: 1,
        epochs: 2,
        loraRank: 8,
        quantization: '4bit'
      };
    }

    // GPU available
    if (system.memory > 16) {
      // High memory - can use larger models
      return {
        baseModel: AVAILABLE_BASE_MODELS['llama-3.2-3b'],
        batchSize: 4,
        epochs: 3,
        loraRank: 16
      };
    }

    // Standard GPU
    return {
      baseModel: AVAILABLE_BASE_MODELS['llama-3.2-1b'],
      batchSize: 2,
      epochs: 3,
      loraRank: 16
    };
  }

  /**
   * Estimate training time
   */
  estimateTrainingTime(config: TrainingConfig, sampleCount: number): string {
    // Rough estimates based on experience
    const samplesPerHour = config.useGpu ? 500 : 50;
    const epochTime = sampleCount / samplesPerHour;
    const totalHours = epochTime * config.epochs;

    if (totalHours < 1) {
      return `~${Math.round(totalHours * 60)} minutes`;
    }
    return `~${totalHours.toFixed(1)} hours`;
  }

  /**
   * List trained models
   */
  async listTrainedModels(): Promise<Array<{
    name: string;
    path: string;
    size: number;
    createdAt: Date;
  }>> {
    const models: Array<{ name: string; path: string; size: number; createdAt: Date }> = [];

    try {
      const entries = await fs.readdir(MODELS_DIR, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const modelPath = path.join(MODELS_DIR, entry.name);
          const stats = await fs.stat(modelPath);

          models.push({
            name: entry.name,
            path: modelPath,
            size: 0, // Would need to calculate directory size
            createdAt: stats.birthtime
          });
        }
      }
    } catch {}

    return models;
  }
}

// Global instance
export const modelTrainer = new ModelTrainer();

export default modelTrainer;
