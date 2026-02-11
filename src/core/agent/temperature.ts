/**
 * Agent - Adaptive Temperature System v2.0
 *
 * TemperatureController class, default agent profiles, and
 * temperature calculation/detection functions.
 *
 * @module core/agent/temperature
 */

import type {
  AdaptiveTemperatureConfig,
  AgentTemperatureProfile,
  TaskType,
  TemperatureContext,
  TemperaturePerformanceRecord,
} from './types.js';

// ============================================================================
// DEFAULT AGENT TEMPERATURE PROFILES (GEMINI 3 OPTIMIZED)
// ============================================================================

export const DEFAULT_AGENT_PROFILES: Record<string, AgentTemperatureProfile> = {
  dijkstra: {
    name: 'dijkstra',
    role: 'Strategist',
    baseRanges: {
      code: [0.85, 1.0],
      fix: [0.8, 0.95],
      analysis: [0.95, 1.1],
      creative: [1.2, 1.5],
      planning: [0.85, 1.05],
      general: [0.95, 1.1],
    },
    creativityBias: -0.05,
    precisionBias: 0.05,
    preferredTemp: 0.95,
    performanceHistory: [],
  },
  ciri: {
    name: 'ciri',
    role: 'Scout',
    baseRanges: {
      code: [0.95, 1.15],
      fix: [0.9, 1.1],
      analysis: [1.0, 1.2],
      creative: [1.4, 1.7],
      planning: [1.0, 1.2],
      general: [1.1, 1.4],
    },
    creativityBias: 0.1,
    precisionBias: -0.05,
    preferredTemp: 1.15,
    performanceHistory: [],
  },
  yennefer: {
    name: 'yennefer',
    role: 'Architect',
    baseRanges: {
      code: [0.8, 0.95],
      fix: [0.8, 0.95],
      analysis: [0.95, 1.1],
      creative: [1.2, 1.5],
      planning: [0.85, 1.05],
      general: [0.95, 1.15],
    },
    creativityBias: 0.05,
    precisionBias: 0.1,
    preferredTemp: 0.9,
    performanceHistory: [],
  },
  geralt: {
    name: 'geralt',
    role: 'Security',
    baseRanges: {
      code: [0.75, 0.9],
      fix: [0.75, 0.9],
      analysis: [0.85, 1.0],
      creative: [1.0, 1.2],
      planning: [0.8, 0.95],
      general: [0.85, 1.0],
    },
    creativityBias: -0.1,
    precisionBias: 0.15,
    preferredTemp: 0.85,
    performanceHistory: [],
  },
  triss: {
    name: 'triss',
    role: 'QA',
    baseRanges: {
      code: [0.8, 0.95],
      fix: [0.8, 0.95],
      analysis: [0.95, 1.1],
      creative: [1.2, 1.5],
      planning: [0.95, 1.1],
      general: [1.0, 1.2],
    },
    creativityBias: 0.05,
    precisionBias: 0.05,
    preferredTemp: 1.0,
    performanceHistory: [],
  },
  lambert: {
    name: 'lambert',
    role: 'Debugger',
    baseRanges: {
      code: [0.78, 0.92],
      fix: [0.75, 0.9],
      analysis: [0.85, 1.05],
      creative: [1.0, 1.2],
      planning: [0.85, 1.05],
      general: [0.95, 1.1],
    },
    creativityBias: -0.05,
    precisionBias: 0.1,
    preferredTemp: 0.88,
    performanceHistory: [],
  },
  jaskier: {
    name: 'jaskier',
    role: 'Bard',
    baseRanges: {
      code: [1.0, 1.2],
      fix: [0.95, 1.1],
      analysis: [1.1, 1.3],
      creative: [1.5, 1.9],
      planning: [1.1, 1.3],
      general: [1.3, 1.6],
    },
    creativityBias: 0.15,
    precisionBias: -0.1,
    preferredTemp: 1.45,
    performanceHistory: [],
  },
  regis: {
    name: 'regis',
    role: 'Researcher',
    baseRanges: {
      code: [0.85, 1.0],
      fix: [0.85, 1.0],
      analysis: [1.0, 1.2],
      creative: [1.3, 1.55],
      planning: [0.95, 1.1],
      general: [1.1, 1.3],
    },
    creativityBias: 0.05,
    precisionBias: 0.05,
    preferredTemp: 1.1,
    performanceHistory: [],
  },
  vesemir: {
    name: 'vesemir',
    role: 'Mentor',
    baseRanges: {
      code: [0.85, 1.0],
      fix: [0.85, 1.0],
      analysis: [1.0, 1.2],
      creative: [1.2, 1.5],
      planning: [0.95, 1.1],
      general: [1.0, 1.2],
    },
    creativityBias: 0.0,
    precisionBias: 0.05,
    preferredTemp: 1.05,
    performanceHistory: [],
  },
  eskel: {
    name: 'eskel',
    role: 'DevOps',
    baseRanges: {
      code: [0.8, 0.95],
      fix: [0.8, 0.95],
      analysis: [0.95, 1.1],
      creative: [1.1, 1.3],
      planning: [0.85, 1.05],
      general: [0.95, 1.1],
    },
    creativityBias: -0.05,
    precisionBias: 0.1,
    preferredTemp: 0.95,
    performanceHistory: [],
  },
  zoltan: {
    name: 'zoltan',
    role: 'Data',
    baseRanges: {
      code: [0.8, 0.95],
      fix: [0.8, 0.95],
      analysis: [0.95, 1.1],
      creative: [1.1, 1.35],
      planning: [0.95, 1.1],
      general: [1.0, 1.2],
    },
    creativityBias: 0.0,
    precisionBias: 0.1,
    preferredTemp: 0.95,
    performanceHistory: [],
  },
  philippa: {
    name: 'philippa',
    role: 'API',
    baseRanges: {
      code: [0.8, 0.95],
      fix: [0.8, 0.95],
      analysis: [0.95, 1.1],
      creative: [1.1, 1.35],
      planning: [0.85, 1.05],
      general: [0.95, 1.1],
    },
    creativityBias: 0.0,
    precisionBias: 0.1,
    preferredTemp: 0.9,
    performanceHistory: [],
  },
  // FIX #1: Serena agent was missing temperature profile — caused fallback to generic defaults
  serena: {
    name: 'serena',
    role: 'CodeIntel',
    baseRanges: {
      code: [0.75, 0.9],
      fix: [0.75, 0.9],
      analysis: [0.9, 1.05],
      creative: [1.0, 1.2],
      planning: [0.8, 0.95],
      general: [0.85, 1.0],
    },
    creativityBias: -0.05,
    precisionBias: 0.15,
    preferredTemp: 0.85,
    performanceHistory: [],
  },
  // Keira Metz - Phase Verification Agent: lowest temperature in the system for deterministic verdicts
  keira: {
    name: 'keira',
    role: 'Verifier',
    baseRanges: {
      code: [0.25, 0.4],
      fix: [0.25, 0.4],
      analysis: [0.3, 0.5],
      creative: [0.5, 0.7],
      planning: [0.3, 0.45],
      general: [0.3, 0.5],
    },
    creativityBias: -0.15,
    precisionBias: 0.2,
    preferredTemp: 0.35,
    performanceHistory: [],
  },
};

