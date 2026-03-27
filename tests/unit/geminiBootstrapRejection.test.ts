import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Verifies that deferred bootstrap promises with `.catch(() => {})` do NOT
 * trigger Node's unhandledRejection event, while still propagating the error
 * when subsequently awaited (the pattern used in GeminiAgent and
 * GeminiAgentManager constructors).
 *
 * Fixes: ELECTRON-5B
 */
describe('bootstrap rejection handling', () => {
  const originalListeners = process.rawListeners('unhandledRejection');
  let unhandledSpy: ReturnType<typeof vi.fn>;

  afterEach(() => {
    // Restore original listeners
    process.removeAllListeners('unhandledRejection');
    for (const listener of originalListeners) {
      process.on('unhandledRejection', listener as (...args: unknown[]) => void);
    }
  });

  it('rejected promise with .catch(() => {}) does not fire unhandledRejection', async () => {
    unhandledSpy = vi.fn();
    // Temporarily replace all listeners so only our spy runs
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', unhandledSpy);

    // Simulate the GeminiAgent / GeminiAgentManager pattern:
    // bootstrap = asyncInit(); bootstrap.catch(() => {});
    const bootstrap = Promise.reject(new Error('Google OAuth authentication not configured'));
    bootstrap.catch(() => {}); // The fix under test

    // Flush microtasks to give Node time to detect unhandled rejections
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(unhandledSpy).not.toHaveBeenCalled();
  });

  it('error still propagates when the bootstrap promise is later awaited', async () => {
    const bootstrap = Promise.reject(new Error('Google OAuth authentication not configured'));
    bootstrap.catch(() => {}); // Prevent unhandled rejection

    // Simulate sendMessage() awaiting bootstrap
    await expect(bootstrap).rejects.toThrow('Google OAuth authentication not configured');
  });

  it('error is accessible in a .catch() chain (sendMessage pattern)', async () => {
    const bootstrap = Promise.reject(new Error('Google OAuth authentication not configured'));
    bootstrap.catch(() => {}); // Prevent unhandled rejection

    // Simulate the GeminiAgentManager.sendMessage pattern:
    // await this.bootstrap.catch(e => { emit error; re-reject })
    const errorMessage = await bootstrap.catch((e: Error) => {
      return { caught: true, message: e.message };
    });

    expect(errorMessage).toEqual({
      caught: true,
      message: 'Google OAuth authentication not configured',
    });
  });
});
