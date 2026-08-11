// tests/unit/process/acp/runtime/IdleReclaimer.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdleReclaimer } from '@process/acp/runtime/IdleReclaimer';

describe('IdleReclaimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeEntry(status: string, lastActiveAt: number) {
    return {
      session: {
        status,
        suspend: vi.fn().mockResolvedValue(undefined),
      } as any,
      lastActiveAt,
    };
  }

  it('reclaims idle active session (INV-A-02)', () => {
    const sessions = new Map<string, any>();
    sessions.set('c1', makeEntry('active', Date.now() - 60_000));
    const r = new IdleReclaimer(sessions, 30_000, 1_000);
    r.start();
    vi.advanceTimersByTime(1_000);
    expect(sessions.get('c1').session.suspend).toHaveBeenCalledOnce();
    r.stop();
  });

  it('does NOT reclaim prompting session (INV-A-02)', () => {
    const sessions = new Map<string, any>();
    sessions.set('c1', makeEntry('prompting', Date.now() - 60_000));
    const r = new IdleReclaimer(sessions, 30_000, 1_000);
    r.start();
    vi.advanceTimersByTime(1_000);
    expect(sessions.get('c1').session.suspend).not.toHaveBeenCalled();
    r.stop();
  });

  it('does NOT reclaim recently active session', () => {
    const sessions = new Map<string, any>();
    sessions.set('c1', makeEntry('active', Date.now()));
    const r = new IdleReclaimer(sessions, 30_000, 1_000);
    r.start();
    vi.advanceTimersByTime(1_000);
    expect(sessions.get('c1').session.suspend).not.toHaveBeenCalled();
    r.stop();
  });
});