/**
 * GEMINI 3 OPTIMIZED Temperature Configuration
 */
const DEFAULT_TEMPERATURE_CONFIG: AdaptiveTemperatureConfig = {
  agentProfiles: DEFAULT_AGENT_PROFILES,
  enableDynamicAdjustment: true,
  enableAnnealing: true,
  enableContextAwareness: true,
  enableUncertaintyBoost: true,
  enableLearning: true,
  annealingRate: 0.02,
  annealingMinTemp: 0.75,
  uncertaintyBoostFactor: 1.15,
  uncertaintyThreshold: 0.5,
  learningRate: 0.05,
  historySize: 50,
};

// ============================================================================
// TEMPERATURE CONTROLLER CLASS
// ============================================================================

export class TemperatureController {
  private config: AdaptiveTemperatureConfig;
  private globalHistory: TemperaturePerformanceRecord[] = [];
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: assigned in constructor for future use
  private sessionStartTime: number;

  constructor(config: Partial<AdaptiveTemperatureConfig> = {}) {
    this.config = { ...DEFAULT_TEMPERATURE_CONFIG, ...config };
    this.sessionStartTime = Date.now();

    if (config.agentProfiles) {
      this.config.agentProfiles = {
        ...DEFAULT_AGENT_PROFILES,
        ...config.agentProfiles,
      };
    }
  }

