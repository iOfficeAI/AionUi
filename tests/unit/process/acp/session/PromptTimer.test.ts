// tests/unit/process/acp/session/PromptTimer.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PromptTimer } from '@process/acp/session/PromptTimer';

describe('PromptTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in idle state', () => {
    const timer = new PromptTimer(5000, vi.fn());
    expect(timer.state).toBe('idle');
  });

  it('transitions to running on start()', () => {
    const timer = new PromptTimer(5000, vi.fn());
    timer.start();
    expect(timer.state).toBe('running');
  });

  it('fires callback after timeout', () => {
    const onTimeout = vi.fn();
    const timer = new PromptTimer(5000, onTimeout);
    timer.start();
    vi.advanceTimersByTime(5000);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('reset() restarts the timer', () => {
    const onTimeout = vi.fn();
    const timer = new PromptTimer(5000, onTimeout);
    timer.start();
    vi.advanceTimersByTime(3000);
    timer.reset();
    vi.advanceTimersByTime(3000);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('pause() stops countdown, resume() continues', () => {
    const onTimeout = vi.fn();
    const timer = new PromptTimer(5000, onTimeout);
    timer.start();
    vi.advanceTimersByTime(2000);
    timer.pause();
    expect(timer.state).toBe('paused');
    vi.advanceTimersByTime(10000);
    expect(onTimeout).not.toHaveBeenCalled();
    timer.resume();
    expect(timer.state).toBe('running');
    vi.advanceTimersByTime(3000);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('stop() returns to idle (INV-S-04)', () => {
    const timer = new PromptTimer(5000, vi.fn());
    timer.start();
    timer.stop();
    expect(timer.state).toBe('idle');
  });

  it('stop() prevents timeout callback', () => {
    const onTimeout = vi.fn();
    const timer = new PromptTimer(5000, onTimeout);
    timer.start();
    timer.stop();
    vi.advanceTimersByTime(10000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
