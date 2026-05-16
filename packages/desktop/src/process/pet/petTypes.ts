export const PET_STATES = [
  'idle',
  'thinking',
  'working',
  'done',
  'happy',
  'error',
  'dragging',
  'attention',
  'poke-left',
  'poke-right',
  'notification',
  'random-look',
  'random-read',
  'yawning',
  'dozing',
  'sleeping',
  'waking',
  'sweeping',
  'juggling',
  'building',
  'carrying',
] as const;

export type PetState = (typeof PET_STATES)[number];

export type StateChangeCallback = (state: PetState, prev: PetState) => void;

export type PetSize = 200 | 280 | 360;

export type HitBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EyeMoveData = {
  eyeDx: number;
  eyeDy: number;
  bodyDx: number;
  bodyRotate: number;
};

export const STATE_PRIORITY: Record<PetState, number> = {
  dragging: 10,
  error: 8,
  notification: 7,
  sweeping: 6,
  done: 5,
  happy: 5,
  attention: 5,
  carrying: 4,
  juggling: 4,
  building: 4,
  working: 3,
  thinking: 2,
  waking: 2,
  'poke-left': 2,
  'poke-right': 2,
  idle: 1,
  'random-look': 1,
  'random-read': 1,
  yawning: 0,
  dozing: 0,
  sleeping: 0,
};

export const MIN_DISPLAY_MS: Partial<Record<PetState, number>> = {
  done: 3500,
  happy: 3000,
  error: 5000,
  attention: 3000,
  notification: 2500,
  'poke-left': 2500,
  'poke-right': 2500,
  waking: 1500,
  sweeping: 5000,
  building: 4000,
  juggling: 4000,
  carrying: 3000,
  'random-look': 4000,
  'random-read': 6000,
  yawning: 3000,
  thinking: 1000,
  working: 1000,
};

export type AutoReturnConfig = {
  target: PetState;
  delayMs: number;
};

export const AUTO_RETURN: Partial<Record<PetState, AutoReturnConfig>> = {
  done: { target: 'idle', delayMs: 4000 },
  happy: { target: 'idle', delayMs: 4000 },
  error: { target: 'idle', delayMs: 5000 },
  attention: { target: 'idle', delayMs: 3000 },
  notification: { target: 'idle', delayMs: 3500 },
  'poke-left': { target: 'idle', delayMs: 2500 },
  'poke-right': { target: 'idle', delayMs: 2500 },
  waking: { target: 'idle', delayMs: 1500 },
  sweeping: { target: 'idle', delayMs: 5500 },
  building: { target: 'idle', delayMs: 5000 },
  juggling: { target: 'idle', delayMs: 5000 },
  carrying: { target: 'idle', delayMs: 4000 },
  'random-look': { target: 'idle', delayMs: 6000 },
  'random-read': { target: 'idle', delayMs: 8000 },
  yawning: { target: 'dozing', delayMs: 3500 },
};
