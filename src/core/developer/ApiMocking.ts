/**
 * ApiMocking.ts - Feature #38: API Mocking
 *
 * Generates mock API responses and servers for development and testing.
 * Features:
 * - Automatic mock data generation based on endpoint paths
 * - Express mock server code generation
 * - Configurable response delays
 * - Random error injection support
 */

import crypto from 'node:crypto';
import chalk from 'chalk';

// ============================================================
// Types
// ============================================================

export interface MockEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  requestSchema?: object;
  responseSchema: object;
  mockResponse: unknown;
  statusCode: number;
}

export interface MockApiConfig {
  basePath: string;
  endpoints: MockEndpoint[];
  defaultDelay?: number;
  randomErrors?: boolean;
  errorRate?: number; // 0-1 probability of random errors
}

export interface ApiEndpointSpec {
  method: string;
  path: string;
  description: string;
}

export interface MockServerOptions {
  port?: number;
  enableCors?: boolean;
  logRequests?: boolean;
}

// ============================================================
// Core Functions
// ============================================================

/**
 * Generates mock endpoints from an API specification
 * @param apiSpec - API specification with endpoint definitions
 * @returns Mock API configuration with generated responses
 */
export function generateMockEndpoints(apiSpec: { endpoints: ApiEndpointSpec[] }): MockApiConfig {
  console.log(chalk.cyan(`[MockAPI] Generating mock endpoints...`));

  const endpoints: MockEndpoint[] = apiSpec.endpoints.map((ep) => ({
    method: (ep.method.toUpperCase() as MockEndpoint['method']) || 'GET',
    path: ep.path,
    description: ep.description,
    responseSchema: {},
    mockResponse: generateMockData(ep.path),
    statusCode: 200,
  }));

  console.log(chalk.green(`[MockAPI] Generated ${endpoints.length} mock endpoints`));

  return {
    basePath: '/api/v1',
    endpoints,
    defaultDelay: 100,
    randomErrors: false,
  };
}

/**
 * Generates contextual mock data based on endpoint path
 * @param path - Endpoint path to generate mock data for
 * @returns Mock data object
 */
