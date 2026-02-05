/**
 * GeminiHydra - 6-Step Swarm Protocol
 *
 * Protocol Flow:
 * 1. SPECULATE (Regis → Gemini Flash) - Gather research context
 * 2. PLAN (Dijkstra → Gemini Pro) - Create JSON task plan, assign agents
 * 3. EXECUTE (Executors → llama.cpp) - Run agents via ConnectionPool
 * 4. SYNTHESIZE (Yennefer → Gemini Flash) - Merge results
 * 5. LOG (Jaskier → Gemini Flash) - Create session summary
 * 6. ARCHIVE - Save Markdown transcript
 */

import type {
  AgentRole,
  SwarmTask,
  SwarmPlan,
  AgentResult,
  TranscriptStep,
  SwarmTranscript,
  ComplexityLevel,
  TaskStatus,
  TaskPriority
} from '../../types/swarm.js';

/**
 * Protocol step names
 */
export type ProtocolStep = 'speculate' | 'plan' | 'execute' | 'synthesize' | 'log' | 'archive';

/**
 * Step configuration
 */
export interface StepConfig {
  name: ProtocolStep;
  agent: AgentRole;
  description: string;
  required: boolean;
  canSkip: boolean;
}

/**
 * Protocol step configurations
 */
export const PROTOCOL_STEPS: Record<ProtocolStep, StepConfig> = {
  speculate: {
    name: 'speculate',
    agent: 'regis',
    description: 'Gather research context and background information',
    required: false,
    canSkip: true
  },
  plan: {
    name: 'plan',
    agent: 'dijkstra',
    description: 'Create execution plan and assign tasks to agents',
    required: true,
    canSkip: false
  },
  execute: {
    name: 'execute',
    agent: 'geralt', // Default, actual agents assigned by plan
    description: 'Execute tasks via assigned agents',
    required: true,
    canSkip: false
  },
  synthesize: {
    name: 'synthesize',
    agent: 'yennefer',
    description: 'Merge and synthesize execution results',
    required: true,
    canSkip: false
  },
  log: {
    name: 'log',
    agent: 'jaskier',
    description: 'Create session summary and documentation',
    required: false,
    canSkip: true
  },
  archive: {
    name: 'archive',
    agent: 'jaskier',
    description: 'Save transcript to file',
    required: false,
    canSkip: true
  }
};

/**
 * Prompt templates for each step
 */
