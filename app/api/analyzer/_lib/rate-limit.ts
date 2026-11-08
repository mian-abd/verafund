// A small in-memory sliding-window rate limiter, one bucket per key (the workspace id).
// State lives in this server process only: fine for one instance, and a restart resets it.

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export interface RateLimiter {
  take(key: string): RateLimitResult;
}

const MAX_KEYS = 2000;

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    take(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000)) };
      }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > MAX_KEYS) {
        for (const [k, times] of hits) {
          if (!times.some((at) => t - at < windowMs)) hits.delete(k);
        }
      }
      return { ok: true };
    },
  };
}

// One limiter per name for the life of the process, so dev-server module reloads do not reset it.
export function sharedLimiter(name: string, limit: number, windowMs: number): RateLimiter {
  const g = globalThis as typeof globalThis & { __analyzerLimiters?: Map<string, RateLimiter> };
  const registry = (g.__analyzerLimiters ??= new Map());
  let limiter = registry.get(name);
  if (!limiter) {
    limiter = createRateLimiter(limit, windowMs);
    registry.set(name, limiter);
  }
  return limiter;
}
