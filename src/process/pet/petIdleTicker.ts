import { screen } from 'electron';
import type { PetStateMachine } from './petStateMachine';
import type { EyeMoveData } from './petTypes';

const TICK_INTERVAL = 50;
const RANDOM_IDLE_TIMEOUT = 20_000;
const YAWN_TIMEOUT = 60_000;
const DEEP_SLEEP_TIMEOUT = 600_000;

const AI_DRIVEN_STATES = new Set([
  'working',
  'thinking',
  'error',
  'notification',
  'happy',
  'sweeping',
  'building',
  'juggling',
  'carrying',
  'waking',
  'attention',
  'dragging',
]);

const SLEEP_STATES = new Set(['sleeping', 'dozing', 'yawning']);

export class PetIdleTicker {
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastCursorX = 0;
  private lastCursorY = 0;
  private mouseStillSince = Date.now();
  private randomIdlePlayed = false;
  private yawnTriggered = false;
  private eyeMoveCallback: ((data: EyeMoveData) => void) | null = null;
  private petBounds = { x: 0, y: 0, width: 280, height: 280 };
  private lastEyeDx = 0;
  private lastEyeDy = 0;

  constructor(private sm: PetStateMachine) {}

  start(): void {
    if (this.interval) return;
    const cursor = screen.getCursorScreenPoint();
    this.lastCursorX = cursor.x;
    this.lastCursorY = cursor.y;
    this.mouseStillSince = Date.now();
    this.interval = setInterval(() => this.tick(), TICK_INTERVAL);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  resetIdle(): void {
    this.mouseStillSince = Date.now();
    this.randomIdlePlayed = false;
    this.yawnTriggered = false;
  }

  setPetBounds(x: number, y: number, width: number, height: number): void {
    this.petBounds = { x, y, width, height };
  }

  onEyeMove(cb: (data: EyeMoveData) => void): void {
    this.eyeMoveCallback = cb;
  }

  private tick(): void {
    try {
      const cursor = screen.getCursorScreenPoint();
      const moved = cursor.x !== this.lastCursorX || cursor.y !== this.lastCursorY;

      if (moved) {
        this.lastCursorX = cursor.x;
        this.lastCursorY = cursor.y;
        this.mouseStillSince = Date.now();
        this.randomIdlePlayed = false;
        this.yawnTriggered = false;

        if (SLEEP_STATES.has(this.sm.getCurrentState())) {
          this.sm.requestState('waking');
        }
      }

      const currentState = this.sm.getCurrentState();

      // Eye tracking in idle state
      if (currentState === 'idle' && this.eyeMoveCallback) {
        this.computeEyeTracking(cursor.x, cursor.y);
      }

      // Skip idle behavior during AI-driven states
      if (AI_DRIVEN_STATES.has(currentState)) return;

      const idleMs = Date.now() - this.mouseStillSince;

      // 20s -> random idle animation
      if (idleMs >= RANDOM_IDLE_TIMEOUT && !this.randomIdlePlayed && currentState === 'idle') {
        this.randomIdlePlayed = true;
        const pick = Math.random() < 0.5 ? 'random-look' : ('random-read' as const);
        this.sm.requestState(pick);
      }

      // 60s -> yawning
      if (idleMs >= YAWN_TIMEOUT && !this.yawnTriggered) {
        this.yawnTriggered = true;
        this.sm.requestState('yawning');
      }

      // 10min -> deep sleep
      if (idleMs >= DEEP_SLEEP_TIMEOUT && currentState === 'dozing') {
        this.sm.requestState('sleeping');
      }
    } catch {
      // Never crash the tick loop
    }
  }

  private computeEyeTracking(cursorX: number, cursorY: number): void {
    const centerX = this.petBounds.x + this.petBounds.width * 0.5;
    const centerY = this.petBounds.y + this.petBounds.height * 0.4;

    const relX = cursorX - centerX;
    const relY = cursorY - centerY;
    const dist = Math.sqrt(relX * relX + relY * relY);

    // Values are in SVG viewBox units (viewBox is 58 units wide, window is
    // 280px, so 1 SVG unit ≈ 4.8 rendered pixels). MAX_X=3 already renders
    // as ~14px of pupil travel — plenty visible.
    //
    // MAX_UP is smaller than MAX_X on purpose: the pupil sits high on the
    // face, so a full 3-unit upward shift makes it brush the hat and feel
    // like the eye is "popping out". 2 units keeps it safely inside the
    // head silhouette. MAX_DOWN stays 1 — looking down too far would slide
    // into the mouth.
    const MAX_X = 3;
    const MAX_UP = 1.3;
    const MAX_DOWN = 1;
    const RANGE = 300;

    let eyeDx = 0;
    let eyeDy = 0;
    if (dist > 1) {
      const s = Math.min(1, dist / RANGE);
      eyeDx = Math.round((relX / dist) * MAX_X * s * 2) / 2;
      const rawDy = (relY / dist) * MAX_UP * s;
      eyeDy = Math.round(Math.min(MAX_DOWN, Math.max(-MAX_UP, rawDy)) * 2) / 2;
    }

    if (eyeDx !== this.lastEyeDx || eyeDy !== this.lastEyeDy) {
      this.lastEyeDx = eyeDx;
      this.lastEyeDy = eyeDy;
      this.eyeMoveCallback!({
        eyeDx,
        eyeDy,
        bodyDx: eyeDx * 0.35,
        bodyRotate: eyeDx * 0.6,
      });
    }
  }
}