export const STEP_PROMPTS = {
  /**
   * STEP 1: SPECULATE (Regis)
   */
  speculate: (query: string, context?: string) => `
You are Regis, the Sage and Researcher of the Witcher Swarm.

Your task is to gather context and background information for the following query:

<query>
${query}
</query>

${context ? `<additional_context>\n${context}\n</additional_context>` : ''}

Please provide:
1. Key concepts and terminology relevant to this query
2. Important background information
3. Potential challenges or considerations
4. Relevant patterns or best practices

Keep your response concise but informative. Focus on information that will help the planning and execution phases.
`,

  /**
   * STEP 2: PLAN (Dijkstra)
   */
  plan: (query: string, speculationContext?: string) => `
You are Dijkstra, the Spymaster and Master Strategist of the Witcher Swarm.

Your task is to create an execution plan for the following query:

<query>
${query}
</query>

${speculationContext ? `<research_context>\n${speculationContext}\n</research_context>` : ''}

Available executor agents (llama.cpp local):
- geralt: Security, operations, critical systems
- triss: Testing, QA, validation
- vesemir: Code review, mentoring, best practices
- ciri: Quick tasks, speed, rapid prototyping
- eskel: DevOps, infrastructure, CI/CD
- lambert: Debugging, profiling, performance
- zoltan: Databases, data, SQL/NoSQL
- philippa: APIs, integration, external systems

Create a JSON execution plan with the following structure:
\`\`\`json
{
  "objective": "Brief description of the goal",
  "complexity": "Simple|Moderate|Complex|Advanced",
  "tasks": [
    {
      "id": 1,
      "agent": "agent_name",
      "task": "Specific task description",
      "dependencies": [],
      "priority": "high|medium|low"
    }
  ],
  "parallelGroups": [[1, 2], [3]],
  "estimatedTime": "estimated completion time"
}
\`\`\`

Guidelines:
- Break complex tasks into smaller subtasks
- Identify which tasks can run in parallel
- Assign tasks to the most appropriate agents
- Consider dependencies between tasks
- Set priorities for critical path items

Respond ONLY with the JSON plan, no additional text.
`,

  /**
   * STEP 3: EXECUTE - prompt for individual executor
   */
  execute: (agent: AgentRole, task: string, context?: string) => {
    const agentPrompts: Record<AgentRole, string> = {
      geralt: `You are Geralt, the White Wolf and Security Expert. Focus on security, safe practices, and operational concerns.`,
      triss: `You are Triss, the Healer and QA Expert. Focus on testing, quality assurance, and validation.`,
      vesemir: `You are Vesemir, the Mentor and Code Reviewer. Focus on best practices, code quality, and teaching.`,
      ciri: `You are Ciri, the Prodigy and Speed Specialist. Focus on quick, efficient solutions.`,
      eskel: `You are Eskel, the Pragmatist and DevOps Engineer. Focus on infrastructure and deployment.`,
      lambert: `You are Lambert, the Skeptic and Debug Master. Focus on finding issues and performance problems.`,
      zoltan: `You are Zoltan, the Craftsman and Data Engineer. Focus on databases and data handling.`,
      philippa: `You are Philippa, the Strategist and Integration Expert. Focus on APIs and external systems.`,
      // Coordinators (if used as executors)
      regis: `You are Regis, the Sage. Focus on research and analysis.`,
      yennefer: `You are Yennefer, the Sorceress. Focus on synthesis and architecture.`,
      jaskier: `You are Jaskier, the Bard. Focus on documentation and communication.`,
      dijkstra: `You are Dijkstra, the Spymaster. Focus on strategy and planning.`
    };

    return `
${agentPrompts[agent]}

<task>
${task}
</task>

${context ? `<context>\n${context}\n</context>` : ''}

Complete this task according to your expertise. Be thorough but concise.
`;
  },

  /**
   * STEP 4: SYNTHESIZE (Yennefer)
   */
  synthesize: (query: string, results: AgentResult[]) => {
    const resultsText = results
      .filter(r => r.success && r.response)
      .map(r => `### ${r.agent} (Task ${r.taskId})\n${r.response}`)
      .join('\n\n');

    return `
You are Yennefer, the Sorceress and Architect of the Witcher Swarm.

Your task is to synthesize the results from multiple agents into a coherent final answer.

<original_query>
${query}
</original_query>

<agent_results>
${resultsText}
</agent_results>

Please:
1. Merge the results into a unified, coherent response
2. Resolve any conflicts or contradictions
3. Ensure completeness - nothing important is missing
4. Organize the response logically
5. Provide a clear, actionable final answer

Your synthesis should directly answer the original query while incorporating insights from all agents.
`;
  },

  /**
   * STEP 5: LOG (Jaskier)
   */
  log: (query: string, transcript: SwarmTranscript) => {
    const stepsSummary = [];

    if (transcript.steps.speculate?.response) {
      stepsSummary.push(`**Speculation:** ${transcript.steps.speculate.response.substring(0, 200)}...`);
    }
    if (transcript.steps.plan?.parsedPlan) {
      const plan = transcript.steps.plan.parsedPlan;
      stepsSummary.push(`**Plan:** ${plan.tasks.length} tasks, complexity: ${plan.complexity}`);
    }
    if (transcript.steps.execute) {
      const executed = transcript.steps.execute.filter(r => r.success).length;
      const total = transcript.steps.execute.length;
      stepsSummary.push(`**Execution:** ${executed}/${total} tasks completed`);
    }
    if (transcript.steps.synthesize?.response) {
      stepsSummary.push(`**Synthesis:** Complete`);
    }

    return `
You are Jaskier, the Bard and Chronicler of the Witcher Swarm.

Your task is to create a brief session summary.

<session_info>
Session ID: ${transcript.sessionId}
Mode: ${transcript.mode}
Query: ${query}
Start Time: ${transcript.startTime}
</session_info>

<execution_summary>
${stepsSummary.join('\n')}
</execution_summary>

Please create a concise summary (2-3 sentences) that:
1. Describes what was accomplished
2. Notes any interesting findings or challenges
3. Provides a quick overview for future reference

Keep it brief and informative.
`;
  }
};

/**
 * Parse plan JSON from Dijkstra's response
 */
export function parsePlan(response: string): SwarmPlan | null {
  try {
    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      [null, response];

    const jsonStr = jsonMatch[1] || response;
    const parsed = JSON.parse(jsonStr.trim());

    // Validate required fields
    if (!parsed.objective || !Array.isArray(parsed.tasks)) {
      return null;
    }

    // Normalize and validate tasks
    const tasks: SwarmTask[] = parsed.tasks.map((t: Partial<SwarmTask>, index: number) => ({
      id: t.id ?? index + 1,
      agent: t.agent ?? 'geralt',
      task: t.task ?? '',
      dependencies: t.dependencies ?? [],
      status: 'pending' as TaskStatus,
      priority: (t.priority ?? 'medium') as TaskPriority,
      context: t.context
    }));

    // Normalize parallel groups
    const parallelGroups: number[][] = parsed.parallelGroups ?? [tasks.map(t => t.id)];

    return {
      objective: parsed.objective,
      complexity: (parsed.complexity ?? 'Moderate') as ComplexityLevel,
      tasks,
      parallelGroups,
      estimatedTime: parsed.estimatedTime
    };
  } catch (error) {
    console.error('Failed to parse plan:', error);
    return null;
  }
}

/**
 * Create default plan for simple queries
 */
