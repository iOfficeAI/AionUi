/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────

const { mockSend, mockIsDestroyed, mockNotificationShow, mockNotificationOn, mockNotificationIsSupported } = vi.hoisted(
  () => ({
    mockSend: vi.fn(),
    mockIsDestroyed: vi.fn(() => false),
    mockNotificationShow: vi.fn(),
    mockNotificationOn: vi.fn(),
    mockNotificationIsSupported: vi.fn(() => true),
  })
);

vi.mock('electron', () => {
  function MockNotification() {
    return { show: mockNotificationShow, on: mockNotificationOn };
  }
  MockNotification.isSupported = mockNotificationIsSupported;
  return { Notification: MockNotification };
});

vi.mock('@process/services/i18n', () => ({
  default: { t: (key: string) => key },
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────

type StateListener = (state: string) => void;

function makeMocks() {
  const listeners: StateListener[] = [];
  const stateMachine = {
    getCurrentState: vi.fn(() => 'idle' as string),
    requestState: vi.fn(),
    onStateChange: vi.fn((cb: StateListener) => listeners.push(cb)),
    offStateChange: vi.fn((cb: StateListener) => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    }),
  };
  const idleTicker = { resetIdle: vi.fn() };
  const petWindow = {
    isDestroyed: mockIsDestroyed,
    webContents: { send: mockSend },
    setIgnoreMouseEvents: vi.fn(),
  };
  const emit = (state: string) => listeners.forEach((l) => l(state));
  return { stateMachine, idleTicker, petWindow, emit };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('PomodoroService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockIsDestroyed.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in idle phase', async () => {
    const { PomodoroService } = await import('@process/pet/pomodoroService');
    const { stateMachine, idleTicker, petWindow } = makeMocks();
    const svc = new PomodoroService(petWindow as never, stateMachine as never, idleTicker as never);
    expect(svc.getPhase()).toBe('idle');
    expect(svc.isActive()).toBe(false);
  });

  it('startFocus sets phase to focus and requests focus state', async () => {
    const { PomodoroService } = await import('@process/pet/pomodoroService');
    const { stateMachine, idleTicker, petWindow } = makeMocks();
    const svc = new PomodoroService(petWindow as never, stateMachine as never, idleTicker as never);
    svc.startFocus(5000);
    expect(svc.getPhase()).toBe('focus');
    expect(svc.isActive()).toBe(true);
    expect(stateMachine.requestState).toHaveBeenCalledWith('focus');
    expect(mockSend).toHaveBeenCalledWith('pet:pomodoro-tick', expect.objectContaining({ phase: 'focus' }));
  });

  it('startFocus does not request focus state when AI is busy', async () => {
    const { PomodoroService } = await import('@process/pet/pomodoroService');
    const { stateMachine, idleTicker, petWindow } = makeMocks();
    stateMachine.getCurrentState.mockReturnValue('working');
    const svc = new PomodoroService(petWindow as never, stateMachine as never, idleTicker as never);
    svc.startFocus(5000);
    expect(stateMachine.requestState).not.toHaveBeenCalled();
  });

  it('pause stops ticker and sets phase to paused', async () => {
    const { PomodoroService } = await import('@process/pet/pomodoroService');
    const { stateMachine, idleTicker, petWindow } = makeMocks();
    const svc = new PomodoroService(petWindow as never, stateMachine as never, idleTicker as never);
    svc.startFocus(5000);
    svc.pause();
    expect(svc.getPhase()).toBe('paused');
    expect(mockSend).toHaveBeenLastCalledWith('pet:pomodoro-tick', expect.objectContaining({ phase: 'paused' }));
  });

  it('pause does nothing when already idle', async () => {
    const { PomodoroService } = await import('@process/pet/pomodoroService');
    const { stateMachine, idleTicker, petWindow } = makeMocks();
    const svc = new PomodoroService(petWindow as never, stateMachine as never, idleTicker as never);
    mockSend.mockClear();
    svc.pause();
    expect(svc.getPhase()).toBe('idle');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('resume from paused restores focus phase', async () => {
    const { PomodoroService } = await import('@process/pet/pomodoroService');
    const { stateMachine, idleTicker, petWindow } = makeMocks();
    const svc = new PomodoroService(petWindow as never, stateMachine as never, idleTicker as never);
    // Use default focus duration so resume() detects it as a focus session
    svc.startFocus();
    svc.pause();
    svc.resume();
    expect(svc.getPhase()).toBe('focus');
  });

  it('resume from paused restores break phase', async () => {
    const { PomodoroService } = await import('@process/pet/pomodoroService');
    const { stateMachine, idleTicker, petWindow } = makeMocks();
    const svc = new PomodoroService(petWindow as never, stateMachine as never, idleTicker as never);
    svc.startBreak();
    svc.pause();
    svc.resume();
    expect(svc.getPhase()).toBe('break');
  });

  it('stop returns to idle and takes off tomato hat', async () => {
    const { PomodoroService } = await import('@process/pet/pomodoroService');
    const { stateMachine, idleTicker, petWindow } = makeMocks();
    stateMachine.getCurrentState.mockReturnValue('focus');
    const svc = new PomodoroService(petWindow as never, stateMachine as never, idleTicker as never);
    svc.startFocus(5000);
    svc.stop();
    expect(svc.getPhase()).toBe('idle');
    expect(svc.isActive()).toBe(false);
    expect(stateMachine.requestState).toHaveBeenLastCalledWith('idle');
  });

  it('timer reaches zero: fires notification and sets phase idle', async () => {
    const { PomodoroService } = await import('@process/pet/pomodoroService');
    const { stateMachine, idleTicker, petWindow } = makeMocks();
    const svc = new PomodoroService(petWindow as never, stateMachine as never, idleTicker as never);
    svc.startFocus(2000);
    vi.advanceTimersByTime(2000);
    expect(svc.getPhase()).toBe('idle');
    expect(idleTicker.resetIdle).toHaveBeenCalled();
    expect(stateMachine.requestState).toHaveBeenCalledWith('happy');
    expect(mockNotificationShow).toHaveBeenCalled();
  });

  it('timer defers notification when AI is busy, fires on idle', async () => {
    const { PomodoroService } = await import('@process/pet/pomodoroService');
    const { stateMachine, idleTicker, petWindow, emit } = makeMocks();
    await (async () => {
      const svc = new PomodoroService(petWindow as never, stateMachine as never, idleTicker as never);
      await svc.init();
      stateMachine.getCurrentState.mockReturnValue('working');
      svc.startFocus(1000);
      vi.advanceTimersByTime(1000);
      // Notification not fired yet — AI is busy
      expect(mockNotificationShow).not.toHaveBeenCalled();
      // AI finishes
      stateMachine.getCurrentState.mockReturnValue('idle');
      emit('idle');
      expect(mockNotificationShow).toHaveBeenCalled();
    })();
  });

  it('startBreak sets phase to break', async () => {
    const { PomodoroService } = await import('@process/pet/pomodoroService');
    const { stateMachine, idleTicker, petWindow } = makeMocks();
    const svc = new PomodoroService(petWindow as never, stateMachine as never, idleTicker as never);
    svc.startBreak();
    expect(svc.getPhase()).toBe('break');
    expect(mockSend).toHaveBeenCalledWith('pet:pomodoro-tick', expect.objectContaining({ phase: 'break' }));
  });

  it('dispose cleans up listener and ticker', async () => {
    const { PomodoroService } = await import('@process/pet/pomodoroService');
    const { stateMachine, idleTicker, petWindow } = makeMocks();
    const svc = new PomodoroService(petWindow as never, stateMachine as never, idleTicker as never);
    await svc.init();
    svc.startFocus(60_000);
    svc.dispose();
    expect(stateMachine.offStateChange).toHaveBeenCalled();
    // Ticker stopped: no more ticks after dispose
    const countBefore = mockSend.mock.calls.length;
    vi.advanceTimersByTime(3000);
    expect(mockSend.mock.calls.length).toBe(countBefore);
  });

  it('sendTick is a no-op when window is destroyed', async () => {
    const { PomodoroService } = await import('@process/pet/pomodoroService');
    const { stateMachine, idleTicker, petWindow } = makeMocks();
    mockIsDestroyed.mockReturnValue(true);
    const svc = new PomodoroService(petWindow as never, stateMachine as never, idleTicker as never);
    svc.startFocus(5000);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('focus hat restored when AI returns idle during focus phase', async () => {
    const { PomodoroService } = await import('@process/pet/pomodoroService');
    const { stateMachine, idleTicker, petWindow, emit } = makeMocks();
    const svc = new PomodoroService(petWindow as never, stateMachine as never, idleTicker as never);
    await svc.init();
    svc.startFocus(60_000);
    stateMachine.requestState.mockClear();
    emit('idle');
    expect(stateMachine.requestState).toHaveBeenCalledWith('focus');
  });
});
