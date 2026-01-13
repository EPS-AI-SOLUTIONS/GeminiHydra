import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { PromptQueue } from '../src/prompt-queue.js';

test('queue persistence writes pending items to disk', async () => {
  const persistencePath = './cache/queue-state-test.json';
  mkdirSync('./cache', { recursive: true });
  const queue = new PromptQueue({
    maxConcurrent: 1,
    persistence: { enabled: true, path: persistencePath }
  });

  queue.enqueue('hello world', { model: 'llama3.2:3b' });
  assert.ok(existsSync(persistencePath));
  const content = JSON.parse(readFileSync(persistencePath, 'utf-8'));
  assert.ok(content.queued.length >= 1);

  queue.cancelAll();
  if (existsSync('./cache')) {
    rmSync('./cache', { recursive: true, force: true });
  }
});
