import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAppShutdownCoordinator } from '../../src/process/utils/appShutdownCoordinator';

describe('app shutdown coordinator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('prevents Electron quit until async cleanup finishes', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const prepare = vi.fn();
    const requestQuit = vi.fn();
    const exit = vi.fn();
    const event = { preventDefault: vi.fn() };

    const coordinator = createAppShutdownCoordinator({ cleanup, prepare, requestQuit, exit, timeoutMs: 10000 });
    coordinator.handleBeforeQuit(event);
    await vi.waitFor(() => expect(requestQuit).toHaveBeenCalledOnce());

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
  });

  it('runs cleanup once when quit is requested repeatedly', async () => {
    let resolveCleanup: () => void = () => {};
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCleanup = resolve;
        })
    );
    const requestQuit = vi.fn();
    const coordinator = createAppShutdownCoordinator({ cleanup, requestQuit, exit: vi.fn(), timeoutMs: 10000 });

    coordinator.handleBeforeQuit({ preventDefault: vi.fn() });
    coordinator.handleBeforeQuit({ preventDefault: vi.fn() });
    resolveCleanup();
    await vi.waitFor(() => expect(requestQuit).toHaveBeenCalledOnce());

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('allows the follow-up quit after cleanup completed', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const requestQuit = vi.fn();
    const coordinator = createAppShutdownCoordinator({ cleanup, requestQuit, exit: vi.fn(), timeoutMs: 10000 });
    const firstEvent = { preventDefault: vi.fn() };
    const secondEvent = { preventDefault: vi.fn() };

    coordinator.handleBeforeQuit(firstEvent);
    await vi.waitFor(() => expect(requestQuit).toHaveBeenCalledOnce());
    coordinator.handleBeforeQuit(secondEvent);

    expect(firstEvent.preventDefault).toHaveBeenCalledOnce();
    expect(secondEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('forces quit when cleanup exceeds the timeout', async () => {
    vi.useFakeTimers();
    const logger = { warn: vi.fn(), error: vi.fn() };
    const requestQuit = vi.fn();
    const cleanup = vi.fn(() => new Promise<void>(() => {}));
    const coordinator = createAppShutdownCoordinator({
      cleanup,
      requestQuit,
      exit: vi.fn(),
      timeoutMs: 100,
      logger,
    });

    coordinator.handleBeforeQuit({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(100);

    expect(requestQuit).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith('[AionUi] Cleanup timed out after 0.1s, forcing quit');
  });

  it('cleans up and exits on termination signals', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    const requestQuit = vi.fn();
    const coordinator = createAppShutdownCoordinator({ cleanup, requestQuit, exit, timeoutMs: 10000 });

    coordinator.handleSignal('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(143));

    expect(cleanup).toHaveBeenCalledOnce();
    expect(requestQuit).not.toHaveBeenCalled();
  });
});
