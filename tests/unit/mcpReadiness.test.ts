import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use dynamic import to get a fresh module for each test
let waitForMcpReady: typeof import('../../src/process/team/mcpReadiness').waitForMcpReady;
let notifyMcpReady: typeof import('../../src/process/team/mcpReadiness').notifyMcpReady;

describe('mcpReadiness', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    // Fresh module to reset internal state (pendingReady, alreadyReady)
    vi.resetModules();
    const mod = await import('../../src/process/team/mcpReadiness');
    waitForMcpReady = mod.waitForMcpReady;
    notifyMcpReady = mod.notifyMcpReady;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves when notifyMcpReady is called', async () => {
    const p = waitForMcpReady('slot-1', 5000);
    notifyMcpReady('slot-1');
    await expect(p).resolves.toBeUndefined();
  });

  it('resolves immediately if notifyMcpReady was called before waitForMcpReady', async () => {
    notifyMcpReady('slot-1');
    const p = waitForMcpReady('slot-1', 5000);
    // Should resolve synchronously (already in alreadyReady set)
    await expect(p).resolves.toBeUndefined();
  });

  it('resolves on timeout with warning when notifyMcpReady is never called', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = waitForMcpReady('slot-1', 100);

    vi.advanceTimersByTime(100);
    await expect(p).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('slot-1'));
    warnSpy.mockRestore();
  });

  it('handles multiple slots independently', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p1 = waitForMcpReady('slot-1', 200);
    const p2 = waitForMcpReady('slot-2', 200);

    notifyMcpReady('slot-1');
    await expect(p1).resolves.toBeUndefined();

    // slot-2 should still be pending, resolve via timeout
    vi.advanceTimersByTime(200);
    await expect(p2).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('slot-2'));
    warnSpy.mockRestore();
  });

  it('double notifyMcpReady is safe (no error)', () => {
    const p = waitForMcpReady('slot-1', 5000);
    notifyMcpReady('slot-1');
    expect(() => notifyMcpReady('slot-1')).not.toThrow();
    return p;
  });

  it('alreadyReady entry is cleaned up after TTL', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    notifyMcpReady('slot-1');

    // Advance past the 60s TTL cleanup
    vi.advanceTimersByTime(61_000);

    // Now wait should NOT resolve immediately — entry was cleaned up
    const p = waitForMcpReady('slot-1', 100);
    vi.advanceTimersByTime(100);
    await expect(p).resolves.toBeUndefined();
    // Should have timed out, not resolved from alreadyReady
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('slot-1'));
    warnSpy.mockRestore();
  });
});
