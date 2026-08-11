import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PetIdleTicker } from '@process/pet/petIdleTicker';
import { PetStateMachine } from '@process/pet/petStateMachine';
import { screen } from 'electron';

// Mock electron screen
vi.mock('electron', () => ({
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 100, y: 100 })),
  },
}));

describe('PetIdleTicker', () => {
  let sm: PetStateMachine;
  let ticker: PetIdleTicker;

  beforeEach(() => {
    vi.useFakeTimers();
    sm = new PetStateMachine();
    ticker = new PetIdleTicker(sm);
  });

  afterEach(() => {
    ticker.stop();
    sm.dispose();
    vi.useRealTimers();
  });

  it('does not trigger idle behaviors before 20s', async () => {
    ticker.start();
    await vi.advanceTimersByTimeAsync(19000);
    expect(sm.getCurrentState()).toBe('idle');
  });

  it('triggers random-look or random-read after 20s idle', async () => {
    ticker.start();
    await vi.advanceTimersByTimeAsync(21000);
    const state = sm.getCurrentState();
    expect(['random-look', 'random-read']).toContain(state);
  });

  it('triggers yawning after 60s idle', async () => {
    ticker.start();
    await vi.advanceTimersByTimeAsync(61000);
    expect(sm.getCurrentState()).toBe('yawning');
  });

  it('wakes on cursor movement during sleep states', async () => {
    ticker.start();
    // Get to dozing (60s + yawning auto-return 3.5s)
    await vi.advanceTimersByTimeAsync(65000);
    expect(['dozing', 'yawning']).toContain(sm.getCurrentState());

    // Move cursor
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({ x: 200, y: 200 });
    await vi.advanceTimersByTimeAsync(100);
    expect(sm.getCurrentState()).toBe('waking');
  });

  it('does not trigger idle during AI-driven states', async () => {
    sm.requestState('working');
    ticker.start();
    await vi.advanceTimersByTimeAsync(25000);
    expect(sm.getCurrentState()).toBe('working');
  });

  it('resetIdle prevents yawning', async () => {
    ticker.start();
    await vi.advanceTimersByTimeAsync(55000);
    ticker.resetIdle();
    await vi.advanceTimersByTimeAsync(10000); // 55+10=65 total but reset at 55
    expect(sm.getCurrentState()).toBe('idle');
  });

  it('setPetBounds updates bounds used by eye tracking', async () => {
    const eyeData: { eyeDx: number; eyeDy: number }[] = [];
    ticker.onEyeMove((data) => eyeData.push(data));
    // Place pet at (500, 500) with 200x200 size
    ticker.setPetBounds(500, 500, 200, 200);
    ticker.start();

    // Move cursor far to the right of the pet center (600, 580)
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({ x: 900, y: 580 });
    await vi.advanceTimersByTimeAsync(100);

    expect(eyeData.length).toBeGreaterThan(0);
    // Cursor is to the right, so eyeDx should be positive
    expect(eyeData[0].eyeDx).toBeGreaterThan(0);
  });

  it('onEyeMove callback fires with eye tracking data in idle state', async () => {
    const eyeData: { eyeDx: number; eyeDy: number; bodyDx: number; bodyRotate: number }[] = [];
    ticker.onEyeMove((data) => eyeData.push(data));
    ticker.setPetBounds(0, 0, 280, 280);
    ticker.start();

    // Move cursor to the right of pet center (140, 112)
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({ x: 400, y: 112 });
    await vi.advanceTimersByTimeAsync(100);

    expect(eyeData.length).toBeGreaterThan(0);
    const d = eyeData[0];
    expect(d.eyeDx).toBeGreaterThan(0);
    expect(d.bodyDx).toBeCloseTo(d.eyeDx * 0.35, 5);
    expect(d.bodyRotate).toBeCloseTo(d.eyeDx * 0.6, 5);
  });

  it('does not fire eye tracking when not in idle state', async () => {
    const eyeData: unknown[] = [];
    ticker.onEyeMove((data) => eyeData.push(data));
    sm.requestState('working');
    ticker.start();

    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({ x: 400, y: 400 });
    await vi.advanceTimersByTimeAsync(100);

    // Eye tracking only fires during 'idle' state
    expect(eyeData.length).toBe(0);
  });

  it('does not fire eye callback when cursor is at pet center (dist <= 1)', async () => {
    const eyeData: unknown[] = [];
    ticker.onEyeMove((data) => eyeData.push(data));
    // Pet center will be (140, 112) with default bounds (0,0,280,280)
    ticker.setPetBounds(0, 0, 280, 280);
    ticker.start();

    // Place cursor exactly at pet center — dist ~0, eyeDx/eyeDy remain 0 (same as initial)
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({ x: 140, y: 112 });
    await vi.advanceTimersByTimeAsync(100);

    // Since initial lastEyeDx/lastEyeDy are 0 and computed values are also 0, no callback
    expect(eyeData.length).toBe(0);
  });

  it('does not duplicate interval when start() is called twice', async () => {
    ticker.start();
    ticker.start(); // should be a no-op

    await vi.advanceTimersByTimeAsync(21000);
    const state = sm.getCurrentState();
    // Should still work normally — only one interval running
    expect(['random-look', 'random-read']).toContain(state);
  });

  it('stop() is safe to call when no interval exists', () => {
    // No start() called — stop should not throw
    expect(() => ticker.stop()).not.toThrow();
  });

  it('stop() can be called multiple times safely', () => {
    ticker.start();
    ticker.stop();
    expect(() => ticker.stop()).not.toThrow();
  });

  it('transitions from dozing to sleeping after 10min idle', async () => {
    ticker.start();

    // Reach yawning at 60s
    await vi.advanceTimersByTimeAsync(61000);
    expect(sm.getCurrentState()).toBe('yawning');

    // Yawning auto-returns to dozing after 3.5s
    await vi.advanceTimersByTimeAsync(4000);
    expect(sm.getCurrentState()).toBe('dozing');

    // Advance to 10min total idle (600_000ms from start)
    // We've already advanced 65000ms, need ~535000 more
    await vi.advanceTimersByTimeAsync(540000);
    expect(sm.getCurrentState()).toBe('sleeping');
  });

  it('tick() catches errors from getCursorScreenPoint without crashing', async () => {
    ticker.start();

    // Make getCursorScreenPoint throw
    vi.mocked(screen.getCursorScreenPoint).mockImplementation(() => {
      throw new Error('Screen access denied');
    });

    // Should not throw — the catch block swallows the error
    await vi.advanceTimersByTimeAsync(200);

    // Restore normal behavior
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({ x: 100, y: 100 });
    await vi.advanceTimersByTimeAsync(100);

    // Ticker still works after error recovery
    expect(sm.getCurrentState()).toBe('idle');
  });

  it('eye tracking fires callback only when values change', async () => {
    const eyeData: { eyeDx: number; eyeDy: number }[] = [];
    ticker.onEyeMove((data) => eyeData.push(data));
    ticker.setPetBounds(0, 0, 280, 280);
    ticker.start();

    // Move cursor to a position — should fire
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({ x: 300, y: 112 });
    await vi.advanceTimersByTimeAsync(100);
    const count1 = eyeData.length;
    expect(count1).toBeGreaterThan(0);

    // Keep cursor at same position (no movement) — should NOT fire again
    // since eyeDx/eyeDy haven't changed
    await vi.advanceTimersByTimeAsync(200);
    expect(eyeData.length).toBe(count1);
  });

  it('eye tracking computes negative eyeDx when cursor is left of pet', async () => {
    const eyeData: { eyeDx: number; eyeDy: number }[] = [];
    ticker.onEyeMove((data) => eyeData.push(data));
    ticker.setPetBounds(400, 400, 280, 280);
    // Pet center X = 400 + 140 = 540
    ticker.start();

    // Cursor far to the left
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({ x: 200, y: 512 });
    await vi.advanceTimersByTimeAsync(100);

    expect(eyeData.length).toBeGreaterThan(0);
    expect(eyeData[0].eyeDx).toBeLessThan(0);
  });
});