  getTemperatureForAgent(agentName: string, taskType: TaskType, task: string = ''): number {
    const profile = this.config.agentProfiles[agentName] || this.createDefaultProfile(agentName);
    const [minTemp, maxTemp] = profile.baseRanges[taskType] || profile.baseRanges.general;
    let temperature = (minTemp + maxTemp) / 2;
    temperature += profile.creativityBias;
    temperature -= profile.precisionBias;

    if (task) {
      const lengthFactor = Math.min(task.length / 3000, 1);
      temperature -= lengthFactor * 0.05;
    }

    if (this.config.enableLearning && profile.performanceHistory.length > 5) {
      const optimalTemp = this.calculateOptimalFromHistory(profile.performanceHistory, taskType);
      temperature = temperature * 0.8 + optimalTemp * 0.2;
    }

    temperature = Math.max(minTemp, Math.min(maxTemp, temperature));
    return this.round(temperature);
  }

  adjustTemperatureDuringGeneration(currentTemp: number, context: TemperatureContext): number {
    let adjustedTemp = currentTemp;

    if (this.config.enableAnnealing) {
      const progress = context.generationProgress;
      const annealingFactor = 1 - progress * this.config.annealingRate;
      adjustedTemp *= annealingFactor;
      adjustedTemp = Math.max(adjustedTemp, this.config.annealingMinTemp);
    }

    if (this.config.enableUncertaintyBoost) {
      if (context.confidenceLevel < this.config.uncertaintyThreshold) {
        const uncertaintyMultiplier =
          1 +
          (this.config.uncertaintyThreshold - context.confidenceLevel) *
            (this.config.uncertaintyBoostFactor - 1);
        adjustedTemp *= uncertaintyMultiplier;
      }
      if (context.retryCount > 0) {
        adjustedTemp *= 1 + context.retryCount * 0.05;
      }
    }

    if (this.config.enableContextAwareness && context.previousResults.length > 0) {
      const recentResults = context.previousResults.slice(-3);
      const avgQuality =
        recentResults.reduce((sum, r) => sum + r.quality, 0) / recentResults.length;

      if (avgQuality > 0.7) {
        const avgSuccessTemp =
          recentResults.filter((r) => r.wasSuccessful).reduce((sum, r) => sum + r.temperature, 0) /
          (recentResults.filter((r) => r.wasSuccessful).length || 1);
        adjustedTemp = adjustedTemp * 0.7 + avgSuccessTemp * 0.3;
      }

      if (avgQuality < 0.4) {
        const lastTemp = recentResults[recentResults.length - 1]?.temperature || adjustedTemp;
        adjustedTemp = adjustedTemp + (adjustedTemp - lastTemp) * 0.2;
      }
    }

    if (this.config.enableDynamicAdjustment && context.totalSteps > 1) {
      const stepProgress = context.currentStep / context.totalSteps;
      if (stepProgress < 0.3) {
        adjustedTemp *= 1.05;
      } else if (stepProgress > 0.7) {
        adjustedTemp *= 0.95;
      }
    }

    // FIX: Gemini 3 supports temperatures up to 2.0 — previous cap at 1.0 was killing
    // creative agents (jaskier, ciri, regis) whose profiles go above 1.0
    adjustedTemp = Math.max(0.05, Math.min(2.0, adjustedTemp));
    return this.round(adjustedTemp);
  }