export function createSimplePlan(query: string, agent: AgentRole = 'ciri'): SwarmPlan {
  return {
    objective: query,
    complexity: 'Simple',
    tasks: [
      {
        id: 1,
        agent,
        task: query,
        dependencies: [],
        status: 'pending',
        priority: 'high'
      }
    ],
    parallelGroups: [[1]]
  };
}

/**
 * Get tasks ready to execute (dependencies met)
 */
export function getReadyTasks(plan: SwarmPlan, completedIds: number[]): SwarmTask[] {
  return plan.tasks.filter(task =>
    task.status === 'pending' &&
    task.dependencies.every(depId => completedIds.includes(depId))
  );
}

/**
 * Get next parallel group to execute
 */
export function getNextParallelGroup(
  plan: SwarmPlan,
  completedIds: number[]
): number[] | null {
  if (!plan.parallelGroups) return null;
  for (const group of plan.parallelGroups) {
    // Check if all tasks in group are ready
    const allReady = group.every(taskId => {
      const task = plan.tasks.find(t => t.id === taskId);
      if (!task) return false;
      if (completedIds.includes(taskId)) return false; // Already done
      return task.dependencies.every(depId => completedIds.includes(depId));
    });

    if (allReady && group.some(id => !completedIds.includes(id))) {
      return group.filter(id => !completedIds.includes(id));
    }
  }

  return null;
}

/**
 * Update task status in plan
 */
export function updateTaskStatus(
  plan: SwarmPlan,
  taskId: number,
  status: TaskStatus
): SwarmPlan {
  return {
    ...plan,
    tasks: plan.tasks.map(task =>
      task.id === taskId ? { ...task, status } : task
    )
  };
}

/**
 * Check if plan is complete
 */
export function isPlanComplete(plan: SwarmPlan): boolean {
  return plan.tasks.every(task =>
    task.status === 'completed' || task.status === 'failed'
  );
}

/**
 * Create empty transcript
 */
export function createTranscript(
  sessionId: string,
  query: string,
  mode: string
): SwarmTranscript {
  return {
    sessionId,
    query,
    mode,
    startTime: new Date().toISOString(),
    steps: {}
  };
}

/**
 * Format transcript as Markdown
 */
export function formatTranscriptMarkdown(transcript: SwarmTranscript): string {
  const lines: string[] = [];

  lines.push(`# Swarm Session: ${transcript.sessionId}`);
  lines.push('');
  lines.push(`**Mode:** ${transcript.mode}`);
  lines.push(`**Started:** ${transcript.startTime}`);
  lines.push('');
  lines.push('## Query');
  lines.push('```');
  lines.push(transcript.query);
  lines.push('```');
  lines.push('');

  // Speculation
  if (transcript.steps.speculate) {
    lines.push('## Step 1: Speculation (Regis)');
    lines.push('');
    if (transcript.steps.speculate.success) {
      lines.push(transcript.steps.speculate.response || '_No response_');
    } else {
      lines.push(`**Error:** ${transcript.steps.speculate.error}`);
    }
    lines.push('');
  }

  // Plan
  if (transcript.steps.plan) {
    lines.push('## Step 2: Planning (Dijkstra)');
    lines.push('');
    if (transcript.steps.plan.parsedPlan) {
      const plan = transcript.steps.plan.parsedPlan;
      lines.push(`**Objective:** ${plan.objective}`);
      lines.push(`**Complexity:** ${plan.complexity}`);
      lines.push('');
      lines.push('### Tasks');
      for (const task of plan.tasks) {
        lines.push(`- [${task.status === 'completed' ? 'x' : ' '}] **${task.agent}**: ${task.task}`);
      }
    } else {
      lines.push(transcript.steps.plan.result.response || '_No plan generated_');
    }
    lines.push('');
  }

  // Execution
  if (transcript.steps.execute && transcript.steps.execute.length > 0) {
    lines.push('## Step 3: Execution');
    lines.push('');
    for (const result of transcript.steps.execute) {
      lines.push(`### ${result.agent} (Task ${result.taskId})`);
      lines.push(`**Model:** ${result.model}`);
      lines.push(`**Duration:** ${result.duration}ms`);
      lines.push('');
      if (result.success) {
        lines.push(result.response || '_No response_');
      } else {
        lines.push(`**Error:** ${result.error}`);
      }
      lines.push('');
    }
  }

  // Synthesis
  if (transcript.steps.synthesize) {
    lines.push('## Step 4: Synthesis (Yennefer)');
    lines.push('');
    if (transcript.steps.synthesize.success) {
      lines.push(transcript.steps.synthesize.response || '_No synthesis_');
    } else {
      lines.push(`**Error:** ${transcript.steps.synthesize.error}`);
    }
    lines.push('');
  }

  // Log
  if (transcript.steps.log) {
    lines.push('## Step 5: Summary (Jaskier)');
    lines.push('');
    if (transcript.steps.log.success) {
      lines.push(transcript.steps.log.response || '_No summary_');
    } else {
      lines.push(`**Error:** ${transcript.steps.log.error}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Generated by GeminiHydra Witcher Swarm*`);

  return lines.join('\n');
}