export function generateMockData(path: string): unknown {
  // Generate contextual mock data based on path
  const lowerPath = path.toLowerCase();

  if (lowerPath.includes('user')) {
    return {
      id: crypto.randomUUID(),
      name: 'Mock User',
      email: 'mock@example.com',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mock',
      role: 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  if (lowerPath.includes('item') || lowerPath.includes('product')) {
    return {
      id: crypto.randomUUID(),
      name: 'Mock Product',
      description: 'A sample product for testing',
      price: 99.99,
      currency: 'USD',
      quantity: 10,
      category: 'Electronics',
      inStock: true,
      createdAt: new Date().toISOString(),
    };
  }

  if (lowerPath.includes('order')) {
    return {
      id: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      status: 'pending',
      items: [{ productId: crypto.randomUUID(), quantity: 2, price: 49.99 }],
      total: 99.98,
      currency: 'USD',
      createdAt: new Date().toISOString(),
    };
  }

  if (lowerPath.includes('auth') || lowerPath.includes('login')) {
    return {
      token: `mock-jwt-token-${crypto.randomUUID()}`,
      expiresIn: 3600,
      tokenType: 'Bearer',
      refreshToken: `mock-refresh-${crypto.randomUUID()}`,
    };
  }

  if (lowerPath.includes('list') || lowerPath.includes('all')) {
    return {
      items: [
        { id: crypto.randomUUID(), name: 'Item 1' },
        { id: crypto.randomUUID(), name: 'Item 2' },
        { id: crypto.randomUUID(), name: 'Item 3' },
      ],
      total: 3,
      page: 1,
      pageSize: 10,
      hasMore: false,
    };
  }

  if (lowerPath.includes('status') || lowerPath.includes('health')) {
    return {
      status: 'healthy',
      version: '1.0.0',
      uptime: 86400,
      timestamp: new Date().toISOString(),
    };
  }

  // Default response
  return {
    success: true,
    data: {},
    message: 'Mock response',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generates a list of mock items
 * @param count - Number of items to generate
 * @param template - Template object for item structure
 * @returns Array of mock items
 */
export function generateMockList<T extends object>(count: number, template: T): T[] {
  const items: T[] = [];

  for (let i = 0; i < count; i++) {
    const item: Record<string, unknown> = { ...template } as Record<string, unknown>;

    // Replace any id fields with new UUIDs
    for (const key of Object.keys(item)) {
      if (key.toLowerCase().includes('id')) {
        item[key] = crypto.randomUUID();
      }
      if (key === 'name' && typeof item[key] === 'string') {
        item[key] = `${item[key]} ${i + 1}`;
      }
    }

    items.push(item as T);
  }

  return items;
}

// ============================================================
// Server Generation
// ============================================================

/**
 * Generates Express mock server code
 * @param config - Mock API configuration
 * @param options - Server options
 * @returns TypeScript/JavaScript code for the mock server
 */
export function generateMockServer(config: MockApiConfig, options: MockServerOptions = {}): string {
  const lines: string[] = [];
  const port = options.port || 3001;

  lines.push(`/**`);
  lines.push(` * Auto-generated Mock API Server`);
  lines.push(` * Generated: ${new Date().toISOString()}`);
  lines.push(` */\n`);

  lines.push(`import express from 'express';`);
  if (options.enableCors) {
    lines.push(`import cors from 'cors';`);
  }
  lines.push(`const app = express();`);
  lines.push(`app.use(express.json());\n`);

  if (options.enableCors) {
    lines.push(`app.use(cors());\n`);
  }

  if (options.logRequests) {
    lines.push(`// Request logging middleware`);
    lines.push(`app.use((req, res, next) => {`);
    lines.push(`  console.log(\`[\${new Date().toISOString()}] \${req.method} \${req.path}\`);`);
    lines.push(`  next();`);
    lines.push(`});\n`);
  }

  // Generate endpoints
  for (const endpoint of config.endpoints) {
    lines.push(`// ${endpoint.description}`);
    lines.push(
      `app.${endpoint.method.toLowerCase()}('${config.basePath}${endpoint.path}', (req, res) => {`,
    );

    // Add random error support
    if (config.randomErrors) {
      const errorRate = config.errorRate || 0.1;
      lines.push(`  // Random error injection (${errorRate * 100}% chance)`);
      lines.push(`  if (Math.random() < ${errorRate}) {`);
      lines.push(
        `    return res.status(500).json({ error: 'Random mock error', code: 'MOCK_ERROR' });`,
      );
      lines.push(`  }\n`);
    }

    if (config.defaultDelay) {
      lines.push(`  setTimeout(() => {`);
      lines.push(
        `    res.status(${endpoint.statusCode}).json(${JSON.stringify(endpoint.mockResponse, null, 6).split('\n').join('\n    ')});`,
      );
      lines.push(`  }, ${config.defaultDelay});`);
    } else {
      lines.push(
        `  res.status(${endpoint.statusCode}).json(${JSON.stringify(endpoint.mockResponse, null, 4)});`,
      );
    }
    lines.push(`});\n`);
  }

  // Health check endpoint
  lines.push(`// Health check`);
  lines.push(`app.get('/health', (req, res) => {`);
  lines.push(`  res.json({ status: 'ok', timestamp: new Date().toISOString() });`);
  lines.push(`});\n`);

  // 404 handler
  lines.push(`// 404 handler`);
  lines.push(`app.use((req, res) => {`);
  lines.push(`  res.status(404).json({ error: 'Not found', path: req.path });`);
  lines.push(`});\n`);

  lines.push(`const PORT = process.env.PORT || ${port};`);
  lines.push(`app.listen(PORT, () => {`);
  lines.push(`  console.log(\`Mock server running on http://localhost:\${PORT}\`);`);
  lines.push(`  console.log(\`Base path: ${config.basePath}\`);`);
  lines.push(`  console.log(\`Endpoints: ${config.endpoints.length}\`);`);
  lines.push(`});`);

  return lines.join('\n');
}

/**
 * Generates a simple in-memory mock handler function
 * @param config - Mock API configuration
 * @returns Handler function code as string
 */
export function generateMockHandler(config: MockApiConfig): string {
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * Mock API Handler`);
  lines.push(` * Use this for testing without running a server`);
  lines.push(` */\n`);

  lines.push(`interface MockRequest {`);
  lines.push(`  method: string;`);
  lines.push(`  path: string;`);
  lines.push(`  body?: unknown;`);
  lines.push(`}\n`);

  lines.push(`interface MockResponse {`);
  lines.push(`  status: number;`);
  lines.push(`  data: unknown;`);
  lines.push(`}\n`);

  lines.push(`const mockEndpoints = ${JSON.stringify(config.endpoints, null, 2)};\n`);

  lines.push(`export function handleMockRequest(req: MockRequest): MockResponse {`);
  lines.push(`  const endpoint = mockEndpoints.find(`);
  lines.push(`    e => e.method === req.method.toUpperCase() && e.path === req.path`);
  lines.push(`  );\n`);
  lines.push(`  if (!endpoint) {`);
  lines.push(`    return { status: 404, data: { error: 'Not found' } };`);
  lines.push(`  }\n`);
  lines.push(`  return { status: endpoint.statusCode, data: endpoint.mockResponse };`);
  lines.push(`}\n`);

  return lines.join('\n');
}

// ============================================================
// Formatting Functions
// ============================================================

/**
 * Formats mock API configuration for display
 * @param config - Mock API configuration to format
 * @returns Formatted string for console output
 */
export function formatMockApiConfig(config: MockApiConfig): string {
  const lines: string[] = [];

  lines.push(chalk.cyan(`\n🎭 MOCK API CONFIGURATION`));
  lines.push(chalk.gray(`   Base Path: ${config.basePath}`));
  lines.push(chalk.gray(`   Default Delay: ${config.defaultDelay || 0}ms`));
  lines.push(chalk.gray(`   Random Errors: ${config.randomErrors ? 'Enabled' : 'Disabled'}`));
  lines.push('');

  lines.push(chalk.yellow('📍 ENDPOINTS:'));
  for (const endpoint of config.endpoints) {
    const methodColors: Record<string, (text: string) => string> = {
      GET: chalk.green,
      POST: chalk.blue,
      PUT: chalk.yellow,
      DELETE: chalk.red,
      PATCH: chalk.magenta,
    };
    const colorFn = methodColors[endpoint.method] || chalk.white;
    lines.push(`   ${colorFn(endpoint.method.padEnd(7))} ${config.basePath}${endpoint.path}`);
    lines.push(chalk.gray(`           ${endpoint.description}`));
  }

  return lines.join('\n');
}

// ============================================================
// Default Export
// ============================================================

export default {
  generateMockEndpoints,
  generateMockData,
  generateMockList,
  generateMockServer,
  generateMockHandler,
  formatMockApiConfig,
};