  learnFromResult(
    agentName: string,
    temperature: number,
    taskType: TaskType,
    qualityScore: number,
    responseTime: number = 0,
    wasSuccessful: boolean = true,
  ): void {
    if (!this.config.enableLearning) return;

    const record: TemperaturePerformanceRecord = {
      timestamp: Date.now(),
      temperature,
      taskType,
      qualityScore: Math.max(0, Math.min(1, qualityScore)),
      responseTime,
      wasSuccessful,
    };

    const profile = this.config.agentProfiles[agentName];
    if (profile) {
      profile.performanceHistory.push(record);
      if (profile.performanceHistory.length > this.config.historySize) {
        profile.performanceHistory = profile.performanceHistory.slice(-this.config.historySize);
      }
      this.updatePreferredTemperature(profile);
    }

    this.globalHistory.push(record);
    if (this.globalHistory.length > this.config.historySize * 2) {
      this.globalHistory = this.globalHistory.slice(-this.config.historySize * 2);
    }
  }

  getAgentStats(agentName: string): {
    preferredTemp: number;
    avgQuality: number;
    bestTaskType: TaskType | null;
    totalSamples: number;
  } {
    const profile = this.config.agentProfiles[agentName];
    if (!profile || profile.performanceHistory.length === 0) {
      return {
        preferredTemp: profile?.preferredTemp || 0.3,
        avgQuality: 0,
        bestTaskType: null,
        totalSamples: 0,
      };
    }

    const history = profile.performanceHistory;
    const avgQuality = history.reduce((sum, r) => sum + r.qualityScore, 0) / history.length;

    const taskTypeScores: Record<string, { sum: number; count: number }> = {};
    for (const record of history) {
      if (!taskTypeScores[record.taskType]) taskTypeScores[record.taskType] = { sum: 0, count: 0 };
      taskTypeScores[record.taskType].sum += record.qualityScore;
      taskTypeScores[record.taskType].count++;
    }

    let bestTaskType: TaskType | null = null;
    let bestAvg = 0;
    for (const [taskType, scores] of Object.entries(taskTypeScores)) {
      const avg = scores.sum / scores.count;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestTaskType = taskType as TaskType;
      }
    }

