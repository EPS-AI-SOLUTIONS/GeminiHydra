import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, existsSync } from 'node:fs';

process.env.CACHE_DIR = './cache-test';
process.env.CACHE_MAX_ENTRY_BYTES = '500';
process.env.TEST_MODE = 'true';

test('hashKey returns a sha256 hex string', async () => {
  const { hashKey } = await import(`../src/cache.js?cache=${Date.now()}`);
  const hash = hashKey('hello', 'model');
  assert.equal(hash.length, 64);
});

test('setCache skips entries exceeding max size', async () => {
  const { setCache } = await import(`../src/cache.js?setcache=${Date.now()}`);
  const hugeResponse = 'a'.repeat(600);
  const result = setCache(
    'prompt',
    hugeResponse,
    'model'
  );
  assert.equal(result, false);
  if (existsSync('./cache-test')) {
    rmSync('./cache-test', { recursive: true, force: true });
  }
});

test('cleanupCache removes expired entries', async () => {
  const { setCache, cleanupCache } = await import(`../src/cache.js?cleanup=${Date.now()}`);
  // This should fit in 500 bytes
  setCache('prompt', 'response ok', 'model');
  
  // Manually expire the entry
  const { readdirSync, readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const CACHE_DIR = './cache-test';
  
  if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
  }

  const files = readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  
  if (files.length > 0) {
    const filePath = join(CACHE_DIR, files[0]);
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    // Set timestamp to 2 hours ago
    data.timestamp = Date.now() - 7200000;
    writeFileSync(filePath, JSON.stringify(data));
  }

  const result = cleanupCache();
  assert.ok(result.cleared >= 1);
  if (existsSync('./cache-test')) {
    rmSync('./cache-test', { recursive: true, force: true });
  }
});
