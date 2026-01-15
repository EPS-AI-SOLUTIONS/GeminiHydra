/**
 * HYDRA Ollama Client - API wrapper for Ollama
 */

export const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Call Ollama generate API
 */
export async function generate(model, prompt, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 60000);

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3,
          num_predict: options.maxTokens ?? 2048,
          ...options.modelOptions
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      response: data.response,
      model: data.model,
      totalDuration: data.total_duration,
      evalCount: data.eval_count
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if Ollama is available
 */
export async function checkHealth(options = {}) {
  const timeoutMs = options.timeoutMs ?? 5000;
  const retries = options.retries ?? 0;
  const retryDelayMs = options.retryDelayMs ?? 250;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        lastError = new Error(response.statusText);
      } else {
        const data = await response.json();
        return {
          available: true,
          models: data.models?.map(m => m.name) || [],
          host: OLLAMA_HOST
        };
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < retries) {
      await sleep(retryDelayMs);
    }
  }

  return { available: false, error: lastError?.message, host: OLLAMA_HOST };
}

/**
 * List available models
 */
export async function listModels() {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    const data = await response.json();
    return data.models?.map(m => ({
      name: m.name,
      size: m.size,
      modified: m.modified_at
    })) || [];
  } catch {
    return [];
  }
}

/**
 * Pull a model
 */
export async function pullModel(model) {
  const response = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model, stream: false })
  });

  return response.ok;
}
