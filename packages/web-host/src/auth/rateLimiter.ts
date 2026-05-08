/**
 * Minimal in-memory rate limiter shared by /api/auth/login.
 * 5 attempts / 15 minutes, keyed by client IP. Matches legacy
 * authRateLimiter in packages/desktop/src/process/webserver/middleware/rateLimiter.ts.
 */

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 5;

type Entry = { count: number; resetAt: number };

export class RateLimiter {
  private readonly store = new Map<string, Entry>();

  constructor(
    private readonly windowMs: number = LOGIN_WINDOW_MS,
    private readonly max: number = LOGIN_MAX_ATTEMPTS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns true if the attempt is allowed; bumps the counter either way. */
  attempt(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const t = this.now();
    let entry = this.store.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + this.windowMs };
    }
    entry.count += 1;
    this.store.set(key, entry);
    const allowed = entry.count <= this.max;
    return {
      allowed,
      remaining: Math.max(0, this.max - entry.count),
      retryAfterMs: allowed ? 0 : entry.resetAt - t,
    };
  }

  /** Reset the counter for a key (call on successful login to match legacy skipSuccessfulRequests). */
  reset(key: string): void {
    this.store.delete(key);
  }

  /** Expose for tests only. */
  __internal_peek_for_tests__(key: string): Entry | undefined {
    return this.store.get(key);
  }
}
