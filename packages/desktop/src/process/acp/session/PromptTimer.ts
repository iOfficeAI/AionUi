// src/process/acp/session/PromptTimer.ts

export type TimerState = 'idle' | 'running' | 'paused';

export class PromptTimer {
  private _state: TimerState = 'idle';
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private remaining: number;
  private startedAt = 0;

  constructor(
    private readonly timeoutMs: number,
    private readonly onTimeout: () => void
  ) {
    this.remaining = timeoutMs;
  }

  get state(): TimerState {
    return this._state;
  }

  start(): void {
    this.clearTimer();
    this.remaining = this.timeoutMs;
    this.startedAt = Date.now();
    this.timerId = setTimeout(() => this.fire(), this.remaining);
    this._state = 'running';
  }

  reset(): void {
    if (this._state !== 'running') return;
    this.clearTimer();
    this.remaining = this.timeoutMs;
    this.startedAt = Date.now();
    this.timerId = setTimeout(() => this.fire(), this.remaining);
  }

  pause(): void {
    if (this._state !== 'running') return;
    this.clearTimer();
    this.remaining -= Date.now() - this.startedAt;
    if (this.remaining < 0) this.remaining = 0;
    this._state = 'paused';
  }

  resume(): void {
    if (this._state !== 'paused') return;
    this.startedAt = Date.now();
    this.timerId = setTimeout(() => this.fire(), this.remaining);
    this._state = 'running';
  }

  stop(): void {
    this.clearTimer();
    this.remaining = this.timeoutMs;
    this._state = 'idle';
  }

  private fire(): void {
    this._state = 'idle';
    this.timerId = null;
    this.onTimeout();
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}
