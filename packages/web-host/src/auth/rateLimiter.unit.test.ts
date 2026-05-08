import { describe, it, expect } from 'vitest';
import { RateLimiter, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS } from './rateLimiter.js';

describe('auth/rateLimiter', () => {
  it('allows up to LOGIN_MAX_ATTEMPTS within the window', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      expect(rl.attempt('1.2.3.4').allowed).toBe(true);
    }
    expect(rl.attempt('1.2.3.4').allowed).toBe(false);
  });

  it('reports remaining count correctly', () => {
    const rl = new RateLimiter();
    expect(rl.attempt('ip').remaining).toBe(LOGIN_MAX_ATTEMPTS - 1);
    expect(rl.attempt('ip').remaining).toBe(LOGIN_MAX_ATTEMPTS - 2);
  });

  it('resets when window expires', () => {
    let clock = 0;
    const rl = new RateLimiter(LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS, () => clock);
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS + 1; i++) rl.attempt('ip');
    expect(rl.attempt('ip').allowed).toBe(false);
    clock += LOGIN_WINDOW_MS + 1;
    expect(rl.attempt('ip').allowed).toBe(true);
  });

  it('reset() clears the counter', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) rl.attempt('ip');
    rl.reset('ip');
    expect(rl.attempt('ip').allowed).toBe(true);
  });

  it('separate keys have independent counters', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) rl.attempt('ip-1');
    expect(rl.attempt('ip-2').allowed).toBe(true);
  });

  it('retryAfterMs is positive when blocked', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) rl.attempt('ip');
    const out = rl.attempt('ip');
    expect(out.allowed).toBe(false);
    expect(out.retryAfterMs).toBeGreaterThan(0);
  });
});
