import type { PetState, StateChangeCallback } from './petTypes';
import { STATE_PRIORITY, MIN_DISPLAY_MS, AUTO_RETURN } from './petTypes';

export class PetStateMachine {
  private current: PetState = 'idle';
  private changedAt = Date.now();
  private listeners: StateChangeCallback[] = [];
  private autoReturnTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingState: PetState | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private dnd = false;

  getCurrentState(): PetState {
    return this.current;
  }

  setDnd(enabled: boolean): void {
    this.dnd = enabled;
    if (enabled) {
      this.clearPending();
      this.clearAutoReturn();
    }
  }

  getDnd(): boolean {
    return this.dnd;
  }

  requestState(state: PetState): PetState | null {
    if (this.dnd && state !== 'dragging') return null;
    if (state === this.current) return null;

    const newPri = STATE_PRIORITY[state];
    const curPri = STATE_PRIORITY[this.current];

    // Higher priority always wins
    if (newPri > curPri) {
      this.applyState(state);
      return state;
    }

    // Lower priority rejected, except for idle → sleep transitions
    if (newPri < curPri) {
      // Allow idle state to transition into sleep states (yawning/dozing/sleeping)
      const SLEEP_STATES: PetState[] = ['yawning', 'dozing', 'sleeping'];
      const IDLE_STATES: PetState[] = ['idle', 'random-look', 'random-read'];
      if (IDLE_STATES.includes(this.current) && SLEEP_STATES.includes(state)) {
        this.applyState(state);
        return state;
      }
      return null;
    }

    // Equal priority: check min display
    const minMs = MIN_DISPLAY_MS[this.current] ?? 0;
    const elapsed = Date.now() - this.changedAt;
    const remaining = minMs - elapsed;

    if (remaining > 0) {
      // Queue it
      this.clearPending();
      this.pendingState = state;
      this.pendingTimer = setTimeout(() => {
        if (this.pendingState) {
          this.applyState(this.pendingState);
          this.pendingState = null;
          this.pendingTimer = null;
        }
      }, remaining);
      return null;
    }

    this.applyState(state);
    return state;
  }

  forceState(state: PetState): void {
    this.clearPending();
    this.clearAutoReturn();
    this.applyState(state);
  }

  onStateChange(cb: StateChangeCallback): void {
    this.listeners.push(cb);
  }

  offStateChange(cb: StateChangeCallback): void {
    const idx = this.listeners.indexOf(cb);
    if (idx >= 0) this.listeners.splice(idx, 1);
  }

  dispose(): void {
    this.clearPending();
    this.clearAutoReturn();
    this.listeners.length = 0;
  }

  private applyState(state: PetState): void {
    const prev = this.current;
    this.current = state;
    this.changedAt = Date.now();
    this.clearPending();
    this.clearAutoReturn();

    // Set up auto-return if configured
    const ar = AUTO_RETURN[state];
    if (ar) {
      this.autoReturnTimer = setTimeout(() => {
        this.autoReturnTimer = null;
        this.applyState(ar.target);
      }, ar.delayMs);
    }

    for (const cb of this.listeners) {
      try {
        cb(state, prev);
      } catch {
        // Never crash
      }
    }
  }

  private clearPending(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
      this.pendingState = null;
    }
  }

  private clearAutoReturn(): void {
    if (this.autoReturnTimer) {
      clearTimeout(this.autoReturnTimer);
      this.autoReturnTimer = null;
    }
  }
}
