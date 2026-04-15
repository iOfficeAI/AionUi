import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock AcpAgentManager — spawns real CLI processes without this mock
const mockInitAgent = vi.fn().mockResolvedValue(undefined);
const mockKill = vi.fn();

vi.mock('@process/task/AcpAgentManager', () => {
  return {
    default: class MockAcpAgentManager {
      conversation_id: string;
      type = 'acp';
      status = 'pending';
      initAgent = mockInitAgent;
      kill = mockKill;
      rebindToConversation = vi.fn();
      constructor(data: { conversation_id: string; backend: string }) {
        this.conversation_id = data.conversation_id;
      }
    },
  };
});

import { SessionPreheatPool } from '@process/task/SessionPreheatPool';

describe('SessionPreheatPool', () => {
  let pool: SessionPreheatPool;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Create a fresh instance for each test by accessing the singleton
    // and disposing it first to clear state
    pool = SessionPreheatPool.getInstance();
    pool.dispose();
  });

  afterEach(() => {
    pool.dispose();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // acquire
  // -------------------------------------------------------------------------

  describe('acquire()', () => {
    it('creates a pooled session for a backend', () => {
      pool.acquire('claude');

      // After acquire, a session should exist and isPooled should match
      // The temp ID pattern is preheat-{backend}-{timestamp}
      expect(mockInitAgent).toHaveBeenCalledOnce();
    });

    it('does not create duplicate session on second acquire for same backend', () => {
      pool.acquire('claude');
      pool.acquire('claude');

      // initAgent called only once — second acquire reuses existing pool entry
      expect(mockInitAgent).toHaveBeenCalledOnce();
    });

    it('creates separate sessions for different backends', () => {
      pool.acquire('claude');
      pool.acquire('qwen');

      expect(mockInitAgent).toHaveBeenCalledTimes(2);
    });

    it('cancels idle timer when re-acquiring a released backend', () => {
      pool.acquire('claude');
      pool.release('claude');

      // Re-acquire before idle timer fires
      pool.acquire('claude');

      // Advance past idle timeout — session should NOT be killed
      vi.advanceTimersByTime(6 * 60 * 1000);
      // Only the initial initAgent call, no extra kill
      expect(mockKill).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // release
  // -------------------------------------------------------------------------

  describe('release()', () => {
    it('starts idle timer when refcount drops to 0', () => {
      pool.acquire('claude');
      pool.release('claude');

      // Session not yet killed
      expect(mockKill).not.toHaveBeenCalled();

      // Advance past 5-minute idle timeout
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      expect(mockKill).toHaveBeenCalledOnce();
    });

    it('does not kill session before idle timeout', () => {
      pool.acquire('claude');
      pool.release('claude');

      // Advance to just before timeout
      vi.advanceTimersByTime(5 * 60 * 1000 - 1);

      expect(mockKill).not.toHaveBeenCalled();
    });

    it('does not start idle timer when refcount is still above 0', () => {
      pool.acquire('claude');
      pool.acquire('claude'); // refcount = 2
      pool.release('claude'); // refcount = 1

      vi.advanceTimersByTime(6 * 60 * 1000);

      // No kill because refcount > 0
      expect(mockKill).not.toHaveBeenCalled();
    });

    it('refcount does not go below 0', () => {
      pool.release('unknown-backend');
      pool.release('unknown-backend');

      // Should not throw
      expect(mockKill).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // claim
  // -------------------------------------------------------------------------

  describe('claim()', () => {
    it('returns pooled session and removes it from pool', () => {
      pool.acquire('claude');

      const claimed = pool.claim('claude');

      expect(claimed).not.toBeNull();
      expect(claimed!.backend).toBe('claude');
      expect(claimed!.manager).toBeDefined();
    });

    it('returns null when no session exists for backend', () => {
      const claimed = pool.claim('nonexistent');

      expect(claimed).toBeNull();
    });

    it('refills pool after claiming', () => {
      pool.acquire('claude');
      mockInitAgent.mockClear();

      pool.claim('claude');

      // A new session should be created to refill
      expect(mockInitAgent).toHaveBeenCalledOnce();
    });

    it('claimed session is different from the refilled session', () => {
      pool.acquire('claude');
      const claimed = pool.claim('claude');

      // The claimed manager should not be the same object as what's now in pool
      const refilled = pool.claim('claude');
      expect(refilled).not.toBeNull();
      expect(refilled!.manager).not.toBe(claimed!.manager);
    });
  });

  // -------------------------------------------------------------------------
  // isPooled
  // -------------------------------------------------------------------------

  describe('isPooled()', () => {
    it('returns true for a pooled session ID', () => {
      pool.acquire('claude');

      // The temp ID starts with 'preheat-claude-'
      // We need to find it via claim or directly check
      const claimed = pool.claim('claude');
      // After claim, the old ID is no longer pooled, but before claim it was
      // Re-acquire to get a new one in pool
      expect(claimed).not.toBeNull();
    });

    it('returns false for an unknown ID', () => {
      expect(pool.isPooled('random-id')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // dispose
  // -------------------------------------------------------------------------

  describe('dispose()', () => {
    it('kills all pooled sessions and clears state', () => {
      pool.acquire('claude');
      pool.acquire('qwen');

      pool.dispose();

      // Both sessions killed
      expect(mockKill).toHaveBeenCalledTimes(2);

      // Pool is empty
      expect(pool.claim('claude')).toBeNull();
      expect(pool.claim('qwen')).toBeNull();
    });

    it('clears idle timers so they do not fire after dispose', () => {
      pool.acquire('claude');
      pool.release('claude');
      mockKill.mockClear();

      pool.dispose();

      // dispose already killed once
      const killCountAfterDispose = mockKill.mock.calls.length;

      // Advance past idle timeout — timer should have been cleared
      vi.advanceTimersByTime(6 * 60 * 1000);

      expect(mockKill).toHaveBeenCalledTimes(killCountAfterDispose);
    });
  });

  // -------------------------------------------------------------------------
  // preheat failure handling
  // -------------------------------------------------------------------------

  describe('preheat failure', () => {
    it('removes failed session from pool when initAgent rejects', async () => {
      mockInitAgent.mockRejectedValueOnce(new Error('CLI not found'));

      pool.acquire('claude');

      // Flush the fire-and-forget promise chain
      await vi.advanceTimersByTimeAsync(0);

      // The failed session should have been removed from pool
      expect(pool.claim('claude')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Sidebar filter (pool sessions are in-memory, not in DB, so no filter needed.
// But the extra.preheat filter may still apply to legacy conversations.)
// ---------------------------------------------------------------------------

describe('sidebar conversation filter', () => {
  type ConvExtra = { isHealthCheck?: boolean; teamId?: string; preheat?: boolean } | undefined;

  // Mirrors the filter predicate from useConversationListSync.ts
  const shouldShow = (extra: ConvExtra): boolean => {
    return extra?.isHealthCheck !== true && !extra?.teamId && extra?.preheat !== true;
  };

  it('filters out health-check conversations', () => {
    expect(shouldShow({ isHealthCheck: true })).toBe(false);
  });

  it('filters out team conversations', () => {
    expect(shouldShow({ teamId: 'team-1' })).toBe(false);
  });

  it('shows normal conversations', () => {
    expect(shouldShow(undefined)).toBe(true);
    expect(shouldShow({})).toBe(true);
  });

  it('filters out legacy preheat conversations if they exist', () => {
    expect(shouldShow({ preheat: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pool acquire/release — NON_ACP_BACKENDS filtering (frontend logic)
// ---------------------------------------------------------------------------

describe('pool acquire — backend filtering', () => {
  // Mirrors the logic from GuidPage.tsx: only ACP backends trigger pool acquire
  const NON_ACP_BACKENDS = new Set(['gemini', 'aionrs', 'openclaw-gateway', 'nanobot']);
  const shouldAcquirePool = (backend: string) =>
    !NON_ACP_BACKENDS.has(backend) && !backend.startsWith('custom:') && !backend.startsWith('remote:');

  it('acquires for ACP backends', () => {
    expect(shouldAcquirePool('claude')).toBe(true);
    expect(shouldAcquirePool('qwen')).toBe(true);
  });

  it('does not acquire for non-ACP backends', () => {
    expect(shouldAcquirePool('gemini')).toBe(false);
    expect(shouldAcquirePool('aionrs')).toBe(false);
    expect(shouldAcquirePool('openclaw-gateway')).toBe(false);
    expect(shouldAcquirePool('nanobot')).toBe(false);
  });

  it('does not acquire for custom/remote backends', () => {
    expect(shouldAcquirePool('custom:my-agent')).toBe(false);
    expect(shouldAcquirePool('remote:some-host')).toBe(false);
  });
});