    return {
      preferredTemp: profile.preferredTemp,
      avgQuality: this.round(avgQuality),
      bestTaskType,
      totalSamples: history.length,
    };
  }

  private calculateOptimalFromHistory(
    history: TemperaturePerformanceRecord[],
    taskType: TaskType,
  ): number {
    const relevant = history.filter(
      (r) => r.taskType === taskType && r.wasSuccessful && r.qualityScore > 0.5,
    );

    if (relevant.length === 0) {
      const allSuccessful = history.filter((r) => r.wasSuccessful);
      if (allSuccessful.length === 0) return 0.3;
      const weightedSum = allSuccessful.reduce((sum, r) => sum + r.temperature * r.qualityScore, 0);
      const weightTotal = allSuccessful.reduce((sum, r) => sum + r.qualityScore, 0);
      return weightedSum / weightTotal;
    }

    const weightedSum = relevant.reduce((sum, r) => sum + r.temperature * r.qualityScore, 0);
    const weightTotal = relevant.reduce((sum, r) => sum + r.qualityScore, 0);
    return weightedSum / weightTotal;
  }

  private updatePreferredTemperature(profile: AgentTemperatureProfile): void {
    const recentHistory = profile.performanceHistory.slice(-20);
    const successfulRecords = recentHistory.filter((r) => r.wasSuccessful && r.qualityScore > 0.6);
    if (successfulRecords.length < 3) return;

    let weightedSum = 0;
    let weightTotal = 0;
    for (let i = 0; i < successfulRecords.length; i++) {
      const record = successfulRecords[i];
      const recency = Math.exp(i / successfulRecords.length);
      const weight = record.qualityScore * recency;
      weightedSum += record.temperature * weight;
      weightTotal += weight;
    }

    const newPreferred = weightedSum / weightTotal;
    profile.preferredTemp =
      profile.preferredTemp * (1 - this.config.learningRate) +
      newPreferred * this.config.learningRate;
    // FIX #5: Previous clamp [0.1, 0.7] was too tight — creative agents (jaskier: 1.45, ciri: 1.15)
    // need higher preferred temps. Gemini 3 supports up to 2.0.
    profile.preferredTemp = Math.max(0.1, Math.min(2.0, profile.preferredTemp));
  }

  private createDefaultProfile(agentName: string): AgentTemperatureProfile {
    return {
      name: agentName,
      role: 'Unknown',
      baseRanges: {
        code: [0.15, 0.25],
        fix: [0.1, 0.2],
        analysis: [0.25, 0.4],
        creative: [0.4, 0.6],
        planning: [0.2, 0.35],
        general: [0.25, 0.45],
      },
      creativityBias: 0,
      precisionBias: 0,
      preferredTemp: 0.3,
      performanceHistory: [],
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  exportLearningState(): {
    profiles: Record<
      string,
      Pick<AgentTemperatureProfile, 'name' | 'preferredTemp' | 'performanceHistory'>
    >;
    globalHistory: TemperaturePerformanceRecord[];
  } {
    const profiles: Record<
      string,
      Pick<AgentTemperatureProfile, 'name' | 'preferredTemp' | 'performanceHistory'>
    > = {};
    for (const [name, profile] of Object.entries(this.config.agentProfiles)) {
      profiles[name] = {
        name: profile.name,
        preferredTemp: profile.preferredTemp,
        performanceHistory: profile.performanceHistory,
      };
    }
    return { profiles, globalHistory: this.globalHistory };
  }

  importLearningState(state: ReturnType<typeof this.exportLearningState>): void {
    if (state.profiles) {
      for (const [name, savedProfile] of Object.entries(state.profiles)) {
        const existingProfile = this.config.agentProfiles[name];
        if (existingProfile) {
          existingProfile.preferredTemp = savedProfile.preferredTemp;
          existingProfile.performanceHistory = savedProfile.performanceHistory || [];
        }
      }
    }
    if (state.globalHistory) {
      this.globalHistory = state.globalHistory;
    }
  }

  resetLearning(agentName?: string): void {
    if (agentName) {
      const profile = this.config.agentProfiles[agentName];
      if (profile) {
        profile.performanceHistory = [];
        const defaultProfile = DEFAULT_AGENT_PROFILES[agentName];
        if (defaultProfile) profile.preferredTemp = defaultProfile.preferredTemp;
      }
    } else {
      for (const profile of Object.values(this.config.agentProfiles)) {
        profile.performanceHistory = [];
        const defaultProfile = DEFAULT_AGENT_PROFILES[profile.name];
        if (defaultProfile) profile.preferredTemp = defaultProfile.preferredTemp;
      }
      this.globalHistory = [];
    }
  }
}

// ============================================================================
// GLOBAL TEMPERATURE CONTROLLER
// ============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let globalTemperatureController: TemperatureController | null = null;

/** #45: Resolve the learning state file path */
function getLearningStatePath(): string {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    return resolve(currentDir, '..', '..', '..', '.geminihydra', 'temperature-learning.json');
  } catch {
    return resolve(process.cwd(), '.geminihydra', 'temperature-learning.json');
  }
}

export function getTemperatureController(): TemperatureController {
  if (!globalTemperatureController) {
    globalTemperatureController = new TemperatureController();
  }
  return globalTemperatureController;
}

export function initializeTemperatureController(
  config?: Partial<AdaptiveTemperatureConfig>,
): TemperatureController {
  globalTemperatureController = new TemperatureController(config);
  return globalTemperatureController;
}

