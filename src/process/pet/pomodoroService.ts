/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { Notification } from 'electron';
import i18n from '@process/services/i18n';
import { ProcessConfig } from '@process/utils/initStorage';
import type { PetStateMachine } from './petStateMachine';
import type { PetIdleTicker } from './petIdleTicker';
import type { PetState } from './petTypes';

export type PomodoroPhase = 'idle' | 'focus' | 'break' | 'paused';

export type PomodoroTick = {
  phase: PomodoroPhase;
  remainingMs: number;
  totalMs: number;
  /** Translated label for the current phase (e.g. "Focusing"). */
  label: string;
  /** Translated sub-label with remaining time (e.g. "25:00 left"). */
  sub: string;
};

export type PomodoroDonePayload = {
  phase: 'focus' | 'break';
  title: string;
  body: string;
  /** Translated label for "start break" button (shown after focus done). */
  restLabel: string;
  /** Translated label for "start focus" / "again" button. */
  againLabel: string;
};

// Dev quick-test: set POMODORO_TEST_SECONDS to use seconds instead of minutes.
// e.g. POMODORO_TEST_SECONDS=30 → focus=30s, break=10s
const TEST_SEC = Number(process.env.POMODORO_TEST_SECONDS);
const DEFAULT_FOCUS_MS = Number.isFinite(TEST_SEC) && TEST_SEC > 0 ? TEST_SEC * 1000 : 25 * 60_000;
const DEFAULT_BREAK_MS =
  Number.isFinite(TEST_SEC) && TEST_SEC > 0 ? Math.max(5, Math.floor(TEST_SEC / 3)) * 1000 : 5 * 60_000;
const TICK_INTERVAL_MS = 1000;

// AI states that count as "busy" — defer phase-done notification until idle.
const BUSY_STATES: ReadonlySet<PetState> = new Set<PetState>([
  'working',
  'thinking',
  'error',
  'notification',
  'dragging',
  'juggling',
  'building',
  'carrying',
]);

export class PomodoroService {
  private phase: PomodoroPhase = 'idle';
  private focusDurationMs = DEFAULT_FOCUS_MS;
  private breakDurationMs = DEFAULT_BREAK_MS;
  private remainingMs = 0;
  private totalMs = 0;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private pendingPhaseDone: 'focus' | 'break' | null = null;
  private stateListener: ((state: PetState) => void) | null = null;

  constructor(
    private readonly petWindow: BrowserWindow,
    private readonly stateMachine: PetStateMachine,
    private readonly idleTicker: PetIdleTicker
  ) {}

  async init(): Promise<void> {
    const [focusDuration, breakDuration] = await Promise.all([
      ProcessConfig.get('pet.pomodoroFocusDuration').catch((): null => null),
      ProcessConfig.get('pet.pomodoroBreakDuration').catch((): null => null),
    ]);
    if (typeof focusDuration === 'number') this.focusDurationMs = focusDuration;
    if (typeof breakDuration === 'number') this.breakDurationMs = breakDuration;

    // Listen for AI going idle to fire deferred notifications, and to re-apply
    // the focus (tomato hat) state after an AI event finishes during focus phase.
    this.stateListener = (state: PetState) => {
      if (this.pendingPhaseDone && !BUSY_STATES.has(state)) {
        const done = this.pendingPhaseDone;
        this.pendingPhaseDone = null;
        this.onPhaseDone(done);
      }
      // Restore focus hat when pet returns to idle during the focus phase.
      if (this.phase === 'focus' && state === 'idle') {
        this.stateMachine.requestState('focus');
      }
    };
    this.stateMachine.onStateChange(this.stateListener);
  }

  getPhase(): PomodoroPhase {
    return this.phase;
  }

  isActive(): boolean {
    return this.phase !== 'idle';
  }

  startFocus(overrideMs?: number): void {
    this.stopTicker();
    this.phase = 'focus';
    const duration = overrideMs ?? this.focusDurationMs;
    this.totalMs = duration;
    this.remainingMs = duration;
    this.pendingPhaseDone = null;
    this.startTicker();
    this.sendTick();
    // Put on the tomato hat unless the pet is busy with AI work.
    const current = this.stateMachine.getCurrentState();
    if (!BUSY_STATES.has(current)) {
      this.stateMachine.requestState('focus');
    }
  }

