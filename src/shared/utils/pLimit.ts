// src/shared/utils/pLimit.ts
/**
 * Concurrency Limiter
 * ===================
 * Lightweight Promise concurrency limiter — no external dependencies.
 * Limits the number of simultaneously executing async functions.
 *
 * Usage:
 *   const limit = pLimit(3);
 *   const results = await Promise.allSettled(items.map(item => limit(() => processItem(item))));
 */

export function pLimit(concurrency: number) {
  const queue: (() => void)[] = [];
  let active = 0;

  const next = () => {
    if (queue.length > 0 && active < concurrency) {
      active++;
      queue.shift()?.();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}
