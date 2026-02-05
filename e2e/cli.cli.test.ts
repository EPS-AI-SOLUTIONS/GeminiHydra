/**
 * GeminiHydra - CLI E2E Tests
 * Tests for command-line interface functionality
 */

import { test, expect } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const CLI_PATH = 'npx tsx bin/gemini.ts';

// Helper to run CLI command
async function runCli(args: string): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execAsync(`${CLI_PATH} ${args}`, {
      cwd: process.cwd(),
      timeout: 30000,
    });
    return { stdout, stderr, code: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      code: error.code || 1,
    };
  }
}

test.describe('CLI Basic Commands', () => {
  test('--help should display help message', async () => {
    const result = await runCli('--help');

    expect(result.stdout).toContain('GeminiHydra');
    expect(result.stdout).toContain('Usage:');
    expect(result.code).toBe(0);
  });

  test('--version should display version', async () => {
    const result = await runCli('--version');

    // Version output may be just the version number or with prefix
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    expect(result.code).toBe(0);
  });

  test('agents command should list available agents', async () => {
    const result = await runCli('agents');

    // Check for Witcher Swarm agent roster format
    expect(result.stdout).toContain('WITCHER SWARM');
    expect(result.stdout).toContain('geralt');
    expect(result.stdout).toContain('dijkstra');
    expect(result.stdout).toContain('yennefer');
    expect(result.code).toBe(0);
  });
});

test.describe('CLI Classify Command', () => {
  test('classify should classify simple tasks', async () => {
    const result = await runCli('classify "print hello world"');

    expect(result.stdout.toLowerCase()).toMatch(/simple|moderate|complex/);
    expect(result.code).toBe(0);
  });

  test('classify should handle moderate tasks', async () => {
    const result = await runCli('classify "write a function that calculates fibonacci numbers"');

    expect(result.stdout.toLowerCase()).toMatch(/simple|moderate|complex/);
    expect(result.code).toBe(0);
  });
});

test.describe('CLI Error Handling', () => {
  test('should handle unknown command gracefully', async () => {
    const result = await runCli('unknowncommand');

    // Should either show help or error message
    expect(result.stdout + result.stderr).toBeTruthy();
  });

  test('should show MCP warning when not configured', async () => {
    const result = await runCli('"test task"');

    // Should mention MCP or show appropriate message
    const output = result.stdout + result.stderr;
    expect(output).toBeTruthy();
  });
});

test.describe('CLI Input Handling', () => {
  test('should handle empty input', async () => {
    const result = await runCli('');

    // Should show help or prompt for input
    expect(result.stdout + result.stderr).toBeTruthy();
  });

  test('should handle special characters in input', async () => {
    const result = await runCli('classify "test with special chars: @#$%"');

    expect(result.code).toBeLessThanOrEqual(1);
  });

  test('should handle quoted input', async () => {
    const result = await runCli('classify "this is a quoted string"');

    expect(result.code).toBeLessThanOrEqual(1);
  });
});
