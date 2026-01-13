import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, existsSync } from 'node:fs';

process.env.CACHE_DIR = './cache-test';
process.env.CACHE_MAX_ENTRY_BYTES = '50';
process.env.CACHE_TTL = '0';

test('hashKey returns a sha256 hex string', async () => {
  const { hashKey } = await import(`../src/cache.js?cache=${Date.now()}`);
  const hash = hashKey('hello', 'model');
  assert.equal(hash.length, 64);
});

test('setCache skips entries exceeding max size', async () => {
  const { setCache } = await import(`../src/cache.js?setcache=${Date.now()}`);
  const result = setCache(
    'prompt',
    'response too long response too long response too long response too long',
    'model'
  );
  assert.equal(result, false);
  if (existsSync('./cache-test')) {
    rmSync('./cache-test', { recursive: true, force: true });
  }
});

test('cleanupCache removes expired entries', async () => {
  const { setCache, cleanupCache } = await import(`../src/cache.js?cleanup=${Date.now()}`);
  setCache('prompt', 'response ok', 'model');
  const result = cleanupCache();
  assert.ok(result.cleared >= 1);
  if (existsSync('./cache-test')) {
    rmSync('./cache-test', { recursive: true, force: true });
  }
});