/**
 * #45: Auto-save temperature learning state to disk
 * Call this after significant learning events or on shutdown
 */
export async function saveTemperatureLearning(): Promise<string> {
  const controller = getTemperatureController();
  const state = controller.exportLearningState();
  const filepath = getLearningStatePath();

  try {
    await mkdir(dirname(filepath), { recursive: true });
    await writeFile(filepath, JSON.stringify(state, null, 2), 'utf-8');
    return filepath;
  } catch {
    return '';
  }
}

/**
 * #45: Load temperature learning state from disk
 * Call this during initialization to restore learned preferences
 */
export async function loadTemperatureLearning(): Promise<boolean> {
  const controller = getTemperatureController();
  const filepath = getLearningStatePath();

  try {
    const raw = await readFile(filepath, 'utf-8');
    const state = JSON.parse(raw);
    if (state?.profiles) {
      controller.importLearningState(state);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** #45: Auto-save interval handle */
let temperatureAutoSaveInterval: ReturnType<typeof setInterval> | null = null;

/**
 * #45: Enable periodic auto-save of temperature learning state
 * Default: every 10 minutes
 */
export function enableTemperatureAutoSave(intervalMs = 10 * 60 * 1000): void {
  if (temperatureAutoSaveInterval) return;
  temperatureAutoSaveInterval = setInterval(() => {
    saveTemperatureLearning().catch(() => {});
  }, intervalMs);
  if (temperatureAutoSaveInterval.unref) {
    temperatureAutoSaveInterval.unref();
  }
}

/** #45: Disable temperature learning auto-save */
export function disableTemperatureAutoSave(): void {
  if (temperatureAutoSaveInterval) {
    clearInterval(temperatureAutoSaveInterval);
    temperatureAutoSaveInterval = null;
  }
}

// ============================================================================
// TASK TYPE DETECTION AND ADAPTIVE TEMPERATURE FUNCTIONS
// ============================================================================

export function detectTaskType(taskLower: string): TaskType {
  const codeKeywords = [
    'implementuj',
    'implement',
    'kod',
    'code',
    'funkcj',
    'function',
    'class',
    'klasa',
    'metod',
    'method',
    'zapis',
    'write',
    'stwórz',
    'create',
    'dodaj',
    'add',
    'refactor',
    'typescript',
    'javascript',
    'python',
    'rust',
    'programuj',
    'compile',
    'build',
  ];
  const fixKeywords = [
    'napraw',
    'fix',
    'bug',
    'błąd',
    'error',
    'debug',
    'issue',
    'problem',
    'popraw',
    'correct',
    'repair',
    'resolve',
    'hotfix',
  ];
  const analysisKeywords = [
    'analiz',
    'analy',
    'sprawdź',
    'check',
    'review',
    'przegląd',
    'evaluate',
    'assess',
    'audit',
    'inspect',
    'examine',
    'verify',
    'test',
    'validate',
    'compare',
    'porównaj',
  ];
  const creativeKeywords = [
    'propozycj',
    'propos',
    'sugest',
    'suggest',
    'pomysł',
    'idea',
    'creative',
    'kreatywn',
    'innowac',
    'innovat',
    'alternatyw',
    'alternative',
    'brainstorm',
    'design',
    'projekt',
    'koncept',
    'concept',
    'vision',
    'wizja',
    'możliwoś',
    'possibil',
  ];
  const planningKeywords = [
    'plan',
    'strateg',
    'roadmap',
    'harmonogram',
    'schedule',
    'organize',
    'struktur',
    'architektur',
    'architect',
    'blueprint',
    'diagram',
    'workflow',
    'process',
    'procedur',
    'krok',
    'step',
  ];

  if (fixKeywords.some((kw) => taskLower.includes(kw))) return 'fix';
  if (codeKeywords.some((kw) => taskLower.includes(kw))) return 'code';
  if (planningKeywords.some((kw) => taskLower.includes(kw))) return 'planning';
  if (creativeKeywords.some((kw) => taskLower.includes(kw))) return 'creative';
  if (analysisKeywords.some((kw) => taskLower.includes(kw))) return 'analysis';
  return 'general';
}

export function getAdaptiveTemperature(
  task: string,
  taskType: TaskType,
  agentName?: string,
  context?: Partial<TemperatureContext>,
): number {
  const taskLower = task.toLowerCase();
  let detectedType: TaskType = taskType;
  if (taskType === 'general') detectedType = detectTaskType(taskLower);

  if (agentName) {
    const controller = getTemperatureController();
    let temperature = controller.getTemperatureForAgent(agentName, detectedType, task);

    if (context) {
      const fullContext: TemperatureContext = {
        agentName,
        taskType: detectedType,
        task,
        generationProgress: context.generationProgress || 0,
        currentStep: context.currentStep || 0,
        totalSteps: context.totalSteps || 1,
        previousResults: context.previousResults || [],
        confidenceLevel: context.confidenceLevel || 0.8,
        retryCount: context.retryCount || 0,
        errorCount: context.errorCount || 0,
      };
      temperature = controller.adjustTemperatureDuringGeneration(temperature, fullContext);
    }
    return temperature;
  }

  return getBasicAdaptiveTemperature(task, detectedType);
}

function getBasicAdaptiveTemperature(task: string, taskType: TaskType): number {
  const temperatureRanges: Record<TaskType, [number, number]> = {
    code: [0.1, 0.2],
    fix: [0.1, 0.2],
    analysis: [0.3, 0.4],
    creative: [0.5, 0.7],
    planning: [0.2, 0.3],
    general: [0.3, 0.5],
  };
  const [minTemp, maxTemp] = temperatureRanges[taskType];
  const taskLength = task.length;
  const lengthFactor = Math.min(taskLength / 2000, 1);
  const temperature = maxTemp - lengthFactor * (maxTemp - minTemp);
  return Math.round(temperature * 100) / 100;
}

export function getEnhancedAdaptiveTemperature(
  agentName: string,
  task: string,
  options: {
    taskType?: TaskType;
    generationProgress?: number;
    currentStep?: number;
    totalSteps?: number;
    previousResults?: Array<{ temperature: number; quality: number; wasSuccessful: boolean }>;
    confidenceLevel?: number;
    retryCount?: number;
  } = {},
): { temperature: number; taskType: TaskType; adjustments: string[] } {
  const controller = getTemperatureController();
  const taskType = options.taskType || detectTaskType(task.toLowerCase());
  const adjustments: string[] = [];

  let temperature = controller.getTemperatureForAgent(agentName, taskType, task);
  adjustments.push(`Base for ${agentName}/${taskType}: ${temperature}`);

  const context: TemperatureContext = {
    agentName,
    taskType,
    task,
    generationProgress: options.generationProgress || 0,
    currentStep: options.currentStep || 0,
    totalSteps: options.totalSteps || 1,
    previousResults: options.previousResults || [],
    confidenceLevel: options.confidenceLevel || 0.8,
    retryCount: options.retryCount || 0,
    errorCount: 0,
  };

  const adjusted = controller.adjustTemperatureDuringGeneration(temperature, context);
  if (adjusted !== temperature) {
    if (context.generationProgress > 0)
      adjustments.push(`Annealing (${Math.round(context.generationProgress * 100)}% progress)`);
    if (context.confidenceLevel < 0.5)
      adjustments.push(`Uncertainty boost (confidence: ${context.confidenceLevel})`);
    if (context.retryCount > 0)
      adjustments.push(`Retry adjustment (attempt ${context.retryCount + 1})`);
    if (context.previousResults.length > 0)
      adjustments.push(`Context awareness (${context.previousResults.length} previous results)`);
    temperature = adjusted;
    adjustments.push(`Final adjusted: ${temperature}`);
  }

  return { temperature, taskType, adjustments };
}
