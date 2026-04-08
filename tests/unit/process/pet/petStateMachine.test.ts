import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PetStateMachine } from '@process/pet/petStateMachine';

describe('PetStateMachine', () => {
  let sm: PetStateMachine;

  beforeEach(() => {
    vi.useFakeTimers();
    sm = new PetStateMachine();
  });

  afterEach(() => {
    sm.dispose();
    vi.useRealTimers();
  });

  it('starts in idle state', () => {
    expect(sm.getCurrentState()).toBe('idle');
  });

  it('accepts higher priority state', () => {
    const result = sm.requestState('working');
    expect(result).toBe('working');
    expect(sm.getCurrentState()).toBe('working');
  });

  it('rejects lower priority state', () => {
    sm.requestState('working'); // priority 3
    const result = sm.requestState('idle'); // priority 1
    expect(result).toBeNull();
    expect(sm.getCurrentState()).toBe('working');
  });

  it('respects min display time for lower priority', () => {
    sm.requestState('happy'); // priority 5, min 3000ms
    const result = sm.requestState('working'); // priority 3 < 5, rejected
    expect(result).toBeNull();
  });

  it('allows equal priority after min display elapsed', () => {
    sm.requestState('attention'); // priority 5, min 3000ms
    vi.advanceTimersByTime(3100);
    const result = sm.requestState('happy'); // priority 5
    expect(result).toBe('happy');
  });

  it('queues equal priority during min display', () => {
    sm.requestState('happy'); // priority 5, min 3000ms
    sm.requestState('attention'); // priority 5, queued
    expect(sm.getCurrentState()).toBe('happy');
    vi.advanceTimersByTime(3100);
    expect(sm.getCurrentState()).toBe('attention');
  });

  it('auto-returns to target state', () => {
    sm.requestState('happy'); // auto-return to idle in 4000ms
    vi.advanceTimersByTime(4100);
    expect(sm.getCurrentState()).toBe('idle');
  });

  it('yawning auto-returns to dozing', () => {
    sm.forceState('yawning'); // Force low-priority state, auto-return to dozing in 3500ms
    vi.advanceTimersByTime(3600);
    expect(sm.getCurrentState()).toBe('dozing');
  });

  it('forceState bypasses priority and min display', () => {
    sm.requestState('error'); // priority 8, min 5000ms
    sm.forceState('idle');
    expect(sm.getCurrentState()).toBe('idle');
  });

  it('fires onStateChange callback', () => {
    const cb = vi.fn();
    sm.onStateChange(cb);
    sm.requestState('thinking');
    expect(cb).toHaveBeenCalledWith('thinking', 'idle');
  });

  it('does not fire callback for same state', () => {
    sm.requestState('thinking');
    const cb = vi.fn();
    sm.onStateChange(cb);
    sm.requestState('thinking');
    expect(cb).not.toHaveBeenCalled();
  });

  it('higher priority interrupts during min display', () => {
    sm.requestState('working'); // priority 3
    const result = sm.requestState('error'); // priority 8
    expect(result).toBe('error');
  });

  it('DND mode rejects all except dragging', () => {
    sm.setDnd(true);
    expect(sm.requestState('working')).toBeNull();
    expect(sm.requestState('dragging')).toBe('dragging');
  });

  it('offStateChange removes a listener', () => {
    const cb = vi.fn();
    sm.onStateChange(cb);
    sm.requestState('thinking');
    expect(cb).toHaveBeenCalledTimes(1);

    sm.offStateChange(cb);
    sm.requestState('working');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('offStateChange is a no-op for unregistered callback', () => {
    const cb = vi.fn();
    // Should not throw
    sm.offStateChange(cb);
    sm.requestState('thinking');
    expect(cb).not.toHaveBeenCalled();
  });

  it('dispose clears auto-return timer', () => {
    sm.requestState('happy'); // auto-return to idle in 4000ms
    sm.dispose();
    vi.advanceTimersByTime(5000);
    // State should remain happy because auto-return was cleared
    expect(sm.getCurrentState()).toBe('happy');
  });

  it('dispose clears pending timer', () => {
    sm.requestState('attention'); // priority 5, min 3000ms
    sm.requestState('happy'); // priority 5, queued as pending
    expect(sm.getCurrentState()).toBe('attention');
    sm.dispose();
    vi.advanceTimersByTime(4000);
    // Pending state should not apply after dispose
    expect(sm.getCurrentState()).toBe('attention');
  });

  it('dispose removes all listeners', () => {
    const cb = vi.fn();
    sm.onStateChange(cb);
    sm.dispose();
    sm.forceState('working');
    expect(cb).not.toHaveBeenCalled();
  });

  it('idle → yawning sleep transition is allowed despite lower priority', () => {
    expect(sm.getCurrentState()).toBe('idle'); // priority 1
    const result = sm.requestState('yawning'); // priority 0
    expect(result).toBe('yawning');
    expect(sm.getCurrentState()).toBe('yawning');
  });

  it('random-look → sleeping sleep transition is allowed', () => {
    sm.forceState('random-look'); // priority 1
    const result = sm.requestState('sleeping'); // priority 0
    expect(result).toBe('sleeping');
    expect(sm.getCurrentState()).toBe('sleeping');
  });

  it('random-read → dozing sleep transition is allowed', () => {
    sm.forceState('random-read'); // priority 1
    const result = sm.requestState('dozing'); // priority 0
    expect(result).toBe('dozing');
    expect(sm.getCurrentState()).toBe('dozing');
  });

  it('non-idle state rejects sleep transition', () => {
    sm.requestState('working'); // priority 3
    const result = sm.requestState('yawning'); // priority 0, not from idle state
    expect(result).toBeNull();
    expect(sm.getCurrentState()).toBe('working');
  });

  it('callback error does not prevent other listeners from firing', () => {
    const cb1 = vi.fn(() => {
      throw new Error('listener error');
    });
    const cb2 = vi.fn();
    sm.onStateChange(cb1);
    sm.onStateChange(cb2);

    sm.requestState('thinking');
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledWith('thinking', 'idle');
  });

  it('requestState returns null for same state', () => {
    sm.requestState('working');
    const result = sm.requestState('working');
    expect(result).toBeNull();
    expect(sm.getCurrentState()).toBe('working');
  });

  it('DND mode clears pending timer when enabled', () => {
    sm.requestState('attention'); // priority 5, min 3000ms
    sm.requestState('happy'); // priority 5, queued as pending
    expect(sm.getCurrentState()).toBe('attention');

    sm.setDnd(true);
    vi.advanceTimersByTime(4000);
    // Pending happy should have been cleared
    expect(sm.getCurrentState()).toBe('attention');
  });

  it('DND mode clears auto-return timer when enabled', () => {
    sm.requestState('happy'); // auto-return to idle in 4000ms
    sm.setDnd(true);
    vi.advanceTimersByTime(5000);
    // Auto-return should have been cleared
    expect(sm.getCurrentState()).toBe('happy');
  });
});