  startBreak(): void {
    this.stopTicker();
    this.phase = 'break';
    this.totalMs = this.breakDurationMs;
    this.remainingMs = this.breakDurationMs;
    this.pendingPhaseDone = null;
    this.startTicker();
    this.sendTick();
  }

  pause(): void {
    if (this.phase !== 'focus' && this.phase !== 'break') return;
    this.stopTicker();
    this.phase = 'paused';
    this.sendTick();
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = this.totalMs === this.focusDurationMs ? 'focus' : 'break';
    this.startTicker();
    this.sendTick();
  }

  stop(): void {
    this.stopTicker();
    this.phase = 'idle';
    this.remainingMs = 0;
    this.totalMs = 0;
    this.pendingPhaseDone = null;
    this.sendTick();
    // Take off the tomato hat.
    if (this.stateMachine.getCurrentState() === 'focus') {
      this.stateMachine.requestState('idle');
    }
  }

  setFocusDuration(ms: number): void {
    this.focusDurationMs = ms;
    ProcessConfig.set('pet.pomodoroFocusDuration', ms).catch(() => {});
  }

  setBreakDuration(ms: number): void {
    this.breakDurationMs = ms;
    ProcessConfig.set('pet.pomodoroBreakDuration', ms).catch(() => {});
  }

  dispose(): void {
    this.stopTicker();
    if (this.stateListener) {
      this.stateMachine.offStateChange(this.stateListener);
      this.stateListener = null;
    }
  }

  private startTicker(): void {
    this.ticker = setInterval(() => {
      this.remainingMs = Math.max(0, this.remainingMs - TICK_INTERVAL_MS);
      if (this.remainingMs <= 0) {
        const donePhase = this.phase as 'focus' | 'break';
        this.stopTicker();
        // Mark idle BEFORE sending the final tick so the renderer hides the capsule
        // immediately when it hits 0 — avoids the "00:00 capsule stuck" bug.
        this.phase = 'idle';
        this.remainingMs = 0;
        this.totalMs = 0;
        this.sendTick();
        this.handlePhaseDoneOrDefer(donePhase);
      } else {
        this.sendTick();
      }
    }, TICK_INTERVAL_MS);
  }

  private stopTicker(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  private sendTick(): void {
    if (this.petWindow.isDestroyed()) return;
    const labelKey =
      this.phase === 'break'
        ? 'pet.pomodoroBreaking'
        : this.phase === 'paused'
          ? 'pet.pomodoroPaused'
          : 'pet.pomodoroFocusing';
    const tick: PomodoroTick = {
      phase: this.phase,
      remainingMs: this.remainingMs,
      totalMs: this.totalMs,
      label: i18n.t(labelKey),
      sub: i18n.t('pet.pomodoroRemaining', { time: formatMs(this.remainingMs) }),
    };
    this.petWindow.webContents.send('pet:pomodoro-tick', tick);
  }

  private handlePhaseDoneOrDefer(donePhase: 'focus' | 'break'): void {
    const current = this.stateMachine.getCurrentState();
    if (BUSY_STATES.has(current)) {
      // Defer until AI is idle.
      this.pendingPhaseDone = donePhase;
    } else {
      this.onPhaseDone(donePhase);
    }
  }

  private onPhaseDone(donePhase: 'focus' | 'break'): void {
    this.idleTicker.resetIdle();
    this.stateMachine.requestState('happy');

    const title = donePhase === 'focus' ? i18n.t('pet.pomodoroFocusDone') : i18n.t('pet.pomodoroBreakDone');
    const body = donePhase === 'focus' ? i18n.t('pet.pomodoroFocusDoneBody') : i18n.t('pet.pomodoroBreakDoneBody');
    const actionLabel = donePhase === 'focus' ? i18n.t('pet.pomodoroToastRest') : i18n.t('pet.pomodoroToastStartFocus');
    const againLabel = donePhase === 'focus' ? i18n.t('pet.pomodoroToastAgain') : undefined;

    if (Notification.isSupported()) {
      const actions: Electron.NotificationAction[] = [{ type: 'button', text: actionLabel }];
      if (againLabel) actions.push({ type: 'button', text: againLabel });

      const notif = new Notification({ title, body, actions, closeButtonText: i18n.t('pet.pomodoroToastDismiss') });

      notif.on('action', (_e, index) => {
        if (donePhase === 'focus') {
          if (index === 0) this.startBreak();
          else this.startFocus();
        } else {
          this.startFocus();
        }
      });

      notif.show();
    }
  }
}

function formatMs(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
