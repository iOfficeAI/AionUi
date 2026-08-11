import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Tests for the health check timeout unhandled rejection fix (ELECTRON-P).
 *
 * The bug: when `sendMessage.invoke()` is pending and the timeout fires,
 * `responsePromise` rejects before it is `await`-ed, causing an unhandled
 * promise rejection.
 *
 * The fix: calling `responsePromise.catch(() => {})` immediately after
 * creation marks the rejection as handled. The actual error is still caught
 * by `await responsePromise` in the outer try-catch.
 */
describe('health check timeout unhandled rejection fix', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects without unhandledrejection when .catch() is attached before await', async () => {
    const unhandledHandler = vi.fn();
    // In Vitest/Node, unhandled rejections trigger the process event
    process.on('unhandledRejection', unhandledHandler);

    // Simulate the pattern from ModelModalContent:
    // 1. Create a promise that rejects via timeout
    const responsePromise = new Promise<string>((_resolve, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), 10);
    });

    // 2. The fix: attach a no-op catch to prevent unhandled rejection
    responsePromise.catch(() => {});

    // 3. Simulate sendMessage.invoke() taking longer than the timeout
    await new Promise((r) => setTimeout(r, 50));

    // 4. The await still receives the rejection
    await expect(responsePromise).rejects.toThrow('Health check timeout');

    // Allow microtask queue to flush
    await new Promise((r) => setTimeout(r, 10));

    process.removeListener('unhandledRejection', unhandledHandler);
    expect(unhandledHandler).not.toHaveBeenCalled();
  });

  it('resolves normally when response arrives before timeout', async () => {
    const responsePromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('ok'), 10);
    });

    responsePromise.catch(() => {});

    const result = await responsePromise;
    expect(result).toBe('ok');
  });
});
